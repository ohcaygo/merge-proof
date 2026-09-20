'use strict';
// Independent worlds share no state. Sharding retains every seed and assertion,
// including the original seed and shrinking trace when a worker finds a defect.
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const crypto=require('node:crypto'),{world,sequence,minimize}=require('./model-world');
function signer(){const pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),key={...pair.publicKey.export({format:'jwk'}),kid:'model',nbf:'2020-01-01T00:00:00Z',exp:'2040-01-01T00:00:00Z'};const sign=async bytes=>({keyid:key.kid,sig:crypto.sign('sha256',bytes,pair.privateKey).toString('base64')});sign.keys={keys:[key]};return sign;}
async function shard({count,offset,stride}){
 const key=signer(),totals={sequences:0,actions:0,requests:0,counted:0,notModified:0,faults:0,deliveries:0,duplicates:0,checks:0};
 const execute=async(seed,actions)=>{const h=world(seed,key);await h.send(h.delivery('pull_request',{pull_request:{number:1,state:'open'}}));await h.drain();for(const action of actions)await h.action(action);return h.finish();};
 for(let seed=offset+1;seed<=count;seed+=stride){
  const actions=sequence(seed);
  try{const result=await execute(seed,actions);totals.sequences++;totals.actions+=actions.length;for(const [k,v] of Object.entries(result))totals[k]=(totals[k]||0)+v;}
  catch(error){const small=await minimize(actions,async trace=>{try{await execute(seed,trace);return false;}catch(e){return e.message===error.message;}});throw Error(`seed=${seed}; minimal=${JSON.stringify(small)}; ${error.stack}`);}
 }
 return totals;
}
async function run(count){
 if(!Number.isSafeInteger(count)||count<1)throw Error('Invalid model seed count');
 const concurrency=Math.min(count,4,require('node:os').availableParallelism?.()||2),workers=[];
 try{
  const results=await Promise.all(Array.from({length:concurrency},(_,offset)=>new Promise((resolve,reject)=>{
   const worker=new Worker(__filename,{workerData:{count,offset,stride:concurrency}});workers.push(worker);let result;
   worker.once('message',value=>{result=value;});worker.once('error',reject);
   worker.once('exit',code=>code===0&&result?resolve(result):reject(Error(`Model worker ${offset} exited ${code} without a complete result`)));
  })));
  const totals={};for(const result of results)for(const [k,v] of Object.entries(result))totals[k]=(totals[k]||0)+v;
  return {totals,workers:concurrency};
 }finally{await Promise.all(workers.map(worker=>worker.terminate()));}
}
if(!isMainThread)shard(workerData).then(result=>parentPort.postMessage(result)).catch(error=>{throw error;});
module.exports={run,signer};
