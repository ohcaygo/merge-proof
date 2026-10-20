"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "../public", name), "utf8");
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("homepage teaches issued verdict, currentness, policy and landing before requesting access", () => {
  const html = read("index.html");
  const example = html.match(/<aside\b[^>]*id="receipt"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(example, "a visible receipt example belongs in the opening, not below the connection flow");
  assert.match(text(example), /illustrative|synthetic/i);
  for (const label of ["Verdict when issued", "Currentness", "Policy", "Landing"]) {
    assert.ok(text(example).includes(label), `separate receipt field: ${label}`);
  }
  assert.match(example, /UNAVAILABLE/);
  assert.match(example, /NOT_PROVEN/);
  assert.ok(html.indexOf('id="receipt"') < html.indexOf('id="connect-real"'));
  const firstCTA = html.match(/<a\b[^>]*class="primary-cta"[^>]*>/)?.[0];
  assert.match(firstCTA || "", /href="\/proof\/examples\//, "primary CTA must be a no-access example");
  assert.match(html, /href="#connect-real"[^>]*>Start a 7-day trial/);
  assert.match(text(html), /Tree equality alone does not prove/i);
  assert.match(text(html), /merge queues already test combined changes/i);
  assert.match(text(html), /passing policy Check is not necessarily a VERIFIED receipt/i);
  assert.match(text(html), /not an atomic GitHub (?:merge )?decision/i);
});

test("opening evidence excerpt matches the existing public synthetic fixture", () => {
  const example = require("../../github/public-examples").project("verified");
  const html = read("index.html");
  const preview = html.match(/<aside\b[^>]*id="receipt"[\s\S]*?<\/aside>/)?.[0] || "";
  assert.ok(preview.includes(example.repository.name), "name the synthetic repository");
  assert.ok(preview.includes(`PR #${example.repository.pullRequest}`), "identify the source example");
  assert.ok(preview.includes(example.evaluated.target.tree.slice(0, 12)), "use the fixture's evaluated tree, not an invented hash");
  assert.match(preview, new RegExp(`<dt>Verdict when issued</dt><dd><code>${example.evaluated.receiptVerdict}</code>`));
  assert.match(preview, new RegExp(`<dt>Landing</dt><dd><code>${example.relationship.verdict}</code>`));
  assert.ok(preview.includes(example.landing.tree.slice(0, 12)), "show the matching landed tree");
  assert.ok(preview.includes('href="/proof/examples/verified"'), "inspect the fixture that the excerpt actually shows");
  assert.match(html, /class="disclosure reference-group"/);
  assert.match(preview, /Policy[\s\S]*?not (?:shown|established)/i);
  assert.doesNotMatch(preview, /required approval could not be established/i);
});

test("privacy discloses retained Git objects separately from receipt text and access revocation", () => {
  const html = read("privacy.html"), content = text(html);
  assert.match(content, /private partial bare mirror/i);
  assert.match(content, /exact Git (?:commit\/tree )?objects/i);
  assert.match(content, /blobs/i);
  assert.match(content, /not (?:persisted|stored|written) in receipts/i);
  assert.match(content, /receipt.*archive/i);
  assert.match(content, /eviction does not delete the historical archive/i);
  assert.match(content, /no customer-selectable deletion deadline/i);
  assert.match(content, /not automatically erase/i);
  assert.match(content, /operational backups/i);
  assert.match(content, /does not send source contents to an LLM or AI provider/i);
  assert.match(content, /Administration write.*broader/i);
  assert.match(content, /not a deletion request/i);
  assert.match(html, /mailto:support@ohcaygo\.com/);
  assert.doesNotMatch(content, /does not clone|independent exact-state merge evidence/i);
});

test("public offer, navigation anchors and semantic landmarks remain intact", () => {
  const html = read("index.html"), content = text(html);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<nav aria-label="Main navigation"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
  for (const id of ["prove", "how-it-works", "how-merge-proof-knows", "what-it-checks", "example-proofs", "connect-real", "receipt", "plain-english", "pricing"]) {
    assert.ok(ids.includes(id), `preserve inbound anchor #${id}`);
  }
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `resolve #${id}`);
  for (const [, labels] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of labels.split(" ")) assert.ok(ids.includes(id), `resolve accessible label ${id}`);
  }
  for (const href of ["/proof/", "/proof/examples/", "/proof/examples/verified", "/proof/examples/fail", "/proof/examples/not-proven", "/privacy", "/terms", "/legacy", "/sample"]) {
    assert.ok(html.includes(`href="${href}"`), `retain route ${href}`);
  }
  assert.match(content, /\$29\/month per observed active developer/);
  assert.match(content, /7-day hosted trial/i);
  assert.match(content, /CURRENT, collection-complete VERIFIED or NOT_PROVEN/);
  assert.match(content, /No automatic charge at trial expiry/i);
  assert.match(content, /new hosted proofs, re-proofs and scans pause/i);
  assert.match(content, /Previously configured enforcing policies remain enforced/);
  assert.match(content, /Increases require confirmation/);
  assert.match(content, /Administration write authority.*policy reads/i);
  assert.match(content, /no customer-selectable deletion deadline/i);
  assert.doesNotMatch(content, /Level.?3 (?:certified|complete)|saves? \d+%|trusted by \d+/i);
});

test("homepage record layout rules remain scoped within the shared public theme", () => {
  const css = read("brand.css");
  assert.match(css, /\.home-page \.example-list/);
  assert.match(css, /\.home-page \.opening-receipt/);
  assert.match(css, /\.home-page \.evidence-sequence/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.home-page/);
});

test("hosted entry matches homepage framing without changing access or trial boundaries", () => {
  const page = require("../../github/customer-public").page;
  const homepageTitle = text(read("index.html").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]).trim();
  const entryTitle = text(page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]).trim();
  assert.equal(entryTitle, homepageTitle);
  assert.match(page, /Inspect an example receipt/);
  assert.match(page, /fixed synthetic data, not customer results/);
  assert.doesNotMatch(page, /Your checks passed|became merge truth/);
  for (const id of ["welcome", "connect-real", "connect", "connected", "workspace", "status"]) {
    assert.ok(page.includes(`id="${id}"`), `preserve flow ID ${id}`);
  }
  assert.match(page, /id="connect" class="primary" href="\/proof\/login"/);
  assert.match(page, /7 days free\. No card\./);
  assert.match(page, /\$29\/month per observed active developer/);
  assert.match(page, /private partial bare mirror/);
  assert.match(page, /Administration write authority/);
});

test("public example overview uses grounded framing without changing synthetic outcomes", () => {
  const examples = require("../../github/public-examples");
  const overview = examples.overview();
  assert.match(overview, /Inspect the evidence before granting access/);
  assert.match(overview, /synthetic examples/i);
  assert.match(overview, /Candidate evidence and landed-content conclusions stay separate/);
  assert.doesNotMatch(overview, /Your checks passed|became merge truth/);
  for (const kind of ["verified", "fail", "not-proven"]) {
    assert.ok(overview.includes(`/proof/examples/${kind}`));
    assert.equal(examples.project(kind).relationship.verdict,
      kind === "not-proven" ? "NOT_PROVEN" : kind.toUpperCase());
  }
});

test("editorial opening presents a full technical record and keeps authorization facts visible", () => {
  const html = read("index.html");
  assert.match(html, /class="record-heading"/);
  assert.match(html, /class="record-evidence"/);
  assert.match(html, /class="record-facts"/);
  assert.match(html, /<details class="disclosure method-reference"><summary>Candidate, evidence, currentness and landing/);
  const access = html.slice(html.indexOf('id="connect-real"'), html.indexOf('id="pricing"'));
  const visible = text(access.replace(/<details\b[\s\S]*?<\/details>/g, ""));
  for (const phrase of ["Contents read is real source access", "private partial bare mirror", "not automatically erased on uninstall", "no customer-selectable deletion deadline", "no Contents write authority"]) {
    assert.ok(visible.includes(phrase), `material authorization fact remains visible: ${phrase}`);
  }
  const css = read("brand.css");
  assert.match(css, /font-family:.*Georgia/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient|backdrop-filter|box-shadow/);
});

test("invited entry discloses retained Git objects consistently without changing its offer", () => {
  const html = read("early-access.html"), copy = text(html);
  assert.match(copy, /private partial bare mirror/);
  assert.match(copy, /exact Git objects and receipt refs/);
  assert.match(copy, /not automatically erased on uninstall/);
  assert.doesNotMatch(copy, /does not clone your repository tree/);
  assert.match(copy, /10 calendar days of hosted, report-only access/);
  assert.match(copy, /ordinary public offer of 7 days/);
  assert.match(copy, /does not execute customer code or send source contents to an AI provider/);
});

test("existing landing attribution keeps only coarse channels and legacy routing", () => {
  const vm = require("node:vm");
  for (const [query, expected] of [["", "direct"], ["?utm_source=x&click_id=secret", "x"], ["?utm_source=twitter", "x"], ["?utm_source=arbitrary-private-text", "other"]]) {
    const link = { href: "/proof/" }, replacements = [];
    vm.runInNewContext(read("landing.js"), {
      URLSearchParams, location: { search: query, hash: "#access=legacy", replace: (s) => replacements.push(s) },
      document: { querySelectorAll: (selector) => { assert.equal(selector, 'a[href="/proof/"]'); return [link]; } },
    });
    assert.equal(link.href, "/proof/?source=" + expected);
    assert.deepEqual(replacements, ["/legacy#access=legacy"]);
  }
});
