'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
const {withPolicyReader,executionPolicyReader}=require('../policy-reader');
const {collect}=require('../collect'),{prove}=require('../proof'),{Client}=require('../client'),{fixtureFetch}=require('./fixtures');
const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
function harness(change={}) {
 const calls=[],scope={repository:'fixture/public',repositoryId:1,accountId:20,primaryInstallationId:2,companionInstallationId:3};
 let enabled=true;
 const authorize=async()=>({enabled,...scope,authorizedByUserId:5,authorizedAt:'2026-01-01T00:00:00Z',...change.grant});
 const installation={id:3,app_id:4,account:{id:20},suspended_at:null,repository_selection:'selected',permissions:{administration:'write',metadata:'read'},...change.installation};
 const issued={token:'fixture-only-companion-token',expires_at:new Date(Date.now()+60000).toISOString(),permissions:{administration:'write',metadata:'read'},repositories:[{id:1,full_name:'fixture/public'}],...change.issued};
 const options={app:{appId:4,privateKey},scope,authorize,fetchImpl:async(url,init)=>{
   calls.push({url,method:init.method,body:init.body,authorization:init.headers.Authorization,redirect:init.redirect});
   if(url.endsWith('/app/installations/3'))return Response.json(installation);
   if(url.endsWith('/app/installations/3/access_tokens'))return Response.json(issued);
   if(url.endsWith('/installation/token'))return new Response(null,{status:change.revokeStatus||204});
   a.equal(init.method,'GET');a.equal(init.body,undefined);a.equal(init.redirect,'error');
   if(change.policy)return change.policy(url,init);
   return Response.json({total_count:0,policies:[]});
 }};
 return {calls,options,revoke:()=>{enabled=false;}};
}
test('companion exposes only a repository policy capability, mints one-repo token and revokes it',async()=>{
 const h=harness();let saved;
 await withPolicyReader(h.options,async r=>{saved=r;a.ok(Object.isFrozen(r));a.deepEqual(Object.keys(r).sort(),['get','list','observe','request']);a.equal(r.token,undefined);a.equal(r.fetch,undefined);a.deepEqual(await r.list('/repos/fixture/public/actions/policies?has_parents=true','policies'),[]);});
 const minted=h.calls.find(x=>x.method==='POST');a.deepEqual(JSON.parse(minted.body),{repository_ids:[1],permissions:{administration:'write',metadata:'read'}});
 a.equal(h.calls.at(-1).url,'https://api.github.com/installation/token');a.equal(h.calls.at(-1).method,'DELETE');
 await a.rejects(saved.get('/repos/fixture/public/actions/policies'),{code:'POLICY_READER_CLOSED'});
});
test('every non-GET method and non-policy administrative path is refused before network I/O',async()=>{
 const h=harness();let denied=0;
 await withPolicyReader(h.options,async r=>{
   const paths=['/repos/fixture/public','/repos/fixture/public/transfer','/repos/fixture/public/collaborators/someone','/repos/fixture/public/keys','/repos/fixture/public/branches/main/protection','/repos/fixture/public/rulesets','/repos/fixture/public/actions/policies','/repos/fixture/public/actions/policies/7'];
   for(const path of paths)for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS','get']){
     const before=h.calls.length;await a.rejects(r.request(path,{method}),{code:'POLICY_READ_ONLY'});a.equal(h.calls.length,before);denied++;
   }
   for(const path of paths.slice(0,6)){const before=h.calls.length;await a.rejects(r.get(path),{code:'POLICY_READ_ONLY'});a.equal(h.calls.length,before);}
   await a.rejects(r.request('/repos/fixture/public/actions/policies',{method:'GET',body:{}}),{code:'POLICY_READ_ONLY'});
 });a.equal(denied,56);a.equal(h.calls.filter(x=>x.url.includes('/repos/')).length,0);
});
test('foreign repository, parent scope, URL alias, encoded traversal and query overrides cannot carry the credential',async()=>{
 const h=harness();
 await withPolicyReader(h.options,async r=>{for(const path of [
   '/repos/fixture/other/actions/policies','/orgs/fixture/actions/policies/7','/enterprises/fixture/actions/policies/7',
   'https://api.github.com/repos/fixture/public/actions/policies','https://example.invalid/actions/policies','//example.invalid/actions/policies',
   '/repos/fixture/public/actions/policies/../rulesets','/repos/fixture/public/actions/policies/%2e%2e/rulesets',
   '/repos/fixture/public/actions/policies?has_parents=false','/repos/fixture/public/actions/policies?page=1&page=2',
   '/repos/fixture/public/actions/policies?per_page=1000','/repos/fixture/public/actions/policies?page=6',
   '/repos/fixture/public/actions/policies?redirect=https://example.invalid','/repos/fixture/public/actions/policies#x',
   '/repos/fixture/public/actions/policies/7?has_parents=true']){const before=h.calls.length;await a.rejects(r.get(path),{code:'POLICY_READ_ONLY'});a.equal(h.calls.length,before);}});
});
test('no opt-in or cross-account/repository/installation consent mints no token',async()=>{
 for(const grant of [{enabled:false},{accountId:21},{repositoryId:2},{primaryInstallationId:9},{companionInstallationId:9},{authorizedByUserId:null},{authorizedAt:'bad'}]){
  const h=harness({grant});await a.rejects(withPolicyReader(h.options,()=>{}),{code:'ENHANCED_POLICY_NOT_AUTHORIZED'});a.equal(h.calls.length,0);
 }
});
test('wrong App/account, suspension, all-repository selection or broadened companion grant refuses before token issuance',async()=>{
 for(const installation of [{app_id:99},{account:{id:99}},{suspended_at:'2026-01-01T00:00:00Z'},{repository_selection:'all'},{permissions:{administration:'read',metadata:'read'}},{permissions:{administration:'write',metadata:'read',contents:'write'}}]){
  const h=harness({installation});await a.rejects(withPolicyReader(h.options,()=>{}),{code:'COMPANION_INSTALLATION_NOT_BOUND'});a.equal(h.calls.length,1);
 }
});
test('broadened or expired token is revoked without use, including wrong immutable repository identity',async()=>{
 for(const issued of [{permissions:{administration:'write',metadata:'read',checks:'write'}},{repositories:[{id:2,full_name:'fixture/public'}]},{repositories:[{id:1,full_name:'fixture/other'}]},{repositories:[]},{expires_at:'2020-01-01T00:00:00Z'}]){
  const h=harness({issued});await a.rejects(withPolicyReader(h.options,()=>{}),{code:'COMPANION_TOKEN_NOT_BOUND'});a.equal(h.calls.at(-1).method,'DELETE');a.equal(h.calls.filter(x=>x.url.includes('/repos/')).length,0);
 }
});
test('revoked consent stops subsequent policy reads and cleanup still revokes the token',async()=>{
 const h=harness();await withPolicyReader(h.options,async r=>{await r.get('/repos/fixture/public/actions/policies');h.revoke();const before=h.calls.length;await a.rejects(r.get('/repos/fixture/public/actions/policies'),{code:'ENHANCED_POLICY_NOT_AUTHORIZED'});a.equal(h.calls.length,before);});a.equal(h.calls.at(-1).method,'DELETE');
});
test('unreadable inherited policy and revocation failure remain unavailable',async()=>{
 const h=harness({policy:()=>Response.json({total_count:1,policies:[{id:7,_links:{self:{href:'https://api.github.com/orgs/fixture/actions/policies/7'}}}]})});
 const out=await executionPolicyReader(h.options)({repository:'fixture/public',repositoryId:1});a.equal(out.state,'UNAVAILABLE');a.equal(out.reason,'POLICY_READ_ONLY');a.ok(!h.calls.some(x=>x.url.includes('/orgs/')));
 const fail=harness({revokeStatus:500});a.equal((await executionPolicyReader(fail.options)({repository:'fixture/public',repositoryId:1})).state,'UNAVAILABLE');
});
test('dedicated collection seam preserves Read default and cannot turn missing policy or coverage evidence green',async()=>{
 let coverageRequired=false;const primaryFixture=fixtureFetch({mutate:(p,v)=>p.endsWith('/rules/branches/main')&&coverageRequired?[...v,{type:'code_coverage',ruleset_id:42,ruleset_source:'fixture/public',ruleset_source_type:'Repository',parameters:{minimum_coverage:80,max_coverage_drop:0}}]:v}),primary=[];
 const fresh=()=>new Client({token:'primary-read',fetchImpl:async(url,init)=>{primary.push({url,method:init.method,authorization:init.headers.Authorization});if(new URL(url).pathname.endsWith('/actions/policies'))return Response.json({message:'denied'},{status:403});return primaryFixture.fetchImpl(url,init);}});
 a.equal(prove(await collect(fresh(),'fixture/public',1)).verdict,'NOT_PROVEN');
 const h=harness();const capture=await collect(fresh(),'fixture/public',1,{executionPolicyReader:executionPolicyReader(h.options)});
 a.equal(prove(capture).verdict,'VERIFIED');a.equal(capture.coverage.value,null);a.ok(primary.every(x=>x.authorization==='Bearer primary-read'));a.equal(h.calls.filter(x=>x.method==='POST').length,2);
 coverageRequired=true;const covered=await collect(fresh(),'fixture/public',1,{executionPolicyReader:executionPolicyReader(h.options)});a.equal(covered.coverage.state,'UNAVAILABLE');a.equal(prove(covered).verdict,'NOT_PROVEN');coverageRequired=false;
 const denied=harness({grant:{enabled:false}});a.equal(prove(await collect(fresh(),'fixture/public',1,{executionPolicyReader:executionPolicyReader(denied.options)})).verdict,'NOT_PROVEN');
 a.equal((await executionPolicyReader(h.options)({repository:'fixture/public',repositoryId:99})).reason,'ENHANCED_POLICY_SCOPE_MISMATCH');
});
test('standard App token remains Administration Read',async()=>{
 let body;await require('../app').installationClient({appId:4,privateKey},2,1,async(url,init)=>{body=JSON.parse(init.body);return Response.json({token:'primary-read',expires_at:new Date(Date.now()+60000).toISOString()});});a.equal(body.permissions.administration,'read');
});
