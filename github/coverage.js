"use strict";
// Normalized provider facts in the existing evidence model, NOT a new public
// upload API or a claimed GitHub REST response schema. The live collector must
// leave this unavailable until GitHub exposes the complete aggregate and its
// producer links. Fixtures exercise the proof boundary without inventing an API.
const { hash, sha } = require("./common");
function name(rule) { return `CODE_COVERAGE:${rule.rulesetId ?? hash(rule).slice(0, 16)}`; }
function enabled(rule) { return rule.state !== "RECOGNIZED" || Object.values(rule.parameters).some(n => n > 0); }
function counts(v) {
  return v && Number.isSafeInteger(v.covered) && Number.isSafeInteger(v.total) &&
    v.total > 0 && v.covered >= 0 && v.covered <= v.total;
}
// Decimal policy percentages are exact rationals. Never round a near-threshold
// measurement up into a positive proof (including percentage-point drops).
function rational(n) {
  const [mantissa, exponent = "0"] = String(n).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const power = fraction.length - Number(exponent);
  return power >= 0 ? [BigInt(whole + fraction), 10n ** BigInt(power)] : [BigInt(whole + fraction) * 10n ** BigInt(-power), 1n];
}
function evaluate(c, rule, ci) {
  const out = { name: name(rule), rulesetId: rule.rulesetId, parameters: rule.parameters,
    state: "UNKNOWN", reason: "CODE_COVERAGE_EVIDENCE_UNAVAILABLE", trust: "GITHUB_API" };
  if (rule.state !== "RECOGNIZED") return { ...out, reason: "CODE_COVERAGE_RULE_MALFORMED" };
  // GitHub documents 0 as disabling the respective threshold.
  if (!enabled(rule)) return { ...out, state: "TRUE", reason: "CODE_COVERAGE_THRESHOLDS_DISABLED" };
  const e = c.coverage?.value;
  if (c.coverage?.state !== "AVAILABLE" || !e) return out;
  const unknown = reason => ({ ...out, reason });
  if (e.provider !== "GITHUB_CODE_QUALITY" || e.trust !== "GITHUB_API" ||
      typeof e.observationId !== "string" || !e.observationId ||
      e.repositoryId !== c.identity.repositoryId || e.pr !== c.identity.pr || e.headSha !== c.identity.headSha ||
      !sha(e.candidate?.sha) || e.candidate.sha !== c.target.value?.sha || e.candidate.tree !== c.target.value?.tree ||
      !sha(e.candidate.tree) || e.aggregate?.commit !== e.candidate.sha)
    return unknown("CODE_COVERAGE_SUBJECT_UNBOUND");
  if (e.aggregate.complete !== true || e.aggregate.scope !== "ALL_REPORTS" || !counts(e.aggregate))
    return unknown("CODE_COVERAGE_AGGREGATE_UNAVAILABLE");
  const measured = Date.parse(e.measuredAt), observed = Date.parse(c.observedAt);
  if (!Number.isFinite(measured) || !Number.isFinite(observed) || measured > observed)
    return unknown("CODE_COVERAGE_OBSERVATION_UNBOUND");
  const producers = e.producers;
  if (!Array.isArray(producers) || !producers.length || new Set(producers.map(p => p.checkId)).size !== producers.length)
    return unknown("CODE_COVERAGE_PRODUCER_UNBOUND");
  for (const p of producers) {
    const rows = ci.required.filter(r => r.checkId === p.checkId && r.producerBound && r.executionRecorded && r.accepted);
    if (rows.length !== 1) return unknown("CODE_COVERAGE_PRODUCER_UNBOUND");
    const j = rows[0].workflowJobs[0];
    for (const key of ["checkId", "runId", "attempt", "jobId", "workflowId", "workflowPath", "event"])
      if (p[key] !== j[key]) return unknown("CODE_COVERAGE_PRODUCER_UNBOUND");
    if (p.workflowBlob !== j.workflowBlob.value.sha ||
        !Number.isFinite(Date.parse(j.runStartedAt)) || Date.parse(j.runStartedAt) > measured)
      return unknown("CODE_COVERAGE_PRODUCER_UNBOUND");
  }
  const violations = [], parameters = rule.parameters;
  if (parameters.minimum_coverage > 0) {
    const [n, d] = rational(parameters.minimum_coverage);
    if (100n * BigInt(e.aggregate.covered) * d < n * BigInt(e.aggregate.total))
      violations.push("MINIMUM_LINE_COVERAGE_NOT_MET");
  }
  if (parameters.max_coverage_drop > 0) {
    const base = e.defaultBranch;
    if (!base || base.ref !== c.identity.defaultBranch || !sha(base.commit) ||
        c.coverageContext?.state !== "AVAILABLE" || c.coverageContext.value.ref !== base.ref ||
        c.coverageContext.value.sha !== base.commit || !counts(base) || base.complete !== true || base.scope !== "ALL_REPORTS")
      return unknown("CODE_COVERAGE_DEFAULT_BRANCH_UNBOUND");
    const [n, d] = rational(parameters.max_coverage_drop);
    if (100n * (BigInt(base.covered) * BigInt(e.aggregate.total) - BigInt(e.aggregate.covered) * BigInt(base.total)) * d >
        n * BigInt(base.total) * BigInt(e.aggregate.total)) violations.push("MAXIMUM_LINE_COVERAGE_DROP_EXCEEDED");
  }
  return { ...out, state: violations.length ? "FALSE" : "TRUE", reason: violations[0] || "CODE_COVERAGE_REQUIREMENT_SATISFIED",
    violations, provenance: { observationId: e.observationId, candidate: e.candidate, measuredAt: e.measuredAt,
      aggregate: e.aggregate, ...(parameters.max_coverage_drop > 0 ? { defaultBranch: e.defaultBranch } : {}), producers } };
}
function binding(c, rules) {
  if (!rules.some(enabled)) return { requirements: rules };
  const selected = (c.checks?.value || []).filter(x => (c.coverage?.value?.producers || []).some(p => p.checkId === x.id));
  const checks = (c.checks?.value || []).filter(x => selected.some(p => p.name === x.name));
  const jobs = require("./rules").relevantJobs(c).filter(j => checks.some(x => x.id === j.checkId));
  const evidence = structuredClone(c.coverage || { state: "UNAVAILABLE", reason: "CODE_COVERAGE_EVIDENCE_UNAVAILABLE" });
  if (evidence.value && !rules.some(r => r.parameters?.max_coverage_drop > 0)) delete evidence.value.defaultBranch;
  return { requirements: rules, subject: { repositoryId: c.identity.repositoryId, pr: c.identity.pr, headSha: c.identity.headSha, target: c.target },
    evidence,
    ...(rules.some(r => r.parameters?.max_coverage_drop > 0) ? { defaultBranch: c.identity.defaultBranch, defaultBranchObservation: c.coverageContext || null } : {}),
    producers: jobs, checks,
    authorityChangedFiles: (c.git?.value?.candidateFiles || []).filter(p => jobs.some(j => j.workflowPath === p)),
    executionProtections: jobs.length ? require("./rules").executionPolicyBinding(c, jobs) : null };
}
module.exports = { name, enabled, evaluate, binding };
