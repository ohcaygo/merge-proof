#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),{assert}=require("../common");
async function main(){
 assert(process.env.GITHUB_REPOSITORY==="ohcaygo-merge-proof-validation/merge-proof-lab-control"&&process.env.GITHUB_EVENT_NAME!=="pull_request","PRIVATE_LAB_CONTEXT_REQUIRED");
 const config=JSON.parse(fs.readFileSync(process.argv[2]));
 assert(Array.isArray(config.authorizedRepositories)&&config.authorizedRepositories.length&&config.fixtures.every(f=>Number.isSafeInteger(f.installationId)&&f.installationId>0),"EXACT_LAB_INSTALLATIONS_REQUIRED");
 assert(/^[a-f0-9]{40}$/.test(process.env.MP_SOURCE_COMMIT||"")&&require("node:child_process").execFileSync("git",["rev-parse","HEAD"],{cwd:path.resolve(__dirname,"../.."),encoding:"utf8"}).trim()===process.env.MP_SOURCE_COMMIT,"EXACT_LAB_CANDIDATE_REQUIRED");
 const app={appId:Number(process.env.MP_LAB_APP_ID),privateKey:process.env.MP_LAB_APP_PRIVATE_KEY,mergeQueues:true,publishChecks:false};
 assert(Number.isSafeInteger(app.appId)&&app.appId>0&&app.privateKey,"LAB_APP_REQUIRED");
 const report=await require("./run").run({...config,appId:app.appId},{clientFactory:async fixture=>{
  const install=await require("../app").appClient(app).get(`/app/installations/${fixture.installationId}`);
  assert(install.app_id===app.appId&&install.repository_selection==="selected"&&install.permissions?.administration==="read"&&install.suspended_at===null,"STANDARD_LAB_APP_REQUIRED");
  return require("../app").installationClient(app,fixture.installationId,fixture.repositoryId);
 }});
 console.log(JSON.stringify({file:report.file,sourceCommit:process.env.MP_SOURCE_COMMIT,alarms:report.alarms}));if(Object.values(report.alarms).some(Boolean))process.exitCode=2;
}
if(require.main===module)main().catch(e=>{console.error(e.code||"LAB_UNAVAILABLE");process.exitCode=2;});
module.exports={main};
