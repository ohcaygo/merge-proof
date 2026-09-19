"use strict";
const { test } = require("node:test"), a = require("node:assert/strict");
const { Client } = require("../client"), { collect } = require("../collect");
const { mergedCommit } = require("../pull-commit");
const { fixtureFetch, H, B, M, OLD } = require("./fixtures");
const scope = { repository: "fixture/public", repositoryId: 1, pr: 1, headSha: H, baseRef: "main" };
const response = () => ({ data: { repository: { databaseId: 1, nameWithOwner: "fixture/public",
  pullRequest: { number: 1, headRefOid: H, baseRefName: "main", merged: true, state: "MERGED", mergeCommit: { oid: M } } } } });
test("REST 2026 merged commit resolves from exact GraphQL subject", async () => {
  a.equal(await mergedCommit(new Client({ fetchImpl: async () => Response.json(response()) }), scope), M);
});
for (const [name, change] of Object.entries({
  repositoryId: r => r.data.repository.databaseId++,
  repositoryName: r => r.data.repository.nameWithOwner = "other/public",
  pr: r => r.data.repository.pullRequest.number++,
  head: r => r.data.repository.pullRequest.headRefOid = OLD,
  base: r => r.data.repository.pullRequest.baseRefName = "other",
  merged: r => r.data.repository.pullRequest.merged = false,
  state: r => r.data.repository.pullRequest.state = "OPEN",
  commit: r => r.data.repository.pullRequest.mergeCommit = null,
  partial: r => r.errors = [{ message: "partial response" }],
})) test(`merged commit rejects ${name} ambiguity or mismatch`, async () => {
  const r = response(); change(r);
  const client = new Client({ fetchImpl: async () => Response.json(r) });
  await a.rejects(mergedCommit(client, scope), /MERGED_COMMIT_BINDING_UNAVAILABLE/);
});
for (const wrongParents of [false, true]) test(`REST 2026 PR merge ref requires exact ordered parents (wrong=${wrongParents})`, async () => {
  const c = await collect(new Client(fixtureFetch({ mergeBase: OLD, mutate: (p, v) => {
    if (p.endsWith("/pulls/1")) delete v.merge_commit_sha;
    if (wrongParents && p.endsWith(`/commits/${M}`)) v.parents = [{ sha: OLD }, { sha: H }];
    return v;
  } })), "fixture/public", 1);
  a.equal(c.target.state, wrongParents ? "UNAVAILABLE" : "AVAILABLE");
  if (!wrongParents) { a.equal(c.target.value.sha, M); a.equal(c.target.value.baseSha, B); }
});
test("REST 2026 historical collection uses bound landed commit", async () => {
  const f = fixtureFetch({ mutate: (p, v) => {
    if (p.endsWith("/pulls/1")) { delete v.merge_commit_sha; v.merged = true; v.state = "closed"; }
    return v;
  } });
  const original = f.fetchImpl;
  f.fetchImpl = (url, init) => new URL(url).pathname === "/graphql"
    ? Promise.resolve(Response.json(response())) : original(url, init);
  const c = await collect(new Client(f), "fixture/public", 1, { historical: true });
  a.equal(c.identity.mergeCommitSha, M); a.equal(c.target.value.sha, M);
});
test("unresolved merged commit cannot produce a landed verification", async () => {
  const record = { ...scope, mergedHeadSha: H, mergeCommitSha: null, proof: { receiptSnapshot: {
    verdict: "VERIFIED", identity: { baseSha: B, headSha: H }, summary: { target: { value: { tree: M } } },
  } } };
  const client = new Client({ fetchImpl: async () => Response.json({ errors: [{ message: "unavailable" }] }) });
  const result = await require("../landing").resolve(client, record);
  a.equal(result.state, "LANDED_UNRESOLVED"); a.equal(result.commitResolution.state, "UNAVAILABLE");
  a.equal(record.mergeCommitSha, null);
});
