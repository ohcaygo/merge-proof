"use strict";
const { available: A } = require("../common");
const H = "a".repeat(40),
  B = "b".repeat(40),
  M = "c".repeat(40),
  OLD = "d".repeat(40),
  T = "2026-09-10T12:00:00Z";
function capture() {
  return {
    source: "github-rest",
    startedAt: T,
    observedAt: T,
    consistency: "STABLE_OBSERVATION",
    identity: {
      repository: "fixture/public",
      repositoryId: 1,
      visibility: "public",
      authorization: "PUBLIC_ANONYMOUS",
      pr: 1,
      headSha: H,
      headRef: "feature",
      headRepository: "fixture/public",
      headRepositoryId: 1,
      baseRef: "main",
      baseSha: B,
      branchProtected: true,
      prState: "open",
      merged: false,
      mergeCommitSha: M,
      authorId: 1,
      author: { id: 1, login: "author", type: "User" },
      mergedBy: null,
      githubMergeable: true,
      githubMergeState: "clean",
    },
    rules: {
      classic: A({
        required_status_checks: {
          strict: true,
          checks: [{ context: "test", app_id: 10 }],
        },
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: true,
        },
      }),
      active: A([]),
    },
    git: A({
      headSha: H,
      baseSha: B,
      mergeBase: B,
      candidateFiles: ["src/feature.js"],
      baseFiles: [],
      baseAdvanceCommits: 0,
      dates: { [H]: T, [B]: T },
    }),
    target: A({
      tree: "e".repeat(40),
      kind: "HEAD_CONTAINS_CURRENT_BASE",
      sha: H,
      headSha: H,
      baseSha: B,
    }),
    remote: A({
      repositoryId: 1,
      ref: "feature",
      expectedSha: H,
      observedSha: H,
      confirmed: true,
    }),
    checks: A([
      {
        id: 10,
        name: "test",
        appId: 10,
        appSlug: "ci",
        sha: H,
        status: "completed",
        conclusion: "success",
        startedAt: T,
        completedAt: T,
        suiteId: 50,
      },
    ]),
    statuses: A([]),
    execution: A([
      {
        runId: 20,
        workflowId: 30,
        workflowPath: ".github/workflows/ci.yml",
        workflowBlob: A({ sha: "f".repeat(40), path: ".github/workflows/ci.yml", commit: H, trust: "GITHUB_API" }),
        event: "pull_request",
        pullRequests: [{ number: 1, headSha: H, repositoryId: 1 }],
        headBranch: "feature",
        attempt: 1,
        runSha: H,
        actor: { id: 1, login: "author", type: "User" },
        triggeringActor: { id: 1, login: "author", type: "User" },
        jobId: 40,
        checkId: 10,
        sha: H,
        status: "completed",
        conclusion: "success",
        runStatus: "completed",
        runConclusion: "success",
        steps: [
          {
            number: 1,
            status: "completed",
            conclusion: "success",
            startedAt: T,
            completedAt: T,
          },
        ],
      },
    ]),
    reviews: A([
      {
        id: 60,
        userId: 2,
        login: "reviewer",
        userType: "User",
        state: "APPROVED",
        sha: H,
        submittedAt: T,
        writePermission: A(true),
      },
    ]),
    actors: A({
      author: { id: 1, login: "author", type: "User" },
      mergedBy: null,
      truncated: false,
      commits: [
        {
          sha: H,
          author: { id: 1, login: "author", type: "User" },
          committer: { id: 1, login: "author", type: "User" },
          verified: false,
          verificationReason: "unsigned",
        },
      ],
    }),
  };
}
// Real REST response shapes passed through the actual streaming Client and collector.
function fixtureFetch({
  privateRepo = false,
  deny = false,
  head = H,
  base = B,
  mergeBase = B,
  changedFiles = ["src/feature.js"],
  failPath = null,
  mutate = null,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url),
      p = u.pathname;
    calls.push({ path: p, method: init.method || "GET" });
    if (deny || p === failPath) return new Response("{}", { status: 403 });
    let v;
    const info = { id: 1, full_name: "fixture/public", private: privateRepo };
    if (p === "/repos/fixture/public") v = info;
    else if (p === "/repos/fixture/public/pulls/1")
      v = {
        number: 1,
        head: { sha: head, ref: "feature", repo: info },
        base: { sha: base, ref: "main", repo: info },
        state: "open",
        merged: false,
        merge_commit_sha: M,
        user: { id: 1, login: "author", type: "User" },
        merged_by: null,
        mergeable: true,
        mergeable_state: "clean",
      };
    else if (p === "/repos/fixture/public/branches/main")
      v = { commit: { sha: base }, protected: true };
    else if (p.endsWith("/branches/main/protection"))
      v = capture().rules.classic.value;
    else if (p.endsWith("/rules/branches/main")) v = [];
    else if (p.includes("/compare/")) {
      const [from, to] = p.split("/compare/")[1].split("...");
      v = {
        merge_base_commit: {
          sha: from === base && to === head ? mergeBase : from,
          commit: { committer: { date: T } },
        },
        files:
          to === head
            ? changedFiles.map((filename) => ({
                filename,
                status: "modified",
                patch: "NEVER STORE SOURCE",
              }))
            : [],
        total_commits: to === head ? 1 : 0,
      };
    } else if (
      p.includes("/commits/") &&
      !p.endsWith("/check-runs") &&
      !p.endsWith("/statuses")
    )
      v = {
        sha: p.split("/").pop(),
        parents: [{ sha: base }, { sha: head }],
        commit: { tree: { sha: "e".repeat(40) }, committer: { date: T }, message: "DO NOT STORE" },
      };
    else if (p.endsWith("/git/ref/heads/feature"))
      v = { object: { sha: head } };
    else if (p.endsWith("/git/ref/pull/1/merge")) v = { object: { sha: M } };
    else if (p.includes("/git/ref/heads/gh-readonly-queue/"))
      v = { object: { sha: M } };
    else if (p.endsWith("/check-runs"))
      v = {
        total_count: 1,
        check_runs: [
          {
            id: 10,
            name: "test",
            app: { id: 10, slug: "ci" },
            head_sha: head,
            status: "completed",
            conclusion: "success",
            started_at: T,
            completed_at: T,
            check_suite: { id: 50 },
            output: { text: "DO NOT STORE SOURCE" },
          },
        ],
      };
    else if (p.endsWith("/statuses")) v = [];
    else if (p.includes("/contents/.github/workflows/")) v = { type: "file", path: p.split("/contents/")[1], sha: "f".repeat(40) };
    else if (p.endsWith("/actions/runs"))
      v = {
        total_count: 1,
        workflow_runs: [
          {
            id: 20,
            workflow_id: 30,
            path: ".github/workflows/ci.yml",
            event: "pull_request",
            pull_requests: [{ number: 1, head: { sha: head }, base: { repo: { id: 1 } } }],
            head_branch: "feature",
            run_attempt: 1,
            head_sha: head,
            status: "completed",
            conclusion: "success",
            actor: { id: 1, login: "author", type: "User" },
            triggering_actor: { id: 1, login: "author", type: "User" },
          },
        ],
      };
    else if (p.endsWith("/attempts/1/jobs"))
      v = {
        total_count: 1,
        jobs: [
          {
            id: 40,
            head_sha: head,
            check_run_url:
              "https://api.github.com/repos/fixture/public/check-runs/10",
            status: "completed",
            conclusion: "success",
            steps: [
              {
                number: 1,
                status: "completed",
                conclusion: "success",
                started_at: T,
                completed_at: T,
              },
            ],
          },
        ],
      };
    else if (p === "/repos/fixture/public/pulls")
      v = [{ number: 1, title: "Fixture pull request" }];
    else if (p.endsWith("/pulls/1/commits"))
      v = [
        {
          sha: head,
          author: { id: 1, login: "author", type: "User" },
          committer: { id: 1, login: "author", type: "User" },
          commit: {
            message: "DO NOT STORE",
            verification: { verified: false, reason: "unsigned" },
          },
        },
      ];
    else if (p.endsWith("/pulls/1/reviews"))
      v = [
        {
          id: 60,
          user: { id: 2, login: "reviewer", type: "User" },
          state: "APPROVED",
          commit_id: head,
          submitted_at: T,
          body: "NEVER STORE REVIEW BODY",
        },
      ];
    else if (p.endsWith("/collaborators/reviewer/permission"))
      v = { permission: "write" };
    else return new Response("{}", { status: 404 });
    if (mutate) v = mutate(p, v, calls.length);
    return new Response(JSON.stringify(v), { status: 200 });
  };
  return { fetchImpl, calls };
}
module.exports = { capture, fixtureFetch, H, B, M, OLD, T };
