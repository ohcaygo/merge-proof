'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),http=require('node:http'),{spawn}=require('node:child_process'),path=require('node:path');
const {ProofService}=require('../service'),{Client}=require('../client'),{fixtureFetch,H,B}=require('./fixtures');
test('fixture agent uses real MCP tools/call and guarded merge only for an exact validated PROCEED',async t=>{
 let mode='pass',malformed=false,mergeCalls=0;
 const make=()=>new Client({...fixtureFetch({mutate:(p,v)=>{if(p==='/repos/fixture/public')v.permissions={push:true};if(mode==='hold'&&p.endsWith('/reviews'))return [];if(mode==='fail'&&p.endsWith('/check-runs'))v.check_runs[0].conclusion='failure';return v;}}),token:'fixture'});
 const service=new ProofService({store:{data:{},save(){}},config:{origin:'http://127.0.0.1'},clientFactory:make});
 const server=http.createServer((req,res)=>{if(malformed){res.writeHead(200,{'content-type':'application/json'});res.end('{"proceed":true}');return;}return require('../http').handle(service,req,res,new URL(req.url,service.config.origin));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));service.config.origin='http://127.0.0.1:'+server.address().port;
 const input={repository:'fixture/public',repositoryId:1,pr:1,expectedHeadSha:H,expectedBaseSha:B,expectedTargetSha:H};
 const call=async request=>{const child=spawn(process.execPath,[path.resolve(__dirname,'../../bin/merge-proof.js'),'mcp'],{env:{...process.env,MP_ORIGIN:service.config.origin,MP_GITHUB_TOKEN:'fixture'},stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'merge_proof_decision',arguments:request}})+'\n');await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(error)));});return JSON.parse(output);};
 // This deterministic fixture agent implements the published AGENTS instruction;
 // its only merge operation is a synthetic provider head guard, never GitHub.
 async function agent(request,providerHead=H){const message=await call(request);if(message.error)return {action:'STOP',message};const d=require('../verify-cli').validateDecision(message.result.structuredContent,request);if(!d.proceed)return {action:'STOP',message};mergeCalls++;return {action:providerHead===d.nextAction.mergeArguments.sha?'MERGED':'HEAD_GUARD_REFUSED',message};}
 a.equal((await agent(input)).action,'MERGED');a.equal(mergeCalls,1);
 mode='hold';a.equal((await agent(input)).action,'STOP');mode='fail';a.equal((await agent(input)).action,'STOP');mode='pass';a.equal((await agent({...input,expectedHeadSha:B})).action,'STOP');a.equal(mergeCalls,1);
 a.equal((await agent(input,B)).action,'HEAD_GUARD_REFUSED');a.equal(mergeCalls,2);
 malformed=true;const invalid=await agent(input);a.equal(invalid.action,'STOP');a.equal(invalid.message.error.message,'INVALID_DECISION_CONTRACT');a.equal(mergeCalls,2);
 a.equal((await agent({...input,repositoryId:-1})).action,'STOP');a.equal(mergeCalls,2);
});
