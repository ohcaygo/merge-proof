#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{assert,hash}=require("../common"),backup=require("./backup"),{client}=require("./aws");
function* parts(file,row,chunkBytes,temp){
 if(row.size<=chunkBytes){yield {...row,file};return;}
 const fd=fs.openSync(file,"r"),whole=crypto.createHash("sha256"),buffer=Buffer.alloc(chunkBytes);let total=0;
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))){const bytes=buffer.subarray(0,n);whole.update(bytes);total+=n;fs.writeFileSync(temp,bytes,{flag:"wx",mode:0o600});yield {file:temp,size:n,sha256:backup.digest(bytes)};fs.unlinkSync(temp);}assert(total===row.size&&whole.digest("hex")===row.sha256,"BACKUP_DIGEST_MISMATCH");}
 finally{fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
async function upload(config,make=client,{chunkBytes=64*1024*1024}={}){
 require("./authority").environment(config);
 assert(path.isAbsolute(config.backup)&&path.isAbsolute(config.record)&&config.primary.accountId!==config.recovery.accountId&&config.primary.region!==config.recovery.region,"CROSS_ACCOUNT_BACKUP_REQUIRED");
 const checked=backup.verify(config.backup),sides=[];
 for(const c of [config.primary,config.recovery]){assert(c.bucket===`merge-proof-backup-${c.accountId}-${c.region}`,"EXACT_BACKUP_BUCKET_REQUIRED");const aws=make(c);await aws.checkIdentity();const base=["--bucket",c.bucket,"--expected-bucket-owner",c.accountId];const v=await aws.call("s3api","get-bucket-versioning",base);assert(v.Status==="Enabled","VERSIONED_BACKUP_REQUIRED");
  if(config.environment==="production"){const lock=await aws.call("s3api","get-object-lock-configuration",base),retention=lock.ObjectLockConfiguration?.Rule?.DefaultRetention;assert(config.productionComplianceRetentionAuthorized===true&&retention?.Mode==="COMPLIANCE"&&retention.Days===30,"OWNER_PRODUCTION_RETENTION_REQUIRED");}
  sides.push({aws,c,base});}
 assert(Number.isInteger(chunkBytes)&&chunkBytes>0&&chunkBytes<=64*1024*1024,"BACKUP_CHUNK_BOUND_REQUIRED");const objects={},segments={};
 for(const row of checked.manifest.files){
  if(segments[row.sha256])continue;segments[row.sha256]=[];
  for(const part of parts(path.join(config.backup,row.path),row,chunkBytes,config.record+".part-"+crypto.randomUUID())){
  segments[row.sha256].push({sha256:part.sha256,size:part.size});if(objects[part.sha256])continue;
  const key="objects/"+part.sha256,checksum=Buffer.from(part.sha256,"hex").toString("base64"),versions=[];
  for(let n=0;n<2;n++){
   const side=sides[n];let head=null;
   try{head=await side.aws.call("s3api","head-object",[...side.base,"--key",key,"--checksum-mode","ENABLED"]);}catch(e){assert(["404","NoSuchKey","NotFound"].includes(e.providerCode),"BACKUP_READ_UNAVAILABLE");}
   const retentionUntil=Date.parse(checked.manifest.at)+30*86400000;
   const renew=config.environment==="production"&&head&&head.ObjectLockMode!=="COMPLIANCE";
   if(!head||renew){
    if(n===0)await side.aws.call("s3api","put-object",[...side.base,"--key",key,"--body",part.file,"--checksum-algorithm","SHA256","--checksum-sha256",checksum,...(!head?["--if-none-match","*"]:[])]);
    else await side.aws.call("s3api","copy-object",[...side.base,"--key",key,"--copy-source",`${sides[0].c.bucket}/${key}?versionId=${encodeURIComponent(versions[0])}`,"--expected-source-bucket-owner",sides[0].c.accountId,"--checksum-algorithm","SHA256"]);
    head=await side.aws.call("s3api","head-object",[...side.base,"--key",key,"--checksum-mode","ENABLED"]);
   }
   assert(head.VersionId&&head.ChecksumSHA256===checksum&&head.ContentLength===part.size,"BACKUP_REMOTE_DIGEST_MISMATCH");
   if(config.environment==="production"){
    assert(head.ObjectLockMode==="COMPLIANCE"&&Number.isFinite(Date.parse(head.ObjectLockRetainUntilDate)),"BACKUP_RETENTION_UNAVAILABLE");
    if(Date.parse(head.ObjectLockRetainUntilDate)<retentionUntil){
     await side.aws.call("s3api","put-object-retention",[...side.base,"--key",key,"--version-id",head.VersionId,"--retention",JSON.stringify({Mode:"COMPLIANCE",RetainUntilDate:new Date(retentionUntil).toISOString()})]);
     const observed=await side.aws.call("s3api","get-object-retention",[...side.base,"--key",key,"--version-id",head.VersionId]);assert(observed.Retention?.Mode==="COMPLIANCE"&&Date.parse(observed.Retention.RetainUntilDate)>=retentionUntil,"BACKUP_RETENTION_UNAVAILABLE");
    }
   }versions.push(head.VersionId);
  }
  objects[part.sha256]={size:part.size,primaryVersionId:versions[0],recoveryVersionId:versions[1]};
  }
 }
 const manifest={schema:"urn:merge-proof:remote-backup:1",backupManifest:checked.manifest,manifestDigest:checked.manifestDigest,objects,segments,createdAt:new Date().toISOString(),primary:{accountId:config.primary.accountId,region:config.primary.region,bucket:config.primary.bucket},recovery:{accountId:config.recovery.accountId,region:config.recovery.region,bucket:config.recovery.bucket}};
 const bytes=Buffer.from(JSON.stringify(manifest)+"\n"),digest=backup.digest(bytes),temp=config.record+".upload";fs.writeFileSync(temp,bytes,{flag:"wx",mode:0o600});
 try{
  const versions=[];for(const side of sides){const out=await side.aws.call("s3api","put-object",[...side.base,"--key","manifests/"+digest+".json","--body",temp,"--checksum-algorithm","SHA256","--checksum-sha256",Buffer.from(digest,"hex").toString("base64"),"--if-none-match","*"]);assert(out.VersionId,"BACKUP_MANIFEST_VERSION_REQUIRED");versions.push(out.VersionId);}
  // Acceptance requires independent recovery-account retrieval, not copy ACK.
  const restored=temp+".readback";await sides[1].aws.call("s3api","get-object",[...sides[1].base,"--key","manifests/"+digest+".json","--version-id",versions[1],restored]);assert(backup.digestFile(restored)===digest,"BACKUP_MANIFEST_READBACK_FAILED");fs.unlinkSync(restored);
  const result={state:"RECOVERY_MANIFEST_CONFIRMED",environment:config.environment,at:new Date().toISOString(),snapshotAt:checked.manifest.at,manifestKey:"manifests/"+digest+".json",manifestSha256:digest,primaryVersionId:versions[0],recoveryVersionId:versions[1],manifestDigest:checked.manifestDigest};
  fs.writeFileSync(config.record+".tmp",JSON.stringify(result)+"\n",{mode:0o600});fs.renameSync(config.record+".tmp",config.record);return result;
 }finally{fs.unlinkSync(temp);}
}
async function recover(config,make=client){
 require("./authority").environment(config);
 assert(config.writerFenced===true&&path.isAbsolute(config.destination)&&!fs.existsSync(config.destination)&&/^[a-f0-9]{64}$/.test(config.manifestSha256)&&config.manifestKey===`manifests/${config.manifestSha256}.json`&&typeof config.recoveryVersionId==="string","RECOVERY_CONFIG_INVALID");
 const aws=make(config.recovery);await aws.checkIdentity();assert(config.recovery.bucket===`merge-proof-backup-${config.recovery.accountId}-${config.recovery.region}`,"EXACT_BACKUP_BUCKET_REQUIRED");
 const base=["--bucket",config.recovery.bucket,"--expected-bucket-owner",config.recovery.accountId];fs.mkdirSync(config.destination,{mode:0o700});const temp=path.join(config.destination,"remote.json");
 await aws.call("s3api","get-object",[...base,"--key",config.manifestKey,"--version-id",config.recoveryVersionId,temp]);assert(backup.digestFile(temp)===config.manifestSha256,"BACKUP_MANIFEST_READBACK_FAILED");
 const remote=JSON.parse(fs.readFileSync(temp));assert(remote.schema==="urn:merge-proof:remote-backup:1"&&hash(remote.backupManifest)===remote.manifestDigest,"BACKUP_MANIFEST_INVALID");
 assert(hash(remote.recovery)===hash({accountId:config.recovery.accountId,region:config.recovery.region,bucket:config.recovery.bucket}),"RECOVERY_ACCOUNT_MISMATCH");
 const seen=new Set();for(const row of remote.backupManifest.files){assert(typeof row.path==="string"&&!path.isAbsolute(row.path)&&row.path.split("/").every(n=>n&&n!=="."&&n!=="..")&&!seen.has(row.path)&&/^[a-f0-9]{64}$/.test(row.sha256),"BACKUP_MANIFEST_INVALID");seen.add(row.path);
  const list=remote.segments?.[row.sha256];assert(Array.isArray(list)&&list.length>0&&list.every(p=>/^[a-f0-9]{64}$/.test(p.sha256)&&Number.isInteger(p.size)&&p.size>=0&&p.size<=64*1024*1024&&remote.objects[p.sha256]?.recoveryVersionId)&&list.reduce((n,p)=>n+p.size,0)===row.size,"BACKUP_SEGMENTS_INVALID");
  const file=path.join(config.destination,row.path);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const fd=fs.openSync(file,"wx",0o600),chunk=path.join(config.destination,".restore-chunk");
  try{for(const part of list){await aws.call("s3api","get-object",[...base,"--key","objects/"+part.sha256,"--version-id",remote.objects[part.sha256].recoveryVersionId,chunk]);assert(fs.statSync(chunk).size===part.size&&backup.digestFile(chunk)===part.sha256,"BACKUP_DIGEST_MISMATCH");const input=fs.openSync(chunk,"r"),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(input,buffer,0,buffer.length,null)))fs.writeSync(fd,buffer,0,n);}finally{fs.closeSync(input);fs.unlinkSync(chunk);}}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  assert(backup.digestFile(file)===row.sha256,"BACKUP_DIGEST_MISMATCH");}
 fs.unlinkSync(temp);fs.writeFileSync(path.join(config.destination,"MANIFEST.json"),JSON.stringify(remote.backupManifest)+"\n",{mode:0o600});const checked=backup.verify(config.destination);
 return {state:"RECOVERY_RESTORED_HISTORICAL_ONLY",currentness:"NOT_PROVEN",manifestDigest:checked.manifestDigest,receipts:checked.receipts};
}
if(require.main===module)(async()=>{const c=JSON.parse(fs.readFileSync(process.argv[3]));assert(["upload","recover"].includes(process.argv[2]),"BACKUP_OPERATION_INVALID");console.log(JSON.stringify(await(process.argv[2]==="upload"?upload:recover)(c)));})().catch(e=>{console.error(e.code||"REMOTE_BACKUP_NOT_PROVEN");process.exitCode=2;});
module.exports={upload,recover};
