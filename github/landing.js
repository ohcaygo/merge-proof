"use strict";
const { hash, sha, assert, available, unavailable } = require("./common");
function compare(record, landed) {
  const receipt = record.proof?.receiptSnapshot;
  const target = receipt?.summary?.target?.value;
  const base = receipt?.identity?.baseSha, head = receipt?.identity?.headSha;
  const out = { state: "LANDED_UNRESOLVED", landed, proven: target || null,
    receiptId: receipt?.receiptId || null, receiptDigest: receipt ? hash(receipt) : null,
    currentnessAtMerge: "UNAVAILABLE", independentReconstruction: "UNAVAILABLE" };
  if (!receipt) return { ...out, state: "NO_PROOF_RECORDED", reason: "NO_PROOF_RECORDED" };
  if (receipt.verdict !== "VERIFIED" || head !== record.mergedHeadSha)
    return { ...out, reason: "NO_VERIFIED_PROOF_FOR_MERGED_HEAD" };
  if (!sha(target?.tree) || !sha(landed?.tree) || landed.sha !== record.mergeCommitSha)
    return { ...out, reason: "LANDED_CONTENT_UNAVAILABLE" };
  const parents = landed.parents || [];
  const method = parents.length === 2 ? "merge" : parents.length === 1 ? "squash-or-single-rebase" : "unknown";
  const selection=target.kind==='MERGE_GROUP'?target.selection?.value:null;
  const ordered=selection&&require('./queue-order').bound(selection.order,receipt.identity,selection);
  const parentBase=ordered?selection.baseSha:base;
  const parentsConsistent = parents[0] === parentBase && (parents.length === 1 || parents.length === 2 && parents[1] === head);
  if (landed.tree !== target.tree) return { ...out, state: "LANDED_MISMATCH", method, parentsConsistent, reason: "LANDED_TREE_DIFFERS_FROM_PROVEN_TREE" };
  if (!parentsConsistent) return { ...out, method, parentsConsistent, reason: "LANDED_PARENTAGE_UNRESOLVED" };
  if (receipt.expectedTree?.status === "RECONSTRUCTED" && !(receipt.expectedTree.flags || []).length && receipt.expectedTree.tree !== landed.tree)
    return { ...out, state: "LANDED_MISMATCH", method, parentsConsistent, reason: "LANDED_TREE_DIFFERS_FROM_EXPECTED_TREE" };
  return { ...out, state: "LANDED_VERIFIED", method, parentsConsistent,
    independentReconstruction: receipt.expectedTree?.status || "UNAVAILABLE",
    reason: "LANDED_TREE_EQUALS_PROVEN_TREE", trust: "GITHUB_API_CONTENT_IDENTIFIERS" };
}
async function resolve(client, record) {
  const root = `/repos/${record.repository}`;
  const commitResolution = await client.observe(async () => sha(record.mergeCommitSha)
    ? record.mergeCommitSha
    : require("./pull-commit").mergedCommit(client, { ...record, headSha: record.mergedHeadSha }));
  record = { ...record, mergeCommitSha: commitResolution.value || null };
  const content = await client.observe(async () => {
    assert(sha(record.mergeCommitSha), "LANDED_COMMIT_UNAVAILABLE");
    const c = await client.get(`${root}/git/commits/${record.mergeCommitSha}`);
    assert(c.sha === record.mergeCommitSha && sha(c.tree?.sha) && Array.isArray(c.parents), "LANDED_COMMIT_UNAVAILABLE");
    return { sha: c.sha, tree: c.tree.sha, parents: c.parents.map(p => p.sha) };
  });
  const binding = compare(record, content.value);
  const ruleSuite = await client.observe(async () => {
    const rows = await client.list(`${root}/rulesets/rule-suites?ref=${encodeURIComponent(`refs/heads/${record.baseRef}`)}&time_period=month`);
    const matches = rows.filter(r => r.after_sha === record.mergeCommitSha && r.repository_id === record.repositoryId && r.ref === `refs/heads/${record.baseRef}`);
    assert(matches.length === 1, "RULE_SUITE_UNAVAILABLE_OR_AMBIGUOUS");
    const r = await client.get(`${root}/rulesets/rule-suites/${matches[0].id}`);
    assert(r.after_sha === record.mergeCommitSha && r.repository_id === record.repositoryId && r.ref === `refs/heads/${record.baseRef}`, "RULE_SUITE_BINDING_MISMATCH");
    return { id: r.id, result: r.result, before: r.before_sha, after: r.after_sha,
      actorId: r.actor_id, pushedAt: r.pushed_at, trust: "GITHUB_API",
      evaluations: (r.rule_evaluations || []).map(x => ({ source: x.rule_source, enforcement: x.enforcement, result: x.result, type: x.rule_type })) };
  });
  const result = { ...binding, commitResolution, ruleSuite, bypass: ruleSuite.value?.result === "bypass" ? "BYPASS_OBSERVED" : "UNKNOWN_EXEMPT_OR_UNREADABLE",
    authorityLimitation: "Rule suites record observed evaluations. Exempt actors and decision-time authorization may remain unobservable.",
    recordedAt: new Date().toISOString() };
  return { ...result, attestation: { _type: "https://in-toto.io/Statement/v1",
    subject: sha(record.mergeCommitSha)?[{ name: record.repository, digest: { gitCommit: record.mergeCommitSha } }]:[],
    predicateType: "https://merge-proof.ohcaygo.com/attestation/landed-binding/v1",
    predicate: { receiptDigest: binding.receiptDigest, repositoryId: record.repositoryId, binding: result } } };
}
async function pushed(client, job, records) {
  const observation = await client.observe(async () => {
    assert(sha(job.before) && sha(job.after), "PUSH_RANGE_UNAVAILABLE");
    const range = await client.get(`/repos/${job.repository}/compare/${job.before}...${job.after}?per_page=100`);
    assert(Array.isArray(range.commits) && range.total_commits === range.commits.length && range.commits.length <= 100, "PUSH_RANGE_INCOMPLETE");
    return range.commits.map(c => ({ sha: c.sha, tree: c.commit?.tree?.sha || null, parents: (c.parents || []).map(p => p.sha) }));
  });
  return { ...job, observedAt: new Date().toISOString(), coverage: observation.state,
    reason: observation.reason || null,
    commits: (observation.value || []).map(commit => ({ ...commit,
      state: records.some(r => r.repositoryId === job.repositoryId && r.mergeCommitSha === commit.sha) ? "RECORDED_LANDING" : "NO_PROOF_RECORDED" })) };
}
module.exports = { compare, resolve, pushed };
