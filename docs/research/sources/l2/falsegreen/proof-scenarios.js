"use strict";
// Runs the real proof engine on synthetic captures modeled on github/test/fixtures.js.
const R = require("path").join(__dirname, "..", "..", "..", "..", "..", "github");
const { capture, H, B, M, OLD, T } = require(R + "/test/fixtures");
const { prove, freshness } = require(R + "/proof");
const { available: A, unavailable: U } = require(R + "/common");
const policy = require(R + "/policy");
const check = require(R + "/check");
const ledger = require(R + "/ledger");

const show = (label, r, extra = {}) => {
  const ci = r.summary.ci;
  console.log(`\n=== ${label}`);
  console.log(`verdict=${r.verdict} freshness=${r.freshness.state} gaps=[${r.gaps.join(",")}]`);
  console.log(`ci.state=${ci.state} accepted=${ci.acceptedCount}/${(ci.required||[]).length} executed=${ci.executionCount} required[0].state=${ci.required?.[0]?.state} acceptanceSha=${(ci.required?.[0]?.acceptanceSha||"").slice(0,4)}`);
  console.log(`approval=${r.summary.approval.state} current=${r.summary.approval.current.map(x=>x.reviewer)} advisories=[${r.local.advisories.map(a=>a.id)}]`);
  for (const [k, v] of Object.entries(extra)) console.log(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
};

// 0. Baseline
show("0 baseline fixture", prove(capture()));

// 1. Behind-base PR (target = PR_TEST_MERGE = M) with GitHub-Actions-style checks attached to the PR HEAD.
{
  const c = capture();
  c.git.value.mergeBase = OLD; c.git.value.baseFiles = ["docs/x.md"]; c.git.value.baseAdvanceCommits = 3;
  c.target = A({ kind: "PR_TEST_MERGE", sha: M, headSha: H, baseSha: B, parents: [B, H] });
  // checks/execution stay on H (as GitHub Actions pull_request runs report)
  const r = prove(c);
  show("1 behind-base PR, Actions checks on HEAD only", r, {
    title_advisory: check.title(r, {state:"CURRENT"}, policy.evaluate(r, {state:"CURRENT"}, null)),
    title_enforcing: check.title(r, {state:"CURRENT"}, policy.evaluate(r, {state:"CURRENT"}, {preset:"REPOSITORY_REQUIREMENTS"})),
    remediation_first: require(R+"/remediation").build(r,{state:"CURRENT"},policy.evaluate(r,{state:"CURRENT"},null))?.items[0].nextAction,
  });
}

// 2. PR modifies the workflow file that produces the required check -> still VERIFIED?
{
  const c = capture();
  c.git.value.candidateFiles = [".github/workflows/test.yml", "src/feature.js"];
  show("2 PR rewrote .github/workflows/test.yml (required check producer)", prove(c));
}

// 3. Approver is also a commit author (co-author) of the PR, not the PR author.
{
  const c = capture();
  c.actors.value.commits.push({ sha: "f".repeat(40), author: { id: 2, login: "reviewer", type: "User" }, committer: { id: 2, login: "reviewer", type: "User" }, verified: false, verificationReason: "unsigned" });
  show("3 approver authored commits in the PR", prove(c));
}

// 4. Skipped step (if:) inside the required job -> execution proof lost.
{
  const c = capture();
  c.execution.value[0].steps.push({ number: 2, status: "completed", conclusion: "skipped", startedAt: T, completedAt: T });
  show("4 required job has one skipped conditional step", prove(c));
}

// 5. Same-name check from two workflows in the SAME app (GitHub Actions): earlier failure, later success.
{
  const c = capture();
  c.checks.value.unshift({ ...c.checks.value[0], id: 9, conclusion: "failure", suiteId: 49 });
  show("5 two same-app 'test' check runs: id9 failure, id10 success", prove(c));
}

// 6. Rerun attempt 2 succeeded after attempt 1 failed (attempt recorded, not surfaced)
{
  const c = capture();
  c.execution.value[0].attempt = 2;
  const r = prove(c);
  show("6 run_attempt=2 success (attempt 1 failed)", r, { attempt_in_receipt: r.summary.ci.required[0].workflowJobs[0].attempt, any_flag: r.gaps.length });
}

// 7. Base moved and renamed the file the candidate edits -> no overlap detected.
{
  const c = capture();
  c.git.value.mergeBase = OLD; c.git.value.baseAdvanceCommits = 1;
  c.git.value.baseFiles = ["src/feature-renamed.js"]; // base renamed src/feature.js
  c.target = A({ kind: "PR_TEST_MERGE", sha: M, headSha: H, baseSha: B, parents: [B, H] });
  c.checks.value[0].sha = M; c.execution.value[0].sha = M; c.execution.value[0].runSha = M;
  show("7 base renamed candidate's file; checks on M", prove(c));
}

// 8. Unrelated job in the same workflow run failed -> run conclusion failure
{
  const c = capture();
  c.execution.value[0].runConclusion = "failure";
  show("8 required job success, other job in run failed", prove(c));
}

// 9. Changes requested by a read-only account / bot
{
  const c = capture();
  c.reviews.value.push({ id: 61, userId: 77, login: "driveby", userType: "User", state: "CHANGES_REQUESTED", sha: H, submittedAt: T, writePermission: A(false) });
  show("9 CHANGES_REQUESTED by read-only account", prove(c));
}

// 10. Org ruleset with a commit_message_pattern rule (irrelevant to CI evidence)
{
  const c = capture();
  c.rules.active.value.push({ type: "commit_message_pattern", parameters: { operator: "starts_with", pattern: "feat" } });
  show("10 branch_name/commit_message_pattern rule present", prove(c));
}

// 11. Ghost reviewer permission 404 -> nested unavailable
{
  const c = capture();
  c.reviews.value.push({ id: 62, userId: 88, login: "ghost", userType: "User", state: "COMMENTED", sha: H, submittedAt: T, writePermission: U("GITHUB_HTTP_404") });
  const r = prove(c);
  show("11 commented reviewer whose permission read 404s", r, { freshness_live: freshness(r, c).state });
}

// 12. Closed PR: trial-eligibility inputs
{
  const c = capture();
  c.identity.prState = "closed"; c.identity.merged = true;
  c.target = U("CURRENT_COMBINED_STATE_UNAVAILABLE"); c.execution = U("TARGET_UNAVAILABLE");
  const r = prove(c);
  show("12 merged PR", r);
}

// 13. Policy: REPOSITORY_REQUIREMENTS with only PROTECTED_BOUNDARY gap -> check conclusion
{
  const c = capture();
  c.git.value.candidateFiles = ["db/migrations/001.sql"];
  const r = prove(c);
  const e = policy.evaluate(r, { state: "CURRENT" }, { preset: "REPOSITORY_REQUIREMENTS" });
  const adv = policy.evaluate(r, { state: "CURRENT" }, null);
  show("13 protected boundary only", r, { enforcing_conclusion: e.conclusion, enforcing_title: check.title(r,{state:"CURRENT"},e), advisory_conclusion: adv.conclusion });
  const np = prove((() => { const d = capture(); d.reviews.value = []; return d; })());
  console.log("advisory NOT_PROVEN conclusion =", policy.evaluate(np, {state:"CURRENT"}, null).conclusion, "(GitHub treats neutral as pass for a required check)");
}

// 14. Ledger binding for squash and merge-commit merges
{
  const r = prove(capture());
  const row = { receipt: r, current: { state: "CURRENT" }, publishedAt: T };
  const squash = ledger.proofSnapshot(row, H, null, "9".repeat(40));
  const mergeCommit = ledger.proofSnapshot(row, H, null, "8".repeat(40));
  const ffHead = ledger.proofSnapshot(row, H, null, H);
  console.log("\n=== 14 ledger binding: squash=", squash.state, " merge-commit=", mergeCommit.state, " landed==head=", ffHead.state);
}

// 15. pull_request_target-style run: check on H, job on H, but workflow checked out base. Event not collected.
{
  const c = capture();
  const r = prove(c);
  const keys = Object.keys(r.summary.ci.required[0].workflowJobs[0]);
  console.log("\n=== 15 execution row fields (no event/path/blob):", keys.join(","));
}

// 16. strict flag has no effect on verdict
{
  const c = capture(); c.rules.classic.value.required_status_checks.strict = false;
  c.git.value.mergeBase = OLD; c.git.value.baseFiles = []; c.git.value.baseAdvanceCommits = 1;
  c.target = A({ kind: "PR_TEST_MERGE", sha: M, headSha: H, baseSha: B, parents: [B, H] });
  show("16 strict=false, behind-base, checks on head (GitHub would merge)", prove(c));
}
