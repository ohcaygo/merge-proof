"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const {assert, hash, randomUUID, unavailable} = require("./common");
const DISCLOSURE = "GitHub requires Administration Write to read workflow execution protections. The separate companion App uses that grant only for policy reads. The grant remains powerful if its credential is compromised. Standard Merge-Proof stays Administration Read. Missing evidence remains NOT_PROVEN.";
class EnhancedPolicy {
  constructor(service, {broker} = {}) {
    this.service = service; this.config = service.config.enhancedPolicy;
    this.grants = service.data.enhancedPolicy ||= {};
    this.pending = new Map();
    if (!this.config) return;
    assert(Object.keys(this.config).every(k => ["appId", "appSlug", "socketPath", "grantsPath"].includes(k)) &&
      Number.isSafeInteger(this.config.appId) && this.config.appId > 0 && /^[a-z0-9-]+$/.test(this.config.appSlug) && path.isAbsolute(this.config.grantsPath), "ENHANCED_POLICY_CONFIG_INVALID");
    this.broker = broker || require("./policy-broker-client").brokerClient(this.config.socketPath);
    this.export();
  }
  export() {
    if (!this.config) return;
    const target = this.config.grantsPath, temp = `${target}.${randomUUID()}.tmp`;
    const fd = fs.openSync(temp, "wx", 0o640);
    try {fs.writeFileSync(fd, JSON.stringify(this.grants)); fs.fchmodSync(fd, 0o640); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(temp, target);
    const dir = fs.openSync(path.dirname(target), "r"); try {fs.fsyncSync(dir);} finally {fs.closeSync(dir);}
  }
  key(installationId, repositoryId) {return `${installationId}:${repositoryId}`;}
  status(installationId, repositoryId, admin = false) {
    const grant = this.grants[this.key(installationId, repositoryId)];
    return {configured: !!this.config, admin, enabled: grant?.enabled === true,
      state: grant?.status || "OFF", checkedAt: grant?.checkedAt || null,
      reason: grant?.reason || null, disclosure: DISCLOSURE};
  }
  async checkStatus(installationId, repo) {
    if (this.config && this.grants[this.key(installationId, repo.id)]?.enabled) {
      const client = await this.service.appClient(installationId, repo.id);
      await this.reader(installationId, client)({repository: repo.full_name, repositoryId: repo.id});
      this.service.save();
    }
    return this.status(installationId, repo.id, repo.permissions?.admin === true);
  }
  invalidate(grant, reason) {
    const service = this.service;
    service.routeEvent("enhanced_policy", {}, grant.repository, grant.repositoryId);
    for (const row of Object.values(service.data.receipts)) {
      if (row.installationId !== grant.primaryInstallationId || row.receipt.identity.repositoryId !== grant.repositoryId) continue;
      row.current.reason = reason;
      const affected = name => name === "RULES_SNAPSHOT" || name.startsWith("CI_EXECUTED") || name.startsWith("CODE_COVERAGE");
      const details = row.current.claims || {};
      row.current.claims = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, affected(k) ? {...v, state: "UNAVAILABLE"} : v]));
      service.queueRetraction(row);
    }
  }
  change(grant, reason) {
    grant.revision = randomUUID();
    this.grants[this.key(grant.primaryInstallationId, grant.repositoryId)] = grant;
    this.export(); this.invalidate(grant, reason); this.service.save();
  }
  context(session, repo, installation) {
    assert(repo.permissions?.admin === true && Number.isSafeInteger(session.userId) &&
      Number.isSafeInteger(installation.account?.id), "REPOSITORY_ADMIN_REQUIRED");
    return {repository: repo.full_name.toLowerCase(), repositoryId: repo.id,
      primaryInstallationId: installation.id, accountId: installation.account.id};
  }
  async enable(session, repo, installation, consent) {
    assert(this.config, "ENHANCED_POLICY_NOT_CONFIGURED");
    assert(consent === true, "EXPLICIT_POLICY_CONSENT_REQUIRED");
    const scope = this.context(session, repo, installation);
    const grant = {...scope, enabled: false, status: "APPROVAL_PENDING", authorizedByUserId: session.userId,
      authorizedAt: new Date().toISOString()};
    this.change(grant, "ENHANCED_POLICY_CONSENT_CHANGED");
    try {await this.activate(grant);} catch (e) {
      grant.reason = e.code || "COMPANION_INSTALLATION_UNAVAILABLE"; this.service.save();
    }
    if (grant.enabled) return this.status(installation.id, repo.id, true);
    for (const [key, row] of this.pending) if (row.expires < Date.now()) this.pending.delete(key);
    assert(this.pending.size < 1000, "ENROLLMENT_BUSY");
    const state = crypto.randomBytes(32).toString("hex");
    this.pending.set(hash(state), {scope, revision: grant.revision, userId: session.userId, session: hash(session.token), expires: Date.now() + 600000});
    return {...this.status(installation.id, repo.id, true), installUrl: `https://github.com/apps/${this.config.appSlug}/installations/new?state=${state}`};
  }
  async activate(grant) {
    const revision = grant.revision;
    const found = await this.broker("discover", {repository: grant.repository, repositoryId: grant.repositoryId,
      accountId: grant.accountId, primaryInstallationId: grant.primaryInstallationId});
    assert(this.grants[this.key(grant.primaryInstallationId, grant.repositoryId)]?.revision === revision &&
      found.appId === this.config.appId && found.accountId === grant.accountId && Number.isSafeInteger(found.installationId), "ENHANCED_POLICY_NOT_AUTHORIZED");
    grant.companionInstallationId = found.installationId; grant.enabled = true; grant.status = "CHECKING";
    this.change(grant, "ENHANCED_POLICY_ENABLED");
    const client = await this.service.appClient(grant.primaryInstallationId, grant.repositoryId);
    await this.reader(grant.primaryInstallationId, client)({repository: grant.repository, repositoryId: grant.repositoryId});
    this.service.save();
  }
  async callback(session, state) {
    const pending = this.pending.get(hash(state)); this.pending.delete(hash(state));
    assert(pending && pending.expires > Date.now() && pending.userId === session.userId && pending.session === hash(session.token), "ENROLLMENT_STATE_INVALID");
    const {repo, installation} = await this.service.customers.repository(session, pending.scope.primaryInstallationId, pending.scope.repositoryId);
    assert(hash(this.context(session, repo, installation)) === hash(pending.scope), "ENROLLMENT_SCOPE_CHANGED");
    const grant = this.grants[this.key(installation.id, repo.id)];
    assert(grant?.revision === pending.revision && grant.status === "APPROVAL_PENDING", "ENROLLMENT_STATE_INVALID");
    // Never use GitHub's redirect installation_id as proof of an installation.
    try {await this.activate(grant);} catch (e) {grant.reason = e.code || "COMPANION_INSTALLATION_UNAVAILABLE"; this.service.save();}
    return pending.scope;
  }
  disable(session, repo, installation) {
    const scope = this.context(session, repo, installation), previous = this.grants[this.key(installation.id, repo.id)];
    this.change({...previous, ...scope, enabled: false, status: "OFF", reason: null}, "ENHANCED_POLICY_DISABLED");
    return this.status(installation.id, repo.id, true);
  }
  observed(grant, result) {
    // One repository observation also invalidates other retained claims that
    // actually depend on the changed policy. It never refreshes other facts.
    for (const row of Object.values(this.service.data.receipts)) {
      if (row.installationId !== grant.primaryInstallationId || row.receipt.identity.repositoryId !== grant.repositoryId) continue;
      const before = row.receipt.evidence, after = {...before, rules: {...before.rules, executionProtections: result}};
      const compared = require("./bindings").compare(before, after);
      const names = [...new Set([...compared.changed, ...compared.changedClaims])].filter(k => ["RULES_SNAPSHOT", "CI_EXECUTED", "CODE_COVERAGE"].includes(k.split(":" )[0]));
      if (!names.length) continue;
      const state = result.state === "UNAVAILABLE" ? "UNAVAILABLE" : "STALE";
      row.current = {...row.current, state, reason: "EXECUTION_POLICY_OBSERVATION_CHANGED", claims: {...row.current?.claims}, policyObservedAt: new Date().toISOString()};
      for (const name of names) row.current.claims[name] = {...row.current.claims[name], state};
      this.service.queueRetraction(row);
      const sub = this.service.data.subscriptions[`${grant.repositoryId}:${row.receipt.identity.pr}`];
      if (sub?.installationId === grant.primaryInstallationId && sub.latestReceiptId === row.receipt.receiptId) this.service.enqueue(sub, [...new Set(names.map(k => k.split(":")[0]))]);
    }
  }
  reader(installationId, client) {
    return async ({repository, repositoryId}) => {
      const grant = this.grants[this.key(installationId, repositoryId)];
      if (!this.config || !grant?.enabled) return require("./rules").executionProtections(client, repository);
      const revision = grant.revision;
      try {
        assert(repository.toLowerCase() === grant.repository, "ENHANCED_POLICY_SCOPE_MISMATCH");
        const installation = this.service.meter?.data.installations[installationId];
        assert(installation?.active && installation.account === `github:${grant.accountId}`, "ENHANCED_POLICY_NOT_AUTHORIZED");
        const primary = await this.service.appClient(installationId, repositoryId);
        await primary.authorize(repository, repositoryId);
        const result = await this.broker("observe", {repository: grant.repository, repositoryId, accountId: grant.accountId,
          primaryInstallationId: installationId, companionInstallationId: grant.companionInstallationId, revision});
        assert(this.grants[this.key(installationId, repositoryId)]?.enabled && this.grants[this.key(installationId, repositoryId)]?.revision === revision, "ENHANCED_POLICY_CHANGED_DURING_READ");
        assert(["AVAILABLE", "UNAVAILABLE"].includes(result?.state) && (result.state !== "AVAILABLE" || Array.isArray(result.value)), "POLICY_BROKER_RESPONSE_INVALID");
        grant.status = result.state; grant.reason = result.reason || null; grant.checkedAt = new Date().toISOString();
        this.observed(grant, result);
        if (result.state === "AVAILABLE") result.provenance = {trust: "GITHUB_API", access: "ENHANCED_POLICY_COMPANION",
          appId: this.config.appId, installationId: grant.companionInstallationId, repositoryId};
        return result;
      } catch(e) {
        if (this.grants[this.key(installationId, repositoryId)]?.revision === revision && grant.enabled) {grant.status = "UNAVAILABLE"; grant.reason = e.code || "POLICY_BROKER_UNAVAILABLE"; grant.checkedAt = new Date().toISOString();}
        const result = unavailable(e.code || "POLICY_BROKER_UNAVAILABLE");
        this.observed(grant, result);
        return result;
      }
    };
  }
  async webhook(raw, headers) {
    assert(this.broker, "ENHANCED_POLICY_NOT_CONFIGURED");
    const event = await this.broker("webhook", {raw: raw.toString("base64"), signature: headers["x-hub-signature-256"],
      event: headers["x-github-event"], delivery: headers["x-github-delivery"]});
    if (event.ignored) return {ignored: true};
    const key = `companion:${event.delivery}`;
    if (this.service.data.events[key]) return {duplicate: true};
    for (const grant of Object.values(this.grants)) {
      if (grant.companionInstallationId !== event.installationId) continue;
      if (event.event === "installation" || event.event === "installation_repositories" && event.repositoryIds.includes(grant.repositoryId)) {
        this.change({...grant, enabled: false, status: "REVOKED", reason: "COMPANION_INSTALLATION_CHANGED"}, "COMPANION_INSTALLATION_CHANGED");
      } else if (event.event === "repository_ruleset" && (!event.repositoryId || event.repositoryId === grant.repositoryId)) this.invalidate(grant, "EXECUTION_POLICY_RECHECK_PENDING");
    }
    this.service.data.events[key] = Date.now(); this.service.save(); return {accepted: true};
  }
  primaryRevoked(installationId, repositoryId = null) {
    for (const grant of Object.values(this.grants)) if (grant.primaryInstallationId === installationId && (!repositoryId || grant.repositoryId === repositoryId))
      this.change({...grant, enabled: false, status: "REVOKED", reason: "PRIMARY_INSTALLATION_CHANGED"}, "PRIMARY_INSTALLATION_CHANGED");
  }
}
module.exports = {EnhancedPolicy, DISCLOSURE};
