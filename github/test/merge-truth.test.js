"use strict";
const { test } = require("node:test"), a = require("node:assert/strict");
const { capture, H, B, M } = require("./fixtures");
const { prove } = require("../proof"), bundle = require("../bundle"), landing = require("../landing");
const truth = require("../merge-truth");

async function fixture({ headTree = null } = {}) {
  const evidence = capture();
  evidence.git.value.headTree = headTree || evidence.target.value.tree;
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

function coverage(receipt, overrides = {}) {
  return {
    state: "RECONCILED",
    asOf: "2026-09-26T13:00:00.000Z",
    subject: {
      repositoryId: receipt.identity.repositoryId,
      pullRequest: receipt.identity.pr,
      candidate: receipt.identity.headSha,
    },
    ...overrides,
  };
}

test("exact candidate and one-parent squash/rebase envelopes produce a verified merge truth relationship", async () => {
  const { receipt, receiptRow, record } = await fixture();
  const landed = { sha: M, tree: receipt.summary.target.value.tree, parents: [B] };
  const value = truth.build({ receiptRow, record, landing: observed(record, landed), reconciliation: coverage(receipt) });
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
  const pending = truth.build({ receiptRow: first.receiptRow, reconciliation: coverage(first.receipt, { state: "UNAVAILABLE", inProgress: true }) });
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
    async value => {
      value.observation.commitResolution = { state: "AVAILABLE", value: B };
      value.observation.landed.sha = B;
    },
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

test("compact evidence chain projects the authoritative relationship in buyer-readable order", async () => {
  const { receipt, receiptRow, record } = await fixture();
  const value = truth.build({ receiptRow, record, landing: observed(record, { sha: M, tree: receipt.summary.target.value.tree, parents: [B] }) });
  const chain = truth.evidenceChain(value);
  a.equal(chain.verdict, value.relationship.verdict);
  a.deepEqual(chain.stages.map(stage => stage.label), ["Evaluated", "Evidence", "Currentness", "Landed", "Conclusion"]);
  a.deepEqual(chain.stages.map(stage => stage.state), ["Bound", "Bound", "Current", "Observed", "VERIFIED"]);
  a.equal(chain.stages[1].title, "5 evidence claims");
  a.match(chain.stages[1].detail, /Required check test.*1 current approval.*Repository rules/);
  a.equal(chain.reason, "Landed tree matches the evaluated tree.");
  const html = truth.html(value, require("../receipt").escape);
  let previous = -1;
  for (const phrase of ["Evaluated", "Evidence", "Currentness", "Landed", "Conclusion"]) {
    const next = html.indexOf(phrase, previous + 1);
    a.ok(next > previous, `${phrase} follows the prior stage`);
    previous = next;
  }
  a.ok(html.indexOf("Landed tree matches the evaluated tree.") < html.indexOf("Evidence details and identifiers"));
  a.ok(html.indexOf("LANDED_TREE_EQUALS_PROVEN_TREE") > html.indexOf("Evidence details and identifiers"));
  a.match(html, /Download Merge Truth JSON/);
  a.match(html, /Download replay bundle/);
  a.match(html, /Download replay packet/);
  a.match(html, /Unsigned packet:/);
  a.ok(html.indexOf("Download replay packet") < html.indexOf("Evidence details and identifiers"));
  a.match(html, /Merge truth: VERIFIED/);
  a.match(html, /The evaluated tree is the tree that landed\./);
  a.ok(html.indexOf("Merge truth: VERIFIED") < html.indexOf("Evaluated merge-target tree"));
  const withSupport = truth.html(value, require("../receipt").escape, '<section id="support">candidate evidence</section>');
  a.ok(withSupport.indexOf("Download replay packet") < withSupport.indexOf("Provider history"));
  a.ok(withSupport.indexOf("Provider history") < withSupport.indexOf('id="support"'));
  a.ok(withSupport.indexOf('id="support"') < withSupport.indexOf("Evidence details and identifiers"));
});

test("buyer comparison binds VERIFIED to the evaluated merge-target tree, not the distinct PR head tree", async () => {
  const { receipt, receiptRow, record } = await fixture({ headTree: B });
  a.notEqual(receipt.evidence.git.value.headTree, receipt.summary.target.value.tree);
  const value = truth.build({ receiptRow, record, landing: observed(record, { sha: M, tree: receipt.summary.target.value.tree, parents: [B] }) });
  a.equal(value.relationship.verdict, "VERIFIED");
  const rendered = truth.html(value, require("../receipt").escape);
  const comparison = rendered.match(/Evaluated merge-target tree<\/small><strong>([^<]+)[\s\S]*?Actual landed tree<\/small><strong>([^<]+)/);
  a.ok(comparison);
  a.equal(comparison[1], comparison[2]);
  a.match(rendered, new RegExp(`Head tree ${B.slice(0, 12)} · evaluated target tree ${receipt.summary.target.value.tree.slice(0, 12)}`));
});

test("compact evidence chain keeps fail, stale, missing, pending, reconciled and contradictory cases fail-closed", async () => {
  const failed = await fixture();
  const mismatch = truth.build({ receiptRow: failed.receiptRow, record: failed.record, landing: observed(failed.record, { sha: M, tree: B, parents: [B] }) });
  a.equal(truth.evidenceChain(mismatch).verdict, "FAIL");
  a.equal(truth.evidenceChain(mismatch).reason, "Landed content differs from the evaluated candidate.");
  const failOutcome = truth.buyerOutcome(mismatch);
  a.equal(failOutcome.headline, "Different content landed.");
  a.match(failOutcome.context, /candidate evidence was VERIFIED.*landed tree does not match/);
  a.match(truth.html(mismatch, require("../receipt").escape), /Merge truth: FAIL[\s\S]*Different content landed\./);

  const stale = await fixture();
  stale.receipt.verdict = "NOT_PROVEN";
  stale.receipt.gaps = ["RULES_UNAVAILABLE"];
  stale.receiptRow.receipt = stale.receipt;
  stale.record.proof.receiptSnapshot = structuredClone(stale.receipt);
  stale.record.proof.currentnessAtDelivery = { state: "STALE", claims: {} };
  const staleValue = truth.build({ receiptRow: stale.receiptRow, record: stale.record, landing: observed(stale.record, { sha: M, tree: stale.receipt.summary.target.value.tree, parents: [B] }) });
  const staleChain = truth.evidenceChain(staleValue);
  a.equal(staleChain.verdict, "NOT_PROVEN");
  a.equal(staleChain.stages[1].state, "Missing");
  a.equal(staleChain.stages[2].state, "Stale");
  a.match(truth.buyerOutcome(staleValue).context, /bound evidence is stale/);

  const missing = await fixture();
  missing.receipt.verdict = "NOT_PROVEN";
  missing.receipt.gaps = ["RULES_UNAVAILABLE"];
  missing.receiptRow.receipt = missing.receipt;
  missing.record.proof.receiptSnapshot = structuredClone(missing.receipt);
  const missingValue = truth.build({ receiptRow: missing.receiptRow, record: missing.record, landing: observed(missing.record, { sha: M, tree: missing.receipt.summary.target.value.tree, parents: [B] }) });
  a.equal(truth.evidenceChain(missingValue).verdict, "NOT_PROVEN");
  a.equal(truth.evidenceChain(missingValue).stages[1].state, "Missing");
  a.equal(truth.evidenceChain(missingValue).stages[2].state, "Current");

  const pending = await fixture();
  const pendingValue = truth.build({ receiptRow: pending.receiptRow });
  a.equal(truth.evidenceChain(pendingValue).verdict, "NOT_PROVEN");
  a.equal(truth.evidenceChain(pendingValue).stages[3].state, "Not proven");
  a.equal(truth.evidenceChain(pendingValue).reason, "Landing has not yet been observed.");
  a.match(truth.buyerOutcome(pendingValue).headline, /Landing has not yet been observed/);
  a.equal(truth.evidenceChain(pendingValue).stages[2].title, "Current at the latest retained observation.");
  a.doesNotMatch(truth.evidenceChain(pendingValue).stages[2].title, /merge event/i);
  const pendingHtml = truth.html(pendingValue, require("../receipt").escape);
  a.doesNotMatch(pendingHtml, /merge event arrived/i);
  a.match(pendingHtml, /latest retained observation: CURRENT.*no merge decision is bound/s);

  const pendingStale = await fixture();
  pendingStale.receiptRow.current = { state: "STALE", asOf: pendingStale.receipt.issuedAt };
  a.equal(truth.evidenceChain(truth.build({ receiptRow: pendingStale.receiptRow })).stages[2].title, "The latest retained evidence is stale.");

  const pendingUnknown = await fixture();
  pendingUnknown.receiptRow.current = { state: "UNAVAILABLE", reason: "CURRENTNESS_NOT_RECORDED" };
  a.equal(truth.evidenceChain(truth.build({ receiptRow: pendingUnknown.receiptRow })).stages[2].title, "Currentness could not be established for this retained proof.");

  const reconciled = await fixture();
  const reconciledValue = truth.build({ receiptRow: reconciled.receiptRow, record: reconciled.record, landing: observed(reconciled.record, { sha: M, tree: reconciled.receipt.summary.target.value.tree, parents: [B] }), reconciliation: coverage(reconciled.receipt) });
  a.match(truth.html(reconciledValue, require("../receipt").escape), /Provider history[\s\S]*Reconciled[\s\S]*Relevant provider delivery history was traversed through 2026-09-26T13:00:00.000Z/);

  const contradictory = await fixture();
  const stored = observed(contradictory.record, { sha: M, tree: contradictory.receipt.summary.target.value.tree, parents: [B] });
  stored.state = "LANDED_MISMATCH";
  const contradiction = truth.build({ receiptRow: contradictory.receiptRow, record: contradictory.record, landing: stored });
  a.equal(truth.evidenceChain(contradiction).verdict, "NOT_PROVEN");
  a.equal(truth.evidenceChain(contradiction).reason, "The retained landing observation conflicts with deterministic replay.");
  a.match(truth.html(contradiction, require("../receipt").escape), /Merge truth: NOT_PROVEN/);
});

test("provider-history coverage is proof-bound, fail-closed and never overrides Merge Truth", async () => {
  const verified = await fixture();
  const verifiedLanding = observed(verified.record, { sha: M, tree: verified.receipt.summary.target.value.tree, parents: [B] });
  const complete = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt) });
  a.equal(complete.reconciliation.state, "RECONCILED");
  a.equal(complete.reconciliation.coverage, "COMPLETE");
  a.equal(complete.relationship.verdict, "VERIFIED");
  a.match(truth.html(complete, require("../receipt").escape), /Provider history[\s\S]*Reconciled[\s\S]*does not change Merge Truth: VERIFIED/);

  const active = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { inProgress: true }) });
  a.equal(active.reconciliation.state, "IN_PROGRESS");
  a.equal(active.reconciliation.coverage, "INCOMPLETE");
  a.equal(active.relationship.verdict, "VERIFIED");
  a.match(truth.html(active, require("../receipt").escape), /Reconciliation in progress[\s\S]*coverage is incomplete[\s\S]*Merge Truth: VERIFIED/);

  const unavailable = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { state: "UNAVAILABLE", asOf: null }) });
  a.equal(unavailable.reconciliation.state, "UNAVAILABLE");
  a.equal(unavailable.relationship.verdict, "VERIFIED");
  a.match(truth.html(unavailable, require("../receipt").escape), /Provider history[\s\S]*Unavailable[\s\S]*coverage remains unproven/);

  const stale = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { asOf: "2026-09-26T11:59:59.000Z" }) });
  a.equal(stale.reconciliation.state, "STALE");
  a.equal(stale.reconciliation.reason, "RECONCILIATION_PREDATES_PROOF");
  a.match(truth.html(stale, require("../receipt").escape), /Provider history[\s\S]*Out of date/);

  const recovered = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { recovered: {
    deliveryId: "delivery-1", event: "pull_request", requestedAt: "2026-09-26T12:30:00.000Z",
    observedAt: "2026-09-26T12:31:00.000Z", confirmed: true,
    subject: { repositoryId: verified.receipt.identity.repositoryId, pullRequest: verified.receipt.identity.pr, candidate: verified.receipt.identity.headSha },
  } }) });
  a.equal(recovered.reconciliation.state, "RECOVERED");
  a.equal(recovered.reconciliation.recovered.event, "pull_request");
  a.equal(recovered.relationship.verdict, "VERIFIED");
  a.match(truth.html(recovered, require("../receipt").escape), /Provider history[\s\S]*Recovered[\s\S]*delayed or missed provider event/);

  const failed = await fixture();
  const failedValue = truth.build({ receiptRow: failed.receiptRow, record: failed.record, landing: observed(failed.record, { sha: M, tree: B, parents: [B] }), reconciliation: coverage(failed.receipt) });
  a.equal(failedValue.relationship.verdict, "FAIL");
  a.equal(failedValue.reconciliation.state, "RECONCILED");
  a.match(truth.html(failedValue, require("../receipt").escape), /does not change Merge Truth: FAIL/);

  const missing = await fixture();
  missing.receipt.verdict = "NOT_PROVEN";
  missing.receipt.gaps = ["RULES_UNAVAILABLE"];
  missing.receiptRow.receipt = missing.receipt;
  missing.record.proof.receiptSnapshot = structuredClone(missing.receipt);
  const missingValue = truth.build({ receiptRow: missing.receiptRow, record: missing.record, landing: observed(missing.record, { sha: M, tree: missing.receipt.summary.target.value.tree, parents: [B] }), reconciliation: coverage(missing.receipt) });
  a.equal(missingValue.reconciliation.state, "RECONCILED");
  a.equal(missingValue.relationship.verdict, "NOT_PROVEN");
  a.match(truth.html(missingValue, require("../receipt").escape), /does not change Merge Truth: NOT_PROVEN/);

  const wrongSubject = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { subject: { repositoryId: 999, pullRequest: 2, candidate: B } }) });
  a.equal(wrongSubject.reconciliation.state, "UNAVAILABLE");
  a.equal(wrongSubject.reconciliation.reason, "RECONCILIATION_SUBJECT_MISMATCH");
  const storedLabelOnly = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: { state: "RECONCILED", asOf: "2026-09-26T13:00:00.000Z" } });
  a.equal(storedLabelOnly.reconciliation.state, "UNAVAILABLE");
  const unconfirmedRecovery = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { recovered: { observedAt: "2026-09-26T12:31:00.000Z", confirmed: false } }) });
  a.equal(unconfirmedRecovery.reconciliation.state, "RECONCILED");
  const forgedRecovery = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { recovered: {
    deliveryId: "delivery-forged", event: "pull_request", requestedAt: "2026-09-26T12:30:00.000Z",
    observedAt: "2026-09-26T12:31:00.000Z", confirmed: true,
    subject: { repositoryId: 999, pullRequest: verified.receipt.identity.pr, candidate: verified.receipt.identity.headSha },
  } }) });
  a.equal(forgedRecovery.reconciliation.state, "RECONCILED");
  a.equal(forgedRecovery.reconciliation.recovered, null);
  for (const recovered of [
    { requestedAt: null, observedAt: "2026-09-26T12:31:00.000Z", confirmed: true },
    { requestedAt: "not-a-time", observedAt: "2026-09-26T12:31:00.000Z", confirmed: true },
    { requestedAt: "2026-09-26T13:00:00.000Z", observedAt: "2026-09-26T12:31:00.000Z", confirmed: true },
    { requestedAt: "2026-09-26T12:30:00.000Z", observedAt: "2026-09-26T13:01:00.000Z", confirmed: true },
    { requestedAt: "2026-09-26T14:00:00.000Z", observedAt: "2026-09-26T14:01:00.000Z", confirmed: true },
  ]) {
    const invalidRecovery = truth.build({ receiptRow: verified.receiptRow, record: verified.record, landing: verifiedLanding, reconciliation: coverage(verified.receipt, { recovered }) });
    a.equal(invalidRecovery.reconciliation.state, "RECONCILED");
    a.equal(invalidRecovery.reconciliation.recovered, null);
  }
  const malformedProofPoint = structuredClone(verified.record);
  malformedProofPoint.mergedAt = "not-a-time";
  const malformedTime = truth.build({ receiptRow: verified.receiptRow, record: malformedProofPoint, landing: verifiedLanding, reconciliation: coverage(verified.receipt) });
  a.equal(malformedTime.reconciliation.state, "UNAVAILABLE");
  a.equal(malformedTime.reconciliation.reason, "PROOF_POINT_TIME_UNAVAILABLE");

  const proofTime = Date.parse(verified.receipt.issuedAt);
  const preProofRecovery = truth.build({ receiptRow: verified.receiptRow, reconciliation: coverage(verified.receipt, {
    asOf: new Date(proofTime - 1000).toISOString(),
    recovered: { requestedAt: new Date(proofTime - 3000).toISOString(), observedAt: new Date(proofTime - 2000).toISOString(), confirmed: true },
  }) });
  a.equal(preProofRecovery.reconciliation.state, "STALE");
  a.equal(preProofRecovery.reconciliation.reason, "RECONCILIATION_PREDATES_PROOF");
});
