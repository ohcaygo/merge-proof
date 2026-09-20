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
 return {providerOrderConfirmed:true,base:identity.baseSha,entries};
}
module.exports={prefix};
