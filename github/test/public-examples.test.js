"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const examples = require("../public-examples");
const truth = require("../merge-truth");

const privateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function server(t) {
  const service = {
    config: { origin: "http://127.0.0.1" },
    data: { receipts: { [privateId]: { privateMarker: "CUSTOMER_PRIVATE_MARKER" } } },
    customers: {
      session() { throw Object.assign(new Error("LOGIN_REQUIRED"), { code: "LOGIN_REQUIRED" }); },
    },
  };
  const instance = http.createServer(async (req, res) => {
    const handled = await require("../http").handle(
      service,
      req,
      res,
      new URL(req.url, "http://127.0.0.1"),
    );
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"NOT_FOUND"}');
    }
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    instance.closeAllConnections();
    instance.close(resolve);
  }));
  return `http://127.0.0.1:${instance.address().port}`;
}

test("public example projections preserve exact fail-closed Merge Truth semantics", () => {
  const expected = {
    verified: ["VERIFIED", "LANDED_TREE_EQUALS_PROVEN_TREE", "LANDED_VERIFIED"],
    fail: ["FAIL", "LANDED_TREE_DIFFERS_FROM_PROVEN_TREE", "LANDED_MISMATCH"],
    "not-proven": ["NOT_PROVEN", "LANDING_NOT_OBSERVED", "NOT_OBSERVED"],
  };
  for (const [kind, states] of Object.entries(expected)) {
    const value = examples.project(kind);
    a.deepEqual([value.relationship.verdict, value.relationship.reason, value.landing.state], states);
    a.equal(truth.verify(value).state, "CONSISTENT_PROJECTION");
    a.equal(value.reconciliation.state, "RECONCILED");
    a.equal(value.repository.name, "example/acme-service");
    a.equal(value.references.bundle, null);
    a.equal(value.references.replayPacket, null);
  }
});

test("anonymous visitors can inspect only the fixed public example namespace", async (t) => {
  const root = await server(t);
  for (const kind of ["verified", "fail", "not-proven"]) {
    const page = await fetch(`${root}/proof/examples/${kind}`);
    a.equal(page.status, 200);
    const html = await page.text();
    a.match(html, /EXAMPLE PROOF · SYNTHETIC PUBLIC DATA/);
    a.match(html, new RegExp(`Merge truth: ${kind === "not-proven" ? "NOT_PROVEN" : kind.toUpperCase()}`));
    a.match(html, /Optional advanced verification/);
    a.match(html, /NOT REQUIRED FOR NORMAL USE/);
    a.doesNotMatch(html, /CUSTOMER_PRIVATE_MARKER|\/Users\/|API[_ -]?KEY|PRIVATE[_ -]?KEY/i);

    const json = await fetch(`${root}/proof/examples/${kind}?format=json`);
    a.equal(json.status, 200);
    a.equal((await json.json()).relationship.verdict, kind === "not-proven" ? "NOT_PROVEN" : kind.toUpperCase());
  }
  const index = await fetch(`${root}/proof/examples/`);
  a.equal(index.status, 200);
  const overview = await index.text();
  a.match(overview, /PUBLIC · NO GITHUB ACCESS REQUIRED/);
  a.ok(overview.indexOf("THREE HONEST OUTCOMES") < overview.indexOf("CONNECT GITHUB"));

  for (const pathName of [
    "/proof/examples/../../receipts/" + privateId,
    "/proof/examples/%2e%2e%2freceipts%2f" + privateId,
    "/proof/examples/verified/replay-packet",
    "/proof/examples/" + privateId,
  ]) {
    const response = await fetch(root + pathName, { redirect: "manual" });
    a.equal(response.status, 404, pathName);
    a.doesNotMatch(await response.text(), /CUSTOMER_PRIVATE_MARKER/);
  }
});

test("anonymous private receipt, Merge Truth, bundle, and replay access remain denied", async (t) => {
  const root = await server(t);
  for (const suffix of ["", "/merge-truth", "/bundle", "/replay-packet", "/independent-verification"]) {
    const response = await fetch(`${root}/proof/receipts/${privateId}${suffix}`, {
      headers: { accept: "application/json" },
    });
    a.equal(response.status, 403, suffix);
    a.doesNotMatch(await response.text(), /CUSTOMER_PRIVATE_MARKER/);
  }
});

test("buyer copy states current pricing, trial, report-only, permissions, and trust boundaries", () => {
  const page = require("../customer-public").page;
  const homepage = fs.readFileSync(path.join(__dirname, "../../factory/public/index.html"), "utf8");
  for (const html of [page, homepage, examples.overview()]) {
    a.match(html, /\$29\/month per (?:observed )?active developer/i);
    a.match(html, /7 days free|7-day|seven-day/i);
    a.match(html, /No card/i);
    a.match(html, /observes? and reports? without blocking/i);
    a.match(html, /Actions, Administration, Commit statuses, Contents, Merge queues, Pull requests/i);
    a.match(html, /Checks: read and write/i);
    a.match(html, /Organization members: read/i);
    a.match(html, /no extra OAuth scopes/i);
  }
  const detail = examples.detail("verified");
  a.match(detail, /unsigned packet/i);
  a.match(detail, /does not authenticate GitHub\/provider records/i);
  a.match(detail, /does not.*public trust root/i);
  a.doesNotMatch(detail, /Proof-of-Control Tier 3|L3 complete|publicly anchored/i);
});

test("public examples contain no environment-derived, customer, or secret material", () => {
  const payload = JSON.stringify({
    pages: [examples.overview(), ...Object.keys(examples.descriptions).map((kind) => examples.detail(kind))],
    data: Object.keys(examples.descriptions).map((kind) => examples.project(kind)),
  });
  for (const forbidden of [
    /\/Users\/ryanwilliams\//,
    /CUSTOMER_PRIVATE_MARKER/,
    /GITHUB_(?:TOKEN|APP_PRIVATE_KEY|CLIENT_SECRET)/,
    /STRIPE_(?:SECRET|WEBHOOK_SECRET)/,
    /BEGIN (?:RSA |EC )?PRIVATE KEY/,
    /AKIA[0-9A-Z]{16}/,
  ]) a.doesNotMatch(payload, forbidden);
});
