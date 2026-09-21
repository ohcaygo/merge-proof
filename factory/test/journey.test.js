"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Store } = require("../store");
const { Runner } = require("../runner");
const { Stripe } = require("../stripe");
const { Factory } = require("../service");
const { createServer } = require("../server");
const { hash } = require("../common");
function setupRepo(root) {
  const repo = path.join(root, "source");
  fs.mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(repo, "hello.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const baseSha = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "hello.txt"), "candidate\n");
  git("add", ".");
  git("commit", "-qm", "candidate");
  return { repo, baseSha, headSha: git("rev-parse", "HEAD") };
}
async function harness(t, { timeoutMs, reporter } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-factory-test-"));
  const fixture = setupRepo(root);
  const store = new Store(path.join(root, "state"));
  const scope = {
    repo: "fixture/public",
    repoId: 7,
    pr: 1,
    headSha: fixture.headSha,
    baseSha: fixture.baseSha,
    ciSha: fixture.headSha,
    shape: "open-candidate",
    authorId: 1,
  };
  let stale = true;
  let failScope = null;
  const github = {
    scope: async () => {
      if (failScope) {
        const e = Error();
        e.code = failScope;
        throw e;
      }
      return { ...scope };
    },
    capture: async () => ({
      ...scope,
      capturedAt: new Date().toISOString(),
      checks: [
        {
          id: 1,
          name: "tests",
          appId: 15368,
          headSha: stale ? fixture.baseSha : fixture.headSha,
          status: "completed",
          conclusion: "success",
        },
      ],
      reviews: stale
        ? []
        : [
            {
              id: 1,
              userId: 2,
              userType: "User",
              association: "COLLABORATOR",
              state: "APPROVED",
              commitId: fixture.headSha,
              submittedAt: "2026-09-08T00:00:00Z",
            },
          ],
    }),
  };
  const config = {
    retireLegacyOffer: false, // Exercise preserved historical factory behavior explicitly.
    mode: "test",
    stripeSecret: "sk_test_fixture",
    webhookSecret: "whsec_fixture",
    paymentLinkId: "plink_fixture",
    priceId: "price_fixture",
    origin: "http://127.0.0.1:4318",
    sourceCommit: "dab4c4b",
  };
  let reference;
  let transaction = "pi_fixture";
  const stripe = new Stripe(config, {
    fetchImpl: async (url) => ({
      ok: true,
      json: async () =>
        url.includes("payment_links")
          ? {
              active: true,
              livemode: false,
              url: "https://buy.stripe.com/test_fixture",
              line_items: {
                data: [
                  {
                    price: {
                      id: "price_fixture",
                      unit_amount: 2400,
                      currency: "usd",
                    },
                    quantity: 1,
                  },
                ],
              },
              after_completion: {
                type: "redirect",
                redirect: { url: config.origin + "/#paid" },
              },
            }
          : {
              id: "cs_test_fixture",
              mode: "payment",
              status: "complete",
              payment_status: "paid",
              livemode: false,
              payment_link: "plink_fixture",
              line_items: {
                data: [{ price: { id: "price_fixture" }, quantity: 1 }],
              },
              amount_total: 2400,
              currency: "usd",
              customer_details: { email: "test@example.invalid" },
              payment_intent: transaction,
              client_reference_id: reference,
            },
    }),
  });
  const runner = new Runner({
    root: path.join(root, "runs"),
    fixtureSource: fixture.repo,
    timeoutMs: timeoutMs || 120000,
  });
  const service = new Factory({
    store,
    github,
    runner,
    stripe,
    config,
    ...(reporter ? { reporter } : {}),
  });
  const server = createServer(service);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  async function request(
    route,
    body,
    { auth = true, origin = config.origin } = {},
  ) {
    const r = await fetch(config.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(auth && cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : { origin, "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  async function json(route, body, options) {
    const r = await request(route, body, options);
    const data = await r.json();
    return { status: r.status, data };
  }
  async function pay(id, eventId = "evt_fixture") {
    reference = id;
    const raw = JSON.stringify({
      id: eventId,
      livemode: false,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_fixture" } },
    });
    const stamp = Math.floor(Date.now() / 1000);
    const signature = `t=${stamp},v1=${crypto
      .createHmac("sha256", config.webhookSecret)
      .update(stamp + "." + raw)
      .digest("hex")}`;
    return fetch(config.origin + "/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: raw,
    });
  }
  t.after(async () => {
    await Promise.allSettled([...service.jobs]);
    await new Promise((r) => server.close(r));
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    service,
    store,
    scope,
    runner,
    json,
    request,
    pay,
    setStale: (v) => (stale = v),
    setFail: (v) => (failScope = v),
  };
}
const eligibility = {
  url: "https://github.com/fixture/public",
  pr: 1,
  required: [{ name: "tests", appId: 15368 }],
};
test("complete HTTP journey: eligibility -> signed fixture webhook -> authorization -> real Git/PDF -> download -> one reassessment", async (t) => {
  const h = await harness(t);
  const offer = await h.request("/");
  a.equal(offer.status, 200);
  a.match(await offer.text(), /PROVE THE MERGE/);
  a.match(await (await h.request("/legacy")).text(), /CANDIDATE_DURABLE_ON_REMOTE/);
  a.equal((await h.request("/sample")).status, 200);
  const eligible = await h.json("/api/eligibility", eligibility);
  a.equal(eligible.data.eligibility, "ELIGIBLE");
  a.equal(eligible.data.verdict, undefined);
  a.equal(eligible.data.findings, undefined);
  a.equal(h.service.auth(eligible.data.token).id, eligible.data.id);
  a.deepEqual(fs.readdirSync(path.join(h.root, "runs")), []);
  a.equal((await h.json("/api/run", { scopeHash: "x" })).status, 402);
  const checkout = await h.json("/api/checkout", {});
  a.match(checkout.data.url, new RegExp(eligible.data.id));
  a.equal((await h.pay(eligible.data.id)).status, 200);
  a.equal((await h.pay(eligible.data.id)).status, 200);
  a.equal(h.store.data.events.length, 1);
  a.equal(
    (await h.json("/api/authorize", { url: eligibility.url, pr: 1 })).status,
    200,
  );
  let prepared = await h.json("/api/scope", {});
  a.equal(prepared.status, 200);
  a.equal((await h.json("/api/run", { scopeHash: "wrong" })).status, 400);
  a.equal(
    (
      await h.json(
        "/api/run",
        { scopeHash: prepared.data.scopeHash },
        { origin: "https://other.invalid" },
      )
    ).status,
    403,
  );
  a.equal(
    (await h.json("/api/run", { scopeHash: prepared.data.scopeHash })).status,
    202,
  );
  await Promise.all([...h.service.jobs]);
  let order = (await h.json("/api/order")).data;
  a.equal(order.state, "DELIVERED");
  a.equal(order.runs[0].verdict, "NOT_PROVEN");
  const first = order.runs[0];
  const jsonPath = `/download/${first.id}/report.json`;
  a.equal((await h.request(jsonPath, undefined, { auth: false })).status, 401);
  const before = await (await h.request(jsonPath)).text();
  a.match(before, /CI_STALE_OR_OTHER_SHA/);
  a.doesNotMatch(before, new RegExp(h.root));
  a.equal((await h.request(`/download/${first.id}/state.json`)).status, 404);
  const pdf = Buffer.from(
    await (await h.request(`/download/${first.id}/report.pdf`)).arrayBuffer(),
  );
  a.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  a.ok(first.files.includes("action-handoff.md"));
  a.deepEqual(fs.readdirSync(path.join(h.root, "runs")), []);
  h.setStale(false);
  prepared = await h.json("/api/scope", {});
  a.equal(
    (await h.json("/api/run", { scopeHash: prepared.data.scopeHash })).status,
    202,
  );
  await Promise.all([...h.service.jobs]);
  order = (await h.json("/api/order")).data;
  a.equal(order.state, "DELIVERED");
  a.equal(order.runs.length, 2);
  a.equal(order.runs[1].verdict, "VERIFIED");
  a.equal(await (await h.request(jsonPath)).text(), before);
  const delta = await (
    await h.request(`/download/${order.runs[1].id}/reassessment-diff.json`)
  ).json();
  a.equal(delta.priorVerdict, "NOT_PROVEN");
  a.equal(delta.currentVerdict, "VERIFIED");
  a.deepEqual(delta.resolved, [
    "CI_RAN_ON_FINAL_HEAD",
    "HUMAN_APPROVAL_PRESENT",
  ]);
  a.equal((await h.json("/api/scope", {})).status, 400);
  a.deepEqual(fs.readdirSync(path.join(h.root, "runs")), []);
  if (process.env.FACTORY_KEEP_TEST_REPORTS) {
    const out = path.resolve(process.env.FACTORY_KEEP_TEST_REPORTS);
    fs.mkdirSync(out, { recursive: true });
    fs.cpSync(path.join(h.store.root, "artifacts", eligible.data.id), out, {
      recursive: true,
    });
  }
});
test("eligibility blocks inaccessible or unsupported scope without taking payment", async (t) => {
  const h = await harness(t);
  h.setFail("AUTH_FAILED");
  const r = await h.json("/api/eligibility", eligibility);
  a.equal(r.data.eligibility, "NOT_ELIGIBLE");
  a.equal(Object.keys(h.store.data.orders).length, 0);
});
test("report failure is honest, retryable, preserves cleanup, escalates refund to Ryan", async (t) => {
  const h = await harness(t, {
    reporter: async () => {
      throw Error("sk_test_should_never_appear");
    },
  });
  const expectHttp = (result, expected, label) => {
    const error =
      typeof result?.data?.error === "string" &&
      /^[A-Z0-9_]+$/.test(result.data.error)
        ? result.data.error
        : null;
    a.equal(
      result.status,
      expected,
      `${label} HTTP status${error ? ` (${error})` : ""}`,
    );
    return result;
  };
  const o = expectHttp(
    await h.json("/api/eligibility", eligibility),
    200,
    "eligibility",
  ).data;
  expectHttp(await h.json("/api/checkout", {}), 200, "checkout");
  const payment = await h.pay(o.id);
  a.equal(payment.status, 200, "payment webhook HTTP status");
  expectHttp(
    await h.json("/api/authorize", { url: eligibility.url, pr: 1 }),
    200,
    "authorize",
  );
  for (let n = 0; n < 3; n++) {
    const p = expectHttp(await h.json("/api/scope", {}), 200, `scope ${n + 1}`).data;
    expectHttp(
      await h.json("/api/run", { scopeHash: p.scopeHash }),
      202,
      `run ${n + 1}`,
    );
    await Promise.all([...h.service.jobs]);
  }
  const state = expectHttp(await h.json("/api/order"), 200, "order").data;
  a.equal(state.state, "REFUND_REQUIRED");
  a.equal(state.failure, "REPORT_FAILED");
  a.equal(state.exception.owner, "Ryan");
  a.doesNotMatch(JSON.stringify(h.store.data), /should_never_appear/);
  a.deepEqual(fs.readdirSync(path.join(h.root, "runs")), []);
});
test("post-payment auth and unsupported history have explicit states", async (t) => {
  const h = await harness(t);
  const o = (await h.json("/api/eligibility", eligibility)).data;
  await h.json("/api/checkout", {});
  await h.pay(o.id);
  a.equal(
    (
      await h.json("/api/authorize", {
        url: "https://github.com/other/repo",
        pr: 1,
      })
    ).data.error,
    "AUTH_FAILED",
  );
  a.equal((await h.json("/api/order")).data.state, "RETRY");
  await h.json("/api/authorize", { url: eligibility.url, pr: 1 });
  h.setFail("UNSUPPORTED_HISTORY");
  await h.json("/api/scope", {});
  a.equal((await h.json("/api/order")).data.state, "REFUND_REQUIRED");
});
test("expired access is denied and artifacts are purged; unknown paid reference escalates", async (t) => {
  const h = await harness(t);
  const o = (await h.json("/api/eligibility", eligibility)).data;
  h.store.data.orders[o.id].expiresAt = Date.now() - 1;
  a.equal((await h.json("/api/order")).status, 401);
  h.service.purge();
  a.equal(h.store.data.orders[o.id], undefined);
  await h.pay("unknown");
  a.equal(h.store.data.exceptions[0].state, "REFUND_REQUIRED");
});
test("isolated runner has hard timeout and removes its working directory", async (t) => {
  const h = await harness(t, { timeoutMs: 1 });
  await a.rejects(h.runner.run(h.scope, hash("timeout")));
  a.deepEqual(fs.readdirSync(path.join(h.root, "runs")), []);
});
