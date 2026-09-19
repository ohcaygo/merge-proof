"use strict";
const { hash } = require("./common");
function append(data, receiptId, envelope, now = new Date().toISOString()) {
  data.operatorLog ||= [];
  const old = data.operatorLog.find(x => x.receiptId === receiptId);
  if (old) return structuredClone(old);
  const body = { kind: "merge-proof-operator-log/v1", index: data.operatorLog.length, receiptId, envelopeDigest: hash(envelope),
    previous: data.operatorLog.at(-1)?.hash || null, recordedAt: now };
  const row = { ...body, hash: hash(body) }; data.operatorLog.push(row); return structuredClone(row);
}
async function checkpoint(data, day, signer = null) {
  const rows = (data.operatorLog || []).filter(x => x.recordedAt.slice(0,10) <= day);
  let layer = rows.map(x => x.hash);
  while (layer.length > 1) { const next=[];for(let n=0;n<layer.length;n+=2)next.push(hash([layer[n],layer[n+1]||layer[n]]));layer=next; }
  const body = { kind: "merge-proof-operator-log/v1", day, size: rows.length, root: layer[0] || null, publicAnchor: null,
    limitation: "Operator-controlled log. No independent timestamp or external transparency is established without a public anchor." };
  return { ...body, signature: signer ? await signer(Buffer.from(JSON.stringify(body))) : null };
}
module.exports = { append, checkpoint };
