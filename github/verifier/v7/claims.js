"use strict";
const { fingerprints, details } = require("./bindings"), { of } = require("./subject");
function describe(c, rules, ci, approval, violations, gaps, coverage = []) {
  const subject = of(c), bound = { ...fingerprints(c), ...details(c) };
  const policyObserved = c.rules.executionProtections?.state === "AVAILABLE" && Array.isArray(c.rules.executionProtections.value);
  const rulesKnown = rules.state === "AVAILABLE" && !rules.unsupported.length && !rules.coverage.some(r => r.state === "MALFORMED") && policyObserved;
  const targetBound = !gaps.some(x => ["TARGET_BINDING_MISMATCH", "CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE", "CANDIDATE_TREE_UNAVAILABLE"].includes(x));
  const claim = (name, state, reason, extra = {}) => ({ name, subject, state, reason: reason || null,
    observationId: require("./common").hash({ evidence: c, startedAt: c.startedAt }),
    binding: bound[name] || bound.CI_EXECUTED, observedAt: c.observedAt,
    trust: "GITHUB_API", ...extra });
  return [
    claim("TARGET", subject.state === "AVAILABLE" && c.target.state === "AVAILABLE" && !gaps.some(x => ["TARGET_BINDING_MISMATCH", "CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE", "CANDIDATE_TREE_UNAVAILABLE"].includes(x)) ? "TRUE" : "UNKNOWN", c.target.reason),
    ...ci.required.map(row => claim(`CI_EXECUTED:${row.name}`, targetBound && row.executionRecorded && row.accepted ? "TRUE" :
      violations.some(v => v.checkId === row.checkId && v.claim === "CI_EXECUTED") ? "FALSE" : "UNKNOWN", row.state,
      { producer: row.workflowJobs?.map(j => ({ appId: row.observedCheck?.appId, workflowId: j.workflowId, actor: j.actor, triggeringActor: j.triggeringActor, runStartedAt: j.runStartedAt, executionProtection: row.executionProtection, path: j.workflowPath, blob: j.workflowBlob, event: j.event, runId: j.runId, attempt: j.attempt })) || [] })),
    ...coverage.map(row => claim(row.name, targetBound ? row.state : "UNKNOWN", targetBound ? row.reason : "CODE_COVERAGE_SUBJECT_UNBOUND", { parameters: row.parameters, provenance: row.provenance || null })),
    claim("APPROVAL_CURRENT", ["PROVEN", "NOT_APPLICABLE"].includes(approval.state) ? "TRUE" : approval.reason === "CHANGES_REQUESTED_OBSERVED" ? "FALSE" : "UNKNOWN", approval.reason),
    claim("RULES_SNAPSHOT", rulesKnown ? "TRUE" : "UNKNOWN", rules.state !== "AVAILABLE" ? "RULES_UNAVAILABLE" : !policyObserved ? "EXECUTION_PROTECTIONS_UNAVAILABLE" : rules.coverage.some(r => r.state === "MALFORMED") ? "CODE_COVERAGE_RULE_MALFORMED" : rules.unsupported.join(",")),
    claim("REMOTE_DURABLE", c.remote.value?.confirmed === true && c.remote.value.observedSha === c.identity.headSha ? "TRUE" : "UNKNOWN", c.remote.reason),
  ];
}
module.exports = { describe };
