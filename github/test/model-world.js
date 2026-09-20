'use strict';
const a=require('node:assert/strict'),crypto=require('node:crypto');
const {ProofService}=require('../service'),{Client}=require('../client'),{fixtureFetch,H,B,M,T}=require('./fixtures'),{hash}=require('../common');
const ALL=['TARGET','CI_EXECUTED','APPROVAL_CURRENT','RULES_SNAPSHOT','REMOTE_DURABLE'];
const TYPES=['check-fail','check-pass','approval-dismiss','approval-current','permission-deny','permission-write','wrong-producer','right-producer','wrong-event','right-event','workflow-change','workflow-restore','unsupported-rule','supported-rules','push','base-advance','noise','comment','own-check','defer','deliver','duplicate','502','403','reconcile','observe','race','queue','destroy'];
function generator(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function sequence(seed){const random=generator(seed),length=5+Math.floor(random()*56);return Array.from({length},()=>TYPES[Math.floor(random()*TYPES.length)]);}
async function minimize(actions,fails){let out=actions.slice(),width=Math.ceil(out.length/2);while(width){let reduced=false;for(let n=0;n<out.length;n+=width){const candidate=out.slice(0,n).concat(out.slice(n+width));if(candidate.length&&await fails(candidate)){out=candidate;reduced=true;break;}}if(!reduced)width=Math.floor(width/2);}return out;}
function world(seed,signer){
 const random=generator(seed),w={head:H,base:B,contains:true,checkSha:H,reviewSha:H,conclusion:'success',review:'APPROVED',writer:true,app:10,event:'pull_request',changed:false,unsupported:false,group:false,merged:false,fail:0,race:false};
 const counts={requests:0,counted:0,notModified:0,faults:0,deliveries:0,duplicates:0,checks:0};const pending=[],history=new Map(),publications=new Map();let index=0,lastDelivery=null,durable;
 const store={data:{},save(){durable=structuredClone(this.data);}};
 const target=()=>w.group?M:w.contains?w.head:M;
 const good=()=>!w.merged&&!w.unsupported&&!w.changed&&w.checkSha===target()&&w.conclusion==='success'&&w.app===10&&w.event===(w.group?'merge_group':'pull_request')&&w.review==='APPROVED'&&w.reviewSha===w.head&&w.writer;
 const fetchImpl=async(url,init={})=>{
  counts.requests++;const u=new URL(url),p=u.pathname;
  if(init.method==='POST'&&p.endsWith('/check-runs')){const body=JSON.parse(init.body),id=1000+publications.size;publications.set(id,body);counts.checks++;return Response.json({id,head_sha:body.head_sha});}
  if(init.method==='PATCH'&&p.includes('/check-runs/')){Object.assign(publications.get(Number(p.split('/').at(-1)))||{},JSON.parse(init.body));return Response.json({id:Number(p.split('/').at(-1))});}
  if(w.fail&&p.endsWith('/reviews')){const status=w.fail;w.fail=0;counts.faults++;return Response.json({message:'bounded synthetic provider failure'},{status,headers:{'retry-after':'1'}});}
  if(!w.writer&&p.endsWith('/permission'))return Response.json({},{status:403});
  if(p==='/graphql'){
   const entry=w.group?{id:'queue',state:'AWAITING_CHECKS',position:1,headCommit:{oid:M},baseCommit:{oid:w.base}}:null;
   if(entry)entry.mergeQueue={entries:{nodes:[{...entry,pullRequest:{number:1,headRefOid:w.head}}],pageInfo:{hasNextPage:false}}};
   return Response.json({data:{repository:{databaseId:1,nameWithOwner:'fixture/public',pullRequest:{number:1,headRefOid:w.head,baseRefName:'main',merged:w.merged,state:w.merged?'MERGED':'OPEN',mergeCommit:{oid:M},mergeQueueEntry:entry}}}});
  }
  if(p.endsWith('/git/commits/'+M))return Response.json({sha:M,tree:{sha:'e'.repeat(40)},parents:[{sha:w.base},{sha:w.head}]});
  if(p.endsWith('/rulesets/rule-suites'))return Response.json([{id:99,repository_id:1,after_sha:M,ref:'refs/heads/main'}]);
  if(p.endsWith('/rulesets/rule-suites/99'))return Response.json({id:99,repository_id:1,after_sha:M,before_sha:w.base,ref:'refs/heads/main',result:'pass',rule_evaluations:[]});
  const f=fixtureFetch({head:w.head,base:w.base,mergeBase:w.contains?w.base:'9'.repeat(40),changedFiles:w.changed?['.github/workflows/ci.yml']:['feature'],mutate:(p,v)=>{
   if(p==='/repos/fixture/public')v.permissions={push:true};
   if(p.endsWith('/pulls/1')){v.mergeable=w.contains?true:null;v.state=w.merged?'closed':'open';v.merged=w.merged;}
   if(p.endsWith('/rules/branches/main'))v=w.unsupported?[{type:'unknown-required-model-rule',ruleset_id:1,ruleset_source:'fixture/public',ruleset_source_type:'Repository'}]:[];
   if(p.endsWith('/check-runs')){Object.assign(v.check_runs[0],{head_sha:w.checkSha,conclusion:w.conclusion});v.check_runs[0].app.id=w.app;}
   if(p.endsWith('/actions/runs'))Object.assign(v.workflow_runs[0],{head_sha:w.checkSha,event:w.event,conclusion:w.conclusion});
   if(p.endsWith('/attempts/1/jobs')){Object.assign(v.jobs[0],{head_sha:w.checkSha,conclusion:w.conclusion});v.jobs[0].steps[0].conclusion=w.conclusion;}
   if(p.endsWith('/reviews')){v[0].state=w.review;v[0].commit_id=w.reviewSha;if(w.race){w.race=false;w.review='DISMISSED';}}
   return v;
  }});const r=await f.fetchImpl(url,init);if(!r.ok)return r;const bytes=await r.text(),etag='"'+hash(bytes)+'"';
  if(init.headers?.['If-None-Match']===etag){counts.notModified++;return new Response(null,{status:304});}counts.counted++;return new Response(bytes,{headers:{etag}});
 };
 const make=()=>new Client({token:'model',fetchImpl,maxRequests:400});const service=new ProofService({store,config:{appId:42,publishChecks:true,webhookSecret:'s'.repeat(40),origin:'http://fixture.invalid'},receiptSigner:signer,appClient:async()=>make(),clientFactory:make});
 // Meter remains the real monotonic trial implementation; the synthetic account has no paid identity.
 service.meter=new (require('../meter').Meter)(store);service.meter.connect(2,99);let trialStart=null;
 const delivery=(event,p)=>{const raw=Buffer.from(JSON.stringify({installation:{id:2},repository:{id:1,full_name:'fixture/public'},...p}));return [raw,{'x-github-event':event,'x-github-delivery':`model-${seed}-${++index}`,'x-hub-signature-256':'sha256='+crypto.createHmac('sha256','s'.repeat(40)).update(raw).digest('hex')}];};
 async function send(d){const before=Object.values(service.data.receipts).map(row=>({row,state:row.current.state}));const event=d[1]['x-github-event'],p=JSON.parse(d[0]);const out=await service.webhook(...d);counts.deliveries++;if(out.duplicate)counts.duplicates++;lastDelivery=d;
  for(const {row,state} of before){
   let expected=null;
   if(event==='member')expected=['APPROVAL_CURRENT'];
   if(event==='repository_ruleset')expected=['RULES_SNAPSHOT','CI_EXECUTED','APPROVAL_CURRENT'];
   if(event==='pull_request_review')expected=p.review.state==='commented'?[]:['APPROVAL_CURRENT'];
   if(event==='pull_request')expected=ALL;
   if(event==='push'&&p.ref==='refs/heads/main')expected=['TARGET','CI_EXECUTED'];
   if(event==='merge_group')expected=p.merge_group.head_sha===row.receipt.summary.target.value?.sha?['TARGET','CI_EXECUTED']:[];
   if(event==='check_run')expected=p.check_run.name==='test'&&p.check_run.app.id===10&&[row.receipt.identity.headSha,row.receipt.summary.target.value?.sha].includes(p.check_run.head_sha)?['CI_EXECUTED']:[];
   if(!out.duplicate&&expected){if(expected.length)a.deepEqual(row.current.touched,expected,'I2 binding locality');else a.equal(row.current.state,state,'I2 unrelated event changed currentness');}
  }
  return out;
 }
 const current=()=>service.data.receipts[service.data.subscriptions['1:1']?.latestReceiptId];
 function invariant(){
  for(const row of Object.values(service.data.receipts)){
   const r=row.receipt,old=history.get(r.receiptId);if(old)a.equal(hash(r),old,'I9 mutated receipt');else history.set(r.receiptId,hash(r));
   if(r.verdict==='VERIFIED'){a.ok(r.claims.every(c=>c.state==='TRUE'),'I3 inferred positive');a.equal(r.evidence.consistency,'STABLE_OBSERVATION','I11 raced positive');a.equal(r.evidence.target.value.headSha,r.identity.headSha,'I1 subject mismatch');a.ok(!r.gaps.length,'I12 positive with gaps');}
  }
  const trial=service.meter.account(2).trial;
  if(trial){if(trialStart)a.equal(trial.startedAt,trialStart,'I17 restarted trial');else {trialStart=trial.startedAt;a.ok(Object.values(service.data.receipts).some(r=>r.receipt.verdict!=='FAIL'&&r.receipt.evidence.consistency==='STABLE_OBSERVATION'),'I17 unqualified trial');}}
 }
 async function drain(){const limit=3*(service.data.queue.length+service.data.groupQueue.length+service.data.landingQueue.length)+service.data.retractionQueue.length+3;let n=0;for(;n<limit&&(service.data.queue.length||service.data.groupQueue.length||service.data.landingQueue.length||service.data.retractionQueue.length);n++){for(const job of [...service.data.queue,...service.data.groupQueue])delete job.retryAt;await service.drain();invariant();}a.ok(n<limit,'I13 unbounded recheck '+JSON.stringify({queue:service.data.queue.length,group:service.data.groupQueue.length,landing:service.data.landingQueue.length,retractions:service.data.retractionQueue.length}));
  const row=current();if(!pending.length&&row?.current.state==='CURRENT'&&row.receipt.verdict==='VERIFIED')a.ok(good(),'I1/I4/I5/I6/I7/I12 world disproves current positive');
  for(const check of publications.values())if(check.conclusion==='success'){const row=Object.values(service.data.receipts).find(r=>r.checkIds?.some(id=>publications.get(id)===check));a.ok(row&&row.receipt.verdict==='VERIFIED'&&row.current.state==='CURRENT','I16 publication exceeds receipt');}
 }
 async function action(type){let event='check_run',p={check_run:{head_sha:target(),name:'test',app:{id:10}}};
  switch(type){
   case 'check-fail':w.conclusion='failure';break;case 'check-pass':w.conclusion='success';w.checkSha=target();break;
   case 'approval-dismiss':w.review='DISMISSED';event='pull_request_review';p={pull_request:{number:1},review:{state:'dismissed'}};break;
   case 'approval-current':w.review='APPROVED';w.reviewSha=w.head;event='pull_request_review';p={pull_request:{number:1},review:{state:'approved'}};break;
   case 'permission-deny':w.writer=false;event='member';p={};break;case 'permission-write':w.writer=true;event='member';p={};break;
   case 'wrong-producer':w.app=11;break;case 'right-producer':w.app=10;break;case 'wrong-event':w.event='schedule';break;case 'right-event':w.event=w.group?'merge_group':'pull_request';break;
   case 'workflow-change':w.head=hash([seed,index,'workflow-change']).slice(0,40);w.group=false;w.changed=true;event='pull_request';p={action:'synchronize',pull_request:{number:1,state:'open'}};break;
   case 'workflow-restore':w.head=hash([seed,index,'workflow-restore']).slice(0,40);w.group=false;w.changed=false;event='pull_request';p={action:'synchronize',pull_request:{number:1,state:'open'}};break;
   case 'unsupported-rule':w.unsupported=true;event='repository_ruleset';p={};break;case 'supported-rules':w.unsupported=false;event='repository_ruleset';p={};break;
   case 'push':w.head=hash([seed,index,'head']).slice(0,40);w.contains=true;w.group=false;event='pull_request';p={action:'synchronize',pull_request:{number:1,state:'open'}};break;
   case 'base-advance':w.base=hash([seed,index,'base']).slice(0,40);w.contains=false;event='push';p={ref:'refs/heads/main',before:B,after:w.base};break;
   case 'noise':p.check_run.name='noise';break;case 'own-check':p.check_run.app.id=42;break;case 'comment':event='pull_request_review';p={pull_request:{number:1},review:{state:'commented'}};break;
   case '502':case '403':w.fail=Number(type);event='pull_request_review';p={pull_request:{number:1},review:{state:'approved'}};break;
   case 'race':w.race=true;event='pull_request';p={action:'synchronize',pull_request:{number:1,state:'open'}};break;
   case 'queue':w.group=true;event='merge_group';p={action:'checks_requested',merge_group:{head_sha:M,head_ref:'refs/heads/gh-readonly-queue/main/pr-1',base_sha:w.base,base_ref:'refs/heads/main'}};break;
   case 'destroy':w.group=false;event='merge_group';p={action:'destroyed',merge_group:{head_sha:M}};break;
   case 'defer':pending.push(delivery('member',{}));return;
   case 'duplicate':if(lastDelivery)await send(lastDelivery);invariant();return;
   case 'deliver':if(pending.length)await send(pending.splice(Math.floor(random()*pending.length),1)[0]);invariant();return;
   case 'reconcile':service.reconcile(Date.now()+7*3600000);await drain();return;
   case 'observe':await drain();return;
  }
  const d=delivery(event,p);if(random()<.18)pending.push(d);else await send(d);invariant();
 }
 async function finish(){while(pending.length)await send(pending.splice(Math.floor(random()*pending.length),1)[0]);w.fail=0;w.race=false;await drain();
  // Bounded recovery after the provider settles: fresh exact head evidence and permissions.
  Object.assign(w,{contains:true,conclusion:'success',review:'APPROVED',writer:true,app:10,event:'pull_request',changed:false,unsupported:false,group:false,checkSha:w.head,reviewSha:w.head});
  const sub=service.data.subscriptions['1:1'];if(sub)sub.mergeGroup=null;await send(delivery('pull_request',{action:'synchronize',pull_request:{number:1,state:'open'}}));await drain();const row=current();a.equal(row?.receipt.verdict,'VERIFIED','I13 recovery');a.equal(row.current.state,'CURRENT');
  const verify=require('../bundle');a.equal(verify.verify({...row.artifacts,receipt:row.receipt},{trustedKeys:signer.keys.keys}).exitCode,0,'I10/I15 replay/signature');const altered=structuredClone({...row.artifacts,receipt:row.receipt});altered.receipt.identity.headSha=B;a.notEqual(verify.verify(altered,{trustedKeys:signer.keys.keys}).exitCode,0,'I10 tamper');
  w.merged=true;await send(delivery('pull_request',{action:'closed',pull_request:{number:1,state:'closed',merged:true,head:{sha:w.head},base:{ref:'main'},merge_commit_sha:M,merged_at:new Date().toISOString()}}));await drain();const record=service.data.merges.records[0],landing=service.data.landings[record.recordId];a.equal(landing.state,'LANDED_VERIFIED','I8 landing');a.equal(require('../landing').compare(record,{...landing.landed,tree:B}).state,'LANDED_MISMATCH','I8 substituted landing');
  invariant();a.ok(durable.github.events);counts.reconciliationSupersessions=service.data.frontierMetrics.reconciliationSupersessions;return counts;
 }
 return {service,w,counts,send,delivery,action,drain,finish};
}
module.exports={world,sequence,minimize,TYPES};
