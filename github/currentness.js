"use strict";
const ALL = ["TARGET", "CI_EXECUTED", "APPROVAL_CURRENT", "RULES_SNAPSHOT", "REMOTE_DURABLE"];
const RULE_EVENTS = ["repository_ruleset", "branch_protection_rule", "branch_protection_configuration"];
const PERMISSION_EVENTS = ["member", "team", "membership", "organization"];
function touches(event, p, c) {
  if (!c) return ALL;
  const i = c.identity, target = c.target?.value;
  const samePR = p.pull_request?.number === i.pr || p.number === i.pr;
  if (event === "repository_ruleset" && (p.ruleset?.target === "actions" || p.repository_ruleset?.target === "actions")) return ["RULES_SNAPSHOT", "CI_EXECUTED"];
  if (RULE_EVENTS.includes(event)) return ["RULES_SNAPSHOT", "CI_EXECUTED", "APPROVAL_CURRENT"];
  if (PERMISSION_EVENTS.includes(event)) return ["APPROVAL_CURRENT"];
  if (event === "repository") return ["TARGET", "REMOTE_DURABLE"];
  if (event === "pull_request") {
    if (!samePR || ["labeled", "unlabeled", "assigned", "unassigned", "milestoned", "demilestoned"].includes(p.action)) return [];
    if (p.action === "edited" && p.changes && !p.changes.base) return [];
    return ALL;
  }
  if (event === "pull_request_review") return samePR && p.review?.state?.toUpperCase() !== "COMMENTED" ? ["APPROVAL_CURRENT"] : [];
  if (event === "push" || event === "delete") {
    const ref = event === "delete" ? `refs/heads/${p.ref}` : p.ref;
    if (ref === `refs/heads/${i.headRef}`) return ALL;
    if (ref === `refs/heads/${i.baseRef}`) return ["TARGET", "CI_EXECUTED"];
    if (ref === `refs/heads/${i.defaultBranch}` && require("./rules").requirements(c.rules).coverage.some(r => r.parameters?.max_coverage_drop > 0)) return ["CODE_COVERAGE"];
    return [];
  }
  if (event === "merge_group") return target?.sha === p.merge_group?.head_sha ? ["TARGET", "CI_EXECUTED"] : [];
  const row = p.check_run || p.check_suite || p.workflow_run || p;
  if (![target?.sha, i.headSha].filter(Boolean).includes(row.head_sha || row.sha)) return [];
  if (event === "check_run" || event === "status") {
    const rules = require("./rules").requirements(c.rules);
    if (!rules.checks.some(r => r.name === (row.name || row.context) &&
      (r.appId === null || event === "status" || r.appId === row.app?.id))) return [];
  }
  return ["check_run", "check_suite", "workflow_run", "status"].includes(event) ? ["CI_EXECUTED"] : [];
}
function areas(claims) {
  if (claims.includes("TARGET")) return null;
  const out = new Set();
  if (claims.includes("CI_EXECUTED")) for (const k of ["checks", "statuses", "execution", "rules", "coverage"]) out.add(k);
  if (claims.includes("APPROVAL_CURRENT")) out.add("reviews");
  if (claims.includes("RULES_SNAPSHOT")) { out.add("rules"); out.add("coverage"); }
  if (claims.includes("CODE_COVERAGE")) { out.add("coverage"); out.add("rules"); }
  if (claims.includes("REMOTE_DURABLE")) out.add("remote");
  return [...out];
}
module.exports = { ALL, RULE_EVENTS, PERMISSION_EVENTS, touches, areas };
