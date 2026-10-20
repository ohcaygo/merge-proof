"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { publish } = require("../check");
const { fixtureFetch, H, OLD } = require("./fixtures");

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-invalidate-"));
  let store = new Store(root), options = {}, failWrites = false;
  const writes = [];
  const make = () => new Client(fixtureFetch(options));
  const settings = { origin: "http://127.0.0.1", appId: 42, publishChecks: true };
  const appClient = async () => {
    const client = make();
    const request = client.request.bind(client);
    client.request = async (p, o) => {
      if (o?.method === "PATCH") {
        if (failWrites) throw Error("fixture provider unavailable");
        writes.push(o.body);
        return {};
      }
      return request(p, o);
    };
    return client;
  };
  let service = new ProofService({ store, config: settings, clientFactory: make, appClient });
  // Local fixture repository has explicitly opted into an enforcing policy.
  service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return {
    get service() { return service; },
    set: value => { options = value; },
    failWrites: value => { failWrites = value; },
    writes,
    restart() {
      store.close(); store = new Store(root);
      service = new ProofService({ store, config: settings, clientFactory: make, appClient });
      return service;
    },
    async successfulPublishedReceipt() {
      const out = await service.run("fixture/public", 1, { installationId: 2 });
      const row = service.data.receipts[out.receipt.receiptId];
      a.equal(row.receipt.verdict, "VERIFIED");
      const result = await publish({ request: async () => ({ id: 900 }) },
        row.receipt, row.current, settings.origin, service.gateFor(row.receipt, row.current));
      row.checkId = result.id;
      row.checkIds = result.checkIds;
      row.publishedGate = structuredClone(row.gate);
      service.save();
      return row;
    },
  };
}

const failedCheck = { mutate: (p, v) => {
  if (p.endsWith("/check-runs")) v.check_runs[0].conclusion = "failure";
  return v;
} };

test("same-head contradictory collection invalidates old clearance and durably queues publication retraction", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  const original = JSON.stringify(old.receipt), id = old.receipt.receiptId;
  h.set(failedCheck);
  const next = await h.service.run("fixture/public", 1, { installationId: 2 });
  a.equal(next.receipt.verdict, "FAIL");
  a.equal(next.receipt.identity.headSha, H);
  a.equal(old.current.state, "STALE");
  a.ok(old.current.changed.includes("CI_EXECUTED"));
  a.equal(old.gate.conclusion, "failure");
  a.equal(old.publishedGate.conclusion, "success", "retain the historical publication until a real update succeeds");
  a.equal(JSON.stringify(old.receipt), original);
  a.equal(h.service.data.retractionQueue.filter(q => q.receiptId === id).length, 1);
  const restored = h.restart();
  a.equal(restored.data.receipts[id].current.state, "STALE");
  a.equal(restored.data.receipts[id].gate.conclusion, "failure");
  a.equal(restored.data.retractionQueue[0].receiptId, id);
  await restored.drain();
  a.equal(h.writes[0].conclusion, "failure");
  a.equal(restored.data.receipts[id].publishedGate.conclusion, "failure", "record the confirmed retraction, not an obsolete published success");
  a.ok(Number.isFinite(Date.parse(restored.data.receipts[id].publishedAt)));
  a.equal(h.service.data.retractionQueue.length, 0);
});

test("receipt refresh invalidates every affected same-scope receipt, not only the requested one", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  const second = await h.service.run("fixture/public", 1, { installationId: 2 });
  const secondRow = h.service.data.receipts[second.receipt.receiptId];
  h.set(failedCheck);
  const response = await h.service.read(second.receipt.receiptId, "fixture", { refresh: true });
  a.equal(response.current.state, "STALE");
  a.equal(old.current.state, "STALE");
  a.equal(old.gate.conclusion, "failure");
  a.equal(secondRow.gate.conclusion, "failure");
  a.equal(h.service.data.retractionQueue[0].receiptId, old.receipt.receiptId);
});

test("known contradiction remains invalidated when successor signing fails", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  h.set(failedCheck);
  h.service.receiptSigner = async () => { throw Error("fixture signing unavailable"); };
  await a.rejects(h.service.run("fixture/public", 1, { installationId: 2 }), /signing unavailable/);
  a.equal(old.current.state, "STALE");
  a.equal(old.gate.conclusion, "failure");
  const restored = h.restart();
  a.equal(restored.data.receipts[old.receipt.receiptId].current.state, "STALE");
  a.equal(restored.data.retractionQueue[0].receiptId, old.receipt.receiptId);
});

test("identical evidence and unrelated check changes do not invalidate a supported receipt", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  await h.service.run("fixture/public", 1, { installationId: 2 });
  h.set({ mutate: (p, v) => {
    if (p.endsWith("/check-runs")) {
      v.total_count++;
      v.check_runs.push({ ...v.check_runs[0], id: 99, name: "unrelated", conclusion: "failure" });
    }
    return v;
  } });
  await h.service.run("fixture/public", 1, { installationId: 2 });
  a.equal(old.current.state, "CURRENT");
  a.equal(old.gate.conclusion, "success");
  a.equal(h.service.data.retractionQueue.length, 0);
});

test("retraction failure is retained across restart and retried without another webhook", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  h.set(failedCheck);
  await h.service.run("fixture/public", 1, { installationId: 2 });
  h.failWrites(true);
  await h.service.drain();
  a.equal(h.service.data.retractionQueue.length, 1);
  a.equal(old.current.state, "STALE");
  a.equal(h.writes.length, 0);
  const restored = h.restart();
  restored.data.retractionQueue[0].retryAt = 0;
  h.failWrites(false);
  await restored.drain();
  a.equal(h.writes[0].conclusion, "failure");
  a.equal(restored.data.retractionQueue.length, 0);
});

test("confirmed retractions are not requeued by every subsequent contradictory observation", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  h.set(failedCheck);
  await h.service.run("fixture/public", 1, { installationId: 2 });
  await h.service.drain();
  a.equal(h.service.data.retractionQueue.length, 0);
  await h.service.run("fixture/public", 1, { installationId: 2 });
  a.equal(old.current.state, "STALE");
  a.equal(h.service.data.retractionQueue.length, 0);
});

test("a new head also invalidates and queues older published evidence", async t => {
  const h = harness(t), old = await h.successfulPublishedReceipt();
  h.set({ head: OLD });
  await h.service.run("fixture/public", 1, { installationId: 2 });
  a.equal(old.current.state, "STALE");
  a.equal(old.gate.conclusion, "failure");
  a.equal(h.service.data.retractionQueue[0].receiptId, old.receipt.receiptId);
});
