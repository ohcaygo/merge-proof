#!/usr/bin/env node
"use strict";
// Private content-addressed export. Atomic state is the boundary; immutable
// archives form its checked closure. Hold the existing mirror locks while
// retaining Git objects. No service configuration or credential directory is read.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {assert,hash}=require("../common"),{Archive}=require("../archive");
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const safe=p=>typeof p==="string"&&!path.isAbsolute(p)&&p.split("/").every(x=>x&&x!=="."&&x!=="..");
function sync(dir){const fd=fs.openSync(dir,"r");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function mkdir(dir){if(fs.existsSync(dir))return;mkdir(path.dirname(dir));fs.mkdirSync(dir,{mode:0o700});sync(path.dirname(dir));}
function write(file,bytes){mkdir(path.dirname(file));const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(path.dirname(file));}
function digestFile(file){const h=crypto.createHash("sha256"),fd=fs.openSync(file,"r"),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest("hex");}
function copyFile(source,destination){mkdir(path.dirname(destination));fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);fs.chmodSync(destination,0o600);const fd=fs.openSync(destination,"r");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(path.dirname(destination));}
function walk(root,visit,base=""){
 assert(fs.lstatSync(root).isDirectory(),"BACKUP_SYMLINK_DENIED");
 for(const name of fs.readdirSync(path.join(root,base)).sort()){
  if(name.endsWith(".lock")||name.endsWith(".tmp")||name.startsWith("tmp_"))continue;
  const relative=base?base+"/"+name:name,st=fs.lstatSync(path.join(root,relative));
  assert(!st.isSymbolicLink(),"BACKUP_SYMLINK_DENIED");
  if(st.isDirectory())walk(root,visit,relative);else{assert(st.isFile(),"BACKUP_SPECIAL_FILE_DENIED");visit(relative);}
 }
}
function closure(root){
 const state=JSON.parse(fs.readFileSync(path.join(root,"proof/state.json"))),data=state.github;
 assert(data&&data.receipts&&data.merges,"BACKUP_PROOF_STATE_REQUIRED");
 const archive=new Archive(path.join(root,"proof/receipt-archive"));let receipts=0;
 for(const row of Object.values(data.receipts)){const stored=archive.get(row.receipt.receiptId);assert(stored&&hash(stored.receipt)===hash(row.receipt),"BACKUP_RECEIPT_CLOSURE_INCOMPLETE");}
 for(const row of data.merges.records){assert(hash(archive.mergeRecord(row.recordId))===hash(row),"BACKUP_MERGE_CLOSURE_INCOMPLETE");}
 const directory=path.join(archive.root,"receipts");
 if(fs.existsSync(directory))walk(directory,relative=>{
  const row=JSON.parse(fs.readFileSync(path.join(directory,relative)));
  assert(row.receipt&&row.artifacts?.policy&&require("../bundle").replay(row.receipt,row.artifacts.policy).state==="CONSISTENT_OFFLINE","BACKUP_REPLAY_FAILED");receipts++;
 });
 // Validate every index against its immutable landing/merge object.
 for(const category of ["commits","receipt-landings"])if(fs.existsSync(path.join(archive.root,category)))walk(path.join(archive.root,category),relative=>{
  const index=JSON.parse(fs.readFileSync(path.join(archive.root,category,relative)));assert(/^[a-f0-9]{64}$/.test(index.id),"BACKUP_INDEX_INVALID");
  const landing=JSON.parse(fs.readFileSync(path.join(archive.root,"landings",index.id+".json")));assert(hash(landing)===index.id,"BACKUP_LANDING_CLOSURE_INCOMPLETE");
 });
 for(const [id,observation] of Object.entries(data.landings||{})){
  const record=archive.mergeRecord(id);assert(record,"BACKUP_MERGE_CLOSURE_INCOMPLETE");
  const {observationId,...immutable}=observation;
  assert(fs.existsSync(path.join(archive.root,"landings",hash({record,observation:immutable})+".json")),"BACKUP_LANDING_CLOSURE_INCOMPLETE");
 }
 require("../operator-log").validate(data.operatorLog||[]);
 for(const entry of data.operatorLog||[]){const row=archive.get(entry.receiptId);assert(row&&hash(row.artifacts?.envelope)===entry.envelopeDigest,"BACKUP_LOG_CLOSURE_INCOMPLETE");}
 const factoryFile=path.join(root,"factory/state.json");
 if(fs.existsSync(factoryFile))for(const order of Object.values(JSON.parse(fs.readFileSync(factoryFile)).orders||{}))if(!order.expiredAt)for(const run of order.runs||[])for(const name of run.files||[]){
  assert(/^[a-f0-9]{64}$/.test(order.id)&&/^[a-f0-9]{64}$/.test(run.id)&&/^[\w.-]+$/.test(name)&&name!=="."&&name!=="..","BACKUP_FACTORY_REFERENCE_INVALID");
  assert(fs.existsSync(path.join(root,"factory/artifacts",order.id,run.id,name)),"BACKUP_FACTORY_CLOSURE_INCOMPLETE");
 }
 return {receipts,operatorEntries:data.operatorLog?.length||0,factoryIncluded:fs.existsSync(factoryFile)};
}
function verify(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,"MANIFEST.json")));assert(manifest.schema==="urn:merge-proof:private-backup:1"&&Array.isArray(manifest.files)&&manifest.files.length>0,"BACKUP_MANIFEST_INVALID");
 const names=new Set();for(const row of manifest.files){
  assert(safe(row.path)&&!names.has(row.path)&&/^[a-f0-9]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.size)&&row.size>=0,"BACKUP_MANIFEST_INVALID");names.add(row.path);
  assert(row.path==="proof/state.json"||row.path.startsWith("proof/receipt-archive/")||/^mirrors\/[1-9][0-9]*\//.test(row.path)||row.path==="factory/state.json"||/^factory\/artifacts\/[a-f0-9]{64}\/[a-f0-9]{64}\/[\w.-]+$/.test(row.path),"BACKUP_PATH_DENIED");
  let parent=directory;for(const part of row.path.split("/")){parent=path.join(parent,part);assert(!fs.lstatSync(parent).isSymbolicLink(),"BACKUP_SYMLINK_DENIED");}
  assert(fs.statSync(parent).size===row.size&&digestFile(parent)===row.sha256,"BACKUP_DIGEST_MISMATCH");
 }
 assert(names.has("proof/state.json"),"BACKUP_MANIFEST_INVALID");
 // No unmanifested archive/index can influence replay or restored state.
 walk(directory,relative=>{assert(relative==="MANIFEST.json"||names.has(relative),"BACKUP_UNMANIFESTED_FILE");});
 return {state:"BACKUP_INTEGRITY_CHECKED",manifestDigest:hash(manifest),...closure(directory),manifest};
}
function create(config){
 assert([config.stateDir,config.mirrorRoot,config.output].every(p=>typeof p==="string"&&path.isAbsolute(p))&&/^[a-f0-9]{40}$/.test(config.sourceCommit),"BACKUP_CONFIG_INVALID");
 assert(!fs.existsSync(config.output),"BACKUP_DESTINATION_EXISTS");assert(fs.lstatSync(config.stateDir).isDirectory()&&fs.lstatSync(path.join(config.stateDir,"state.json")).isFile(),"BACKUP_SYMLINK_DENIED");
 const locks=[];fs.mkdirSync(config.output,{mode:0o700});
 try{
  const mirrors=fs.existsSync(config.mirrorRoot)?fs.readdirSync(config.mirrorRoot).filter(n=>/^[1-9][0-9]*$/.test(n)):[];
  for(const id of mirrors){const lock=path.join(config.mirrorRoot,id,"merge-proof.lock");
   assert(fs.lstatSync(path.join(config.mirrorRoot,id)).isDirectory(),"BACKUP_SYMLINK_DENIED");
   if(fs.existsSync(lock)){assert(fs.lstatSync(lock).isFile(),"MIRROR_LOCK_UNRESOLVED");let owner;try{owner=JSON.parse(fs.readFileSync(lock));}catch{assert(false,"MIRROR_BUSY_OR_UNAVAILABLE");}assert(Number.isSafeInteger(owner.pid)&&owner.pid>0,"MIRROR_LOCK_UNRESOLVED");try{process.kill(owner.pid,0);assert(false,"MIRROR_BUSY_OR_UNAVAILABLE");}catch(e){if(e.code==="ESRCH")fs.unlinkSync(lock);else throw e;}}
   const fd=fs.openSync(lock,"wx",0o600);locks.push({lock,fd});fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));}
  const capturedAt=new Date().toISOString(),stateBytes=fs.readFileSync(path.join(config.stateDir,"state.json")),files=[];
  const copy=(relative,bytes)=>{const target=path.join(config.output,relative);if(Buffer.isBuffer(bytes))write(target,bytes);else if(relative.startsWith("proof/receipt-archive/")||/^mirrors\/[0-9]+\/objects\//.test(relative)){
    // Immutable records/objects can share storage on the same filesystem.
    // Never chmod or modify the linked inode. Metadata files are copied.
    mkdir(path.dirname(target));try{fs.linkSync(bytes,target);sync(path.dirname(target));}catch(e){if(e.code!=="EXDEV")throw e;copyFile(bytes,target);}
   }else copyFile(bytes,target);files.push({path:relative,size:fs.statSync(target).size,sha256:digestFile(target)});};
  copy("proof/state.json",stateBytes);
  if(config.factoryStateDir){assert(path.isAbsolute(config.factoryStateDir)&&fs.lstatSync(config.factoryStateDir).isDirectory()&&fs.lstatSync(path.join(config.factoryStateDir,"state.json")).isFile(),"BACKUP_CONFIG_INVALID");const factoryBytes=fs.readFileSync(path.join(config.factoryStateDir,"state.json"));copy("factory/state.json",factoryBytes);
   for(const order of Object.values(JSON.parse(factoryBytes).orders||{}))if(!order.expiredAt)for(const run of order.runs||[])for(const name of run.files||[]){assert(/^[a-f0-9]{64}$/.test(order.id)&&/^[a-f0-9]{64}$/.test(run.id)&&/^[\w.-]+$/.test(name)&&name!=="."&&name!=="..","BACKUP_FACTORY_REFERENCE_INVALID");const relative=`artifacts/${order.id}/${run.id}/${name}`,source=path.join(config.factoryStateDir,relative);let parent=config.factoryStateDir;for(const part of relative.split("/")){parent=path.join(parent,part);assert(!fs.lstatSync(parent).isSymbolicLink(),"BACKUP_SYMLINK_DENIED");}assert(fs.lstatSync(source).isFile(),"BACKUP_FACTORY_FILE_INVALID");copy("factory/"+relative,source);}
  }
  const archive=path.join(config.stateDir,"receipt-archive");assert(fs.existsSync(archive),"BACKUP_ARCHIVE_REQUIRED");
  walk(archive,relative=>copy("proof/receipt-archive/"+relative,path.join(archive,relative)));
  for(const id of mirrors)walk(path.join(config.mirrorRoot,id),relative=>copy("mirrors/"+id+"/"+relative,path.join(config.mirrorRoot,id,relative)));
  const manifest={schema:"urn:merge-proof:private-backup:1",sourceCommit:config.sourceCommit,at:capturedAt,stateDigest:digest(stateBytes),files};
  write(path.join(config.output,"MANIFEST.json"),JSON.stringify(manifest)+"\n");
  const checked=verify(config.output),dir=fs.openSync(config.output,"r");try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  return checked;
 }finally{for(const {lock,fd} of locks){fs.closeSync(fd);fs.unlinkSync(lock);}}
}
function restore(config){
 assert(path.isAbsolute(config.backup)&&path.isAbsolute(config.destination)&&config.writerFenced===true,"RESTORE_FENCE_REQUIRED");
 assert(!fs.existsSync(config.destination),"RESTORE_DESTINATION_EXISTS");const checked=verify(config.backup);
 fs.mkdirSync(config.destination,{mode:0o700});
 for(const row of checked.manifest.files)copyFile(path.join(config.backup,row.path),path.join(config.destination,row.path));
 write(path.join(config.destination,"MANIFEST.json"),fs.readFileSync(path.join(config.backup,"MANIFEST.json")));
 return {...verify(config.destination),state:"RESTORED_HISTORICAL_ONLY",currentness:"NOT_PROVEN"};
}
if(require.main===module){try{const config=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));assert(["create","restore","verify"].includes(process.argv[2]),"BACKUP_OPERATION_INVALID");const out=process.argv[2]==="create"?create(config):process.argv[2]==="restore"?restore(config):verify(config.backup);console.log(JSON.stringify({...out,manifest:undefined}));}catch(e){console.error(e.code||"BACKUP_UNAVAILABLE");process.exitCode=2;}}
module.exports={create,verify,restore,digest,digestFile};
