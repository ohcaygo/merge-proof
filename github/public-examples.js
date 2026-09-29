"use strict";

// Curated public examples. These are fixed synthetic facts projected through
// the same Merge Truth builder and buyer presentation as private receipts.
// They never read the receipt store, archive, customer session, or provider.
const mergeTruth = require("./merge-truth");
const landing = require("./landing");
const brand = require("./customer-brand");
const { escape } = require("./receipt");

const SHAS = Object.freeze({
  base: "b9d4c5768e34cc502b41943a3a67a273eea808ea",
  baseAfter: "aa603530d21b1f993aea4d7fbac0ac5ad147b8d2",
  head: "ff6be1f9c318bbe7648abb1e0070666e2226bf99",
  headTree: "7b0e72f0c1a9dc0eecb257ed42518166174ae699",
  evaluatedTarget: "a9aa3501363fca80a047615b2e5a92324ba4bd9e",
  evaluatedTree: "b1ec95450a69e8d501594a7b727c3145720cca8e",
  merge: "6bb4a8da2f46e7387a0253117e47af656674bd3c",
  differentTree: "13426dad63358629ea49a886d4742a6d297d7b93",
});
const issuedAt = "2026-09-28T15:00:00.000Z";

function currentClaims(claims) {
  return Object.fromEntries(claims.map((claim) => [claim.name, {
    state: "CURRENT",
    binding: claim.binding,
  }]));
}

function receipt(id, pr, options = {}) {
  const targetSha = options.targetSha || SHAS.head;
  const claims = [
    { name: "TARGET", state: "PROVEN", binding: targetSha },
    { name: "CI_EXECUTED:test", state: "PROVEN", binding: targetSha },
    { name: "APPROVAL_CURRENT", state: "PROVEN", binding: SHAS.head },
    { name: "RULES_SNAPSHOT", state: "PROVEN", binding: SHAS.base },
    { name: "REMOTE_DURABLE", state: "PROVEN", binding: SHAS.head },
  ];
  return {
    schema: "urn:merge-proof:receipt:example:1",
    receiptId: id,
    observationId: `example-observation-${pr}`,
    issuedAt,
    policy: "github-exact-state-v3",
    policySnapshot: { example: true, label: "Public synthetic example" },
    verdict: "VERIFIED",
    identity: {
      repository: "example/acme-service",
      repositoryId: 424242,
      pr,
      headSha: SHAS.head,
      baseSha: SHAS.base,
    },
    evidence: {
      git: { state: "AVAILABLE", value: { headTree: options.headTree || SHAS.evaluatedTree, baseTree: SHAS.base } },
    },
    summary: {
      target: { state: "AVAILABLE", value: { kind: options.targetKind || "HEAD_CONTAINS_CURRENT_BASE", sha: targetSha, tree: SHAS.evaluatedTree } },
      authorization: { state: "PROVEN", subject: SHAS.head, counted: [{ id: 9001, login: "reviewer" }] },
      ci: { required: [{ name: "test", appId: 101 }] },
      approval: { required: 1 },
      rules: { state: "AVAILABLE", source: "GITHUB_REPORTED" },
    },
    claims,
    gaps: [],
    freshness: { state: "CURRENT", asOf: issuedAt, claims: currentClaims(claims) },
    expectedTree: { status: "RECONSTRUCTED", tree: SHAS.evaluatedTree, flags: [] },
  };
}

function recordFor(value) {
  return {
    recordId: "10000000-0000-4000-8000-000000000001",
    repository: value.identity.repository,
    repositoryId: value.identity.repositoryId,
    pr: value.identity.pr,
    mergedAt: "2026-09-28T15:03:00.000Z",
    mergedHeadSha: value.identity.headSha,
    mergeCommitSha: SHAS.merge,
    proof: {
      receiptSnapshot: structuredClone(value),
      currentnessAtDelivery: {
        state: "CURRENT",
        asOf: "2026-09-28T15:02:30.000Z",
        claims: currentClaims(value.claims),
      },
      currentnessAtMerge: { state: "UNAVAILABLE", reason: "MERGE_DECISION_NOT_ATOMICALLY_OBSERVED" },
    },
  };
}

function reconciliationFor(value) {
  return {
    state: "RECONCILED",
    asOf: "2026-09-28T15:05:00.000Z",
    subject: {
      repositoryId: value.identity.repositoryId,
      pullRequest: value.identity.pr,
      candidate: value.identity.headSha,
    },
  };
}

function project(kind) {
  const definitions = {
    verified: { id: "11111111-1111-4111-8111-111111111111", pr: 101, landedTree: SHAS.evaluatedTree },
    fail: { id: "22222222-2222-4222-8222-222222222222", pr: 102, landedTree: SHAS.differentTree },
    "not-proven": { id: "33333333-3333-4333-8333-333333333333", pr: 103, landedTree: null },
  };
  const definition = definitions[kind];
  if (!definition) return null;
  const value = receipt(definition.id, definition.pr, kind === "fail" ? {
    targetKind: "PR_TEST_MERGE",
    targetSha: SHAS.evaluatedTarget,
    headTree: SHAS.headTree,
  } : {});
  const receiptRow = { receipt: value, current: structuredClone(value.freshness) };
  if (!definition.landedTree)
    return mergeTruth.build({ receiptRow, reconciliation: reconciliationFor(value) });
  const record = recordFor(value);
  const observed = {
    ...landing.compare(record, {
      sha: SHAS.merge,
      tree: definition.landedTree,
      parents: kind === "fail" ? [SHAS.baseAfter, SHAS.head] : [SHAS.base],
    }),
    observationId: `example-landing-${kind}`,
    recordedAt: "2026-09-28T15:03:10.000Z",
  };
  return mergeTruth.build({ receiptRow, record, landing: observed, reconciliation: reconciliationFor(value) });
}

const descriptions = Object.freeze({
  verified: {
    label: "VERIFIED",
    title: "The evaluated tree is the tree that landed.",
    copy: "Checks and approval applied to one exact candidate. The observed landed tree matches the evaluated merge-target tree.",
  },
  fail: {
    label: "FAIL",
    title: "Different content landed.",
    copy: "Required checks passed for PR #41 against main at M0. Main advanced, loose required checks allowed the PR to merge without retesting that combination, and a different tree landed.",
  },
  "not-proven": {
    label: "NOT_PROVEN",
    title: "A required fact could not be established.",
    copy: "Candidate identity, evidence binding and currentness were established. No landing identity is bound, so Merge Proof refuses to guess.",
  },
});

function mechanismHtml() {
  const evaluated = SHAS.evaluatedTree.slice(0, 12);
  const landed = SHAS.differentTree.slice(0, 12);
  return `<section class="mechanism-section" aria-labelledby="mechanism-title"><div class="mechanism-heading"><div><p class="eyebrow">HOW MERGE PROOF KNOWS</p><h2 id="mechanism-title">Bind the evidence. Identify what landed. Compare.</h2></div><p>GitHub reports checks, reviews and merge history. Git commit and tree IDs name the exact content. Merge Proof keeps those facts distinct and makes the deterministic comparison.</p></div><ol class="mechanism-flow" aria-label="How Merge Proof reaches a merge-truth conclusion"><li><span class="mechanism-source">Provider evidence</span><strong>GitHub evidence</strong><small>Checks, reviews and PR state bound to one observed candidate.</small></li><li><span class="mechanism-source">Git identity</span><strong>Evaluated tree</strong><small><code>${evaluated}</code></small></li><li><span class="mechanism-source">Provider history</span><strong>Landing observation</strong><small>Merged commit and landing event, when available.</small></li><li><span class="mechanism-source">Git identity</span><strong>Actual landed tree</strong><small><code>${landed}</code> or unavailable.</small></li><li><span class="mechanism-source">Merge Proof</span><strong>Compare</strong><small>Same, different, or missing a required fact.</small></li></ol><div class="mechanism-results" aria-label="Possible deterministic comparison outcomes"><article class="same"><code>${evaluated} = ${evaluated}</code><strong>VERIFIED</strong><small>Required evidence is satisfied and the evaluated tree landed.</small></article><article class="different"><code>${evaluated} ≠ ${landed}</code><strong>FAIL · DIFFERENT CONTENT LANDED</strong><small>A sufficiently bound comparison demonstrated a mismatch.</small></article><article class="missing"><code>${evaluated} vs unavailable</code><strong>NOT_PROVEN</strong><small>The required landing comparison cannot be completed, so Merge Proof does not guess.</small></article></div><p class="mechanism-boundary"><strong>Important boundary:</strong> Git identities identify content. They do not independently authenticate GitHub's checks, reviews or merge records.</p></section>`;
}

const securitySummaryHtml = `<section class="security-summary" aria-labelledby="security-title"><p class="eyebrow">SECURITY &amp; ACCESS</p><h3 id="security-title">Don't trust Merge Proof more than necessary.</h3><p>See exactly what authority you grant before connecting.</p><div class="security-questions"><article><h4>Can Merge Proof access source?</h4><p><strong>Yes. Contents read is real source access.</strong> Workflow text, API patch text and exact Git objects may reach the server to bind identities and reconstruct supported tree facts.</p></article><article><h4>Do you store my source?</h4><p>Receipts store normalized evidence, paths, hashes and proof facts—not incidental patch or decoded workflow text. A private partial bare mirror retains exact Git objects and receipt refs for replay.</p></article><article><h4>Does my source go to AI?</h4><p><strong>No.</strong> Source contents are not sent to an LLM or AI provider, and no AI model decides the verdict.</p></article><article><h4>Can Merge Proof change my code?</h4><p><strong>Not through the standard connection.</strong> It has no Contents write authority and cannot push commits or modify repository files.</p></article><article><h4>What can Merge Proof write?</h4><p>Checks read/write lets it publish or update its receipt Check on the PR. That does not grant repository-file write authority.</p></article></div></section>`;

const permissionsHtml = `${securitySummaryHtml}<details class="permission-details"><summary>FULL PERMISSION &amp; DATA-HANDLING DETAILS</summary><div class="detail-body"><p><strong>Don't trust Merge Proof more than necessary. See the exact authority before connecting.</strong></p><p><strong>Standard GitHub App repository access</strong></p><ul><li><strong>Read:</strong> Actions, Administration, Commit statuses, Contents, Merge queues, Pull requests, and GitHub's mandatory Metadata permission. These reads collect workflow/check evidence, repository rules, Git identities, merge-queue state, PR state, and landed content identifiers.</li><li><strong>Checks: read and write.</strong> Read check results and publish or update the Merge Proof receipt Check on the PR. That write can create or update this App's Check Run output; it cannot change repository files.</li><li><strong>Organization members: read.</strong> Verify that the signed-in billing user is an organization owner.</li></ul><p><strong>GitHub sign-in:</strong> the OAuth request adds no extra OAuth scopes. The short-lived user token is kept in process memory while Merge Proof checks your identity, App installations, authorized repositories, and organization-owner status.</p><p><strong>Technical access and processing:</strong> Contents read is real source access. GitHub API responses can include workflow text and diff patches, and reconstruction fetches exact Git objects into a private partial bare mirror. Merge Proof uses these inputs to bind identifiers, inspect workflow action references, and deterministically reconstruct trees; it does not execute customer code.</p><p><strong>Persistence and AI boundary:</strong> receipts retain normalized evidence, identifiers, paths, hashes, rules, checks, reviews, actors, workflow provenance, and reconstructed Git facts. Exact Git objects and receipt references are retained for replay. Incidental API patch text and decoded workflow text are not written into receipts. No source contents are sent to an LLM or AI provider; no AI model decides the verdict.</p><p><strong>Write authority:</strong> this standard grant does not include Contents write, Secrets, Workflows write, or organization administration. It cannot push commits, change branches or files, merge or close PRs, post PR comments, alter repository settings, edit branch protection/rulesets, or modify Actions workflows. A separate optional Enhanced Policy Proof companion, if explicitly enabled later, has repository Administration write authority but is constrained by Merge Proof to policy reads; it is not part of this standard connection.</p><p><strong>After uninstall or revocation:</strong> new collection stops and hosted access fails closed because current installation/repository access is rechecked. Historical receipts, evidence, retained Git objects, account records, and operational backups are not automatically erased; current code defines durable retention, not a customer-selectable deletion deadline.</p></div></details>`;

function scenarioHtml() {
  const short = (value) => value.slice(0, 12);
  return `<section class="example-scenario" aria-labelledby="scenario-title"><p class="eyebrow">ILLUSTRATION · LOOSE REQUIRED CHECKS · NO MERGE QUEUE</p><h1 id="scenario-title">All required checks passed. Then main moved.</h1><p>This is one supported GitHub configuration—not a universal merge path and not a claim that GitHub is broken.</p><ol class="scenario-frames"><li><p class="eyebrow">1 · EVERY REQUIRED CHECK PASSED</p><h2>PR #41 was evaluated against main at M0.</h2><dl><dt>PR head</dt><dd><code>${short(SHAS.head)}</code></dd><dt>GitHub test-merge target</dt><dd><code>${short(SHAS.evaluatedTarget)}</code></dd><dt>Evaluated tree E0</dt><dd><code>${short(SHAS.evaluatedTree)}</code></dd></dl><p>Required CI and approval evidence were bound to that exact evaluated state.</p></li><li><p class="eyebrow">2 · MEANWHILE, MAIN MOVED</p><h2>An ordinary PR #40 advanced main.</h2><dl><dt>Before</dt><dd><code>${short(SHAS.base)}</code></dd><dt>After</dt><dd><code>${short(SHAS.baseAfter)}</code></dd></dl><p>PR #41's head did not change, but its combination with main did.</p></li><li><p class="eyebrow">3 · PR #41 MERGED TOO</p><h2>Loose required checks did not require that new combination to be retested.</h2><dl><dt>Landed commit</dt><dd><code>${short(SHAS.merge)}</code></dd><dt>Actual landed tree L1</dt><dd><code>${short(SHAS.differentTree)}</code></dd></dl><p>No bypass or rogue actor is assumed.</p></li><li><p class="eyebrow">4 · COMPARE</p><h2>The evaluated and landed trees differ.</h2><dl><dt>Evaluated E0</dt><dd><code>${short(SHAS.evaluatedTree)}</code></dd><dt>Landed L1</dt><dd><code>${short(SHAS.differentTree)}</code></dd></dl><p class="scenario-result"><strong>Merge Truth: FAIL</strong> · LANDED_MISMATCH</p></li></ol><p class="scenario-boundary"><strong>When this path does not apply:</strong> requiring branches to be up to date or using a merge queue makes GitHub form and check a current combined state before merge.</p></section><header class="example-receipt-label"><p class="eyebrow">EXAMPLE MERGE-PROOF RECEIPT</p><p>The receipt below is the proof artifact. The illustration above only explains its facts.</p></header>`;
}

function optionalVerification() {
  return `<aside class="independent-verification-status" aria-label="Optional advanced verification"><p class="independent-verification-heading"><span>Optional advanced verification</span><strong>NOT REQUIRED FOR NORMAL USE</strong></p><h2>Recompute Git-derived facts when you want extra assurance.</h2><p>A real replay packet can be checked against a separately acquired repository copy. This can independently recompute Git-derived facts. It does not authenticate GitHub/provider records, prove the unsigned packet's provenance, or create a public trust root.</p><small>Commands, hashes, and machine rows remain available on eligible real receipts for developers and security teams who want them.</small></aside>`;
}

function outcomeNotes(kind) {
  if (kind !== "not-proven") return "";
  return `<section class="example-facts" aria-labelledby="example-facts-title"><h2 id="example-facts-title">Why this is NOT_PROVEN—not an application error</h2><div class="example-fact-grid"><article><p class="eyebrow">MERGE PROOF ESTABLISHED</p><ul><li>Candidate identity and evaluated tree</li><li>Bound evidence and approval authority</li><li>Currentness at the retained observation</li><li>Reconciled provider history through the proof point</li></ul></article><article><p class="eyebrow">COULD NOT ESTABLISH</p><ul><li>A merge event bound to this receipt</li><li>The actual landed commit and tree</li><li>Whether evaluated and landed content correspond</li></ul></article></div><p><strong>Conclusion: NOT_PROVEN.</strong> Merge Proof refused to infer the missing landing fact.</p></section>`;
}

function document(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Merge Proof</title><style>${brand.css}</style><body class="brand-page proof-page">${brand.header}<main id="main">${body}</main><footer><p>Public examples use fixed synthetic data. No customer receipt is loaded.</p></footer></body></html>`;
}

function overview() {
  const cards = Object.entries(descriptions).map(([kind, item]) => `<article class="example-card"><p class="eyebrow">EXAMPLE PROOF · ${escape(item.label)}</p><h2>${escape(item.title)}</h2><p>${escape(item.copy)}</p><a class="primary" href="/proof/examples/${kind}">INSPECT ${escape(item.label)}</a></article>`).join("");
  return document("Example proofs", `<section class="example-hero"><p class="eyebrow">PUBLIC · NO GITHUB ACCESS REQUIRED</p><h1>Your checks passed.<br>But did that exact code land?</h1><p class="merge-truth-lede">GitHub, CI, and review evaluate a particular candidate. Merge Proof follows that evidence through landing and shows whether the evaluated content is actually the content that became merge truth.</p></section>${mechanismHtml()}<section class="example-picker" aria-labelledby="example-picker-title"><p class="eyebrow">THREE HONEST OUTCOMES</p><h2 id="example-picker-title">See what each conclusion means.</h2><div class="example-grid">${cards}</div></section><section class="example-commercial" aria-labelledby="try-title"><p class="eyebrow">SAFE TO TRY</p><h2 id="try-title">Observe and report—without blocking your merges.</h2><p>Merge Proof observes and reports without blocking your merges. Early Access reports what happened; it does not enable a required merge policy during the trial.</p><div class="product-choice"><article><h3>Free CLI · point-in-time verification</h3><p>Run or replay evidence yourself when you choose. Local use is free.</p><a href="https://github.com/ohcaygo/merge-proof#readme">Use the free CLI →</a></article><article><h3>Hosted Merge Proof · $29/month per observed active developer</h3><p>After the trial, hosted Merge Proof observes selected repositories, tracks PR evidence and currentness, reconciles provider history, observes supported landings, and retains proof receipts.</p></article></div><p><strong>First successful proof → seven-day no-card trial → $29/month per observed active developer.</strong> No automatic charge at trial expiry.</p><a class="primary" href="/proof/#connect-real">CONNECT GITHUB FOR A REAL PR</a><p>7 days free. No card. Connect GitHub only after you are ready.</p>${permissionsHtml}</section>`);
}

function detail(kind, options = {}) {
  const value = project(kind);
  if (!value) return null;
  if (options.json) return value;
  const item = descriptions[kind];
  const supporting = `${outcomeNotes(kind)}<section class="example-next"><a href="/proof/examples/">← View all example outcomes</a><a class="primary" href="/proof/#connect-real">TRY IT ON A REAL PR</a></section>`;
  const truthHtml = mergeTruth.html(value, escape, supporting, optionalVerification(), {
    mergeTruthUrl: `/proof/examples/${kind}?format=json`,
  });
  return document(`${item.label} example proof`, `<header class="example-label"><p class="eyebrow">EXAMPLE PROOF · SYNTHETIC PUBLIC DATA</p><p>This demonstrates product behavior. It is not a customer result and is not evidence about a real repository.</p></header>${kind === "fail" ? scenarioHtml() : ""}${truthHtml}`);
}

module.exports = { SHAS, descriptions, detail, mechanismHtml, overview, permissionsHtml, project, securitySummaryHtml };
