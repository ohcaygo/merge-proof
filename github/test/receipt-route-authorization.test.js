"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Customers } = require("../customer");
const { Client } = require("../client");
const { handle } = require("../http");
const ledger = require("../ledger");
const { fixtureFetch, H, M } = require("./fixtures");

// Only the provider boundary is replaced. Requests use the actual HTTP handler,
// Customers intersection checks, Client authorization, store and ProofService.
async function fixture(t, { hosted = true, privateRepo = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-route-auth-"));
  const store = new Store(root);
  const state = { mode: "authorized", calls: [] };
  const service = new ProofService({
    store,
    config: { hosted, appId: 42, origin: "http://127.0.0.1" },
    clientFactory: ({ token } = {}) => {
      const provider = fixtureFetch({ privateRepo, mutate: (p, value) => {
        if (p === "/repos/fixture/public" && state.mode === "user-id-mismatch") value.id = 999;
        return value;
      } });
      return new Client({ token, fetchImpl: (url, init) =>
        state.mode === "user-denied" ? Promise.resolve(new Response("private provider detail", { status: 403 })) : provider.fetchImpl(url, init),
      });
    },
  });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  if (hosted) {
    service.meter.connect(2, 9);
    service.customers = new Customers(service, { fetchImpl: async (url, init) => {
      const p = new URL(url).pathname;
      state.calls.push({ path: p, authorization: init.headers.Authorization });
      if (state.mode === "provider-error") return new Response("private provider detail", { status: 503 });
      if (state.mode === "denied") return new Response("private provider detail", { status: 403 });
      if (state.mode === "revoked") return new Response("private provider detail", { status: 401 });
      if (p === "/user/installations") return Response.json({ total_count: 1, installations:
        state.mode === "uninstalled" ? [] : [{ id: state.mode === "other-installation" ? 3 : 2,
          app_id: state.mode === "other-app" ? 999 : 42,
          suspended_at: state.mode === "suspended" ? "2026-10-01T00:00:00Z" : null,
          account: { id: 9, type: "User", login: "owner" } }] });
      a.equal(p, "/user/installations/2/repositories");
      if (state.mode === "repository-provider-error") return new Response("private provider detail", { status: 503 });
      return Response.json({ total_count: 1, repositories: state.mode === "removed" ? [] : [
        { id: state.mode === "selected-id-mismatch" ? 999 : 1,
          full_name: state.mode === "selected-name-mismatch" ? "other/repository" : "fixture/public" },
      ] });
    } });
  }
  const out = await service.run("fixture/public", 1, {
    token: "fixture-readable-user", installationId: 2, publish: false,
  });
  const row = service.data.receipts[out.receipt.receiptId];
  const record = ledger.record(store, {
    repository: "fixture/public", repositoryId: 1, installationId: 2, pr: 1,
    mergeCommitSha: M, mergedHeadSha: H,
    proof: { receiptSnapshot: row.receipt },
  });
  service.data.landings[record.recordId] = { state: "LANDED_UNRESOLVED" };
  service.save();
  const server = http.createServer((req, res) => handle(service, req, res, new URL(req.url, service.config.origin)));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  service.config.origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const routes = {
    lookup: `/proof/v1/receipts?repository_id=1&commit=${M}`,
    bundle: `/proof/receipts/${row.receipt.receiptId}/bundle`,
    replay: `/proof/receipts/${row.receipt.receiptId}/replay-packet`,
  };
  const request = (route, token = "fixture-readable-user") => fetch(service.config.origin + route, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { state, service, store, row, record, routes, request };
}

test("repository removal denies commit lookup like bundle download for the same still-readable user credential", async t => {
  const f = await fixture(t);
  a.equal((await f.request(f.routes.lookup)).status, 200);
  a.equal((await f.request(f.routes.bundle)).status, 200);
  f.state.mode = "removed";
  // The user still reads the repository; only the selected App scope changed.
  a.equal((await f.service.clientFactory({ token: "fixture-readable-user" }).authorize("fixture/public", 1)).id, 1);
  a.equal((await f.request(f.routes.bundle)).status, 403);
  a.equal((await f.request(f.routes.lookup)).status, 403);
});

for (const source of ["ledger", "archive", "push"]) {
  test(`${source}: lookup and downloads recheck active selected installation and repository on every request`, async t => {
    const f = await fixture(t);
    if (source === "archive") {
      f.service.archive.landing(f.record, { state: "LANDED_UNRESOLVED", landed: { sha: M }, recordedAt: "2026-10-01T00:00:00Z" });
      // Read both the commit index and receipt via their real archived paths.
      ledger.area(f.store).records = [];
      delete f.service.data.landings[f.record.recordId];
      delete f.service.data.receipts[f.row.receipt.receiptId];
    } else if (source === "push") {
      ledger.area(f.store).records = [];
      f.service.data.pushObservations.fixture = {
        repository: "fixture/public", repositoryId: 1, installationId: 2,
        observedAt: "2026-10-01T00:00:00Z", ref: "refs/heads/main", commits: [{ sha: M }],
      };
    }
    const immutableReceipt = JSON.stringify(f.row.receipt);
    for (const mode of ["authorized", "removed", "uninstalled", "suspended", "denied", "provider-error",
      "repository-provider-error", "revoked", "user-denied", "user-id-mismatch", "other-installation", "other-app",
      "selected-id-mismatch", "selected-name-mismatch", "authorized"]) {
      await t.test(mode, async () => {
        f.state.mode = mode;
        const expected = mode === "authorized" ? 200 : 403;
        for (const [name, route] of Object.entries(f.routes)) {
          const response = await f.request(route);
          a.equal(response.status, expected, `${mode}: ${name}`);
          const body = await response.json();
          if (expected === 403) {
            a.deepEqual(body, { error: mode === "revoked" ? "LOGIN_REQUIRED" : "PROOF_UNAVAILABLE_OR_DENIED" });
          } else if (name === "lookup") {
            a.equal(body.records.length, source === "push" ? 0 : 1);
            a.equal(body.pushObservations.length, source === "push" ? 1 : 0);
            if (source !== "push") a.deepEqual(body.records[0].receipt, f.row.receipt);
            else a.equal(body.pushObservations[0].commit.sha, M);
          } else if (name === "bundle") {
            a.deepEqual(body.receipt, f.row.receipt);
          } else {
            a.match(response.headers.get("content-disposition"), /-replay\.json"$/);
            a.deepEqual(body.evidenceBundle.receipt, f.row.receipt);
          }
        }
      });
    }
    for (const route of Object.values(f.routes)) a.equal((await f.request(route, null)).status, 403);
    a.ok(f.state.calls.length > 0);
    a.ok(f.state.calls.every(call => call.authorization === "Bearer fixture-readable-user"));
    a.equal(JSON.stringify(f.row.receipt), immutableReceipt);
  });
}

test("lookup denies the whole response when a later record or push belongs to another installation", async t => {
  const f = await fixture(t);
  f.service.meter.connect(3, 10);
  for (const source of ["record", "push"]) {
    await t.test(source, async () => {
      if (source === "record") ledger.area(f.store).records.push({ ...f.record, recordId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", installationId: 3 });
      else f.service.data.pushObservations.other = {
        repository: "fixture/public", repositoryId: 1, installationId: 3, commits: [{ sha: M }],
      };
      const response = await f.request(f.routes.lookup);
      a.equal(response.status, 403);
      a.deepEqual(await response.json(), { error: "PROOF_UNAVAILABLE_OR_DENIED" });
      ledger.area(f.store).records = [f.record];
      f.service.data.pushObservations = {};
    });
  }
});

test("public-only local development keeps bearer lookup and published anonymous downloads without App scope", async t => {
  const f = await fixture(t, { hosted: false, privateRepo: false });
  a.equal(f.service.customers, null);
  a.equal((await f.request(f.routes.lookup)).status, 200);
  // Existing lookup requires a bearer even in local development.
  a.equal((await f.request(f.routes.lookup, null)).status, 403);
  for (const name of ["bundle", "replay"]) a.equal((await f.request(f.routes[name])).status, 200);
  // Publication is an explicit local-only prerequisite for anonymous reads.
  for (const name of ["bundle", "replay"]) a.equal((await f.request(f.routes[name], null)).status, 403);
  f.row.published = true;
  for (const name of ["bundle", "replay"]) a.equal((await f.request(f.routes[name], null)).status, 200);
});

test("hosted public repositories still require authenticated selected-App access", async t => {
  const f = await fixture(t, { privateRepo: false });
  for (const route of Object.values(f.routes)) {
    a.equal((await f.request(route, null)).status, 403);
    a.equal((await f.request(route)).status, 200);
  }
  f.state.mode = "removed";
  for (const route of Object.values(f.routes)) a.equal((await f.request(route)).status, 403);
});
