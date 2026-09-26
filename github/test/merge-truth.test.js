"use strict";
const { test } = require("node:test"), a = require("node:assert/strict");
const { capture, H, B, M } = require("./fixtures");
const { prove } = require("../proof"), bundle = require("../bundle"), landing = require("../landing");
const truth = require("../merge-truth");

async function fixture() {
  const evidence = capture();
  evidence.git.value.headTree = evidence.target.value.tree;
  evidence.git.value.baseTree = "f".repeat(40);
  const receipt = prove(evidence);
  const artifacts = await bundle.create(receipt);
  const receiptRow = { receipt, artifacts, current: { state: "CURRENT", asOf: receipt.issuedAt } };
  const record = {
    recordId: "00000000-0000-4000-8000-000000000001",
    repository: receipt.identity.repository,
    repositoryId: receipt.identity.repositoryId,
    pr: receipt.identity.pr,
    mergedAt: "2026-09-26T12:00:00.000Z",
    mergedHeadSha: receipt.identity.headSha,
    mergeCommitSha: M,
    proof: {
      receiptSnapshot: structuredClone(receipt),
      currentnessAtDelivery: {
        state: "CURRENT",
        asOf: receipt.issuedAt,
        claims: Object.fromEntries(receipt.claims.map(claim => [claim.name, { state: "CURRENT", binding: claim.binding }])),
      },
      currentnessAtMerge: { state: "UNAVAILABLE", reason: "MERGE_DECISION_NOT_ATOMICALLY_OBSERVED" },
    },
  };
  return { receipt, receiptRow, record };
}

function observed(record, landed) {
  const result = landing.compare(record, landed);
  return { ...result, recordedAt: "2026-09-26T12:00:01.000Z", observationId: "a".repeat(64) };
}

test("exact candidate and one-parent squash/rebase envelopes produce a verified merge truth relationship", async () => {
  const { receipt, receiptRow, record } = await fixture();
  const landed = { sha: M, tree: receipt.summary.target.value.tree, parents: [B] };
  const value = truth.build({ receiptRow, record, landing: observed(record, landed), reconciliation: { state: "RECONCILED", asOf: "2026-09-26T13:00:00.000Z" } });
  a.equal(value.relationship.verdict, "VERIFIED");
  a.equal(value.relationship.state, "LANDED_VERIFIED");
  a.equal(value.landing.path, "squash-or-single-rebase");
  a.equal(value.landing.tree, receipt.summary.target.value.tree);
  a.equal(value.evaluated.candidate.commit, H);
  a.equal(value.evaluated.candidate.tree, receipt.evidence.git.value.headTree);
  a.equal(value.evaluated.candidate.treeState, "AVAILABLE");
  a.equal(value.evaluated.target.tree, receipt.summary.target.value.tree);
  a.equal(value.reconciliation.state, "RECONCILED");
  a.equal(value.currentness.atMergeDecision.state, "UNAVAILABLE");
  a.ok(value.currentness.claims.every(row => row.currentness.state === "CURRENT"));
  a.equal(value.evidence.authority.subject, H);
  a.equal(value.replay.receipt.state, "CONSISTENT_OFFLINE");
  a.equal(value.replay.landing.result.state, "LANDED_VERIFIED");
  a.equal(truth.verify(value).state, "CONSISTENT_PROJECTION");
  const changed = structuredClone(value); changed.landing.tree = B;
  a.equal(truth.verify(changed).state, "INCONSISTENT_PROJECTION");
});

test("two-parent merge binds the exact evaluated tree and keeps decision-time currentness unavailable", async () => {
  const { receipt, receiptRow, record } = await fixture();
  const landed = { sha: M, tree: receipt.summary.target.value.tree, parents: [B, H] };
  const value = truth.build({ receiptRow, record, landing: observed(record, landed) });
  a.equal(value.relationship.verdict, "VERIFIED");
  a.equal(value.landing.path, "merge");
  a.equal(value.landing.mergedHead, H);
  a.equal(value.currentness.atMergeDecision.reason, "MERGE_DECISION_NOT_ATOMICALLY_OBSERVED");
});

test("base drift and a changed candidate remain not proven", async () => {
  const first = await fixture();
  const drifted = { sha: M, tree: first.receipt.summary.target.value.tree, parents: ["d".repeat(40), H] };
  const baseDrift = truth.build({ receiptRow: first.receiptRow, record: first.record, landing: observed(first.record, drifted) });
  a.equal(baseDrift.relationship.verdict, "NOT_PROVEN");
  a.equal(baseDrift.relationship.reason, "LANDED_PARENTAGE_UNRESOLVED");

  const second = await fixture();
  second.record.mergedHeadSha = B;
  const changed = truth.build({ receiptRow: second.receiptRow, record: second.record, landing: observed(second.record, { sha: M, tree: second.receipt.summary.target.value.tree, parents: [B] }) });
  a.equal(changed.relationship.verdict, "NOT_PROVEN");
  a.equal(changed.relationship.reason, "NO_VERIFIED_PROOF_FOR_MERGED_HEAD");
});

test("stale or missing evidence and an unobserved landing never become verified", async () => {
  const first = await fixture();
  first.receiptRow.current = { state: "STALE", changedClaims: ["TARGET"] };
  const pending = truth.build({ receiptRow: first.receiptRow, reconciliation: { state: "UNAVAILABLE", inProgress: true } });
  a.equal(pending.relationship.verdict, "NOT_PROVEN");
  a.equal(pending.landing.state, "NOT_OBSERVED");
  a.equal(pending.reconciliation.state, "IN_PROGRESS");
  a.equal(pending.currentness.atMergeEvent.state, "STALE");
  a.ok(pending.currentness.claims.every(row => row.currentness.state === "UNAVAILABLE"));

  const second = await fixture();
  second.receipt.verdict = "NOT_PROVEN";
  second.receipt.gaps = ["RULES_UNAVAILABLE"];
  second.receiptRow.receipt = second.receipt;
  second.record.proof.receiptSnapshot = second.receipt;
  const value = truth.build({ receiptRow: second.receiptRow, record: second.record, landing: observed(second.record, { sha: M, tree: second.receipt.summary.target.value.tree, parents: [B] }) });
  a.equal(value.relationship.verdict, "NOT_PROVEN");
  a.equal(value.relationship.reason, "NO_VERIFIED_PROOF_FOR_MERGED_HEAD");
  a.deepEqual(value.evidence.gaps, ["RULES_UNAVAILABLE"]);
});

test("demonstrably different landed content fails while unavailable content stays not proven", async () => {
  const first = await fixture();
  const mismatch = truth.build({ receiptRow: first.receiptRow, record: first.record, landing: observed(first.record, { sha: M, tree: B, parents: [B] }) });
  a.equal(mismatch.relationship.verdict, "FAIL");
  a.equal(mismatch.relationship.reason, "LANDED_TREE_DIFFERS_FROM_PROVEN_TREE");

  const second = await fixture();
  const unresolved = truth.build({ receiptRow: second.receiptRow, record: second.record, landing: null });
  a.equal(unresolved.relationship.verdict, "NOT_PROVEN");
  a.equal(unresolved.relationship.reason, "LANDING_OBSERVATION_PENDING");
});

test("stored landing labels, trees, records and receipt snapshots cannot contradict replay into VERIFIED", async () => {
  const make = async () => {
    const value = await fixture();
    const landed = { sha: M, tree: value.receipt.summary.target.value.tree, parents: [B] };
    return { ...value, observation: observed(value.record, landed) };
  };
  const cases = [
    async value => { value.observation.landed.tree = B; },
    async value => { value.observation.state = "LANDED_MISMATCH"; },
    async value => { value.observation.commitResolution = { state: "AVAILABLE", value: B }; },
    async value => { value.observation.landed.parents = ["d".repeat(40)]; },
    async value => { delete value.observation.landed; },
    async value => { value.record.repositoryId = 2; },
    async value => { value.record.proof.receiptSnapshot.identity.headSha = B; },
  ];
  for (const mutate of cases) {
    const value = await make();
    await mutate(value);
    const projected = truth.build({ receiptRow: value.receiptRow, record: value.record, landing: value.observation });
    a.equal(projected.relationship.verdict, "NOT_PROVEN");
    a.equal(projected.relationship.state, "LANDING_OBSERVATION_INCONSISTENT");
    a.equal(projected.landing.state, "LANDED_UNRESOLVED");
    a.equal(projected.replay.landing.state, "INCONSISTENT");
    a.ok(projected.replay.landing.discrepancies.length);
    a.equal(truth.verify(projected).state, "CONSISTENT_PROJECTION");
  }
});

test("buyer projection answers the merge-truth questions without exposing a second canonical receipt verdict", async () => {
  const { receipt, receiptRow, record } = await fixture();
  const value = truth.build({ receiptRow, record, landing: observed(record, { sha: M, tree: receipt.summary.target.value.tree, parents: [B] }) });
  const html = truth.html(value, require("../receipt").escape);
  for (const phrase of ["What Merge Proof evaluated", "Evidence currentness", "What actually landed", "Evaluated vs landed", "Delivery reconciliation", "Bound evidence and claim currentness"])
    a.match(html, new RegExp(phrase));
  a.match(html, /Download Merge Truth JSON/);
  a.match(html, /Download replay bundle/);
});
