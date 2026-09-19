"use strict";
const { test }=require("node:test"), a=require("node:assert/strict"), fs=require("node:fs"), os=require("node:os"), path=require("node:path"), http=require("node:http");
const {createHmac,randomUUID}=require("node:crypto");
const { Store }=require("../../factory/store"),{ProofService}=require("../service"),{Client}=require("../client"),{fixtureFetch,H,B,capture}=require("./fixtures");
function harness(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"mp-frontier-service-")),store=new Store(dir);let options={},requests=0;
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const make=()=>{const f=fixtureFetch({...options,mutate:(p,v,...rest)=>{if(p==="/repos/fixture/public")v.permissions={push:true};return options.mutate?options.mutate(p,v,...rest):v;}}), original=f.fetchImpl;f.fetchImpl=(...args)=>{requests++;return options.override?.(...args) || original(...args);};return new Client(f);};
  const service=new ProofService({store,config:{webhookSecret:"s".repeat(40),origin:"http://127.0.0.1"},clientFactory:make,appClient:async()=>make()});
  const hook=(event,p,id=randomUUID())=>{const raw=Buffer.from(JSON.stringify({installation:{id:2},repository:{id:1,full_name:"fixture/public"},...p}));return service.webhook(raw,{"x-github-event":event,"x-github-delivery":id,"x-hub-signature-256":"sha256="+createHmac("sha256","s".repeat(40)).update(raw).digest("hex")});};
  return {service,store,hook,set:o=>options=o,requests:()=>requests};
}
test("30 tracked PRs and 200 unrelated events leave proofs current with no reads",async t=>{
  const h=harness(t),{prove}=require("../proof");
  for(let pr=1;pr<=30;pr++){const c=capture();c.identity.pr=pr;const r=prove(c);h.service.data.receipts[r.receiptId]={receipt:r,current:{state:"CURRENT"}};h.service.data.subscriptions[`1:${pr}`]={repo:"fixture/public",repositoryId:1,installationId:2,pr,latestReceiptId:r.receiptId,reconciledAt:Date.now()};}
  for(let n=0;n<200;n++)await h.hook("check_run",{check_run:{head_sha:H,name:`unrelated-${n}`,app:{id:10}}});
  a.equal(h.service.data.queue.length,0);a.equal(h.requests(),0);a.ok(Object.values(h.service.data.receipts).every(r=>r.current.state==="CURRENT"));
});
test("organization rules, permission events, TTL duplicates and reconciliation are scoped",async t=>{
  const h=harness(t);await h.hook("pull_request",{pull_request:{number:1,state:"open"}});await h.service.drain();
  const row=Object.values(h.service.data.receipts)[0];
  await h.hook("repository_ruleset",{repository:null,organization:{login:"fixture"},action:"edited"},"org-change");
  a.deepEqual(row.current.touched,["RULES_SNAPSHOT","CI_EXECUTED","APPROVAL_CURRENT"]);
  a.equal((await h.hook("repository_ruleset",{repository:null,organization:{login:"fixture"}},"org-change")).duplicate,true);
  await h.service.drain();a.equal(row.current.state,"CURRENT");
  await h.hook("membership",{repository:null,organization:{login:"other"}});a.equal(h.service.data.queue.length,0);
  const before=JSON.stringify(row.receipt);
  h.set({mutate:(p,v)=>p.endsWith("/reviews")?[]:v});
  h.service.reconcile(Date.now()+7*3600000);await h.service.drain();
  const newest=Object.values(h.service.data.receipts).at(-1);
  a.equal(newest.receipt.verdict,"NOT_PROVEN");a.equal(newest.receipt.supersedes.receiptId,row.receipt.receiptId);a.equal(JSON.stringify(row.receipt),before);
});
test("conditional 304 reads use authenticated cache and do not consume counted budget",async()=>{
  let count=0;const client=new Client({token:"fixture",maxRequests:1,fetchImpl:async(_url,init)=>{
    count++;if(count===1)return new Response('{"id":1}',{headers:{etag:'"fixture"'}});
    a.equal(init.headers["If-None-Match"],'"fixture"');return new Response(null,{status:304});
  }});
  a.deepEqual(await client.get("/repos/fixture/public"),{id:1});
  client.remaining=1;
  for(let i=0;i<10;i++)a.deepEqual(await client.get("/repos/fixture/public"),{id:1});a.equal(client.remaining,1);
});
test("HTTP machine decision, subject guard and authorized durable bundle journey",async t=>{
  const h=harness(t),server=http.createServer((req,res)=>require("../http").handle(h.service,req,res,new URL(req.url,"http://127.0.0.1")));
  await new Promise(r=>server.listen(0,"127.0.0.1",r));t.after(()=>new Promise(r=>server.close(r)));
  const root=`http://127.0.0.1:${server.address().port}`, input={repository:"fixture/public",repositoryId:1,pr:1,expectedHeadSha:H,expectedBaseSha:B,expectedTargetSha:H};
  const call=body=>fetch(root+"/proof/v1/decision",{method:"POST",headers:{authorization:"Bearer fixture","content-type":"application/json"},body:JSON.stringify(body)});
  const response=await call(input);a.equal(response.status,200);const decision=await response.json();a.equal(decision.proceed,true);
  a.deepEqual(decision.nextAction.mergeArguments,{sha:H});
  const stale=await (await call({...input,expectedHeadSha:B})).json();a.equal(stale.outcome,"REFUSE");a.equal(stale.proceed,false);
  const bundle=await fetch(root+`/proof/receipts/${decision.receipt.receiptId}/bundle`,{headers:{authorization:"Bearer fixture"}});a.equal(bundle.status,200);
  a.equal(require("../bundle").verify(await bundle.json(),{allowUnsigned:true}).state,"CONSISTENT_OFFLINE");
  a.equal((await fetch(root+`/proof/receipts/${decision.receipt.receiptId}/bundle`)).status,403);
});

for (const legacy of [true, false]) test(`proof-to-merge journey preserves ledger and resolves REST 2026 commit (legacy=${legacy})`,async t=>{
  const h=harness(t);await h.hook("pull_request",{pull_request:{number:1,state:"open"}});await h.service.drain();
  const original=Object.values(h.service.data.receipts)[0],before=JSON.stringify(original.receipt),commit="c".repeat(40),tree=original.receipt.summary.target.value.tree;
  h.set({override:(url)=>{
    const p=new URL(url).pathname;
    if(p === '/graphql') return Promise.resolve(Response.json({data:{repository:{databaseId:1,nameWithOwner:'fixture/public',pullRequest:{number:1,headRefOid:H,baseRefName:'main',merged:true,state:'MERGED',mergeCommit:{oid:commit}}}}}));
    if(p.endsWith('/git/commits/'+commit))return Promise.resolve(Response.json({sha:commit,tree:{sha:tree},parents:[{sha:B}]}));
    if(p.endsWith('/rulesets/rule-suites'))return Promise.resolve(Response.json([{id:99,repository_id:1,after_sha:commit,ref:'refs/heads/main'}]));
    if(p.endsWith('/rulesets/rule-suites/99'))return Promise.resolve(Response.json({id:99,repository_id:1,after_sha:commit,before_sha:B,ref:'refs/heads/main',result:'bypass',actor_id:9,rule_evaluations:[]}));
  }});
  await h.hook("pull_request",{action:"closed",pull_request:{number:1,state:"closed",merged:true,head:{sha:H},base:{ref:"main"},...(legacy ? {merge_commit_sha:commit} : {}),merged_at:new Date().toISOString(),merged_by:{id:9,login:"merger",type:"User"}}});
  await h.service.drain();
  const record=require('../ledger').area(h.store).records[0],landed=h.service.data.landings[record.recordId];
  a.equal(record.mergeCommitSha, legacy ? commit : null);a.equal(landed.commitResolution.value,commit);
  a.equal(landed.state,'LANDED_VERIFIED');a.equal(landed.bypass,'BYPASS_OBSERVED');a.equal(JSON.stringify(original.receipt),before);
  a.equal(landed.attestation.predicate.receiptDigest,require('../common').hash(record.proof.receiptSnapshot));
  a.equal(require('../ledger').list(h.store,{repositoryId:1}).records[0].landed.state,'LANDED_VERIFIED');
  const server=http.createServer((req,res)=>require('../http').handle(h.service,req,res,new URL(req.url,'http://127.0.0.1')));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/proof/v1/receipts?repository_id=1&commit=${commit}`,{headers:{authorization:'Bearer fixture'}});
  a.equal(response.status,200);a.equal((await response.json()).records[0].landed.state,'LANDED_VERIFIED');
});
test("delivery reconciliation follows cursor pages, redelivers missed GUID and respects four-hour cadence",async t=>{
  const h=harness(t),s=h.service,calls=[];s.config.appId=42;s.config.privateKey='fixture-never-used';
  s.deliveryClient=()=>new Client({fetchImpl:async(url,init)=>{
    const u=new URL(url);calls.push([u.pathname,init.method]);
    if(init.method==='POST') {await h.hook('pull_request',{pull_request:{number:1,state:'open'}},'missed-guid');return new Response(null,{status:202});}
    return u.searchParams.has('cursor') ? Response.json([{id:2,guid:'missed-guid',event:'pull_request',status_code:500}]) : new Response('[]',{headers:{link:'<https://api.github.com/app/hook/deliveries?cursor=next&per_page=100>; rel="next"'}});
  }});
  await s.reconcileDeliveries();a.equal(s.data.deliveryHealth,'RECONCILED');a.ok(s.data.events['missed-guid']);a.equal(s.data.queue.length,1);
  const n=calls.length;await s.reconcileDeliveries();a.equal(calls.length,n);
});
test("unchanged full reconciliations retain one receipt and refresh observation time",async t=>{
  const h=harness(t),s=h.service;await h.hook('pull_request',{pull_request:{number:1,state:'open'}});await s.drain();
  const row=Object.values(s.data.receipts)[0],before=JSON.stringify(row.receipt);
  for(let n=0;n<3;n++){s.data.subscriptions['1:1'].reconciledAt=1;s.data.subscriptions['1:1'].reconcileQueuedAt=1;s.reconcile();await s.drain();a.equal(Object.keys(s.data.receipts).length,1);}
  a.equal(JSON.stringify(row.receipt),before);a.ok(s.data.subscriptions['1:1'].reconciledAt>1);a.equal(s.data.queue.length,0);
});

test('live-sized delivery IDs survive parsing, pagination, and redelivery exactly',async t=>{
  const h=harness(t),s=h.service,calls=[];s.config.appId=42;s.config.privateKey='fixture-never-used';
  s.deliveryClient=()=>new Client({fetchImpl:async(url,init)=>{
    const u=new URL(url);calls.push([u.pathname,init.method]);
    if(init.method==='POST'){a.equal(u.pathname,'/app/hook/deliveries/3843641202479988736/attempts');return new Response(null,{status:202});}
    if(u.searchParams.has('cursor'))return new Response('[{"id":3843641202479988736,"guid":"missed-large-id","event":"pull_request","status_code":200}]');
    return new Response('[{"id":1,"guid":"ping","event":"ping","status_code":200}]',{headers:{link:'<https://api.github.com/app/hook/deliveries?cursor=next&per_page=100>; rel="next"'}});
  }});
  await s.reconcileDeliveries();a.equal(s.data.deliveryHealth,'RECONCILED');a.equal(calls.filter(x=>x[1]==='POST').length,1);
});
for(const id of [null,0,-1,1.5,3843641202479988700,'../attempts','1e20','999999999999999999999'])
 test(`malformed delivery identity cannot report reconciled (${id})`,async t=>{
  const h=harness(t),s=h.service;s.config.appId=42;s.config.privateKey='fixture';
  s.deliveryClient=()=>({get:async()=>[{id,guid:'unseen',event:'pull_request',status_code:200}],request:async()=>{throw Error('Must not send');},links:new Map()});
  await s.reconcileDeliveries();a.equal(s.data.deliveryHealth,'UNAVAILABLE');
 });
test('lossless delivery parsing preserves quoted text and safe numeric fields',async()=>{
 const raw='[{"id":3843641202479988736,"status_code":200,"duration":0.5,"message":"id 3843641202479988736 and \\"id\\":1234567890123456789","guid":"real-guid"}]';
 const c=new Client({fetchImpl:async()=>new Response(raw)}),row=(await c.get('/app/hook/deliveries?per_page=100'))[0];
 a.equal(row.id,'3843641202479988736');a.equal(row.status_code,200);a.equal(row.duration,0.5);
 a.equal(row.message,'id 3843641202479988736 and "id":1234567890123456789');
});
