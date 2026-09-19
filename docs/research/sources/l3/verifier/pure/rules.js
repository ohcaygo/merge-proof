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
    } else if (r.type === "pull_request") reviews(p);
    else if (r.type === "merge_queue") {
      out.mergeQueue = true;
      if (p?.grouping_strategy === "ALLGREEN")
        out.unsupported.push("ALLGREEN_OTHER_GROUP_ENTRIES_UNAVAILABLE");
    } else if (
      !["deletion", "non_fast_forward", "creation"].includes(r.type)
    )
      out.unsupported.push(r.type || "UNKNOWN_RULE");
  }
  out.checks.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.appId || 0) - (b.appId || 0),
  );
  out.unsupported = [...new Set(out.unsupported)].sort();
  return out;
}
module.exports = { requirements };
