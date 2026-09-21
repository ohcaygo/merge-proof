"use strict";
const {test}=require("node:test"), a=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createHmac,randomUUID}=require("node:crypto");
const {Store}=require("../../factory/store"),{ProofService}=require("../service"),{Client}=require("../client"),{fixtureFetch}=require("./fixtures"),{aggregate}=require("../events");
function harness(t, config={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-trial-")),store=new Store(root),writes=[];
 let check=500,head="1".repeat(40);
 const service=new ProofService({store,config:{hosted:true,appId:42,publishChecks:true,origin:"https://example.test",webhookSecret:"s".repeat(40),...config},appClient:async()=>{
  const c=new Client(fixtureFetch({head})); const list=c.list.bind(c),request=c.request.bind(c);
  c.list=async(p,k)=>p.endsWith("/pulls?state=open") ? [{number:1,state:"open",user:{id:9,type:"User",login:"owner"},created_at:new Date().toISOString()}] : list(p,k);
  c.request=async(p,o)=>{if(o?.method && p !== "/graphql"){writes.push({p,...o});return {id:check++};} return request(p,o);};
  return c;
 },clientFactory:()=>new Client(fixtureFetch({head}))});
 t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
 const hook=async(event,p,id=randomUUID())=>{const raw=Buffer.from(JSON.stringify(p));return service.webhook(raw,{"x-github-event":event,"x-github-delivery":id,"x-hub-signature-256":"sha256="+createHmac("sha256","s".repeat(40)).update(raw).digest("hex")});};
 return {service,store,writes,hook,head:h=>head=h};
}
test("install discovers existing PR, starts one durable trial only after proof and automatic events reconstruct value",async t=>{
 const h=harness(t),s=h.service;
 const install={action:"created",installation:{id:2,account:{id:9}},repositories:[{id:1,full_name:"fixture/public"}]};
 await h.hook("installation",install,"install-one");
 a.equal(s.meter.usage(2).plan,"AWAITING_FIRST_PROOF");a.equal(s.meter.account(2).trial,undefined);
 a.equal((await h.hook("installation",install,"install-one")).duplicate,true);
 await s.drain();
 a.equal(s.meter.usage(2).plan,"TRIAL");
 const trial={...s.meter.account(2).trial};
 a.equal(trial.endsAt-trial.startedAt,7*86400000);
 const first=Object.values(s.data.receipts)[0];
 a.ok(first.checkId);a.equal(s.data.subscriptions["1:1"].latestReceiptId,first.receipt.receiptId);
 h.head("2".repeat(40));
 await h.hook("push",{ref:"refs/heads/feature",installation:{id:2},repository:{id:1,full_name:"fixture/public"}});
 await s.drain();
 a.equal(first.current.state,"STALE");a.deepEqual(s.meter.account(2).trial,trial);
 const persisted=JSON.parse(fs.readFileSync(h.store.file));
 a.deepEqual(persisted.meter.accounts["github:9"].trial,trial);
 for(const stage of ["app_installed","repo_authorized","first_successful_proof","trial_started","automatic_proof","evidence_changed"])a.ok(aggregate(persisted).some(r=>r.stage===stage),stage);
 a.equal(Object.values(persisted.lifecycle).filter(e=>e.type==="trial_started").length,1);
});
test("empty authorized repository watches next PR without starting trial",async t=>{
 const h=harness(t),s=h.service;s.meter.connect(2,9);
 s.watch(2,1,"fixture/public",[]);await s.drain();a.equal(s.meter.account(2).trial,undefined);
 await h.hook("pull_request",{action:"opened",installation:{id:2},repository:{id:1,full_name:"fixture/public"},pull_request:{number:1,state:"open",user:{id:9,type:"User",login:"owner"}}});
 await s.drain();a.equal(s.meter.usage(2).plan,"TRIAL");
});
test("scheduled day 5/6/7 notices, expiry, same-head pause, immutable receipt and paid resume",async t=>{
 const h=harness(t),s=h.service;s.meter.connect(2,9);s.watch(2,1,"fixture/public",[{number:1}]);await s.drain();
 const trial=s.meter.account(2).trial,first=Object.values(s.data.receipts)[0],body=JSON.stringify(first.receipt);
 let now=trial.startedAt;t.mock.method(Date,"now",()=>now);
 for(const day of [5,6,7]){now=trial.startedAt+(day-1)*86400000;await s.drain();a.equal(s.data.subscriptions["1:1"].noticeDay,day);
 const reminder=[...h.writes].reverse().find(w=>w.body?.output?.title?.startsWith("Trial ends") && w.p.endsWith("/"+first.checkId)).body;
 a.equal(reminder.conclusion,undefined,"reminder preserves native conclusion");
 a.ok(reminder.output.summary.endsWith(require("../check").summary(first.receipt,first.current,s.gateFor(first.receipt,first.current),s.remediationFor(first.receipt,first.current))),"reminder retains proof/remediation summary");
 a.equal(JSON.stringify(first.receipt),body);const n=h.writes.length;await s.drain();a.equal(h.writes.length,n);}
 now=trial.endsAt;await s.drain();a.equal(s.meter.usage(2).plan,"PAUSED");
 a.equal(s.data.subscriptions["1:1"].noticeDay,8);
 a.ok(h.writes.some(w=>w.body?.output?.title==="Hosted access ended — action required"));
 a.match(h.writes.at(-1).body.output.summary,/subscribe or remove/);
 await a.rejects(s.run("fixture/public",1,{installationId:2}),/TRIAL_EXPIRED/);
 a.equal(JSON.stringify(first.receipt),body);
 a.equal((await s.read(first.receipt.receiptId,"fixture")).receipt.receiptId,first.receipt.receiptId);
 s.meter.paidPeriod("github:9",{verifiedPaid:true,quantity:1,periodStart:now,periodEnd:now+30*86400000});s.resumeEntitled();await s.drain();
 a.equal(s.meter.usage(2).plan,"PRO");a.equal(s.data.subscriptions["1:1"].refreshState,"CURRENT");a.deepEqual(s.meter.account(2).trial,trial);
});
test("allowlisted account sends only days 8/9/10 reminders and expires on its persisted tenth day",async t=>{
 const h=harness(t,{invitedTesterAccountIds:[9]}),s=h.service;
 s.meter.connect(2,9);s.watch(2,1,"fixture/public",[{number:1}]);await s.drain();
 const trial=s.meter.account(2).trial,first=Object.values(s.data.receipts)[0];
 a.equal(trial.trialDays,10);a.equal(s.meter.usage(2).trialDays,10);
 a.throws(()=>s.setPolicy(1,"REPOSITORY_REQUIREMENTS",9),/PAID_PRO_REQUIRED_FOR_GATE/);
 let now=trial.startedAt;t.mock.method(Date,"now",()=>now);
 now=trial.startedAt+6*86400000;
 await s.drain();
 a.equal(h.writes.filter(w=>w.body?.output?.title?.startsWith("Trial ends")).length,0);
 a.doesNotMatch(s.meter.usage(2).notice,/within 24 hours/);
 // Preserve a pre-existing enforcing policy, as in the public-trial case.
 s.data.policies[1]={preset:"REPOSITORY_REQUIREMENTS"};
 for(const day of [8,9,10]){
   now=trial.startedAt+(day-1)*86400000;await s.drain();
   a.equal(s.data.subscriptions["1:1"].noticeDay,day);
   const reminder=[...h.writes].reverse().find(w=>w.body?.output?.title?.startsWith("Trial ends") && w.p.endsWith("/"+first.checkId));
   a.ok(reminder,"trial reminder posted");
   a.match(reminder.body.output.summary,/within 24 hours|Trial ends/);
 }
 now=trial.endsAt;await s.drain();
 a.equal(s.meter.usage(2).plan,"PAUSED");
 a.equal(s.data.subscriptions["1:1"].noticeDay,11);
 a.ok(h.writes.some(w=>w.body?.output?.title==="Hosted access ended — action required"));
 a.equal(h.writes.at(-1).body.conclusion,"failure");
 a.equal(s.data.subscriptions["1:1"].refreshState,"TRIAL_EXPIRED");
 a.match(h.writes.at(-1).body.output.summary,/subscribe or remove/);
 const afterExpiry=h.writes.length;await s.drain();a.equal(h.writes.length,afterExpiry);
});
test("trial gate enablement rejected, inherited enforcement never silently passes at expiry",async t=>{
 const h=harness(t),s=h.service;s.meter.connect(2,9);s.watch(2,1,"fixture/public",[{number:1}]);await s.drain();
 a.throws(()=>s.setPolicy(1,"REPOSITORY_REQUIREMENTS",9),/PAID_PRO_REQUIRED_FOR_GATE/);
 // Simulate a saved pre-migration policy; never modify it or the GitHub rules.
 s.data.policies[1]={preset:"REPOSITORY_REQUIREMENTS"};
 const policy=JSON.stringify(s.data.policies);
 s.meter.account(2).trial.endsAt=Date.now()-1;await s.drain();
 a.equal(h.writes.at(-1).body.conclusion,"failure");
 h.head("3".repeat(40));await h.hook("pull_request",{action:"synchronize",installation:{id:2},repository:{id:1,full_name:"fixture/public"},pull_request:{number:1,state:"open"}});await s.drain();
 a.equal(h.writes.at(-1).body.head_sha,"3".repeat(40));a.equal(h.writes.at(-1).body.conclusion,"failure");a.match(h.writes.at(-1).body.output.title,/Hosted access ended/);
 a.equal(JSON.stringify(s.data.policies),policy);a.ok(h.writes.every(w=>w.p.includes("/check-runs")));
});
test("paid Pro has no proof cap and canceled paid entitlement cannot restart free access",t=>{
 const h=harness(t),m=h.service.meter;m.connect(2,9);m.paidPeriod("github:9",{verifiedPaid:true,quantity:1,periodStart:Date.now()-1000,periodEnd:Date.now()+86400000});
 for(let n=1;n<=60;n++)m.complete(2,{receiptId:String(n),issuedAt:new Date().toISOString(),verdict:"VERIFIED",identity:{repositoryId:1,pr:1,headSha:n.toString(16).padStart(40,"0")}},{state:"CURRENT"},true);
 a.equal(m.usage(2).automationAllowed,true);a.equal(m.usage(2).used,60);a.equal(m.account(2).trial,undefined);
 m.account(2).subscription.verifiedPaid=false;a.equal(m.usage(2).automationAllowed,false);a.match(m.usage(2).notice,/Hosted access ended/);a.doesNotMatch(m.usage(2).notice,/TRIAL ENDED/);
});
test("aggregate export preserves source/time boundaries without exposing identifiers",()=>{
 const data={meter:{accounts:{"github:9":{acquisitionSource:"x"}}},lifecycle:{one:{type:"trial_started",account:"github:9",acquisition_source:"unknown",occurred_at:"2026-09-12T12:00:00.000Z"}}};
 a.deepEqual(aggregate(data,{source:"x",since:"2026-09-12T00:00:00.000Z",until:"2026-09-13T00:00:00.000Z"}),[{day:"2026-09-12",source:"x",stage:"trial_started",events:1,accounts:1}]);a.deepEqual(aggregate(data,{until:"2026-09-12T12:00:00.000Z"}),[]);
});
