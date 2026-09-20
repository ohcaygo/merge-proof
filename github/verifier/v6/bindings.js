"use strict";
// Only facts used by a claim participate in its currentness. Provider rollups,
// unrelated checks and comment-only reviews are not evidence dependencies.
const { hash, hasUnavailable } = require("./common");
const { requirements } = require("./rules");
function opinionated(reviews) {
  const latest = new Map();
  for (const r of [...(reviews || [])].sort((a, b) =>
    Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id - b.id))
    if (["APPROVED", "DISMISSED", "CHANGES_REQUESTED"].includes(r.state)) latest.set(r.userId, r);
  return [...latest.values()].sort((a, b) => a.userId - b.userId);
}
function identity(i) {
  const { githubMergeable, githubMergeState, mergeCommitSha, defaultBranch, ...bound } = i;
  return bound;
}
function claims(c) {
  const r = requirements(c.rules);
  const target = c.target?.value?.sha;
  const checks = (c.checks?.value || []).filter(x => r.checks.some(rule =>
    rule.name === x.name && (rule.appId === null || rule.appId === x.appId)) &&
    [target, c.identity.headSha].includes(x.sha));
  const jobs = (c.execution?.value || []).filter(j => checks.some(x => x.id === j.checkId));
  // A failed permission read excludes that reviewer. It does not make every
  // independent claim unavailable; the approval predicate still fails closed.
  const reviews = opinionated(c.reviews?.value).map(x => ({ ...x,
    writePermission: x.writePermission?.state === "AVAILABLE" ? x.writePermission :
      { state: "INELIGIBLE", reason: x.writePermission?.reason || "PERMISSION_UNKNOWN" } }));
  return {
    TARGET: { identity: identity(c.identity), git: c.git, target: c.target },
    CI_EXECUTED: { target: c.target, context: { repositoryId: c.identity.repositoryId, pr: c.identity.pr, head: c.identity.headSha }, authorityChangedFiles: (c.git.value?.candidateFiles || []).filter(p => jobs.some(j => j.workflowPath === p)), rules: { state: r.state, checks: r.checks }, executionProtections: require("./rules").executionPolicyBinding(c, jobs),
      checks: { state: c.checks?.state, value: checks },
      statuses: { state: c.statuses?.state, value: (c.statuses?.value || []).filter(x => r.checks.some(rule => rule.name === x.name)) },
      execution: { state: c.execution?.state, value: jobs } },
    APPROVAL_CURRENT: { head: c.identity.headSha, authorId: c.identity.authorId, author: c.identity.author,
      rules: { state: r.state, approvals: r.approvals, dismissStale: r.dismissStale, lastPush: r.lastPush, codeOwners: r.codeOwners },
      initiator: c.identity.author?.type === "Bot" ? c.authority?.initiator || { availability: "UNKNOWN" } : null,
      initiatingActivity: c.identity.author?.type === "Bot" ? c.authority?.activity || { availability: "UNKNOWN" } : null,
      reviews: { state: c.reviews?.state, value: reviews } },
    RULES_SNAPSHOT: { executionProtections: require("./rules").executionPolicyBinding(c, jobs), normalized: Object.fromEntries(Object.entries(r).filter(([k]) => k !== "pushTime")), sources: (c.rules.active.value || []).filter(x => !r.pushTime.includes(x)).map(x => ({ type: x.type, id: x.ruleset_id ?? null, source: x.ruleset_source ?? null, sourceType: x.ruleset_source_type ?? null })) },
    CODE_COVERAGE: require("./coverage").binding(c, r.coverage),
    REMOTE_DURABLE: c.remote,
  };
}
function fingerprints(c) { return Object.fromEntries(Object.entries(claims(c)).map(([k, v]) => [k, hash(v)])); }
// Fine claim bindings coexist with the stable collector scheduling groups.
// Changing one producer policy must not stale another producer's CI claim.
function details(c) {
  const out = {}, r = requirements(c.rules), grouped = claims(c);
  for (const rule of r.checks) {
    const scoped = structuredClone(c);
    scoped.rules.classic = { state: "AVAILABLE", value: null };
    scoped.rules.active = { state: "AVAILABLE", value: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: rule.name, integration_id: rule.appId }] } }] };
    out[`CI_EXECUTED:${rule.name}`] = hash(claims(scoped).CI_EXECUTED);
  }
  for (const rule of r.coverage) out[require("./coverage").name(rule)] = hash(require("./coverage").binding(c, [rule]));
  for (const name of ["TARGET", "APPROVAL_CURRENT", "RULES_SNAPSHOT", "REMOTE_DURABLE"]) out[name] = hash(grouped[name]);
  return out;
}
function compare(previous, current) {
  const before = fingerprints(previous), after = fingerprints(current);
  const changed = Object.keys(before).filter(k => before[k] !== after[k]);
  const unavailable = Object.entries(claims(current)).filter(([,v]) => hasUnavailable(v)).map(([k]) => k);
  const detailBefore = details(previous), detailAfter = details(current);
  const changedClaims = [...new Set([...Object.keys(detailBefore), ...Object.keys(detailAfter)])].filter(k => detailBefore[k] !== detailAfter[k]);
  const claimDetails = Object.fromEntries(Object.keys(detailAfter).map(k => [k, { binding: detailAfter[k], state: changedClaims.includes(k) ? "STALE" :
    unavailable.includes(k.split(":")[0]) ? "UNAVAILABLE" : "CURRENT" }]));
  return { changed, unavailable, changedClaims, claimDetails, claims: Object.fromEntries(Object.keys(after).map(k => [k, {
    binding: after[k], state: changed.includes(k) ? "STALE" : unavailable.includes(k) ? "UNAVAILABLE" : "CURRENT",
  }])) };
}
module.exports = { details, claims, fingerprints, compare, identity, opinionated };
