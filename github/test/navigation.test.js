"use strict";
const {test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm');
const {script,renderPage}=require('../customer-public');
function harness(search='',fetchImpl,extra={}){
 const els=new Map(),calls=[];
 const element=()=>({value:'',hidden:false,disabled:false,textContent:'',options:[],append(x){this.options.push(x);},replaceChildren(){this.options=[];},closest(){return {hidden:false};}});
 const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id);};
 get('welcome').hidden=search.includes('view=account');get('connected').hidden=true;get('workspace').hidden=true;
 const location={search,href:'original'};
 const context=vm.createContext({document:{getElementById:get,createElement:element},location,URLSearchParams,setInterval(){},fetch:async(url,init)=>{calls.push({url,init});return fetchImpl?fetchImpl(url,init):{ok:true,json:async()=>({installations:[{id:2,account:'fixture'}]})};},...extra});
 vm.runInContext(script,context);
 return {get,calls,location,context,settle:()=>new Promise(r=>setImmediate(r))};
}
test('authenticated trial, Back restoration and reload never automatically advance or load repository state',async()=>{
 for(const search of ['', '?source=x']){
  const h=harness(search);await h.settle();
  a.equal(h.get('welcome').hidden,false);a.equal(h.get('connected').hidden,true);
  a.equal(h.get('connect').href,'/proof/?view=account');a.match(h.get('connect').textContent,/CONTINUE/);
  a.equal(h.location.href,'original');a.deepEqual(h.calls.map(c=>c.url),['/proof/installations']);
  a.ok(h.calls.every(c=>!c.init.method));a.equal(h.get('sessionControls').hidden,false);
 }
});
test('slow restoration leaves trial readable until explicit continuation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const h=harness('',async()=>{await pending;return {ok:true,json:async()=>({installations:[]})};});
 a.equal(h.get('welcome').hidden,false);resolve();await h.settle();
 a.equal(h.get('welcome').hidden,false);a.equal(h.location.href,'original');
});
test('explicit account URL restores selection and automatic single-repository discovery without a navigation',async()=>{
 const h=harness('?view=account',async url=>({ok:true,json:async()=>url.endsWith('installations')?{installations:[{id:2,account:'fixture'}]}:{repositories:[]}}));await h.settle();
 a.equal(h.get('welcome').hidden,true);a.equal(h.get('connected').hidden,false);a.equal(h.location.href,'original');
 a.equal(h.calls.length,2);a.equal(h.get('repository').disabled,true);a.match(h.get('status').textContent,/No authorized repositories/);
});
test('lost session and OAuth error stay on recoverable branded trial; explicit disconnect alone posts logout',async()=>{
 for(const search of ['?view=account','?login=canceled-or-unavailable']){
  const h=harness(search,async()=>({ok:false,json:async()=>({error:'LOGIN_REQUIRED'})}));await h.settle();
  a.equal(h.get('welcome').hidden,false);a.equal(h.get('connected').hidden,true);a.equal(h.location.href,'original');
  a.match(h.get('status').textContent,/Connect GitHub|GitHub connection was canceled/);
  a.doesNotMatch(h.get('status').textContent,/session expired|Connect GitHub again|two-factor authentication/);
 }
 const h=harness();await h.settle();await h.get('logout').onclick();
 a.equal(h.calls.at(-1).url,'/proof/logout');a.equal(h.calls.at(-1).init.method,'POST');a.equal(h.location.href,'/proof/');
});
test('connection failures expose retry, which restores session without moving the trial',async()=>{
 let fail=true;const h=harness('',async()=>({ok:!fail,json:async()=>fail?{error:'PROOF_UNAVAILABLE_OR_DENIED'}:{installations:[]}}));await h.settle();
 a.equal(h.get('retrySession').hidden,false);fail=false;await h.get('retryConnection').onclick();
 a.equal(h.get('retrySession').hidden,true);a.equal(h.get('welcome').hidden,false);
});
test('server renders requested step with shared brand before script or data loads; no history manipulation',()=>{
 a.match(renderPage(new URL('https://example.com/proof/')),/id="welcome" class="trial-card">/);
 a.match(renderPage(new URL('https://example.com/proof/?view=account')),/id="welcome" class="trial-card" hidden/);
 a.doesNotMatch(script,/\b(?:pushState|replaceState)\s*\(|\bhistory\.(?:go|back|forward)\s*\(/);
});

test('repository controls remain hidden until authorization succeeds and disappear at known session expiry',async()=>{
 let expire,resolve;const pending=new Promise(r=>resolve=r);
 const h=harness('?view=account',async url=>{if(url.endsWith('installations'))return {ok:true,json:async()=>({sessionExpiresAt:Date.now()+30000,installations:[{id:2,account:'fixture'}]})};await pending;return {ok:true,json:async()=>({repositories:[{id:3,name:'fixture/a'},{id:4,name:'fixture/b'}]})};},{setTimeout(fn){expire=fn;return 1;},clearTimeout(){}});
 await h.settle();a.equal(h.get('repositoryChoice').hidden,true);a.equal(h.get('repository').disabled,true);a.match(h.get('status').textContent,/Checking authorized repositories/);
 resolve();await h.settle();a.equal(h.get('repositoryChoice').hidden,false);a.equal(h.get('repository').disabled,false);
 expire();a.equal(h.get('connected').hidden,true);a.equal(h.get('repositoryChoice').hidden,true);a.equal(h.get('repository').options.length,0);a.match(h.get('status').textContent,/two-factor authentication/);
});
test('late installation or repository response cannot resurrect an expired session',async()=>{
 for(const pendingPath of ['installations','repositories']){
  let resolve;const pending=new Promise(r=>resolve=r);
  const h=harness('?view=account',async url=>{if(url.includes(pendingPath))await pending;return {ok:true,json:async()=>url.endsWith('installations')?{installations:[{id:2,account:'fixture'}]}:{repositories:[{id:3,name:'fixture/a'},{id:4,name:'fixture/b'}]}};});
  await h.settle();vm.runInContext("errorStatus(Error('LOGIN_REQUIRED'))",h.context);resolve();await h.settle();
  a.equal(h.get('connected').hidden,true);a.equal(h.get('workspace').hidden,true);a.equal(h.get('repositoryChoice').hidden,true);a.equal(h.get('repository').options.length,0);
 }
});
test('expired or denied repository lookup gives an actionable state without a populated disabled picker',async()=>{
 for(const error of ['LOGIN_REQUIRED','PROOF_UNAVAILABLE_OR_DENIED']){
  const h=harness('?view=account',async url=>({ok:url.endsWith('installations'),json:async()=>url.endsWith('installations')?{installations:[{id:2,account:'fixture'}]}:{error}}));await h.settle();
  a.equal(h.get('repositoryChoice').hidden,true);a.equal(h.get('repository').options.length,0);a.equal(h.get('workspace').hidden,true);
  a.match(h.get('status').textContent,error==='LOGIN_REQUIRED'?/Connect GitHub again/:/authorization could not be verified/);
 }
});
test('companion return selects only currently authorized installation and repository; never auto-consents',async()=>{
 for(const repository of ['4','999']) {
  const h=harness('?view=account&installation=3&repository='+repository,async url=>({ok:true,json:async()=>url.endsWith('installations')?{installations:[{id:2,account:'first'},{id:3,account:'second'}]}:url.includes('repositories?')?{repositories:[{id:4,name:'second/one'},{id:5,name:'second/two'}]}:{error:'TEST_STOP_AFTER_AUTHORIZED_SELECTION'}}));
  await h.settle();a.equal(h.get('installation').value,3);
  a.equal(h.calls.some(c=>c.url.includes('account?installation=3&repository=4')),repository==='4');
  a.ok(h.calls.every(c=>!c.init.method));a.equal(h.location.href,'original');
 }
});
