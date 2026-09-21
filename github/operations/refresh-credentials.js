#!/usr/bin/env node
"use strict";
// Root-only bootstrap boundary. Individual workloads receive only their own
// Secrets Manager material and temporary role credentials in private tmpfs dirs.
const fs=require("node:fs"),path=require("node:path"),{assert}=require("../common"),{client}=require("./aws"),healthcheck=require("./healthcheck");
function secureDirectory(dir,gid,mode){
 try{fs.mkdirSync(dir,{mode});}catch(e){if(e.code!=="EEXIST")throw e;}
 const st=fs.lstatSync(dir);
 assert(st.isDirectory()&&st.uid===process.getuid()&&!(st.mode&0o022),"CREDENTIAL_DIRECTORY_UNSAFE");
 fs.chmodSync(dir,mode);fs.chownSync(dir,process.getuid(),gid);
}
function atomic(file,body,uid,gid){
 const dir=path.dirname(file),st=fs.lstatSync(dir);
 assert(st.isDirectory()&&st.uid===process.getuid()&&!(st.mode&0o022),"CREDENTIAL_DIRECTORY_UNSAFE");
 const temp=file+"."+require("node:crypto").randomUUID()+".tmp";
 const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{
  try{fs.writeFileSync(fd,body);fs.fchownSync(fd,uid,gid);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);const parent=fs.openSync(dir,"r");try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function projectHealthchecks(primary,root="/run/merge-proof-credentials",gid=process.getgid()){
 const dir=path.join(root,"monitor"),file=path.join(dir,"healthchecks.json");
 secureDirectory(dir,gid,0o700);
 const healthchecks=primary?.monitor?.healthchecks;
 if(healthchecks===undefined){
  try{
   const st=fs.lstatSync(file);
   assert(st.isFile()&&st.uid===process.getuid()&&(st.mode&0o777)===0o600,"CREDENTIAL_DIRECTORY_UNSAFE");
   fs.unlinkSync(file);
  }catch(error){if(error.code!=="ENOENT")throw error;}
  return;
 }
 assert(healthchecks&&typeof healthchecks==="object"&&!Array.isArray(healthchecks)&&typeof healthchecks.service==="string"&&typeof healthchecks.backup==="string","HEALTHCHECK_CONFIG_INVALID");
 healthcheck.assertUrlPair(healthchecks.service,healthchecks.backup);
 atomic(file,JSON.stringify({service:healthchecks.service,backup:healthchecks.backup})+"\n",process.getuid(),gid);
}
async function refresh(config,aws=client(config.aws)){
 assert(process.getuid?.()===0,"ROOT_BOOTSTRAP_REQUIRED");
 require("./authority").environment(config);
 assert([config.proofUid,config.policyUid,config.backupUid].every(n=>Number.isInteger(n)&&n>0)&&new Set([config.proofUid,config.policyUid,config.backupUid]).size===3,"SEPARATE_WORKLOAD_IDENTITIES_REQUIRED");
 assert([config.proofGid,config.policyGid,config.backupGid].every(n=>Number.isInteger(n)&&n>0),"SEPARATE_WORKLOAD_IDENTITIES_REQUIRED");
 await aws.checkIdentity();const root="/run/merge-proof-credentials";secureDirectory(root,0,0o711);
 // Recipients can traverse/read their material but cannot replace directory
 // entries used by this privileged writer, including while refresh is running.
 for(const [name,gid] of [["proof",config.proofGid],["policy",config.policyGid],["backup",config.backupGid]])secureDirectory(path.join(root,name),gid,0o710);
 const secret=async arn=>{assert(new RegExp(`^arn:aws:secretsmanager:${config.aws.region}:${config.aws.accountId}:secret:merge-proof/preparation/`).test(arn),"EXACT_PREPARATION_SECRET_REQUIRED");const r=await aws.call("secretsmanager","get-secret-value",["--secret-id",arn]);assert(r.ARN===arn&&typeof r.SecretString==="string","SECRET_IDENTITY_MISMATCH");return r.SecretString;};
 const primary=JSON.parse(await secret(config.primarySecretArn)),policy=JSON.parse(await secret(config.companionSecretArn)),key=await secret(config.companionKeyArn);
 assert(primary.app&&primary.factory&&primary.app.appId!==policy.appId&&!primary.app.enhancedPolicy?.privateKey,"CREDENTIAL_BOUNDARY_INVALID");
 projectHealthchecks(primary);
 const enhanced={appId:policy.appId,appSlug:config.companionSlug,socketPath:"/run/merge-proof-policy/reader.sock",grantsPath:"/var/lib/merge-proof-grants/consent.json"};
 atomic(root+"/proof/app.json",JSON.stringify({...primary.app,enhancedPolicy:enhanced}),config.proofUid,config.proofGid);
 atomic(root+"/proof/factory.json",JSON.stringify(primary.factory),config.proofUid,config.proofGid);
 atomic(root+"/policy/key.pem",key,config.policyUid,config.policyGid);
 atomic(root+"/policy/config.json",JSON.stringify({appId:policy.appId,webhookSecret:policy.webhookSecret,privateKeyPath:root+"/policy/key.pem",proofUid:config.proofUid,socketPath:enhanced.socketPath,grantsPath:enhanced.grantsPath}),config.policyUid,config.policyGid);
 for(const [name,role,uid,gid] of [["proof",config.signerRoleArn,config.proofUid,config.proofGid],["backup",config.backupRoleArn,config.backupUid,config.backupGid]]){
  assert(new RegExp(`^arn:aws:iam::${config.aws.accountId}:role/[A-Za-z0-9+=,.@_/-]+$`).test(role),"EXACT_WORKLOAD_ROLE_REQUIRED");
  const r=await aws.call("sts","assume-role",["--role-arn",role,"--role-session-name",`merge-proof-${name}`,"--duration-seconds","1800"]),c=r.Credentials;
  assert(c?.AccessKeyId?.startsWith("ASIA")&&c.SecretAccessKey&&c.SessionToken&&Date.parse(c.Expiration)>Date.now()+600000&&Date.parse(c.Expiration)<=Date.now()+3600000,"TEMPORARY_WORKLOAD_CREDENTIALS_REQUIRED");
  assert([c.AccessKeyId,c.SecretAccessKey,c.SessionToken].every(x=>typeof x==="string"&&!/[\r\n]/.test(x)),"CREDENTIAL_ENCODING_INVALID");
  atomic(root+`/${name}/aws`, `[default]\naws_access_key_id=${c.AccessKeyId}\naws_secret_access_key=${c.SecretAccessKey}\naws_session_token=${c.SessionToken}\n`,uid,gid);
 }
 return {state:"SEPARATE_TEMPORARY_CREDENTIALS_WRITTEN",at:new Date().toISOString()};
}
if(require.main===module){try{const file=process.argv[2],st=fs.lstatSync(file);assert(st.isFile()&&st.uid===0&&(st.mode&0o077)===0,"ROOT_BOOTSTRAP_CONFIG_REQUIRED");refresh(JSON.parse(fs.readFileSync(file))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"CREDENTIAL_REFRESH_UNAVAILABLE");process.exitCode=2;});}catch(e){console.error(e.code||"CREDENTIAL_REFRESH_UNAVAILABLE");process.exitCode=2;}}
module.exports={refresh,atomic,secureDirectory,projectHealthchecks};
