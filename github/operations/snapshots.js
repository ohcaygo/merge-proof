#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),{assert}=require("../common"),{client}=require("./aws");
async function run(c,make=client){
 require("./authority").environment(c);assert(/^vol-[a-f0-9]+$/.test(c.volumeId),"EXACT_STATE_VOLUME_REQUIRED");const aws=make(c.aws);await aws.checkIdentity();
 const volumes=await aws.call("ec2","describe-volumes",["--volume-ids",c.volumeId]),volume=volumes.Volumes?.[0];assert(volume?.VolumeId===c.volumeId&&volume.Encrypted&&volume.Tags?.some(t=>t.Key==="Product"&&t.Value==="MergeProof"),"OWNED_ENCRYPTED_STATE_VOLUME_REQUIRED");
 const rows=(await aws.call("ec2","describe-snapshots",["--owner-ids",c.aws.accountId,"--filters",`Name=volume-id,Values=${c.volumeId}`,"Name=tag:Product,Values=MergeProof"])).Snapshots||[],now=Date.now();
 assert(rows.every(r=>r.VolumeId===c.volumeId&&r.OwnerId===c.aws.accountId),"SNAPSHOT_SCOPE_MISMATCH");
 const pending=rows.some(r=>r.State==="pending"),recent=rows.some(r=>r.State==="completed"&&now-Date.parse(r.StartTime)<23*3600000);
 let created=null;if(!pending&&!recent)created=await aws.call("ec2","create-snapshot",["--volume-id",c.volumeId,"--description","Merge-Proof secondary crash-consistent recovery snapshot","--tag-specifications",JSON.stringify([{ResourceType:"snapshot",Tags:[{Key:"Product",Value:"MergeProof"},{Key:"SourceVolume",Value:c.volumeId}]}])]);
 const complete=rows.filter(r=>r.State==="completed").sort((a,b)=>Date.parse(b.StartTime)-Date.parse(a.StartTime)),keep=new Set(complete.slice(0,7).map(r=>r.SnapshotId)),weeks=new Set();
 for(const row of complete){const week=Math.floor(Date.parse(row.StartTime)/(7*86400000));if(weeks.size<4&&!weeks.has(week)){weeks.add(week);keep.add(row.SnapshotId);}}
 const deleted=[];for(const row of complete){if(keep.has(row.SnapshotId)||!row.Tags?.some(t=>t.Key==="SourceVolume"&&t.Value===c.volumeId)||complete.length<7)continue;await aws.call("ec2","delete-snapshot",["--snapshot-id",row.SnapshotId]);deleted.push(row.SnapshotId);}
 return {state:created?"SNAPSHOT_PENDING":recent?"RECENT_SNAPSHOT_OBSERVED":"SNAPSHOT_PENDING",created:created?.SnapshotId||null,deleted,limitation:"Secondary crash-consistent snapshot; complete archive recovery is established by the separate checked S3 restore."};
}
if(require.main===module)run(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"SNAPSHOT_UNAVAILABLE");process.exitCode=2;});
module.exports={run};
