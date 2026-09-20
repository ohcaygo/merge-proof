#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{assert}=require("../common");
async function run(config){
 require("./authority").environment(config);assert(path.isAbsolute(config.workRoot)&&path.isAbsolute(config.record),"BACKUP_JOB_CONFIG_INVALID");
 if(config.environment==="production")assert(config.snapshot.factoryStateDir,"FULL_ORIGIN_STATE_REQUIRED");
 fs.mkdirSync(config.workRoot,{recursive:true,mode:0o700});const lock=path.join(config.workRoot,"job.lock");
 if(fs.existsSync(lock)){assert(fs.lstatSync(lock).isFile(),"BACKUP_LOCK_INVALID");const previous=JSON.parse(fs.readFileSync(lock));assert(Number.isSafeInteger(previous.pid)&&previous.pid>0&&/^[a-f0-9-]{36}$/.test(previous.directory),"BACKUP_LOCK_INVALID");try{process.kill(previous.pid,0);assert(false,"BACKUP_JOB_BUSY");}catch(e){if(e.code!=="ESRCH")throw e;}fs.rmSync(path.join(config.workRoot,previous.directory),{recursive:true,force:true});fs.unlinkSync(lock);}
 const fd=fs.openSync(lock,"wx",0o600),directory=crypto.randomUUID(),output=path.join(config.workRoot,directory);fs.writeFileSync(fd,JSON.stringify({pid:process.pid,directory}));
 try{require("./backup").create({...config.snapshot,output});return await require("./backup-cycle").upload({...config,backup:output});}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);if(fs.existsSync(output))fs.rmSync(output,{recursive:true,force:true});}
}
if(require.main===module)run(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"BACKUP_JOB_FAILED");process.exitCode=2;});
module.exports={run};
