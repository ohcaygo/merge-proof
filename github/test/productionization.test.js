'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {prove}=require('../proof'),{capture,H,B,M}=require('./fixtures'),bundle=require('../bundle'),{hash,canonical}=require('../common');
function dir(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'mp-production-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
function keys(){const pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),jwk={...pair.publicKey.export({format:'jwk'}),kid:'fixture',alg:'ES256',use:'sig',nbf:'2026-01-01T00:00:00Z',exp:'2036-01-01T00:00:00Z'};const signer=async bytes=>({keyid:jwk.kid,sig:crypto.sign('sha256',bytes,pair.privateKey).toString('base64')});signer.keys={keys:[jwk]};return {...pair,jwk,signer};}
test('durable archive survives runtime eviction and restart, retains observations, and refuses rewriting',async t=>{
 const root=dir(t),{Archive}=require('../archive'),archive=new Archive(root),receipt=prove(capture()),artifacts=await bundle.create(receipt);
 archive.receipt({receipt,artifacts,installationId:7,current:{state:'CURRENT'}});
 const reopened=new Archive(root),row=reopened.get(receipt.receiptId);a.deepEqual(row.receipt,receipt);a.equal(row.current.state,'UNAVAILABLE');a.equal(bundle.verify(row.artifacts,{allowUnsigned:true}).exitCode,0);
 a.throws(()=>archive.receipt({receipt:{...receipt,verdict:'FAIL'},artifacts,installationId:7}),{code:'ARCHIVE_IMMUTABILITY_VIOLATION'});
 a.throws(()=>archive.get('../private'),{code:'INVALID_RECEIPT_ID'});
});
test('portable multi-file manifest detects component edits, omissions, traversal and private bundled keys',async t=>{
 const root=dir(t),receipt=prove(capture()),b=await bundle.create(receipt),out=path.join(root,'bundle');bundle.write(out,b);a.deepEqual(bundle.read(out),b);
 fs.writeFileSync(path.join(out,'receipt.json'),'{}');a.throws(()=>bundle.read(out),{code:'MANIFEST_DIGEST_MISMATCH'});
 const k=keys(),signed=await bundle.create(receipt,{signer:k.signer});a.equal(bundle.verify(signed,{trustedKeys:[{...k.jwk,d:'private'}]}).state,'SIGNATURE_UNVERIFIED');
 const out2=path.join(root,'bundle2');bundle.write(out2,b);const manifest=JSON.parse(fs.readFileSync(path.join(out2,'MANIFEST.json')));manifest.files['../state.json']={};fs.writeFileSync(path.join(out2,'MANIFEST.json'),JSON.stringify(manifest));a.throws(()=>bundle.read(out2),{code:'MANIFEST_PATH_INVALID'});
});
test('signed landed-content chain verifies with trusted key; substituted repo, receipt, tree, parents and signature refuse',async t=>{
 const k=keys(),receipt=prove(capture()),record={recordId:crypto.randomUUID(),repository:receipt.identity.repository,repositoryId:1,pr:1,mergedHeadSha:H,mergeCommitSha:M,proof:{receiptSnapshot:receipt}};
 const binding={...require('../landing').compare(record,{sha:M,tree:receipt.summary.target.value.tree,parents:[B]}),recordedAt:new Date().toISOString()};
 const attestation={_type:'https://in-toto.io/Statement/v1',subject:[{name:record.repository,digest:{gitCommit:M}}],predicateType:'https://merge-proof.ohcaygo.com/attestation/landed-binding/v1',predicate:{receiptDigest:hash(receipt),repositoryId:1,binding}};
 const payload=Buffer.from(JSON.stringify(canonical(attestation))),observation={...binding,attestation,envelope:{payloadType:'application/vnd.in-toto+json',payload:payload.toString('base64'),signatures:[await k.signer(bundle.pae('application/vnd.in-toto+json',payload))]}};
 const b=bundle.attachLandings(await bundle.create(receipt,{signer:k.signer}),[{record,observation}]);a.equal(bundle.verify(b,{trustedKeys:[k.jwk]}).landings[0].landedState,'LANDED_VERIFIED');
 const archive=new (require('../archive').Archive)(dir(t));archive.landing(record,observation);a.equal(archive.byCommit(1,M).length,1);a.equal(archive.byReceipt(receipt.receiptId).length,1);a.equal(archive.byCommit(2,M).length,0);
 for(const change of [b=>b.landings[0].record.repositoryId=2,b=>b.landings[0].record.mergedHeadSha=B,b=>b.landings[0].observation.landed.tree=B,b=>b.landings[0].observation.landed.parents=[H],b=>b.landings[0].observation.envelope.signatures[0].sig='AAAA']){const changed=structuredClone(b);change(changed);a.notEqual(bundle.verify(changed,{trustedKeys:[k.jwk]}).exitCode,0);}
});
test('operator log validates whole chain and odd-leaf inclusion; external anchoring stays unproven',async()=>{
 const log=require('../operator-log'),k=keys(),data={};const envelopes=[{a:1},{a:2},{a:3}];for(let n=0;n<3;n++)log.append(data,'receipt-'+n,envelopes[n],'2026-09-18T12:00:00Z');
 const checkpoint=await log.checkpoint(data,'2026-09-18',k.signer);
 for(let n=0;n<3;n++){const proof=log.inclusion(data,n,checkpoint),v=log.verify(proof,envelopes[n],{trustedKeys:[k.jwk]});a.equal(v.exitCode,0);a.equal(v.checkpointSignature,'VALID_TRUSTED_KEY');a.equal(v.externalAnchor,'NOT_PROVEN');proof.path[0].hash='a'.repeat(64);a.equal(log.verify(proof,envelopes[n]).exitCode,3);}
 a.throws(()=>log.append(data,'receipt-0',{substituted:true}),{code:'LOG_ENVELOPE_CHANGED'});
 data.operatorLog[1].recordedAt='2026-09-18T13:00:00Z';await a.rejects(log.checkpoint(data,'2026-09-18'),{code:'LOG_CHAIN_INVALID'});
});
test('configured KMS adapter checks exact key ARN, algorithm, P-256 public key and returned signature',async t=>{
 const root=dir(t),k=keys(),jwksPath=path.join(root,'jwks.json');fs.writeFileSync(jwksPath,JSON.stringify(k.signer.keys));
 const config={provider:'aws-kms',executable:'/usr/local/bin/aws',keyArn:'arn:aws:kms:us-east-1:123456789012:key/12345678-abcd-1234-abcd-123456789012',region:'us-east-1',keyId:k.jwk.kid,jwksPath};
 const bytes=Buffer.from('bounded provider adapter fixture'),Signature=crypto.sign('sha256',bytes,k.privateKey).toString('base64');let seen;
 const signer=require('../signing').configured(config,async(executable,args)=>{seen=args;return {stdout:JSON.stringify({KeyId:config.keyArn,SigningAlgorithm:'ECDSA_SHA_256',Signature})};});
 a.equal((await signer(bytes)).sig,Signature);a.equal(seen[seen.indexOf('--message')+1],crypto.createHash('sha256').update(bytes).digest('base64'));
 const wrong=require('../signing').configured(config,async()=>({stdout:JSON.stringify({KeyId:config.keyArn,SigningAlgorithm:'ECDSA_SHA_256',Signature:'AAAA'})}));await a.rejects(wrong(bytes),{code:'KMS_SIGNATURE_INVALID'});
});
test('persisted service retrieves evicted receipt under live repository authorization and never restores stale CURRENT',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mp-restart-')),{Store}=require('../../factory/store'),{ProofService}=require('../service'),{Client}=require('../client'),{fixtureFetch}=require('./fixtures');
 let store=new Store(root),service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});const out=await service.run('fixture/public',1,{token:'test'});delete service.data.receipts[out.receipt.receiptId];service.save();store.close();
 store=new Store(root);t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});service=new ProofService({store,clientFactory:()=>new Client(fixtureFetch())});const read=await service.read(out.receipt.receiptId,'test');a.equal(read.current.state,'UNAVAILABLE');a.equal(service.replayStored(out.receipt.receiptId).state,'CONSISTENT_OFFLINE');a.deepEqual(read.receipt,out.receipt);a.equal(bundle.verify(service.portable(await service.access(out.receipt.receiptId,'test')),{allowUnsigned:true}).exitCode,0);
 service.clientFactory=()=>({authorize:async()=>{throw Object.assign(Error(),{code:'ACCESS_DENIED'});}});await a.rejects(service.access(out.receipt.receiptId,'test'),{code:'ACCESS_DENIED'});
});
test('provider queue order must be complete, contiguous and bound to exact repository, head, base and candidate',()=>{
 const p=require('../queue-order').prefix,identity={repositoryId:1,headSha:H,baseSha:B,pr:2},group={head_sha:M,base_sha:'d'.repeat(40)};
 const repository={databaseId:1,pullRequest:{headRefOid:H,mergeQueueEntry:{headCommit:{oid:M},baseCommit:{oid:group.base_sha},position:2,mergeQueue:{entries:{pageInfo:{hasNextPage:false},nodes:[{position:1,state:'MERGEABLE',pullRequest:{number:1,headRefOid:'e'.repeat(40)},headCommit:{oid:group.base_sha},baseCommit:{oid:B}},{position:2,state:'AWAITING_CHECKS',pullRequest:{number:2,headRefOid:H},headCommit:{oid:M},baseCommit:{oid:group.base_sha}}]}}}}};
 a.equal(p(repository,identity,group).entries.length,2);
 for(const change of [r=>r.databaseId=2,r=>r.pullRequest.mergeQueueEntry.mergeQueue.entries.pageInfo.hasNextPage=true,r=>r.pullRequest.mergeQueueEntry.mergeQueue.entries.nodes.reverse().pop(),r=>r.pullRequest.mergeQueueEntry.mergeQueue.entries.nodes[0].baseCommit.oid=H,r=>r.pullRequest.headRefOid=B]){const r=structuredClone(repository);change(r);a.throws(()=>p(r,identity,group));}
});
test('archive retains evicted pending merge and durable observation replay without granting cross-repo access',async t=>{
 const archive=new (require('../archive').Archive)(dir(t)),receipt=prove(capture()),record={recordId:crypto.randomUUID(),repositoryId:1,pr:1,repository:'fixture/public',proof:{receiptSnapshot:receipt},mergeCommitSha:M};
 archive.merge(record);a.deepEqual(new (require('../archive').Archive)(archive.root).mergeRecord(record.recordId),record);
 a.throws(()=>archive.merge({...record,pr:2}),{code:'ARCHIVE_IMMUTABILITY_VIOLATION'});
});
test('signed delivery acknowledgement follows one coalesced durable save and reports save failure',async()=>{
 const {ProofService}=require('../service');let writes=0;const store={data:{},save(){writes++;}},s=new ProofService({store});
 s.acceptWebhook=()=>{s.data.events.first=1;s.save();s.data.events.second=2;s.save();return {accepted:true};};
 a.deepEqual(await s.webhook('',{}),{accepted:true});a.equal(writes,1);a.equal(s.data.events.second,2);
 store.save=()=>{throw Error('disk full');};await a.rejects(s.webhook('',{}),/disk full/);
});
test('operator checkpoint signature cannot be replaced while keeping successful portable verification',async()=>{
 const log=require('../operator-log'),k=keys(),data={},envelope={a:1};log.append(data,'r',envelope,'2026-09-18T12:00:00Z');const cp=await log.checkpoint(data,'2026-09-18',k.signer),proof=log.inclusion(data,0,cp);proof.checkpoint.signature.sig='AAAA';a.equal(log.verify(proof,envelope,{trustedKeys:[k.jwk]}).exitCode,2);
});
test('archived ledger identity and record access survive pruning with unchanged repository and installation checks',t=>{
 const archive=new (require('../archive').Archive)(dir(t)),record={recordId:crypto.randomUUID(),identity:`1:1:${M}`,repositoryId:1,installationId:7,pr:1};archive.merge(record);a.deepEqual(archive.mergeIdentity(record.identity),record);
 const store={data:{github:{}}},get=require('../ledger').get;a.deepEqual(get(store,record.recordId,{repositoryId:1,installationId:7},archive),record);a.throws(()=>get(store,record.recordId,{repositoryId:2,installationId:7},archive),{code:'ACCESS_DENIED'});a.throws(()=>get(store,record.recordId,{repositoryId:1,installationId:8},archive),{code:'ACCESS_DENIED'});
});
test('explicit anchor publisher checks ownership and immutable existing bytes before any external write',async t=>{
 const k=keys(),data={},log=require('../operator-log');log.append(data,'r',{a:1},'2026-09-18T12:00:00Z');const checkpoint=await log.checkpoint(data,'2026-09-18',k.signer),prepared={schema:'urn:merge-proof:anchor-publication:1',checkpoint,digest:hash(checkpoint)},file=path.join(dir(t),'anchor.json');fs.writeFileSync(file,JSON.stringify(prepared));const trustedKeysFile=file+'.jwks';fs.writeFileSync(trustedKeysFile,JSON.stringify(k.signer.keys));const c={trustedKeysFile,authorized:true,repository:'fixture/public',branch:'main',path:'anchors/2026-09-18.json',preparedFile:file},publish=require('../operations/publish-anchor').publish;
 let calls=0;const execute=async(_,args)=>{calls++;if(args[1]==='repos/fixture/public')return {stdout:JSON.stringify({private:false,permissions:{admin:true},full_name:'fixture/public'})};return {stdout:JSON.stringify({content:Buffer.from(JSON.stringify(prepared)).toString('base64'),html_url:'https://example.invalid/anchor'})};};a.equal((await publish(c,execute)).state,'ALREADY_PUBLISHED');a.equal(calls,2);
 await a.rejects(publish({...c,authorized:false},execute),{code:'ANCHOR_AUTHORIZATION_REQUIRED'});await a.rejects(publish(c,async()=>({stdout:JSON.stringify({private:true,permissions:{admin:true},full_name:'fixture/public'})})),{code:'OWNED_PUBLIC_ANCHOR_REPOSITORY_REQUIRED'});
});
test('private differential runner flags unexpected positive verdicts and reads supplied drift counters',async t=>{
 const root=dir(t),state=path.join(root,'state.json'),baseline=path.join(root,'baseline.json');fs.writeFileSync(state,JSON.stringify({github:{frontierMetrics:{reconciliationSupersessions:2,ruleSuiteDisagreements:1}}}));fs.writeFileSync(baseline,JSON.stringify({metrics:{reconciliationSupersessions:1,ruleSuiteDisagreements:0}}));
 const {Client}=require('../client'),{fixtureFetch}=require('./fixtures'),config={output:root,runtimeState:state,baseline,fixtures:[{repository:'ohcaygo/merge-proof-l3-lab-classic',repositoryId:1,pr:1,expected:'FAIL'}]};
 // A refused authorization is an explicit unavailable alarm, not fixture success.
 const report=await require('../lab/run').run(config,{clientFactory:()=>new Client(fixtureFetch())});a.equal(report.alarms.unavailable,1);a.equal(report.alarms.reconciliationSupersessions,1);a.equal(report.alarms.ruleSuiteDisagreements,1);
});
