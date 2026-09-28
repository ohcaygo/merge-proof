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

function reconciliationFor(receipt, record, input = {}) {
  const expected = {
    repositoryId: receipt.identity.repositoryId,
    pullRequest: receipt.identity.pr,
    candidate: receipt.identity.headSha,
  };
  const subject = input.subject || null;
  const subjectMatches = subject?.repositoryId === expected.repositoryId &&
    subject?.pullRequest === expected.pullRequest && subject?.candidate === expected.candidate;
  const recoverySubject = input.recovered?.subject || null;
  const recoverySubjectMatches = recoverySubject?.repositoryId === expected.repositoryId &&
    recoverySubject?.pullRequest === expected.pullRequest && recoverySubject?.candidate === expected.candidate;
  const relevantAt = record?.mergedAt || receipt.issuedAt;
  const relevantTime = Date.parse(relevantAt || "");
  const asOfTime = Date.parse(input.asOf || "");
  const asOf = Number.isFinite(asOfTime) ? input.asOf : null;
  const base = {
    state: "UNAVAILABLE",
    asOf,
    relevantAt,
    reason: "PROVIDER_HISTORY_UNAVAILABLE",
    coverage: "INCOMPLETE",
    recovered: null,
    scope: "GitHub App delivery history for this repository, pull request, and evaluated candidate; this does not establish atomic currentness at merge.",
  };
  if (!subjectMatches)
    return { ...base, reason: subject ? "RECONCILIATION_SUBJECT_MISMATCH" : "RECONCILIATION_SUBJECT_UNBOUND" };
  if (!Number.isFinite(relevantTime))
    return { ...base, reason: "PROOF_POINT_TIME_UNAVAILABLE" };
  if (input.inProgress)
    return { ...base, state: "IN_PROGRESS", reason: "PROVIDER_HISTORY_TRAVERSAL_IN_PROGRESS" };
  if (input.state !== "RECONCILED")
    return { ...base, reason: input.reason || "PROVIDER_HISTORY_UNAVAILABLE" };
  if (!asOf)
    return { ...base, reason: "RECONCILIATION_TIME_UNAVAILABLE" };
  const requestedTime = Date.parse(input.recovered?.requestedAt || "");
  const observedTime = Date.parse(input.recovered?.observedAt || "");
  const recovered = input.recovered?.confirmed === true &&
    recoverySubjectMatches &&
    typeof input.recovered.deliveryId === "string" && /^[\w-]{1,100}$/.test(input.recovered.deliveryId) &&
    typeof input.recovered.event === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(input.recovered.event) &&
    Number.isFinite(requestedTime) && Number.isFinite(observedTime) &&
    observedTime >= requestedTime && observedTime <= asOfTime && requestedTime <= asOfTime
      ? {
          state: "RECOVERED",
          event: input.recovered.event || null,
          requestedAt: input.recovered.requestedAt || null,
          observedAt: input.recovered.observedAt,
          deliveryId: input.recovered.deliveryId || null,
        }
      : null;
  const requiredCoverageTime = recovered && !record ? observedTime : relevantTime;
  if (asOfTime < requiredCoverageTime)
    return { ...base, state: "STALE", reason: "RECONCILIATION_PREDATES_PROOF" };
  return {
    ...base,
    state: recovered ? "RECOVERED" : "RECONCILED",
    reason: recovered ? "DELAYED_PROVIDER_EVENT_RECOVERED" : "PROVIDER_HISTORY_RECONCILED",
    coverage: "COMPLETE",
    recovered,
  };
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
    reconciliation: reconciliationFor(receipt, record, reconciliation),
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
      replayPacket: receiptRow?.artifacts ? `/proof/receipts/${receipt.receiptId}/replay-packet` : null,
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
        meta: `Head tree ${short(value.evaluated.candidate.tree)} · evaluated target tree ${short(value.evaluated.target?.tree)}`,
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

function buyerOutcome(value) {
  const verdict = value.relationship.verdict;
  const current = value.currentness.atMergeEvent || unavailable("CURRENTNESS_NOT_RECORDED");
  const gaps = value.evidence.gaps || [];
  const headline = verdict === "VERIFIED"
    ? "The evaluated tree is the tree that landed."
    : verdict === "FAIL"
      ? "Different content landed."
      : friendlyReason[value.relationship.reason] || value.relationship.plain;
  let context;
  if (verdict === "VERIFIED")
    context = `The ${value.evaluated.receiptVerdict} evaluated-candidate evidence is bound to the landed tree shown below.`;
  else if (verdict === "FAIL")
    context = `The evaluated candidate evidence was ${value.evaluated.receiptVerdict}, but the observed landed tree does not match the evaluated tree.`;
  else if (current.state === "STALE")
    context = "Merge truth remains NOT_PROVEN because the bound evidence is stale for the recorded merge state.";
  else if (gaps.length)
    context = `Merge truth remains NOT_PROVEN. Evaluated-candidate evidence is missing: ${gaps.slice(0, 2).map(words).join("; ")}.`;
  else
    context = `Merge truth remains NOT_PROVEN. ${friendlyReason[value.relationship.reason] || value.relationship.plain}`;
  return { verdict, headline, context };
}

function buyerReconciliation(value) {
  const reconciliation = value.reconciliation;
  const through = reconciliation.asOf ? ` through ${reconciliation.asOf}` : "";
  const conclusion = `This provider-history status does not change Merge Truth: ${value.relationship.verdict}.`;
  if (reconciliation.state === "RECOVERED") return {
    state: "Recovered", tone: "good",
    summary: `A delayed or missed provider event for this proof was recovered through reconciliation${reconciliation.recovered?.observedAt ? ` at ${reconciliation.recovered.observedAt}` : ""}.`,
    detail: `Relevant delivery history was traversed${through}. ${conclusion}`,
  };
  if (reconciliation.state === "RECONCILED") return {
    state: "Reconciled", tone: "good",
    summary: `Relevant provider delivery history was traversed${through}.`,
    detail: `The accepted traversal reached its completion condition for this proof. ${conclusion}`,
  };
  if (reconciliation.state === "IN_PROGRESS") return {
    state: "Reconciliation in progress", tone: "unknown",
    summary: "Merge Proof has not yet completed the accepted provider delivery-history traversal.",
    detail: `Provider-history coverage is incomplete. ${conclusion}`,
  };
  if (reconciliation.state === "STALE") return {
    state: "Out of date", tone: "unknown",
    summary: `The last completed traversal${through} predates the recorded proof point.`,
    detail: `Provider-history coverage is not current enough for this proof. ${conclusion}`,
  };
  return {
    state: "Unavailable", tone: "unknown",
    summary: "Merge Proof cannot establish reconciliation from the available provider history.",
    detail: `Provider-history coverage remains unproven. ${conclusion}`,
  };
}

function html(value, escape, supportingHtml = "", independentVerificationHtml = "") {
  const short = (x) => x ? escape(String(x).replace(/^[a-f0-9]{40}$/, (s) => s.slice(0, 12))) : "Unavailable";
  const chain = evidenceChain(value);
  const outcome = buyerOutcome(value);
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
  const reconciliation = buyerReconciliation(value);
  const reconciliationHtml = `<aside class="reconciliation-status ${escape(reconciliation.tone)}" aria-label="Provider history coverage">
    <p class="reconciliation-heading"><span>Provider history</span><strong>${escape(reconciliation.state)}</strong></p>
    <p>${escape(reconciliation.summary)}</p><small>${escape(reconciliation.detail)}</small>
  </aside>`;
  return `<section class="merge-truth" aria-labelledby="merge-truth-heading">
  <p class="eyebrow">MERGE TRUTH</p><h1 id="merge-truth-heading">Merge truth: ${escape(outcome.verdict)}</h1>
  <p class="merge-truth-lede"><strong>${escape(outcome.headline)}</strong></p>
  <p class="merge-truth-context">${escape(outcome.context)}</p>
  <div class="merge-truth-comparison" aria-label="Evaluated and landed content"><div class="truth-side"><small>Evaluated merge-target tree</small><strong>${short(value.evaluated.target?.tree)}</strong></div><div class="truth-side"><small>Actual landed tree</small><strong>${short(value.landing.tree)}</strong></div></div>
  <ol class="evidence-chain" aria-label="Merge Truth evidence chain">${stages}</ol>
  ${value.references.replayPacket ? `<div class="replay-packet-action"><a href="${escape(value.references.replayPacket)}" download>Download replay packet</a><p>Replay this conclusion locally from the supplied evidence. <strong>Unsigned packet:</strong> it checks deterministic consistency and detects unmatched alteration, but does not independently establish packet provenance or a public trust root.</p></div>` : ""}
  ${reconciliationHtml}
  ${independentVerificationHtml}
  ${supportingHtml}
  <details class="merge-truth-details"><summary>Evidence details and identifiers</summary>
    <dl>
      <dt>Evaluated candidate</dt><dd>${short(value.evaluated.candidate.commit)} · tree ${short(value.evaluated.candidate.tree)}</dd>
      <dt>Evidence currentness</dt><dd>At proof: ${escape(value.currentness.atProof.state)} · ${value.recordId ? "when merge event arrived" : "latest retained observation"}: ${escape(value.currentness.atMergeEvent.state)} · ${value.recordId ? `at merge decision: ${escape(value.currentness.atMergeDecision.state)}` : "no merge decision is bound"}</dd>
      <dt>Landed content</dt><dd>${value.recordId ? `Commit ${short(value.landing.mergeCommit)} · tree ${short(value.landing.tree)} · ${escape(value.landing.path)}` : "No merge event is bound to this receipt."}</dd>
      <dt>Authoritative relationship</dt><dd>${escape(value.relationship.verdict)} · ${escape(value.relationship.reason)}</dd>
      <dt>Provider history</dt><dd>${escape(value.reconciliation.state)} · ${escape(value.reconciliation.reason)}${value.reconciliation.asOf ? ` · through ${escape(value.reconciliation.asOf)}` : ""}</dd>
    </dl>
    <h3>Bound claims</h3>${claims}
    <p><a href="/proof/receipts/${escape(value.evaluated.receiptId)}/merge-truth">Download Merge Truth JSON</a>${value.references.bundle ? ` · <a href="${escape(value.references.bundle)}">Download replay bundle</a>` : ""}</p>
    <p><small>${escape(value.replay.limitation)}</small></p>
  </details></section>`;
}

module.exports = { build, verify, summary, evidenceChain, buyerOutcome, buyerReconciliation, html, relationship, validateLanding, reconciliationFor };
