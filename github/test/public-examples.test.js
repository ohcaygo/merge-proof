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

test("base-moved illustration is the exact coherent landing mismatch projected by the FAIL receipt", () => {
  const value = examples.project("fail");
  a.equal(value.evaluated.target.kind, "PR_TEST_MERGE");
  a.equal(value.evaluated.target.commit, examples.SHAS.evaluatedTarget);
  a.equal(value.evaluated.target.tree, examples.SHAS.evaluatedTree);
  a.equal(value.landing.mergeCommit, examples.SHAS.merge);
  a.equal(value.landing.tree, examples.SHAS.differentTree);
  a.equal(value.landing.parents[0], examples.SHAS.baseAfter);
  a.equal(value.landing.parents[1], examples.SHAS.head);
  a.equal(value.relationship.verdict, "FAIL");
  a.equal(value.relationship.reason, "LANDED_TREE_DIFFERS_FROM_PROVEN_TREE");
  a.equal(value.landing.state, "LANDED_MISMATCH");

  const html = examples.detail("fail");
  for (const phrase of [
    "ILLUSTRATION · LOOSE REQUIRED CHECKS · NO MERGE QUEUE",
    "EVERY REQUIRED CHECK PASSED",
    "MEANWHILE, MAIN MOVED",
    "PR #41 MERGED TOO",
    "Merge Truth: FAIL",
    "EXAMPLE MERGE-PROOF RECEIPT",
    "requiring branches to be up to date or using a merge queue",
  ]) a.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  a.ok(html.indexOf("ILLUSTRATION") < html.indexOf("EXAMPLE MERGE-PROOF RECEIPT"));
  a.ok(html.indexOf("EXAMPLE MERGE-PROOF RECEIPT") < html.indexOf("Merge truth: FAIL"));
});

test("examples overview mechanism explains provider evidence, Git identity, and all three outcomes without trust overclaim", () => {
  const overview = examples.overview();
  const evaluated = examples.SHAS.evaluatedTree.slice(0, 12);
  const landed = examples.SHAS.differentTree.slice(0, 12);
  for (const html of [overview]) {
    for (const phrase of [
      "HOW MERGE PROOF KNOWS",
      "Provider evidence",
      "Evaluated tree",
      "Provider history",
      "Landing observation",
      "Actual landed tree",
      "Required evidence is satisfied and the evaluated tree landed.",
      "FAIL · DIFFERENT CONTENT LANDED",
      "The required landing comparison cannot be completed, so Merge Proof does not guess.",
      "They do not independently authenticate GitHub's checks, reviews or merge records.",
    ]) a.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    a.match(html, new RegExp(`${evaluated} = ${evaluated}`));
    a.match(html, new RegExp(`${evaluated} ≠ ${landed}`));
    a.match(html, new RegExp(`${evaluated} vs unavailable`));
    a.ok(html.indexOf("HOW MERGE PROOF KNOWS") < html.indexOf("THREE HONEST OUTCOMES"));
    a.ok(html.indexOf("THREE HONEST OUTCOMES") < html.indexOf("CONNECT GITHUB"));
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
  const permissions = examples.permissionsHtml;
  a.match(permissions, /Contents read is real source access/i);
  a.match(permissions, /private partial bare mirror/i);
  a.match(permissions, /No source contents are sent to an LLM or AI provider/i);
  a.match(permissions, /cannot push commits, change branches or files, merge or close PRs, post PR comments/i);
  a.match(permissions, /not automatically erased/i);
});

test("five-question example security summary preserves the audited access, persistence, AI, and write boundaries", () => {
  for (const html of [examples.overview(), examples.securitySummaryHtml]) {
    for (const question of [
      "Can Merge Proof access source?",
      "Do you store my source?",
      "Does my source go to AI?",
      "Can Merge Proof change my code?",
      "What can Merge Proof write?",
    ]) a.match(html, new RegExp(question.replace(/[?]/g, "\\?")));
    a.match(html, /Contents read is real source access/i);
    a.match(html, /private partial bare mirror retains exact Git objects/i);
    a.match(html, /Source contents are not sent to an LLM or AI provider/i);
    a.match(html, /no Contents write authority/i);
    a.match(html, /Checks read\/write lets it publish or update its receipt Check/i);
    a.match(html, /does not grant repository-file write authority/i);
  }
  for (const html of [examples.overview(), examples.permissionsHtml])
    a.match(html, /FULL PERMISSION &amp; DATA-HANDLING DETAILS/i);
});

test("homepage evidence-first composition preserves fixture provenance, uncertainty, and example access before connection", () => {
  const homepage = fs.readFileSync(path.join(__dirname, "../../factory/public/index.html"), "utf8");
  const text = homepage.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const fixture = examples.project("verified");
  const excerpt = homepage.match(/<aside\b[^>]*id="receipt"[\s\S]*?<\/aside>/)?.[0] || "";
  a.match(excerpt, /SYNTHETIC/);
  a.match(excerpt, /NOT LIVE/);
  a.match(excerpt, /PR #101/);
  a.ok(excerpt.includes(fixture.repository.name));
  a.ok(excerpt.includes(fixture.evaluated.target.tree.slice(0, 12)));
  a.ok(excerpt.includes(fixture.landing.tree.slice(0, 12)));
  a.match(excerpt, /<dt>Verdict when issued<\/dt><dd><code>VERIFIED<\/code>/);
  a.match(excerpt, /<dt>Landing<\/dt><dd><code>VERIFIED<\/code>/);
  a.match(excerpt, /Currentness/);
  a.match(excerpt, /Merge-decision state: UNAVAILABLE/);
  a.match(excerpt, /Enforcement not established/);
  for (const kind of ["verified", "fail", "not-proven"]) a.ok(homepage.includes(`href="/proof/examples/${kind}"`));
  a.ok(homepage.indexOf('id="receipt"') < homepage.indexOf('id="connect-real"'));
  a.match(homepage.match(/class="primary-cta"[^>]*>/)[0], /href="\/proof\/examples\//);
  a.match(text, /Tree equality alone does not prove that tests ran/);
  a.match(text, /Git identities identify content; they do not independently authenticate those provider facts/);
  a.match(text, /merge queues already test combined changes/);
  a.match(text, /not an atomic GitHub merge decision/);
});

test("homepage access disclosure preserves all five audited security answers before authorization", () => {
  const homepage = fs.readFileSync(path.join(__dirname, "../../factory/public/index.html"), "utf8");
  const start = homepage.indexOf('id="connect-real"');
  const connect = homepage.indexOf('href="/proof/"', start);
  a.ok(start >= 0 && connect > start);
  const access = homepage.slice(start, connect).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  // Check the five answers, not their former question-card wording/layout.
  a.match(access, /Contents read is real source access/);
  a.match(access, /private partial bare mirror/);
  a.match(access, /retains exact Git objects and receipt refs/);
  a.match(access, /not incidental API patches or decoded workflow text/);
  a.match(access, /does not send source contents to an LLM or AI provider/);
  a.match(access, /no AI model decides the verdict/i);
  a.match(access, /no Contents write authority/);
  a.match(access, /cannot push commits, modify files or workflows, merge or close PRs, post PR comments, or change branch protection and rulesets/);
  a.match(access, /standard App can publish or update its own receipt Check/);
  a.match(access, /Checks: read and write/);
  a.match(access, /cannot change repository files/);
  a.match(access, /Organization members: read/);
  a.match(access, /no extra OAuth scopes/);
  a.match(access, /Administration write authority.*constrained.*policy reads/);
  a.match(access, /not part of this standard connection/);
  a.match(access, /not automatically erased/);
  a.match(access, /operational backups/);
  a.match(access, /no customer-selectable deletion deadline or automatic uninstall purge/);
  a.match(access, /current installation\/repository access is rechecked/);
  a.match(access, /observes and reports without blocking your merges/);
  a.match(access, /previously configured enforcing policies remain enforced/i);
  a.ok(homepage.slice(start, connect).includes('href="/privacy"'));
});

test("documented data boundary matches current runtime dependencies and standard App request", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
  a.deepEqual(pkg.dependencies, {});
  const hosted = ["app.js", "client.js", "collect.js", "mirror.js", "reconstruct.js", "service.js"]
    .map((name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8"))
    .join("\n");
  a.doesNotMatch(hosted, /api\.(?:openai|anthropic)\.com|generativelanguage\.googleapis\.com/i);
  a.match(hosted, /contents:\s*"read"/);
  a.match(hosted, /checks:\s*config\.publishChecks \? "write" : "read"/);
  a.doesNotMatch(hosted, /contents:\s*"write"|workflows:\s*"write"|pull_requests:\s*"write"/);
  a.match(hosted, /--filter=blob:none/);
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
