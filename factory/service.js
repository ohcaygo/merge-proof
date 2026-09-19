"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { hash, random, parseRepo, ensure, FactoryError } = require("./common");
const { integrate } = require("./evidence");
const { generate } = require("./report");
const SOURCE = "dab4c4b896a4ff704603e4945edfce87c43fd4e5";
function requiredChecks(value) {
  ensure(
    Array.isArray(value) && value.length > 0 && value.length <= 20,
    "REQUIRED_CI_SCOPE",
  );
  const out = value.map((r) => {
    ensure(
      typeof r.name === "string" &&
        r.name.length > 0 &&
        r.name.length <= 120 &&
        !/[\x00-\x1f`]/.test(r.name) &&
        Number.isSafeInteger(r.appId) &&
        r.appId > 0,
      "REQUIRED_CI_SCOPE",
    );
    return { name: r.name, appId: r.appId };
  });
  ensure(
    new Set(out.map((r) => JSON.stringify(r))).size === out.length,
    "REQUIRED_CI_SCOPE",
  );
  return out;
}
class Factory {
  constructor({ store, github, runner, stripe, config, reporter = generate }) {
    Object.assign(this, { store, github, runner, stripe, config, reporter });
    this.busy = false;
    this.jobs = new Set();
  }
  auth(token) {
    ensure(
      typeof token === "string" && /^[a-f0-9]{64}$/.test(token),
      "UNAUTHORIZED",
      401,
    );
    const o = Object.values(this.store.data.orders).find(
      (o) => o.tokenHash === hash(token),
    );
    ensure(o && o.expiresAt > Date.now(), "UNAUTHORIZED", 401);
    return o;
  }
  public(o) {
    return {
      id: o.id,
      state: o.state,
      eligibility: o.eligibility,
      repo: o.repo,
      pr: o.pr,
      required: o.required,
      authorized: !!o.authorized,
      scope: o.pendingScope,
      scopeHash: o.scopeHash,
      payment: o.payment
        ? {
            amount: o.payment.amount,
            currency: o.payment.currency,
            mode: o.payment.mode,
          }
        : null,
      runs: o.runs.map((r) => ({
        id: r.id,
        verdict: r.verdict,
        files: r.files,
      })),
      failure: o.failure || null,
      reassessmentAvailable: o.runs.length === 1,
      expiresAt: o.expiresAt,
      exception: o.exception || null,
    };
  }
  async exclusive(fn) {
    ensure(!this.busy, "BUSY_RETRY", 429);
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
  async eligible(input) {
    return this.exclusive(async () => {
      const repo = parseRepo(input.url),
        pr = Number(input.pr),
        required = requiredChecks(input.required);
      ensure(
        Object.values(this.store.data.orders).filter(
          (o) => o.expiresAt > Date.now() && !o.expiredAt,
        ).length < 1000,
        "BUSY_RETRY",
        429,
      );
      let scope;
      try {
        scope = await this.github.scope(repo, pr);
        const local = await this.runner.run(scope, hash(random()));
        ensure(local.verdict !== "FAIL" && local.collectionComplete !== false, "UNSUPPORTED_HISTORY");
      } catch (e) {
        return {
          eligibility: [
            "AUTH_FAILED",
            "NOT_ELIGIBLE",
            "UNSUPPORTED_HISTORY",
          ].includes(e.code)
            ? "NOT_ELIGIBLE"
            : "PARTIAL / NEEDS CUSTOMER ACTION",
          reason: [
            "AUTH_FAILED",
            "NOT_ELIGIBLE",
            "UNSUPPORTED_HISTORY",
            "AMBIGUOUS_SHA",
          ].includes(e.code)
            ? e.code
            : "REQUIRED_GIT_EVIDENCE_UNRESOLVABLE",
        };
      }
      const id = random(),
        token = random();
      const o = {
        id,
        tokenHash: hash(token),
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 86400000,
        eligibility: "ELIGIBLE",
        state: "ELIGIBLE",
        repo: scope.repo,
        repoId: scope.repoId,
        pr,
        required,
        runs: [],
        attempts: [0, 0],
      };
      this.store.data.orders[id] = o;
      this.store.save();
      return { ...this.public(o), token };
    });
  }
  async checkout(o) {
    ensure(o.state === "ELIGIBLE" && !o.payment, "PAYMENT_ALREADY_CONFIRMED");
    const offer = await this.stripe.offer();
    const url = new URL(offer.url);
    url.searchParams.set("client_reference_id", o.id);
    o.checkoutAt = Date.now();
    this.store.save();
    return { url: url.href };
  }
  exception(o, code, state) {
    o.failure = code;
    o.state = state;
    o.exception = {
      state,
      reason: code,
      owner: "Ryan",
      createdAt: new Date().toISOString(),
    };
    this.store.data.exceptions.push({ orderId: o.id, ...o.exception });
    this.store.save();
  }
  async webhook(raw, signature) {
    const event = this.stripe.verify(raw, signature);
    ensure(typeof event.id === "string", "INVALID_PAYMENT");
    if (this.store.data.events.includes(event.id)) return;
    const payment = await this.stripe.confirmed(event);
    // Recheck after network await: duplicate concurrent deliveries are idempotent.
    if (this.store.data.events.includes(event.id)) return;
    if (payment) {
      const previous = Object.values(this.store.data.orders).find(
        (o) =>
          o.payment?.sessionId === payment.sessionId ||
          o.payment?.transactionId === payment.transactionId,
      );
      if (!previous) {
        const o = this.store.data.orders[payment.reference];
        if (!o || !o.checkoutAt) {
          this.store.data.exceptions.push({
            state: "REFUND_REQUIRED",
            reason: "UNBOUND_PAYMENT",
            owner: "Ryan",
            payment,
            createdAt: new Date().toISOString(),
          });
        } else if (o.payment) {
          this.store.data.exceptions.push({
            orderId: o.id,
            state: "REFUND_REQUIRED",
            reason: "DUPLICATE_PURCHASE",
            owner: "Ryan",
            payment,
            createdAt: new Date().toISOString(),
          });
        } else {
          o.payment = payment;
          o.state = "PAID";
          o.expiresAt = Date.now() + 7 * 86400000;
        }
      }
    }
    this.store.data.events.push(event.id);
    this.store.save();
  }
  async authorize(o, input) {
    ensure(o.payment, "PAYMENT_REQUIRED", 402);
    ensure(
      !["RUNNING", "REFUND_REQUIRED", "MANUAL_EXCEPTION"].includes(o.state),
      "INVALID_STATE",
    );
    if (
      parseRepo(input.url).toLowerCase() !== o.repo.toLowerCase() ||
      Number(input.pr) !== o.pr
    ) {
      this.exception(o, "AUTH_FAILED", "RETRY");
      throw new FactoryError("AUTH_FAILED");
    }
    o.authorized = true;
    this.store.save();
    return this.public(o);
  }
  async prepare(o) {
    ensure(o.payment && o.authorized, "AUTH_FAILED", 403);
    ensure(
      !["RUNNING", "REFUND_REQUIRED", "MANUAL_EXCEPTION"].includes(o.state) &&
        o.runs.length < 2,
      "REASSESSMENT_USED",
    );
    return this.exclusive(async () => {
      try {
        const scope = await this.github.scope(o.repo, o.pr);
        ensure(scope.repoId === o.repoId, "AUTH_FAILED");
        o.pendingScope = { ...scope, required: o.required };
        o.scopeHash = hash(JSON.stringify(o.pendingScope));
        o.preparedAt = Date.now();
        o.state = "AWAITING_SCOPE_CONFIRMATION";
        this.store.save();
        return this.public(o);
      } catch (e) {
        const code = [
          "AUTH_FAILED",
          "UNSUPPORTED_HISTORY",
          "AMBIGUOUS_SHA",
        ].includes(e.code)
          ? e.code
          : e.code === "NOT_ELIGIBLE"
            ? "NOT_ELIGIBLE_AFTER_PAYMENT"
            : "RUN_FAILED";
        this.exception(
          o,
          code,
          ["UNSUPPORTED_HISTORY", "NOT_ELIGIBLE_AFTER_PAYMENT"].includes(code)
            ? "REFUND_REQUIRED"
            : "RETRY",
        );
        throw new FactoryError(code);
      }
    });
  }
  start(o, input) {
    ensure(o.payment && o.authorized, "PAYMENT_REQUIRED", 402);
    ensure(o.runs.length < 2, "REASSESSMENT_USED");
    ensure(
      o.state === "AWAITING_SCOPE_CONFIRMATION" &&
        o.scopeHash === input.scopeHash &&
        Date.now() - o.preparedAt < 10 * 60000,
      "CONFIRM_CURRENT_SCOPE",
    );
    ensure(!this.busy, "BUSY_RETRY", 429);
    const slot = o.runs.length;
    ensure(o.attempts[slot] < 3, "RETRY_LIMIT");
    this.busy = true;
    o.state = "RUNNING";
    o.attempts[slot]++;
    o.failure = null;
    const scope = structuredClone(o.pendingScope);
    const runId = hash(
      o.id + ":" + slot + ":" + o.attempts[slot] + ":" + o.scopeHash,
    );
    o.activeRun = runId;
    this.store.save();
    const job = this.execute(o, scope, runId).finally(() => {
      this.busy = false;
      this.jobs.delete(job);
    });
    this.jobs.add(job);
    return { state: "RUNNING", runId };
  }
  async execute(o, scope, runId) {
    const directory = path.join(this.store.root, "artifacts", o.id, runId);
    let phase = "RUN_FAILED";
    try {
      const current = await this.github.scope(o.repo, o.pr);
      ensure(
        ["repoId", "headSha", "baseSha", "ciSha", "shape"].every(
          (k) => current[k] === scope[k],
        ),
        "AMBIGUOUS_SHA",
      );
      const local = await this.runner.run(scope, runId);
      ensure(local.verdict !== "FAIL" && local.collectionComplete !== false, "RUN_FAILED");
      const capture = await this.github.capture(scope);
      const result = integrate(local, capture, scope.required);
      phase = "REPORT_FAILED";
      const prior = o.runs.length
        ? JSON.parse(
            fs.readFileSync(
              path.join(
                this.store.root,
                "artifacts",
                o.id,
                o.runs[0].id,
                "report.json",
              ),
              "utf8",
            ),
          )
        : null;
      const report = await this.reporter({
        directory,
        result,
        capture,
        scope,
        runId,
        orderId: o.id,
        prior,
        actionRef: this.config.sourceCommit || SOURCE,
      });
      o.runs.push({
        id: runId,
        verdict: report.result.verdict,
        files: report.files,
      });
      o.state = "DELIVERED";
      o.activeRun = null;
      o.pendingScope = null;
      o.scopeHash = null;
      this.store.save();
    } catch (e) {
      fs.rmSync(directory, { recursive: true, force: true });
      const code = [
        "AUTH_FAILED",
        "AMBIGUOUS_SHA",
        "UNSUPPORTED_HISTORY",
      ].includes(e.code)
        ? e.code
        : phase;
      this.exception(
        o,
        code,
        o.attempts[o.runs.length] >= 3 ? "REFUND_REQUIRED" : "RETRY",
      );
    }
  }
  escalate(o, state) {
    ensure(o.payment, "PAYMENT_REQUIRED");
    ensure(
      ["RETRY", "REFUND_REQUIRED", "MANUAL_EXCEPTION"].includes(o.state),
      "INVALID_STATE",
    );
    ensure(
      ["REFUND_REQUIRED", "MANUAL_EXCEPTION"].includes(state),
      "INVALID_STATE",
    );
    this.exception(o, o.failure || "RUN_FAILED", state);
    return this.public(o);
  }
  download(o, runId, name) {
    const run = o.runs.find((r) => r.id === runId);
    ensure(run && run.files.includes(name), "NOT_FOUND", 404);
    return path.join(this.store.root, "artifacts", o.id, run.id, name);
  }
  purge() {
    for (const [id, o] of Object.entries(this.store.data.orders)) {
      if (o.expiresAt < Date.now() && o.state !== "RUNNING" && !o.expiredAt) {
        // Expiry may revoke downloads, but cannot erase an undelivered purchase.
        // Reconciliation metadata does not consume active eligibility capacity.
        if (
          o.payment &&
          (!o.runs.length || ["RETRY", "MANUAL_EXCEPTION"].includes(o.state)) &&
          o.state !== "REFUND_REQUIRED"
        ) {
          this.exception(o, o.failure || "DELIVERY_EXPIRED", "REFUND_REQUIRED");
        }
        fs.rmSync(path.join(this.store.root, "artifacts", id), {
          recursive: true,
          force: true,
        });
        if (!o.payment) delete this.store.data.orders[id];
        else {
          o.tokenHash = null;
          o.pendingScope = null;
          o.deliveredCount = o.runs.length;
          o.runs = [];
          o.expiredAt = Date.now();
          if (o.state !== "REFUND_REQUIRED") o.state = "EXPIRED";
        }
      }
    }
    this.store.save();
  }
}
module.exports = { Factory, requiredChecks };
