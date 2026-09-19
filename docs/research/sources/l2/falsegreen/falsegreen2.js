"use strict";
// Additional adversarial scenarios against the real proof engine and collector.
const R = require("path").join(__dirname, "..", "..", "..", "..", "..", "github");
const { capture, fixtureFetch, H, B, M, OLD, T } = require(R + "/test/fixtures");
const { prove, freshness } = require(R + "/proof");
const { collect } = require(R + "/collect");
const { Client } = require(R + "/client");
const { available: A, unavailable: U } = require(R + "/common");
const policy = require(R + "/policy");
const check = require(R + "/check");
const show = (label, r, extra = {}) => {
  const ci = r.summary.ci;
  console.log(`\n=== ${label}`);
  console.log(`verdict=${r.verdict} freshness=${r.freshness.state} gaps=[${r.gaps.join(",")}]`);
  console.log(`ci.state=${ci.state} accepted=${ci.acceptedCount}/${(ci.required||[]).length} executed=${ci.executionCount} req.states=[${(ci.required||[]).map(x=>x.state)}] checkId=${ci.required?.[0]?.checkId}`);
  console.log(`approval=${r.summary.approval.state} reason=${r.summary.approval.reason||""} current=[${r.summary.approval.current.map(x=>x.reviewer)}] unsupported=[${r.summary.rules.unsupported}]`);
  for (const [k, v] of Object.entries(extra)) console.log(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
};
const job = (o) => ({ runId: 20, workflowId: 30, attempt: 1, runSha: H, actor: { id: 1, login: "author", type: "User" }, triggeringActor: { id: 1, login: "author", type: "User" }, jobId: 40, checkId: 10, sha: H, status: "completed", conclusion: "success", runStatus: "completed", runConclusion: "success", steps: [{ number: 1, status: "completed", conclusion: "success", startedAt: T, completedAt: T }], ...o });
const chk = (o) => ({ id: 10, name: "test", appId: 15368, appSlug: "github-actions", sha: H, status: "completed", conclusion: "success", startedAt: T, completedAt: T, suiteId: 50, ...o });

// F1. PR adds a second workflow whose job is also named "test" (same app: GitHub Actions).
// Real workflow's "test" (id 10) FAILED; PR-authored workflow's "test" (id 11, different workflow_id) succeeded.
{
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [{ context: "test", app_id: 15368 }];
  c.git.value.candidateFiles = [".github/workflows/fake.yml", "src/feature.js"];
  c.checks.value = [chk({ id: 10, conclusion: "failure" }), chk({ id: 11, suiteId: 51 })];
  c.execution.value = [job({ runId: 20, workflowId: 30, jobId: 40, checkId: 10, conclusion: "failure", runConclusion: "failure", steps: [{ number: 1, status: "completed", conclusion: "failure", startedAt: T, completedAt: T }] }),
                       job({ runId: 21, workflowId: 31, jobId: 41, checkId: 11 })];
  const r = prove(c);
  show("F1 real 'test' (wf 30) FAILED, PR-added workflow 31 job 'test' succeeded (higher check id)", r,
    { workflowIds_seen: [...new Set(c.execution.value.map(j => j.workflowId))], chosen_workflowId: r.summary.ci.required[0].workflowJobs[0]?.workflowId, local_findings: r.local.findings.map(f=>f.id), advisories: r.local.advisories.map(a=>a.id) });
}

// F2. workflow_dispatch / schedule re-run on the same SHA with the same job name (event not recorded).
{
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [{ context: "test", app_id: 15368 }];
  c.checks.value = [chk({ id: 10, conclusion: "failure" }), chk({ id: 12, suiteId: 52 })];
  c.execution.value = [job({ checkId: 10, conclusion: "failure", runConclusion: "failure", steps: [{ number: 1, status: "completed", conclusion: "failure", startedAt: T, completedAt: T }] }),
                       job({ runId: 22, workflowId: 30, jobId: 42, checkId: 12, actor: { id: 1, login: "author", type: "User" }, triggeringActor: { id: 1, login: "author", type: "User" } })];
  const r = prove(c);
  show("F2 pull_request run failed; later run of same workflow on same SHA (event unknown: dispatch?) succeeded", r,
    { row_keys: Object.keys(r.summary.ci.required[0].workflowJobs[0]), has_event: "event" in r.summary.ci.required[0].workflowJobs[0] });
}

// F3. Rule bound to app A (10); app B (11) posts a FAILING check with the same name -> ignored.
{
  const c = capture();
  c.checks.value.push({ ...c.checks.value[0], id: 11, appId: 11, appSlug: "other-ci", conclusion: "failure" });
  show("F3 rule appId=10; app 11 posts failing 'test' on same sha", prove(c));
}
// F3b. Rule appId=null; app 10 success and app 11 failure on target -> ambiguous.
{
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [{ context: "test", app_id: null }];
  c.checks.value.push({ ...c.checks.value[0], id: 11, appId: 11, appSlug: "other-ci", conclusion: "failure" });
  show("F3b rule appId=null; app10 success + app11 failure on target", prove(c));
}
// F3c. Rule appId=null; only app 11 (non-Actions app, e.g. CircleCI) posts success; no execution rows.
{
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [{ context: "test", app_id: null }];
  c.checks.value = [chk({ id: 11, appId: 11, appSlug: "circleci" })];
  c.execution.value = [];
  show("F3c non-Actions app check success, no Actions job rows", prove(c));
}
// F3d. Commit status only (Jenkins/Buildkite legacy status API).
{
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [{ context: "test", app_id: null }];
  c.checks.value = []; c.execution.value = [];
  c.statuses.value = [{ id: 5, name: "test", sha: H, state: "success", updatedAt: T }];
  show("F3d commit status success only", prove(c));
}

// F4. BASE_DRIFT with execution recorded on the test-merge commit (combined state WAS validated).
{
  const c = capture();
  c.git.value.mergeBase = OLD; c.git.value.baseFiles = ["src/feature.js"]; c.git.value.baseAdvanceCommits = 2;
  c.target = A({ kind: "PR_TEST_MERGE", sha: M, headSha: H, baseSha: B, parents: [B, H] });
  c.checks.value[0].sha = M; c.execution.value[0].sha = M; c.execution.value[0].runSha = M;
  show("F4 base drift overlap, but required check EXECUTED on test-merge M", prove(c));
}

(async () => {
// F5. mergeable flips null -> true between observation 1 and 2 (real collector).
{
  let n = 0;
  const f = fixtureFetch({ mutate: (p, v) => { if (p.endsWith("/pulls/1")) { n++; return n === 1 ? { ...v, mergeable: null, mergeable_state: "unknown" } : v; } return v; } });
  const c = await collect(new Client(f), "fixture/public", 1);
  const r = prove(c);
  show("F5 GitHub still computing mergeable on first observation", r, { consistency: c.consistency, first_vs_second: "mergeable null->true" });
}

// F6. Approving reviewer's permission read 404s (e.g. reviewer left org / deleted) but another eligible approval exists.
{
  const c = capture();
  c.reviews.value.push({ id: 61, userId: 3, login: "gone", userType: "User", state: "APPROVED", sha: H, submittedAt: T, writePermission: U("GITHUB_HTTP_404") });
  const r = prove(c);
  const gate = policy.evaluate(r, freshness(r, c), { preset: "REPOSITORY_REQUIREMENTS" });
  show("F6 extra APPROVED review from account whose permission read 404s", r, { live_freshness: freshness(r, c).state, enforcing_conclusion: gate.conclusion, blocking: gate.blocking });
}

// F7. App (Bot) approval that GitHub would count.
{
  const c = capture();
  c.reviews.value = [{ id: 60, userId: 99, login: "approver-bot[bot]", userType: "Bot", state: "APPROVED", sha: H, submittedAt: T, writePermission: A(true) }];
  show("F7 only approval is from a Bot account with write", prove(c));
}

// F8. Rule types unrelated to CI/review evidence block VERIFIED.
for (const type of ["update", "workflows", "code_scanning", "branch_name_pattern", "required_deployments", "copilot_code_review", "max_file_size"]) {
  const c = capture();
  c.rules.active.value.push({ type, ruleset_id: 1, ruleset_source_type: "Organization", ruleset_source: "org", parameters: {} });
  const r = prove(c);
  console.log(`F8 active rule type=${type} -> verdict=${r.verdict} unsupported=[${r.summary.rules.unsupported}]`);
}
// F8b. merge_queue HEADGREEN vs ALLGREEN, and CODEOWNERS.
{
  const c = capture(); c.rules.active.value.push({ type: "merge_queue", parameters: { grouping_strategy: "ALLGREEN", merge_method: "SQUASH" } });
  console.log("F8b merge_queue ALLGREEN ->", prove(c).verdict, prove(c).summary.rules.unsupported.join(","));
  const d = capture(); d.rules.active.value.push({ type: "merge_queue", parameters: { grouping_strategy: "HEADGREEN", merge_method: "SQUASH" } });
  const rd = prove(d); console.log("F8b merge_queue HEADGREEN (no group yet) ->", rd.verdict, "queueStage=", rd.summary.queueStage, "notChecked has MERGE_QUEUE_GROUP_NOT_YET_PROVEN:", rd.notChecked.includes("MERGE_QUEUE_GROUP_NOT_YET_PROVEN"), "| enforcing title:", check.title(rd, {state:"CURRENT"}, policy.evaluate(rd,{state:"CURRENT"},{preset:"REPOSITORY_REQUIREMENTS"})));
  const e = capture(); e.rules.classic.value.required_pull_request_reviews.require_code_owner_reviews = true;
  console.log("F8b CODEOWNERS required ->", prove(e).verdict, prove(e).gaps.join(","));
}

// F9. Skipped required check (paths filter) vs neutral.
{
  const c = capture(); c.checks.value[0].conclusion = "skipped"; c.execution.value[0].conclusion = "skipped";
  show("F9 required check concluded skipped (GitHub counts as pass)", prove(c));
}

// F10. >20 workflow runs on the SHA (monorepo) through real collector.
{
  const f = fixtureFetch({ mutate: (p, v) => p.endsWith("/actions/runs") ? { total_count: 21, workflow_runs: Array.from({ length: 21 }, (_, i) => ({ ...v.workflow_runs[0], id: 20 + i, workflow_id: 30 + i })) } : v });
  const c = await collect(new Client(f), "fixture/public", 1); const r = prove(c); console.log("\n=== F10 21 workflow runs on head -> execution:", c.execution.state, c.execution.reason, "| verdict", r.verdict, "| freshness", r.freshness.state);
}

// F11. Merge group: approvals bound to head; group target; check on group only.
{
  const c = capture();
  const G = "e".repeat(40);
  c.rules.active.value.push({ type: "merge_queue", parameters: { grouping_strategy: "HEADGREEN" } });
  c.target = A({ kind: "MERGE_GROUP", sha: G, headSha: H, baseSha: B, ref: "refs/heads/gh-readonly-queue/main/pr-1-x", selection: A({ id: "q", state: "AWAITING_CHECKS", headSha: G, baseSha: B, candidateSha: H }) });
  c.checks.value = [chk({ id: 10, appId: 10, sha: G })];
  c.execution.value = [job({ sha: G, runSha: G })];
  const r = prove(c);
  show("F11 merge group target, check+job on group sha, approval on head", r, { subjects: check.subjects(r).map(s=>s.kind) });
}

// F12. Reviewer approved head, then later COMMENTED (should keep) vs later DISMISSED.
{
  const c = capture();
  c.reviews.value.push({ id: 61, userId: 2, login: "reviewer", userType: "User", state: "COMMENTED", sha: H, submittedAt: "2026-09-10T13:00:00Z", writePermission: A(true) });
  console.log("\nF12 approve then comment ->", prove(c).verdict);
  const d = capture();
  d.reviews.value[0].state = "DISMISSED";
  console.log("F12 dismissed approval ->", prove(d).verdict, prove(d).gaps.join(","));
}
})().catch(e => { console.error("SCRIPT ERROR", e); process.exit(1); });
