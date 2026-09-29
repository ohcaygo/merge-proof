"use strict";

// Curated public examples. These are fixed synthetic facts projected through
// the same Merge Truth builder and buyer presentation as private receipts.
// They never read the receipt store, archive, customer session, or provider.
const mergeTruth = require("./merge-truth");
const landing = require("./landing");
const brand = require("./customer-brand");
const { escape } = require("./receipt");

const SHAS = Object.freeze({
  base: "1".repeat(40),
  head: "2".repeat(40),
  evaluatedTree: "3".repeat(40),
  merge: "4".repeat(40),
  differentTree: "5".repeat(40),
});
const issuedAt = "2026-09-28T15:00:00.000Z";

function currentClaims(claims) {
  return Object.fromEntries(claims.map((claim) => [claim.name, {
    state: "CURRENT",
    binding: claim.binding,
  }]));
}

function receipt(id, pr) {
  const claims = [
    { name: "TARGET", state: "PROVEN", binding: SHAS.head },
    { name: "CI_EXECUTED:test", state: "PROVEN", binding: SHAS.head },
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
      git: { state: "AVAILABLE", value: { headTree: SHAS.evaluatedTree, baseTree: SHAS.base } },
    },
    summary: {
      target: { state: "AVAILABLE", value: { kind: "HEAD_CONTAINS_CURRENT_BASE", sha: SHAS.head, tree: SHAS.evaluatedTree } },
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
  const value = receipt(definition.id, definition.pr);
  const receiptRow = { receipt: value, current: structuredClone(value.freshness) };
  if (!definition.landedTree)
    return mergeTruth.build({ receiptRow, reconciliation: reconciliationFor(value) });
  const record = recordFor(value);
  const observed = {
    ...landing.compare(record, {
      sha: SHAS.merge,
      tree: definition.landedTree,
      parents: [SHAS.base],
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
    copy: "The candidate had coherent evidence, but the actual landed tree is different. This is the mismatch Merge Proof exists to surface.",
  },
  "not-proven": {
    label: "NOT_PROVEN",
    title: "A required fact could not be established.",
    copy: "Candidate identity, evidence binding and currentness were established. No landing identity is bound, so Merge Proof refuses to guess.",
  },
});

const permissionsHtml = `<details class="permission-details"><summary>SEE EXACTLY WHAT WE REQUEST</summary><div class="detail-body"><p><strong>Standard GitHub App repository access</strong></p><ul><li><strong>Read:</strong> Actions, Administration, Commit statuses, Contents, Merge queues, Pull requests, and GitHub's mandatory Metadata permission. These reads collect workflow/check evidence, repository rules, Git identities, merge-queue state, PR state, and landed content identifiers.</li><li><strong>Checks: read and write.</strong> Read check results and publish or update the Merge Proof receipt Check on the PR.</li><li><strong>Organization members: read.</strong> Verify that the signed-in billing user is an organization owner.</li></ul><p><strong>GitHub sign-in:</strong> the OAuth request adds no extra OAuth scopes. The short-lived user token is kept in process memory while Merge Proof checks your identity, App installations, authorized repositories, and organization-owner status.</p><p><strong>What this grant does not include:</strong> Contents write, Secrets, Workflows write, or organization administration. The standard App cannot edit repository code, branch protection, or rulesets. A separate optional Enhanced Policy Proof companion, if explicitly enabled later, has repository Administration write authority but is constrained by Merge Proof to policy reads; it is not part of this standard connection.</p></div></details>`;

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
  return document("Example proofs", `<section class="example-hero"><p class="eyebrow">PUBLIC · NO GITHUB ACCESS REQUIRED</p><h1>Your checks passed.<br>But did that exact code land?</h1><p class="merge-truth-lede">GitHub, CI, and review evaluate a particular candidate. Merge Proof follows that evidence through landing and shows whether the evaluated content is actually the content that became merge truth.</p><ol class="example-progression" aria-label="How Merge Proof reaches a conclusion"><li>Evaluated tree</li><li>Evidence and currentness</li><li>Actual landed tree</li><li>VERIFIED / FAIL / NOT_PROVEN</li></ol></section><section class="example-picker" aria-labelledby="example-picker-title"><p class="eyebrow">THREE HONEST OUTCOMES</p><h2 id="example-picker-title">See what each conclusion means.</h2><div class="example-grid">${cards}</div></section><section class="example-commercial" aria-labelledby="try-title"><p class="eyebrow">SAFE TO TRY</p><h2 id="try-title">Observe and report—without blocking your merges.</h2><p>Merge Proof observes and reports without blocking your merges. Early Access reports what happened; it does not enable a required merge policy during the trial.</p><div class="product-choice"><article><h3>Free CLI · point-in-time verification</h3><p>Run or replay evidence yourself when you choose. Local use is free.</p><a href="https://github.com/ohcaygo/merge-proof#readme">Use the free CLI →</a></article><article><h3>Hosted Merge Proof · $29/month per observed active developer</h3><p>After the trial, hosted Merge Proof observes selected repositories, tracks PR evidence and currentness, reconciles provider history, observes supported landings, and retains proof receipts.</p></article></div><p><strong>First successful proof → seven-day no-card trial → $29/month per observed active developer.</strong> No automatic charge at trial expiry.</p><a class="primary" href="/proof/#connect-real">CONNECT GITHUB FOR A REAL PR</a><p>7 days free. No card. Connect GitHub only after you are ready.</p>${permissionsHtml}</section>`);
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
  return document(`${item.label} example proof`, `<header class="example-label"><p class="eyebrow">EXAMPLE PROOF · SYNTHETIC PUBLIC DATA</p><p>This demonstrates product behavior. It is not a customer result and is not evidence about a real repository.</p></header>${truthHtml}`);
}

module.exports = { descriptions, detail, overview, permissionsHtml, project };
