"use strict";
// Conservative intersection of active rulesets and classic branch protection.
// Unsupported requirements remain explicit and cannot silently verify.
function requirements(rules) {
  const out = {
    state: "AVAILABLE",
    checks: [],
    approvals: 0,
    strict: false,
    dismissStale: false,
    lastPush: false,
    codeOwners: false,
    mergeQueue: false,
    unsupported: [],
    pushTime: [],
    coverage: [],
  };
  if (rules.classic.state !== "AVAILABLE" || rules.active.state !== "AVAILABLE")
    return { ...out, state: "UNAVAILABLE" };
  if (!Array.isArray(rules.active.value))
    return { ...out, state: "UNAVAILABLE" };
  const add = (name, appId) => {
    if (
      typeof name !== "string" ||
      !name ||
      (appId != null && appId !== -1 && !Number.isSafeInteger(appId))
    ) {
      out.unsupported.push("MALFORMED_REQUIRED_CHECK");
      return;
    }
    const c = { name, appId: appId == null || appId === -1 ? null : appId };
    if (!out.checks.some((x) => x.name === c.name && x.appId === c.appId))
      out.checks.push(c);
  };
  const reviews = (p) => {
    if (
      !p ||
      !Number.isInteger(p.required_approving_review_count) ||
      p.required_approving_review_count < 0
    ) {
      out.unsupported.push("MALFORMED_APPROVAL_RULE");
      return;
    }
    out.approvals = Math.max(out.approvals, p.required_approving_review_count);
    out.dismissStale ||=
      p.dismiss_stale_reviews === true ||
      p.dismiss_stale_reviews_on_push === true;
    out.lastPush ||= p.require_last_push_approval === true;
    out.codeOwners ||=
      p.require_code_owner_reviews === true ||
      p.require_code_owner_review === true;
    if (p.required_review_thread_resolution || p.required_reviewers?.length)
      out.unsupported.push("REVIEW_THREADS_OR_REQUIRED_TEAMS");
  };
  const c = rules.classic.value;
  for (const rule of ["required_signatures", "required_linear_history"])
    if (c?.[rule]?.enabled) out.unsupported.push(rule);
  if (c?.required_status_checks) {
    const s = c.required_status_checks;
    out.strict ||= s.strict === true;
    for (const r of s.checks || []) add(r.context, r.app_id);
    for (const name of s.contexts || [])
      if (!(s.checks || []).some((r) => r.context === name)) add(name, null);
  }
  if (c?.required_pull_request_reviews)
    reviews(c.required_pull_request_reviews);
  if (c?.required_conversation_resolution?.enabled)
    out.unsupported.push("REVIEW_THREAD_RESOLUTION");
  for (const r of rules.active.value) {
    if (!r || typeof r.type !== "string") {
      out.unsupported.push("MALFORMED_RULE");
      continue;
    }
    const p = r.parameters;
    if (r.type === "required_status_checks") {
      if (!Array.isArray(p?.required_status_checks)) {
        out.unsupported.push("MALFORMED_REQUIRED_CHECKS");
        continue;
      }
      for (const s of p.required_status_checks)
        add(s?.context, s?.integration_id);
      out.strict ||= p.strict_required_status_checks_policy === true;
    } else if (r.type === "code_coverage") {
      const valid = p && Object.keys(p).length > 0 && Object.keys(p).every(k => ["minimum_coverage", "max_coverage_drop"].includes(k) && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 100);
      out.coverage.push({ rulesetId: r.ruleset_id ?? null, source: r.ruleset_source ?? null, sourceType: r.ruleset_source_type ?? null, parameters: p || null, state: valid ? "RECOGNIZED" : "MALFORMED" });
    } else if (r.type === "pull_request") reviews(p);
    else if (r.type === "merge_queue") {
      out.mergeQueue = true;
      if (p?.grouping_strategy === "ALLGREEN")
        out.unsupported.push("ALLGREEN_OTHER_GROUP_ENTRIES_UNAVAILABLE");
    } else if (["deletion", "non_fast_forward", "creation", "update", "branch_name_pattern", "tag_name_pattern", "commit_message_pattern", "commit_author_email_pattern", "committer_email_pattern", "file_path_restriction", "max_file_path_length", "file_extension_restriction", "max_file_size", "copilot_code_review"].includes(r.type))
      out.pushTime.push(r);
    else
      out.unsupported.push(r.type || "UNKNOWN_RULE");
  }
  out.checks.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.appId || 0) - (b.appId || 0),
  );
  out.unsupported = [...new Set(out.unsupported)].sort();
  return out;
}
// These are observations of Actions policy, never permission changes. The
// repository endpoint includes inherited policies (has_parents=true).
async function executionProtections(client, repository) {
  return client.observe(async () => {
    const { assert } = require("./common");
    const rows = await client.list(`/repos/${repository}/actions/policies?has_parents=true`, "policies");
    const out = [];
    for (const row of rows) {
      assert(Number.isSafeInteger(row.id), "EXECUTION_POLICY_MALFORMED");
      const href = row._links?.self?.href || `https://api.github.com/repos/${repository}/actions/policies/${row.id}`;
      const u = new URL(href);
      assert(u.origin === "https://api.github.com" && !u.search && !u.hash &&
        /^\/(?:repos\/[\w.-]+\/[\w.-]+|orgs\/[\w.-]+|enterprises\/[\w.-]+)\/actions\/policies\/\d+$/.test(u.pathname), "EXECUTION_POLICY_SOURCE_INVALID");
      const p = await client.get(u.pathname);
      assert(p.id === row.id && p.target === "actions" && Array.isArray(p.rules) && ["active", "evaluate", "disabled"].includes(p.enforcement), "EXECUTION_POLICY_MALFORMED");
      out.push({ id: p.id, source: p.source, sourceType: p.source_type, enforcement: p.enforcement,
        conditions: p.conditions || {}, rules: p.rules, updatedAt: p.updated_at || null });
    }
    return out.sort((a,b) => String(a.source).localeCompare(String(b.source)) || a.id-b.id);
  });
}
// Match the documented common glob grammar. Unsupported patterns remain
// possibly applicable; they never cause a policy to disappear from a binding.
function matches(pattern, value) {
  if (pattern === "~ALL") return true;
  if (typeof pattern !== "string" || /[\[\]{}\\]/.test(pattern)) return null;
  const re = pattern.split(/(\*\*|\*|\?)/).map(x => x === "**" ? ".*" : x === "*" ? "[^/]*" : x === "?" ? "[^/]" : x.replace(/[.+^$()|]/g, "\\$&")).join("");
  return new RegExp(`^${re}$`).test(value || "");
}
function applies(p, workflowPath) {
  if (typeof workflowPath !== "string" || !workflowPath) return null;
  const c = p.conditions?.workflow_path;
  if (!c) return Object.keys(p.conditions || {}).length ? null : true;
  if (!Array.isArray(c.include) || !Array.isArray(c.exclude)) return null;
  const included = c.include.length ? c.include.map(x => matches(x,workflowPath)) : [true];
  const excluded = c.exclude.map(x => matches(x,workflowPath));
  if (excluded.includes(true) || included.every(x => x === false)) return false;
  return included.includes(null) || excluded.includes(null) || Object.keys(p.conditions || {}).some(k => k !== "workflow_path") ? null : true;
}
function executionPolicyBinding(c, jobs) {
  const p = c.rules.executionProtections;
  if (p?.state !== "AVAILABLE" || !Array.isArray(p.value) || p.value.some(x => !x || typeof x !== "object")) return { availability: "UNKNOWN", reason: p?.reason || "NOT_OBSERVED" };
  return { availability: "OBSERVED", policies: p.value.filter(p => !["disabled", "evaluate"].includes(p.enforcement) && jobs.some(j => applies(p,j.workflowPath) !== false)) };
}
function executionPolicy(c, job) {
  const policies = c.rules.executionProtections;
  if (policies?.state !== "AVAILABLE" || !Array.isArray(policies.value)) return { state: "UNKNOWN", reason: "EXECUTION_PROTECTIONS_UNAVAILABLE", required: true };
  if (policies.value.some(p => !p || !["active", "evaluate", "disabled"].includes(p.enforcement))) return { state: "UNKNOWN", reason: "EXECUTION_POLICY_MALFORMED", required: true };
  for (const p of policies.value) {
    const scoped = applies(p, job.workflowPath);
    if (p.enforcement !== "active" || scoped === false) continue;
    if (scoped === null) return { state: "UNKNOWN", reason: "EXECUTION_POLICY_SCOPE_UNRESOLVED", required: true };
    const updated = Date.parse(p.updatedAt), started = Date.parse(job.runStartedAt);
    if (!Number.isFinite(updated) || !Number.isFinite(started))
      return { state: "UNKNOWN", reason: "EXECUTION_POLICY_HISTORY_UNAVAILABLE", required: true };
    if (updated >= started)
      return { state: "UNKNOWN", reason: "EXECUTION_POLICY_CHANGED_AFTER_EVIDENCE", required: true };
    if (!Array.isArray(p.rules)) return { state: "UNKNOWN", reason: "EXECUTION_POLICY_MALFORMED", required: true };
    for (const rule of p.rules) {
      if (rule.type === "restrict_action_events") {
        if (!Array.isArray(rule.parameters?.allowed_events)) return { state: "UNKNOWN", reason: "EXECUTION_POLICY_MALFORMED", required: true };
        if (!rule.parameters.allowed_events.includes(job.event)) return { state: "FALSE", reason: "EXECUTION_EVENT_DENIED", required: true };
      } else if (rule.type === "restrict_actions_actors") {
        const actors = rule.parameters?.allowed_actors;
        if (!Array.isArray(actors)) return { state: "UNKNOWN", reason: "EXECUTION_POLICY_MALFORMED", required: true };
        // Team/role/App membership is not inferred from a login or an executed
        // job. Without an exact actor match it needs separate provider evidence.
        for (const actor of [job.actor, job.triggeringActor]) {
          if (!actor || !Number.isSafeInteger(actor.id) || !["User", "Bot"].includes(actor.type))
            return { state: "UNKNOWN", reason: "EXECUTION_ACTOR_POLICY_UNPROVEN", required: true };
          if (actors.some(a => ["User", "Bot"].includes(a.type) && a.type === actor.type && a.id === actor.id)) continue;
          if (actors.every(a => ["User", "Bot"].includes(a.type) && Number.isSafeInteger(a.id)))
            return actor === job.actor ? { state: "FALSE", reason: "EXECUTION_ACTOR_DENIED", required: true } : { state: "UNKNOWN", reason: "EXECUTION_RERUN_ACTOR_POLICY_UNPROVEN", required: true };
          return { state: "UNKNOWN", reason: "EXECUTION_ACTOR_POLICY_UNPROVEN", required: true };
        }
      } else return { state: "UNKNOWN", reason: "EXECUTION_POLICY_RULE_UNSUPPORTED", required: true };
    }
  }
  return { state: "TRUE", reason: "OBSERVED_EXECUTION_POLICY_SATISFIED", required: true };
}
function relevantJobs(c, checks = requirements(c.rules).checks) {
  return (c.execution?.value || []).filter(j => (c.checks?.value || []).some(x =>
    x.id === j.checkId && [c.target.value?.sha, c.identity.headSha].includes(x.sha) &&
    checks.some(r => r.name === x.name && (r.appId === null || r.appId === x.appId))));
}
function project(c) {
  const p = c.rules.executionProtections;
  if (p?.state === "AVAILABLE" && Array.isArray(p.value) && p.value.every(x => x && typeof x === "object"))
    c.rules.executionProtections = { state: "AVAILABLE", value: executionPolicyBinding(c, relevantJobs(c)).policies };
  return c;
}
module.exports = { relevantJobs, project, requirements, executionProtections, executionPolicyBinding, executionPolicy, applies };
