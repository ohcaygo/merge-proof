"use strict";
const { assert } = require("./common");
const {record}=require("./events");

// Stored in the existing single-writer snapshot, together with the receipt.
// Callers must save completion and debit once, without an intervening await.
class Meter {
  constructor(store, options = {}) {
    assert(options && typeof options === "object" && !Array.isArray(options), "INVALID_METER_OPTIONS");
    const invitedTesterAccountIds = options.invitedTesterAccountIds;
    assert(
      invitedTesterAccountIds === undefined ||
        (Array.isArray(invitedTesterAccountIds) &&
          invitedTesterAccountIds.every(
            (id) => Number.isSafeInteger(id) && id > 0,
          ) &&
          new Set(invitedTesterAccountIds).size === invitedTesterAccountIds.length),
      "INVALID_INVITED_TESTER_ACCOUNT_IDS",
    );
    this.store = store;
    // Copy and freeze trusted server configuration so an external config array
    // cannot change an account's offer after this writer starts.
    Object.defineProperty(this, "invitedTesterAccountIds", {
      value: Object.freeze([...(invitedTesterAccountIds || [])]),
      enumerable: false,
      writable: false,
      configurable: false,
    });
    store.data.meter ||= { accounts: {}, installations: {}, proofs: {} };
    this.data = store.data.meter;
  }
  configuredTrialDays(installationId) {
    const account = this.data.installations[installationId];
    const ownerId = Number(account?.account?.match(/^github:(\d+)$/)?.[1]);
    return Number.isSafeInteger(ownerId) && this.invitedTesterAccountIds.includes(ownerId)
      ? 10
      : 7;
  }
  persistedTrialDays(installationId, trial, fallback) {
    if (Number.isSafeInteger(trial?.trialDays) && trial.trialDays > 0)
      return trial.trialDays;
    const elapsed = Number(trial?.endsAt) - Number(trial?.startedAt);
    return Number.isFinite(elapsed) && elapsed > 0
      ? Math.max(1, Math.ceil(elapsed / 86400000))
      : fallback ?? this.configuredTrialDays(installationId);
  }
  connect(installationId, ownerId) {
    assert(Number.isSafeInteger(installationId) && installationId > 0);
    assert(Number.isSafeInteger(ownerId) && ownerId > 0);
    const key = `github:${ownerId}`;
    const prior = this.data.installations[installationId];
    assert(!prior || prior.account === key, "INSTALLATION_IDENTITY_CHANGED");
    this.data.accounts[key] ||= {
      freeUsed: 0,
      scan: null,
      activity: [],
      periods: {},
      topups: {},
      topupUsed: 0,
    };
    this.data.installations[installationId] = { account: key, active: true };
    if(!prior?.active) record(this.store,"app_installed",installationId,{installationId,account:key});
    return key;
  }
  account(installationId) {
    const installation = this.data.installations[installationId];
    assert(installation?.active, "INSTALLATION_INACTIVE");
    return this.data.accounts[installation.account];
  }
  disconnect(installationId) {
    const installation = this.data.installations[installationId];
    if (installation) installation.active = false;
    if(installation) record(this.store,"app_uninstalled",installationId,{installationId,account:installation.account});
  }
  key(installationId, identity) {
    assert(Number.isSafeInteger(installationId) && installationId > 0);
    assert(
      Number.isSafeInteger(identity.repositoryId) && identity.repositoryId > 0,
    );
    assert(Number.isSafeInteger(identity.pr) && identity.pr > 0);
    assert(/^[a-f0-9]{40}$/.test(identity.headSha || ""));
    return JSON.stringify([
      installationId,
      identity.repositoryId,
      identity.pr,
      identity.headSha,
    ]);
  }
  check(installationId, identity) {
    const account = this.account(installationId);
    assert(this.usage(installationId).automationAllowed, "TRIAL_EXPIRED");
    const key = this.key(installationId, identity);
    // Dedup history never resets with an allowance period.
    if (this.data.proofs[key])
      return { key, charged: false, reason: "ALREADY_ACCOUNTED" };
    return { key, charged: true, reason: this.usage(installationId).plan === "PRO" ? "MONTHLY_INCLUDED" : "TRIAL" };
  }

  complete(installationId, receipt, current, collectionComplete) {
    this.account(installationId);
    if (
      !collectionComplete ||
      current.state !== "CURRENT" ||
      !["VERIFIED", "NOT_PROVEN"].includes(receipt.verdict)
    )
      return { charged: false, reason: "NOT_BILLABLE_COMPLETION" };
    const decision = this.check(installationId, receipt.identity);
    const account = this.account(installationId);
    const accountKey = this.data.installations[installationId].account;
    // Same synchronous transaction as the receipt save; no install or failed attempt starts time.
    if (!account.trial && this.usage(installationId).plan !== "PRO") {
      const now = Date.now();
      const trialDays = this.configuredTrialDays(installationId);
      account.trial = { startedAt: now, endsAt: now + trialDays * 86400000, trialDays, receiptId: receipt.receiptId };
      record(this.store, "first_successful_proof", accountKey, { account: accountKey, installationId, receiptId: receipt.receiptId });
      record(this.store, "trial_started", accountKey, { account: accountKey, installationId, startedAt: now, endsAt: account.trial.endsAt });
    }
    if (decision.charged) {
      const account = this.account(installationId);
      if (decision.reason === "MONTHLY_INCLUDED")
        account.periods[account.subscription.periodStart].used++;
      else if (decision.reason === "TOPUP") account.topupUsed++;
      else account.freeUsed++;
      this.data.proofs[decision.key] = {
        receiptId: receipt.receiptId,
        at: receipt.issuedAt,
        account: this.data.installations[installationId].account,
        source: decision.reason,
      };
      record(this.store,"hosted_proof_completed",decision.key,{installationId,receiptId:receipt.receiptId,account:this.data.installations[installationId].account});
    }
    return decision;
  }
  usage(installationId) {
    const a = this.account(installationId);
    const s = a.subscription,
      now = Date.now();
    const active =
      s && s.periodStart <= now && now < s.periodEnd && s.verifiedPaid === true;
    const period = active ? a.periods[s.periodStart] : null;
    const trial = a.trial;
    const trialDays = this.persistedTrialDays(installationId, trial);
    const expired = (!!trial && now >= trial.endsAt) || (!!s && !active);
    if (trial && expired && !active) record(this.store, "trial_expired", this.data.installations[installationId].account, { account: this.data.installations[installationId].account, endsAt: trial.endsAt });
    const plan = active ? "PRO" : expired ? "PAUSED" : trial ? "TRIAL" : "AWAITING_FIRST_PROOF";
    return {
      plan,
      automationAllowed: active || !expired,
      used: active ? period.used : a.freeUsed,
      trialDays,
      trial: trial ? { startedAt: new Date(trial.startedAt).toISOString(), endsAt: new Date(trial.endsAt).toISOString() } : null,
      notice: this.notice(plan, trial || (s ? {endsAt:s.periodEnd} : null), now, trialDays),
      paidDevelopers: active ? period.quantity : 0,
      nextQuantity: a.nextQuantity ?? (active ? period.quantity : null),
      quantityEffectiveAt: a.quantityEffectiveAt
        ? new Date(a.quantityEffectiveAt).toISOString()
        : null,
      activeDevelopers: this.participants(
        a,
        active ? s.periodStart : now - 30 * 86400000,
        now,
      ),
      subscription: s
        ? {
            status: s.status,
            accessEndsAt: new Date(s.periodEnd).toISOString(),
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          }
        : null,
      scan: a.scan
        ? {
            id: a.scan.id,
            state: a.scan.state,
            completed: a.scan.completed,
            total: a.scan.total,
            limit: a.scan.limit,
          }
        : null,
    };
  }
  notice(plan, trial, now = Date.now(), configuredTrialDays = 7) {
    if (plan === "PRO") return "Pro is active.";
    if (plan === "AWAITING_FIRST_PROOF") return `Your ${configuredTrialDays}-day report-only trial starts with the first CURRENT, collection-complete VERIFIED or NOT_PROVEN hosted receipt. No card required.`;
    const end = new Date(trial.endsAt).toISOString();
    if (plan === "PAUSED") return "Hosted access ended — automation paused. New hosted proofs, re-proofs and scans are paused. Existing receipts remain available with current authorization, subject to retention and capacity limits. Continue Pro for $29/month per active developer. If you require Merge Proof in GitHub, subscribe or remove the required Merge Proof check in repository Settings → Rules / Branches; Merge Proof never changes your rules.";
    const day = Math.floor((now - trial.startedAt) / 86400000) + 1;
    const trialDays = this.persistedTrialDays(null, trial, configuredTrialDays);
    return day < Math.max(1, trialDays - 2) ? `Trial active until ${end}.` : `Trial ends ${end}${day >= trialDays ? " — within 24 hours" : ""}. Continue Pro for $29/month per active developer. If Merge Proof is required in GitHub, subscribe or remove the required check before expiry in Settings → Rules / Branches. Existing receipts stay available with current authorization and retention limits; no automatic charge.`;
  }
  activity(installationId, user, kind, evidence, at = Date.now()) {
    const a = this.account(installationId);
    if (
      user?.type !== "User" ||
      !Number.isSafeInteger(user.id) ||
      /\[bot\]$/.test(user.login || "")
    )
      return;
    a.activity ||= [];
    if (
      !a.activity.some(
        (x) =>
          x.userId === user.id && x.evidence === evidence && x.kind === kind,
      )
    )
      a.activity.push({
        userId: user.id,
        login: user.login,
        kind,
        evidence,
        at,
      });
  }
  participants(a, start, end) {
    const users = new Map();
    for (const x of a.activity || [])
      if (
        x.at >= start &&
        x.at <= end &&
        !a.serviceIdentityIds?.includes(x.userId)
      ) {
        if (!users.has(x.userId))
          users.set(x.userId, {
            userId: x.userId,
            login: x.login,
            activity: [],
          });
        users.get(x.userId).activity.push(x);
      }
    return [...users.values()].sort((x, y) => x.userId - y.userId);
  }
  paidPeriod(accountKey, subscription) {
    const a = this.data.accounts[accountKey];
    assert(
      a &&
        subscription.verifiedPaid === true &&
        Number.isSafeInteger(subscription.quantity) &&
        subscription.quantity > 0,
    );
    assert(
      Number.isFinite(subscription.periodStart) &&
        subscription.periodEnd > subscription.periodStart,
    );
    a.periods ||= {};
    a.topups ||= {};
    a.topupUsed ||= 0;
    const prior = a.subscription;
    assert(
      !prior || subscription.periodStart >= prior.periodStart,
      "OLDER_SUBSCRIPTION_PERIOD",
    );
    const newPeriod = !a.periods[subscription.periodStart];
    a.periods[subscription.periodStart] ||= {
      used: 0,
      quantity: subscription.quantity,
    };
    if (newPeriod) {
      a.confirmedQuantity = subscription.quantity;
      a.nextQuantity = subscription.quantity;
      a.quantityEffectiveAt = null;
    }
    // A duplicate invoice cannot reset usage or inflate the allowance.
    a.subscription = {
      ...subscription,
      quantity: a.periods[subscription.periodStart].quantity,
    };
    if(newPeriod) record(this.store,"pro_activated",`${accountKey}:${subscription.periodStart}`,{account:accountKey,quantity:subscription.quantity});
  }
  topup(accountKey, paymentId) {
    const a = this.data.accounts[accountKey];
    assert(a && /^pi_[A-Za-z0-9_]+$/.test(paymentId));
    a.topups ||= {};
    a.topupUsed ||= 0;
    if (a.topups[paymentId]) return false;
    a.topups[paymentId] = { proofs: 5, at: Date.now() };
    record(this.store,"topup_purchased",paymentId,{account:accountKey,proofs:5});
    return true;
  }
}
module.exports = { Meter };
