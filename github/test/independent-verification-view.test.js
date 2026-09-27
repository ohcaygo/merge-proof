"use strict";

const { test } = require("node:test");
const a = require("node:assert/strict");
const view = require("../independent-verification-view");
const escape = require("../receipt").escape;

const kinds = [
  "BASE_COMMIT", "HEAD_COMMIT", "CANDIDATE_COMMIT", "HEAD_TREE", "BASE_TREE", "CANDIDATE_TREE",
  "RECORDED_MERGE_BASE", "MERGE_BASE_RELATIONSHIP", "TEST_MERGE_PARENTS", "EXPECTED_TREE",
  "LANDED_COMMIT", "LANDED_TREE", "LANDED_PARENTS",
];

function result(overrides = {}) {
  return {
    schema: "urn:merge-proof:independent-verification-result:1",
    state: "INDEPENDENT_VERIFICATION_COMPLETE",
    replayConsistency: { state: "REPLAY_CONSISTENT" },
    independentlyRecomputedGitFacts: { state: "INDEPENDENTLY_RECOMPUTED", rows: kinds.map(kind => ({ kind, state: "MATCH", actual: "a".repeat(40) })) },
    providerRecordTrustedFacts: { state: "NOT_INDEPENDENTLY_AUTHENTICATED" },
    exitCode: 0,
    ...overrides,
  };
}

test("buyer projection leads with independently recomputed Git value while preserving provider and provenance limits", () => {
  const projected = view.project(result());
  a.equal(projected.state, "COMPLETE");
  a.equal(projected.matched, 13);
  a.equal(projected.total, 13);
  a.match(projected.providerBoundary, /Checks, approvals, repository rules, currentness, provider history and repository\/PR association remain provider-supplied/);
  a.match(projected.provenanceBoundary, /unsigned/);
  const summary = view.summaryHtml(result(), { detailUrl: "/detail" }, escape);
  a.match(summary, /Git facts independently recomputed/);
  a.match(summary, /13 \/ 13 matched/);
  a.match(summary, /What still relies on GitHub/);
  a.match(summary, /View independent verification →/);
  a.ok(summary.indexOf("13 / 13 matched") < summary.indexOf("What still relies on GitHub"));
});

test("missing, contradictory and divergent results never become complete", () => {
  a.equal(view.project().state, "READY");
  const incomplete = result({ exitCode: 2, state: "INDEPENDENT_VERIFICATION_NOT_PROVEN" });
  a.equal(view.project(incomplete).state, "NOT_PROVEN");
  const missingRow = result(); missingRow.independentlyRecomputedGitFacts.rows[2].state = "OBJECT_UNAVAILABLE";
  a.equal(view.project(missingRow).state, "NOT_PROVEN");
  const divergent = result({ state: "INDEPENDENT_VERIFICATION_FAILED", exitCode: 5 });
  divergent.independentlyRecomputedGitFacts.state = "INDEPENDENT_VERIFICATION_DIVERGED";
  divergent.independentlyRecomputedGitFacts.rows[5].state = "DIVERGED";
  a.equal(view.project(divergent).state, "FAILED");
  const providerPromoted = result(); providerPromoted.providerRecordTrustedFacts.state = "INDEPENDENTLY_AUTHENTICATED";
  a.equal(view.project(providerPromoted).state, "NOT_PROVEN");
});

test("failure presentation requires a coherent demonstrated-mismatch envelope", () => {
  a.equal(view.project({ state: "INDEPENDENT_VERIFICATION_FAILED" }).state, "NOT_PROVEN");
  a.equal(view.project({ independentlyRecomputedGitFacts: { rows: [{ kind: "HEAD_TREE", state: "DIVERGED" }] } }).state, "NOT_PROVEN");
  const contradictory = result({ state: "INDEPENDENT_VERIFICATION_FAILED", exitCode: 2 });
  contradictory.independentlyRecomputedGitFacts.state = "INDEPENDENT_VERIFICATION_UNAVAILABLE";
  contradictory.independentlyRecomputedGitFacts.rows[5].state = "DIVERGED";
  a.equal(view.project(contradictory).state, "NOT_PROVEN");
});

test("buyer-first detail retains all machine states and moves hashes beneath technical disclosure", () => {
  const html = view.page(result(), {
    packetUrl: "/packet.json",
    proofUrl: "/proof",
    resultUrl: "/result.json",
    command: "merge-proof verify --replay-packet packet.json --git-dir repository.git",
  }, escape);
  a.match(html, /Git facts independently recomputed from the repository/);
  a.match(html, /13 \/ 13 applicable Git-derived facts matched/);
  a.match(html, /did not rely only on the supplied replay packet/);
  a.match(html, /What still relies on GitHub/);
  a.match(html, /Technical verification details/);
  for (const state of ["REPLAY_CONSISTENT", "INDEPENDENTLY_RECOMPUTED", "NOT_INDEPENDENTLY_AUTHENTICATED", "INDEPENDENT_VERIFICATION_COMPLETE"])
    a.match(html, new RegExp(state));
  for (const kind of kinds) a.match(html, new RegExp(kind));
  a.ok(html.indexOf("13 / 13 applicable") < html.indexOf("Technical verification details"));
  a.match(html, /Inspect replay packet JSON/);
  a.match(html, /Inspect verification result JSON/);
  a.doesNotMatch(html, /signed evidence|public trust root|Proof-of-Control Tier 3|L3 completion/);
});

test("ready detail explains the local workflow without inventing a completed result", () => {
  const html = view.page(null, {
    packetUrl: "/packet.json",
    proofUrl: "/proof",
    command: "npx merge-proof verify --replay-packet packet.json --git-dir repository.git --git-binary git",
  }, escape);
  a.match(html, /Verify Git facts from your own repository copy/);
  a.match(html, /Ready to recompute/);
  a.match(html, /Not independently authenticated/);
  a.match(html, /Unsigned/);
  a.doesNotMatch(html, /INDEPENDENT_VERIFICATION_COMPLETE|13 \/ 13 matched/);
});
