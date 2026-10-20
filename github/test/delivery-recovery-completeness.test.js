"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHmac } = require("node:crypto");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { fixtureFetch, H } = require("./fixtures");

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-recovery-"));
  let store = new Store(root), status = 200, posts = 0, includeDelivery = true;
  const config = { origin: "http://127.0.0.1", appId: 42, privateKey: "fixture-never-used", webhookSecret: "s".repeat(40) };
  const deliveryClient = () => new Client({ fetchImpl: async (_url, init) => {
    if (init.method === "POST") { posts++; return new Response(null, { status: 202 }); }
    return Response.json(includeDelivery ? [{ id: 22, guid: "missing-delivery", event: "pull_request", status_code: status }] : []);
  } });
  const make = () => new Client(fixtureFetch());
  let service = new ProofService({ store, config, deliveryClient, clientFactory: make, appClient: async () => make() });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return {
    get service() { return service; },
    posts: () => posts,
    setStatus: value => { status = value; },
    includeDelivery: value => { includeDelivery = value; },
    restart() {
      store.close(); store = new Store(root);
      service = new ProofService({ store, config, deliveryClient, clientFactory: make, appClient: async () => make() });
      return service;
    },
    async receive() {
      const raw = Buffer.from(JSON.stringify({ installation: { id: 2 }, repository: { id: 1, full_name: "fixture/public" }, pull_request: { number: 1, state: "open", head: { sha: H } } }));
      return service.webhook(raw, { "x-github-delivery": "missing-delivery", "x-github-event": "pull_request", "x-hub-signature-256": "sha256=" + createHmac("sha256", config.webhookSecret).update(raw).digest("hex") });
    },
  };
}

test("HTTP 202 redelivery without a received webhook never reports complete provider history", async t => {
  const h = harness(t), s = h.service;
  const out = await s.run("fixture/public", 1, { installationId: 2 });
  // Ensure traversal finishes after the issued receipt, so time ordering is not the reason for incompleteness.
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryRecoveryPending["missing-delivery"].state, "ACCEPTED");
  a.equal(s.data.deliveryHealth, "RECOVERY_PENDING");
  const projected = s.mergeTruth(s.data.receipts[out.receipt.receiptId]);
  a.equal(projected.reconciliation.coverage, "INCOMPLETE");
  a.notEqual(projected.reconciliation.state, "RECONCILED");
  const restored = h.restart();
  a.equal(restored.data.deliveryHealth, "RECOVERY_PENDING");
  a.equal(restored.data.deliveryRecoveryPending["missing-delivery"].state, "ACCEPTED");
});

test("delayed signed recovery prompts a fresh traversal before declaring reconciled", async t => {
  const h = harness(t), s = h.service;
  await s.reconcileDeliveries();
  await h.receive();
  a.equal(s.data.deliveryRecoveries["missing-delivery"].confirmed, true);
  a.equal(s.data.deliveryRecoveryPending["missing-delivery"], undefined);
  a.notEqual(s.data.deliveryHealth, "RECONCILED");
  a.equal(s.data.deliveryScanAt, 0, "receipt of delayed recovery schedules an immediate traversal");
  await s.reconcileDeliveries();
  a.equal(s.data.deliveryHealth, "RECONCILED");
  a.equal(h.posts(), 1);
  a.equal((await h.receive()).duplicate, true);
});

test("an unreceived recovery cannot become reconciled just because the provider retention window elapsed", async t => {
  const h = harness(t), s = h.service;
  await s.reconcileDeliveries();
  const requestedAt = s.data.deliveryRecoveryPending["missing-delivery"].requestedAt;
  h.includeDelivery(false);
  await s.reconcileDeliveries(Date.now() + 31 * 86400000);
  a.equal(s.data.deliveryHealth, "RECOVERY_PENDING");
  a.equal(s.data.deliveryRecoveryPending["missing-delivery"].state, "EXPIRED");
  a.equal(s.data.deliveryRecoveryPending["missing-delivery"].requestedAt, requestedAt);
});

test("legacy stored RECONCILED cannot override an unresolved recovery on restart", async t => {
  const h = harness(t), s = h.service;
  s.data.deliveryRecoveryPending["missing-delivery"] = { event: "pull_request", requestedAt: new Date().toISOString(), state: "ACCEPTED" };
  s.data.deliveryHealth = "RECONCILED";
  s.save();
  a.equal(h.restart().data.deliveryHealth, "RECOVERY_PENDING");
});
