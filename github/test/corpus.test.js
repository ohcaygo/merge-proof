"use strict";
const {test}=require("node:test"),a=require("node:assert/strict");
const {capture,H,B,M}=require("./fixtures"),{prove,freshness}=require("../proof"),{compare}=require("../landing");
for(const row of require("./corpus/l3-captures.json").cases) test(`recorded L3 corpus: ${row.id}`,()=>{
  const r=prove(row.capture);a.equal(r.verdict,row.expect.verdict);
  if(row.expect.gap)a.ok(r.gaps.includes(row.expect.gap));
  a.deepEqual(freshness(prove(capture()),row.capture).changed,row.expect.changed);
  const record={proof:{receiptSnapshot:r},mergedHeadSha:H,mergeCommitSha:M};
  a.equal(compare(record,{sha:M,tree:r.summary.target.value.tree,parents:[B]}).state,row.expect.landed);
});
