#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),{assert}=require("../common"),healthcheck=require("./healthcheck");
const LOG_GROUP="/merge-proof/preparation/monitor",LOG_STREAM="health";
const ALARM_CODES=new Set(["RECOVERY_BACKUP_STALE","RECOVERY_BACKUP_UNAVAILABLE","STORAGE_CAPACITY","STORAGE_INODES","STORAGE_METRICS_UNAVAILABLE","MEMORY_CAPACITY","MEMORY_METRICS_UNAVAILABLE","SIGNING_OR_CHECKPOINT_UNAVAILABLE","RECEIPT_SIGNING_UNAVAILABLE","PROOF_PROCESSING_UNAVAILABLE","GITHUB_DELIVERY_RECONCILIATION_UNAVAILABLE","ENHANCED_POLICY_UNAVAILABLE","PROOF_STATE_UNAVAILABLE","EXTERNAL_HEALTH_CONFIG_UNAVAILABLE","EXTERNAL_HEALTH_SERVICE_FAILED","EXTERNAL_HEALTH_BACKUP_FAILED"]);
const RESULT_STATES=new Set(["HEALTHY","WARNING","CRITICAL"]),EXTERNAL_STATES=new Set(["NOT_CONFIGURED","NOT_CHECKED","UNAVAILABLE","RECEIVED","FAILED"]);
function finalize(result){result.state=result.alarms.length?result.alarms.some(a=>a.severity==="CRITICAL")?"CRITICAL":"WARNING":"HEALTHY";return result;}
function memoryUsedPercent(file="/proc/meminfo"){
 const data=fs.readFileSync(file,"utf8"),values=Object.fromEntries([...data.matchAll(/^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/gm)].map(([,key,value])=>[key,Number(value)])),total=values.MemTotal,available=values.MemAvailable;
 assert(Number.isFinite(total)&&total>0&&Number.isFinite(available)&&available>=0&&available<=total,"MEMORY_METRICS_UNAVAILABLE");
 return 100*(1-available/total);
}
function inspect(config,now=Date.now()){
 const notConfigured={state:"NOT_CONFIGURED",service:{state:"NOT_CONFIGURED"},backup:{state:"NOT_CONFIGURED"}};
 const result={at:new Date(now).toISOString(),state:"HEALTHY",alarms:[],recoveryBackupAgeSeconds:null,usedPercent:null,memoryUsedPercent:null,externalHealth:config.externalHealthFile?{state:"NOT_CHECKED"}:notConfigured};
 const alarm=(code,severity="CRITICAL")=>result.alarms.push({code,severity});
 try{const r=JSON.parse(fs.readFileSync(config.backupRecord));assert(r.state==="RECOVERY_MANIFEST_CONFIRMED"&&Date.parse(r.snapshotAt)<=now,"BACKUP_RECORD_INVALID");result.recoveryBackupAgeSeconds=Math.ceil((now-Date.parse(r.snapshotAt))/1000);if(result.recoveryBackupAgeSeconds>600)alarm("RECOVERY_BACKUP_STALE",result.recoveryBackupAgeSeconds>900?"CRITICAL":"WARNING");}catch{alarm("RECOVERY_BACKUP_UNAVAILABLE");}
 try{const st=fs.statfsSync(config.stateDir);assert(st.blocks>0,"STORAGE_METRICS_UNAVAILABLE");result.usedPercent=100*(1-st.bavail/st.blocks);if(result.usedPercent>=70)alarm("STORAGE_CAPACITY",result.usedPercent>=85?"CRITICAL":"WARNING");if(st.files>0&&st.ffree/st.files<0.15)alarm("STORAGE_INODES");}catch{alarm("STORAGE_METRICS_UNAVAILABLE");}
 try{result.memoryUsedPercent=memoryUsedPercent(config.memoryInfoFile);if(result.memoryUsedPercent>=85)alarm("MEMORY_CAPACITY",result.memoryUsedPercent>=95?"CRITICAL":"WARNING");}catch{alarm("MEMORY_METRICS_UNAVAILABLE");}
 try{const data=JSON.parse(fs.readFileSync(config.stateDir+"/state.json")).github;assert(data,"STATE_UNAVAILABLE");
  if(data.operatorLogHealth==="CHECKPOINT_UNAVAILABLE")alarm("SIGNING_OR_CHECKPOINT_UNAVAILABLE");
  if(data.signingHealth?.state==="UNAVAILABLE")alarm("RECEIPT_SIGNING_UNAVAILABLE");
  if(Object.values(data.subscriptions||{}).some(v=>v?.refreshState==="UNAVAILABLE"))alarm("PROOF_PROCESSING_UNAVAILABLE","WARNING");
  if(data.deliveryHealth==="UNAVAILABLE")alarm("GITHUB_DELIVERY_RECONCILIATION_UNAVAILABLE","WARNING");
  if(Object.values(data.enhancedPolicy||{}).some(v=>v?.enabled&&v.status==="UNAVAILABLE"))alarm("ENHANCED_POLICY_UNAVAILABLE","WARNING");
 }catch{alarm("PROOF_STATE_UNAVAILABLE");}
 return finalize(result);
}
function readExternalHealthFile(file,ownerUid=0){
 if(!file)return {state:"NOT_CONFIGURED"};
 try{
  const st=fs.lstatSync(file);
  assert(st.isFile()&&st.uid===ownerUid&&(st.mode&0o777)===0o600,"EXTERNAL_HEALTH_CONFIG_UNAVAILABLE");
  const value=JSON.parse(fs.readFileSync(file,"utf8"));
  assert(value&&typeof value==="object"&&!Array.isArray(value)&&typeof value.service==="string"&&typeof value.backup==="string","EXTERNAL_HEALTH_CONFIG_UNAVAILABLE");
  healthcheck.assertUrlPair(value.service,value.backup);
  return {state:"CONFIGURED",service:value.service,backup:value.backup};
 }catch{return {state:"UNAVAILABLE",code:"EXTERNAL_HEALTH_CONFIG_UNAVAILABLE"};}
}
function serviceReady(config,now,result){
 try{
  const data=JSON.parse(fs.readFileSync(config.stateDir+"/state.json","utf8")).github;
  const at=Number(data?.lastActivityAt);
  assert(Number.isFinite(at)&&at<=now&&now-at<=120000,"HEALTHCHECK_SERVICE_NOT_READY");
  assert(data.operatorLogHealth!=="CHECKPOINT_UNAVAILABLE"&&data.signingHealth?.state!=="UNAVAILABLE","HEALTHCHECK_SERVICE_NOT_READY");
  assert(!(result?.alarms||[]).some(a=>a.severity==="CRITICAL"&&!/^RECOVERY_BACKUP_/.test(a.code)),"HEALTHCHECK_SERVICE_NOT_READY");
  return true;
 }catch{return false;}
}
function backupReady(config,now){
 try{
  const record=JSON.parse(fs.readFileSync(config.backupRecord,"utf8")),at=Date.parse(record.snapshotAt);
  assert(record.state==="RECOVERY_MANIFEST_CONFIRMED"&&Number.isFinite(at)&&at<=now&&now-at<=900000,"HEALTHCHECK_BACKUP_NOT_READY");
  return true;
 }catch{return false;}
}
async function safePing(url,pingImpl,outcome){
 try{
  const result=await pingImpl(url,{outcome});
  return result?.state==="RECEIVED"?{state:"RECEIVED"}:{state:"FAILED",code:/^HEALTHCHECK_[A-Z_]+$/.test(result?.code||"")?result.code:"HEALTHCHECK_UNAVAILABLE"};
 }catch(error){return {state:"FAILED",code:/^HEALTHCHECK_[A-Z_]+$/.test(error?.code||"")?error.code:"HEALTHCHECK_UNAVAILABLE"};}
}
async function inspectExternal(config,now=Date.now(),pingImpl=healthcheck.ping,{ownerUid=0}={}){
 const result=inspect(config,now),material=readExternalHealthFile(config.externalHealthFile,ownerUid);
 if(material.state==="NOT_CONFIGURED"){
  result.externalHealth={state:"NOT_CONFIGURED",service:{state:"NOT_CONFIGURED"},backup:{state:"NOT_CONFIGURED"}};
  return result;
 }
 if(material.state!=="CONFIGURED"){
  result.externalHealth={state:"UNAVAILABLE",service:{state:"FAILED",code:material.code},backup:{state:"FAILED",code:material.code}};
  result.alarms.push({code:"EXTERNAL_HEALTH_CONFIG_UNAVAILABLE",severity:"CRITICAL"});
  return finalize(result);
 }
 const serviceReadyNow=serviceReady(config,now,result),backupReadyNow=backupReady(config,now);
 const serviceSignal=await safePing(material.service,pingImpl,serviceReadyNow?"success":"fail");
 const backupSignal=await safePing(material.backup,pingImpl,backupReadyNow?"success":"fail");
 const service=serviceReadyNow&&serviceSignal.state==="RECEIVED"?{state:"RECEIVED",signal:"RECEIVED"}:{state:"FAILED",code:serviceReadyNow?serviceSignal.code:"HEALTHCHECK_SERVICE_NOT_READY",signal:serviceSignal.state};
 const backup=backupReadyNow&&backupSignal.state==="RECEIVED"?{state:"RECEIVED",signal:"RECEIVED"}:{state:"FAILED",code:backupReadyNow?backupSignal.code:"HEALTHCHECK_BACKUP_NOT_READY",signal:backupSignal.state};
 result.externalHealth={state:service.state==="RECEIVED"&&backup.state==="RECEIVED"?"RECEIVED":"FAILED",service,backup};
 if(service.state!=="RECEIVED")result.alarms.push({code:"EXTERNAL_HEALTH_SERVICE_FAILED",severity:"CRITICAL"});
 if(backup.state!=="RECEIVED")result.alarms.push({code:"EXTERNAL_HEALTH_BACKUP_FAILED",severity:"CRITICAL"});
 return finalize(result);
}
function logDestination(config){
 const destination=config.logs,aws=config.aws;
 assert(aws&&/^\d{12}$/.test(aws.accountId)&&/^us-(east|west)-[12]$/.test(aws.region)&&destination&&typeof destination==="object"&&destination.group===LOG_GROUP&&destination.stream===LOG_STREAM&&destination.accountId===aws.accountId&&destination.region===aws.region,"MONITOR_LOG_DESTINATION_INVALID");
 return destination;
}
function number(value,maximum){if(value===null||value===undefined)return null;assert(Number.isFinite(value)&&value>=0&&value<=maximum,"MONITOR_LOG_EVENT_INVALID");return Math.round(value*100)/100;}
function logEvent(result){
 const at=Date.parse(result?.at),external=result?.externalHealth||{};
 assert(typeof result?.at==="string"&&Number.isFinite(at)&&new Date(at).toISOString()===result.at&&RESULT_STATES.has(result.state)&&Array.isArray(result.alarms)&&result.alarms.every(a=>ALARM_CODES.has(a?.code)&&["WARNING","CRITICAL"].includes(a.severity))&&EXTERNAL_STATES.has(external.state)&&EXTERNAL_STATES.has(external.service?.state)&&EXTERNAL_STATES.has(external.backup?.state),"MONITOR_LOG_EVENT_INVALID");
 return JSON.stringify({schema:"merge-proof-monitor/v1",at:result.at,state:result.state,alarms:result.alarms.map(({code,severity})=>({code,severity})),recoveryBackupAgeSeconds:number(result.recoveryBackupAgeSeconds,315576000),storageUsedPercent:number(result.usedPercent,100),memoryUsedPercent:number(result.memoryUsedPercent,100),externalHealth:{state:external.state,service:external.service.state,backup:external.backup.state}});
}
async function publish(config,clientFactory=require("./aws").client,inspectExternalFn=inspectExternal){
 require("./authority").environment(config);
 const destination=logDestination(config),aws=clientFactory(config.aws),out=await inspectExternalFn(config),event=logEvent(out);
 await aws.checkIdentity();
 await aws.call("cloudwatch","put-metric-data",["--namespace","MergeProof","--metric-data",JSON.stringify([{MetricName:"RecoveryBackupAgeSeconds",Value:out.recoveryBackupAgeSeconds??86400,Unit:"Seconds"},{MetricName:"StorageUsedPercent",Value:out.usedPercent??100,Unit:"Percent"},{MetricName:"MemoryUsedPercent",Value:out.memoryUsedPercent??100,Unit:"Percent"},{MetricName:"WarningHealth",Value:out.state==="WARNING"?1:0,Unit:"Count"},{MetricName:"CriticalHealth",Value:out.state==="CRITICAL"?1:0,Unit:"Count"}])]);
 try{await aws.call("logs","create-log-stream",["--log-group-name",destination.group,"--log-stream-name",destination.stream]);}catch(error){if(error?.providerCode!=="ResourceAlreadyExistsException")throw error;}
 const delivered=await aws.call("logs","put-log-events",["--log-group-name",destination.group,"--log-stream-name",destination.stream,"--log-events",JSON.stringify([{timestamp:Date.parse(out.at),message:event}])]);
 assert(!delivered?.rejectedLogEventsInfo&&!delivered?.rejectedEntityInfo,"MONITOR_LOG_DELIVERY_REJECTED");
 return out;
}
if(require.main===module)publish(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>{console.log(JSON.stringify(r));if(r.state!=="HEALTHY")process.exitCode=2;}).catch(e=>{console.error(e.code||"MONITOR_UNAVAILABLE");process.exitCode=2;});
module.exports={inspect,publish,inspectExternal,serviceReady,backupReady,memoryUsedPercent,logDestination,logEvent,LOG_GROUP,LOG_STREAM};
