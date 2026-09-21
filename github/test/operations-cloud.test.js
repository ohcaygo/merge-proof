"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {Store}=require("../../factory/store"),{ProofService}=require("../service"),{Client}=require("../client"),{fixtureFetch}=require("./fixtures"),backup=require("../operations/backup"),cloud=require("../operations/backup-cycle"),lab=require("../operations/object-lock-lab");
function provider(){
 const data=new Map(),calls=[],state={copyFailure:false,expire:false,retentionShortfallMs:0,retentionReadbackShortfallMs:0,defaultComplianceRetention:false,allowRetentionRenewal:false};let sequence=0;
 const make=c=>({checkIdentity:async()=>({accountId:c.accountId,role:`arn:aws:sts::${c.accountId}:assumed-role/lab/test`}),call:async(_,op,args=[])=>{
  calls.push({account:c.accountId,op,args});const get=name=>args[args.indexOf(name)+1],bucket=get("--bucket"),key=args.includes("--key")?get("--key"):null,id=bucket+"/"+key,now=Date.now(),item=data.get(id);
  const error=code=>{throw Object.assign(Error(code),{providerCode:code});};
  if(op==="get-bucket-versioning")return {Status:"Enabled"};
  if(op==="get-bucket-tagging")return {TagSet:[{Key:"Purpose",Value:"MergeProofDisposableRetentionLab"}]};
  if(op==="get-object-lock-configuration")return {ObjectLockConfiguration:{ObjectLockEnabled:"Enabled",Rule:{DefaultRetention:{Mode:"COMPLIANCE",Days:30}}}};
  if(op==="put-bucket-lifecycle-configuration")return {};
  if(op==="put-object"||op==="copy-object"){
   if(op==="copy-object"&&state.copyFailure)error("AccessDenied");
   const bytes=op==="put-object"?fs.readFileSync(get("--body")):data.get(get("--copy-source").split("?")[0]).bytes;
   const lockUntil=args.includes("--object-lock-retain-until-date")?new Date(Math.floor(Date.parse(get("--object-lock-retain-until-date"))/1000)*1000-state.retentionShortfallMs).toISOString():state.defaultComplianceRetention?new Date(Math.floor((now+31*86400000)/1000)*1000).toISOString():undefined;
   const value={bytes,VersionId:String(++sequence),ContentLength:bytes.length,ChecksumSHA256:crypto.createHash("sha256").update(bytes).digest("base64"),...(args.includes("--object-lock-mode")?{ObjectLockMode:get("--object-lock-mode"),ObjectLockRetainUntilDate:lockUntil}:state.defaultComplianceRetention?{ObjectLockMode:"COMPLIANCE",ObjectLockRetainUntilDate:lockUntil}:{} )};data.set(id,value);return {VersionId:value.VersionId};
  }
  if(op==="head-object"){if(!item)error("404");return item;}
  if(op==="get-object"){if(!item)error("NoSuchKey");a.equal(get("--version-id"),item.VersionId);fs.writeFileSync(args.at(-1),item.bytes);return {};}
  if(op==="get-object-retention")return {Retention:{Mode:item.ObjectLockMode,RetainUntilDate:item.ObjectLockRetainUntilDate}};
  if(op==="put-object-retention"){if(!state.allowRetentionRenewal)error("AccessDenied");const retention=JSON.parse(get("--retention"));item.ObjectLockMode=retention.Mode;item.ObjectLockRetainUntilDate=new Date(Math.floor(Date.parse(retention.RetainUntilDate)/1000)*1000-state.retentionReadbackShortfallMs).toISOString();return {};}
  if(op==="delete-object"){if(item&&Date.parse(item.ObjectLockRetainUntilDate)>now&&!state.expire)error("AccessDenied");data.delete(id);return {};}
  if(op==="list-object-versions")return {IsTruncated:false,Versions:state.expire?[]:[...data].filter(([k])=>k.startsWith(bucket+"/"+get("--prefix"))).map(([k,v])=>({Key:k.slice(bucket.length+1),VersionId:v.VersionId}))};
  throw Error("UNEXPECTED_PROVIDER_OPERATION "+op);
 }});
 return {make,data,calls,state};
}
const accounts=prefix=>({primary:{accountId:"111111111111",region:"us-east-1",bucket:prefix+"111111111111-us-east-1"},recovery:{accountId:"222222222222",region:"us-west-2",bucket:prefix+"222222222222-us-west-2"}});
test("cross-account backup only succeeds after recovery readback; recovery needs no primary identity",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-cloud-backup-")),store=new Store(path.join(root,"state"));t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});const service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});await service.run("fixture/public",1,{token:"fixture"});
 const mirror=path.join(root,"mirrors/1");fs.mkdirSync(mirror,{recursive:true});require("node:child_process").execFileSync("git",["init","--bare","-q",mirror]);
 const local=path.join(root,"local");backup.create({stateDir:store.root,mirrorRoot:path.join(root,"mirrors"),output:local,sourceCommit:"a".repeat(40)});
 const c={environment:"nonproduction",backup:local,record:path.join(root,"confirmed.json"),...accounts("merge-proof-backup-")},p=provider();
 p.state.copyFailure=true;await a.rejects(cloud.upload(c,p.make));a.equal(fs.existsSync(c.record),false);
 p.state.copyFailure=false;const result=await cloud.upload(c,p.make,{chunkBytes:1024});a.equal(result.state,"RECOVERY_MANIFEST_CONFIRMED");
 const start=p.calls.length,restored=await cloud.recover({...c,...result,writerFenced:true,destination:path.join(root,"restored")},p.make);a.equal(restored.receipts,1);a.equal(restored.currentness,"NOT_PROVEN");a.equal(require("node:child_process").execFileSync("git",["-C",path.join(root,"restored/mirrors/1"),"rev-parse","--is-bare-repository"],{encoding:"utf8"}).trim(),"true");a.ok(p.calls.slice(start).every(x=>x.account===c.recovery.accountId));
 await a.rejects(cloud.upload({...c,environment:"production"},p.make),{code:"OWNER_PRODUCTION_ACTIVATION_REQUIRED"});
 const mutationCount=p.calls.filter(x=>/^(put|copy|delete)/.test(x.op)).length;await a.rejects(cloud.upload({...c,environment:"production",productionActivationAuthorized:true},p.make),{code:"OWNER_PRODUCTION_RETENTION_REQUIRED"});a.equal(p.calls.filter(x=>/^(put|copy|delete)/.test(x.op)).length,mutationCount);
 const tampered={...result,manifestSha256:"b".repeat(64)};await a.rejects(cloud.recover({...c,...tampered,writerFenced:true,destination:path.join(root,"bad")},p.make),{code:"RECOVERY_CONFIG_INVALID"});
});
test("production renewal rounds Object Lock retention upward and rejects a genuinely short readback",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-cloud-retention-")),store=new Store(path.join(root,"state"));t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});const service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});await service.run("fixture/public",1,{token:"fixture"});
 const mirror=path.join(root,"mirrors/1");fs.mkdirSync(mirror,{recursive:true});require("node:child_process").execFileSync("git",["init","--bare","-q",mirror]);const local=path.join(root,"local");backup.create({stateDir:store.root,mirrorRoot:path.join(root,"mirrors"),output:local,sourceCommit:"a".repeat(40)});
 const manifestPath=path.join(local,"MANIFEST.json"),manifest=JSON.parse(fs.readFileSync(manifestPath));manifest.at="2026-09-21T00:00:00.999Z";fs.writeFileSync(manifestPath,JSON.stringify(manifest)+"\n");const retentionMinimum=Date.parse(manifest.at)+30*86400000,retentionFloor=Math.floor(retentionMinimum/1000)*1000,retentionCeiling=Math.ceil(retentionMinimum/1000)*1000;
 const c={environment:"nonproduction",backup:local,record:path.join(root,"confirmed.json"),...accounts("merge-proof-backup-")},p=provider();await cloud.upload(c,p.make);
 for(const [key,item] of p.data)if(key.includes("/objects/")){item.ObjectLockMode="COMPLIANCE";item.ObjectLockRetainUntilDate=new Date(retentionFloor).toISOString();}
 p.state.defaultComplianceRetention=true;p.state.allowRetentionRenewal=true;const result=await cloud.upload({...c,environment:"production",productionActivationAuthorized:true,productionComplianceRetentionAuthorized:true},p.make);a.equal(result.state,"RECOVERY_MANIFEST_CONFIRMED");
 const renewals=p.calls.filter(x=>x.op==="put-object-retention");a.ok(renewals.length>=2);a.deepEqual(new Set(renewals.map(x=>x.account)),new Set([c.primary.accountId,c.recovery.accountId]));for(const renewal of renewals){const requested=Date.parse(JSON.parse(renewal.args[renewal.args.indexOf("--retention")+1]).RetainUntilDate);a.equal(requested,retentionCeiling);a.ok(requested>=retentionMinimum);}
 const target=[...p.data.entries()].find(([key])=>key.includes("/objects/"));target[1].ObjectLockRetainUntilDate=new Date(retentionFloor).toISOString();p.state.retentionReadbackShortfallMs=1000;const shortRecord=path.join(root,"short-readback.json");await a.rejects(cloud.upload({...c,environment:"production",record:shortRecord,productionActivationAuthorized:true,productionComplianceRetentionAuthorized:true},p.make),{code:"BACKUP_RETENTION_UNAVAILABLE"});a.equal(fs.existsSync(shortRecord),false);
});
test("health uses the snapshot time and refuses missing recovery evidence; incomplete snapshots cannot justify pruning",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-monitor-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const now=Date.now(),record=path.join(root,"backup.json");fs.writeFileSync(path.join(root,"state.json"),JSON.stringify({github:{}}));
 fs.writeFileSync(record,JSON.stringify({state:"RECOVERY_MANIFEST_CONFIRMED",at:new Date(now).toISOString(),snapshotAt:new Date(now-901000).toISOString()}));
 a.equal(require("../operations/monitor").inspect({stateDir:root,backupRecord:record},now).state,"CRITICAL");fs.unlinkSync(record);a.equal(require("../operations/monitor").inspect({stateDir:root,backupRecord:record},now).alarms[0].code,"RECOVERY_BACKUP_UNAVAILABLE");
 const calls=[],aws={checkIdentity:async()=>({}),call:async(_,op,args)=>{calls.push(op);if(op==="describe-volumes")return {Volumes:[{VolumeId:"vol-abcd",Encrypted:true,Tags:[{Key:"Product",Value:"MergeProof"}]}]};if(op==="describe-snapshots")return {Snapshots:[{VolumeId:"vol-abcd",OwnerId:"111111111111",State:"pending",SnapshotId:"snap-abcd"}]};throw Error(op);}};
 const out=await require("../operations/snapshots").run({environment:"nonproduction",volumeId:"vol-abcd",aws:{accountId:"111111111111"}},()=>aws);a.equal(out.state,"SNAPSHOT_PENDING");a.ok(calls.every(x=>x.startsWith("describe")));
});
test("disposable Object Lock acceptance cannot turn elapsed retention into observed lifecycle expiration",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-retention-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const now=1700000000999;t.mock.method(Date,"now",()=>now);const c={environment:"disposable-nonproduction",record:path.join(root,"record.json"),...accounts("merge-proof-lock-lab-")},p=provider();
 const prepared=await lab.prepare(c,p.make),requested=Date.parse(prepared.retainedUntil);a.equal(prepared.state,"WAITING_FOR_RETENTION_AND_LIFECYCLE_EXPIRATION");a.ok(requested>=now+180000);a.ok(requested<now+181000);a.equal(requested,now+180001);a.equal(requested%1000,0);for(const object of p.data.values())a.equal(Date.parse(object.ObjectLockRetainUntilDate),requested);a.equal((await lab.finish(c,p.make)).reason,"RETENTION_HAS_NOT_EXPIRED");
 // Model passage of time for this unit fixture; not retained as live evidence.
 prepared.retainedUntil=new Date(Date.now()-1000).toISOString();for(const object of p.data.values())object.ObjectLockRetainUntilDate=prepared.retainedUntil;fs.writeFileSync(c.record,JSON.stringify(prepared));
 a.equal((await lab.finish(c,p.make)).reason,"S3_LIFECYCLE_EXPIRATION_PENDING");p.state.expire=true;a.equal((await lab.finish(c,p.make)).state,"DISPOSABLE_LIFECYCLE_ACCEPTED");
 await a.rejects(lab.environment({...c,environment:"production"},p.make),{code:"DISPOSABLE_CROSS_ACCOUNT_LAB_REQUIRED"});
});
test("Object Lock acceptance rejects a genuinely short provider retention",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-retention-short-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const c={environment:"disposable-nonproduction",record:path.join(root,"record.json"),...accounts("merge-proof-lock-lab-")},p=provider();p.state.retentionShortfallMs=1000;
 await a.rejects(lab.prepare(c,p.make),{code:"RETENTION_NOT_CONFIRMED"});
});
test("preparatory infrastructure has no product deployment/publication or production retention; roles stay separated",()=>{
 const {template}=require("../operations/prepare-infrastructure"),primary=template("primary"),recovery=template("recovery");
 a.equal(primary.Resources.Instance.Properties.InstanceType,"t3.medium");a.equal(primary.Resources.Instance.Properties.MetadataOptions.HttpTokens,"required");a.deepEqual(primary.Resources.SecurityGroup.Properties.SecurityGroupIngress,[]);
 a.equal(primary.Resources.CpuCreditBalance.Properties.MetricName,"CPUCreditBalance");a.equal(primary.Resources.CpuCreditBalance.Properties.Threshold,20);a.equal(primary.Resources.CpuCreditBalance.Properties.Period,300);a.equal(primary.Resources.CpuCreditBalance.Properties.EvaluationPeriods,2);a.equal(primary.Resources.CpuCreditBalance.Properties.DatapointsToAlarm,2);
 a.equal(primary.Resources.WarningHealth.Properties.MetricName,"WarningHealth");a.equal(primary.Resources.MemoryWarning.Properties.Threshold,85);a.equal(primary.Resources.MemoryCritical.Properties.Threshold,95);
 a.equal(primary.Resources.MonitorLogs.Properties.LogGroupName,"/merge-proof/preparation/monitor");a.equal(primary.Resources.MonitorLogs.Properties.RetentionInDays,30);a.equal(primary.Resources.MonitorLogStream.Properties.LogStreamName,"health");
 const hostPolicy=JSON.stringify(primary.Resources.HostPolicy);a.match(hostPolicy,/logs:CreateLogStream/);a.match(hostPolicy,/logs:PutLogEvents/);a.match(hostPolicy,/merge-proof\/preparation\/monitor:log-stream:health/);
 for(const t of [primary,recovery]){a.equal(t.Resources.Backups.Properties.ObjectLockEnabled,undefined);a.equal(t.Resources.RetentionLab.Properties.ObjectLockEnabled,true);a.equal(t.Resources.SigningKey.Properties.KeySpec,"ECC_NIST_P256");a.equal(t.Resources.SignerPolicy.Properties.PolicyDocument.Statement[0].Action,"kms:Sign");a.ok(!JSON.stringify(t.Resources.BackupRole).includes("DeleteObject"));}
 a.equal(recovery.Resources.Instance,undefined);a.deepEqual(recovery.Resources.SignerRole.Properties.AssumeRolePolicyDocument.Statement[0].Principal,{AWS:{Ref:"KeyAdministratorArn"}});
});
test("a completed daily checkpoint cannot hide a later receipt signing outage; real success clears its alarm",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-sign-health-")),store=new Store(root);t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
 let fail=false;const key=crypto.generateKeyPairSync("ec",{namedCurve:"P-256"}),signer=async bytes=>{if(fail)throw Object.assign(Error("fixture signer refused"),{code:"KMS_SIGNATURE_INVALID"});return {keyid:"health-fixture",sig:crypto.sign("sha256",bytes,key.privateKey).toString("base64")};};
 const service=new ProofService({store,receiptSigner:signer,clientFactory:()=>new Client(fixtureFetch())});await service.run("fixture/public",1,{token:"fixture"});await service.checkpoint(new Date(Date.now()-86400000).toISOString().slice(0,10));
 fail=true;await a.rejects(service.run("fixture/public",1,{token:"fixture"}),{code:"KMS_SIGNATURE_INVALID"});await service.drain();service.save();
 a.equal(service.data.operatorLogHealth,"DAILY_ROOT_PREPARED");a.equal(service.data.signingHealth.state,"UNAVAILABLE");
 const config={stateDir:root,backupRecord:path.join(root,"missing-backup")};a.ok(require("../operations/monitor").inspect(config).alarms.some(x=>x.code==="RECEIPT_SIGNING_UNAVAILABLE"));
 fail=false;await service.run("fixture/public",1,{token:"fixture"});a.equal(service.data.signingHealth.state,"AVAILABLE");a.ok(!require("../operations/monitor").inspect(config).alarms.some(x=>x.code==="RECEIPT_SIGNING_UNAVAILABLE"));
});
