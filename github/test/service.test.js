"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createHmac, generateKeyPairSync, verify } = require("node:crypto");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { handle } = require("../http");
const { installationClient } = require("../app");
const { fixtureFetch, H, OLD } = require("./fixtures");
function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-github-"));
  const store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  let options = {};
  const service = new ProofService({
    store,
    config: { webhookSecret: "s".repeat(40), origin: "http://127.0.0.1" },
    clientFactory: ({ token } = {}) =>
      new Client({ ...fixtureFetch(options), token }),
    appClient: async () => new Client(fixtureFetch(options)),
  });
  return {
    store,
    service,
    set: (o) => {
      options = o;
    },
  };
}
function hook(event = "pull_request", extra = {}) {
  const p = {
    ref: "refs/heads/feature",
    repository: { id: 1, full_name: "fixture/public" },
    installation: { id: 2 },
    pull_request: { number: 1, state: "open" },
    ...extra,
  };
  const raw = Buffer.from(JSON.stringify(p));
  return [
    raw,
    {
      "x-github-delivery": require("node:crypto").randomUUID(),
      "x-github-event": event,
      "x-hub-signature-256":
        "sha256=" +
        createHmac("sha256", "s".repeat(40)).update(raw).digest("hex"),
    },
  ];
}
test("persisted proof, public share access, default unrefreshed view and fresh read", async (t) => {
  const h = harness(t);
  const out = await h.service.run("fixture/public", 1, { publish: true });
  a.equal(out.receipt.verdict, "VERIFIED");
  const id = out.receipt.receiptId;
  a.equal((await h.service.read(id, null)).current.state, "UNAVAILABLE");
  a.equal(
    (await h.service.read(id, null, { refresh: true })).current.state,
    "CURRENT",
  );
  a.equal(h.store.data.github.completed.length, 1);
  a.equal(
    JSON.parse(fs.readFileSync(h.store.file)).github.receipts[id].receipt
      .verdict,
    "VERIFIED",
  );
  a.equal(fs.statSync(h.store.file).mode & 0o777, 0o600);
});
test("private receipt requires current repository access; publication refused", async (t) => {
  const h = harness(t);
  h.set({ privateRepo: true });
  await a.rejects(
    h.service.run("fixture/public", 1, { token: "test", publish: true }),
    /PRIVATE_SHARING_DENIED/,
  );
  const out = await h.service.run("fixture/public", 1, { token: "test" });
  await a.rejects(h.service.read(out.receipt.receiptId, null), /ACCESS_DENIED/);
  a.equal(
    (await h.service.read(out.receipt.receiptId, "test")).receipt.verdict,
    "VERIFIED",
  );
  h.set({ deny: true });
  await a.rejects(h.service.read(out.receipt.receiptId, "revoked"));
});
test("public-to-private visibility transition closes shared permalink", async (t) => {
  const h = harness(t);
  const out = await h.service.run("fixture/public", 1, { publish: true });
  h.set({ privateRepo: true });
  await a.rejects(h.service.read(out.receipt.receiptId, null), /ACCESS_DENIED/);
});
test("refresh failure does not erase historical VERIFIED; head change stales it", async (t) => {
  const h = harness(t);
  const out = await h.service.run("fixture/public", 1, { publish: true }),
    id = out.receipt.receiptId;
  h.set({ failPath: "/repos/fixture/public/pulls/1" });
  const failed = await h.service.read(id, null, { refresh: true });
  a.equal(failed.receipt.verdict, "VERIFIED");
  a.equal(failed.current.state, "UNAVAILABLE");
  h.set({ head: OLD });
  const changed = await h.service.read(id, null, { refresh: true });
  a.equal(changed.current.state, "STALE");
  a.equal(changed.receipt.identity.headSha, H);
});
test("signed webhook automatically queues and completes receipt; duplicate is idempotent and unsigned denied", async (t) => {
  const h = harness(t),
    args = hook();
  await a.rejects(
    h.service.webhook(args[0], {
      ...args[1],
      "x-hub-signature-256": "sha256=" + "0".repeat(64),
    }),
    /WEBHOOK_DENIED/,
  );
  await h.service.webhook(...args);
  a.equal((await h.service.webhook(...args)).duplicate, true);
  a.equal(h.service.data.queue.length, 1);
  await h.service.drain();
  a.equal(h.service.data.queue.length, 0);
  const id = h.service.data.subscriptions["1:1"].latestReceiptId;
  a.equal(h.service.data.receipts[id].receipt.verdict, "VERIFIED");
  await h.service.webhook(...hook("push"));
  a.equal(h.service.data.receipts[id].current.state, "UNAVAILABLE");
  a.equal(h.service.data.receipts[id].receipt.verdict, "VERIFIED");
});
test("failed App refresh preserves history, bounded retries and no completed event", async (t) => {
  const h = harness(t);
  await h.service.webhook(...hook());
  h.service.appClient = async () => {
    throw Error("unavailable");
  };
  await h.service.drain();
  await h.service.drain();
  await h.service.drain();
  a.equal(h.service.data.queue.length, 0);
  a.equal(h.service.data.completed.length, 0);
  a.equal(h.service.data.subscriptions["1:1"].refreshState, "UNAVAILABLE");
});
test("HTTP journey produces mobile HTML and same JSON; unauthorized private evidence denied", async (t) => {
  const h = harness(t);
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    await handle(h.service, req, res, new URL(req.url, "http://127.0.0.1"));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(root + "/proof/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: "fixture/public", pr: 1, publish: true }),
  });
  a.equal(response.status, 201);
  const out = await response.json();
  const rendered = await fetch(root + out.url);
  a.equal(rendered.status, 200);
  a.match(await rendered.text(), /MERGE PROOF · PROVE THE MERGE/);
  const machine = await (await fetch(root + out.url + "?format=json")).json();
  a.equal(machine.receipt.receiptId, out.receipt.receiptId);
  a.equal(machine.receipt.verdict, "VERIFIED");
  const refresh = await fetch(root + out.url + "/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  a.equal((await refresh.json()).current.state, "CURRENT");
  h.set({ deny: true });
  a.equal((await fetch(root + out.url + "?format=json")).status, 403);
});
test("App JWT is signed, short lived and installation token limited to exact repository and read permissions", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let seen;
  const fetchImpl = async (u, init) => {
    seen = { u, init };
    return new Response(
      JSON.stringify({
        token: "installation-test",
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
    );
  };
  await installationClient(
    { appId: 1, privateKey: keys.privateKey },
    2,
    3,
    fetchImpl,
  );
  const jwt = seen.init.headers.Authorization.slice(7),
    parts = jwt.split(".");
  a.ok(
    verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      keys.publicKey,
      Buffer.from(parts[2], "base64url"),
    ),
  );
  const payload = JSON.parse(Buffer.from(parts[1], "base64url"));
  a.ok(payload.exp - payload.iat <= 600);
  const body = JSON.parse(seen.init.body);
  a.deepEqual(body.repository_ids, [3]);
  a.ok(Object.values(body.permissions).every((x) => x === "read"));
  a.equal(seen.init.redirect, "error");
});
test("source-unavailable receipt is retained without completed-proof event", async (t) => {
  const h = harness(t);
  h.set({ failPath: "/repos/fixture/public/branches/main/protection" });
  const out = await h.service.run("fixture/public", 1, { publish: true });
  a.equal(out.receipt.verdict, "NOT_PROVEN");
  a.equal(h.service.data.completed.length, 0);
  a.ok(h.service.data.receipts[out.receipt.receiptId]);
});
test("optional App check delivery stales the previous check and ignores its own events", async (t) => {
  const h = harness(t);
  h.service.config.publishChecks = true;
  h.service.config.appId = 42;
  let id = 500;
  const writes = [];
  h.service.appClient = async () => {
    const c = new Client(fixtureFetch()),
      request = c.request.bind(c);
    c.request = async (p, o) => {
      if (o?.method === "POST" && p.endsWith("/check-runs")) {
        writes.push({ p, o });
        return { id: id++ };
      }
      if (o?.method === "PATCH") {
        writes.push({ p, o });
        return {};
      }
      return request(p, o);
    };
    return c;
  };
  await h.service.webhook(...hook());
  await h.service.drain();
  a.equal(writes[0].o.body.conclusion, "success");
  await h.service.webhook(...hook("push"));
  await h.service.drain();
  a.equal(writes[1].o.method, "PATCH");
  a.equal(writes[1].o.body.conclusion, "neutral");
  a.match(writes[1].o.body.output.title, /Evidence refresh pending/);
  const own = hook("check_run", { check_run: { app: { id: 42 } } });
  a.equal((await h.service.webhook(...own)).ignored, true);
  a.equal(h.service.data.queue.length, 0);
});
test("receipt and pending refresh survive an actual store close/reopen", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-restart-"));
  let store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const options = () => ({
    store,
    config: { webhookSecret: "s".repeat(40) },
    clientFactory: (o) => new Client({ ...fixtureFetch(), ...o }),
    appClient: async () => new Client(fixtureFetch()),
  });
  let service = new ProofService(options());
  const out = await service.run("fixture/public", 1, { publish: true });
  await service.webhook(...hook());
  store.close();
  store = new Store(root);
  service = new ProofService(options());
  a.equal(
    (await service.read(out.receipt.receiptId, null)).receipt.verdict,
    "VERIFIED",
  );
  a.equal(service.data.queue.length, 1);
  await service.drain();
  a.equal(service.data.queue.length, 0);
  a.ok(service.data.subscriptions["1:1"].latestReceiptId);
});
test("event during an active proof stales it and retains a subsequent refresh job", async (t) => {
  const h = harness(t);
  let fired = false;
  h.service.appClient = async () => {
    const f = fixtureFetch();
    return new Client({
      fetchImpl: async (u, o) => {
        if (!fired && new URL(u).pathname.endsWith("/check-runs")) {
          fired = true;
          await h.service.webhook(...hook("push"));
        }
        return f.fetchImpl(u, o);
      },
    });
  };
  await h.service.webhook(...hook());
  await h.service.drain();
  const firstId = h.service.data.subscriptions["1:1"].latestReceiptId;
  a.equal(h.service.data.receipts[firstId].current.state, "STALE");
  a.equal(h.service.data.queue.length, 1);
  await h.service.drain();
  const secondId = h.service.data.subscriptions["1:1"].latestReceiptId;
  a.notEqual(firstId, secondId);
  a.equal(h.service.data.receipts[secondId].current.state, "CURRENT");
});
test("refresh revalidates a saved merge-group hint instead of discarding its binding", async (t) => {
  const h = harness(t);
  const { M, B } = require("./fixtures");
  const group = {
    head_sha: M,
    head_ref: "refs/heads/gh-readonly-queue/main/pr-1",
    base_sha: B,
    base_ref: "refs/heads/main",
  };
  const out = await h.service.run("fixture/public", 1, {
    publish: true,
    mergeGroup: group,
  });
  a.equal(out.receipt.summary.target.value.kind, "MERGE_GROUP");
  const after = await h.service.read(out.receipt.receiptId, null, {
    refresh: true,
  });
  a.equal(after.current.state, "UNAVAILABLE");
  a.deepEqual(after.current.changed, []);
});

test("failed stale-check update does not prevent core re-proof", async (t) => {
  const h = harness(t);
  h.service.config.publishChecks = true;
  let id = 700;
  h.service.appClient = async () => {
    const c = new Client(fixtureFetch()), request = c.request.bind(c);
    c.request = async (p, o) => {
      if (o?.method === "PATCH") throw new Error("delivery unavailable");
      if (o?.method === "POST" && p.endsWith("/check-runs")) return { id: id++ };
      return request(p, o);
    };
    return c;
  };
  await h.service.webhook(...hook());
  await h.service.drain();
  const first = Object.values(h.service.data.receipts)[0];
  await h.service.webhook(...hook("push"));
  await h.service.drain();
  a.equal(Object.keys(h.service.data.receipts).length, 2);
  a.equal(first.current.state, "UNAVAILABLE");
  a.equal(first.receipt.verdict, "VERIFIED");
  a.equal(first.checkDelivery, "UNAVAILABLE");
  a.equal(h.service.data.queue.length, 0);
});

test('remediation is additive on run and historical read, with actual tracking context', async (t) => {
  const h = harness(t);
  h.set({ oldApproval: true });
  const out = await h.service.run('fixture/public', 1, { publish: true });
  // Preserve the historical body byte-for-byte while adding a view envelope.
  const r = out.receipt;
  r.verdict = 'NOT_PROVEN'; r.gaps = ['INSUFFICIENT_CURRENT_HUMAN_APPROVAL'];
  const before = JSON.stringify(r);
  let read = await h.service.read(r.receiptId, null);
  a.equal(read.remediation.version, 1);
  a.equal(read.remediation.items[0].automaticRecheck.state, 'NO_KNOWN_TRIGGER');
  h.service.config.appId = 42; h.service.config.privateKey = 'fixture-not-a-key';
  h.service.data.subscriptions['1:1'] = { installationId: 2 };
  read = await h.service.read(r.receiptId, null);
  a.equal(read.remediation.items[0].automaticRecheck.state, 'EVENT_DRIVEN');
  a.equal(JSON.stringify(read.receipt), before);
  h.service.data.receipts[r.receiptId].current = { state: 'STALE' };
  a.equal((await h.service.read(r.receiptId, null)).remediation, null);
});
