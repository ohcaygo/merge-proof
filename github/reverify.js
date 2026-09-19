"use strict";
// A later read corroborates retained provider records. It cannot recreate
// historical rules, permissions, refs, or a deleted candidate.
async function online(bundle, client) {
  const receipt = bundle.receipt, c = receipt.evidence, root = `/repos/${c.identity.repository}`;
  await client.authorize(c.identity.repository, c.identity.repositoryId);
  const rows = [];
  const inspect = async (kind, id, endpoint, immutable, mutable = () => true) => {
    try {
      const value = await client.get(endpoint);
      rows.push({ kind, id, state: !immutable(value) ? "DIVERGED" : mutable(value) ? "MATCH" : "EXPECTED_CHANGE" });
    } catch (e) { rows.push({ kind, id, state: e.status === 404 || e.status === 410 ? "RECORD_UNAVAILABLE_RETENTION_POSSIBLE" : "UNAVAILABLE" }); }
  };
  for (const check of c.checks.value || []) await inspect("CHECK", check.id, `${root}/check-runs/${check.id}`,
    x => x.id === check.id && x.head_sha === check.sha && x.app?.id === check.appId,
    x => x.status === check.status && x.conclusion === check.conclusion);
  for (const j of new Map((c.execution.value || []).map(x => [`${x.runId}:${x.attempt}`, x])).values())
    await inspect("WORKFLOW_ATTEMPT", `${j.runId}:${j.attempt}`, `${root}/actions/runs/${j.runId}/attempts/${j.attempt}`,
      x => x.id === j.runId && x.run_attempt === j.attempt && x.head_sha === j.runSha && x.workflow_id === j.workflowId && x.event === j.event,
      x => x.conclusion === j.runConclusion);
  for (const r of c.reviews.value || []) await inspect("REVIEW", r.id, `${root}/pulls/${c.identity.pr}/reviews/${r.id}`,
    x => x.id === r.id && x.commit_id === r.sha && x.user?.id === r.userId, x => x.state === r.state);
  for (const [kind, commit, tree] of [["CANDIDATE", c.target.value?.sha, c.target.value?.tree], ["HEAD", c.identity.headSha, c.git.value?.headTree]])
    if (commit) await inspect(kind, commit, `${root}/git/commits/${commit}`, x => x.sha === commit && (!tree || x.tree?.sha === tree));
  const divergence = rows.some(x => x.state === "DIVERGED");
  return { state: divergence ? "REVERIFICATION_DIVERGED" : rows.every(x => x.state === "MATCH") ? "CONSISTENT_AND_REVERIFIED_ONLINE" : "PARTIALLY_REVERIFIED",
    rows, exitCode: divergence ? 5 : 0,
    limitation: "Provider records are assertions. Missing records do not prove retention expiry; changed mutable state does not impeach a historical receipt. Rules and permissions at issue cannot be re-observed." };
}
module.exports = { online };
