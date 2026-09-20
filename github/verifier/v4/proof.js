"use strict";
const { requirements } = require("./rules");
const { analyzeMetadata } = require("./local-evidence");
const { hash, randomUUID, sha } = require("./common");
function ciEvidence(c, r, options = {}) {
  const out = {
    target: c.target,
    state: "NOT_PROVEN",
    required: [],
    selfReference: null,
    acceptedCount: 0,
    executionCount: 0,
  };
  if (r.state !== "AVAILABLE") return { ...out, reason: "RULES_UNAVAILABLE" };
  // A repository may require Merge Proof's own check. That requirement is
  // satisfied by publishing this receipt, and this receipt cannot be
  // independent evidence about the change it describes. It is therefore
  // recorded as out of scope rather than pushed in as a requirement no
  // evidence could ever satisfy, which would deadlock a required gate.
  // Every other required check is still enforced exactly as before.
  const self = require("./setup").selfRule;
  const selfEntry = r.checks.map((rule) => self(rule, options.appId)).find(Boolean);
  const independent = r.checks.filter((rule) => !self(rule, options.appId));
  if (selfEntry)
    out.selfReference = {
      ...selfEntry,
      state: "SELF_CHECK_NOT_INDEPENDENT_EVIDENCE",
      note:
        selfEntry.boundToThisApp === true
          ? "This repository requires Merge Proof's own check, bound to this App. The requirement is this receipt; it is not counted as evidence about the change."
          : "This repository requires a check named the same as Merge Proof's own receipt check, without binding it to a specific App. Merge Proof does not count that context as independent evidence about the change.",
    };
  if (!independent.length)
    return { ...out, reason: "NO_REQUIRED_VALIDATION_CONFIGURED" };
  if (c.checks.state !== "AVAILABLE" || c.statuses.state !== "AVAILABLE")
    return { ...out, reason: "CHECK_EVIDENCE_UNAVAILABLE" };
  for (const rule of independent) {
    // The collector drops every check run carrying Merge Proof's own name, so
    // a requirement using that name but bound to a different App can never be
    // satisfied here. Say that, rather than reporting it as simply missing.
    if (rule.name === require("./check-name").NAME) {
      out.required.push({
        ...rule,
        state: "NAME_COLLIDES_WITH_MERGE_PROOF_CHECK",
        accepted: false,
        executionRecorded: false,
      });
      continue;
    }
    const allNamed = c.checks.value.filter(
      (x) =>
        x.name === rule.name && (rule.appId === null || x.appId === rule.appId),
    );
    const eligibleEvent = c.target.value?.kind === "MERGE_GROUP" ? "merge_group" : "pull_request";
    const execution = c.execution.state === "AVAILABLE" ? c.execution.value : [];
    const allJobs = execution.filter(j => allNamed.some(x => x.id === j.checkId && x.sha === c.target.value?.sha));
    const producerIds = new Set(allJobs.map(j => j.workflowId).filter(Number.isSafeInteger));
    const producerAmbiguous = producerIds.size > 1;
    const producerUnknown = allNamed.filter(x => x.sha === c.target.value?.sha).some(x => !allJobs.some(j => j.checkId === x.id && Number.isSafeInteger(j.workflowId)));
    // Wrong-event runs cannot replace a qualifying run, regardless of ID order.
    const qualifying = allNamed.filter(x => !execution.some(j => j.checkId === x.id) || execution.some(j => j.checkId === x.id && j.event === eligibleEvent));
    const named = qualifying.length ? qualifying : allNamed;
    const status = c.statuses.value.filter((x) => x.name === rule.name);
    const latest = (xs, s) =>
      xs.filter((x) => x.sha === s).sort((a, b) => b.id - a.id)[0];
    const targetSha = c.target.value?.sha;
    // GitHub prefers a test-merge check when one exists, otherwise head checks.
    // This is an observed conclusion calculation, not a promise GitHub will merge.
    const acceptanceSha =
      c.target.value?.kind === "MERGE_GROUP" ||
      named.some((x) => x.sha === targetSha) ||
      status.some((x) => x.sha === targetSha)
        ? targetSha
        : c.identity.headSha;
    const acceptCheck = latest(named, acceptanceSha),
      acceptStatus = latest(status, acceptanceSha);
    const checkAccepted =
      acceptCheck &&
      acceptCheck.status === "completed" &&
      ["success", "neutral", "skipped"].includes(acceptCheck.conclusion);
    const statusAccepted =
      acceptStatus?.state === "success" && rule.appId === null;
    const accepted = Boolean(
      (acceptCheck || acceptStatus) &&
        (!acceptCheck || checkAccepted) &&
        (!acceptStatus || statusAccepted),
    );
    const exact = latest(named, targetSha);
    const jobs =
      c.execution.state === "AVAILABLE"
        ? c.execution.value.filter((j) => j.checkId === exact?.id)
        : [];
    // Run/job/step observations are provider evidence, not an assertion about
    // which files a customer's workflow chose to check out or test.
    const ambiguous =
      producerAmbiguous || new Set(allNamed.filter((x) => x.sha === targetSha).map((x) => x.appId))
        .size > 1;
    const authorityChanged = allJobs.some(j => typeof j.workflowPath === "string" && c.git.value?.candidateFiles?.includes(j.workflowPath));
    const producerBound = !ambiguous && !producerUnknown && !authorityChanged && jobs.length === 1 && jobs.every(j =>
      Number.isSafeInteger(j.workflowId) && typeof j.workflowPath === "string" && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(j.workflowPath) &&
      j.event === eligibleEvent && (eligibleEvent === "merge_group" || j.pullRequests?.some(p => p.number === c.identity.pr && p.headSha === c.identity.headSha && p.repositoryId === c.identity.repositoryId)) &&
      j.workflowBlob?.state === "AVAILABLE" && sha(j.workflowBlob.value?.sha) && j.workflowBlob.value.path === j.workflowPath && j.workflowBlob.value.commit === targetSha &&
      j.runSha === targetSha && j.sha === targetSha && Number.isSafeInteger(j.attempt) && j.attempt > 0);
    const protection = jobs.map(j => require("./rules").executionPolicy(c, j));
    const protectionSatisfied = protection.every(p => !p.required || p.state === "TRUE");
    const executed = Boolean(
      producerBound && protectionSatisfied &&
        exact?.status === "completed" &&
        exact.conclusion === "success" &&
        jobs.length === 1 &&
        jobs.every(
          (j) =>
            Number.isSafeInteger(j.workflowId) &&
            typeof j.workflowPath === "string" && j.workflowPath.startsWith(".github/workflows/") &&
            j.event === eligibleEvent &&
            (eligibleEvent === "merge_group" || j.pullRequests?.some(p => p.number === c.identity.pr && p.headSha === c.identity.headSha && p.repositoryId === c.identity.repositoryId)) &&
            j.workflowBlob?.state === "AVAILABLE" && sha(j.workflowBlob.value?.sha) &&
            j.workflowBlob.value.path === j.workflowPath && j.workflowBlob.value.commit === targetSha &&
            j.sha === targetSha &&
            j.runSha === targetSha &&
            j.status === "completed" &&
            j.conclusion === "success" &&
            j.runStatus === "completed" &&
            j.runConclusion === "success" &&
            j.steps.length > 0 &&
            j.steps.every(
              (s) => s.status === "completed" && s.conclusion === "success",
            ) &&
            j.steps.some(
              (s) =>
                s.status === "completed" &&
                s.conclusion === "success" &&
                Number.isFinite(Date.parse(s.startedAt)) &&
                Number.isFinite(Date.parse(s.completedAt)),
            ),
        ),
    );
    const state = !exact
      ? named.length || status.length
        ? "OTHER_SHA_OR_STATUS_ONLY"
        : "MISSING"
      : exact.status !== "completed"
        ? "PENDING"
        : exact.conclusion === "success"
          ? executed
            ? "EXECUTION_RECORDED"
            : "SUCCESS_ASSERTED_EXECUTION_UNAVAILABLE"
          : ["skipped", "neutral"].includes(exact.conclusion)
            ? exact.conclusion.toUpperCase()
            : "FAILED";
    out.required.push({
      ...rule,
      state,
      accepted,
      acceptanceSha,
      checkId: exact?.id || null,
      conclusion: exact?.conclusion || null,
      executionRecorded: executed,
      workflowJobs: jobs,
      producerBound,
      executionProtection: protection,
      producerAmbiguous,
      producerUnknown,
      authorityChanged,
      eventIneligible: jobs.some(j => j.event !== eligibleEvent),
      observedCheck: acceptCheck || null,
      observedStatus: acceptStatus || null,
    });
  }
  out.acceptedCount = out.required.filter((x) => x.accepted).length;
  out.executionCount = out.required.filter((x) => x.executionRecorded).length;
  if (
    c.target.state === "AVAILABLE" &&
    out.required.every((x) => x.executionRecorded && x.accepted)
  )
    out.state = "PROVEN";
  return out;
}
function approvalEvidence(c, r) {
  const out = {
    state: "NOT_PROVEN",
    observed: [],
    current: [],
    required: r.approvals + (c.identity.author?.type === "Bot" ? 1 : 0),
  };
  if (c.reviews.state !== "AVAILABLE")
    return { ...out, reason: "REVIEWS_UNAVAILABLE" };
  const latest = new Map();
  for (const x of [...c.reviews.value].sort(
    (a, b) =>
      Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id - b.id,
  )) {
    if (["APPROVED", "DISMISSED", "CHANGES_REQUESTED"].includes(x.state))
      latest.set(x.userId, x);
  }
  const rows = [...latest.values()];
  out.observed = rows
    .filter((x) => x.state === "APPROVED")
    .map((x) => ({ id: x.id, reviewer: x.login, sha: x.sha }));
  const initiating = c.authority?.initiator;
  const initiatingId = c.identity.author?.type === "Bot" && initiating?.state === "AVAILABLE" && initiating.value.headSha === c.identity.headSha && initiating.value.actor?.type === "User" ? initiating.value.actor.id : null;
  const pusherId = c.identity.author?.type === "Bot" && c.authority?.activity?.value?.actor?.type === "User" ? c.authority.activity.value.actor.id : null;
  out.current = rows
    .filter(
      (x) =>
        x.state === "APPROVED" &&
        sha(x.sha) &&
        x.sha === c.identity.headSha &&
        x.userType === "User" &&
        x.userId !== c.identity.authorId && x.userId !== initiatingId && x.userId !== pusherId &&
        x.writePermission.state === "AVAILABLE" &&
        x.writePermission.value === true &&
        Number.isFinite(Date.parse(x.submittedAt)),
    )
    .map((x) => ({ id: x.id, reviewer: x.login, sha: x.sha }));
  if (r.state !== "AVAILABLE") return { ...out, reason: "RULES_UNAVAILABLE" };
  if (r.lastPush || r.codeOwners)
    return {
      ...out,
      reason: r.lastPush
        ? "LAST_PUSH_ACTOR_APPROVAL_UNAVAILABLE"
        : "CODE_OWNER_APPROVAL_UNAVAILABLE",
    };
  if (rows.some((x) => x.state === "CHANGES_REQUESTED" && x.writePermission?.state === "AVAILABLE" && x.writePermission.value === true))
    return { ...out, reason: "CHANGES_REQUESTED_OBSERVED" };
  if (c.identity.author?.type === "Bot" && !initiatingId)
    return { ...out, reason: "INITIATING_HUMAN_UNAVAILABLE" };
  if (out.required === 0) return { ...out, state: "NOT_APPLICABLE" };
  return {
    ...out,
    state: out.current.length >= out.required ? "PROVEN" : "NOT_PROVEN",
    reason:
      out.current.length >= out.required
        ? null
        : "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  };
}
function fingerprint(c) {
  const { startedAt, observedAt, source, consistency, ...evidence } = c;
  return hash(evidence);
}
function prove(c, options = {}) {
  c = structuredClone(c);
  const local = analyzeMetadata(c),
    rules = requirements(c.rules);
  const ci = ciEvidence(c, rules, options),
    approval = approvalEvidence(c, rules);
  const gaps = [];
  if (!sha(c.target.value?.tree)) gaps.push("CANDIDATE_TREE_UNAVAILABLE");
  if (
    c.target.state === "AVAILABLE" &&
    (!sha(c.target.value.sha) ||
      c.target.value.headSha !== c.identity.headSha ||
      c.target.value.baseSha !== c.identity.baseSha ||
      !["HEAD_CONTAINS_CURRENT_BASE", "PR_TEST_MERGE", "MERGE_GROUP", "LANDED_TWO_PARENT_MERGE"].includes(c.target.value.kind))
  )
    gaps.push("TARGET_BINDING_MISMATCH");
  if (c.target.value?.kind === "HEAD_CONTAINS_CURRENT_BASE" &&
      (c.target.value.sha !== c.identity.headSha || c.git.value?.mergeBase !== c.identity.baseSha)) gaps.push("TARGET_BINDING_MISMATCH");
  if (c.target.value?.kind === "PR_TEST_MERGE" &&
      (c.target.value.parents?.length !== 2 || c.target.value.parents[0] !== c.identity.baseSha || c.target.value.parents[1] !== c.identity.headSha)) gaps.push("TARGET_BINDING_MISMATCH");
  if (c.target.value?.kind === "MERGE_GROUP") {
    const selection = c.target.value.selection;
    if (
      selection?.state !== "AVAILABLE" ||
      selection.value.headSha !== c.target.value.sha ||
      (selection.value.baseSha !== c.identity.baseSha && !require("./queue-order").bound(selection.value.order,c.identity,selection.value)) ||
      selection.value.candidateSha !== c.identity.headSha
    )
      gaps.push("CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE");
  }
  if (c.consistency !== "STABLE_OBSERVATION")
    gaps.push("EVIDENCE_CHANGED_DURING_COLLECTION");
  if (c.identity.analysisMode === "HISTORICAL_TWO_PARENT_MERGE")
    gaps.push("HISTORICAL_RULES_AND_APPROVAL_VALIDITY_UNAVAILABLE");
  else if (c.identity.prState !== "open" || c.identity.merged)
    gaps.push("LIVE_PR_NOT_OPEN");
  if (rules.state !== "AVAILABLE") gaps.push("RULES_UNAVAILABLE");
  if (rules.coverage.length) gaps.push(rules.coverage.some(x => x.state === "MALFORMED") ? "CODE_COVERAGE_RULE_MALFORMED" : "CODE_COVERAGE_EVIDENCE_UNAVAILABLE");
  if (rules.unsupported.length)
    gaps.push("UNSUPPORTED_REPOSITORY_REQUIREMENTS");
  if (c.target.state !== "AVAILABLE")
    gaps.push("APPLICABLE_MERGE_STATE_UNAVAILABLE");
  if (ci.state !== "PROVEN")
    gaps.push(ci.reason || "CURRENT_STATE_EXECUTION_NOT_PROVEN");
  gaps.push(...ci.required.flatMap(x => x.executionProtection || []).filter(x => x.required && x.state !== "TRUE").map(x => x.reason));
  if (ci.required.some(x => x.producerUnknown)) gaps.push("EVIDENCE_PRODUCER_UNAVAILABLE");
  if (ci.required.some(x => x.producerAmbiguous)) gaps.push("EVIDENCE_PRODUCER_AMBIGUOUS");
  if (ci.required.some(x => x.authorityChanged)) gaps.push("EVIDENCE_AUTHORITY_CHANGED_BY_SUBJECT");
  if (ci.required.some(x => x.eventIneligible)) gaps.push("EXECUTION_EVENT_INELIGIBLE");
  if (!["PROVEN", "NOT_APPLICABLE"].includes(approval.state))
    gaps.push(approval.reason || "CURRENT_APPROVAL_NOT_PROVEN");
  if (
    c.remote.state !== "AVAILABLE" ||
    c.remote.value.confirmed !== true ||
    c.remote.value.observedSha !== c.identity.headSha
  )
    gaps.push("REMOTE_CANDIDATE_NOT_CONFIRMED");
  // The combined target already includes this base and has exact execution.
  // Local-only CLI semantics remain unchanged.
  const contained = c.target.state === "AVAILABLE" && ci.state === "PROVEN" &&
    ((c.target.value.kind === "PR_TEST_MERGE" && c.target.value.parents?.[0] === c.identity.baseSha && c.target.value.parents?.[1] === c.identity.headSha) ||
     (c.target.value.kind === "MERGE_GROUP" && c.target.value.selection?.state === "AVAILABLE"));
  gaps.push(...local.findings.filter(f => !(contained && f.id === "BASE_DRIFT_UNVERIFIED")).map(f => f.id));
  const violations = [];
  const expected = c.expectedTree;
  if (expected?.comparison === "CANDIDATE_MISMATCH" && expected.base === c.identity.baseSha && expected.head === c.identity.headSha && expected.status === "RECONSTRUCTED") {
    gaps.push("CANDIDATE_MISMATCH");
    violations.push({ claim: "EXPECTED_TREE", reason: "CANDIDATE_MISMATCH" });
  }
  for (const row of ci.required) {
    const j = row.workflowJobs?.[0];
    if (row.producerBound && !gaps.includes("TARGET_BINDING_MISMATCH") &&
        row.executionProtection.every(p => !p.required || p.state === "TRUE") &&
        row.observedCheck?.status === "completed" && row.conclusion === "failure")
      violations.push({ claim: "CI_EXECUTED", reason: "REQUIRED_CHECK_FAILED", checkId: row.checkId });
  }
  if (approval.reason === "CHANGES_REQUESTED_OBSERVED") violations.push({ claim: "APPROVAL_CURRENT", reason: "CHANGES_REQUESTED_OBSERVED" });
  const uncertain = c.consistency !== "STABLE_OBSERVATION" || require("./bindings").compare(c, c).unavailable.length > 0;
  const verdict = !uncertain && violations.length ? "FAIL" : gaps.length ? "NOT_PROVEN" : "VERIFIED";
  return {
    schemaVersion: 2,
    receiptId: randomUUID(),
    tool: { name: "merge-proof", version: "0.2.0" },
    policy: expected ? "github-exact-state-v3" : "github-exact-state-v2",
    expectedTree: expected || { status: "NOT_RECONSTRUCTABLE", tree: null, reason: "MIRROR_NOT_CONFIGURED" },
    proofOptions: { appId: options.appId ?? null },
    subject: require("./subject").of(c),
    policySnapshot: { hash: hash({ normalized: rules, raw: c.rules }), normalized: rules, raw: c.rules },
    observationId: hash({ evidence: c, startedAt: c.startedAt }),
    bindings: require("./bindings").fingerprints(c),
    claims: require("./claims").describe(c, rules, ci, approval, violations, gaps),
    verdict,
    violations,
    issuedAt: c.observedAt,
    identity: c.identity,
    fingerprint: fingerprint(c),
    freshness: {
      state:
        c.consistency !== "STABLE_OBSERVATION"
          ? "STALE"
          : require("./bindings").compare(c, c).unavailable.length
            ? "UNAVAILABLE"
            : "CURRENT",
      asOf: c.observedAt,
      meaning:
        "Current only at the recorded observation; later views must recheck evidence.",
    },
    summary: {
      queueStage: rules.mergeQueue
        ? c.target.value?.kind === "MERGE_GROUP" ? "MERGE_GROUP" : "ADMISSION_ONLY"
        : null,
      ci,
      approval,
      authorization: require("./authority").graph(c, approval),
      remote: c.remote,
      rules,
      target: c.target,
      actors: require("./actors").summarize(c),
      gate: require("./setup").gate(c.rules, options.appId),
    },
    gaps: [...new Set(gaps)],
    local,
    evidence: c,
    notChecked: [
      "CODE_CORRECTNESS",
      "SECURITY",
      "WORKFLOW_CHECKOUT_CONTENTS",
      ...(c.rules.executionProtections?.state !== "AVAILABLE" ? ["EXECUTION_PROTECTIONS_UNAVAILABLE"] : []),
      "SCOPE_CREEP_VS_DECLARED_SCOPE",
      "FUTURE_REMOTE_RETENTION",
      "WHICH_TOOL_OR_MODEL_PRODUCED_THE_CODE",
      ...(rules.mergeQueue && c.target.value?.kind !== "MERGE_GROUP"
        ? ["MERGE_QUEUE_GROUP_NOT_YET_PROVEN"] : []),
      ...(ci.selfReference ? ["MERGE_PROOF_OWN_REQUIRED_CHECK"] : []),
    ],
    next: require("./wording").next(gaps),
    limitations: [
      "VERIFIED covers only these evidence claims; it does not establish bug-free, secure or production-safe code.",
      "GitHub observations are not an atomic transaction or a guarantee of future merge state.",
      "Job records establish GitHub-reported execution, not what source a workflow actually checked out.",
      "Remote confirmation is point-in-time ref presence, not a future retention guarantee.",
      require("./actors").LIMITATION,
    ],
  };
}
function freshness(receipt, current) {
  if (!current)
    return {
      state: "UNAVAILABLE",
      historicalVerdict: receipt.verdict,
      reason: "REFRESH_FAILED",
      asOf: new Date().toISOString(),
    };
  const { changed, unavailable, claims } = require("./bindings").compare(receipt.evidence, current);
  return {
    state:
      changed.length || current.consistency !== "STABLE_OBSERVATION"
        ? "STALE"
        : unavailable.length
          ? "UNAVAILABLE"
          : "CURRENT",
    historicalVerdict: receipt.verdict,
    claims,
    changed,
    unavailable,
    asOf: current.observedAt,
    next: changed.length
      ? "RE-PROOF REQUIRED"
      : unavailable.length
        ? "REFRESH REQUIRED"
        : "Current at this observation only.",
  };
}
module.exports = {
  prove,
  ciEvidence,
  approvalEvidence,
  fingerprint,
  freshness,
};
