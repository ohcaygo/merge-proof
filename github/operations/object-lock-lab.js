#!/usr/bin/env node
"use strict";
// Only explicitly tagged disposable buckets; production retention is not exposed.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {assert,hash}=require("../common"),{client}=require("./aws");
const save=(file,data)=>{const temp=file+".tmp",fd=fs.openSync(temp,"w",0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+"\n");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);};
// S3 retains Object Lock deadlines at whole-second precision; round up to preserve the minimum.
const minimumRetainUntil=millis=>new Date(Math.ceil(millis/1000)*1000).toISOString();
async function environment(config,make=client){
 assert(config.environment==="disposable-nonproduction"&&config.primary.accountId!==config.recovery.accountId&&config.primary.region!==config.recovery.region&&path.isAbsolute(config.record),"DISPOSABLE_CROSS_ACCOUNT_LAB_REQUIRED");
 const sides=[];
 for(const c of [config.primary,config.recovery]){
  assert(/^merge-proof-lock-lab-[a-z0-9-]+$/.test(c.bucket),"DISPOSABLE_BUCKET_REQUIRED");
  const aws=make(c),identity=await aws.checkIdentity(),base=["--bucket",c.bucket,"--expected-bucket-owner",c.accountId];
  const tags=await aws.call("s3api","get-bucket-tagging",base);assert(tags.TagSet?.some(t=>t.Key==="Purpose"&&t.Value==="MergeProofDisposableRetentionLab"),"DISPOSABLE_BUCKET_REQUIRED");
  const lock=await aws.call("s3api","get-object-lock-configuration",base);assert(lock.ObjectLockConfiguration?.ObjectLockEnabled==="Enabled","OBJECT_LOCK_REQUIRED");
  const version=await aws.call("s3api","get-bucket-versioning",base);assert(version.Status==="Enabled","VERSIONING_REQUIRED");
  sides.push({c,aws,identity,base});
 }
 return sides;
}
async function prepare(config,make=client){
 assert(!fs.existsSync(config.record),"LAB_RECORD_EXISTS");const sides=await environment(config,make),run=crypto.randomUUID(),until=minimumRetainUntil(Date.now()+180000);
 const body=path.join(path.dirname(config.record),run+".bin"),bytes=crypto.randomBytes(256);fs.writeFileSync(body,bytes,{mode:0o600,flag:"wx"});
 const record={schema:"urn:merge-proof:object-lock-lab:1",environment:config.environment,configDigest:hash(config),run,retainedUntil:until,startedAt:new Date().toISOString(),contentSha256:crypto.createHash("sha256").update(bytes).digest("hex"),sides:[],state:"RUNNING",checks:[]};save(config.record,record);
 try{
  const [primary,recovery]=sides;
  for(const side of sides){
   const lifecycle={Rules:[{ID:"disposable-expiration",Status:"Enabled",Filter:{Prefix:"lifecycle/"},Expiration:{Days:1},NoncurrentVersionExpiration:{NoncurrentDays:1}}]};
   await side.aws.call("s3api","put-bucket-lifecycle-configuration",[...side.base,"--lifecycle-configuration",JSON.stringify(lifecycle)]);
   const control=await side.aws.call("s3api","put-object",[...side.base,"--key",`control/${run}`,"--body",body]);
   assert(control.VersionId,"VERSION_ID_REQUIRED");await side.aws.call("s3api","delete-object",[...side.base,"--key",`control/${run}`,"--version-id",control.VersionId]);
   record.sides.push({accountId:side.c.accountId,bucket:side.c.bucket,region:side.c.region,identity:side.identity,objects:[]});save(config.record,record);
  }
  for(const prefix of ["manual","lifecycle"]){
   const key=`${prefix}/${run}`;
   const source=await primary.aws.call("s3api","put-object",[...primary.base,"--key",key,"--body",body,"--checksum-algorithm","SHA256","--object-lock-mode","COMPLIANCE","--object-lock-retain-until-date",until]);
   assert(source.VersionId,"VERSION_ID_REQUIRED");record.sides[0].objects.push({key,versionId:source.VersionId});save(config.record,record);
   const copied=await recovery.aws.call("s3api","copy-object",[...recovery.base,"--key",key,"--copy-source",`${primary.c.bucket}/${key}?versionId=${encodeURIComponent(source.VersionId)}`,"--expected-source-bucket-owner",primary.c.accountId,"--object-lock-mode","COMPLIANCE","--object-lock-retain-until-date",until]);
   assert(copied.VersionId,"VERSION_ID_REQUIRED");record.sides[1].objects.push({key,versionId:copied.VersionId});save(config.record,record);
  }
  for(let n=0;n<sides.length;n++)for(const object of record.sides[n].objects){
   const side=sides[n],args=[...side.base,"--key",object.key,"--version-id",object.versionId];
   const retention=await side.aws.call("s3api","get-object-retention",args);assert(retention.Retention?.Mode==="COMPLIANCE"&&Date.parse(retention.Retention.RetainUntilDate)>=Date.parse(until),"RETENTION_NOT_CONFIRMED");
   let denied=false;try{await side.aws.call("s3api","delete-object",args);}catch(e){assert(e.providerCode==="AccessDenied","RETENTION_DENIAL_AMBIGUOUS");denied=true;}assert(denied,"RETENTION_DELETE_SUCCEEDED");
   let shortened=false;try{await side.aws.call("s3api","put-object-retention",[...args,"--retention",JSON.stringify({Mode:"COMPLIANCE",RetainUntilDate:new Date(Date.now()+30000).toISOString()})]);shortened=true;}catch(e){assert(e.providerCode==="AccessDenied","RETENTION_DENIAL_AMBIGUOUS");}assert(!shortened,"RETENTION_SHORTENING_SUCCEEDED");
   const restored=body+`.restore-${n}-${object.key.split('/')[0]}`;
   await side.aws.call("s3api","get-object",[...args,restored]);assert(crypto.createHash("sha256").update(fs.readFileSync(restored)).digest("hex")===record.contentSha256,"RESTORE_DIGEST_MISMATCH");fs.unlinkSync(restored);
  }
  record.checks=["write","unlocked-control-delete","compliance-readback","protected-version-delete-denied","retention-shortening-denied","cross-account-copy","independent-recovery-read-and-restore"];
  record.state="WAITING_FOR_RETENTION_AND_LIFECYCLE_EXPIRATION";save(config.record,record);return record;
 }finally{fs.unlinkSync(body);}
}
async function finish(config,make=client){
 const record=JSON.parse(fs.readFileSync(config.record));assert(record.configDigest===hash(config)&&record.state==="WAITING_FOR_RETENTION_AND_LIFECYCLE_EXPIRATION","LAB_RECORD_NOT_READY");
 if(Date.now()<=Date.parse(record.retainedUntil))return {state:"NOT_PROVEN",reason:"RETENTION_HAS_NOT_EXPIRED",resumeAfter:record.retainedUntil};
 const sides=await environment(config,make);let expired=true;
 for(let n=0;n<sides.length;n++){
  const side=sides[n],manual=record.sides[n].objects.find(o=>o.key.startsWith("manual/"));assert(manual,"LAB_RECORD_INCOMPLETE");
  if(!manual.deletedAfterRetention){await side.aws.call("s3api","delete-object",[...side.base,"--key",manual.key,"--version-id",manual.versionId]);manual.deletedAfterRetention=true;save(config.record,record);}
  const lifecycle=record.sides[n].objects.find(o=>o.key.startsWith("lifecycle/"));assert(lifecycle,"LAB_RECORD_INCOMPLETE");
  const versions=await side.aws.call("s3api","list-object-versions",[...side.base,"--prefix",lifecycle.key]);
  assert(!versions.IsTruncated,"LIFECYCLE_OBSERVATION_INCOMPLETE");
  if((versions.Versions||[]).some(v=>v.Key===lifecycle.key&&v.VersionId===lifecycle.versionId))expired=false;
 }
 if(!expired){save(config.record,record);return {state:"NOT_PROVEN",reason:"S3_LIFECYCLE_EXPIRATION_PENDING",retentionDeletion:"OBSERVED"};}
 record.checks.push("post-retention-version-delete","provider-lifecycle-expiration-both-accounts");record.state="DISPOSABLE_LIFECYCLE_ACCEPTED";record.completedAt=new Date().toISOString();save(config.record,record);return record;
}
if(require.main===module)(async()=>{const config=JSON.parse(fs.readFileSync(process.argv[3]));assert(["prepare","finish"].includes(process.argv[2]),"LAB_OPERATION_INVALID");const r=await (process.argv[2]==="prepare"?prepare:finish)(config);console.log(JSON.stringify(r));if(r.state!=="DISPOSABLE_LIFECYCLE_ACCEPTED")process.exitCode=2;})().catch(e=>{console.error(e.code||"OBJECT_LOCK_ACCEPTANCE_UNAVAILABLE");process.exitCode=2;});
module.exports={environment,prepare,finish};
