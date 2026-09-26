"use strict";
// Buyer-facing projection of evidence Merge Proof already holds. This module
// collects no evidence and grants no authority. It connects one immutable
// receipt to an optional merge record and landed-content observation.
const { hash } = require("./common");

const unavailable = (reason) => ({ state: "UNAVAILABLE", reason });

function currentness(receipt, observed) {
  const overall = observed || receipt.freshness || unavailable("CURRENTNESS_NOT_RECORDED");
  const byName = overall.claims || {};
  return {
    atProof: structuredClone(receipt.freshness || unavailable("CURRENTNESS_NOT_RECORDED")),
    atMergeEvent: structuredClone(overall),
    atMergeDecision: unavailable("MERGE_DECISION_NOT_ATOMICALLY_OBSERVED"),
    claims: (receipt.claims || []).map((claim) => ({
      name: claim.name,
      evidenceState: claim.state,
      evidenceReason: claim.reason || null,
      currentness: byName[claim.name]
        ? structuredClone(byName[claim.name])
        : unavailable("CLAIM_CURRENTNESS_NOT_RECORDED"),
    })),
  };
}

function relationship(record, landing) {
  if (!record)
    return {
      verdict: "NOT_PROVEN",
      state: "LANDING_NOT_OBSERVED",
      reason: "LANDING_NOT_OBSERVED",
      plain: "No merge event has been bound to this receipt, so landed content is not proven.",
    };
  if (!landing)
    return {
      verdict: "NOT_PROVEN",
      state: "LANDED_UNRESOLVED",
      reason: "LANDING_OBSERVATION_PENDING",
      plain: "A merge was recorded, but the landed commit and tree have not been resolved.",
    };
  if (landing.state === "LANDED_VERIFIED")
    return {
      verdict: "VERIFIED",
      state: landing.state,
      reason: landing.reason,
      plain: "The resolved landed tree equals the proven evaluated tree inside the recorded merge-path envelope.",
    };
  if (landing.state === "LANDED_MISMATCH")
    return {
      verdict: "FAIL",
      state: landing.state,
      reason: landing.reason,
      plain: "The resolved landed tree demonstrably differs from the proven evaluated tree.",
    };
  return {
    verdict: "NOT_PROVEN",
    state: landing.state || "LANDED_UNRESOLVED",
    reason: landing.reason || "LANDED_CONTENT_UNAVAILABLE",
    plain: "The available evidence does not prove that the landed content corresponds to the evaluated candidate.",
  };
}

function validateLanding(receipt, storedReceipt, record, landing) {
  if (!record || !landing) return { consistent: true, computed: null, discrepancies: [] };
  const discrepancies = [];
  if (!record.proof?.receiptSnapshot || hash(record.proof.receiptSnapshot) !== hash(storedReceipt))
    discrepancies.push("MERGE_RECORD_RECEIPT_MISMATCH");
  if (record.repository !== receipt.identity.repository ||
      record.repositoryId !== receipt.identity.repositoryId ||
      record.pr !== receipt.identity.pr)
    discrepancies.push("MERGE_RECORD_SUBJECT_MISMATCH");
  const recordCommit = record.mergeCommitSha || null;
  const resolutionCommit = landing.commitResolution?.value || null;
  const landedCommit = landing.landed?.sha || null;
  if (recordCommit && resolutionCommit && recordCommit !== resolutionCommit)
    discrepancies.push("LANDING_RESOLUTION_COMMIT_MISMATCH");
  if (recordCommit && landedCommit && recordCommit !== landedCommit)
    discrepancies.push("LANDED_COMMIT_RECORD_MISMATCH");
  if (resolutionCommit && landedCommit && resolutionCommit !== landedCommit)
    discrepancies.push("LANDED_COMMIT_RESOLUTION_MISMATCH");
  const resolved = recordCommit || resolutionCommit || landedCommit || null;
  const comparisonRecord = {
    ...record,
    mergeCommitSha: resolved,
    proof: { ...record.proof, receiptSnapshot: receipt },
  };
  const computed = require("./landing").compare(comparisonRecord, landing.landed);
  for (const key of ["state", "reason", "method", "parentsConsistent", "receiptDigest"])
    if ((computed[key] ?? null) !== (landing[key] ?? null))
      discrepancies.push(`LANDING_${key.toUpperCase()}_MISMATCH`);
  return { consistent: discrepancies.length === 0, computed, discrepancies };
}

function build({ receiptRow, record = null, landing = null, reconciliation = {} }) {
  const storedReceipt = receiptRow?.receipt;
  const receipt = storedReceipt;
  if (!receipt) throw Object.assign(new Error("RECEIPT_REQUIRED"), { code: "RECEIPT_REQUIRED" });
  const evaluatedTree = receipt.evidence?.git?.value?.headTree || null;
  const target = receipt.summary?.target?.value || null;
  const observed = record?.proof?.currentnessAtDelivery || receiptRow.current || null;
  const actualCommit = landing?.landed?.sha || landing?.commitResolution?.value || record?.mergeCommitSha || null;
  const actualTree = landing?.landed?.tree || null;
  const landingValidation = validateLanding(receipt, storedReceipt, record, landing);
  const relation = landingValidation.consistent
    ? relationship(record, landingValidation.computed)
    : {
        verdict: "NOT_PROVEN",
        state: "LANDING_OBSERVATION_INCONSISTENT",
        reason: "LANDING_OBSERVATION_INCONSISTENT",
        plain: "The retained landing observation disagrees with deterministic replay or the receipt/merge-record binding, so the landed relationship is not proven.",
      };
  const receiptDigest = hash(receipt);
  const body = {
    schema: "urn:merge-proof:merge-truth:1",
    recordId: record?.recordId || null,
    repository: {
      name: receipt.identity.repository,
      id: receipt.identity.repositoryId,
      pullRequest: receipt.identity.pr,
    },
    evaluated: {
      receiptId: receipt.receiptId,
      receiptVerdict: receipt.verdict,
      issuedAt: receipt.issuedAt,
      policy: receipt.policy,
      candidate: {
        commit: receipt.identity.headSha,
        tree: evaluatedTree,
        treeState: evaluatedTree ? "AVAILABLE" : "UNAVAILABLE",
      },
      base: {
        commit: receipt.identity.baseSha,
        tree: receipt.evidence?.git?.value?.baseTree || null,
      },
      target: target
        ? { state: "AVAILABLE", kind: target.kind, commit: target.sha, tree: target.tree || null }
        : unavailable(receipt.summary?.target?.reason || "EVALUATED_TARGET_UNAVAILABLE"),
      expectedTree: structuredClone(receipt.expectedTree || unavailable("EXPECTED_TREE_NOT_RECORDED")),
    },
    evidence: {
      claims: structuredClone(receipt.claims || []),
      authority: structuredClone(receipt.summary?.authorization || unavailable("AUTHORITY_EVIDENCE_NOT_RECORDED")),
      requirements: {
        checks: structuredClone(receipt.summary?.ci?.required || []),
        approvals: receipt.summary?.approval?.required ?? null,
        rules: structuredClone(receipt.summary?.rules || unavailable("RULES_NOT_RECORDED")),
      },
      gaps: [...(receipt.gaps || [])],
    },
    currentness: currentness(receipt, observed),
    landing: record
      ? {
          state: landingValidation.consistent
            ? landingValidation.computed?.state || "LANDED_UNRESOLVED"
            : "LANDED_UNRESOLVED",
          reason: landingValidation.consistent
            ? landingValidation.computed?.reason || "LANDING_OBSERVATION_PENDING"
            : "LANDING_OBSERVATION_INCONSISTENT",
          observedState: landing?.state || null,
          mergedAt: record.mergedAt || null,
          mergedHead: record.mergedHeadSha || null,
          mergeCommit: actualCommit,
          tree: actualTree,
          parents: structuredClone(landing?.landed?.parents || []),
          path: landingValidation.consistent
            ? landingValidation.computed?.method || "UNAVAILABLE"
            : "UNAVAILABLE",
          observationId: landing?.observationId || null,
        }
      : {
          state: "NOT_OBSERVED",
          reason: "LANDING_NOT_OBSERVED",
          mergedAt: null,
          mergedHead: null,
          mergeCommit: null,
          tree: null,
          parents: [],
          path: "UNAVAILABLE",
          observationId: null,
        },
    relationship: relation,
    reconciliation: {
      state: reconciliation.inProgress
        ? "IN_PROGRESS"
        : reconciliation.state || "UNAVAILABLE",
      asOf: reconciliation.asOf || null,
      scope: "GitHub App delivery history; this does not establish atomic currentness at merge.",
    },
    references: {
      receipt: {
        id: receipt.receiptId,
        digest: receiptDigest,
        observationId: receipt.observationId || null,
      },
      policy: {
        id: receipt.policy,
        digest: receipt.policySnapshot ? hash(receipt.policySnapshot) : null,
      },
      mergeRecord: record?.recordId || null,
      landingObservation: landing?.observationId || null,
      bundle: receiptRow?.artifacts ? `/proof/receipts/${receipt.receiptId}/bundle` : null,
    },
    replay: {
      receipt: receiptRow?.artifacts?.policy
        ? require("./bundle").replay(receipt, receiptRow.artifacts.policy)
        : unavailable("HISTORICAL_BUNDLE_UNAVAILABLE"),
      landing: landing
        ? landingValidation.consistent
          ? {
            state: "REPLAYED",
            result: landingValidation.computed,
          }
          : {
              state: "INCONSISTENT",
              discrepancies: landingValidation.discrepancies,
              result: landingValidation.computed,
            }
        : unavailable("LANDING_OBSERVATION_UNAVAILABLE"),
      limitation: "Replay checks deterministic consistency of recorded evidence; it does not independently authenticate GitHub or establish present currentness.",
    },
    limitations: [
      "The receipt verdict and the landed-content relationship are separate conclusions.",
      "Decision-time currentness is unavailable unless independently observed; it is not inferred from delivery-time state.",
      "GitHub-reported identities and content identifiers remain provider observations.",
    ],
  };
  return { ...body, recordDigest: hash(body) };
}

function verify(value) {
  if (!value || value.schema !== "urn:merge-proof:merge-truth:1")
    return { state: "UNSUPPORTED" };
  const { recordDigest, ...body } = value;
  return hash(body) === recordDigest
    ? { state: "CONSISTENT_PROJECTION" }
    : { state: "INCONSISTENT_PROJECTION" };
}

function summary(value) {
  return {
    recordId: value.recordId,
    receiptId: value.evaluated.receiptId,
    evaluatedCommit: value.evaluated.candidate.commit,
    evaluatedTree: value.evaluated.candidate.tree,
    landingState: value.landing.state,
    landedCommit: value.landing.mergeCommit,
    landedTree: value.landing.tree,
    relationship: value.relationship.verdict,
    relationshipState: value.relationship.state,
    currentnessAtMerge: value.currentness.atMergeDecision.state,
    reconciliation: value.reconciliation.state,
  };
}

const friendlyReason = {
  LANDED_TREE_EQUALS_PROVEN_TREE: "Landed tree matches the evaluated tree.",
  LANDED_TREE_DIFFERS_FROM_PROVEN_TREE: "Landed content differs from the evaluated candidate.",
  LANDED_TREE_DIFFERS_FROM_EXPECTED_TREE: "Landed content differs from the independently reconstructed tree.",
  LANDING_NOT_OBSERVED: "Landing has not yet been observed.",
  LANDING_OBSERVATION_PENDING: "A merge was recorded, but landed content has not yet been resolved.",
  LANDING_OBSERVATION_INCONSISTENT: "The retained landing observation conflicts with deterministic replay.",
  NO_VERIFIED_PROOF_FOR_MERGED_HEAD: "The bound evidence does not verify the candidate that was merged.",
  LANDED_PARENTAGE_UNRESOLVED: "The landed parentage does not establish a supported merge path.",
  LANDED_CONTENT_UNAVAILABLE: "The landed commit or tree could not be established.",
};

function words(value) {
  return String(value || "Unavailable")
    .replace(/^CI_EXECUTED:/, "Required check: ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (x) => x.toUpperCase());
}

function claimLabel(name) {
  if (name === "TARGET") return "Evaluated target";
  if (name === "APPROVAL_CURRENT") return "Current approval";
  if (name === "RULES_SNAPSHOT") return "Repository rules";
  if (name === "REMOTE_DURABLE") return "Remote candidate";
  if (String(name).startsWith("CI_EXECUTED:")) return `Required check ${String(name).split(":").slice(1).join(":")}`;
  return words(name);
}

function evidenceChain(value) {
  const short = (x) => x && /^[a-f0-9]{40}$/.test(x) ? x.slice(0, 12) : x || "Unavailable";
  const gaps = value.evidence.gaps || [];
  const claims = (value.evidence.claims || []).map((claim) => claimLabel(claim.name));
  const approvalCount = value.evidence.authority?.counted?.length || 0;
  const evidenceHighlights = [...new Set([
    ...claims.filter((label) => label.startsWith("Required check")),
    ...(approvalCount ? [`${approvalCount} current approval${approvalCount === 1 ? "" : "s"}`] : []),
    ...claims.filter((label) => label === "Repository rules" || label === "Remote candidate"),
  ])].slice(0, 3);
  const current = value.currentness.atMergeEvent || unavailable("CURRENTNESS_NOT_RECORDED");
  const currentCopy = current.state === "CURRENT"
    ? value.recordId
      ? "Current when the merge event was recorded."
      : "Current at the latest retained observation."
    : current.state === "STALE"
      ? value.recordId
        ? "Evidence changed or was superseded after this proof."
        : "The latest retained evidence is stale."
      : value.recordId
        ? "Currentness at the merge event could not be established."
        : "Currentness could not be established for this retained proof.";
  const landedState = value.landing.state;
  const landedTitle = landedState === "LANDED_VERIFIED"
    ? "Landing observed"
    : landedState === "LANDED_MISMATCH"
      ? "Different tree observed"
      : landedState === "NOT_OBSERVED"
        ? "Not yet observed"
        : "Unable to establish";
  const path = value.landing.path === "merge"
    ? "Merge commit"
    : value.landing.path === "squash-or-single-rebase"
      ? "Squash or single-parent rebase"
      : "Merge path unavailable";
  return {
    verdict: value.relationship.verdict,
    reason: friendlyReason[value.relationship.reason] || value.relationship.plain,
    stages: [
      {
        label: "Evaluated",
        state: value.evaluated.candidate.tree ? "Bound" : "Incomplete",
        tone: value.evaluated.candidate.tree ? "good" : "unknown",
        title: `Candidate ${short(value.evaluated.candidate.commit)}`,
        detail: `${value.repository.name} · PR #${value.repository.pullRequest}`,
        meta: `Tree ${short(value.evaluated.candidate.tree)}`,
      },
      {
        label: "Evidence",
        state: gaps.length ? "Missing" : value.evaluated.receiptVerdict === "VERIFIED" ? "Bound" : "Incomplete",
        tone: gaps.length ? "unknown" : value.evaluated.receiptVerdict === "VERIFIED" ? "good" : "unknown",
        title: gaps.length ? `${gaps.length} evidence gap${gaps.length === 1 ? "" : "s"}` : `${value.evidence.claims.length} evidence claims`,
        detail: gaps.length ? `Missing: ${gaps.slice(0, 2).map(words).join("; ")}` : evidenceHighlights.join(" · ") || "Bound evidence is available below.",
        meta: value.evidence.authority?.state === "PROVEN" ? "Approval authority established" : "Authority not fully established",
      },
      {
        label: "Currentness",
        state: current.state === "CURRENT" ? "Current" : current.state === "STALE" ? "Stale" : "Not established",
        tone: current.state === "CURRENT" ? "good" : "unknown",
        title: currentCopy,
        detail: `At proof: ${words(value.currentness.atProof.state)}`,
        meta: value.recordId ? "Decision-time currentness is shown in details." : "No merge decision is bound to this receipt.",
      },
      {
        label: "Landed",
        state: landedState === "LANDED_VERIFIED" ? "Observed" : landedState === "LANDED_MISMATCH" ? "Different" : "Not proven",
        tone: landedState === "LANDED_VERIFIED" ? "good" : landedState === "LANDED_MISMATCH" ? "bad" : "unknown",
        title: landedTitle,
        detail: value.landing.mergeCommit ? `Commit ${short(value.landing.mergeCommit)} · tree ${short(value.landing.tree)}` : "No landed commit and tree are bound yet.",
        meta: path,
      },
      {
        label: "Conclusion",
        state: value.relationship.verdict,
        tone: value.relationship.verdict === "VERIFIED" ? "good" : value.relationship.verdict === "FAIL" ? "bad" : "unknown",
        title: friendlyReason[value.relationship.reason] || value.relationship.plain,
        detail: "Derived from the Merge Truth record above, not presentation state.",
        meta: null,
      },
    ],
  };
}

function html(value, escape) {
  const short = (x) => x ? escape(String(x).replace(/^[a-f0-9]{40}$/, (s) => s.slice(0, 12))) : "Unavailable";
  const chain = evidenceChain(value);
  const claims = value.currentness.claims.length
    ? `<ul>${value.currentness.claims.map((claim) => `<li><strong>${escape(claim.name)}</strong>: evidence ${escape(claim.evidenceState)} · currentness ${escape(claim.currentness.state)}${claim.evidenceReason ? ` · ${escape(claim.evidenceReason)}` : ""}</li>`).join("")}</ul>`
    : "<p>No bound evidence claims were recorded.</p>";
  const stages = chain.stages.map((stage, index) => `<li class="chain-stage ${escape(stage.tone)}">
    <p class="chain-label"><span>${index + 1}</span>${escape(stage.label)}</p>
    <p class="chain-state">${escape(stage.state)}</p>
    <strong>${escape(stage.title)}</strong>
    <p>${escape(stage.detail)}</p>
    ${stage.meta ? `<small>${escape(stage.meta)}</small>` : ""}
  </li>`).join("");
  const reconciliation = value.reconciliation.state === "RECONCILED"
    ? `Delivery history reconciled${value.reconciliation.asOf ? ` through ${escape(value.reconciliation.asOf)}` : ""}.`
    : `Delivery reconciliation: ${escape(words(value.reconciliation.state))}${value.reconciliation.asOf ? ` as of ${escape(value.reconciliation.asOf)}` : ""}.`;
  return `<section class="merge-truth" aria-labelledby="merge-truth-heading">
  <p class="eyebrow">EVALUATED TO LANDED</p><h2 id="merge-truth-heading">Merge truth</h2>
  <p class="merge-truth-conclusion ${escape(chain.verdict.toLowerCase())}"><strong>${escape(chain.verdict)}</strong> ${escape(chain.reason)}</p>
  <ol class="evidence-chain" aria-label="Merge Truth evidence chain">${stages}</ol>
  <p class="reconciliation-note">${reconciliation}</p>
  <details class="merge-truth-details"><summary>Evidence details and identifiers</summary>
    <dl>
      <dt>Evaluated candidate</dt><dd>${short(value.evaluated.candidate.commit)} · tree ${short(value.evaluated.candidate.tree)}</dd>
      <dt>Evidence currentness</dt><dd>At proof: ${escape(value.currentness.atProof.state)} · ${value.recordId ? "when merge event arrived" : "latest retained observation"}: ${escape(value.currentness.atMergeEvent.state)} · ${value.recordId ? `at merge decision: ${escape(value.currentness.atMergeDecision.state)}` : "no merge decision is bound"}</dd>
      <dt>Landed content</dt><dd>${value.recordId ? `Commit ${short(value.landing.mergeCommit)} · tree ${short(value.landing.tree)} · ${escape(value.landing.path)}` : "No merge event is bound to this receipt."}</dd>
      <dt>Authoritative relationship</dt><dd>${escape(value.relationship.verdict)} · ${escape(value.relationship.reason)}</dd>
    </dl>
    <h3>Bound claims</h3>${claims}
    <p><a href="/proof/receipts/${escape(value.evaluated.receiptId)}/merge-truth">Download Merge Truth JSON</a>${value.references.bundle ? ` · <a href="${escape(value.references.bundle)}">Download replay bundle</a>` : ""}</p>
    <p><small>${escape(value.replay.limitation)}</small></p>
  </details></section>`;
}

module.exports = { build, verify, summary, evidenceChain, html, relationship, validateLanding };
