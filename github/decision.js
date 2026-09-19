"use strict";
const { sha, hash } = require("./common");
function decide(receipt, current, request = {}, origin = "") {
  const i = receipt.identity, t = receipt.summary.target.value;
  const mismatch = [];
  for (const [key, actual] of [["expectedHeadSha", i.headSha], ["expectedBaseSha", i.baseSha], ["expectedTargetSha", t?.sha]])
    if (!sha(request[key]) || request[key] !== actual) mismatch.push(key);
  if (request.repositoryId !== i.repositoryId || request.pr !== i.pr) mismatch.push("repository/pr");
  const reasons = [...receipt.gaps];
  if (mismatch.length) reasons.push(...mismatch.map(x => ({expectedHeadSha:"SUBJECT_MISMATCH_HEAD", expectedBaseSha:"SUBJECT_MISMATCH_BASE", expectedTargetSha:"SUBJECT_MISMATCH_TARGET"}[x] || "SUBJECT_MISMATCH_REPOSITORY")));
  if (current?.state !== "CURRENT") reasons.push("CURRENT_EVIDENCE_REQUIRED");
  if (receipt.summary.queueStage === "ADMISSION_ONLY") reasons.push("MERGE_GROUP_PROOF_PENDING");
  const proceed = receipt.verdict === "VERIFIED" && current?.state === "CURRENT" && !reasons.length;
  return { $schema: "urn:merge-proof:decision:1", schemaVersion: 1, outcome: proceed ? "PROCEED" : mismatch.length || receipt.verdict === "FAIL" ? "REFUSE" : current?.state === "UNAVAILABLE" ? "UNAVAILABLE" : "HOLD", proceed,
    verdict: mismatch.length || current?.state !== "CURRENT" ? "NOT_PROVEN" : receipt.verdict, historicalVerdict: receipt.verdict, currentness: current?.state || "UNAVAILABLE", subject: receipt.subject,
    request: { ...request, matched: !mismatch.length, mismatch },
    bindings: { expected: receipt.expectedTree?.tree || "UNAVAILABLE", candidate: t?.tree || "UNAVAILABLE",
      tested: receipt.summary.ci.state === "PROVEN" ? t.sha : "UNAVAILABLE",
      authorized: ["PROVEN", "NOT_APPLICABLE"].includes(receipt.summary.approval.state) ? i.headSha : "UNAVAILABLE", landed: null },
    reasons: [...new Set(reasons)].map(code => ({ code, blocking: true })), missingEvidence: [...receipt.gaps],
    exceptions: receipt.summary.rules.unsupported,
    nextAction: proceed ? { kind: "MERGE_WITH_SHA", mergeArguments: { sha: i.headSha },
      text: "Use the provider's head-SHA guard and required checks. This observation does not reserve the base or authorize a later state." } : { kind: "RESOLVE_EVIDENCE", text: receipt.next },
    receipt: { receiptId: receipt.receiptId, digest: hash(receipt), url: `${origin}/proof/receipts/${receipt.receiptId}` }, observedAt: current?.asOf || receipt.issuedAt };
}
module.exports = { decide };
