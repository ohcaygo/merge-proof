#!/usr/bin/env node
'use strict';
// The live differential lab stores private calibration outside the product tree.
// It observes an explicit allowlist; all mutations belong to fixture setup.
const fs=require('node:fs'),path=require('node:path'),{assert,hash}=require('../common');
async function run(config,{clientFactory}={}){
 assert(Array.isArray(config.fixtures)&&config.fixtures.length>0&&config.fixtures.length<=30&&path.isAbsolute(config.output),'LAB_CONFIG_INVALID');
 if(config.authorizedRepositories !== undefined) {
  const list = config.authorizedRepositories;
  assert(Array.isArray(list) && list.length > 0 && list.length <= 30 && list.every(r => r && require('../common').repoName(r.repository) &&
   /^merge-proof-l3-lab-[a-z0-9-]+$/.test(r.repository.split('/')[1]) && [r.repositoryId,r.ownerId].every(n => Number.isSafeInteger(n) && n > 0)) &&
   new Set(list.map(r => r.repository.toLowerCase())).size === list.length && new Set(list.map(r => r.repositoryId)).size === list.length, 'LAB_ALLOWLIST_INVALID');
 }
 const results=[];let baseline={};if(config.baseline)baseline=JSON.parse(fs.readFileSync(config.baseline,'utf8'));
 for(const fixture of config.fixtures){
  const declared = config.authorizedRepositories?.find(r => r.repository === fixture.repository && r.repositoryId === fixture.repositoryId);
  const legacy = config.authorizedRepositories === undefined && /^ohcaygo\/merge-proof-l3-lab-[a-z0-9-]+$/.test(fixture.repository);
  assert((legacy || declared && Number.isSafeInteger(declared.ownerId) && declared.ownerId > 0 && require('../common').repoName(declared.repository) && /^merge-proof-l3-lab-[a-z0-9-]+$/.test(declared.repository.split('/')[1]))&&Number.isSafeInteger(fixture.repositoryId)&&fixture.repositoryId>0&&Number.isSafeInteger(fixture.pr)&&fixture.pr>0&&['VERIFIED','NOT_PROVEN','FAIL'].includes(fixture.expected),'OWNED_SYNTHETIC_FIXTURE_REQUIRED');
  try{
   const client=clientFactory?await clientFactory(fixture):new (require('../client').Client)({token:process.env.MP_LAB_TOKEN,maxRequests:Math.max(1,Math.floor(480/config.fixtures.length))});
   const repository = await client.authorize(fixture.repository,fixture.repositoryId);
   if (declared) assert(repository.owner?.id === declared.ownerId, 'LAB_OWNER_ID_MISMATCH');
   const capture=await require('../collect').collect(client,fixture.repository,fixture.pr,{mergeGroup:fixture.mergeGroup||null});
   const receipt=require('../proof').prove(capture,{appId:config.appId});
   const key=`${fixture.repositoryId}:${fixture.pr}`,old=baseline.results?.find(x=>x.key===key),shape={verdict:receipt.verdict,gaps:receipt.gaps,claims:receipt.claims.map(c=>({name:c.name,state:c.state,reason:c.reason}))};
   const falseVerified=receipt.verdict==='VERIFIED'&&(fixture.expected!=='VERIFIED'||receipt.claims.some(c=>c.state!=='TRUE'));
   results.push({key,repository:fixture.repository,pr:fixture.pr,expected:fixture.expected,actual:receipt.verdict,state:receipt.verdict===fixture.expected&&!falseVerified?'PASS':'DRIFT',falseVerified,shape,changedFromBaseline:!!old&&hash(old.shape)!==hash(shape),receipt});
  }catch(e){results.push({key:`${fixture.repositoryId}:${fixture.pr}`,repository:fixture.repository,pr:fixture.pr,state:'UNAVAILABLE',reason:e.code||'PROVIDER_UNAVAILABLE'});}
 }
 let metrics=null;
 if(config.runtimeState){assert(path.isAbsolute(config.runtimeState),'LAB_STATE_PATH_INVALID');const state=JSON.parse(fs.readFileSync(config.runtimeState,'utf8'));metrics=state.github?.frontierMetrics||null;}
 const metricDelta=metrics&&baseline.metrics?Object.fromEntries(Object.keys(metrics).map(k=>[k,Math.max(0,metrics[k]-(baseline.metrics[k]||0))])):null;
 const report={metrics,metricDelta,schema:'urn:merge-proof:differential-run:1',at:new Date().toISOString(),productCodeDigest:require('../bundle').codeDigest(),results,
   alarms:{reconciliationSupersessions:metricDelta?.reconciliationSupersessions||0,ruleSuiteDisagreements:metricDelta?.ruleSuiteDisagreements||0,falseVerified:results.filter(r=>r.falseVerified).length,fixtureDrift:results.filter(r=>r.state==='DRIFT'||r.changedFromBaseline).length,unavailable:results.filter(r=>r.state==='UNAVAILABLE').length},
   limitation:'Live comparison of declared owned fixtures. A passed fixture is not evidence about unexecuted provider paths.'};
 fs.mkdirSync(config.output,{recursive:true,mode:0o700});const file=path.join(config.output,new Date().toISOString().replaceAll(':','-')+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});return {file,...report};
}
if(require.main===module)run(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).then(r=>{console.log(JSON.stringify({file:r.file,alarms:r.alarms}));process.exitCode=Object.values(r.alarms).some(Boolean)?2:0;}).catch(e=>{console.error(e.code||'LAB_UNAVAILABLE');process.exitCode=2;});
module.exports={run};
