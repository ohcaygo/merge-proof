"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHmac } = require("node:crypto");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { fixtureFetch, H } = require("./fixtures");

function harness(t, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-review-fixes-"));
  let store = new Store(root), service, options = {}, postStatus = 202, rowStatus = 200, include = true, event = "pull_request", onPost;
  const settings = { origin: "http://127.0.0.1", appId: 42, privateKey: "unused-fixture", webhookSecret: "s".repeat(40), ...config };
  const make = () => new Client(fixtureFetch(options));
  const deliveryClient = () => new Client({ fetchImpl: async (_url, init) => {
    if (init.method === "POST") {
      if (onPost) await onPost();
      return new Response(null, { status: postStatus });
    }
    if (h.onGet) return h.onGet(_url);
    return Response.json(include ? [{ id: 22, guid: "requested-event", event, status_code: rowStatus }] : []);
  } });
  const boot = () => new ProofService({ store, config: settings, deliveryClient, clientFactory: make, appClient: async () => {
    const client = make(), request = client.request.bind(client);
    client.request = async (p, o) => {
      if (o?.method === "PATCH" && h.onPatch) { await h.onPatch(p, o); return {}; }
      return request(p, o);
    };
    return client;
  } });
  const h = {
    get service() { return service; }, root,
    rowStatus: value => { rowStatus = value; }, postStatus: value => { postStatus = value; }, include: value => { include = value; },
    event: value => { event = value; }, options: value => { options = value; },
    onPost: value => { onPost = value; }, onPatch: null, onGet: null,
    restart() { store.close(); store = new Store(root); service = boot(); return service; },
    receive(payload, eventName = event, guid = "requested-event", validSignature = true) {
      const raw = Buffer.from(JSON.stringify(payload));
      return service.webhook(raw, { "x-github-delivery": guid, "x-github-event": eventName,
        "x-hub-signature-256": "sha256=" + createHmac("sha256", validSignature ? settings.webhookSecret : "wrong").update(raw).digest("hex") });
    },
  };
  service = boot();
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return h;
}

for (const repeatStatus of [503, 202]) test(`F1 repeat request ${repeatStatus} preserves original unresolved obligation through restart and retention`, async t => {
  const h = harness(t), s = h.service;
  const out = await s.run("fixture/public", 1, { installationId: 2 });
  const now = Date.now();
  await s.reconcileDeliveries(now);
  const original = structuredClone(s.data.deliveryRecoveryPending["requested-event"]);
  h.postStatus(repeatStatus);
  await s.reconcileDeliveries(now + 5 * 3600000);
  a.ok(s.data.deliveryRecoveryPending["requested-event"], "repeat failure must not erase accepted recovery");
  a.equal(s.data.deliveryRecoveryPending["requested-event"].requestedAt, original.requestedAt);
  a.equal(s.data.deliveryRecoveryPending["requested-event"].state, "ACCEPTED");
  const restored = h.restart(); h.include(false);
  await restored.reconcileDeliveries(now + 31 * 86400000);
  a.equal(restored.data.deliveryRecoveryPending["requested-event"].state, "EXPIRED");
  a.equal(restored.data.deliveryHealth, "RECOVERY_PENDING");
  a.equal(restored.mergeTruth(restored.data.receipts[out.receipt.receiptId]).reconciliation.coverage, "INCOMPLETE");
  a.deepEqual(restored.data.events, {});
});

test("F1 first rejected request preserves the missing-event obligation through restart and retention", async t => {
  const h = harness(t), s = h.service;
  const out = await s.run("fixture/public", 1, { installationId: 2 });
  const now = Date.now();
  h.postStatus(503);
  await s.reconcileDeliveries(now);
  a.equal(s.data.deliveryHealth, "UNAVAILABLE");
  a.deepEqual(s.data.events, {});
  a.equal(s.data.deliveryRecoveries["requested-event"], undefined);
  const restored = h.restart(); h.include(false);
  await restored.reconcileDeliveries(now + 31 * 86400000);
  a.equal(restored.mergeTruth(restored.data.receipts[out.receipt.receiptId]).reconciliation.coverage, "INCOMPLETE");
  a.equal(restored.data.deliveryHealth, "RECOVERY_PENDING");
  a.equal(restored.data.deliveryRecoveryPending["requested-event"].state, "EXPIRED");
  a.equal(restored.data.deliveryRecoveryPending["requested-event"].requestedAt, new Date(now).toISOString());
  a.deepEqual(restored.data.events, {});
  a.equal(restored.data.deliveryRecoveries["requested-event"], undefined);
});

test("F2 drain invalidates and persists all same-head siblings before failed PATCH and retries after restart", async t => {
  const h = harness(t, { publishChecks: true }), s = h.service;
  s.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  const rows = [];
  for (const id of [900, 901]) {
    const out = await s.run("fixture/public", 1, { installationId: 2 });
    const row = s.data.receipts[out.receipt.receiptId];
    row.checkId = id; row.checkIds = [id]; row.publishedGate = structuredClone(row.gate);
    rows.push(row);
  }
  const originals = rows.map(r => JSON.stringify(r.receipt));
  const sub = { repo: "fixture/public", repositoryId: 1, pr: 1, installationId: 2,
    latestReceiptId: rows[1].receipt.receiptId, reconciledAt: Date.now() };
  s.data.subscriptions["1:1"] = sub; s.data.queue.push({ ...sub, reconciled: true });
  s.save();
  h.options({ mutate: (p, v) => { if (p.endsWith("/check-runs")) v.check_runs[0].conclusion = "failure"; return v; } });
  h.include(false);
  let patches = 0;
  const boundaryErrors = [];
  h.onPatch = async () => {
    patches++;
    // Inspect a separately opened durable Store at the external-write boundary.
    const disk = new Store(h.root);
    try {
      for (const row of rows) {
        const saved = disk.data.github.receipts[row.receipt.receiptId];
        a.equal(saved.current.state, "STALE");
        a.equal(saved.gate.conclusion, "failure");
        a.ok(disk.data.github.retractionQueue.some(q => q.receiptId === row.receipt.receiptId));
      }
    } catch (error) { boundaryErrors.push(error.message); }
    finally { disk.close(); }
    throw Error("fixture PATCH unavailable");
  };
  await s.drain();
  a.deepEqual(boundaryErrors, []);
  a.ok(patches > 0);
  for (const [i, row] of rows.entries()) {
    a.equal(row.current.state, "STALE"); a.equal(row.gate.conclusion, "failure");
    a.equal(row.publishedGate.conclusion, "success");
    a.equal(JSON.stringify(row.receipt), originals[i]);
  }
  a.equal(s.data.retractionQueue.length, 2);
  a.ok(s.data.queue[0].retryAt > Date.now());
  const restored = h.restart();
  a.equal(restored.data.retractionQueue.length, 2);
  h.onPatch = async () => {};
  for (let i = 0; i < 2; i++) {
    restored.data.retractionQueue[0].retryAt = 0;
    await restored.drain();
  }
  a.equal(restored.data.retractionQueue.length, 0);
  for (const row of rows) {
    const saved = restored.data.receipts[row.receipt.receiptId];
    a.equal(saved.gate.conclusion, "failure"); a.equal(saved.publishedGate.conclusion, "failure");
  }
});

const scope = { installation: { id: 2 }, repository: { id: 1, full_name: "fixture/public" } };
const genericEvents = [
  ["push", { ...scope, ref: "refs/heads/main", before: "a".repeat(40), after: H, commits: [] }],
  ["repository_ruleset", { ...scope, action: "edited" }],
  ["branch_protection_rule", { ...scope, action: "edited" }],
  ["repository_ruleset", { installation: { id: 2 }, organization: { login: "fixture" }, action: "edited" }],
  ["check_run", { ...scope, check_run: { app: { id: 42 } } }],
  ["check_suite", { ...scope, check_suite: { app: { id: 42 } } }],
  ["installation", { action: "created", installation: { id: 2, account: { id: 3 } }, repositories: [] }, true],
  ["installation_repositories", { ...scope, repositories_added: [], repositories_removed: [] }, true],
];
for (const [event, payload, hosted] of genericEvents) test(`F3 applied ${event} ${payload.organization ? "organization" : "repository"} completes generic recovery without a PR RECOVERED claim`, async t => {
  const h = harness(t, { hosted: !!hosted }); h.event(event);
  if (hosted) h.service.meter.connect(2, 3);
  await h.service.reconcileDeliveries();
  let s = h.restart();
  await h.receive(payload);
  a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
  a.equal(s.data.deliveryRecoveries["requested-event"], undefined);
  a.notEqual(s.data.deliveryHealth, "RECONCILED");
  a.equal(s.data.deliveryScanAt, 0);
  a.equal((await h.receive(payload)).duplicate, true);
  s = h.restart();
  a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryHealth, "RECONCILED");
});

test("F3 failed application, bad signature and wrong event never discharge pending or poison retry deduplication", async t => {
  const h = harness(t), s = h.service;
  await s.reconcileDeliveries();
  const valid = { ...scope, pull_request: { number: 1, state: "open", head: { sha: H } } };
  await a.rejects(h.receive(valid, "pull_request", "requested-event", false));
  a.ok(s.data.deliveryRecoveryPending["requested-event"]);
  await a.rejects(h.receive({ ...valid, pull_request: { ...valid.pull_request, number: -1 } }));
  a.ok(s.data.deliveryRecoveryPending["requested-event"]);
  a.equal(s.data.events["requested-event"], undefined, "failed application cannot be treated as a completed duplicate");
  await h.receive({ ...scope, ref: "refs/heads/main", after: H }, "push");
  a.ok(s.data.deliveryRecoveryPending["requested-event"], "event mismatch remains unresolved");
  // A fresh GUID tests successful retry after failed application independently of the mismatch.
  s.data.deliveryRecoveryPending.retry = { event: "pull_request", requestedAt: new Date().toISOString(), state: "ACCEPTED" };
  await a.rejects(h.receive({ ...valid, pull_request: { number: -1, state: "open" } }, "pull_request", "retry"));
  a.equal((await h.receive(valid, "pull_request", "retry")).accepted, true);
  a.equal(s.data.deliveryRecoveryPending.retry, undefined);
  a.equal(s.data.deliveryRecoveries.retry.confirmed, true);
});

for (const timing of ["in-flight", "expired"]) test(`F3 ${timing} signed generic delivery completes obligation and still requires traversal`, async t => {
  const h = harness(t), s = h.service; h.event("push");
  const payload = genericEvents[0][1];
  if (timing === "in-flight") h.onPost(() => h.receive(payload));
  await s.reconcileDeliveries();
  if (timing === "expired") {
    h.include(false);
    await s.reconcileDeliveries(Date.now() + 31 * 86400000);
    a.equal(s.data.deliveryRecoveryPending["requested-event"].state, "EXPIRED");
    await h.receive(payload);
  }
  a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
  a.equal(s.data.deliveryRecoveries["requested-event"], undefined);
  a.equal(s.data.deliveryScanAt, 0);
  a.equal(s.data.deliveryHealth, "RECOVERY_PENDING");
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryHealth, "RECONCILED");
});

for (const [event, payload, hosted] of genericEvents) test(`F3 requested duplicate ${event} ${payload.organization ? "organization" : "repository"} is reapplied before discharge`, async t => {
  const h = harness(t, { hosted: !!hosted }); h.event(event);
  if (hosted) h.service.meter.connect(2, 3);
  await h.receive(payload);
  h.rowStatus(500);
  await h.service.reconcileDeliveries();
  a.equal(h.service.data.deliveryRecoveryPending["requested-event"].state, "ACCEPTED");
  const s = h.restart();
  await h.receive(payload);
  a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
  a.equal(s.data.deliveryRecoveries["requested-event"], undefined);
  a.equal(s.data.deliveryScanAt, 0);
  a.equal((await h.receive(payload)).duplicate, true);
  h.rowStatus(200);
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryHealth, "RECONCILED");
});

const recoveryPR = { ...scope, pull_request: { number: 1, state: "open", head: { sha: H } } };
for (const [event, payload] of [["pull_request", recoveryPR], genericEvents[0]]) {
  test(`R1 ${event} in-flight application requires a subsequent fresh traversal`, async t => {
    const h = harness(t), s = h.service; h.event(event);
    const out = await s.run("fixture/public", 1, { installationId: 2 });
    const issued = JSON.stringify(out.receipt);
    h.onPost(() => h.receive(payload));
    await s.reconcileDeliveries();
    a.equal(s.data.deliveryHealth, "RECOVERY_PENDING");
    a.equal(s.data.deliveryScanAt, 0);
    a.equal(s.data.deliveryScan, undefined);
    a.notEqual(s.mergeTruth(s.data.receipts[out.receipt.receiptId]).reconciliation.coverage, "COMPLETE");
    h.onPost(null);
    await s.reconcileDeliveries();
    a.equal(s.data.deliveryHealth, "RECONCILED");
    a.equal(JSON.stringify(s.data.receipts[out.receipt.receiptId].receipt), issued);
    a.equal(Boolean(s.data.deliveryRecoveries["requested-event"]), event === "pull_request");
  });
  test(`R1 ${event} page shift after application and restart cannot reuse the old page-two cursor`, async t => {
    const h = harness(t), s = h.service; h.event(event);
    const out = await s.run("fixture/public", 1, { installationId: 2 });
    const old = Array.from({ length: 100 }, (_, i) => ({ id: i + 1,
      guid: i ? `ping-${i}` : "requested-event", event: i ? "ping" : event, status_code: 200 }));
    const reads = [], posts = [];
    h.onPost(() => { posts.push("request"); });
    h.onGet = url => { reads.push(url); return url.includes("page=2") ? new Response(null, { status: 503 }) :
      Response.json(old, { headers: { link: '<https://api.github.com/app/hook/deliveries?per_page=100&page=2>; rel="next"' } }); };
    await s.reconcileDeliveries();
    a.ok(s.data.deliveryScan?.endpoint.includes("page=2"));
    await h.receive(payload);
    // A real page-one event is now shifted ahead of the unchanged old tail.
    const restored = h.restart();
    h.onGet = url => { reads.push(url); return url.includes("page=2") ? Response.json([old.at(-1)]) :
      Response.json([{ id: 102, guid: "new-unreceived", event: "push", status_code: 200 }, ...old.slice(0, 99)],
        { headers: { link: '<https://api.github.com/app/hook/deliveries?per_page=100&page=2>; rel="next"' } }); };
    await restored.reconcileDeliveries();
    a.ok(restored.data.deliveryRecoveryPending["new-unreceived"], "fresh page one must discover the new missing event");
    a.equal(posts.length, 2);
    a.ok(!reads[2].includes("page=2"), "restart must read page one");
    a.equal(restored.data.deliveryScan, undefined);
    a.equal(restored.data.events["new-unreceived"], undefined);
    a.equal(restored.mergeTruth(restored.data.receipts[out.receipt.receiptId]).reconciliation.coverage, "INCOMPLETE");
    a.equal(restored.data.deliveryHealth, "RECOVERY_PENDING");
  });
}

for (const postStatus of [202, 503]) test(`R2 historical confirmation cannot discharge new request ${postStatus} across restart`, async t => {
  const h = harness(t), s = h.service;
  await s.reconcileDeliveries(); await h.receive(recoveryPR); await s.reconcileDeliveries();
  const historical = structuredClone(s.data.deliveryRecoveries["requested-event"]);
  a.equal(historical.confirmed, true);
  const restored = h.restart(); h.rowStatus(500); h.postStatus(postStatus);
  await restored.reconcileDeliveries(Date.now() + 5 * 3600000);
  a.ok(restored.data.deliveryRecoveryPending["requested-event"], "new POST without fresh application cannot reuse historical confirmation");
  a.deepEqual(restored.data.deliveryRecoveries["requested-event"], historical);
  a.notEqual(restored.data.deliveryHealth, "RECONCILED");
  const again = h.restart();
  a.ok(again.data.deliveryRecoveryPending["requested-event"]);
  await a.rejects(h.receive(recoveryPR, "pull_request", "requested-event", false));
  await a.rejects(h.receive({ ...recoveryPR, pull_request: { state: "open", number: -1 } }));
  a.ok(again.data.deliveryRecoveryPending["requested-event"], "failed duplicate reapplication cannot discharge");
  await h.receive(recoveryPR);
  a.equal(again.data.deliveryRecoveryPending["requested-event"], undefined);
  a.equal(again.data.deliveryRecoveries["requested-event"].confirmed, postStatus === 202);
  h.rowStatus(200); h.postStatus(202);
  await again.reconcileDeliveries();
  a.equal(again.data.deliveryHealth, "RECONCILED");
  a.equal((await h.receive(recoveryPR)).duplicate, true);
});

for (const [event, payload] of [["pull_request", recoveryPR], genericEvents[0]]) {
  for (const postStatus of [202, 503]) {
    for (const retry of [false, true]) test(`R2 ${event} ${retry ? "repeat" : "initial"} in-flight application with POST ${postStatus} preserves receipt versus acceptance`, async t => {
      const h = harness(t), s = h.service; h.event(event);
      if (retry) {
        await s.reconcileDeliveries();
        a.equal(s.data.deliveryRecoveryPending["requested-event"].state, "ACCEPTED");
      }
      h.postStatus(postStatus);
      let applied = 0;
      h.onPost(async () => { await h.receive(payload); applied++; });
      await s.reconcileDeliveries(Date.now() + (retry ? 5 * 3600000 : 0));
      a.equal(applied, 1);
      a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined, "POST response cannot recreate genuinely applied work");
      a.equal(s.data.deliveryScan, undefined);
      a.notEqual(s.data.deliveryHealth, "RECONCILED");
      a.equal(Boolean(s.data.deliveryRecoveries["requested-event"]?.confirmed), event === "pull_request" && postStatus === 202,
        "failed current POST cannot inherit earlier request acceptance");
      const restored = h.restart();
      a.equal(restored.data.deliveryRecoveryPending["requested-event"], undefined);
      a.equal((await h.receive(payload)).duplicate, true);
      h.onPost(null); h.rowStatus(200);
      await restored.reconcileDeliveries(Date.now() + 10 * 3600000);
      a.equal(restored.data.deliveryHealth, "RECONCILED");
    });
  }
  test(`R2 ${event} partial duplicate reapplication preserves obligation and retries after restart`, async t => {
    const h = harness(t), s = h.service; h.event(event);
    const out = await s.run("fixture/public", 1, { installationId: 2 });
    const issued = JSON.stringify(out.receipt);
    await s.reconcileDeliveries(); await h.receive(payload); await s.reconcileDeliveries();
    h.rowStatus(500);
    await s.reconcileDeliveries(Date.now() + 5 * 3600000);
    const pending = structuredClone(s.data.deliveryRecoveryPending["requested-event"]);
    a.ok(pending);
    // Fail after real routing has already made partial mutable changes. An old
    // GUID/application marker is not proof that this reapplication completed.
    const route = s.routeEvent.bind(s);
    s.routeEvent = (...args) => { route(...args); throw Error("fixture partial application"); };
    await a.rejects(h.receive(payload), /fixture partial application/);
    a.deepEqual(s.data.deliveryRecoveryPending["requested-event"], pending);
    const restored = h.restart();
    a.deepEqual(restored.data.deliveryRecoveryPending["requested-event"], pending);
    a.equal((await h.receive(payload)).accepted, true);
    a.equal(restored.data.deliveryRecoveryPending["requested-event"], undefined);
    a.equal(JSON.stringify(restored.data.receipts[out.receipt.receiptId].receipt), issued);
    a.equal((await h.receive(payload)).duplicate, true);
    h.rowStatus(200);
    await restored.reconcileDeliveries();
    a.equal(restored.data.deliveryHealth, "RECONCILED");
  });
  test(`R1 ${event} delayed receipt during GET cannot resurrect an interrupted cursor`, async t => {
    const h = harness(t), s = h.service; h.event(event);
    await s.reconcileDeliveries();
    h.onGet = async url => {
      if (url.includes("page=2")) return new Response(null, { status: 503 });
      await h.receive(payload);
      return Response.json([{ id: 22, guid: "requested-event", event, status_code: 200 }],
        { headers: { link: '<https://api.github.com/app/hook/deliveries?per_page=100&page=2>; rel="next"' } });
    };
    await s.reconcileDeliveries(Date.now() + 5 * 3600000);
    a.equal(s.data.deliveryScan, undefined);
    a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
    a.notEqual(s.data.deliveryHealth, "RECONCILED");
    const restored = h.restart(); h.onGet = null;
    await restored.reconcileDeliveries(Date.now() + 10 * 3600000);
    a.equal(restored.data.deliveryHealth, "RECONCILED");
  });
}

test("F3 generic receipt during interrupted traversal discards the old cursor across restart", async t => {
  const h = harness(t), s = h.service; h.event("push");
  h.onGet = url => url.includes("page=2") ? new Response(null, { status: 503 }) :
    Response.json([{ id: 22, guid: "requested-event", event: "push", status_code: 200 }],
      { headers: { link: '<https://api.github.com/app/hook/deliveries?per_page=100&page=2>; rel="next"' } });
  h.onPost(() => h.receive(genericEvents[0][1]));
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryRecoveryPending["requested-event"], undefined);
  a.equal(s.data.deliveryHealth, "UNAVAILABLE");
  a.equal(s.data.deliveryScan, undefined, "receipt requires a new traversal, not resuming a cursor from before application");
  const restored = h.restart();
  a.equal(restored.data.deliveryScan, undefined);
  h.onGet = null; h.rowStatus(200); h.onPost(null);
  await restored.reconcileDeliveries(Date.now() + 5 * 3600000);
  a.equal(restored.data.deliveryHealth, "RECONCILED");
});
