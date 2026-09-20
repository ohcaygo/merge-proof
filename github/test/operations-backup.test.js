"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const backup=require("../operations/backup"),{Store}=require("../../factory/store"),{ProofService}=require("../service"),{Client}=require("../client"),{fixtureFetch}=require("./fixtures");
async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-backup-")),stateDir=path.join(root,"state"),store=new Store(stateDir),service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});const out=await service.run("fixture/public",1,{token:"fixture"});return {root,stateDir,store,service,out,config:{stateDir,mirrorRoot:path.join(root,"mirrors"),output:path.join(root,"backup"),sourceCommit:"a".repeat(40)}};}
test("consistent export retains archive/log closure and restores historical receipts without secrets or writer lock",async t=>{
 const h=await fixture(t);fs.writeFileSync(path.join(h.root,"config.json"),'SECRET');
 const saved=backup.create(h.config);a.equal(saved.receipts,1);a.equal(saved.operatorEntries,1);a.ok(saved.manifest.files.every(r=>!r.path.includes("lock")&&!r.path.includes("config")));
 const destination=path.join(h.root,"restored");a.throws(()=>backup.restore({backup:h.config.output,destination}),{code:"RESTORE_FENCE_REQUIRED"});
 a.equal(backup.restore({backup:h.config.output,destination,writerFenced:true}).currentness,"NOT_PROVEN");
 const store=new Store(path.join(destination,"proof"));try{const service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});a.notEqual((await service.read(h.out.receipt.receiptId,"fixture")).current.state,"CURRENT");a.equal(service.replayStored(h.out.receipt.receiptId).state,"CONSISTENT_OFFLINE");}finally{store.close();}
});
test("export refuses missing immutable records and busy mirrors; altered or expanded backups refuse restore",async t=>{
 const h=await fixture(t);const dir=path.join(h.config.mirrorRoot,"1");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"merge-proof.lock"),"existing");
 a.throws(()=>backup.create(h.config),{code:"MIRROR_BUSY_OR_UNAVAILABLE"});fs.unlinkSync(path.join(dir,"merge-proof.lock"));h.config.output+="2";
 backup.create(h.config);const state=path.join(h.config.output,"proof/state.json");fs.appendFileSync(state," ");a.throws(()=>backup.verify(h.config.output),{code:"BACKUP_DIGEST_MISMATCH"});
 h.config.output+="3";backup.create(h.config);fs.writeFileSync(path.join(h.config.output,"proof/receipt-archive/extra.json"),"{}");a.throws(()=>backup.verify(h.config.output),{code:"BACKUP_UNMANIFESTED_FILE"});
 const id=h.out.receipt.receiptId;fs.unlinkSync(path.join(h.stateDir,"receipt-archive/receipts",id.slice(0,2),id+".json"));h.config.output+="4";a.throws(()=>backup.create(h.config),{code:"BACKUP_RECEIPT_CLOSURE_INCOMPLETE"});
});
test("AWS operations require the selected account and a temporary role identity",async()=>{
 const {client}=require("../operations/aws"),config={accountId:"123456789012",region:"us-east-1",profile:"nonproduction"};
 for(const id of [{Account:"123456789012",Arn:"arn:aws:iam::123456789012:user/static"},{Account:"999999999999",Arn:"arn:aws:sts::999999999999:assumed-role/lab/session"}])await a.rejects(client(config,async()=>({stdout:JSON.stringify(id)})).checkIdentity(),{code:"SHORT_LIVED_EXPECTED_ACCOUNT_ROLE_REQUIRED"});
});
test("isolated recovery checks independently supplied signature trust and retains factory report closure",async t=>{
 const h=await fixture(t),signer=require("./model-seeds").signer();h.service.receiptSigner=signer;
 // Keep this acceptance snapshot entirely signed; the unsigned setup receipt
 // belongs only to the earlier backup-integrity fixture.
 const id=h.out.receipt.receiptId;delete h.service.data.receipts[id];h.service.data.operatorLog=[];fs.rmSync(path.join(h.stateDir,"receipt-archive"),{recursive:true,force:true});h.service.archive=new (require("../archive").Archive)(path.join(h.stateDir,"receipt-archive"));h.service.archived.clear();
 await h.service.run("fixture/public",1,{token:"fixture"});
 const factory=path.join(h.root,"factory"),order="a".repeat(64),run="b".repeat(64),report=path.join(factory,"artifacts",order,run,"report.json");fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,"{}");fs.writeFileSync(path.join(factory,"state.json"),JSON.stringify({orders:{[order]:{id:order,runs:[{id:run,files:["report.json"]}]}}}));
 const saved=backup.create({...h.config,factoryStateDir:factory});a.equal(saved.factoryIncluded,true);
 const trust=path.join(h.root,"trusted.json");fs.writeFileSync(trust,JSON.stringify(signer.keys));const c={backup:h.config.output,trustedKeysFile:trust};a.equal(require("../operations/verify-restored").verify(c).state,"RESTORED_PORTABLE_TRUST_VERIFIED");
 fs.writeFileSync(trust,JSON.stringify(require("./model-seeds").signer().keys));a.throws(()=>require("../operations/verify-restored").verify(c),{code:"RESTORED_SIGNATURE_OR_REPLAY_FAILED"});
});
test("historical bare mirrors with empty refs remain real Git repositories after restore",async t=>{
 const h=await fixture(t),mirror=path.join(h.config.mirrorRoot,"1"),cp=require("node:child_process");fs.mkdirSync(mirror,{recursive:true});cp.execFileSync("git",["init","--bare","-q",mirror]);
 backup.create(h.config);const destination=path.join(h.root,"restored");backup.restore({backup:h.config.output,destination,writerFenced:true});
 a.equal(cp.execFileSync("git",["-C",path.join(destination,"mirrors/1"),"rev-parse","--is-bare-repository"],{encoding:"utf8"}).trim(),"true");a.deepEqual(fs.readdirSync(path.join(destination,"mirrors/1/refs/heads")),[]);
 const outside=path.join(h.root,"outside");fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(destination,"mirrors/2"));a.throws(()=>backup.restoreDirectories(destination,{directories:["mirrors/2/refs"]}),{code:"BACKUP_SYMLINK_DENIED"});a.deepEqual(fs.readdirSync(outside),[]);
 for(const name of ["mirrors/1/../../outside","/absolute","proof/config"]){a.throws(()=>backup.restoreDirectories(destination,{directories:[name]}),{code:"BACKUP_DIRECTORY_INVALID"});}
});
