"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../../factory/store");
const { Meter } = require("../meter");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { fixtureFetch } = require("./fixtures");
const { createHmac, randomUUID } = require("node:crypto");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-meter-"));
  let store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = new Store(root);
      return new Meter(store);
    },
  };
}
function receipt(n, repo = 1, verdict = "NOT_PROVEN") {
  return {
    receiptId: `receipt-${repo}-${n}`,
    verdict,
    issuedAt: new Date().toISOString(),
    identity: {
      repositoryId: repo,
      pr: 1,
      headSha: n.toString(16).padStart(40, "0"),
    },
  };
}
test("trial is unlimited, starts once and persists across restart and installations", (t) => {
  const h = setup(t);
  let m = new Meter(h.store);
  m.connect(2, 9);
  for (let i = 1; i <= 4; i++) {
    a.equal(
      m.complete(2, receipt(i), { state: "CURRENT" }, true).charged,
      true,
    );
    a.equal(
      m.complete(2, receipt(i), { state: "CURRENT" }, true).charged,
      false,
    );
  }
  a.equal(
    m.complete(2, receipt(1, 2), { state: "CURRENT" }, true).charged,
    true,
  );
  h.store.save();
  m = h.reopen();
  a.equal(m.usage(2).plan, "TRIAL");
  a.equal(m.usage(2).automationAllowed, true);
  a.equal(m.check(2, receipt(6).identity).charged, true);
  a.equal(m.complete(2, receipt(1), { state: "CURRENT" }, true).charged, false);
  m.disconnect(2);
  m.connect(3, 9);
  a.equal(m.usage(3).trial.startedAt, new Date(m.account(3).trial.startedAt).toISOString());
  a.throws(() => m.usage(2), /INSTALLATION_INACTIVE/);
});
test("trusted invited tester allowlist selects one durable ten-day offer per account", (t) => {
  const h = setup(t);
  const invited = [9];
  let m = new Meter(h.store, { invitedTesterAccountIds: invited });
  invited.push(10);
  m.connect(2, 9);
  a.match(m.usage(2).notice, /10-day report-only trial/);
  a.equal(m.complete(2, receipt(1), { state: "CURRENT" }, true).charged, true);
  const trial = { ...m.account(2).trial };
  a.equal(trial.trialDays, 10);
  a.equal(trial.endsAt - trial.startedAt, 10 * 86400000);
  a.equal(m.usage(2).trialDays, 10);
  a.equal(m.usage(2).invitedTesterAccountIds, undefined);
  m.disconnect(2);
  m.connect(3, 9);
  a.deepEqual(m.account(3).trial, trial);
  m.connect(4, 10);
  a.equal(m.usage(4).trialDays, 7);
  a.equal(m.complete(4, receipt(2, 2), { state: "CURRENT" }, true).charged, true);
  a.equal(m.account(4).trial.trialDays, 7);
  h.store.save();
  m = h.reopen();
  a.equal(m.usage(3).trialDays, 10);
  a.equal(m.account(3).trial.endsAt, trial.endsAt);
});
test("malformed invited tester configuration is rejected and cannot be changed through the meter", (t) => {
  const h = setup(t);
  for (const invitedTesterAccountIds of [
    null,
    {},
    [0],
    [-1],
    [1.5],
    ["9"],
    [9, 9],
  ])
    a.throws(
      () => new Meter(h.store, { invitedTesterAccountIds }),
      { code: "INVALID_INVITED_TESTER_ACCOUNT_IDS" },
    );
});
test("FAIL, failed collection and stale completion debit zero", (t) => {
  const h = setup(t),
    m = new Meter(h.store, { invitedTesterAccountIds: [9] });
  m.connect(2, 9);
  for (const [verdict, state, complete] of [
    ["FAIL", "CURRENT", true],
    ["NOT_PROVEN", "STALE", true],
    ["NOT_PROVEN", "CURRENT", false],
  ])
    a.equal(
      m.complete(2, receipt(1, 1, verdict), { state }, complete).charged,
      false,
    );
  a.equal(m.usage(2).used, 0);
  a.equal(m.complete(2, receipt(1), { state: "CURRENT" }, true).charged, true);
  a.equal(m.account(2).trial.trialDays, 10);
});
test("real proof service snapshot commits receipt and debit together; same head reruns once", async (t) => {
  const h = setup(t);
  const s = new ProofService({
    store: h.store,
    config: { hosted: true },
    clientFactory: () => new Client(fixtureFetch()),
  });
  s.meter.connect(2, 9);
  await a.rejects(s.run("fixture/public", 1), /INSTALLATION_INACTIVE/);
  const first = await s.run("fixture/public", 1, { installationId: 2 });
  const saved = JSON.parse(fs.readFileSync(h.store.file));
  a.equal(saved.meter.accounts["github:9"].freeUsed, 1);
  a.ok(saved.github.receipts[first.receipt.receiptId]);
  const second = await s.run("fixture/public", 1, { installationId: 2 });
  a.notEqual(first.receipt.receiptId, second.receipt.receiptId);
  a.equal(s.meter.usage(2).used, 1);
});
test("overlapping workers cannot double-debit; second writer cannot open durable store", async (t) => {
  const h = setup(t);
  a.throws(() => new Store(h.store.root), /EEXIST/);
  const s = new ProofService({
    store: h.store,
    config: { hosted: true },
    clientFactory: () => new Client(fixtureFetch()),
  });
  s.meter.connect(2, 9);
  const results = await Promise.allSettled([
    s.run("fixture/public", 1, { installationId: 2 }),
    s.run("fixture/public", 1, { installationId: 2 }),
  ]);
  a.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  a.equal(s.meter.usage(2).used, 1);
});
test("signed hosted lifecycle: automatic proof, immutable stale history, time expiry pauses even same head", async (t) => {
  const h = setup(t);
  let head = "1".repeat(40);
  const s = new ProofService({
    store: h.store,
    config: { hosted: true, webhookSecret: "s".repeat(40) },
    clientFactory: () => new Client(fixtureFetch({ head })),
    appClient: async () => new Client(fixtureFetch({ head })),
  });
  const hook = async (event, p) => {
    const raw = Buffer.from(JSON.stringify(p));
    await s.webhook(raw, {
      "x-github-event": event,
      "x-github-delivery": randomUUID(),
      "x-hub-signature-256":
        "sha256=" +
        createHmac("sha256", "s".repeat(40)).update(raw).digest("hex"),
    });
  };
  await hook("installation", {
    action: "created",
    installation: { id: 2, account: { id: 9 } },
  });
  let first;
  for (let i = 1; i <= 5; i++) {
    head = String(i).repeat(40);
    await hook("pull_request", {
      action: "synchronize",
      installation: { id: 2 },
      repository: { id: 1, full_name: "fixture/public" },
      pull_request: { number: 1, state: "open" },
    });
    await s.drain();
    if (i === 1) first = Object.values(s.data.receipts)[0];
  }
  a.equal(s.meter.usage(2).used, 5);
  a.equal(first.current.state, "STALE");
  a.equal(first.receipt.identity.headSha, "1".repeat(40));
  s.meter.account(2).trial.endsAt = Date.now()-1;
  head = "6".repeat(40);
  await hook("push", {
    installation: { id: 2 },
    repository: { id: 1, full_name: "fixture/public" },
  });
  await s.drain();
  a.equal(s.data.subscriptions["1:1"].refreshState, "TRIAL_EXPIRED");
  a.equal(Object.keys(s.data.receipts).length, 5);
  head = "5".repeat(40);
  await a.rejects(s.run("fixture/public", 1, { installationId: 2 }), /TRIAL_EXPIRED/);
  a.equal(s.meter.usage(2).used, 5);
  await hook("installation", { action: "deleted", installation: { id: 2 } });
  await a.rejects(
    s.access(first.receipt.receiptId, "fixture"),
    /INSTALLATION_INACTIVE/,
  );
  await hook("installation", {
    action: "created",
    installation: { id: 3, account: { id: 9 } },
  });
  a.equal(s.meter.usage(3).plan, "PAUSED");
});
test("historical scan retries the same reservation after infrastructure failure and never consumes live taste", async (t) => {
  const h = setup(t);
  let unavailable = true;
  const s = new ProofService({
    store: h.store,
    config: { hosted: true },
    appClient: async () => {
      if (unavailable) throw Error("provider unavailable");
      return { authorize: async () => ({ id: 1 }), get: async () => [] };
    },
  });
  s.meter.connect(2, 9);
  const first = s.startScan(2, 1, "fixture/public");
  await s.scanJob;
  a.equal(first.state, "RETRY_AVAILABLE");
  a.equal(s.meter.usage(2).plan, "AWAITING_FIRST_PROOF");
  unavailable = false;
  first.result = { rows: [{ state: "UNAVAILABLE" }] };
  const second = s.startScan(2, 1, "fixture/public");
  a.equal(second.id, first.id);
  a.equal(second.result, null);
  await s.scanJob;
  a.equal(second.state, "COMPLETE");
  a.equal(s.startScan(2, 1, "fixture/public").id, first.id);
  a.throws(
    () => s.startScan(2, 2, "fixture/other"),
    /SCAN_TASTE_ALREADY_RESERVED/,
  );
  a.equal(s.meter.usage(2).plan, "AWAITING_FIRST_PROOF");
});
test('active developers require pushed commits; repeated later pushes retain their own event evidence', async t => {
 const h=setup(t);
 const s=new ProofService({store:h.store,config:{hosted:true,webhookSecret:'s'.repeat(40)}});
 s.meter.connect(2,9);
 const send=async(p,id=randomUUID())=>{
  const raw=Buffer.from(JSON.stringify({installation:{id:2},repository:{id:1,full_name:'fixture/public'},sender:{id:20,type:'User',login:'dev'},after:'a'.repeat(40),...p}));
  await s.webhook(raw,{'x-github-event':'push','x-github-delivery':id,'x-hub-signature-256':'sha256='+createHmac('sha256','s'.repeat(40)).update(raw).digest('hex')});
  return id;
 };
 await send({deleted:true,commits:[{id:'a'.repeat(40)}]});
 await send({commits:[]});
 a.equal(s.meter.usage(2).activeDevelopers.length,0);
 const id=await send({commits:[{id:'a'.repeat(40)}]});
 await send({commits:[{id:'a'.repeat(40)}]},id);
 await send({commits:[{id:'a'.repeat(40)}]});
 a.equal(s.meter.usage(2).activeDevelopers.length,1);
 a.equal(s.meter.usage(2).activeDevelopers[0].activity.length,2);
});
test('malformed signed lifecycle scopes reject without state mutation', async t => {
  const h = setup(t);
  const s = new ProofService({store: h.store, config: {hosted: true, webhookSecret: 's'.repeat(40)}});
  s.meter.connect(2, 9);
  const before = JSON.stringify(h.store.data);
  for (const [event, payload] of [
    ['installation', {action: 'created'}],
    ['installation', {action: 'created', installation: {id: 2, account: {id: '9'}}}],
    ['installation', {action: 'deleted', installation: {id: -2}}],
    ['installation_repositories', {installation: {id: '2'}}],
    ['installation_repositories', {installation: {id: 2}, repositories_removed: [null]}],
  ]) {
    const raw = Buffer.from(JSON.stringify(payload));
    await a.rejects(s.webhook(raw, {
      'x-github-event': event,
      'x-github-delivery': randomUUID(),
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', 's'.repeat(40)).update(raw).digest('hex'),
    }), {code: 'INVALID_WEBHOOK_SCOPE'});
    a.equal(JSON.stringify(h.store.data), before);
  }
});
