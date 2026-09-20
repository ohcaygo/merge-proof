'use strict';
const {assert,sha}=require('./common');
// A complete provider-reported prefix, not a queue branch-name inference.
function prefix(repository,identity,group){
 const p=repository?.pullRequest,q=p?.mergeQueueEntry,list=q?.mergeQueue?.entries;
 assert(repository?.databaseId===identity.repositoryId&&p.headRefOid===identity.headSha&&q.headCommit?.oid===group.head_sha&&q.baseCommit?.oid===group.base_sha,'QUEUE_ORDER_SUBJECT_MISMATCH');
 assert(Number.isInteger(q.position)&&q.position>0&&list?.pageInfo?.hasNextPage===false&&Array.isArray(list.nodes),'QUEUE_MEMBERSHIP_ORDER_UNAVAILABLE');
 const nodes=list.nodes.filter(x=>x.position<=q.position).sort((a,b)=>a.position-b.position);
 assert(nodes.length===q.position&&nodes.every((x,n)=>x.position===n+1),'QUEUE_ORDER_INCOMPLETE');
 const entries=nodes.map((x,n)=>{
   assert(['AWAITING_CHECKS','MERGEABLE','LOCKED'].includes(x.state)&&Number.isInteger(x.pullRequest?.number)&&sha(x.pullRequest?.headRefOid)&&sha(x.headCommit?.oid)&&x.baseCommit?.oid===(n?nodes[n-1].headCommit.oid:identity.baseSha),'QUEUE_ORDER_CHAIN_MISMATCH');
   return {pr:x.pullRequest.number,head:x.pullRequest.headRefOid,candidate:x.headCommit.oid,base:x.baseCommit.oid};
 });
 assert(entries.at(-1).pr===identity.pr&&entries.at(-1).head===identity.headSha&&entries.at(-1).candidate===group.head_sha&&new Set(entries.map(x=>x.pr)).size===entries.length,'QUEUE_ORDER_SUBJECT_MISMATCH');
 return {providerOrderConfirmed:true,repositoryId:identity.repositoryId,base:identity.baseSha,entries};
}
function bound(order,identity,selection){
 try{
  assert(order?.providerOrderConfirmed===true&&order.repositoryId===identity.repositoryId&&order.base===identity.baseSha&&Array.isArray(order.entries)&&order.entries.length>0&&order.entries.length<=100,'QUEUE_ORDER_UNAVAILABLE');
  const seen=new Set();
  for(const [n,e] of order.entries.entries()){
   assert(Number.isSafeInteger(e.pr)&&e.pr>0&&!seen.has(e.pr)&&sha(e.head)&&sha(e.candidate)&&sha(e.base)&&e.base===(n?order.entries[n-1].candidate:identity.baseSha),'QUEUE_ORDER_CHAIN_MISMATCH');seen.add(e.pr);
  }
  const last=order.entries.at(-1);
  return last.pr===identity.pr&&last.head===identity.headSha&&last.candidate===selection.headSha&&last.base===selection.baseSha&&selection.candidateSha===identity.headSha;
 }catch{return false;}
}
module.exports={prefix,bound};
