"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const { capture, H, B, M, OLD, T } = require("./fixtures");
const { prove, freshness } = require("../proof");
const { available: A, unavailable: U } = require("../common");
const { requirements } = require("../rules");
const { html, text } = require("../receipt");
test("current head includes base, required executed CI, eligible approval and remote ref verify", () => {
  const r = prove(capture());
  a.equal(r.verdict, "VERIFIED");
  a.equal(r.summary.ci.executionCount, 1);
  a.equal(r.schemaVersion, 2);
});
for (const [name, mutate, gap] of [
  [
    "obsolete green SHA",
    (c) => (c.checks.value[0].sha = OLD),
    "CURRENT_STATE_EXECUTION_NOT_PROVEN",
  ],
  [
    "missing check",
    (c) => (c.checks.value = []),
    "CURRENT_STATE_EXECUTION_NOT_PROVEN",
  ],
  [
    "check read denied",
    (c) => (c.checks = U("403")),
    "CHECK_EVIDENCE_UNAVAILABLE",
  ],
  [
    "status read denied",
    (c) => (c.statuses = U("403")),
    "CHECK_EVIDENCE_UNAVAILABLE",
  ],
  ["rules denied", (c) => (c.rules.classic = U("403")), "RULES_UNAVAILABLE"],
  ["rulesets denied", (c) => (c.rules.active = U("403")), "RULES_UNAVAILABLE"],
  [
    "no required checks",
    (c) => (c.rules.classic.value.required_status_checks = null),
    "NO_REQUIRED_VALIDATION_CONFIGURED",
  ],
  [
    "required workflow unsupported",
    (c) => c.rules.active.value.push({ type: "workflows" }),
    "UNSUPPORTED_REPOSITORY_REQUIREMENTS",
  ],
  [
    "stale approval after push",
    (c) => (c.reviews.value[0].sha = OLD),
    "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  ],
  [
    "dismissed review",
    (c) => (c.reviews.value[0].state = "DISMISSED"),
    "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  ],
  [
    "review permission unknown",
    (c) => (c.reviews.value[0].writePermission = U("403")),
    "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  ],
  [
    "PR author approval",
    (c) => (c.reviews.value[0].userId = 1),
    "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  ],
  [
    "bot approval",
    (c) => (c.reviews.value[0].userType = "Bot"),
    "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  ],
  [
    "last push approval rule",
    (c) =>
      (c.rules.classic.value.required_pull_request_reviews.require_last_push_approval = true),
    "LAST_PUSH_ACTOR_APPROVAL_UNAVAILABLE",
  ],
  [
    "code owner rule",
    (c) =>
      (c.rules.classic.value.required_pull_request_reviews.require_code_owner_reviews = true),
    "CODE_OWNER_APPROVAL_UNAVAILABLE",
  ],
  [
    "remote missing",
    (c) => (c.remote.value.confirmed = false),
    "REMOTE_CANDIDATE_NOT_CONFIRMED",
  ],
  [
    "remote unavailable",
    (c) => (c.remote = U("404")),
    "REMOTE_CANDIDATE_NOT_CONFIRMED",
  ],
  [
    "remote wrong SHA",
    (c) => (c.remote.value.observedSha = OLD),
    "REMOTE_CANDIDATE_NOT_CONFIRMED",
  ],
  [
    "target other base",
    (c) => (c.target.value.baseSha = OLD),
    "TARGET_BINDING_MISMATCH",
  ],
  [
    "capture race",
    (c) => (c.consistency = "CHANGED_DURING_COLLECTION"),
    "EVIDENCE_CHANGED_DURING_COLLECTION",
  ],
  [
    "merge queue without group",
    (c) => {
      c.rules.active.value.push({ type: "merge_queue" });
      c.target = U("MERGE_GROUP_UNAVAILABLE");
    },
    "APPLICABLE_MERGE_STATE_UNAVAILABLE",
  ],
])
  test(name + " never verifies through omission", () => {
    const c = capture();
    mutate(c);
    const r = prove(c);
    a.equal(r.verdict, "NOT_PROVEN");
    a.ok(r.gaps.includes(gap), JSON.stringify(r.gaps));
  });
for (const conclusion of [
  "skipped",
  "neutral",
  "failure",
  "cancelled",
  "timed_out",
])
  test(conclusion + " distinct from execution proof", () => {
    const c = capture();
    c.checks.value[0].conclusion = conclusion;
    const r = prove(c);
    a.equal(r.verdict, conclusion === "failure" ? "FAIL" : "NOT_PROVEN");
    a.equal(
      r.summary.ci.acceptedCount,
      ["skipped", "neutral"].includes(conclusion) ? 1 : 0,
    );
    a.equal(r.summary.ci.executionCount, 0);
  });
test("pending rerun supersedes old successful check", () => {
  const c = capture();
  c.checks.value.push({
    ...c.checks.value[0],
    id: 11,
    status: "in_progress",
    conclusion: null,
  });
  a.equal(prove(c).summary.ci.required[0].state, "PENDING");
});
test("check success alone, status success alone, wrong job SHA and empty steps cannot establish execution", () => {
  for (const change of [
    (c) => (c.execution = U("403")),
    (c) => (c.execution.value[0].sha = OLD),
    (c) => (c.execution.value[0].steps = []),
    (c) => {
      c.checks.value = [];
      c.statuses.value = [{ id: 1, name: "test", sha: H, state: "success" }];
    },
  ]) {
    const c = capture();
    change(c);
    a.equal(prove(c).verdict, "NOT_PROVEN");
  }
});
test("same context across multiple Apps is ambiguous", () => {
  const c = capture();
  c.rules.classic.value.required_status_checks.checks[0].app_id = null;
  c.checks.value.push({ ...c.checks.value[0], id: 11, appId: 99 });
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("base movement with overlap preserves BASE_DRIFT_UNVERIFIED even with remote execution", () => {
  const c = capture();
  c.git.value.mergeBase = OLD;
  c.git.value.baseFiles = ["src/feature.js"];
  c.git.value.baseAdvanceCommits = 17;
  const r = prove(c);
  a.ok(r.gaps.includes("BASE_DRIFT_UNVERIFIED"));
});
test("base movement without overlap keeps STALE_BASE advisory and can prove combined state", () => {
  const c = capture();
  c.git.value.mergeBase = OLD;
  c.git.value.baseFiles = ["docs/a.md"];
  c.git.value.baseAdvanceCommits = 101;
  c.target = A({ kind: "PR_TEST_MERGE", tree: "e".repeat(40), sha: M, headSha: H, baseSha: B, parents: [B,H] });
  c.checks.value[0].sha = M;
  c.execution.value[0].sha = M;
  c.execution.value[0].runSha = M;
  c.execution.value[0].workflowBlob.value.commit = M;
  if (c.target.value.kind === "MERGE_GROUP") c.execution.value[0].event = "merge_group";
  const r = prove(c);
  a.equal(r.verdict, "VERIFIED");
  a.ok(r.local.advisories.some((x) => x.id === "STALE_BASE"));
});
test("protected boundary keeps local meaning; unavailable history fails closed", () => {
  const c = capture();
  c.git.value.candidateFiles = ["auth/session.js"];
  a.ok(prove(c).gaps.includes("PROTECTED_BOUNDARY"));
  c.git = U("TRUNCATED");
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("merge group execution binds group SHA; head success cannot substitute", () => {
  const c = capture();
  c.rules.active.value.push({ type: "merge_queue" });
  c.target = A({
    kind: "MERGE_GROUP",
    tree: "e".repeat(40),
    sha: M,
    headSha: H,
    baseSha: B,
    selection: A({ headSha: M, baseSha: B, candidateSha: H }),
  });
  a.equal(prove(c).verdict, "NOT_PROVEN");
  c.checks.value[0].sha = M;
  c.execution.value[0].sha = M;
  c.execution.value[0].runSha = M;
  c.execution.value[0].workflowBlob.value.commit = M;
  if (c.target.value.kind === "MERGE_GROUP") c.execution.value[0].event = "merge_group";
  a.equal(prove(c).verdict, "VERIFIED");
});
test("review comments do not erase approval, latest decision and count apply", () => {
  const c = capture();
  c.reviews.value.push({ ...c.reviews.value[0], id: 61, state: "COMMENTED" });
  a.equal(prove(c).verdict, "VERIFIED");
  c.rules.classic.value.required_pull_request_reviews.required_approving_review_count = 2;
  a.equal(prove(c).verdict, "NOT_PROVEN");
  c.reviews.value.push({
    ...c.reviews.value[0],
    id: 62,
    state: "CHANGES_REQUESTED",
  });
  a.equal(prove(c).summary.approval.reason, "CHANGES_REQUESTED_OBSERVED");
});
test("no approval requirement is explicitly not applicable", () => {
  const c = capture();
  c.rules.classic.value.required_pull_request_reviews = null;
  c.reviews.value = [];
  a.equal(prove(c).summary.approval.state, "NOT_APPLICABLE");
});
for (const field of [
  "head",
  "base",
  "check",
  "rules",
  "approval",
  "remote",
  "group",
])
  test(field + " change stales historical receipt without mutation", () => {
    const c = capture(),
      r = prove(c),
      before = JSON.stringify(r);
    const mutate = {
      head: () => (c.identity.headSha = OLD),
      base: () => (c.identity.baseSha = OLD),
      check: () => (c.checks.value[0].conclusion = "failure"),
      rules: () =>
        (c.rules.classic.value.required_status_checks.strict = false),
      approval: () => (c.reviews.value[0].state = "DISMISSED"),
      remote: () => (c.remote = U("403")),
      group: () =>
        (c.target = A({ kind: "MERGE_GROUP", sha: M, headSha: H, baseSha: B })),
    };
    mutate[field]();
    a.equal(freshness(r, c).state, "STALE");
    a.equal(r.verdict, "VERIFIED");
    a.equal(JSON.stringify(r), before);
  });
test("timestamp alone does not expire proof; failed refresh preserves prior verdict", () => {
  const c = capture(),
    r = prove(c);
  c.observedAt = "2026-09-11T12:00:00Z";
  a.equal(freshness(r, c).state, "CURRENT");
  a.equal(freshness(r, null).state, "UNAVAILABLE");
  a.equal(freshness(r, null).historicalVerdict, "VERIFIED");
});
test("rules are intersected and unsupported evidence is explicit", () => {
  const c = capture();
  c.rules.active.value.push(
    {
      type: "required_status_checks",
      parameters: {
        required_status_checks: [{ context: "test", integration_id: 11 }],
        strict_required_status_checks_policy: true,
      },
    },
    {
      type: "pull_request",
      parameters: { required_approving_review_count: 2 },
    },
    { type: "required_signatures" },
  );
  const r = requirements(c.rules);
  a.equal(r.checks.length, 2);
  a.equal(r.approvals, 2);
  a.ok(r.unsupported.includes("required_signatures"));
});
test("human and JSON render same underlying receipt and escape untrusted strings", () => {
  const r = prove(capture());
  r.identity.repository = "<script>alert(1)</script>";
  const h = html(r, { state: "STALE" });
  a.match(h, /VERIFIED/);
  a.match(h, /RE-PROOF REQUIRED/);
  a.doesNotMatch(h, /<script>/);
  a.match(text(r), /VERIFIED/);
  a.match(h, new RegExp(r.receiptId));
});
test("ALLGREEN requirements for other merge-group entries cannot be silently waived", () => {
  const c = capture();
  c.rules.active.value.push({
    type: "merge_queue",
    parameters: { grouping_strategy: "ALLGREEN" },
  });
  a.equal(prove(c).verdict, "NOT_PROVEN");
  a.ok(
    prove(c).summary.rules.unsupported.includes(
      "ALLGREEN_OTHER_GROUP_ENTRIES_UNAVAILABLE",
    ),
  );
});
test("issuance currentness and fresh human envelope agree when required sources are unavailable", () => {
  const c = capture();
  c.rules.classic = { state: "UNAVAILABLE", reason: "403" };
  const r = prove(c);
  a.equal(r.freshness.state, "UNAVAILABLE");
  a.equal(freshness(r, c).state, r.freshness.state);
});
test("reviewer permission uncertainty is scoped; queue selection uncertainty remains unavailable", () => {
  const c = capture(); c.reviews.value[0].writePermission = U("403");
  a.equal(prove(c).verdict, "NOT_PROVEN"); a.equal(freshness(prove(c), c).state, "CURRENT");
  c.target.value.selection = U("NO_QUEUE_ENTRY");
  a.equal(prove(c).freshness.state, "UNAVAILABLE"); a.equal(freshness(prove(c), c).state, "UNAVAILABLE");
});
