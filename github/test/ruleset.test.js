'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {Client}=require('../client');
const {collect,collectRules}=require('../collect');
const {prove,freshness}=require('../proof');
const {requirements}=require('../rules');
const {fixtureFetch}=require('./fixtures');
const A=value=>({state:'AVAILABLE',value});
const active=[{type:'required_status_checks',ruleset_id:42,ruleset_source_type:'Organization',ruleset_source:'fixture',parameters:{required_status_checks:[{context:'test',integration_id:10}],strict_required_status_checks_policy:true}},{type:'pull_request',parameters:{required_approving_review_count:1,dismiss_stale_reviews_on_push:true}}];
function client({graphql, status=404, rules=active, mutate}={}){
 const f=fixtureFetch({mutate:(p,v)=>p.includes('/rules/branches/')?rules:mutate?mutate(p,v):v});
 const original=f.fetchImpl;
 f.fetchImpl=async(u,o)=>{
  const p=new URL(u).pathname;
  if(p.endsWith('/protection'))return new Response('{}',{status});
  if(p==='/graphql')return new Response(JSON.stringify(graphql===undefined?{data:{repository:{nameWithOwner:'fixture/public',ref:{name:'main',prefix:'refs/heads/',branchProtectionRule:null}}}}:graphql));
  return original(u,o);
 };
 return new Client(f);
}
test('ruleset-only checks/reviews prove satisfied and fail closed on real requirement failures',async()=>{
 const c=await collect(client(),'fixture/public',1);
 a.equal(c.rules.classic.value,null);a.equal(c.rules.active.value[0].ruleset_source,'fixture');
 const receipt=prove(c);a.equal(receipt.verdict,'VERIFIED');
 for(const change of [
  (p,v)=>p.endsWith('/check-runs')?{...v,check_runs:v.check_runs.map(x=>({...x,conclusion:'failure'}))}:v,
  (p,v)=>p.endsWith('/reviews')?[]:v,
 ]){const failed=await collect(client({mutate:change}),'fixture/public',1);a.equal(prove(failed).verdict, failed.checks.value.some(x=>x.conclusion==='failure')?'FAIL':'NOT_PROVEN');}
 const changed=await collect(client({rules:[...active,{type:'required_signatures'}]}),'fixture/public',1);
 a.equal(prove(changed).verdict,'NOT_PROVEN');a.equal(freshness(receipt,changed).state,'STALE');
 a.equal(prove(await collect(client(),'fixture/public',1)).verdict,'VERIFIED');
});
for(const [name,graphql] of [
 ['partial errors',{errors:[{message:'denied'}],data:{repository:{nameWithOwner:'fixture/public',ref:{name:'main',prefix:'refs/heads/',branchProtectionRule:null}}}}],
 ['missing repository',{data:{repository:null}}],['missing ref',{data:{repository:{nameWithOwner:'fixture/public',ref:null}}}],
 ['missing field',{data:{repository:{nameWithOwner:'fixture/public',ref:{name:'main',prefix:'refs/heads/'}}}}],
 ['existing classic rule',{data:{repository:{nameWithOwner:'fixture/public',ref:{name:'main',prefix:'refs/heads/',branchProtectionRule:{id:'rule'}}}}}],
 ['wrong ref',{data:{repository:{nameWithOwner:'fixture/public',ref:{name:'other',prefix:'refs/heads/',branchProtectionRule:null}}}}],
 ['wrong repository',{data:{repository:{nameWithOwner:'other/repo',ref:{name:'main',prefix:'refs/heads/',branchProtectionRule:null}}}}],
])test('classic absence requires complete exact-ref evidence: '+name,async()=>{const c=await collect(client({graphql}),'fixture/public',1);a.equal(c.rules.classic.state,'UNAVAILABLE');a.ok(prove(c).gaps.includes('RULES_UNAVAILABLE'));});
for(const status of [401,403,500])test('classic HTTP '+status+' cannot be waived by rulesets',async()=>{const c=await collect(client({status}),'fixture/public',1);a.ok(prove(c).gaps.includes('RULES_UNAVAILABLE'));});
test('ruleset and classic requirements intersect by context/app and maximum approvals',()=>{
 const r=requirements({classic:A({required_status_checks:{checks:[{context:'classic',app_id:8},{context:'test',app_id:20}],strict:true},required_pull_request_reviews:{required_approving_review_count:2}}),active:A(active)});
 a.deepEqual(r.checks,[{name:'classic',appId:8},{name:'test',appId:10},{name:'test',appId:20}]);a.equal(r.approvals,2);a.equal(r.strict,true);
});
test('unsupported/malformed rules never silently verify',async()=>{
 for(const rule of [{type:'required_deployments'},{type:'workflows'},{type:'code_scanning'},{type:'unknown'},{type:'required_status_checks',parameters:{}},{type:'required_status_checks',parameters:{required_status_checks:[null]}},{type:'pull_request',parameters:{}},{type:'merge_queue',parameters:{grouping_strategy:'ALLGREEN'}}]){
 const c=await collect(client({rules:[...active,rule]}),'fixture/public',1);a.equal(prove(c).verdict,'NOT_PROVEN',rule.type);
 }
});
test('applicable branch API receives the exact encoded ref, and pagination errors stay unavailable',async()=>{
 const paths=[];const c={observe:Client.prototype.observe,get:async()=>{throw Object.assign(Error(),{status:404})},list:async p=>{paths.push(p);throw Object.assign(Error(),{code:'PAGINATION_LIMIT'})}};
 const r=await collectRules(c,'fixture/public','release/a b',false);a.equal(paths[0],'/repos/fixture/public/rules/branches/release%2Fa%20b');a.equal(requirements(r).state,'UNAVAILABLE');
});
test('ruleset-only required receipt gate enforces failure and succeeds only with proven inputs',async()=>{
 const {NAME}=require('../check'),{gate}=require('../setup'),policy=require('../policy');
 const rules=[...active,{type:'required_status_checks',parameters:{required_status_checks:[{context:NAME,integration_id:99}]}}];
 for(const fail of [false,true]){
  const c=await collect(client({rules,mutate:(p,v)=>fail&&p.endsWith('/check-runs')?{...v,check_runs:v.check_runs.map(x=>({...x,conclusion:'failure'}))}:v}),'fixture/public',1);
  const g=gate(c.rules,99);a.equal(g.required,true);a.equal(g.boundToThisApp,true);
  const receipt=prove(c,{appId:99});
  const result=policy.evaluate(receipt,{state:'CURRENT'},{preset:'REPOSITORY_REQUIREMENTS'});
  a.equal(receipt.verdict,fail?'FAIL':'VERIFIED');a.equal(result.conclusion,fail?'failure':'success');
 }
});
