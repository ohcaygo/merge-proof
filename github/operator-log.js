"use strict";
const {hash,canonical,assert}=require('./common');
const KIND='merge-proof-operator-log/v1';
function append(data,receiptId,envelope,now=new Date().toISOString()){
  data.operatorLog||=[];
  const old=data.operatorLog.find(x=>x.receiptId===receiptId);
  if(old){assert(old.envelopeDigest===hash(envelope),'LOG_ENVELOPE_CHANGED');return structuredClone(old);}
  const body={kind:KIND,index:data.operatorLog.length,receiptId,envelopeDigest:hash(envelope),previous:data.operatorLog.at(-1)?.hash||null,recordedAt:now};
  const row={...body,hash:hash(body)};data.operatorLog.push(row);return structuredClone(row);
}
function tree(hashes){let layer=hashes.slice();while(layer.length>1){const next=[];for(let n=0;n<layer.length;n+=2)next.push(hash([layer[n],layer[n+1]||layer[n]]));layer=next;}return layer[0]||null;}
function validate(rows){for(let n=0;n<rows.length;n++){const {hash:digest,...body}=rows[n];assert(body.kind===KIND&&body.index===n&&body.previous===(rows[n-1]?.hash||null)&&hash(body)===digest,'LOG_CHAIN_INVALID');}}
async function checkpoint(data,day,signer=null){
  assert(/^\d{4}-\d{2}-\d{2}$/.test(day),'INVALID_CHECKPOINT_DAY');validate(data.operatorLog||[]);
  const rows=(data.operatorLog||[]).filter(x=>x.recordedAt.slice(0,10)<=day);
  assert(rows.every((r,n)=>r.index===n),'LOG_CLOCK_ORDER_INVALID');
  const body={kind:KIND,day,issuedAt:new Date().toISOString(),size:rows.length,root:tree(rows.map(x=>x.hash)),publicAnchor:null,
    limitation:'Operator-controlled log. A signature is not an independent timestamp or an external transparency witness.'};
  return {...body,signature:signer?await signer(Buffer.from(JSON.stringify(canonical(body)))):null};
}
function inclusion(data,index,checkpoint){
  const rows=(data.operatorLog||[]).slice(0,checkpoint.size);validate(rows);assert(Number.isInteger(index)&&index>=0&&index<rows.length&&tree(rows.map(x=>x.hash))===checkpoint.root,'LOG_CHECKPOINT_MISMATCH');
  let position=index,layer=rows.map(x=>x.hash);const path=[];
  while(layer.length>1){path.push({side:position%2?'left':'right',hash:layer[position^1]||layer[position]});const next=[];for(let n=0;n<layer.length;n+=2)next.push(hash([layer[n],layer[n+1]||layer[n]]));position=Math.floor(position/2);layer=next;}
  return {kind:KIND,entry:structuredClone(rows[index]),checkpoint,path};
}
function verify(proof,envelope,{trustedKeys=[]}={}){
  try{const {hash:digest,...entry}=proof.entry,cp=proof.checkpoint;assert(proof.kind===KIND&&entry.kind===KIND&&hash(entry)===digest&&entry.envelopeDigest===hash(envelope),'LOG_ENTRY_MISMATCH');
    assert(Number.isSafeInteger(cp.size)&&cp.size>entry.index&&Number.isInteger(entry.index)&&entry.index>=0&&cp.kind===KIND,'LOG_INDEX_INVALID');
    let value=digest,position=entry.index,size=cp.size,n=0;
    while(size>1){const sibling=proof.path[n++];assert(sibling&&sibling.side===(position%2?'left':'right')&&/^[a-f0-9]{64}$/.test(sibling.hash),'LOG_PATH_INVALID');
      if(position%2===0&&position+1===size)assert(sibling.hash===value,'LOG_ODD_LEAF_INVALID');
      value=hash(sibling.side==='left'?[sibling.hash,value]:[value,sibling.hash]);position=Math.floor(position/2);size=Math.ceil(size/2);}
    assert(n===proof.path.length&&value===cp.root,'LOG_ROOT_MISMATCH');
    const {signature,...body}=cp;
    const signed=signature&&require('./bundle').verifySignature(Buffer.from(JSON.stringify(canonical(body))),[signature],trustedKeys,cp.issuedAt||entry.recordedAt);
    return {state:signed?'INCLUSION_CONSISTENT':'CHECKPOINT_SIGNATURE_UNVERIFIED',checkpointSignature:signed?'VALID_TRUSTED_KEY':'UNVERIFIED',externalAnchor:'NOT_PROVEN',exitCode:signed?0:2};
  }catch(e){return {state:'LOG_INCONSISTENT',reason:e.code||'MALFORMED_LOG',exitCode:3};}
}
module.exports={append,checkpoint,inclusion,verify,validate,tree};
