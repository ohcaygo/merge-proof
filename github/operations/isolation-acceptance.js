#!/usr/bin/env node
"use strict";
// Disposable Linux UID/Unix-socket acceptance. No account creation, GitHub
// credential, cloud metadata or administration mutation is involved.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),cp=require("node:child_process"),{assert}=require("../common");
async function run(){
 assert(process.platform==="linux"&&process.getuid()===0,"DISPOSABLE_LINUX_ROOT_REQUIRED");
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-uid-acceptance-")),proof=65534,policy=65533,checks=[];let child;
 const file=(name,body,uid,mode=0o600)=>{const p=path.join(root,name);fs.writeFileSync(p,body,{mode});fs.chownSync(p,uid,policy);return p;};
 try{
  fs.chmodSync(root,0o750);fs.chownSync(root,policy,policy);
  const key=file("policy-key.pem",crypto.generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"}),policy),primary=file("proof-secret","isolated-primary-fixture",proof),grants=file("consent.json","{}",proof,0o640),socketPath=path.join(root,"p.sock");
  const config=file("policy-config.json",JSON.stringify({proofUid:proof,appId:77,webhookSecret:"fixture-secret-for-disposable-isolation-only",privateKeyPath:key,grantsPath:grants,socketPath}),policy);
  const as=(uid,code,args=[])=>cp.spawnSync(process.execPath,["-e",code,...args],{uid,gid:policy,encoding:"utf8",timeout:15000});
  for(const [uid,target,name] of [[proof,key,"proof-cannot-read-companion-key"],[proof,config,"proof-cannot-read-companion-config"],[policy,primary,"companion-cannot-read-primary-secret"]]){
   const r=as(uid,"try{require('fs').readFileSync(process.argv[1]);process.exit(2)}catch(e){process.exit(e.code==='EACCES'?0:3)}",[target]);assert(r.status===0,"CREDENTIAL_READ_ISOLATION_FAILED");checks.push(name);
  }
  child=cp.spawn(process.execPath,[path.resolve(__dirname,"../policy-broker.js"),config],{uid:policy,gid:policy,stdio:["ignore","ignore","pipe"]});let failed=false;child.on("error",()=>failed=true);child.on("exit",()=>failed=true);
  for(let n=0;n<100&&!fs.existsSync(socketPath)&&!failed;n++)await new Promise(r=>setTimeout(r,20));assert(!failed&&fs.existsSync(socketPath),"ISOLATED_BROKER_START_FAILED");
  const result=as(proof,`const http=require('http');const r=http.request({socketPath:process.argv[1],method:'POST',path:'/v1/observe'},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>process.exit(res.statusCode===403&&JSON.parse(body).error==='INVALID_SCOPE'?0:2));});r.on('error',()=>process.exit(3));r.end(JSON.stringify({repository:'fixture/public',repositoryId:1,accountId:2,primaryInstallationId:3,method:'DELETE',url:'/repos/fixture/public'}));`,[socketPath]);
  assert(result.status===0,"IPC_MUTATION_REFUSAL_FAILED");checks.push("separate-proof-uid-ipc-rejects-mutation-before-provider-auth");
  return {state:"LINUX_UID_ISOLATION_ACCEPTED",checks,limitation:"Disposable OS/process acceptance. EC2 systemd/IMDS and real companion provider acceptance remain separate."};
 }finally{if(child?.pid&&child.exitCode===null){child.kill("SIGTERM");await new Promise(r=>child.once("exit",r));}fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"ISOLATION_NOT_PROVEN");process.exitCode=2;});
module.exports={run};
