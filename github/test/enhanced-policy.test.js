"use strict";
const {test} = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const {Store} = require("../../factory/store"), {ProofService} = require("../service"), {Client} = require("../client"), {fixtureFetch} = require("./fixtures"), {createBroker} = require("../policy-broker"), {brokerClient} = require("../policy-broker-client"), {handle} = require("../http");
const privateKey = crypto.generateKeyPairSync("rsa", {modulusLength: 2048}).privateKey.export({type: "pkcs8", format: "pem"});
async function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-enhanced-")), store = new Store(root), calls = [];
  const state = {installed: true, suspended: false, denied: false, admin: true, member: true, callback: null};
  const socketPath = path.join(root, "p.sock"), grantsPath = path.join(root, "grants.json"), webhookSecret = "fixture-companion-webhook-secret-32-bytes";
  const primary = () => {
    const fixture = fixtureFetch();
    return new Client({token: "primary-read-only", fetchImpl: (url, init) => new URL(url).pathname.endsWith("/actions/policies") ? Response.json({message: "read denied"}, {status: 403}) : fixture.fetchImpl(url, init)});
  };
  const service = new ProofService({store, config: {hosted: true, appId: 42, webhookSecret: "primary-webhook-secret-at-least-32-bytes",
    enhancedPolicy: {appId: 77, appSlug: "fixture-companion", socketPath, grantsPath}}, appClient: async () => primary(), clientFactory: primary});
  service.meter.connect(2, 20);
  const installation = () => ({id: 3, app_id: 77, account: {id: 20}, suspended_at: state.suspended ? new Date().toISOString() : null,
    repository_selection: "selected", permissions: {administration: "write", metadata: "read"}});
  const broker = createBroker({app: {appId: 77, privateKey}, grantsPath, webhookSecret}, {fetchImpl: async (url, init) => {
    calls.push({url, method: init.method});
    if (url.endsWith("/installation") || url.endsWith("/app/installations/3")) return Response.json(installation(), {status: state.installed ? 200 : 404});
    if (url.endsWith("/access_tokens")) return Response.json({token: "companion-fixture-token", expires_at: new Date(Date.now() + 60000).toISOString(), permissions: installation().permissions, repositories: [{id: 1, full_name: "fixture/public"}]});
    if (url.endsWith("/installation/token")) return new Response(null, {status: 204});
    if (state.callback) await state.callback();
    return Response.json(state.denied ? {message: "denied"} : {total_count: 0, policies: []}, {status: state.denied ? 403 : 200});
  }});
  await new Promise(r => broker.listen(socketPath, r));
  const session = {token: "fixture-user-session", userId: 5, expiresAt: Date.now() + 600000};
  const context = () => ({repo: {id: 1, full_name: "fixture/public", permissions: {admin: state.admin}}, installation: {id: 2, account: {id: 20, type: "Organization", login: "fixture"}}});
  service.customers.sessions.set(crypto.createHash("sha256").update("session-cookie").digest("hex"), session);
  service.customers.fetch = async url => {
    const p = new URL(url).pathname;
    if (p === "/user/installations") return Response.json({total_count: state.member ? 1 : 0, installations: state.member ? [{...context().installation, app_id: 42}] : []});
    return Response.json({total_count: 1, repositories: [context().repo]});
  };
  const server = http.createServer((req, res) => handle(service, req, res, new URL(req.url, service.config.origin)));
  await new Promise(r => server.listen(0, "127.0.0.1", r)); service.config.origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, {authenticated = true, origin = service.config.origin} = {}) => fetch(service.config.origin + route, {redirect: "manual", headers: {...(authenticated ? {cookie: "mp_session=session-cookie"} : {}), origin, "Content-Type": "application/json"}, ...(body ? {method: "POST", body: JSON.stringify(body)} : {})});
  t.after(async () => {await Promise.all([new Promise(r => server.close(r)), new Promise(r => broker.close(r))]); store.close(); fs.rmSync(root, {recursive: true, force: true});});
  return {root, store, service, state, calls, primary, session, context, request, socketPath, webhookSecret,
    enable: () => {const {repo, installation} = context(); return service.enhanced.enable(session, repo, installation, true);}};
}
test("HTTP opt-in binds existing authenticated admin and isolated companion; default Read stays NOT_PROVEN", async t => {
  const h = await harness(t), route = "/proof/enhanced?installation=2&repository=1";
  a.equal((await h.request(route, null, {authenticated: false})).status, 403);
  a.equal((await h.request(route, {installation: 2, repository: 1, action: "enable", consent: true}, {origin: "https://elsewhere.invalid"})).status, 403);
  a.equal((await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2})).receipt.verdict, "NOT_PROVEN");
  h.state.admin = false;
  a.equal((await h.request(route, {installation: 2, repository: 1, action: "enable", consent: true})).status, 403);
  h.state.admin = true;
  a.equal((await h.request(route, {installation: 2, repository: 1, action: "enable"})).status, 403);
  const enabled = await h.request(route, {installation: 2, repository: 1, action: "enable", consent: true});
  a.equal(enabled.status, 200); a.equal((await enabled.json()).state, "AVAILABLE");
  const out = await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2});
  a.equal(out.receipt.verdict, "VERIFIED"); a.equal(out.receipt.evidence.executionPolicyProvenance.access, "ENHANCED_POLICY_COMPANION");
  a.equal(require("../bundle").replay(out.receipt, h.service.data.receipts[out.receipt.receiptId].artifacts.policy).state, "CONSISTENT_OFFLINE");
  a.doesNotMatch(JSON.stringify(h.store.data), /companion-fixture-token|BEGIN PRIVATE KEY|fixture-user-session/);
  a.ok(h.calls.every(x => x.method === "GET" || x.url.endsWith("/access_tokens") || x.url.endsWith("/installation/token")));
});
test("disable preserves immutable receipt, invalidates dependent claims, and requeues policy observation", async t => {
  const h = await harness(t); await h.enable();
  const out = await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2}), row = h.service.data.receipts[out.receipt.receiptId], before = JSON.stringify(row.receipt);
  h.service.data.subscriptions["1:1"] = {repo: "fixture/public", repositoryId: 1, installationId: 2, pr: 1, latestReceiptId: out.receipt.receiptId};
  row.current = {...row.current, claims: {TARGET: {state: "CURRENT"}, "CI_EXECUTED:build": {state: "CURRENT"}, APPROVAL_CURRENT: {state: "CURRENT"}}};
  const {repo, installation} = h.context(); h.service.enhanced.disable(h.session, repo, installation);
  a.equal(row.current.state, "UNAVAILABLE"); a.equal(row.current.claims.TARGET.state, "CURRENT"); a.equal(row.current.claims.APPROVAL_CURRENT.state, "CURRENT"); a.equal(row.current.claims["CI_EXECUTED:build"].state, "UNAVAILABLE");
  a.deepEqual(h.service.data.queue[0].claims, ["RULES_SNAPSHOT", "CI_EXECUTED", "CODE_COVERAGE"]);
  a.equal(JSON.stringify(row.receipt), before);
  const after = await h.service.read(out.receipt.receiptId, "fixture-user-session", {refresh: true});
  a.notEqual(after.current.state, "CURRENT"); a.equal(after.receipt.verdict, "VERIFIED");
});
test("revocation during broker collection cannot return a current positive result", async t => {
  const h = await harness(t); await h.enable();
  h.state.callback = async () => {h.state.callback = null; const {repo, installation} = h.context(); h.service.enhanced.disable(h.session, repo, installation);};
  const out = await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2});
  a.equal(out.receipt.verdict, "NOT_PROVEN"); a.notEqual(out.current.state, "CURRENT");
});
test("forged installation redirect, session substitution and removed repository authority cannot enroll", async t => {
  const h = await harness(t); h.state.installed = false;
  const start = await h.enable(), state = new URL(start.installUrl).searchParams.get("state");
  a.equal(start.state, "APPROVAL_PENDING");
  await a.rejects(h.service.enhanced.callback({...h.session, token: "other-session"}, state), {code: "ENROLLMENT_STATE_INVALID"});
  const second = await h.enable(), next = new URL(second.installUrl).searchParams.get("state"); h.state.installed = true; h.state.member = false;
  a.equal((await h.request(`/proof/enhanced/callback?state=${next}&installation_id=999`)).status, 403);
  a.equal(h.service.enhanced.status(2, 1).enabled, false);
  h.state.member = true; h.state.installed = false; const third = await h.enable(); h.state.installed = true;
  const response = await h.request(`/proof/enhanced/callback?state=${new URL(third.installUrl).searchParams.get("state")}&installation_id=999`);
  a.equal(response.status, 303); a.equal(h.service.enhanced.grants["2:1"].companionInstallationId, 3);
});
test("signed companion uninstall stops enhanced reads durably; unsigned event has no effect", async t => {
  const h = await harness(t); await h.enable();
  const payload = Buffer.from(JSON.stringify({action: "deleted", installation: {id: 3, app_id: 77}}));
  const headers = {"x-github-delivery": "fixture-companion-deleted", "x-github-event": "installation", "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", h.webhookSecret).update(payload).digest("hex")};
  await a.rejects(h.service.enhanced.webhook(payload, {...headers, "x-hub-signature-256": "sha256=" + "0".repeat(64)}));
  a.equal(h.service.enhanced.status(2, 1).enabled, true);
  a.equal((await h.service.enhanced.webhook(payload, headers)).accepted, true);
  a.equal(h.service.enhanced.status(2, 1).state, "REVOKED");
  a.equal(JSON.parse(fs.readFileSync(path.join(h.root, "grants.json")))["2:1"].enabled, false);
  a.equal((await h.service.enhanced.webhook(payload, headers)).duplicate, true);
});
test("broker denies method/path/body expansion before provider network access", async t => {
  const h = await harness(t), before = h.calls.length, client = brokerClient(h.socketPath);
  await a.rejects(client("observe", {repository: "fixture/public", repositoryId: 1, accountId: 20, primaryInstallationId: 2, companionInstallationId: 3, revision: "x", method: "DELETE", url: "/repos/fixture/public"}), {code: "INVALID_SCOPE"});
  await a.rejects(client("discover", {repository: "https://evil.invalid/repo", repositoryId: 1, accountId: 20, primaryInstallationId: 2}), {code: "INVALID_SCOPE"});
  const response = await new Promise((resolve, reject) => {const req = http.request({socketPath: h.socketPath, method: "DELETE", path: "/v1/observe"}, res => {res.resume(); res.on("end", () => resolve(res.statusCode));});req.on("error", reject);req.end();});
  a.equal(response, 403); a.equal(h.calls.length, before);
});
test("companion outage and suspension remain NOT_PROVEN; primary removal revokes the matching grant only", async t => {
  const h = await harness(t); await h.enable(); h.state.denied = true;
  const out = await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2}); a.equal(out.receipt.verdict, "NOT_PROVEN");
  h.state.denied = false; h.state.suspended = true;
  a.equal((await h.service.run("fixture/public", 1, {client: h.primary(), installationId: 2})).receipt.verdict, "NOT_PROVEN");
  h.service.enhanced.primaryRevoked(2, 999); a.equal(h.service.enhanced.status(2, 1).enabled, true);
  h.service.enhanced.primaryRevoked(2, 1); a.equal(h.service.enhanced.status(2, 1).state, "REVOKED");
});
test("observed companion access loss invalidates other dependent receipts while preserving independent claim freshness", async t => {
  const h=await harness(t);await h.enable();
  const first=await h.service.run("fixture/public",1,{client:h.primary(),installationId:2});
  const row=h.service.data.receipts[first.receipt.receiptId];row.current.claims={...row.current.claims,TARGET:{state:"CURRENT"},APPROVAL_CURRENT:{state:"CURRENT"}};
  h.state.denied=true;
  await h.service.enhanced.reader(2,h.primary())({repository:"fixture/public",repositoryId:1});
  a.equal(row.current.state,"UNAVAILABLE");a.equal(row.current.claims.TARGET.state,"CURRENT");a.equal(row.current.claims.APPROVAL_CURRENT.state,"CURRENT");a.equal(row.current.claims.CI_EXECUTED.state,"UNAVAILABLE");a.equal(row.receipt.verdict,"VERIFIED");
});
test("grant survives service recreation but user session and enrollment nonce do not", async t => {
  const h = await harness(t); await h.enable();
  const saved = JSON.parse(fs.readFileSync(h.store.file || path.join(h.root, "state.json")));
  a.equal(saved.github.enhancedPolicy["2:1"].enabled, true);
  const manager = new (require("../enhanced-policy").EnhancedPolicy)(h.service);
  a.equal(manager.status(2, 1).enabled, true); a.equal(manager.pending.size, 0);
  a.doesNotMatch(JSON.stringify(saved.github.enhancedPolicy), /token|privateKey|webhookSecret/);
});
test("broker executable refuses a shared proof UID instead of silently losing process isolation", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-broker-isolation-")); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, "config.json"); fs.writeFileSync(file, JSON.stringify({proofUid: process.getuid(), socketPath: path.join(root, "p.sock"), grantsPath: path.join(root, "grants.json")}), {mode: 0o600});
  a.throws(() => require("../policy-broker").start(file), {code: "POLICY_CREDENTIAL_ISOLATION_REQUIRED"});
});
