"use strict";
const { assert } = require("./common");
async function collect(client, identity) {
  const root = `/repos/${identity.repository}`, [owner, name] = identity.repository.split("/");
  const opinionated = await client.observe(async () => {
    const r = await client.request("/graphql", { method: "POST", body: { variables: { owner, name, pr: identity.pr },
      query: "query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){databaseId pullRequest(number:$pr){headRefOid latestOpinionatedReviews(first:100,writersOnly:true){pageInfo{hasNextPage} nodes{databaseId state submittedAt commit{oid} author{login __typename}}}}}}" } });
    const repo = r.data?.repository, p = repo?.pullRequest;
    assert(!r.errors && repo?.databaseId === identity.repositoryId && p?.headRefOid === identity.headSha && p.latestOpinionatedReviews?.pageInfo?.hasNextPage === false, "OPINIONATED_REVIEWS_UNAVAILABLE");
    return p.latestOpinionatedReviews.nodes.map(x => ({ id: x.databaseId, state: x.state, submittedAt: x.submittedAt, sha: x.commit?.oid, actor: x.author }));
  });
  const activity = await client.observe(async () => {
    const rows = await client.list(`${root}/activity?ref=${encodeURIComponent(`refs/heads/${identity.headRef}`)}&activity_type=push`);
    const match = rows.filter(x => x.after === identity.headSha && x.ref === `refs/heads/${identity.headRef}`);
    assert(match.length === 1 && Number.isSafeInteger(match[0].actor?.id), "HEAD_PUSH_ACTOR_UNAVAILABLE");
    const x = match[0]; return { id: x.id, actor: { id: x.actor.id, login: x.actor.login, type: x.actor.type }, after: x.after, before: x.before, timestamp: x.timestamp, trust: "GITHUB_API" };
  });
  const dismissals = await client.observe(async () => (await client.list(`${root}/issues/${identity.pr}/timeline`)).filter(x => x.event === "review_dismissed").map(x => ({ id: x.id, actorId: x.actor?.id || null,
    reviewId: x.dismissed_review?.review_id || null, head: x.dismissed_review?.dismissal_commit_id || null, at: x.created_at })));
  return { opinionated, activity, dismissals, initiator: { state: "UNAVAILABLE", reason: "GITHUB_INITIATING_HUMAN_UNAVAILABLE" },
    limitations: ["Permission is observed now, not at approval time.", "GitHub does not expose which approvals it counted.", "Push attribution does not establish who initiated an agent."] };
}
function graph(c, approval) {
  return { subject: c.identity.headSha, policyScope: { repositoryId: c.identity.repositoryId, baseRef: c.identity.baseRef },
    required: approval.required, counted: approval.current,
    reviews: (c.reviews.value || []).map(x => ({ id: x.id, actorId: x.userId, actorType: x.userType, sha: x.sha, state: x.state,
      permission: x.writePermission, classification: approval.current.some(a => a.id === x.id) ? "COUNTED" : "OBSERVED_NOT_COUNTED" })),
    provider: c.authority || { state: "UNAVAILABLE" },
    state: approval.state, currentnessAtMerge: "UNAVAILABLE", botApprovalPolicy: "Bot approvals are observed but not counted. The repository may permit them." };
}
module.exports = { collect, graph };
