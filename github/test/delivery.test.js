"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const { publish, NAME } = require("../check");
const { prove } = require("../proof");
const { capture } = require("./fixtures");
test("optional GitHub check reports same verdict and cannot be its own CI evidence", async () => {
  const r = prove(capture());
  let call;
  await publish(
    {
      request: async (...args) => {
        call = args;
      },
    },
    r,
    { state: "CURRENT" },
    "https://merge-proof.ohcaygo.com",
  );
  a.equal(call[1].body.head_sha, r.identity.headSha);
  a.equal(call[1].body.conclusion, "success");
  a.match(call[1].body.output.summary, /VERIFIED/);
  await publish(
    {
      request: async (...args) => {
        call = args;
      },
    },
    r,
    { state: "STALE" },
    "https://merge-proof.ohcaygo.com",
  );
  a.equal(call[1].body.conclusion, "neutral");
  // Requiring Merge Proof's own check is the supported merge-gate setup. The
  // receipt must not treat itself as evidence about the change, and must not
  // turn that into a requirement no evidence can satisfy: that would deadlock
  // every gated pull request. The independent requirement is still enforced.
  const c = capture();
  c.rules.classic.value.required_status_checks.checks.push({
    context: NAME,
    app_id: 77,
  });
  const gated = prove(c, { appId: 77 });
  a.equal(gated.verdict, "VERIFIED");
  a.equal(gated.summary.ci.selfReference.boundToThisApp, true);
  a.ok(!gated.summary.ci.required.some((x) => x.name === NAME));
  a.ok(gated.notChecked.includes("MERGE_PROOF_OWN_REQUIRED_CHECK"));
  a.equal(gated.summary.gate.required, true);

  const failing = capture();
  failing.rules.classic.value.required_status_checks.checks.push({
    context: NAME,
    app_id: 77,
  });
  failing.checks.value[0].conclusion = "failure";
  a.equal(prove(failing, { appId: 77 }).verdict, "FAIL");

  // A different App publishing a check with the same name is somebody else's
  // requirement, not ours, and stays a real requirement.
  const other = capture();
  other.rules.classic.value.required_status_checks.checks.push({
    context: NAME,
    app_id: 999,
  });
  const foreign = prove(other, { appId: 77 });
  a.equal(foreign.verdict, "NOT_PROVEN");
  a.equal(foreign.summary.ci.selfReference, null);
});
test("Pages forwards proof receipts and raw App webhook signature using existing proxy boundary", async (t) => {
  const worker = (await import("../../factory/deploy/pages-worker.mjs"))
    .default;
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  let path;
  global.fetch = async (u, o) => {
    path = u;
    a.equal(o.headers.get("x-mp-proxy-key"), "secret");
    a.equal(o.headers.get("x-hub-signature-256"), "sha256=test");
    return new Response("ok");
  };
  const response = await worker.fetch(
    new Request("https://merge-proof.ohcaygo.com/proof/webhook", {
      method: "POST",
      body: "{}",
      headers: {
        "x-hub-signature-256": "sha256=test",
        "CF-Connecting-IP": "192.0.2.1",
      },
    }),
    {
      FACTORY_BACKEND: "https://backend.example",
      FACTORY_PROXY_SECRET: "secret",
    },
  );
  a.equal(response.status, 200);
  a.equal(path, "https://backend.example/proof/webhook");
  a.equal(response.headers.get("cache-control"), "no-store");
});
test("a skipped workflow step is visible but not full execution proof", () => {
  const c = capture();
  c.execution.value[0].steps.push({
    number: 2,
    status: "completed",
    conclusion: "skipped",
  });
  a.equal(prove(c).verdict, "NOT_PROVEN");
});

test("Pages upload manifest sends proof routes to the existing worker", () => {
  const routes = require("../../factory/deploy/routes.json");
  a.ok(routes.include.includes("/proof/*"));
  a.deepEqual(routes.exclude, []);
  for (const route of ["/api/*", "/download/*", "/webhooks/stripe"])
    a.ok(routes.include.includes(route));
});
