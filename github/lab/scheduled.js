#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),{assert}=require("../common");
function clientFactory(app,fetchImpl){return async fixture=>{
 const install=await require("../app").appClient(app,fetchImpl).get(`/app/installations/${fixture.installationId}`);
 assert(install.app_id===app.appId&&install.repository_selection==="selected"&&install.permissions?.administration==="read"&&install.suspended_at===null,"STANDARD_LAB_APP_REQUIRED");
 return require("../app").installationClient({...app,mergeQueues:app.mergeQueues===true&&install.permissions?.merge_queues==="read"},fixture.installationId,fixture.repositoryId,fetchImpl);
};}
async function main({env=process.env,configFile=process.argv[2],fetchImpl}={}){
 assert(env.GITHUB_REPOSITORY==="ohcaygo-merge-proof-validation-lab/merge-proof-lab-control"&&["workflow_dispatch","schedule"].includes(env.GITHUB_EVENT_NAME),"PRIVATE_LAB_CONTEXT_REQUIRED");
 const config=JSON.parse(fs.readFileSync(configFile));
 assert(Array.isArray(config.authorizedRepositories)&&config.authorizedRepositories.length&&config.fixtures.every(f=>Number.isSafeInteger(f.installationId)&&f.installationId>0),"EXACT_LAB_INSTALLATIONS_REQUIRED");
 assert(/^[a-f0-9]{40}$/.test(env.MP_SOURCE_COMMIT||"")&&require("node:child_process").execFileSync("git",["rev-parse","HEAD"],{cwd:path.resolve(__dirname,"../.."),encoding:"utf8"}).trim()===env.MP_SOURCE_COMMIT,"EXACT_LAB_CANDIDATE_REQUIRED");
 const app={appId:Number(env.MP_LAB_APP_ID),privateKey:env.MP_LAB_APP_PRIVATE_KEY,mergeQueues:true,publishChecks:false};
 assert(Number.isSafeInteger(app.appId)&&app.appId>0&&app.privateKey,"LAB_APP_REQUIRED");
 const report=await require("./run").run({...config,appId:app.appId},{clientFactory:clientFactory(app,fetchImpl)});
 return {...report,sourceCommit:env.MP_SOURCE_COMMIT};
}
if(require.main===module)main().then(report=>{console.log(JSON.stringify({file:report.file,sourceCommit:report.sourceCommit,alarms:report.alarms}));if(Object.values(report.alarms).some(Boolean))process.exitCode=2;}).catch(e=>{console.error(e.code||"LAB_UNAVAILABLE");process.exitCode=2;});
module.exports={main,clientFactory};
