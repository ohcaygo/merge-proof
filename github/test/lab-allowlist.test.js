"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {run}=require("../lab/run");
test("validation organization requires exact explicit repository and owner IDs before any collection",async t=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),"mp-lab-scope-"));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const declared={repository:"isolated-validation/merge-proof-l3-lab-rulesets",repositoryId:5,ownerId:7};
 const config={output,authorizedRepositories:[declared],fixtures:[{...declared,pr:1,expected:"NOT_PROVEN"}]};
 let calls=0;
 const factory=async()=>({authorize:async()=>{calls++;return {owner:{id:8}};},get(){throw Error("collection must not run");}});
 const report=await run(config,{clientFactory:factory});a.equal(report.results[0].reason,"LAB_OWNER_ID_MISMATCH");a.equal(calls,1);
 for(const authorizedRepositories of [[],{},[declared,declared],[{...declared,ownerId:0}],[{...declared,repository:"isolated-validation/production"}]])await a.rejects(run({...config,authorizedRepositories},{clientFactory:factory}),{code:"LAB_ALLOWLIST_INVALID"});
 await a.rejects(run({...config,fixtures:[{...config.fixtures[0],repositoryId:6}]},{clientFactory:factory}),{code:"OWNED_SYNTHETIC_FIXTURE_REQUIRED"});
 await a.rejects(run({...config,authorizedRepositories:undefined},{clientFactory:factory}),{code:"OWNED_SYNTHETIC_FIXTURE_REQUIRED"});a.equal(calls,1);
});
test("scheduled runner reads the selected Read installation before minting an exact repository token",async t=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),"mp-scheduled-"));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const {clientFactory}=require("../lab/scheduled"),{Client}=require("../client"),calls=[];
 const app={appId:42,privateKey:require("node:crypto").generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"}),mergeQueues:true,publishChecks:false};
 let permissions={contents:"read",pull_requests:"read",checks:"read",statuses:"read",actions:"read",administration:"read"},tokenBodies=[];
 const fetchImpl=async(url,init)=>{const p=new URL(url).pathname;calls.push({p,method:init.method});
  if(p==="/app/installations/2")return Response.json({app_id:42,repository_selection:"selected",permissions,suspended_at:null});
  if(p==="/app/installations/2/access_tokens"){const body=JSON.parse(init.body);tokenBodies.push(body);a.deepEqual(body.repository_ids,[5]);if(!Object.entries(body.permissions).every(([name,access])=>permissions[name]===access))return Response.json({message:"requested permission exceeds installation grant"},{status:422});return Response.json({token:"fixture-token",expires_at:new Date(Date.now()+60000).toISOString()});}
  if(p==="/repos/isolated-validation/merge-proof-l3-lab-rulesets")return Response.json({id:5,full_name:"isolated-validation/merge-proof-l3-lab-rulesets",owner:{id:7}});
  return Response.json({message:"fixture intentionally has no evidence"},{status:403});
 };
 const fixture={repository:"isolated-validation/merge-proof-l3-lab-rulesets",repositoryId:5,ownerId:7,installationId:2,pr:1,expected:"NOT_PROVEN"};
 const report=await run({output,fixtures:[fixture],authorizedRepositories:[fixture]},{clientFactory:clientFactory(app,fetchImpl)});
 a.notEqual(report.results[0].actual,"VERIFIED");a.equal(tokenBodies[0].permissions.merge_queues,undefined);a.deepEqual(calls.slice(0,3),[{p:"/app/installations/2",method:"GET"},{p:"/app/installations/2/access_tokens",method:"POST"},{p:"/repos/isolated-validation/merge-proof-l3-lab-rulesets",method:"GET"}]);
 permissions={...permissions,merge_queues:"read"};await clientFactory(app,fetchImpl)(fixture);a.equal(tokenBodies.at(-1).permissions.merge_queues,"read");
 permissions={...permissions,administration:"write"};await a.rejects(clientFactory(app,fetchImpl)(fixture),{code:"STANDARD_LAB_APP_REQUIRED"});
 const before=calls.length,client=new Client({fetchImpl});
 for(const method of ["POST","PATCH","DELETE"])await a.rejects(client.request("/app/installations/2",{method}),{code:"INVALID_ENDPOINT"});
 await a.rejects(client.request("/app/installations/2",{body:{ignored:true}}),{code:"INVALID_ENDPOINT"});a.equal(calls.length,before);
});
