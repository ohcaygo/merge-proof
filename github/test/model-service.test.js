'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {world}=require('./model-world'),{run,signer}=require('./model-seeds');
test('seeded service/world model: 5-60 actions, delivery faults and seventeen invariant obligations',async()=>{
 const count=Number(process.env.MP_MODEL_SEEDS||1000),started=performance.now(),{totals,workers}=await run(count),elapsedMs=performance.now()-started;
 a.equal(totals.sequences,count);a.ok(totals.notModified>0);if(count>=100)a.ok(totals.faults>0&&totals.duplicates>0);
 if(process.env.MP_MODEL_REPORT)fs.writeFileSync(process.env.MP_MODEL_REPORT,JSON.stringify({schema:'urn:merge-proof:service-model-run:1',...totals,workers,elapsedMs,invariants:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]},null,2));
 if(process.env.CI&&count===1000)a.ok(elapsedMs<120000,`Charter model budget exceeded: ${elapsedMs} ms for ${count} sequences`);
});
test('affected-event budget: 30 tracked PRs and 200 events use at least 70 percent fewer counted reads than full rescans',async()=>{
 const key=signer(),h=world(10001,key),{capture,H}=require('./fixtures'),{prove}=require('../proof'),bundle=require('../bundle'),{Client}=require('../client'),{fixtureFetch}=require('./fixtures');
 await h.send(h.delivery('pull_request',{pull_request:{number:1,state:'open'}}));await h.drain();
 for(let pr=2;pr<=30;pr++){
  const head=crypto.createHash('sha1').update(String(pr)).digest('hex'),c=JSON.parse(JSON.stringify(capture()).replaceAll(H,head));c.identity.pr=pr;c.execution.value[0].pullRequests[0].number=pr;const receipt=prove(c),{receipt:ignored,...artifacts}=await bundle.create(receipt,{signer:key,keys:key.keys});h.service.data.receipts[receipt.receiptId]={receipt,artifacts,current:{state:'CURRENT'},installationId:2};h.service.data.subscriptions[`1:${pr}`]={repo:'fixture/public',repositoryId:1,pr,installationId:2,latestReceiptId:receipt.receiptId,reconciledAt:Date.now()};
 }
 let fullScanCounted=0;
 for(let pr=1;pr<=30;pr++){
  const fixture=fixtureFetch({mutate:(p,v)=>{if(p.endsWith('/pulls/1'))v.number=pr;if(p.endsWith('/actions/runs'))v.workflow_runs[0].pull_requests[0].number=pr;return v;}});
  const client=new Client({token:'model',fetchImpl:(url,init)=>fixture.fetchImpl(url.replace(new RegExp(`/pulls/${pr}(?=/|\\?|$)`),'/pulls/1'),init)});await require('../collect').collect(client,'fixture/public',pr);fullScanCounted+=240-client.remaining;
 }
 const before=h.counts.counted,beforeNetwork=h.counts.requests;
 for(let n=0;n<200;n++){if(n%2)h.w.conclusion=n%4===1?'failure':'success';await h.send(h.delivery('check_run',{check_run:{head_sha:H,name:n%2?'test':'noise',app:{id:10}}}));await h.drain();}
 const targeted=h.counts.counted-before,baseline=fullScanCounted*200;a.ok(targeted<=baseline*.3,`${targeted} targeted versus ${baseline} full-rescan requests`);a.ok(Object.values(h.service.data.subscriptions).every(s=>h.service.data.receipts[s.latestReceiptId].current.state==='CURRENT'));
 if(process.env.MP_MODEL_REPORT)fs.writeFileSync(process.env.MP_MODEL_REPORT+'.budget.json',JSON.stringify({trackedPRs:30,events:200,measuredOneFullRescan:fullScanCounted,fullRescanBaselineFor200:baseline,targetedCounted:targeted,targetedNetworkRequests:h.counts.requests-beforeNetwork,baselineKind:'Measured unconditional full scan of 30 PRs multiplied by 200 events; ETag-conditioned targeted reads are counted separately',savedFraction:1-targeted/baseline},null,2));
});
