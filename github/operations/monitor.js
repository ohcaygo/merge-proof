#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),{assert}=require("../common");
function inspect(config,now=Date.now()){
 const result={at:new Date(now).toISOString(),state:"HEALTHY",alarms:[],recoveryBackupAgeSeconds:null,usedPercent:null};
 const alarm=(code,severity="CRITICAL")=>result.alarms.push({code,severity});
 try{const r=JSON.parse(fs.readFileSync(config.backupRecord));assert(r.state==="RECOVERY_MANIFEST_CONFIRMED"&&Date.parse(r.snapshotAt)<=now,"BACKUP_RECORD_INVALID");result.recoveryBackupAgeSeconds=Math.ceil((now-Date.parse(r.snapshotAt))/1000);if(result.recoveryBackupAgeSeconds>600)alarm("RECOVERY_BACKUP_STALE",result.recoveryBackupAgeSeconds>900?"CRITICAL":"WARNING");}catch{alarm("RECOVERY_BACKUP_UNAVAILABLE");}
 try{const st=fs.statfsSync(config.stateDir);assert(st.blocks>0,"STORAGE_METRICS_UNAVAILABLE");result.usedPercent=100*(1-st.bavail/st.blocks);if(result.usedPercent>=70)alarm("STORAGE_CAPACITY",result.usedPercent>=85?"CRITICAL":"WARNING");if(st.files>0&&st.ffree/st.files<0.15)alarm("STORAGE_INODES");}catch{alarm("STORAGE_METRICS_UNAVAILABLE");}
 try{const data=JSON.parse(fs.readFileSync(config.stateDir+"/state.json")).github;assert(data,"STATE_UNAVAILABLE");
  if(data.operatorLogHealth==="CHECKPOINT_UNAVAILABLE")alarm("SIGNING_OR_CHECKPOINT_UNAVAILABLE");
  if(data.signingHealth?.state==="UNAVAILABLE")alarm("RECEIPT_SIGNING_UNAVAILABLE");
  if(Object.values(data.subscriptions||{}).some(v=>v?.refreshState==="UNAVAILABLE"))alarm("PROOF_PROCESSING_UNAVAILABLE","WARNING");
  if(data.deliveryHealth==="UNAVAILABLE")alarm("GITHUB_DELIVERY_RECONCILIATION_UNAVAILABLE","WARNING");
  if(Object.values(data.enhancedPolicy||{}).some(v=>v?.enabled&&v.status==="UNAVAILABLE"))alarm("ENHANCED_POLICY_UNAVAILABLE","WARNING");
 }catch{alarm("PROOF_STATE_UNAVAILABLE");}
 if(result.alarms.length)result.state=result.alarms.some(a=>a.severity==="CRITICAL")?"CRITICAL":"WARNING";return result;
}
async function publish(config){require("./authority").environment(config);const out=inspect(config),aws=require("./aws").client(config.aws);await aws.checkIdentity();await aws.call("cloudwatch","put-metric-data",["--namespace","MergeProof","--metric-data",JSON.stringify([{MetricName:"RecoveryBackupAgeSeconds",Value:out.recoveryBackupAgeSeconds??86400,Unit:"Seconds"},{MetricName:"StorageUsedPercent",Value:out.usedPercent??100,Unit:"Percent"},{MetricName:"CriticalHealth",Value:out.state==="CRITICAL"?1:0,Unit:"Count"}])]);return out;}
if(require.main===module)publish(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>{console.log(JSON.stringify(r));if(r.state!=="HEALTHY")process.exitCode=2;}).catch(e=>{console.error(e.code||"MONITOR_UNAVAILABLE");process.exitCode=2;});
module.exports={inspect,publish};
