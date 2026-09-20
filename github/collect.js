"use strict";
const {
  sha,
  repoName,
  assert,
  available,
  unavailable,
  hash,
} = require("./common");
const { requirements } = require("./rules");
const commitMeta = (c) => ({
  sha: c.sha,
  tree: c.commit?.tree?.sha || c.tree?.sha || null,
  parents: (c.parents || []).map((p) => p.sha),
  date: c.commit?.committer?.date || null,
});
// The linked GitHub account and its declared type. Nothing free-text: commit
// author name/email, review bodies and commit messages stay uncollected.
const account = (u) =>
  u && Number.isSafeInteger(u.id) && typeof u.login === "string"
    ? { id: u.id, login: u.login, type: typeof u.type === "string" ? u.type : null }
    : null;
// The two rule sources, projected to parameters only. Shared by proof
// collection and by the read-only merge-gate status check, so both see exactly
// the same requirements.
async function collectRules(client, repo, baseRef, branchProtected) {
  const root = `/repos/${repo}`;
  return {
    classic: await client.observe(async () => {
      try {
        const c = await client.get(
          `${root}/branches/${encodeURIComponent(baseRef)}/protection`,
        );
        return {
          required_signatures: c.required_signatures
            ? { enabled: c.required_signatures.enabled }
            : null,
          required_linear_history: c.required_linear_history
            ? { enabled: c.required_linear_history.enabled }
            : null,
          required_status_checks: c.required_status_checks
            ? {
                strict: c.required_status_checks.strict,
                contexts: c.required_status_checks.contexts || [],
                checks: (c.required_status_checks.checks || []).map((x) => ({
                  context: x.context,
                  app_id: x.app_id,
                })),
              }
            : null,
          required_pull_request_reviews: c.required_pull_request_reviews
            ? Object.fromEntries(
                [
                  "required_approving_review_count",
                  "dismiss_stale_reviews",
                  "require_code_owner_reviews",
                  "require_last_push_approval",
                ].map((k) => [k, c.required_pull_request_reviews[k] ?? false]),
              )
            : null,
          required_conversation_resolution: c.required_conversation_resolution
            ? { enabled: c.required_conversation_resolution.enabled }
            : null,
        };
      } catch (e) {
        // Rulesets also set branch.protected. A REST 404 alone cannot distinguish
        // absent classic protection from denied access. Ask GitHub for the exact
        // ref's classic rule; errors/partial data must never imply absence.
        if (e.status === 404 && branchProtected === false) return null;
        if (e.status === 404 && branchProtected === true) {
          const [owner, name] = repo.split("/");
          const result = await client.request("/graphql", {
            method: "POST",
            body: {
              query: "query($owner:String!,$name:String!,$ref:String!){repository(owner:$owner,name:$name){nameWithOwner ref(qualifiedName:$ref){name prefix branchProtectionRule{id}}}}",
              variables: { owner, name, ref: `refs/heads/${baseRef}` },
            },
          });
          const repository = result.data?.repository, ref = repository?.ref;
          assert(
            !result.errors &&
              repository?.nameWithOwner?.toLowerCase() === repo.toLowerCase() &&
              ref?.name === baseRef && ref?.prefix === "refs/heads/" &&
              ref.branchProtectionRule === null,
            "CLASSIC_PROTECTION_ABSENCE_UNCONFIRMED",
          );
          return null;
        }
        throw e;
      }
    }),
    active: await client.observe(async () =>
      (
        await client.list(`${root}/rules/branches/${encodeURIComponent(baseRef)}`)
      ).map((r) => ({
        type: r.type,
        ruleset_id: r.ruleset_id,
        ruleset_source_type: r.ruleset_source_type,
        ruleset_source: r.ruleset_source,
        parameters: r.parameters || null,
      })),
    ),
  };
}
async function identity(client, repo, pr) {
  const root = `/repos/${repo}`;
  const r = await client.get(root),
    p = await client.get(`${root}/pulls/${pr}`);
  assert(
    r.full_name.toLowerCase() === repo.toLowerCase() &&
      Number.isSafeInteger(r.id) &&
      typeof r.private === "boolean",
  );
  assert(
    p.number === pr &&
      p.base?.repo?.id === r.id &&
      sha(p.head?.sha) &&
      typeof p.base?.ref === "string",
  );
  const branch = await client.get(
    `${root}/branches/${encodeURIComponent(p.base.ref)}`,
  );
  assert(sha(branch.commit?.sha) && typeof branch.protected === "boolean");
  const merged = p.merged === true;
  const mergeCommit = merged && !sha(p.merge_commit_sha)
    ? await client.observe(() => require("./pull-commit").mergedCommit(client, {
      repository: r.full_name, repositoryId: r.id, pr, headSha: p.head.sha, baseRef: p.base.ref,
    })) : null;
  return {
    repository: r.full_name,
    repositoryId: r.id,
    visibility: r.private ? "private" : "public",
    authorization: client.token ? "GITHUB_TOKEN" : "PUBLIC_ANONYMOUS",
    pr,
    headSha: p.head.sha,
    headRef: p.head.ref,
    headRepository: p.head.repo?.full_name || null,
    headRepositoryId: p.head.repo?.id || null,
    defaultBranch: r.default_branch || null,
    baseRef: p.base.ref,
    baseSha: branch.commit.sha,
    branchProtected: branch.protected,
    prState: p.state,
    merged,
    mergeCommitSha: p.merge_commit_sha || mergeCommit?.value || null,
    authorId: p.user?.id,
    // Account identity only. Git header name/email are unvalidated client
    // strings and are never stored.
    author: account(p.user),
    mergedBy: account(p.merged_by),
  };
}
async function collectOnce(
  client,
  repo,
  pr,
  { mergeGroup = null, historical = false, previous = null, areas = null, executionPolicyReader = null } = {},
) {
  assert(repoName(repo) && Number.isSafeInteger(pr) && pr > 0, "INVALID_SCOPE");
  const keep = (key) => previous && areas && !areas.includes(key);
  const i = keep("identity") ? structuredClone(previous.identity) : await identity(client, repo, pr),
    root = `/repos/${repo}`;
  if (historical) {
    assert(i.merged && sha(i.mergeCommitSha), "UNSUPPORTED_HISTORICAL_SHAPE");
    const landed = commitMeta(
      await client.get(`${root}/commits/${i.mergeCommitSha}`),
    );
    assert(
      landed.sha === i.mergeCommitSha &&
        landed.parents.length === 2 &&
        landed.parents[1] === i.headSha &&
        sha(landed.parents[0]),
      "UNSUPPORTED_HISTORICAL_SHAPE",
    );
    i.analysisMode = "HISTORICAL_TWO_PARENT_MERGE";
    i.observedCurrentBaseSha = i.baseSha;
    i.baseSha = landed.parents[0];
  }
  const rules = keep("rules") ? previous.rules : await collectRules(client, repo, i.baseRef, i.branchProtected);
  if (!keep("rules")) rules.executionProtections = executionPolicyReader
    ? await executionPolicyReader({ repository: repo, repositoryId: i.repositoryId })
    : await require("./rules").executionProtections(client, repo);
  const req = requirements(rules);
  const git = keep("git") ? previous.git : await client.observe(async () => {
    const d = await client.get(
      `${root}/compare/${i.baseSha}...${i.headSha}?per_page=1`,
    );
    const m = d.merge_base_commit?.sha;
    assert(sha(m));
    const getDiff = async (to) => {
      const x = await client.get(`${root}/compare/${m}...${to}?per_page=1`);
      assert(
        x.merge_base_commit?.sha === m &&
          Array.isArray(x.files) &&
          x.files.length < 300 &&
          Number.isSafeInteger(x.total_commits),
        "INCOMPLETE_GIT_METADATA",
      );
      assert(
        x.files.every(
          (f) => typeof f.filename === "string" && f.filename.length > 0,
        ),
      );
      return {
        files: [...new Set(x.files.map((f) => f.filename))].sort(),
        count: x.total_commits,
      };
    };
    const h = await getDiff(i.headSha),
      b = await getDiff(i.baseSha);
    const hc = commitMeta(await client.get(`${root}/commits/${i.headSha}`));
    const bc = commitMeta(await client.get(`${root}/commits/${i.baseSha}`));
    assert(hc.sha === i.headSha && bc.sha === i.baseSha);
    return {
      headSha: i.headSha,
      headTree: hc.tree,
      baseTree: bc.tree,
      baseSha: i.baseSha,
      mergeBase: m,
      candidateFiles: h.files,
      baseFiles: b.files,
      baseAdvanceCommits: b.count,
      dates: {
        [m]: d.merge_base_commit.commit?.committer?.date || null,
        [i.headSha]: hc.date,
        [i.baseSha]: bc.date,
      },
    };
  });
  let target = keep("target") ? previous.target : unavailable("CURRENT_COMBINED_STATE_UNAVAILABLE");
  if (historical)
    target = available({
      kind: "LANDED_TWO_PARENT_MERGE",
      sha: i.mergeCommitSha,
      headSha: i.headSha,
      baseSha: i.baseSha,
    });
  if (!keep("target") && i.prState === "open" && !i.merged) {
    // GitHub requires passing PR checks before it creates a merge group.
    // Without a group, prove only the ordinary PR target for queue admission.
    // A signed group event selects the separate queue commit for final checks.
    if (mergeGroup) {
      target = await client.observe(async () => {
        assert(
          mergeGroup &&
            sha(mergeGroup.head_sha) &&
            sha(mergeGroup.base_sha) &&
            mergeGroup.base_ref === `refs/heads/${i.baseRef}`,
          "MERGE_GROUP_UNAVAILABLE",
        );
        assert(
          typeof mergeGroup.head_ref === "string" &&
            mergeGroup.head_ref.startsWith("refs/heads/gh-readonly-queue/"),
          "MERGE_GROUP_UNAVAILABLE",
        );
        const ref = await client.get(
          `${root}/git/ref/${mergeGroup.head_ref.slice(5).split("/").map(encodeURIComponent).join("/")}`,
        );
        assert(ref.object?.sha === mergeGroup.head_sha, "MERGE_GROUP_CHANGED");
        // No inference from a queue branch name: prove this exact PR head is an ancestor.
        const lineage = await client.get(
          `${root}/compare/${i.headSha}...${mergeGroup.head_sha}?per_page=1`,
        );
        assert(
          lineage.merge_base_commit?.sha === i.headSha,
          "CANDIDATE_NOT_IN_GROUP",
        );
        const baseLineage = await client.get(
          `${root}/compare/${i.baseSha}...${mergeGroup.head_sha}?per_page=1`,
        );
        assert(
          baseLineage.merge_base_commit?.sha === i.baseSha,
          "BASE_NOT_IN_GROUP",
        );
        const selection = await client.observe(async () => {
          const [owner, name] = repo.split("/");
          const data = await client.request("/graphql", {
            method: "POST",
            body: {
              query:
                "query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){databaseId pullRequest(number:$pr){headRefOid mergeQueueEntry{id state position baseCommit{oid} headCommit{oid} mergeQueue{entries(first:100){nodes{position state pullRequest{number headRefOid} headCommit{oid} baseCommit{oid}} pageInfo{hasNextPage}}}}}}}",
              variables: { owner, name, pr },
            },
          });
          const repository = data.data?.repository,
            p = repository?.pullRequest,
            q = p?.mergeQueueEntry;
          assert(
            !data.errors &&
              repository?.databaseId === i.repositoryId &&
              p?.headRefOid === i.headSha &&
              q?.headCommit?.oid === mergeGroup.head_sha &&
              q?.baseCommit?.oid === mergeGroup.base_sha &&
              ["AWAITING_CHECKS", "MERGEABLE", "LOCKED"].includes(q.state),
            "CURRENT_QUEUE_SELECTION_UNAVAILABLE",
          );
          let order=null,orderReason=null;
          try { order=require("./queue-order").prefix(repository,i,mergeGroup); }
          catch(e) { orderReason=e.code||"QUEUE_MEMBERSHIP_ORDER_UNAVAILABLE"; }
          assert(q.baseCommit.oid===i.baseSha || order?.providerOrderConfirmed,"CURRENT_QUEUE_SELECTION_UNAVAILABLE");
          return {
            order,orderReason,
            id: q.id,
            state: q.state,
            headSha: q.headCommit.oid,
            baseSha: q.baseCommit.oid,
            candidateSha: p.headRefOid,
          };
        });
        assert(mergeGroup.base_sha === i.baseSha || selection.value?.order?.providerOrderConfirmed, "CURRENT_QUEUE_SELECTION_UNAVAILABLE");
        return {
          tree: commitMeta(await client.get(`${root}/commits/${mergeGroup.head_sha}`)).tree,
          kind: "MERGE_GROUP",
          sha: mergeGroup.head_sha,
          headSha: i.headSha,
          baseSha: i.baseSha,
          ref: mergeGroup.head_ref,
          selection,
        };
      });
    } else if (git.state === "AVAILABLE" && git.value.mergeBase === i.baseSha) {
      target = available({
        tree: git.value.headTree,
        kind: "HEAD_CONTAINS_CURRENT_BASE",
        sha: i.headSha,
        headSha: i.headSha,
        baseSha: i.baseSha,
      });
    } else {
      target = await client.observe(async () => {
        const ref = await client.get(`${root}/git/ref/pull/${pr}/merge`);
        // The exact PR ref plus both ordered parents binds the synthetic
        // commit even when REST no longer supplies merge_commit_sha.
        const mergeSha = ref.object?.sha;
        assert(sha(mergeSha), "TEST_MERGE_UNAVAILABLE");
        const m = commitMeta(
          await client.get(`${root}/commits/${mergeSha}`),
        );
        assert(
          (!i.mergeCommitSha || mergeSha === i.mergeCommitSha) &&
            m.sha === mergeSha &&
            m.parents.length === 2 &&
            m.parents[0] === i.baseSha &&
            m.parents[1] === i.headSha,
          "TEST_MERGE_NOT_CURRENT",
        );
        return {
          tree: m.tree,
          kind: "PR_TEST_MERGE",
          sha: m.sha,
          headSha: i.headSha,
          baseSha: i.baseSha,
          parents: m.parents,
        };
      });
    }
  }
  const remote = keep("remote") ? previous.remote : await client.observe(async () => {
    assert(
      repoName(i.headRepository) && Number.isSafeInteger(i.headRepositoryId),
      "HEAD_REPOSITORY_UNAVAILABLE",
    );
    const r = await client.get(`/repos/${i.headRepository}`);
    assert(r.id === i.headRepositoryId);
    const ref = await client.get(
      `/repos/${i.headRepository}/git/ref/heads/${encodeURIComponent(i.headRef)}`,
    );
    return {
      repositoryId: r.id,
      ref: i.headRef,
      expectedSha: i.headSha,
      observedSha: ref.object?.sha || null,
      confirmed: ref.object?.sha === i.headSha,
    };
  });
  const checks = keep("checks") ? previous.checks : await client.observe(async () => {
    const all = [];
    for (const s of [
      ...new Set([i.headSha, target.value?.sha].filter(Boolean)),
    ]) {
      const rows = await client.list(
        `${root}/commits/${s}/check-runs?filter=all`,
        "check_runs",
      );
      for (const c of rows) {
        // Our receipt check is delivery, not an independent input to its proof.
        if (c.name === require("./check").NAME) continue;
        assert(
          Number.isSafeInteger(c.id) &&
            sha(c.head_sha) &&
            Number.isSafeInteger(c.app?.id),
        );
        all.push({
          id: c.id,
          name: c.name,
          appId: c.app.id,
          appSlug: typeof c.app.slug === "string" ? c.app.slug : null,
          sha: c.head_sha,
          status: c.status,
          conclusion: c.conclusion,
          startedAt: c.started_at,
          completedAt: c.completed_at,
          suiteId: c.check_suite?.id || null,
        });
      }
    }
    return [...new Map(all.map((c) => [c.id, c])).values()].sort(
      (a, b) => a.id - b.id,
    );
  });
  const statuses = keep("statuses") ? previous.statuses : await client.observe(async () => {
    const all = [];
    for (const s of [
      ...new Set([i.headSha, target.value?.sha].filter(Boolean)),
    ]) {
      for (const c of await client.list(`${root}/commits/${s}/statuses`)) {
        assert(Number.isSafeInteger(c.id));
        all.push({
          id: c.id,
          name: c.context,
          sha: s,
          state: c.state,
          updatedAt: c.updated_at,
        });
      }
    }
    return all.sort((a, b) => a.id - b.id);
  });
  const execution = keep("execution") ? previous.execution : await client.observe(async () => {
    assert(target.state === "AVAILABLE", "TARGET_UNAVAILABLE");
    const runs = await client.list(
      `${root}/actions/runs?head_sha=${target.value.sha}`,
      "workflow_runs",
    );
    const all = [];
    const blobs = new Map();
    const relevantSuites = new Set((checks.value || []).filter(x => req.checks.some(rule => rule.name === x.name && (rule.appId === null || rule.appId === x.appId))).map(x => x.suiteId));
    for (const r of runs) {
      if (Number.isSafeInteger(r.check_suite_id) && !relevantSuites.has(r.check_suite_id)) continue;
      assert(
        sha(r.head_sha) &&
          Number.isSafeInteger(r.id) &&
          Number.isSafeInteger(r.run_attempt),
      );
      const path = r.path;
      const blobKey = `${r.head_sha}:${path}`;
      if (!blobs.has(blobKey)) blobs.set(blobKey, await client.observe(async () => {
        assert(typeof path === "string" && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path), "WORKFLOW_PATH_UNAVAILABLE");
        const file = await client.get(`${root}/contents/${path}?ref=${r.head_sha}`);
        assert(file.type === "file" && file.path === path && sha(file.sha), "WORKFLOW_BLOB_UNAVAILABLE");
        const text = file.encoding === "base64" && typeof file.content === "string" ? Buffer.from(file.content, "base64").toString("utf8") : null;
        const unpinnedUses = text == null ? null : [...text.matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"'#]+)/gm)].map(m => m[1]).filter(x => !x.startsWith("./") && !/@[a-f0-9]{40}$/.test(x) && !/@sha256:[a-f0-9]{64}$/.test(x));
        return { sha: file.sha, path, commit: r.head_sha, trust: "GITHUB_API", advisories: unpinnedUses == null ? ["USES_PINNING_NOT_OBSERVED"] : unpinnedUses.length ? ["UNPINNED_USES_OBSERVED"] : [], unpinnedUses };
      }));
      for (const j of await client.list(
        `${root}/actions/runs/${r.id}/attempts/${r.run_attempt}/jobs`,
        "jobs",
      )) {
        const checkId = Number(
          (j.check_run_url || "").match(/\/check-runs\/(\d+)$/)?.[1],
        );
        all.push({
          runId: r.id,
          workflowId: r.workflow_id,
          workflowPath: r.path || null,
          workflowBlob: blobs.get(blobKey),
          event: r.event || null,
          pullRequests: (r.pull_requests || []).map(p => ({ number: p.number, headSha: p.head?.sha || null, repositoryId: p.base?.repo?.id || null })),
          headBranch: r.head_branch || null,
          suiteId: r.check_suite_id || null,
          attempt: r.run_attempt,
          runSha: r.head_sha,
          runStartedAt: r.run_started_at || null,
          // actor started the run; triggeringActor started the latest attempt.
          actor: account(r.actor),
          triggeringActor: account(r.triggering_actor),
          jobId: j.id,
          checkId: Number.isSafeInteger(checkId) ? checkId : null,
          sha: j.head_sha,
          status: j.status,
          conclusion: j.conclusion,
          runStatus: r.status,
          runConclusion: r.conclusion,
          steps: (j.steps || []).map((s) => ({
            number: s.number,
            status: s.status,
            conclusion: s.conclusion,
            startedAt: s.started_at,
            completedAt: s.completed_at,
          })),
        });
      }
    }
    return all.sort((a, b) => a.jobId - b.jobId);
  });
  // GitHub currently exposes thresholds and upload processing status, but no
  // documented complete aggregate with exact producer/candidate provenance.
  // This is a provider capability gap, never an invitation to parse a comment
  // or treat a successful upload job as a coverage measurement.
  const coverage = req.coverage.length ? unavailable("GITHUB_COVERAGE_BOUND_AGGREGATE_API_UNAVAILABLE") : available(null);
  const reviews = keep("reviews") ? previous.reviews : await client.observe(async () => {
    const rows = await client.list(`${root}/pulls/${pr}/reviews`);
    assert(
      new Set(rows.map((r) => r.user?.login)).size <= 30,
      "REVIEWER_LIMIT",
    );
    const perms = new Map();
    const out = [];
    for (const r of rows) {
      assert(
        Number.isSafeInteger(r.id) &&
          Number.isSafeInteger(r.user?.id) &&
          typeof r.user?.login === "string",
      );
      if (!perms.has(r.user.login))
        perms.set(
          r.user.login,
          await client.observe(async () => {
            const p = await client.get(
              `${root}/collaborators/${encodeURIComponent(r.user.login)}/permission`,
            );
            return (
              p.user?.permissions?.push === true ||
              ["write", "maintain", "admin"].includes(p.permission)
            );
          }),
        );
      out.push({
        id: r.id,
        userId: r.user.id,
        login: r.user.login,
        userType: r.user.type,
        state: r.state,
        sha: r.commit_id,
        submittedAt: r.submitted_at,
        writePermission: perms.get(r.user.login),
      });
    }
    return out.sort((a, b) => a.id - b.id);
  });
  // Who and what GitHub records as having produced this change. One bounded
  // page; a longer branch is marked truncated rather than silently cut.
  const actors = keep("actors") ? previous.actors : await client.observe(async () => {
    const rows = await client.get(`${root}/pulls/${pr}/commits?per_page=100`);
    assert(Array.isArray(rows), "COMMIT_ACTORS_UNAVAILABLE");
    return {
      author: i.author,
      mergedBy: i.mergedBy,
      truncated: rows.length >= 100,
      commits: rows.map((c) => ({
        sha: c.sha,
        author: account(c.author),
        committer: account(c.committer),
        verified: c.commit?.verification?.verified === true,
        verificationReason: c.commit?.verification?.reason || null,
      })),
    };
  });
  const authority = keep("reviews") ? previous.authority : await require("./authority").collect(client, i);
  return {
    authority,
    identity: i,
    rules,
    git,
    target,
    remote,
    checks,
    statuses,
    execution,
    coverage,
    reviews,
    actors,
  };
}
async function collect(client, repo, pr, options) {
  const startedAt = new Date().toISOString();
  const first = await collectOnce(client, repo, pr, options);
  const second = await collectOnce(client, repo, pr, options);
  return {
    ...second,
    source: "github-rest",
    startedAt,
    observedAt: new Date().toISOString(),
    consistency:
      hash(require("./bindings").fingerprints(first)) === hash(require("./bindings").fingerprints(second))
        ? "STABLE_OBSERVATION"
        : "CHANGED_DURING_COLLECTION",
  };
}
module.exports = { collect, collectOnce, identity, collectRules };
