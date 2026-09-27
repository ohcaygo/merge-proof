"use strict";
const { test } = require("node:test"),
  a = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../../factory/store"),
  { ProofService } = require("../service"),
  { Customers } = require("../customer"),
  { Client } = require("../client"),
  { handle } = require("../http"),
  { fixtureFetch } = require("./fixtures");
test("customer OAuth login, authorized repository, receipt, free meter, private access and logout HTTP journey", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-customer-")),
    store = new Store(root);
  let removed = false,
    privateRepo = false,
    repositoryAdmin = false;
  const service = new ProofService({
    store,
    config: {
      hosted: true,
      appId: 42,
      clientId: "test",
      clientSecret: "fixture",
    },
    clientFactory: ({ token } = {}) =>
      new Client({ ...fixtureFetch({ privateRepo }), token }),
    appClient: async () => new Client(fixtureFetch({ privateRepo })),
  });
  service.customers = new Customers(service, {
    fetchImpl: async (url) => {
      const p = new URL(url).pathname;
      let data =
        p === "/login/oauth/access_token"
          ? { access_token: "fixture-user-token", expires_in: 3600 }
          : p === "/user"
            ? { id: 9 }
            : p === "/user/installations"
              ? {
                  total_count: 1,
                  installations: removed
                    ? []
                    : [
                        {
                          id: 2,
                          app_id: 42,
                          account: { id: 9, type: "User", login: "owner" },
                        },
                      ],
                }
              : {
                  total_count: 1,
                  repositories: [
                    {
                      id: 1,
                      full_name: "fixture/public",
                      default_branch: "main",
                      permissions: { admin: repositoryAdmin },
                    },
                  ],
                };
      return new Response(JSON.stringify(data));
    },
  });
  const server = http.createServer((req, res) =>
    handle(service, req, res, new URL(req.url, service.config.origin)),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  service.config.origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const origin = service.config.origin;
  const welcome = await fetch(origin + "/proof/");
  a.match(await welcome.text(), /brand-page proof-page/);
  const mark = await fetch(origin + "/proof/brand-mark.png");
  a.equal(mark.headers.get("content-type"), "image/png");
  a.deepEqual(Buffer.from(await mark.arrayBuffer()), fs.readFileSync(path.join(__dirname, "../../factory/public/ohcaygo-mark.png")));
  const denied = await fetch(origin + "/proof/receipts/fa418b22-ce91-47ab-9000-4d38acee9659", {headers:{accept:"text/html"}});
  a.equal(denied.status,403);a.match(await denied.text(), /Connect GitHub to view this receipt/);
  const deniedJson = await fetch(origin + "/proof/receipts/fa418b22-ce91-47ab-9000-4d38acee9659?format=json", {headers:{accept:"text/html"}});
  a.equal(deniedJson.status,403);a.equal((await deniedJson.json()).error,"LOGIN_REQUIRED");

  const login = await fetch(origin + "/proof/login?source=x", { redirect: "manual" });
  a.equal(login.status, 302);
  const state = new URL(login.headers.get("location")).searchParams.get(
    "state",
  );
  const callback = await fetch(
    origin + "/proof/callback?code=fixture&state=" + state,
    {
      redirect: "manual",
      headers: { cookie: login.headers.get("set-cookie").split(";")[0] },
    },
  );
  a.equal(callback.status, 303);
  a.equal(callback.headers.get("location"), "/proof/?view=account");
  const cookie = callback.headers.get("set-cookie").split(";")[0];
  const request = (p, body, withAuth = true) =>
    fetch(origin + p, {
      headers: {
        ...(withAuth ? { cookie } : {}),
        origin,
        "Content-Type": "application/json",
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
  const connected=await request("/proof/installations");
  a.equal(connected.status,200);a.ok((await connected.json()).sessionExpiresAt>Date.now());
  const authorized=await (await request("/proof/repositories?installation=2")).json();
  a.ok(authorized.sessionExpiresAt>Date.now());a.equal(authorized.repositories[0].id,1);
  a.equal((await request("/proof/repositories?installation=999")).status, 403);
  const initial = await (await request("/proof/account?installation=2&repository=1")).json();
  a.equal(initial.usage.plan,"AWAITING_FIRST_PROOF");
  a.equal(initial.usage.used,undefined);
  a.equal(initial.trialStatus.label,"Trial not started");
  a.equal(initial.inbox.length,1);
  a.equal(initial.inbox[0].id,null);
  a.equal(initial.automation.state,"PENDING");
  const originalOwner=service.customers.billingOwner;
  service.customers.billingOwner=async()=>false;
  const member=await (await request("/proof/account?installation=2&repository=1")).json();
  a.equal(member.billingOwner,false);a.deepEqual(member.usage.activeDevelopers,[]);
  a.deepEqual(Object.keys(member.automation).sort(),["message","state"]);
  service.customers.billingOwner=originalOwner;
  await service.drain();
  a.equal(service.meter.usage(2).plan,"TRIAL");
  const response = await request("/proof/run", {
    installation: 2,
    repository: 1,
    pr: 1,
  });
  a.equal(response.status, 201);
  const out = await response.json();
  a.equal(service.meter.usage(2).used, 1);
  a.deepEqual(store.data.acquisition, {x: {github_connected: 1, installation_available: 1, receipt_returned: 1}});
  await request("/proof/installations");
  a.equal(store.data.acquisition.x.installation_available, 1);
  a.equal((await request(out.url, false, false)).status, 403);
  a.equal((await request(out.url)).status, 200);
  const savedReceipt=JSON.stringify(service.data.receipts[out.receipt.receiptId].receipt);
  const machine=await (await request(out.url+'?format=json')).json();
  a.deepEqual(machine.receipt,JSON.parse(savedReceipt));
  const human=await (await request(out.url)).text();
  a.match(human,/Raw technical evidence and machine verdict:/);
  a.match(human,/Evidence verdict: /);a.match(human,/Freshness: /);
  a.match(human,/Download JSON/);a.match(human,/Trial active/);a.match(human,/Merge truth/);a.match(human,/Merge Truth evidence chain/);a.match(human,/Landing has not yet been observed/);a.match(human,/Download replay packet/);a.match(human,/Unsigned packet:/);a.ok(human.indexOf('Merge truth')<human.indexOf('Evidence verdict:'));a.ok(human.indexOf('Evidence verdict:')<human.indexOf('Raw technical evidence and machine verdict'));
  const mergeTruth=await (await request(out.url+'/merge-truth')).json();
  a.equal(mergeTruth.relationship.verdict,'NOT_PROVEN');a.equal(mergeTruth.landing.state,'NOT_OBSERVED');a.equal(require('../merge-truth').verify(mergeTruth).state,'CONSISTENT_PROJECTION');
  const replayDownload=await request(out.url+'/replay-packet');
  a.equal(replayDownload.status,200);a.match(replayDownload.headers.get('content-disposition'),/^attachment; filename="merge-proof-.+-replay\.json"$/);
  const replayPacket=await replayDownload.json(), replayed=require('../replay-packet').replay(replayPacket);
  a.equal(replayed.state,'REPLAY_CONSISTENT');a.equal(replayed.verdict,'NOT_PROVEN');a.equal(replayed.trust,'UNSIGNED');
  a.equal((await request(out.url+'/replay-packet',false,false)).status,403);
  const grouped=await (await request('/proof/account?installation=2&repository=1')).json();
  a.equal(grouped.inbox.length,1);
  a.equal(grouped.inbox[0].history.length+1,grouped.receipts.length);
  a.equal(JSON.stringify(service.data.receipts[out.receipt.receiptId].receipt),savedReceipt);
  a.equal((await request(out.url + "/refresh", {})).status, 200);
  // Exercise the actual HTTP rendering and grouped account against a complete
  // no-required-validation observation, without altering its canonical body.
  const capture=require('./fixtures').capture();
  capture.rules.classic=require('../common').available(null);
  const noRequired=require('../proof').prove(capture);
  a.equal(noRequired.verdict,'NOT_PROVEN');
  a.deepEqual(noRequired.gaps,['NO_REQUIRED_VALIDATION_CONFIGURED']);
  noRequired.issuedAt='2099-01-01T00:00:00.000Z';
  const row={installationId:2,receipt:noRequired,current:{state:'CURRENT',asOf:noRequired.issuedAt}};
  service.data.receipts[noRequired.receiptId]=row;
  const body=JSON.stringify(noRequired);
  const noRequiredHtml=await (await request('/proof/receipts/'+noRequired.receiptId)).text();
  a.match(noRequiredHtml,/Evidence verdict: NOT_PROVEN/);a.match(noRequiredHtml,/Freshness: Current at last observation/);
  a.match(noRequiredHtml,/does not require any validation/);a.doesNotMatch(noRequiredHtml,/Unable to evaluate|Receipt currentness: UNAVAILABLE/);
  const card=(await (await request('/proof/account?installation=2&repository=1')).json()).inbox[0];
  a.equal(card.id,noRequired.receiptId);a.equal(card.label,'NOT_PROVEN');a.match(card.freshness,/Current at last observation/);a.match(card.nextAction,/at least one existing check required/);
  const machineNoRequired=await (await request('/proof/receipts/'+noRequired.receiptId+'?format=json')).json();
  a.equal(JSON.stringify(machineNoRequired.receipt),body);a.equal(machineNoRequired.current.reason,'REFRESH_REQUIRED');
  delete service.data.receipts[noRequired.receiptId];
  privateRepo = true;
  a.equal((await request(out.url)).status, 200);
  a.equal((await request(out.url, false, false)).status, 403);
  removed = true;
  a.equal((await request(out.url)).status, 403);
  removed = false;
  service.scanBusy = true;
  a.equal((await (await request("/proof/scan", {installation: 2, repository: 1})).json()).error,
    "SCAN_BUSY");
  service.scanBusy = false;
  a.equal((await (await request("/proof/scan/cancel", {installation: 2, repository: 1})).json()).error,
    "SCAN_REPOSITORY_MISMATCH");
  // Merge gate: status is readable by anyone with repository access, but only
  // a repository administrator may change whether Merge Proof blocks a merge.
  const gate = await (
    await request("/proof/gate?installation=2&repository=1")
  ).json();
  a.equal(gate.admin, false);
  a.equal(gate.policy.preset, "ADVISORY");
  a.equal(gate.policy.enforced, false);
  a.equal(gate.status.branch, "main");
  a.equal(gate.status.required, false);
  a.equal(gate.status.readiness.state, "READY");
  a.ok(gate.presets.some((p) => p.id === "REPOSITORY_REQUIREMENTS"));
  a.match(gate.instructions.steps.join(" "), /settings\/rules/);
  a.equal(
    (
      await (
        await request("/proof/gate", {
          installation: 2,
          repository: 1,
          preset: "REPOSITORY_REQUIREMENTS",
        })
      ).json()
    ).error,
    "REPOSITORY_ADMIN_REQUIRED",
  );
  a.equal(service.policyFor(1), null);
  repositoryAdmin = true;
  const trialGate = await request("/proof/gate", {installation:2,repository:1,preset:"REPOSITORY_REQUIREMENTS"});
  a.equal((await trialGate.json()).error,"PAID_PRO_REQUIRED_FOR_GATE");
  service.meter.paidPeriod("github:9", {verifiedPaid:true,quantity:1,periodStart:Date.now()-1000,periodEnd:Date.now()+86400000});
  const saved = await (
    await request("/proof/gate", {
      installation: 2,
      repository: 1,
      preset: "REPOSITORY_REQUIREMENTS",
    })
  ).json();
  a.equal(saved.admin, true);
  a.equal(saved.policy.preset, "REPOSITORY_REQUIREMENTS");
  a.equal(service.policyFor(1).setByUserId, 9);
  a.equal(
    (
      await (
        await request("/proof/gate", {
          installation: 2,
          repository: 1,
          preset: "NOT_A_PRESET",
        })
      ).json()
    ).error,
    "UNKNOWN_POLICY",
  );

  // A failed readiness observation must not change the saved policy.
  const originalAppClient = service.appClient;
  service.appClient = async (...args) => {
    const c = await originalAppClient(...args);
    c.observe = async () => ({state: "UNAVAILABLE", reason: "GITHUB_HTTP_403"});
    return c;
  };
  const beforePolicy = JSON.stringify(service.policyFor(1));
  const refused = await request("/proof/gate", {
    installation: 2, repository: 1, preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
  });
  a.equal((await refused.json()).error, "GATE_NOT_READY");
  a.equal(JSON.stringify(service.policyFor(1)), beforePolicy);
  service.appClient = originalAppClient;

  // Merge ledger: scoped to the authorized repository, denied otherwise.
  service.recordMerge("fixture/public", 1, 2, {
    number: 1,
    merged_at: "2026-09-11T10:00:00Z",
    merge_commit_sha: "c".repeat(40),
    head: { sha: "a".repeat(40) },
    base: { ref: "main" },
    merged_by: { id: 9, login: "owner", type: "User" },
  });
  const merges = await (
    await request("/proof/merges?installation=2&repository=1")
  ).json();
  a.equal(merges.total, 1);
  a.equal(merges.records[0].mergedBy, "owner");
  a.match(merges.completeness, /pruned/);
  const one = await (
    await request(
      "/proof/merges?installation=2&repository=1&record=" +
        merges.records[0].recordId,
    )
  ).json();
  a.equal(one.pr, 1);
  a.equal(
    (await request("/proof/merges?installation=2&repository=999")).status,
    403,
  );
  a.equal(
    (await request("/proof/merges?installation=2&repository=1&record=nope"))
      .status,
    403,
  );
  const account = await (
    await request("/proof/account?installation=2&repository=1")
  ).json();
  a.equal(account.policy.preset, "REPOSITORY_REQUIREMENTS");
  a.equal(account.merges.total, 1);

  a.equal((await request("/proof/logout", {})).status, 200);
  a.equal((await request(out.url)).status, 403);
  // Signed out, the new surfaces are denied like every other authorized read.
  a.equal(
    (await request("/proof/gate?installation=2&repository=1", null, false))
      .status,
    403,
  );
  a.equal(
    (await request("/proof/merges?installation=2&repository=1", null, false))
      .status,
    403,
  );
});
test("OAuth state is cookie-bound, expires, and cannot be replayed", async () => {
  const service = {
      config: {
        origin: "https://example.test",
        clientId: "x",
        clientSecret: "y",
      },
    },
    c = new Customers(service, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ access_token: "fixture", id: 1 })),
    });
  const start = c.start(),
    url = new URL(
      "https://example.test/proof/callback?code=x&state=" +
        new URL(start.url).searchParams.get("state"),
    );
  await a.rejects(c.callback({ headers: {} }, url), /LOGIN_STATE_INVALID/);
  const req = { headers: { cookie: start.cookie.split(";")[0] } };
  await c.callback(req, url);
  await a.rejects(c.callback(req, url), /LOGIN_STATE_INVALID/);
});
test('acquisition is coarse, bounded, deduplicated per session and excludes arbitrary input', () => {
  const service={config:{clientId:'x',clientSecret:'y',origin:'https://example.test'},store:{data:{}},save(){}};
  const c=new Customers(service);
  for(const source of ['x','other','direct','user@example.com?click_id=secret']) {
    const login=c.start(source);
    const state=new URL(login.url).searchParams.get('state');
    const stored=c.states.get(require('node:crypto').createHash('sha256').update(state).digest('hex'));
    a.equal(stored.source, ['x','other'].includes(source)?source:'direct');
    const session={acquisitionSource:stored.source};
    for(const stage of ['github_connected','installation_available','receipt_returned','invalid']) {
      c.acquisition(session,stage);c.acquisition(session,stage);
    }
  }
  a.deepEqual(service.store.data.acquisition,{x:{github_connected:1,installation_available:1,receipt_returned:1},other:{github_connected:1,installation_available:1,receipt_returned:1},direct:{github_connected:2,installation_available:2,receipt_returned:2}});
  a.doesNotMatch(JSON.stringify(service.store.data), /secret|example|click_id/);
});

test("revoked GitHub user token requires login while provider denial stays distinct",async()=>{
 const customers=new Customers({config:{}},{fetchImpl:async()=>new Response('{}',{status:401})});
 await a.rejects(customers.api('fixture','/user/installations'),{code:'LOGIN_REQUIRED'});
 customers.fetch=async()=>new Response('{}',{status:403});
 await a.rejects(customers.api('fixture','/user/installations'),{code:'ACCESS_UNAVAILABLE_OR_DENIED'});
});
