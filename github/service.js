"use strict";
const { collect } = require("./collect");
const { prove, freshness } = require("./proof");
const { Client } = require("./client");
const { assert, repoName, randomUUID } = require("./common");
const { installationClient, verifyWebhook } = require("./app");
const policies = require("./policy");
const ledger = require("./ledger");
const { actor } = require("./actors");
const currentness = require("./currentness");
class ProofService {
  constructor({
    store,
    config = {},
    receiptSigner = null,
    deliveryClient = () => require("./app").appClient(config),
    clientFactory = (o) => new Client(o),
    appClient = (installationId, repositoryId) =>
      installationClient(config, installationId, repositoryId),
    policyBroker = null,
  }) {
    this.store = store;
    this.config = config;
    this.receiptSigner = receiptSigner || require("./signing").configured(config.signing);
    this.archive = store.root ? new (require("./archive").Archive)(require("node:path").join(store.root,"receipt-archive")) : null;
    this.archived = new Map();
    this.archivedMerges = new Set();
    this.saveDepth = 0;
    this.savePending = false;
    this.deliveryClient = deliveryClient;
    this.clientFactory = clientFactory;
    this.caches = new Map();
    this.appClient = async (installationId, repositoryId) => {
      const client = await appClient(installationId, repositoryId);
      const key = `${installationId}:${repositoryId}`;
      if (!this.caches.has(key)) this.caches.set(key, new Map());
      client.cache = this.caches.get(key);
      return client;
    };
    this.busy = false;
    store.data.github ||= {
      receipts: {},
      subscriptions: {},
      events: {},
      queue: [],
      sequences: {},
      completed: [],
    };
    this.data = store.data.github;
    if (Array.isArray(this.data.events)) this.data.events = Object.fromEntries(this.data.events.map(id => [id, Date.now()]));
    this.data.sequences ||= {};
    delete this.data.revisions;
    this.activeEvents = [];
    this.data.observations ||= {};
    this.data.landings ||= {};
    this.data.landingObservations ||= {};
    this.data.landingRetries ||= {};
    this.data.landingQueue ||= [];
    this.data.groupQueue ||= [];
    this.data.retractionQueue ||= [];
    this.data.pushQueue ||= [];
    this.data.pushObservations ||= {};
    this.data.frontierMetrics ||= {reconciliationSupersessions:0,ruleSuiteDisagreements:0};
    for (const row of Object.values(this.data.receipts)) row.observationId = this.observe(row.receipt);

    // Existing installations keep reporting-only behavior. A blocking gate is
    // never switched on for a repository that did not ask for it.
    this.data.policies ||= {};
    this.data.activation ||= {};
    ledger.area(store);
    this.meter = config.hosted
      ? new (require("./meter").Meter)(store, {
          invitedTesterAccountIds: config.invitedTesterAccountIds,
        })
      : null;
    this.customers = this.meter
      ? new (require("./customer").Customers)(this)
      : null;
    this.enhanced = new (require("./enhanced-policy").EnhancedPolicy)(this, {broker: policyBroker});
    if (this.meter)
      for (const a of Object.values(this.meter.data.accounts))
        if (a.scan?.state === "RUNNING") a.scan.state = "INTERRUPTED";
    for (const job of this.data.queue) job.processing = false;
    if (!this.data.lastActivityAt || Date.now() - this.data.lastActivityAt > 3600000) this.data.deliveryScanAt = 0;
    this.data.lastBootAt = Date.now();
    for(const sub of Object.values(this.data.subscriptions)) {
      const row=this.data.receipts[sub.latestReceiptId];
      if(row?.receipt.evidence.consistency !== "STABLE_OBSERVATION" && row && !this.data.queue.some(q=>q.repositoryId===sub.repositoryId&&q.pr===sub.pr)) this.enqueue(sub,currentness.ALL);
    }
    if(this.archive) for(const record of ledger.area(store).records) {
      const observation=this.data.landings[record.recordId];
      if(observation) this.archive.landing(record,observation);
    }
    if(this.receiptSigner) {
      const signer=this.receiptSigner;
      this.receiptSigner=async bytes=>{
        try {
          const signature=await signer(bytes);
          this.data.signingHealth={...this.data.signingHealth,state:"AVAILABLE",reason:null,lastSuccessAt:new Date().toISOString()};
          return signature;
        } catch(error) {
          this.data.signingHealth={...this.data.signingHealth,state:"UNAVAILABLE",reason:/^[A-Z][A-Z_]+$/.test(error.code||"")?error.code:"SIGNING_UNAVAILABLE",lastFailureAt:new Date().toISOString()};
          this.save();throw error;
        }
      };
      this.receiptSigner.keys=signer.keys;
    }
  }
  save() {
    if(this.saveDepth){this.savePending=true;return;}
    this.savePending=true;
    if(this.archive)for(const record of ledger.area(this.store).records){
      if(!this.archivedMerges.has(record.recordId)){this.archive.merge(record);this.archivedMerges.add(record.recordId);}
    }
    if (this.archive) for (const row of Object.values(this.data.receipts)) {
      const digest = require("./common").hash([row.receipt,row.artifacts || null]);
      const previous = this.archived.get(row.receipt.receiptId);
      assert(!previous || previous === digest,"ARCHIVE_IMMUTABILITY_VIOLATION");
      if (!previous) { this.archive.receipt(row); this.archived.set(row.receipt.receiptId,digest); }
    }
    const used = new Set(Object.values(this.data.receipts).map(r => r.observationId).filter(Boolean));
    for (const record of ledger.area(this.store).records) if (record.proof?.receiptSnapshot?.observationId) used.add(record.proof.receiptSnapshot.observationId);
    for (const id of Object.keys(this.data.observations || {})) if (!used.has(id)) delete this.data.observations[id];
    this.store.save();
    this.savePending=false;
  }
  // Per repository, owner-chosen, defaulting to report-only.
  policyFor(repositoryId) {
    return this.data.policies?.[repositoryId] || null;
  }
  setPolicy(repositoryId, presetId, setByUserId = null) {
    assert(Number.isSafeInteger(repositoryId) && repositoryId > 0, "INVALID_SCOPE");
    const chosen = policies.select(presetId);
    if (chosen.enforced && this.meter) {
      const installationId = Object.values(this.data.subscriptions).find(s=>s.repositoryId===repositoryId)?.installationId;
      assert(installationId && this.meter.usage(installationId).plan === "PRO", "PAID_PRO_REQUIRED_FOR_GATE");
      assert(Object.values(this.data.receipts).some(r=>r.receipt.identity.repositoryId===repositoryId && r.installationId===installationId && r.metering && r.metering.reason!=="NOT_BILLABLE_COMPLETION"), "FIRST_PROOF_REQUIRED_FOR_GATE");
    }
    this.data.policies[repositoryId] = {
      preset: chosen.id,
      setAt: new Date().toISOString(),
      setByUserId: Number.isSafeInteger(setByUserId) ? setByUserId : null,
    };
    for (const row of Object.values(this.data.receipts)) {
      if (row.receipt.identity.repositoryId !== repositoryId) continue;
      row.current = { state: "STALE", reason: "POLICY_CHANGED" };
      if(!this.data.subscriptions[`${repositoryId}:${row.receipt.identity.pr}`])this.queueRetraction(row);
    }
    for (const sub of Object.values(this.data.subscriptions)) {
      if (sub.repositoryId !== repositoryId) continue;
      const key = `${repositoryId}:${sub.pr}`;
      this.data.sequences[key] = (this.data.sequences[key] || 0) + 1;
      if (!this.data.queue.some(q => !q.processing && q.repositoryId === repositoryId && q.pr === sub.pr))
        this.data.queue.push({ ...sub });
    }
    this.save();
    return policies.normalize(this.data.policies[repositoryId]);
  }
  gateFor(receipt, current) {
    return policies.evaluate(
      receipt,
      current,
      this.policyFor(receipt.identity.repositoryId),
    );
  }
  remediationFor(receipt, current, gate = this.gateFor(receipt, current)) {
    const sub = this.data.subscriptions[`${receipt.identity.repositoryId}:${receipt.identity.pr}`];
    const tracked = Boolean(sub?.installationId && this.config.appId && this.config.privateKey && this.config.webhookSecret);
    return require("./remediation").build(receipt, current, gate, { tracked });
  }
  startScan(installationId, repositoryId, repo) {
    const account = this.meter.account(installationId);
    assert(this.meter.usage(installationId).automationAllowed,"TRIAL_EXPIRED");
    const old = account.scan;
    if (old) {
      assert(old.repositoryId === repositoryId, "SCAN_TASTE_ALREADY_RESERVED");
      if (["RUNNING", "COMPLETE"].includes(old.state)) return old;
    }
    assert(!this.scanBusy, "SCAN_BUSY");
    this.scanBusy = true;
    const job = (account.scan = {
      ...old,
      id: old?.id || randomUUID(),
      installationId,
      repositoryId,
      repo,
      limit: 5,
      state: "RUNNING",
      completed: 0,
      total: null,
      result: null,
    });
    this.save();
    this.scanJob = (async () => {
      try {
        const client = await this.appClient(installationId, repositoryId);
        await client.authorize(repo, repositoryId);
        const result = await require("./scan").scan(client, repo, {
          limit: 5,
          canceled: () =>
            job.state === "CANCELED" ||
            !this.meter.data.installations[installationId]?.active,
          progress: (completed, total) => {
            job.completed = completed;
            job.total = total;
            this.save();
          },
        });
        if (job.state !== "CANCELED") {
          job.result = result;
          job.state = result.rows.some(
            (r) =>
              r.state === "UNAVAILABLE" &&
              r.reason !== "UNSUPPORTED_HISTORICAL_SHAPE",
          )
            ? "RETRY_AVAILABLE"
            : "COMPLETE";
        }
      } catch (e) {
        if (job.state !== "CANCELED") job.state = "RETRY_AVAILABLE";
      } finally {
        this.scanBusy = false;
        this.save();
      }
    })();
    return job;
  }
  async exclusive(fn) {
    assert(!this.busy, "PROOF_BUSY");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
      this.activeEvents = [];
    }
  }
  async run(
    repo,
    pr,
    {
      token = null,
      publish = false,
      client = null,
      mergeGroup = null,
      installationId = null,
    } = {},
  ) {
    return this.exclusive(async () => {
      assert(
        repoName(repo) && Number.isSafeInteger(pr) && pr > 0,
        "INVALID_SCOPE",
      );
      if (Object.keys(this.data.receipts).length >= 1000 && this.archive) {
        this.save();
        const protectedIds = new Set([...Object.values(this.data.subscriptions).map(s=>s.latestReceiptId),...this.data.retractionQueue.map(q=>q.receiptId)]);
        for (const [id,row] of Object.entries(this.data.receipts)) {
          if (Object.keys(this.data.receipts).length < 900) break;
          if (!protectedIds.has(id) && !row.pendingPublication) delete this.data.receipts[id];
        }
      }
      assert(Object.keys(this.data.receipts).length < 1000, "RECEIPT_CAPACITY");
      client ||= this.clientFactory({ token });
      if (this.meter) {
        this.meter.account(installationId);
        const repository = await client.get(`/repos/${repo}`);
        const pull = await client.get(`/repos/${repo}/pulls/${pr}`);
        this.meter.check(installationId, {
          repositoryId: repository.id,
          pr,
          headSha: pull.head?.sha,
        });
      }
      const eventStart = this.activeEvents;
      const policyBefore = structuredClone(this.data.policies);
      const capture = await collect(client, repo, pr, { mergeGroup, executionPolicyReader: this.enhanced.reader(installationId, client) });
      if (this.config.reconstruction && capture.target.state === "AVAILABLE") {
        const t = capture.target.value;
        capture.expectedTree = await require("./mirror").reconstruct({ config: this.config.reconstruction,
          repository: repo, repositoryId: capture.identity.repositoryId, token: client.token,
          input: { base: capture.identity.baseSha, head: capture.identity.headSha, candidate: t.sha, method: t.kind === "MERGE_GROUP" ? "queue" : "merge", providerTree: t.tree, ...(t.selection?.value?.order || {}) } });
      }
      const receipt = prove(capture, { appId: this.config.appId });
      assert(
        !publish || capture.identity.visibility === "public",
        "PRIVATE_SHARING_DENIED",
      );
      const prior = Object.values(this.data.receipts).filter(r => r.receipt.identity.repositoryId === receipt.identity.repositoryId && r.receipt.identity.pr === receipt.identity.pr).pop();
      receipt.supersedes = prior ? { receiptId: prior.receipt.receiptId, digest: require("./common").hash(prior.receipt) } : null;
      const { receipt: bundledReceipt, ...artifacts } = await require("./bundle").create(receipt, { signer: this.receiptSigner, keys: this.receiptSigner?.keys || null });
      const current = freshness(receipt, capture);
      if (require("./common").hash(policyBefore[capture.identity.repositoryId] || null) !== require("./common").hash(this.policyFor(capture.identity.repositoryId)) || eventStart.some(e => e.repo === repo.toLowerCase() && currentness.touches(e.event, e.payload, capture).length))
        Object.assign(current, {
          state: "STALE",
          reason: "EVENT_DURING_COLLECTION",
        });
      const collectionComplete =
        receipt.verdict !== "FAIL" &&
        capture.consistency === "STABLE_OBSERVATION" &&
        require("./bindings").compare(capture, capture).unavailable.length === 0;
      if (this.meter) assert(this.meter.usage(installationId).automationAllowed, "TRIAL_EXPIRED");
      // No await between entitlement validation, trial start, receipt, and durable save.
      const metering = this.meter
        ? this.meter.complete(
            installationId,
            receipt,
            current,
            collectionComplete,
          )
        : null;
      const gate = this.gateFor(receipt, current);
      artifacts.operatorLog = require("./operator-log").append(this.data, receipt.receiptId, artifacts.envelope);
      this.observe(receipt);
      this.data.receipts[receipt.receiptId] = {
        receipt,
        artifacts,
        observationId: receipt.observationId,
        current,
        gate,
        published: publish,
        installationId,
        metering,
      };
      for (const row of Object.values(this.data.receipts))
        if (
          row.receipt.receiptId !== receipt.receiptId &&
          row.receipt.identity.repositoryId === receipt.identity.repositoryId &&
          row.receipt.identity.pr === receipt.identity.pr &&
          row.receipt.identity.headSha !== receipt.identity.headSha
        )
          row.current = {
            state: "STALE",
            reason: "PR_HEAD_CHANGED",
            next: "RE-PROOF REQUIRED",
          };
      if (
        collectionComplete &&
        current.state === "CURRENT" &&
        (!this.meter || metering.charged)
      )
        this.data.completed.push({
          id: randomUUID(),
          type: "proof.completed",
          receiptId: receipt.receiptId,
          repositoryId: receipt.identity.repositoryId,
          at: receipt.issuedAt,
        });
      if (this.meter) require("./events").record(this.store, "proof_observed", receipt.receiptId, {account:this.meter.data.installations[installationId].account,installationId,receiptId:receipt.receiptId,verdict:receipt.verdict});
      this.save();
      return { receipt, current, gate, remediation: this.remediationFor(receipt, current, gate) };
    });
  }
  async access(id, token) {
    const row = this.data.receipts[id] || this.archive?.get(id);
    assert(row, "NOT_FOUND");
    if (this.meter) this.meter.account(row.installationId);
    // Every read rechecks visibility/access against immutable repository ID.
    // A public receipt URL is not authorization to a repository made private.
    const client = this.clientFactory({ token: token || null });
    const repo = await client.authorize(
      row.receipt.identity.repository,
      row.receipt.identity.repositoryId,
    );
    assert(token || (row.published && repo.private === false), "ACCESS_DENIED");
    return row;
  }
  portable(row) {
    const id=row.receipt.receiptId;
    const values = this.archive ? this.archive.byReceipt(id) : ledger.area(this.store).records.filter(r=>r.proof?.receiptSnapshot?.receiptId===id && this.data.landings[r.recordId]).map(record=>({record,observation:this.data.landings[record.recordId]}));
    let result=require("./bundle").attachLandings({...row.artifacts,receipt:row.receipt},values);
    const checkpoint=this.data.logCheckpoints?.at(-1);
    if(checkpoint && row.artifacts?.operatorLog?.index < checkpoint.size) result.tlog=require("./operator-log").inclusion(this.data,row.artifacts.operatorLog.index,checkpoint);
    return result;
  }
  async checkpoint(day) {
    const existing=(this.data.logCheckpoints||[]).find(c=>c.day===day);
    if(existing)return existing;
    assert(day < new Date().toISOString().slice(0,10),"CHECKPOINT_DAY_NOT_CLOSED");
    const checkpoint=await require("./operator-log").checkpoint(this.data,day,this.receiptSigner);
    this.data.logCheckpoints||=[];this.data.logCheckpoints.push(checkpoint);this.save();return checkpoint;
  }
  resumeEntitled() {
    if (!this.meter) return;
    for (const sub of Object.values(this.data.subscriptions)) {
      if (!["ALLOWANCE_EXHAUSTED", "TRIAL_EXPIRED"].includes(sub.refreshState)) continue;
      try {
        if (
          this.meter.usage(sub.installationId).automationAllowed &&
          !this.data.queue.some(
            (q) => q.repositoryId === sub.repositoryId && q.pr === sub.pr,
          )
        ) {
          this.data.queue.push({ ...sub });
          sub.refreshState = "QUEUED";
        }
      } catch {} // Revoked installations stay stopped.
    }
  }
  queueRetraction(row) {
    if(this.config.publishChecks&&(row.checkIds?.length||row.checkId)&&!this.data.retractionQueue.some(q=>q.receiptId===row.receipt.receiptId))
      this.data.retractionQueue.push({receiptId:row.receipt.receiptId,repo:row.receipt.identity.repository,repositoryId:row.receipt.identity.repositoryId,installationId:row.installationId,pr:row.receipt.identity.pr});
  }
  async read(id, token, { refresh = false } = {}) {
    const row = await this.access(id, token);
    if (refresh) {
      await this.exclusive(async () => {
        try {
          const eventStart = this.activeEvents;
          const c = await collect(
            this.clientFactory({ token }),
            row.receipt.identity.repository,
            row.receipt.identity.pr,
            {
              executionPolicyReader: this.enhanced.reader(row.installationId, this.clientFactory({token})),
              mergeGroup:
                row.receipt.summary.target.value?.kind === "MERGE_GROUP"
                  ? {
                      head_sha: row.receipt.summary.target.value.sha,
                      head_ref: row.receipt.summary.target.value.ref,
                      base_sha: row.receipt.summary.target.value.selection?.value?.baseSha || row.receipt.identity.baseSha,
                      base_ref: `refs/heads/${row.receipt.identity.baseRef}`,
                    }
                  : null,
            },
          );
          row.current = freshness(row.receipt, c);
          if (eventStart.some(e => e.repo === row.receipt.identity.repository.toLowerCase() && currentness.touches(e.event, e.payload, c).length))
            row.current = { state: "STALE", reason: "EVENT_DURING_REFRESH" };
        } catch {
          row.current =
            row.current.state === "STALE"
              ? { ...row.current, refreshState: "UNAVAILABLE" }
              : freshness(row.receipt, null);
        }
        if(row.current.state!=="CURRENT")this.queueRetraction(row);
        this.save();
      });
    }
    // Saved CURRENT is never presented as live current on an unrefreshed view.
    const current =
      refresh || row.current.state === "STALE"
        ? row.current
        : {
            ...row.current,
            state: "UNAVAILABLE",
            reason: "REFRESH_REQUIRED",
            next: "Refresh evidence to establish currentness.",
          };
    return {
      receipt: row.receipt,
      current,
      remediation: this.remediationFor(row.receipt, current),
      // Recomputed against the currentness actually being shown, so an
      // unrefreshed or stale view never displays a satisfied merge gate.
      gate: this.gateFor(row.receipt, current),
      latestReceiptId:
        this.data.subscriptions[
          `${row.receipt.identity.repositoryId}:${row.receipt.identity.pr}`
        ]?.latestReceiptId || null,
    };
  }
  async webhook(raw, headers) {
    // This transaction contains no await: nested state saves coalesce, and the
    // final fsync completes before the signed delivery is acknowledged.
    this.saveDepth++;
    try{return this.acceptWebhook(raw,headers);}
    finally{if(!--this.saveDepth&&this.savePending)this.save();}
  }
  acceptWebhook(raw, headers) {
    verifyWebhook(
      raw,
      headers["x-hub-signature-256"],
      this.config.webhookSecret,
    );
    const id = headers["x-github-delivery"],
      event = headers["x-github-event"];
    assert(
      typeof id === "string" && /^[\w-]{1,100}$/.test(id),
      "INVALID_DELIVERY",
    );
    for (const [guid, seenAt] of Object.entries(this.data.events))
      if (seenAt < Date.now() - 4 * 86400000) delete this.data.events[guid];
    if (this.data.events[id]) return { duplicate: true };
    const p = JSON.parse(raw);
    if (event === "ping") return { received: true };
    if (this.meter && event === "installation") {
      const installationId = p.installation?.id;
      assert(Number.isSafeInteger(installationId) && installationId > 0,
        "INVALID_WEBHOOK_SCOPE");
      if (["deleted", "suspend"].includes(p.action)) {
        this.enhanced.primaryRevoked(installationId);
        this.meter.disconnect(installationId);
        this.data.queue = this.data.queue.filter(
          (q) => q.installationId !== installationId,
        );
        for (const [key, s] of Object.entries(this.data.subscriptions))
          if (s.installationId === installationId)
            delete this.data.subscriptions[key];
      } else if (
        ["created", "unsuspend", "new_permissions_accepted"].includes(p.action)
      ) {
        assert(Number.isSafeInteger(p.installation.account?.id) &&
          p.installation.account.id > 0, "INVALID_WEBHOOK_SCOPE");
        this.meter.connect(installationId, p.installation.account?.id);
        for (const repo of p.repositories || []) this.activate(installationId, repo);
      } else return { ignored: true };
      this.data.events[id] = Date.now();
      this.save();
      return { accepted: true };
    }
    if (this.meter && event === "installation_repositories") {
      const installationId = p.installation?.id;
      assert(Number.isSafeInteger(installationId) && installationId > 0,
        "INVALID_WEBHOOK_SCOPE");
      assert(Array.isArray(p.repositories_removed || []) &&
        (p.repositories_removed || []).every(r => Number.isSafeInteger(r?.id) && r.id > 0),
        "INVALID_WEBHOOK_SCOPE");
      this.meter.account(installationId);
      for (const repo of p.repositories_added || []) this.activate(installationId, repo);
      for (const removed of p.repositories_removed || []) {
        this.enhanced.primaryRevoked(installationId, removed.id);
        delete this.data.activation[`${installationId}:${removed.id}`];
        this.data.queue = this.data.queue.filter(
          (q) =>
            q.installationId !== installationId ||
            q.repositoryId !== removed.id,
        );
        for (const [key, s] of Object.entries(this.data.subscriptions))
          if (
            s.installationId === installationId &&
            s.repositoryId === removed.id
          )
            delete this.data.subscriptions[key];
      }
      this.data.events[id] = Date.now();
      this.save();
      return { accepted: true };
    }
    // Own check publication is delivery, not independent CI proof or a refresh trigger.
    if (
      event === "check_run" &&
      String(p.check_run?.app?.id) === String(this.config.appId)
    )
      { this.data.events[id] = Date.now(); this.save(); return { ignored: true }; }
    if (
      event === "check_suite" &&
      String(p.check_suite?.app?.id) === String(this.config.appId)
    )
      { this.data.events[id] = Date.now(); this.save(); return { ignored: true }; }
    if (!p.repository && p.organization && [...currentness.RULE_EVENTS, ...currentness.PERMISSION_EVENTS].includes(event)) {
      const installationId = p.installation?.id;
      assert(Number.isSafeInteger(installationId) && typeof p.organization.login === "string", "INVALID_WEBHOOK_SCOPE");
      if (this.meter) this.meter.account(installationId);
      this.data.events[id] = Date.now();
      for (const sub of Object.values(this.data.subscriptions)) {
        if (sub.installationId !== installationId || sub.repo.split("/")[0].toLowerCase() !== p.organization.login.toLowerCase()) continue;
        this.routeEvent(event, p, sub.repo, sub.repositoryId, sub.pr);
      }
      this.save();
      return { accepted: true };
    }
    const repo = p.repository?.full_name,
      repositoryId = p.repository?.id,
      installationId = p.installation?.id;
    assert(
      repoName(repo) &&
        Number.isSafeInteger(repositoryId) &&
        Number.isSafeInteger(installationId),
      "INVALID_WEBHOOK_SCOPE",
    );
    if (this.meter) this.meter.account(installationId);
    if (
      this.meter &&
      event === "pull_request" &&
      p.action === "opened" &&
      !this.config.serviceIdentityIds?.includes(p.pull_request?.user?.id)
    )
      this.meter.activity(
        installationId,
        p.pull_request?.user,
        "PR_OPENED",
        `${repositoryId}:${p.pull_request?.number}`,
      );
    if (
      this.meter &&
      event === "push" &&
      p.deleted !== true &&
      Array.isArray(p.commits) && p.commits.length > 0 &&
      /^[a-f0-9]{40}$/.test(p.after || "") && !/^0+$/.test(p.after) &&
      p.sender?.type === "User" &&
      !this.config.serviceIdentityIds?.includes(p.sender.id)
    )
      this.meter.activity(
        installationId,
        p.sender,
        "PUSH",
        `${repositoryId}:${p.after}:${id}`,
      );
    const supported = [
      "pull_request",
      "pull_request_review",
      "check_run",
      "check_suite",
      "status",
      "workflow_run",
      "push",
      "merge_group",
      "repository_ruleset",
      "branch_protection_rule",
      "branch_protection_configuration",
      "delete",
      ...currentness.PERMISSION_EVENTS,
      "repository",
      "installation_repositories",
    ];
    if (!supported.includes(event)) { this.data.events[id] = Date.now(); this.save(); return { ignored: true }; }
    this.data.events[id] = Date.now();
    // Recorded before anything is staled, so the ledger preserves what was
    // known at the decision point rather than what is known afterwards.
    if (
      event === "pull_request" &&
      p.action === "closed" &&
      p.pull_request?.merged === true
    )
      { const record = this.recordMerge(repo, repositoryId, installationId, p.pull_request);
        if (record) this.data.landingQueue.push(record.recordId); }
    if (this.meter) require("./events").record(this.store,"evidence_changed",id,{account:this.meter.data.installations[installationId].account,repositoryId,event});
    if (event === "pull_request" && p.pull_request?.state === "open") {
      const pr = p.pull_request.number;
      assert(Number.isSafeInteger(pr) && pr > 0);
      const key = `${repositoryId}:${pr}`;
      assert(
        this.data.subscriptions[key] ||
          Object.keys(this.data.subscriptions).length < 100,
        "SUBSCRIPTION_CAPACITY",
      );
      this.data.subscriptions[key] = {
        ...this.data.subscriptions[key],
        repo,
        repositoryId,
        pr,
        installationId,
      };
    }
    if (event === "pull_request" && p.pull_request?.state === "closed")
      delete this.data.subscriptions[
        `${repositoryId}:${p.pull_request.number}`
      ];
    if (event === "merge_group") {
      if (p.action === "checks_requested") this.data.groupQueue.push({ repo, repositoryId, installationId, group: p.merge_group });
      else if (p.action === "destroyed") {
        this.data.groupQueue = this.data.groupQueue.filter(j => !(j.repositoryId === repositoryId && j.group?.head_sha === p.merge_group?.head_sha));
        for (const sub of Object.values(this.data.subscriptions)) {
        if (sub.repositoryId === repositoryId && sub.mergeGroup?.head_sha === p.merge_group?.head_sha) { sub.mergeGroup = null; this.enqueue(sub, currentness.ALL); }
        }
      }
    }
    if (event === "push" && Object.values(this.data.receipts).some(r => r.receipt.identity.repositoryId === repositoryId && p.ref === `refs/heads/${r.receipt.identity.baseRef}`))
      this.data.pushQueue.push({ id, repository: repo, repositoryId, installationId, before: p.before, after: p.after, ref: p.ref });
    this.routeEvent(event, p, repo, repositoryId);
    this.save();
    return { accepted: true };
  }
  observe(receipt) {
    const { hash } = require("./common");
    const id = hash({ evidence: receipt.evidence, startedAt: receipt.evidence.startedAt });
    this.data.observations[id] ||= structuredClone(receipt.evidence);
    // Migration metadata lives beside old immutable receipts.
    return id;
  }
  replayStored(receiptId) {
    const row = this.data.receipts[receiptId] || this.archive?.get(receiptId);
    const evidence=this.data.observations[row?.observationId] || (row?.archived && row.receipt.evidence);
    assert(row?.artifacts && evidence && row.observationId===require('./common').hash({evidence,startedAt:evidence.startedAt}), "OBSERVATION_UNAVAILABLE");
    return require("./bundle").replay({ ...row.receipt, evidence }, row.artifacts.policy);
  }
  enqueue(sub, claims) {
    const queued = this.data.queue.find(q => !q.processing && q.repositoryId === sub.repositoryId && q.pr === sub.pr);
    if (queued) { queued.claims = [...new Set([...(queued.claims || currentness.ALL), ...claims])]; queued.mergeGroup = sub.mergeGroup || null; }
    else this.data.queue.push({ ...sub, claims, mergeGroup: sub.mergeGroup || null });
  }
  routeEvent(event, payload, repo, repositoryId, onlyPR = null) {
    if (this.busy) this.activeEvents.push({ event, payload, repo: repo.toLowerCase() });
    for (const row of Object.values(this.data.receipts)) {
      if (row.receipt.identity.repositoryId !== repositoryId || (onlyPR && row.receipt.identity.pr !== onlyPR)) continue;
      const touched = currentness.touches(event, payload, row.receipt.evidence);
      if (!touched.length) continue;
      row.current = { ...row.current, state: "UNAVAILABLE", reason: "RECHECK_PENDING", touched, historicalVerdict: row.receipt.verdict };
      if(!this.data.subscriptions[`${repositoryId}:${row.receipt.identity.pr}`])this.queueRetraction(row);
    }
    for (const sub of Object.values(this.data.subscriptions)) {
      if (sub.repositoryId !== repositoryId || (onlyPR && sub.pr !== onlyPR)) continue;
      const row = this.data.receipts[sub.latestReceiptId] || Object.values(this.data.receipts).filter(r => r.receipt.identity.repositoryId === repositoryId && r.receipt.identity.pr === sub.pr).pop();
      if (!row && payload.pull_request?.number && payload.pull_request.number !== sub.pr) continue;
      const touched = currentness.touches(event, payload, row?.receipt.evidence);
      if (touched.length) this.enqueue(sub, touched);
    }
  }
  async resolveGroup() {
    const job = this.data.groupQueue[0];
    if (!job || job.retryAt > Date.now()) return;
    try {
      const client = await this.appClient(job.installationId, job.repositoryId);
      await client.authorize(job.repo, job.repositoryId);
      if (this.config.publishChecks && !job.pendingCheckId) {
        const response = await client.request(`/repos/${job.repo}/check-runs`, { method: "POST", body: {
          name: require("./check").NAME, head_sha: job.group.head_sha, status: "in_progress",
          output: { title: "Queue proof pending", summary: "Resolving the exact queue entry and its evidence." } } });
        job.pendingCheckId = response.id; this.save();
      }
      const [owner, name] = job.repo.split("/");
      for (const sub of Object.values(this.data.subscriptions).filter(x => x.repositoryId === job.repositoryId && x.installationId === job.installationId)) {
        const selected = await client.observe(async () => {
          const data = await client.request("/graphql", { method: "POST", body: { query: "query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){databaseId pullRequest(number:$pr){mergeQueueEntry{headCommit{oid}}}}}", variables: { owner, name, pr: sub.pr } } });
          assert(!data.errors && data.data?.repository?.databaseId === job.repositoryId, "QUEUE_SELECTION_UNAVAILABLE");
          return data.data.repository.pullRequest?.mergeQueueEntry?.headCommit?.oid;
        });
        assert(selected.state === "AVAILABLE", "QUEUE_SELECTION_UNAVAILABLE");
        if (selected.value === job.group.head_sha) {
          sub.mergeGroup = Object.fromEntries(["head_sha", "head_ref", "base_sha", "base_ref"].map(k => [k, job.group[k]]));
          this.enqueue(sub, currentness.ALL);
        }
      }
      this.data.groupQueue.shift();
    } catch { job.retryAt = Date.now() + 30000; job.state = "UNAVAILABLE"; }
    this.save();
  }
  async reconcileDeliveries(now = Date.now()) {
    if (!this.config.appId || !this.config.privateKey || (this.data.deliveryScanAt && now - this.data.deliveryScanAt < 4 * 3600000)) return;
    try {
      const client = this.deliveryClient();
      let endpoint = "/app/hook/deliveries?per_page=100";
      const seen = new Set();
      for (let page = 0; endpoint && page < 100; page++) {
        const rows = await client.get(endpoint);
        assert(Array.isArray(rows), "DELIVERY_SCAN_UNAVAILABLE");
        for (const row of rows) {
          const validId = Number.isSafeInteger(row?.id) && row.id > 0 ||
            typeof row?.id === "string" && /^[1-9][0-9]{0,19}$/.test(row.id);
          assert(validId && typeof row.guid === "string" && /^[\w-]{1,100}$/.test(row.guid), "DELIVERY_IDENTITY_UNAVAILABLE");
          if (row.event === "ping" || seen.has(row.guid)) continue;
          seen.add(row.guid);
          if (!this.data.events[row.guid] || row.status_code >= 400)
            await client.request(`/app/hook/deliveries/${row.id}/attempts`, { method: "POST" });
        }
        const next = client.links.get(endpoint)?.match(/<([^>]+)>; rel="next"/)?.[1];
        if (!next) endpoint = null;
        else { const url = new URL(next); assert(url.origin === "https://api.github.com" && url.pathname === "/app/hook/deliveries", "INVALID_DELIVERY_CURSOR"); endpoint = url.pathname + url.search; }
      }
      assert(!endpoint, "DELIVERY_SCAN_INCOMPLETE");
      this.data.deliveryScanAt = now; this.data.deliveryHealth = "RECONCILED";
    } catch { this.data.deliveryHealth = "UNAVAILABLE"; this.data.deliveryScanAt = now - 4 * 3600000 + 300000; }
    this.save();
  }
  reconcile(now = Date.now()) {
    for (const sub of Object.values(this.data.subscriptions)) {
      if ((!sub.reconciledAt || now - sub.reconciledAt >= 6 * 3600000) && (!sub.reconcileQueuedAt || now - sub.reconcileQueuedAt >= 300000)) {
        this.enqueue(sub, currentness.ALL);
        sub.reconcileQueuedAt = now;
        const job = this.data.queue.find(j => j.repositoryId === sub.repositoryId && j.pr === sub.pr);
        if (job) job.reconciled = true;
      }
    }
  }
  // One immutable row per merge. A receipt bound to a different commit than
  // the one that landed is recorded as exactly that, never as proof of it.
  recordMerge(repo, repositoryId, installationId, pull) {
    const mergedHeadSha = pull.head?.sha || null;
    if(this.archive?.mergeIdentity(`${repositoryId}:${pull.number}:${pull.merge_commit_sha||"UNKNOWN"}`))return null;
    const rows = Object.values(this.data.receipts).filter(
      (r) =>
        r.receipt.identity.repositoryId === repositoryId &&
        r.receipt.identity.pr === pull.number &&
        Number.isFinite(Date.parse(pull.merged_at)) &&
        Date.parse(r.receipt.issuedAt) <= Date.parse(pull.merged_at),
    );
    const bound = rows.filter(
      (r) => r.receipt.identity.headSha === mergedHeadSha,
    );
    const chosen =
      (bound.length ? bound : rows)
        .slice()
        .sort(
          (a, b) =>
            Date.parse(a.receipt.issuedAt) - Date.parse(b.receipt.issuedAt),
        )
        .pop() || null;
    const record = ledger.record(this.store, {
      repository: repo,
      repositoryId,
      pr: pull.number,
      installationId,
      baseRef: pull.base?.ref || null,
      mergedAt: pull.merged_at || null,
      mergeCommitSha: pull.merge_commit_sha || null,
      mergedHeadSha,
      mergedBy: actor(pull.merged_by),
      proof: ledger.proofSnapshot(
        chosen,
        mergedHeadSha,
        chosen?.publishedAt && Date.parse(chosen.publishedAt) <= Date.parse(pull.merged_at) ? chosen.publishedGate : null,
        pull.merge_commit_sha,
      ),
    });
    if(record)this.archive?.merge(record);
    return record;
  }
  async retractChecks(client, repositoryId, pr = null, receiptId = null) {
    if (!this.config.publishChecks) return;
    let failed = false;
    for (const row of Object.values(this.data.receipts)) {
      if ((receiptId && row.receipt.receiptId !== receiptId) || row.receipt.identity.repositoryId !== repositoryId ||
          (pr !== null && row.receipt.identity.pr !== pr) || !["STALE", "UNAVAILABLE"].includes(row.current.state)) continue;
      for (const id of row.checkIds?.length ? row.checkIds : row.checkId ? [row.checkId] : []) {
        try {
          await client.request(`/repos/${row.receipt.identity.repository}/check-runs/${id}`, {
            method: "PATCH", body: { status: "completed",
              conclusion: policies.staleConclusion(this.policyFor(repositoryId)),
              output: { title: row.current.state === "STALE" ? "STALE — RE-PROOF REQUIRED" : "Evidence refresh pending",
                summary: `Historical ${row.receipt.verdict} remains available. Relevant evidence changed; refresh is pending.` }
            }
          });
        } catch { failed = true; row.checkDelivery = "UNAVAILABLE"; }
      }
    }
    this.save();
    assert(!failed || !policies.normalize(this.policyFor(repositoryId)).enforced, "CHECK_RECONCILIATION_PENDING");
    return !failed;
  }
  activate(installationId, repo) {
    assert(Number.isSafeInteger(repo.id) && repoName(repo.full_name), "INVALID_WEBHOOK_SCOPE");
    const key = `${installationId}:${repo.id}`;
    this.data.activation[key] = {installationId, repositoryId:repo.id, repo:repo.full_name};
    require("./events").record(this.store,"repo_authorized",key,{installationId,repositoryId:repo.id,account:this.meter.data.installations[installationId].account});
  }
  watch(installationId, repositoryId, repo, pulls) {
    for (const p of pulls) {
      if (p.state && p.state !== "open") continue;
      assert(Number.isSafeInteger(p.number) && p.number > 0, "INVALID_SCOPE");
      const key = `${repositoryId}:${p.number}`;
      if (this.data.subscriptions[key]) continue;
      assert(Object.keys(this.data.subscriptions).length < 100,"SUBSCRIPTION_CAPACITY");
      const sub = this.data.subscriptions[key] = {installationId,repositoryId,repo,pr:p.number};
      this.meter.activity(installationId,p.user,"PR_OPEN",`discovery:${repositoryId}:${p.number}`,Date.parse(p.created_at)||Date.now());
      this.data.queue.push({...sub});
    }
    this.save();
  }
  async activateNext() {
    const pending = Object.values(this.data.activation).find(x=>!x.complete && (!x.retryAt || x.retryAt<=Date.now()));
    if (!pending) return;
    try {
      this.meter.account(pending.installationId);
      const client = await this.appClient(pending.installationId,pending.repositoryId);
      await client.authorize(pending.repo,pending.repositoryId);
      const pulls = await client.list(`/repos/${pending.repo}/pulls?state=open`);
      this.watch(pending.installationId,pending.repositoryId,pending.repo,pulls);
      pending.complete = true;
    } catch (e) { pending.error = e.code || "ACTIVATION_UNAVAILABLE"; pending.retryAt=Date.now()+300000; }
    this.save();
  }
  async trialNotices() {
    if (!this.meter) return;
    for (const sub of Object.values(this.data.subscriptions)) {
      if (!this.meter.data.installations[sub.installationId]?.active) continue;
      const usage = this.meter.usage(sub.installationId);
      const trial = this.meter.account(sub.installationId).trial;
      if (!trial || usage.plan === "PRO") continue;
      const trialDays = usage.trialDays;
      const day = usage.plan === "PAUSED"
        ? trialDays + 1
        : Math.min(trialDays, Math.floor((Date.now()-trial.startedAt)/86400000)+1);
      if(day < Math.max(1, trialDays - 2) || sub.noticeDay===day) continue;
      // Update existing native checks even when no new GitHub event arrives.
      if(this.config.publishChecks) {
        const client=await this.appClient(sub.installationId,sub.repositoryId);
        for(const row of Object.values(this.data.receipts).filter(r=>r.installationId===sub.installationId && r.receipt.identity.repositoryId===sub.repositoryId && r.receipt.identity.pr===sub.pr)) {
          for(const id of row.checkIds || (row.checkId?[row.checkId]:[])) {
            const gate=this.gateFor(row.receipt,row.current);
            await client.request(`/repos/${sub.repo}/check-runs/${id}`,{method:"PATCH",body:{output:require("./check").accessNotice(row.receipt,row.current,gate,usage,this.config.origin,this.remediationFor(row.receipt,row.current)),...(usage.plan==="PAUSED"?{status:"completed",conclusion:gate.enforced?"failure":"neutral"}:{})}});
          }
        }
      }
      sub.noticeDay=day;
      if(!usage.automationAllowed) sub.refreshState="TRIAL_EXPIRED";
      require("./events").record(this.store,"trial_notice",`${sub.installationId}:${sub.repositoryId}:${sub.pr}:${day}`,{account:this.meter.data.installations[sub.installationId].account,day});
    }
    this.save();
  }
  async drain() {
    if (this.busy || this.draining) return;
    this.draining = true;
    try {
    if(this.savePending)this.save();
    const retraction=this.data.retractionQueue[0];
    if(retraction&&(!retraction.retryAt||retraction.retryAt<=Date.now())){
      try{const client=await this.appClient(retraction.installationId,retraction.repositoryId);await client.authorize(retraction.repo,retraction.repositoryId);
        if(await this.retractChecks(client,retraction.repositoryId,retraction.pr,retraction.receiptId))this.data.retractionQueue.shift();else retraction.retryAt=Date.now()+30000;
      }catch{retraction.retryAt=Date.now()+30000;}
      this.save();
    }
    await this.resolveGroup();
    await this.reconcileDeliveries();
    this.reconcile();
    this.data.lastActivityAt = Date.now();
    if(this.receiptSigner && this.data.operatorLog?.length) {
      const day=new Date(Date.now()-86400000).toISOString().slice(0,10);
      try {await this.checkpoint(day);this.data.operatorLogHealth="DAILY_ROOT_PREPARED";}
      catch {this.data.operatorLogHealth="CHECKPOINT_UNAVAILABLE";}
    }
    if (this.data.pushQueue.length) {
      const job = this.data.pushQueue[0];
      try {
        const client = await this.appClient(job.installationId, job.repositoryId);
        await client.authorize(job.repository, job.repositoryId);
        this.data.pushObservations[job.id] ||= await require("./landing").pushed(client, job, ledger.area(this.store).records);
        this.data.pushQueue.shift(); this.save();
      } catch { /* Preserve the unobserved range for retry. */ }
    }
    if (this.data.landingQueue.length && Date.now() >= (this.data.landingRetries[this.data.landingQueue[0]]?.retryAt || 0)) {
      const id = this.data.landingQueue[0];
      const record = ledger.area(this.store).records.find(r => r.recordId === id) || this.archive?.mergeRecord(id);
      try {
        if (record) {
          const client = await this.appClient(record.installationId, record.repositoryId);
          await client.authorize(record.repository, record.repositoryId);
          const observation = await require("./landing").resolve(client, record);
          const payload = Buffer.from(JSON.stringify(require("./common").canonical(observation.attestation)));
          observation.envelope = { payloadType: "application/vnd.in-toto+json", payload: payload.toString("base64"), signatures: this.receiptSigner ? [await this.receiptSigner(require("./bundle").pae("application/vnd.in-toto+json", payload))] : [] };
          this.archive?.landing(record,observation);
          const observationId = require("./common").hash(observation);
          this.data.landingObservations[observationId] = observation;
          if(!this.data.landings[id] && record.proof?.receiptSnapshot?.verdict === "VERIFIED" && observation.ruleSuite.value?.result === "fail") this.data.frontierMetrics.ruleSuiteDisagreements++;
          this.data.landings[id] = { ...observation, observationId };
          if (observation.ruleSuite.state !== "AVAILABLE" || observation.reason === "LANDED_CONTENT_UNAVAILABLE") {
            const retry = this.data.landingRetries[id] ||= { attempts: 0 };
            if (++retry.attempts < 3) { retry.retryAt = Date.now() + 30000; throw Object.assign(Error(), { code: "LANDING_RETRY" }); }
          }
        }
        this.data.landingQueue.shift();
      } catch { /* bounded by normal drain cadence; keep pending for reconciliation */ }
      this.save();
    }
    try {
      if(this.meter) { await this.activateNext(); await this.trialNotices(); }
    } catch { this.data.trialNoticeHealth="RETRY_PENDING"; this.save(); }
    if (!this.data.queue.length) { this.draining=false; return; }
    const job = this.data.queue[0];
    if (job.retryAt && Date.now() < job.retryAt) { this.draining = false; return; }
    try {
      job.processing = true;
      this.save();
      const client = await this.appClient(job.installationId, job.repositoryId);
      await client.authorize(job.repo, job.repositoryId);
      if (this.meter && !this.meter.usage(job.installationId).automationAllowed) {
        // Safety notice only: no collection, receipt or passing enforcing result at expiry.
        if(this.config.publishChecks) {
          const pull=await client.get(`/repos/${job.repo}/pulls/${job.pr}`);
          const usage=this.meter.usage(job.installationId);
          const heads=[pull.head.sha,job.mergeGroup?.head_sha].filter((x,i,a)=>x&&a.indexOf(x)===i);
          for(const head_sha of heads) await client.request(`/repos/${job.repo}/check-runs`,{method:"POST",body:{name:require("./check").NAME,head_sha,status:"completed",conclusion:policies.normalize(this.policyFor(job.repositoryId)).enforced?"failure":"neutral",details_url:this.config.origin+"/proof/",output:{title:"Hosted access ended — proof paused",summary:"Paused-access notice, not a new proof. "+usage.notice+` Continue: ${this.config.origin}/proof/`}}});
        }
        throw Object.assign(new Error("TRIAL_EXPIRED"),{code:"TRIAL_EXPIRED"});
      }
      await this.retractChecks(client, job.repositoryId, job.pr);
      const previousRow = this.data.receipts[this.data.subscriptions[`${job.repositoryId}:${job.pr}`]?.latestReceiptId];
      const areas = job.claims ? currentness.areas(job.claims) : null;
      if (previousRow && previousRow.artifacts?.policy?.codeDigest === require("./bundle").codeDigest()) {
        const eventStart = this.activeEvents;
        const c = await this.exclusive(() => collect(client, job.repo, job.pr, { previous: previousRow.receipt.evidence,
          areas: this.config.enhancedPolicy && areas ? [...new Set([...areas, "rules"])] : areas,
          mergeGroup: job.mergeGroup, executionPolicyReader: this.enhanced.reader(job.installationId, client) }));
        const current = freshness(previousRow.receipt, c);
        if (current.state === "CURRENT" && previousRow.receipt.evidence.consistency === "STABLE_OBSERVATION" && !eventStart.some(e => e.repo === job.repo.toLowerCase() && currentness.touches(e.event, e.payload, c).length)) {
          previousRow.current = current;
          const reconciledSub = this.data.subscriptions[`${job.repositoryId}:${job.pr}`];
          if (reconciledSub) { reconciledSub.reconciledAt = Date.now(); reconciledSub.refreshState = "CURRENT"; }
          if (this.config.publishChecks) await require("./check").publish(client, previousRow.receipt, current, this.config.origin, this.gateFor(previousRow.receipt, current), async (on, gate) => {
            if (Number.isSafeInteger(on.id)) (previousRow.checkIds ||= []).push(on.id);
            previousRow.publishedAt = new Date().toISOString(); previousRow.publishedGate = gate;
            this.save(); await this.retractChecks(client, job.repositoryId, job.pr, previousRow.receipt.receiptId);
            assert(previousRow.current.state === "CURRENT", "CHECK_RECONCILIATION_PENDING");
          });
          this.data.queue.shift();
          this.save();
          return;
        }
        previousRow.current = current;
        await this.retractChecks(client,job.repositoryId,job.pr,previousRow.receipt.receiptId);
      }

      const out = await this.run(job.repo, job.pr, {
        client,
        mergeGroup: job.mergeGroup,
        installationId: job.installationId,
      });
      if (job.reconciled) { this.data.receipts[out.receipt.receiptId].issuanceReason = "RECONCILED"; this.data.frontierMetrics.reconciliationSupersessions++; }
      if (this.config.publishChecks) {
        try {
          const check = await require("./check").publish(
            client,
            out.receipt,
            out.current,
            this.config.origin,
            this.gateFor(out.receipt, this.data.receipts[out.receipt.receiptId].current),
            async (on, publishedGate) => {
              const row = this.data.receipts[out.receipt.receiptId];
              if (Number.isSafeInteger(on.id)) {
                row.publishedGate = publishedGate;
                row.publishedAt = new Date().toISOString();
                row.checkId ||= on.id;
                (row.checkIds ||= []).push(on.id);
                (row.checkOn ||= []).push(on);
                this.save();
              }
              // A signed event or policy change can arrive during the POST.
              await this.retractChecks(client, job.repositoryId, job.pr, out.receipt.receiptId);
            },
            this.remediationFor(out.receipt, this.data.receipts[out.receipt.receiptId].current),
            this.meter ? this.meter.usage(job.installationId).notice + ` Continue: ${this.config.origin}/proof/` : "",
          );
          if (Number.isSafeInteger(check?.id)) {
            const row = this.data.receipts[out.receipt.receiptId];
            row.checkId = check.id;
            row.checkIds = check.checkIds?.length ? check.checkIds : [check.id];
            row.checkOn = check.published || null;
          }
        } catch {
          this.data.receipts[out.receipt.receiptId].checkDelivery =
            "UNAVAILABLE";
          throw Object.assign(new Error("Check publication must retry"), { code: "CHECK_RECONCILIATION_PENDING" });
        }
      }
      const sub = this.data.subscriptions[`${job.repositoryId}:${job.pr}`];
      if (sub) { sub.latestReceiptId = out.receipt.receiptId; sub.refreshState="CURRENT"; sub.reconciledAt=Date.now(); }
      if(this.meter) require("./events").record(this.store,"automatic_proof",out.receipt.receiptId,{account:this.meter.data.installations[job.installationId].account,receiptId:out.receipt.receiptId,verdict:out.receipt.verdict});
      if(out.receipt.evidence.consistency !== "STABLE_OBSERVATION") throw Object.assign(Error("Stable observation required"),{code:"EVIDENCE_RECHECK_REQUIRED"});
      this.data.queue.shift();
    } catch (error) {
      if (["ALLOWANCE_EXHAUSTED", "TRIAL_EXPIRED"].includes(error.code)) {
        this.data.queue.shift();
        const sub = this.data.subscriptions[`${job.repositoryId}:${job.pr}`];
        if (sub) sub.refreshState = error.code;
        return;
      }
      // Preserve a failed gate update for retry instead of leaving an old pass forever.
      if (error.code === "CHECK_RECONCILIATION_PENDING") { job.retryAt = Date.now() + 30000; return; }
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts >= 3) {
        this.data.queue.shift();
        const sub = this.data.subscriptions[`${job.repositoryId}:${job.pr}`];
        if (sub) {sub.refreshState = "UNAVAILABLE";sub.refreshReason = error.code || "PROOF_PROCESSING_UNAVAILABLE";}
      }
    } finally {
      job.processing = false;
      this.save();
      this.draining = false;
    }
    } finally { this.draining = false; }
  }
}
module.exports = { ProofService };
