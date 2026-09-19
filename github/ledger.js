"use strict";
// Durable merge evidence record.
//
// One immutable row per completed merge answering a single question: what did
// Merge Proof actually establish about this change at the point it was
// accepted? Later evidence never rewrites a row. A row is a self-contained
// snapshot, so it survives receipt retention.
//
// This is a ledger, not an analytics product. It stores what was known and
// what was missing, and nothing that is not already in the receipt.
const { assert, randomUUID } = require("./common");
const { summarize } = require("./actors");

const CAPACITY = 5000;
const SCHEMA_VERSION = 1;

function area(store) {
  store.data.github.merges ||= { records: [], pruned: 0 };
  const m = store.data.github.merges;
  m.records ||= [];
  m.pruned ||= 0;
  return m;
}

const identityOf = (e) =>
  `${e.repositoryId}:${e.pr}:${e.mergeCommitSha || "UNKNOWN"}`;

// Snapshot the proof that was current for the merged state, without asserting
// that a proof of some other state describes it.
function proofSnapshot(row, mergedHeadSha, policyResult, mergeCommitSha = null) {
  if (!row)
    return {
      receiptId: null,
      state: "NO_PROOF_RECORDED",
      plain:
        "Merge Proof holds no receipt for this pull request, so it establishes nothing about what was merged.",
    };
  const receipt = row.receipt;
  const headBound = receipt.identity.headSha === mergedHeadSha;
  const bound = headBound && Boolean(mergeCommitSha) && receipt.summary?.target?.value?.sha === mergeCommitSha;
  return {
    receiptId: receipt.receiptId,
    state: bound ? "PROOF_BOUND_TO_MERGED_STATE" : headBound ? "PROOF_BOUND_TO_PR_HEAD_ONLY" : "PROOF_BOUND_TO_OTHER_STATE",
    plain: bound
      ? "This receipt was produced for the exact commit that was merged."
      : headBound ? "This receipt covers the PR head. Binding to the final landed commit is not established."
      : "The most recent receipt was produced for a different PR head, so it does not describe the merged state.",
    boundToMergedState: bound,
    verdict: receipt.verdict,
    fingerprint: receipt.fingerprint,
    policyName: receipt.policy,
    issuedAt: receipt.issuedAt,
    receiptHeadSha: receipt.identity.headSha,
    baseShaAtProof: receipt.identity.baseSha,
    currentnessAtMerge: {
      state: "UNAVAILABLE",
      reason: "MERGE_DECISION_NOT_ATOMICALLY_OBSERVED",
      asOf: null,
    },
    currentnessAtDelivery: JSON.parse(JSON.stringify(row.current || { state: "UNAVAILABLE" })),
    publicationObservedAt: row.publishedAt || null,
    gateObservation: "Published policy result, not an assertion of GitHub's decision at merge time.",
    receiptSnapshot: JSON.parse(JSON.stringify(receipt)),
    receiptArtifacts: row.artifacts ? structuredClone(row.artifacts) : null,
    gaps: [...(receipt.gaps || [])],
    requiredChecks: (receipt.summary?.rules?.checks || []).map((c) => ({
      name: c.name,
      appId: c.appId,
    })),
    unsupportedRequirements: [...(receipt.summary?.rules?.unsupported || [])],
    requiredApprovals: receipt.summary?.approval?.required ?? null,
    currentApprovals: (receipt.summary?.approval?.current || []).map(
      (x) => x.reviewer,
    ),
    checkEvidence: {
      state: receipt.summary?.ci?.state || "UNAVAILABLE",
      acceptedCount: receipt.summary?.ci?.acceptedCount ?? null,
      executionCount: receipt.summary?.ci?.executionCount ?? null,
    },
    protectedBoundaries: (receipt.local?.findings || [])
      .filter((f) => f.id === "PROTECTED_BOUNDARY")
      .flatMap((f) => Object.keys(f.evidence?.categories || {}))
      .sort(),
    actors: receipt.summary?.actors || summarize(receipt.evidence),
    gate: policyResult
      ? {
          preset: policyResult.preset,
          enforced: policyResult.enforced,
          conclusion: policyResult.conclusion,
          satisfied: policyResult.satisfied,
          blocking: [...policyResult.blocking],
          reported: [...policyResult.reported],
        }
      : null,
  };
}

// Append-only. A repeated delivery for the same merge is ignored, never merged
// into the existing row.
function record(store, entry) {
  assert(
    Number.isSafeInteger(entry.repositoryId) &&
      Number.isSafeInteger(entry.pr) &&
      typeof entry.repository === "string",
    "INVALID_MERGE_RECORD",
  );
  const m = area(store);
  const identity = identityOf(entry);
  if (m.records.some((r) => r.identity === identity)) return null;
  const row = {
    schemaVersion: SCHEMA_VERSION,
    recordId: randomUUID(),
    identity,
    recordedAt: new Date().toISOString(),
    installationId: entry.installationId ?? null,
    repository: entry.repository,
    repositoryId: entry.repositoryId,
    pr: entry.pr,
    title: null,
    baseRef: entry.baseRef || null,
    mergedAt: entry.mergedAt || null,
    mergeCommitSha: entry.mergeCommitSha || null,
    mergedHeadSha: entry.mergedHeadSha || null,
    mergedBy: entry.mergedBy || null,
    proof: JSON.parse(JSON.stringify(entry.proof)),
    immutable:
      "This record preserves pre-merge evidence available when the merge event was received. Decision-time currentness remains unavailable unless independently established. Later evidence does not change it.",
  };
  m.records.push(row);
  while (m.records.length > CAPACITY) {
    m.records.shift();
    m.pruned += 1;
  }
  return row;
}

function summaryOf(row) {
  return {
    recordId: row.recordId,
    pr: row.pr,
    repository: row.repository,
    mergedAt: row.mergedAt,
    mergeCommitSha: row.mergeCommitSha,
    mergedHeadSha: row.mergedHeadSha,
    mergedBy: row.mergedBy ? row.mergedBy.login : "UNKNOWN",
    verdict: row.proof?.verdict || "NO_PROOF",
    proofState: row.proof?.state,
    boundToMergedState: row.proof?.boundToMergedState === true,
    currentnessAtMerge: row.proof?.currentnessAtMerge?.state || "UNAVAILABLE",
    gateConclusion: row.proof?.gate?.conclusion || null,
    gateEnforced: row.proof?.gate?.enforced ?? null,
    gaps: row.proof?.gaps || [],
    agentIdentity: row.proof?.actors?.agentIdentity || "UNAVAILABLE",
    receiptId: row.proof?.receiptId || null,
  };
}

// Scoped to one installation/repository by the caller, which is where
// authorization is enforced.
function list(store, { installationId, repositoryId, ...filter } = {}) {
  const m = area(store);
  let rows = m.records.filter(
    (r) =>
      r.repositoryId === repositoryId &&
      (installationId == null || r.installationId === installationId),
  );
  if (filter.pr) rows = rows.filter((r) => r.pr === filter.pr);
  if (filter.verdict)
    rows = rows.filter((r) => (r.proof?.verdict || "NO_PROOF") === filter.verdict);
  if (filter.since)
    rows = rows.filter(
      (r) => Date.parse(r.mergedAt || r.recordedAt) >= Date.parse(filter.since),
    );
  if (filter.until)
    rows = rows.filter(
      (r) => Date.parse(r.mergedAt || r.recordedAt) <= Date.parse(filter.until),
    );
  const total = rows.length;
  const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), 200);
  const page = rows
    .slice()
    .reverse()
    .slice(0, limit);
  return {
    total,
    returned: page.length,
    pruned: m.pruned,
    completeness: m.pruned
      ? `${m.pruned} older merge record(s) were pruned at capacity and are not in this ledger.`
      : "No merge records have been pruned.",
    records: page.map(row => ({ ...summaryOf(row), landed: store.data.github.landings?.[row.recordId] || { state: "LANDED_UNRESOLVED", reason: "LANDING_OBSERVATION_PENDING" } })),
  };
}

function get(store, recordId, { installationId, repositoryId } = {}) {
  const row = area(store).records.find((r) => r.recordId === recordId);
  assert(row, "NOT_FOUND");
  assert(
    row.repositoryId === repositoryId &&
      (installationId == null || row.installationId === installationId),
    "ACCESS_DENIED",
  );
  return row;
}

module.exports = {
  record,
  list,
  get,
  proofSnapshot,
  summaryOf,
  area,
  CAPACITY,
  SCHEMA_VERSION,
};
