#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),{assert}=require("../common"),{Archive}=require("../archive"),bundle=require("../bundle");
function verify(c){
 const checked=require("./backup").verify(c.backup),trustedKeys=JSON.parse(fs.readFileSync(c.trustedKeysFile)).keys;assert(Array.isArray(trustedKeys)&&trustedKeys.length&&trustedKeys.every(k=>!k.d),"INDEPENDENT_PUBLIC_TRUST_REQUIRED");
 const archive=new Archive(path.join(c.backup,"proof/receipt-archive")),results=[];
 const walk=dir=>{if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory()){walk(file);continue;}const row=JSON.parse(fs.readFileSync(file));let portable={receipt:row.receipt,...row.artifacts};portable=bundle.attachLandings(portable,archive.byReceipt(row.receipt.receiptId));const result=bundle.verify(portable,{trustedKeys});assert(result.exitCode===0,"RESTORED_SIGNATURE_OR_REPLAY_FAILED");
   let independent=null;if(row.receipt.expectedTree?.status==="RECONSTRUCTED"){
    const binary=c.reconstructionBinaries?.[row.receipt.expectedTree.gitBinaryDigest];assert(typeof binary==="string"&&path.isAbsolute(binary),"HISTORICAL_GIT_RUNTIME_REQUIRED");
    independent=require("../reverify").independent(portable,path.join(c.backup,"mirrors",String(row.receipt.identity.repositoryId)),binary);assert(independent.exitCode===0,"RESTORED_RECONSTRUCTION_NOT_PROVEN");
   }
   results.push({receiptId:row.receipt.receiptId,signature:result.signature,replay:result.state,landings:result.landings.length,reconstruction:independent?.state||"NO_RECONSTRUCTION_CLAIM"});
  }};
 walk(path.join(archive.root,"receipts"));return {state:"RESTORED_PORTABLE_TRUST_VERIFIED",manifestDigest:checked.manifestDigest,currentness:"NOT_PROVEN",results};
}
if(require.main===module){try{console.log(JSON.stringify(verify(JSON.parse(fs.readFileSync(process.argv[2])))));}catch(e){console.error(e.code||"RESTORED_TRUST_NOT_PROVEN");process.exitCode=2;}}
module.exports={verify};
