#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{assert}=require("../common");
async function run(c){
 assert(c.environment==="nonproduction"&&path.isAbsolute(c.workRoot)&&path.isAbsolute(c.result),"ISOLATED_RESTORE_DRILL_REQUIRED");
 const checkpoint=JSON.parse(fs.readFileSync(c.backupRecord));assert(checkpoint.state==="RECOVERY_MANIFEST_CONFIRMED","RECOVERY_MANIFEST_REQUIRED");fs.mkdirSync(c.workRoot,{recursive:true,mode:0o700});const destination=path.join(c.workRoot,crypto.randomUUID()),start=Date.now();
 try{
  const restored=await require("./backup-cycle").recover({...c,...checkpoint,environment:"nonproduction",destination,writerFenced:true});
  const trust=require("./verify-restored").verify({...c,backup:destination});
  // The destination is new and never starts a writer or sends a provider event.
  // Cold-host provisioning/fencing time must be measured in host acceptance too.
  const result={...restored,trust,elapsedSeconds:(Date.now()-start)/1000,snapshotAgeSeconds:(start-Date.parse(checkpoint.snapshotAt))/1000,hostRecoveryRto:"NOT_PROVEN",at:new Date().toISOString()};
  fs.writeFileSync(c.result,JSON.stringify(result)+"\n",{mode:0o600});return result;
 }finally{if(fs.existsSync(destination))fs.rmSync(destination,{recursive:true,force:true});}
}
if(require.main===module)run(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"RESTORE_DRILL_FAILED");process.exitCode=2;});
module.exports={run};
