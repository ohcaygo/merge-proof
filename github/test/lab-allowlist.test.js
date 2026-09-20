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
