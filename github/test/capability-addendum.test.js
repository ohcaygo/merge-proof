"use strict";
const {test} = require('node:test'), a = require('node:assert/strict');
const {capture,H,B,OLD,fixtureFetch} = require('./fixtures');
const {available:A,unavailable:U,hash} = require('../common');
const {prove,freshness} = require('../proof');
const {Client} = require('../client'), {collect} = require('../collect');
function policy(path = '.github/workflows/ci.yml') {
  return {id:7,source:'fixture/public',sourceType:'Repository',enforcement:'active',updatedAt:'2026-09-09T00:00:00Z',
    conditions:{workflow_path:{include:[path],exclude:[]}}, rules:[
      {type:'restrict_action_events',parameters:{allowed_events:['pull_request']}},
      {type:'restrict_actions_actors',parameters:{allowed_actors:[{type:'User',id:1}]}}]};
}
function protectedCapture(){const c=capture();c.rules.executionProtections=A([policy()]);return c;}
// Deliberately normalized evidence fixtures, not fictitious REST responses.
// The collector cannot manufacture this aggregate from a green CI conclusion.
function covered(parameters={minimum_coverage:80,max_coverage_drop:2}) {
  const c=protectedCapture();c.rules.active.value.push({type:'code_coverage',ruleset_id:42,ruleset_source:'fixture/public',ruleset_source_type:'Repository',parameters});
  const j=c.execution.value[0];
  c.coverage=A({provider:'GITHUB_CODE_QUALITY',trust:'GITHUB_API',observationId:'coverage-fixture-1',repositoryId:1,pr:1,headSha:H,
    candidate:{sha:H,tree:c.target.value.tree}, measuredAt:c.observedAt,
    aggregate:{commit:H,covered:80,total:100,complete:true,scope:'ALL_REPORTS'},
    defaultBranch:{ref:'main',commit:B,covered:82,total:100,complete:true,scope:'ALL_REPORTS'},
    producers:[{...Object.fromEntries(['checkId','runId','attempt','jobId','workflowId','workflowPath','event'].map(k=>[k,j[k]])),workflowBlob:j.workflowBlob.value.sha}]});
  c.coverageContext=A({ref:'main',sha:B});return c;
}
test('eligible actor, event and exact workflow satisfy execution policy with GitHub trust',()=>{
 const r=prove(protectedCapture());a.equal(r.verdict,'VERIFIED');const ci=r.claims.find(c=>c.name==='CI_EXECUTED:test');a.equal(ci.trust,'GITHUB_API');a.equal(ci.producer[0].actor.id,1);a.equal(r.policySnapshot.raw.executionProtections.value.length,1);
});
test('wrong explicit actor and event are demonstrated unmet requirements only for a bound producer',()=>{
 for(const change of [c=>c.execution.value[0].actor.id=99,c=>c.rules.executionProtections.value[0].rules[0].parameters.allowed_events=['push']]){
  const c=protectedCapture();change(c);let r=prove(c);a.equal(r.verdict,'FAIL');a.equal(r.claims.find(x=>x.name==='CI_EXECUTED:test').state,'FALSE');
  c.execution.value[0].workflowId=null;a.equal(prove(c).verdict,'NOT_PROVEN');
 }
});
test('unavailable execution policy and unobservable actor membership never imply eligibility',()=>{
 for(const change of [c=>c.rules.executionProtections=U('403'),c=>delete c.rules.executionProtections,c=>c.execution.value[0].triggeringActor.id=99,c=>c.rules.executionProtections.value[0].enforcement="unknown",c=>c.rules.executionProtections.value[0].conditions.repository_property={unknown:true},c=>c.rules.executionProtections.value[0].rules[1].parameters.allowed_actors=[{type:'Team',id:1}],c=>delete c.rules.executionProtections.value[0].updatedAt,c=>delete c.execution.value[0].runStartedAt]){
 const c=protectedCapture();change(c);a.equal(prove(c).verdict,'NOT_PROVEN');}
});
test('policy changed after execution refuses historical satisfaction and stales only dependent claims',()=>{
 const c=protectedCapture();const r=prove(c),digest=hash(r);c.rules.executionProtections.value[0].updatedAt='2026-09-11T00:00:00Z';
 const current=freshness(r,c);a.deepEqual(current.changed,['CI_EXECUTED','RULES_SNAPSHOT']);a.equal(current.claims['CI_EXECUTED:test'].state,'STALE');a.equal(current.claims.APPROVAL_CURRENT.state,'CURRENT');
 a.equal(prove(c).verdict,'NOT_PROVEN');a.ok(prove(c).gaps.includes('EXECUTION_POLICY_CHANGED_AFTER_EVIDENCE'));a.equal(hash(r),digest);
});
test('irrelevant, disabled and evaluate policies are absent from receipt and currentness dependencies',()=>{
 const c=protectedCapture(),r=prove(c);c.rules.executionProtections.value.push({...policy('.github/workflows/deploy.yml'),id:8},{...policy(),id:9,enforcement:'disabled'},{...policy(),id:10,enforcement:'evaluate'});
 const next=prove(c);a.deepEqual(next.policySnapshot,r.policySnapshot);a.equal(freshness(r,c).state,'CURRENT');a.equal(next.evidence.rules.executionProtections.value.length,1);
});
test('policy currentness is specific to the affected workflow evidence claim',()=>{
 const c=protectedCapture();c.rules.classic.value.required_status_checks.checks.push({context:'lint',app_id:10});c.checks.value.push({...c.checks.value[0],name:'lint',id:11});
 c.execution.value.push({...structuredClone(c.execution.value[0]),checkId:11,jobId:41,runId:21,workflowId:31,workflowPath:'.github/workflows/lint.yml',workflowBlob:A({sha:OLD,path:'.github/workflows/lint.yml',commit:H})});
 const r=prove(c);a.equal(r.verdict,'VERIFIED');c.rules.executionProtections.value[0].rules[0].parameters.allowed_events=['push'];const f=freshness(r,c);
 a.equal(f.claims['CI_EXECUTED:test'].state,'STALE');a.equal(f.claims['CI_EXECUTED:lint'].state,'CURRENT');a.equal(f.claims.APPROVAL_CURRENT.state,'CURRENT');
});
test('same-name duplicate cannot substitute an unprotected producer or wrong event for required evidence',()=>{
 for(const swap of [false,true]){
  const c=protectedCapture();c.execution.value[0].actor.id=99;
  c.checks.value.push({...c.checks.value[0],id:11});c.execution.value.push({...structuredClone(c.execution.value[0]),actor:{id:1,type:'User'},checkId:11,jobId:41,runId:21,workflowId:31,workflowPath:'.github/workflows/other.yml'});
  if(swap){c.checks.value.reverse();c.execution.value.reverse();}a.equal(prove(c).verdict,'NOT_PROVEN');
 }
 const c=protectedCapture();c.execution.value[0].event='workflow_dispatch';a.equal(prove(c).verdict,'NOT_PROVEN');
});
test('coverage minimum and percentage-point drop are satisfied at exact boundaries',()=>{
 const c=covered(),r=prove(c);a.equal(r.verdict,'VERIFIED');a.equal(r.claims.find(x=>x.name==='CODE_COVERAGE:42').state,'TRUE');a.equal(r.summary.coverage[0].provenance.aggregate.covered,80);
});
test('demonstrated minimum or drop violation is FAIL, not a generic unavailable result',()=>{
 for(const parameters of [{minimum_coverage:80},{max_coverage_drop:2},{minimum_coverage:80,max_coverage_drop:2}]){
  const c=covered(parameters);c.coverage.value.aggregate.covered=79;const r=prove(c);a.equal(r.verdict,'FAIL');a.equal(r.claims.find(x=>x.name==='CODE_COVERAGE:42').state,'FALSE');
 }
});
test('missing, incomplete, ambiguous or unbound coverage evidence is NOT_PROVEN',()=>{
 for(const change of [c=>delete c.coverage,c=>c.coverage=U('403'),c=>c.coverage.value.aggregate.complete=false,c=>c.coverage.value.aggregate.total=0,c=>c.coverage.value.aggregate.covered=101,c=>c.coverage.value.candidate.sha=OLD,c=>c.coverage.value.aggregate.commit=OLD,c=>c.coverage.value.pr=2,c=>c.coverage.value.repositoryId=2,c=>c.coverage.value.producers[0].runId=99,c=>c.coverage.value.producers[0].event='push',c=>c.coverage.value.producers.push(c.coverage.value.producers[0]),c=>c.coverage.value.defaultBranch.commit=OLD,c=>c.coverage.value.defaultBranch.ref='release',c=>delete c.coverageContext,c=>c.coverage.value.measuredAt='2026-09-11T00:00:00Z']){
  const c=covered();change(c);a.equal(prove(c).verdict,'NOT_PROVEN');
 }
});
test('coverage policy changes only stale coverage and policy claims; unrelated CI and approval stay current',()=>{
 const c=covered(),r=prove(c),before=hash(r);c.rules.active.value[0].parameters.minimum_coverage=81;const f=freshness(r,c);
 a.deepEqual(f.changed,['RULES_SNAPSHOT','CODE_COVERAGE']);a.equal(f.claims['CODE_COVERAGE:42'].state,'STALE');a.equal(f.claims['CI_EXECUTED:test'].state,'CURRENT');a.equal(f.claims.APPROVAL_CURRENT.state,'CURRENT');a.equal(prove(c).verdict,'FAIL');a.equal(hash(r),before);
});
test('disabled zero thresholds need no coverage measurements and do not bind unused baseline metrics',()=>{
 const c=covered({minimum_coverage:0,max_coverage_drop:0});delete c.coverage;delete c.coverageContext;a.equal(prove(c).verdict,'VERIFIED');
 const min=covered({minimum_coverage:80}),r=prove(min);min.coverage.value.defaultBranch.covered=1;min.coverageContext.value.sha=OLD;a.equal(freshness(r,min).state,'CURRENT');
});
test('coverage cannot evade producer ambiguity, wrong event, denied execution or policy currentness',()=>{
 for(const change of [c=>c.execution.value[0].event='push',c=>c.execution.value[0].actor.id=99,c=>c.rules.executionProtections.value[0].updatedAt='2026-09-11T00:00:00Z',c=>{c.checks.value.push({...c.checks.value[0],id:11});c.execution.value.push({...structuredClone(c.execution.value[0]),checkId:11,workflowId:31});}]){
  const c=covered(),r=prove(c);change(c);a.notEqual(prove(c).verdict,'VERIFIED');a.equal(prove(c).claims.find(x=>x.name==='CODE_COVERAGE:42').state,'UNKNOWN');a.equal(freshness(r,c).claims['CODE_COVERAGE:42'].state,'STALE');
 }
});
test('1000 bounded coverage/threshold fixtures agree with integer inequality and never round up',()=>{
 for(let n=1;n<=1000;n++){
  const total=n*17+1,coveredLines=(n*31)%total,threshold=(n%99)+1,c=covered({minimum_coverage:threshold});Object.assign(c.coverage.value.aggregate,{covered:coveredLines,total});
  a.equal(prove(c).verdict,100*coveredLines>=threshold*total?'VERIFIED':'FAIL');
 }
 const c=covered({minimum_coverage:33.333333333333336});Object.assign(c.coverage.value.aggregate,{covered:1,total:3});a.equal(prove(c).verdict,'FAIL');
});
test('collector discovers policy details read-only and refuses unknown coverage without a fabricated metrics endpoint',async()=>{
 const source=fixtureFetch({mutate:(p,v)=>p.endsWith('/rules/branches/main')?[{type:'code_coverage',ruleset_id:42,parameters:{minimum_coverage:80}}]:v});
 const c=await collect(new Client(source),'fixture/public',1);a.equal(c.coverage.reason,'GITHUB_COVERAGE_BOUND_AGGREGATE_API_UNAVAILABLE');a.equal(prove(c).verdict,'NOT_PROVEN');a.ok(source.calls.every(c=>c.method==='GET'||c.method==='POST'&&c.path==='/graphql'));
 a.ok(!source.calls.some(c=>c.path.includes('code-coverage')));
});
test('portable receipt replays policy, producer and coverage claims without promoting provider trust',async()=>{
 const bundle=require('../bundle'),r=prove(covered()),b=await bundle.create(r);a.equal(bundle.verify(b,{allowUnsigned:true}).exitCode,0);b.receipt.evidence.coverage.value.aggregate.covered=99;a.equal(bundle.verify(b,{allowUnsigned:true}).exitCode,3);
});
