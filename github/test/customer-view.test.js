"use strict";
const {test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm');
const ui=require('../customer-view'),brand=require('../customer-brand'),{script}=require('../customer-public');
const example=require('../examples/receipt.json');
const usage={plan:'AWAITING_FIRST_PROOF',automationAllowed:true};
const config={appId:1,privateKey:'fixture',webhookSecret:'fixture'};
function row(n,pr=16){const r=structuredClone(example);Object.assign(r,{receiptId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,issuedAt:new Date(Date.UTC(2026,8,13,0,n)).toISOString(),verdict:'FAIL',gaps:['RULES_UNAVAILABLE','GIT_HISTORY_UNAVAILABLE'],freshness:{state:'UNAVAILABLE'}});Object.assign(r.identity,{repository:'fixture/repo',repositoryId:1,pr,githubMergeable:false,githubMergeState:'dirty'});r.summary.ci.required=[];r.summary.approval.reason='UNAVAILABLE';return {installationId:2,receipt:r,current:{state:n<19?'STALE':'UNAVAILABLE'},gate:{enforced:false}};}
function dataset(count=19){return {receipts:Object.fromEntries(Array.from({length:count},(_,i)=>{const r=row(i+1);return [r.receipt.receiptId,r];})),subscriptions:{'1:16':{installationId:2,repositoryId:1,pr:16,refreshState:'CURRENT'}},queue:[]};}
test('nineteen immutable observations become one latest card and eighteen history links; no fingerprint merging or writes',()=>{
 const d=dataset(),before=JSON.stringify(d),cards=ui.inbox(d,config,2,1,[{number:16}],usage);
 a.equal(cards.length,1);a.equal(cards[0].id,row(19).receipt.receiptId);a.equal(cards[0].history.length,18);
 a.equal(new Set([cards[0].id,...cards[0].history.map(r=>r.id)]).size,19);
 a.equal(cards[0].label,'FAIL');a.equal(cards[0].freshness,'Currentness unavailable');a.equal(cards[0].automation.state,'EVENT_DRIVEN');
 a.match(cards[0].explanation,/conflicts.*incomplete.*requirements could not be read/);a.doesNotMatch(cards[0].nextAction,/reinstall|grant/);
 a.equal(JSON.stringify(d),before);
});
test('grouping includes history beyond the old last-30 cap, sorts by observation, and excludes other scopes',()=>{
 const d=dataset(40);const other=row(41,17);d.receipts.other=other;d.receipts.denied={...row(42),installationId:3};const elsewhere=row(43);elsewhere.receipt.identity.repositoryId=8;d.receipts.elsewhere=elsewhere;
 d.receipts=Object.fromEntries(Object.entries(d.receipts).reverse());const cards=ui.inbox(d,config,2,1,[],usage);
 a.deepEqual(cards.map(c=>c.pr),[17,16]);a.equal(cards[1].history.length,39);a.equal(cards[1].id,row(40).receipt.receiptId);a.equal(cards[1].automation.state,'UNCONFIRMED');
 a.doesNotMatch(JSON.stringify(cards),/privateKey|webhookSecret|installationId|retryAt/);
});
test('result follows concrete evidence, not a global FAIL rename',()=>{
 const r=row(19).receipt;a.equal(ui.result(r).label,'FAIL');
 r.summary.ci.required=[{name:'build',state:'FAILED',conclusion:'failure'}];a.equal(ui.result(r).label,'FAIL');a.match(ui.result(r).action,/failed check/);
 r.summary.ci.required=[{name:'build',state:'MISSING'}];a.equal(ui.result(r).label,'FAIL');
 r.summary.approval.reason='CHANGES_REQUESTED_OBSERVED';a.equal(ui.result(r).label,'FAIL');
 r.summary.approval.reason='UNAVAILABLE';r.verdict='VERIFIED';r.gaps=[];r.freshness.state='CURRENT';a.equal(ui.result(r).label,'VERIFIED');
 r.verdict='NOT_PROVEN';a.equal(ui.result(r).label,'NOT_PROVEN');
});
test('freshness never inherits worker CURRENT, stale does not invent a queued recovery, and policy is independent',()=>{
 const r=row(19),c={tracked:true,sub:{refreshState:'CURRENT'},usage,jobs:[],policy:{enforced:true}};
 let v=ui.presentation(r,c);a.equal(v.freshness,'Currentness unavailable');a.match(v.automation.text,/No re-check is queued/);a.doesNotMatch(v.automation.text,/will repair/);a.match(v.mergeImpact,/depends on/);
 r.current={state:'STALE'};v=ui.presentation(r,c);a.equal(v.freshness,'Out of date');a.match(v.automation.text,/No re-check is queued/);
 c.jobs=[{}];v=ui.presentation(r,c);a.equal(v.automation.state,'CHECKING');a.match(v.nextAction,/Wait for the queued/);
 r.current={state:'CURRENT',asOf:'2026-09-13T12:00:00Z'};a.match(ui.presentation(r,c).freshness,/last observation.*not rechecked/);
 a.equal(r.receipt.verdict,'FAIL');
});
test('automatic states distinguish actual queued retries, exhaustion, delivery and paused access',()=>{
 a.equal(ui.operation({jobs:[{attempts:1}]}).state,'RETRYING');
 a.equal(ui.operation({jobs:[],sub:{refreshState:'UNAVAILABLE'}}).state,'ATTENTION');
 a.equal(ui.operation({jobs:[],delivery:'UNAVAILABLE'}).state,'DELIVERY_UNAVAILABLE');
 a.equal(ui.operation({jobs:[{}],usage:{automationAllowed:false}}).state,'PAUSED');
 const d=dataset();d.queue=[{installationId:3,repositoryId:1,pr:16}];a.equal(ui.context(d,config,row(19),usage,true).jobs.length,0);
 a.equal(ui.context(d,{},row(19),usage,true).tracked,false);
});
test('PR without a receipt is pending only if a matching job actually exists',()=>{
 const d=dataset(0),pulls=[{number:16,title:'Synthetic',base:{repo:{full_name:'fixture/repo'}}}];
 a.equal(ui.inbox(d,config,2,1,pulls,usage)[0].label,'No observation available');
 d.queue=[{installationId:2,repositoryId:1,pr:16}];const c=ui.inbox(d,config,2,1,pulls,usage)[0];a.equal(c.label,'Checking current evidence');a.equal(c.id,null);a.equal(c.freshness,'Not established');
});
test('trial presentation preserves exact expiry and does not infer payment, start a trial or mutate usage',()=>{
 const states=[usage,{plan:'TRIAL',trial:{endsAt:'2026-09-20T17:00:00.000Z'}},{plan:'TRIAL',trialDays:10,trial:{endsAt:'2026-09-23T17:00:00.000Z'}},{plan:'PAUSED',trial:{endsAt:'2026-09-12T17:00:00.000Z'}},{plan:'PRO'},{}];const before=JSON.stringify(states);
 a.deepEqual(states.map(u=>ui.trial(u).label),['Trial not started','Trial active','Trial active','Trial expired — hosted access paused','Paid Pro active','Account status unavailable']);
 a.match(ui.trial(states[1]).detail,/seven-day|7-day/);a.match(ui.trial(states[1]).detail,/2026-09-20T17:00:00.000Z/);a.match(ui.trial(states[2]).detail,/10-day/);a.match(ui.trial(states[3]).detail,/Existing receipts remain accessible/);a.match(ui.trial(usage).detail,/collection-complete VERIFIED or NOT_PROVEN/);a.match(ui.trial({...usage,trialDays:10}).detail,/10-day/);a.equal(JSON.stringify(states),before);
});
test('receipt foreground is human-readable, raw evidence remains collapsed and HTML escapes untrusted values',()=>{
 const r=row(19);r.receipt.identity.repository='<img onerror=bad>';const raw=require('../receipt').html(r.receipt,r.current);const html=brand.receipt(raw,ui.presentation(r),ui.trial(usage));
 a.match(html,/Technical evidence and machine verdict: FAIL/);a.match(html,/<details><summary>Technical evidence/);a.doesNotMatch(html,/<details open/);a.match(html,/&lt;img onerror=bad&gt;/);a.match(html,/Verdict: FAIL/);a.match(html,/Freshness: Currentness unavailable/);
 a.equal((html.match(/<main\b/g)||[]).length,1);a.equal((html.match(/<\/main>/g)||[]).length,1);
 a.ok(html.indexOf('Next action:')<html.indexOf('Technical evidence and machine verdict'));
});
test('executed client shows one card, collapsed complete history, explicit toggle and retains user-expanded history across refresh',async()=>{
 const els=new Map();function element(tag){return {tag,value:'',checked:false,hidden:false,options:[],textContent:'',append(...xs){this.options.push(...xs);},replaceChildren(){this.options=[];},closest(){return {hidden:false};}};}
 const get=id=>{if(!els.has(id))els.set(id,element(id));return els.get(id);};get('latestOnly').checked=true;
 const ctx=vm.createContext({document:{getElementById:get,createElement:element},location:{search:''},URLSearchParams,setInterval(){},fetch:async()=>({ok:false,json:async()=>({error:'LOGIN_REQUIRED'})})});
 vm.runInContext(script,ctx);await new Promise(r=>setImmediate(r));a.equal(get('status').textContent,'Connect GitHub to view your authorized repositories. We will check your App installation and repository access after sign-in. Existing background proofs keep running.');ctx.cards=ui.inbox(dataset(),config,2,1,[{number:16}],usage);vm.runInContext('account={inbox:cards};renderInbox(cards)',ctx);
 const history=()=>get('receipts').options[0].options.find(e=>e.tag==='details');a.equal(get('receipts').options.length,1);a.equal(history().open,false);a.equal(history().options[1].options.length,18);
 history().open=true;history().ontoggle();vm.runInContext('renderInbox(cards)',ctx);a.equal(history().open,true);
 get('latestOnly').checked=true;get('latestOnly').onchange();a.equal(history().open,false);
 get('latestOnly').checked=false;get('latestOnly').onchange();a.equal(history().open,true);
});

test('no required validation preserves machine NOT_PROVEN across Check, account and receipt independently of freshness',()=>{
 const r=row(19);Object.assign(r.receipt,{verdict:'NOT_PROVEN',gaps:['NO_REQUIRED_VALIDATION_CONFIGURED'],freshness:{state:'CURRENT'}});r.receipt.identity.githubMergeable=true;r.current={state:'CURRENT'};
 const before=JSON.stringify(r.receipt),view=ui.presentation(r,{policy:{enforced:false}});
 a.equal(view.label,'NOT_PROVEN');a.match(view.explanation,/does not require any validation/);a.match(view.nextAction,/at least one existing check required/);a.match(view.freshness,/Current at last observation/);a.match(view.mergeImpact,/report-only/);
 const policy=require('../policy').evaluate(r.receipt,r.current,null),check=require('../check');
 a.match(check.title(r.receipt,r.current,policy),/^NOT_PROVEN.*CURRENT.*reporting only/);
 a.match(check.summary(r.receipt,r.current,policy),/at least one existing check required/);
 const html=brand.receipt(require('../receipt').html(r.receipt,{state:'UNAVAILABLE',reason:'REFRESH_REQUIRED'}),view);
 a.match(html,/Verdict: NOT_PROVEN/);a.doesNotMatch(html,/Unable to evaluate|Receipt currentness: UNAVAILABLE/);a.match(html,/Live recheck: not requested/);
 for(const state of ['STALE','UNAVAILABLE']){r.current={state};const v=ui.presentation(r);a.equal(v.label,'NOT_PROVEN');a.equal(v.freshness,state==='STALE'?'Out of date':'Currentness unavailable');}
 a.equal(JSON.stringify(r.receipt),before);
});
