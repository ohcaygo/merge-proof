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
    x => x.id === check.id && x.head_sha === check.sha && x.app?.id === check.appId && x.name === check.name,
    x => x.status === check.status && x.conclusion === check.conclusion);
  for (const j of new Map((c.execution.value || []).map(x => [`${x.runId}:${x.attempt}`, x])).values())
    await inspect("WORKFLOW_ATTEMPT", `${j.runId}:${j.attempt}`, `${root}/actions/runs/${j.runId}/attempts/${j.attempt}`,
      x => x.id === j.runId && x.run_attempt === j.attempt && x.head_sha === j.runSha && x.workflow_id === j.workflowId && x.event === j.event &&
        (!j.actor || x.actor?.id === j.actor.id && x.actor?.type === j.actor.type) &&
        (!j.triggeringActor || x.triggering_actor?.id === j.triggeringActor.id && x.triggering_actor?.type === j.triggeringActor.type) &&
        (!j.runStartedAt || x.run_started_at === j.runStartedAt),
      x => x.conclusion === j.runConclusion);
  for (const r of c.reviews.value || []) await inspect("REVIEW", r.id, `${root}/pulls/${c.identity.pr}/reviews/${r.id}`,
    x => x.id === r.id && x.commit_id === r.sha && x.user?.id === r.userId, x => x.state === r.state);
  for (const [kind, commit, tree] of [["CANDIDATE", c.target.value?.sha, c.target.value?.tree], ["HEAD", c.identity.headSha, c.git.value?.headTree]])
    if (commit) await inspect(kind, commit, `${root}/git/commits/${commit}`, x => x.sha === commit && (!tree || x.tree?.sha === tree));
  for (const j of c.execution.value || []) {
    await inspect("WORKFLOW_JOB",j.jobId,`${root}/actions/jobs/${j.jobId}`,
      x=>x.id===j.jobId&&x.run_id===j.runId&&x.head_sha===j.sha,
      x=>x.status===j.status&&x.conclusion===j.conclusion&&require("./common").hash((x.steps||[]).map(s=>({number:s.number,status:s.status,conclusion:s.conclusion,startedAt:s.started_at,completedAt:s.completed_at})))===require("./common").hash(j.steps));
  }
  for(const j of new Map((c.execution.value||[]).filter(j=>j.workflowBlob?.state==="AVAILABLE").map(j=>[`${j.workflowPath}:${j.workflowBlob.value.commit}`,j])).values())
    await inspect("WORKFLOW_BLOB",j.workflowBlob.value.sha,`${root}/contents/${j.workflowPath.split("/").map(encodeURIComponent).join("/")}?ref=${j.workflowBlob.value.commit}`,
      x=>x.sha===j.workflowBlob.value.sha&&x.path===j.workflowPath);
  await inspect("HEAD_REF",c.identity.headRef,`/repos/${c.identity.headRepository}/git/ref/heads/${c.identity.headRef.split("/").map(encodeURIComponent).join("/")}`,
    x=>x.ref===`refs/heads/${c.identity.headRef}`,x=>x.object?.sha===c.identity.headSha);
  await inspect("BASE_REF",c.identity.baseRef,`${root}/git/ref/heads/${c.identity.baseRef.split("/").map(encodeURIComponent).join("/")}`,
    x=>x.ref===`refs/heads/${c.identity.baseRef}`,x=>x.object?.sha===c.identity.baseSha);
  if(c.target.value?.ref)await inspect("TARGET_REF",c.target.value.ref,`${root}/git/ref/${c.target.value.ref.slice(5).split("/").map(encodeURIComponent).join("/")}`,
    x=>x.ref===c.target.value.ref,x=>x.object?.sha===c.target.value.sha);
  try {
    const rules=await require("./collect").collectRules(client,c.identity.repository,c.identity.baseRef,c.identity.branchProtected);
    rows.push({kind:"CURRENT_RULES",state:rules.classic.state!=="AVAILABLE"||rules.active.state!=="AVAILABLE"?"UNAVAILABLE":require("./common").hash(rules)===require("./common").hash({classic:c.rules.classic,active:c.rules.active})?"MATCH":"EXPECTED_CHANGE"});
  }catch{rows.push({kind:"CURRENT_RULES",state:"UNAVAILABLE"});}
  if (c.rules.executionProtections) {
    let observed;
    const policy = require("./rules");
    try { observed = await policy.executionProtections(client,c.identity.repository); }
    catch { observed = {state:"UNAVAILABLE"}; }
    const fresh = { ...c, rules: { ...c.rules, executionProtections: observed } }, jobs = policy.relevantJobs(c);
    rows.push({kind:"CURRENT_EXECUTION_PROTECTIONS",state:observed.state!=="AVAILABLE"?"UNAVAILABLE":
      require("./common").hash(policy.executionPolicyBinding(fresh,jobs))===require("./common").hash(policy.executionPolicyBinding(c,jobs))?"MATCH":"EXPECTED_CHANGE"});
  }
  if (receipt.summary.coverage?.some(x=>x.provenance)) rows.push({kind:"CODE_COVERAGE",state:"UNAVAILABLE",reason:"GITHUB_COVERAGE_BOUND_AGGREGATE_API_UNAVAILABLE"});
  for(const l of bundle.landings||[])if(l.observation.landed?.sha)await inspect("LANDED_COMMIT",l.observation.landed.sha,`${root}/git/commits/${l.observation.landed.sha}`,
    x=>x.sha===l.observation.landed.sha&&x.tree?.sha===l.observation.landed.tree&&require("./common").hash((x.parents||[]).map(p=>p.sha))===require("./common").hash(l.observation.landed.parents));
  const divergence = rows.some(x => x.state === "DIVERGED");
  return { state: divergence ? "REVERIFICATION_DIVERGED" : rows.every(x => x.state === "MATCH") ? "CONSISTENT_AND_REVERIFIED_ONLINE" : "PARTIALLY_REVERIFIED",
    rows, exitCode: divergence ? 5 : 0,
    limitation: "Provider records are assertions. Missing records do not prove retention expiry; changed mutable state does not impeach a historical receipt. Rules and permissions at issue cannot be re-observed." };
}
module.exports = { online };

// Optional independent verification uses caller-supplied bare Git objects and
// the exact recorded binary pin. It never fetches missing objects or updates refs.
function independent(bundle, directory, binary = "/usr/bin/git") {
  const c = bundle.receipt.evidence, expected = bundle.receipt.expectedTree;
  const rows = [];
  const config = { binary, version: expected?.gitVersion, sha256: expected?.gitBinaryDigest, offline: true };
  if (expected?.status !== "RECONSTRUCTED" || !config.version || !config.sha256)
    return { state: "INDEPENDENT_VERIFICATION_UNAVAILABLE", reason: "RECONSTRUCTION_PIN_OR_CLAIM_UNAVAILABLE", rows, exitCode: 2 };
  try {
    const {engine,reconstruct} = require('./reconstruct');
    const g = engine(directory,config);
    const inspect = (kind, expectedValue, read) => {
      try { const actual=read(); rows.push({kind,state:JSON.stringify(actual)===JSON.stringify(expectedValue)?'MATCH':'DIVERGED',expected:expectedValue,actual}); }
      catch { rows.push({kind,state:'OBJECT_UNAVAILABLE'}); }
    };
    if(c.git.value?.headTree) inspect('HEAD_TREE',c.git.value.headTree,()=>g.tree(c.identity.headSha));
    if(c.git.value?.baseTree) inspect('BASE_TREE',c.git.value.baseTree,()=>g.tree(c.identity.baseSha));
    inspect('CANDIDATE_TREE',c.target.value?.tree,()=>g.tree(c.target.value.sha));
    inspect('MERGE_BASE_CONTAINMENT',true,()=>g.get(['merge-base','--all',c.identity.baseSha,c.identity.headSha]).split('\n').includes(c.git.value?.mergeBase));
    if(c.target.value?.kind==='PR_TEST_MERGE') inspect('TEST_MERGE_PARENTS',[c.identity.baseSha,c.identity.headSha],()=>g.get(['rev-list','--parents','-n','1',c.target.value.sha]).split(' ').slice(1));
    if(c.target.value?.kind==='MERGE_GROUP') for(const [kind,ancestor] of [['GROUP_HEAD_ANCESTRY',c.identity.headSha],['GROUP_BASE_ANCESTRY',c.identity.baseSha]])
      inspect(kind,true,()=>{const result=g.run(['merge-base','--is-ancestor',ancestor,c.target.value.sha]);require('./common').assert(result.code===0 || result.code===1,'ANCESTRY_OBJECT_UNAVAILABLE');return result.code===0;});
    const recomputed = reconstruct(directory,{base:c.identity.baseSha,head:c.identity.headSha,method:expected.method,
      providerTree:c.target.value?.tree, ...(expected.method==='queue'?{entries:expected.steps.map(x=>({head:x.head,candidate:x.candidate,tree:x.providerTree})),providerOrderConfirmed:true}:{})},config);
    if(recomputed.status==='RECONSTRUCTED') rows.push({kind:'EXPECTED_TREE',state:recomputed.tree===expected.tree?'MATCH':'DIVERGED',expected:expected.tree,actual:recomputed.tree});
    else rows.push({kind:'EXPECTED_TREE',state:'OBJECT_OR_RECONSTRUCTION_UNAVAILABLE',reason:recomputed.reason});
    for(const [n,step] of (expected.steps||[]).entries())if(step.candidate){
      inspect('QUEUE_CANDIDATE_TREE',step.providerTree,()=>g.tree(step.candidate));
      const actual=recomputed.steps?.[n];rows.push({kind:'QUEUE_EXPECTED_STEP',state:actual&&actual.tree===step.tree&&actual.comparison===step.comparison?'MATCH':'DIVERGED',candidate:step.candidate});
    }
    for(const value of bundle.landings||[]) {
      const landed=value.observation.landed;
      if(!landed?.sha){rows.push({kind:'LANDED_TREE',state:'OBJECT_UNAVAILABLE'});continue;}
      inspect('LANDED_TREE',landed.tree,()=>g.tree(landed.sha));
      inspect('LANDED_PARENTS',landed.parents,()=>g.get(['rev-list','--parents','-n','1',landed.sha]).split(' ').slice(1));
    }
    const diverged=rows.some(x=>x.state==='DIVERGED'), complete=rows.every(x=>x.state==='MATCH');
    return {state:diverged?'INDEPENDENT_VERIFICATION_DIVERGED':complete?'INDEPENDENTLY_RECOMPUTED':'INDEPENDENT_VERIFICATION_UNAVAILABLE',rows,recomputed,
      flags:recomputed.flags,exitCode:diverged?5:complete?0:2,
      limitation:'Recomputes the recorded inputs with the pinned Git. Provider queue membership/order, checks, reviews and permissions remain provider-trusted; caveats are preserved.'};
  } catch(e) {return {state:'INDEPENDENT_VERIFICATION_UNAVAILABLE',reason:e.code||'GIT_OBJECTS_UNAVAILABLE',rows,exitCode:2};}
}
module.exports.independent = independent;
