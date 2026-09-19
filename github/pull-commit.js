"use strict";
const { assert, sha, repoName } = require("./common");

// REST 2026-03-10 removed merge_commit_sha. Resolve a landed commit only
// from the same repository, PR, head, base ref and merged state. This is a
// later observation; callers must not rewrite the decision-time ledger.
async function mergedCommit(client, { repository, repositoryId, pr, headSha, baseRef }) {
  assert(repoName(repository) && Number.isSafeInteger(repositoryId) &&
    Number.isSafeInteger(pr) && pr > 0 && sha(headSha) && typeof baseRef === "string",
  "MERGED_COMMIT_SCOPE_UNAVAILABLE");
  const [owner, name] = repository.split("/");
  const result = await client.request("/graphql", { method: "POST", body: {
    query: "query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){databaseId nameWithOwner pullRequest(number:$pr){number headRefOid baseRefName merged state mergeCommit{oid}}}}",
    variables: { owner, name, pr },
  } });
  const r = result.data?.repository, p = r?.pullRequest;
  assert(!result.errors && r?.databaseId === repositoryId &&
    r?.nameWithOwner?.toLowerCase() === repository.toLowerCase() &&
    p?.number === pr && p?.headRefOid === headSha && p?.baseRefName === baseRef &&
    p?.merged === true && p?.state === "MERGED" && sha(p?.mergeCommit?.oid),
  "MERGED_COMMIT_BINDING_UNAVAILABLE");
  return p.mergeCommit.oid;
}
module.exports = { mergedCommit };
