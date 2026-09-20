"use strict";
// Immutable, fsync-backed sidecar. The bounded runtime cache is not retention.
const fs = require('node:fs'), path = require('node:path');
const {hash, assert} = require('./common');
const UUID = /^[a-f0-9-]{36}$/, DIGEST = /^[a-f0-9]{64}$/;
function syncDirectory(directory) {
  const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function ensureDirectory(directory) {
  if(fs.existsSync(directory))return;
  const parent=path.dirname(directory);ensureDirectory(parent);
  try{fs.mkdirSync(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  syncDirectory(parent);
}
function durable(directory, name, value) {
  ensureDirectory(directory);
  const file=path.join(directory,name), bytes=JSON.stringify(value)+'\n';
  if(fs.existsSync(file)) { assert(fs.readFileSync(file,'utf8')===bytes,'ARCHIVE_IMMUTABILITY_VIOLATION'); return; }
  const temp=path.join(directory,`.${name}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`);
  const fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  try {fs.linkSync(temp,file);} catch(e) {if(e.code!=='EEXIST')throw e;assert(fs.readFileSync(file,'utf8')===bytes,'ARCHIVE_IMMUTABILITY_VIOLATION');}
  finally {fs.unlinkSync(temp);}
  const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
class Archive {
  constructor(root){this.root=root;ensureDirectory(root);}
  receipt(row){
    const id=row.receipt?.receiptId;assert(UUID.test(id),'INVALID_RECEIPT_ID');
    // Never archive a mutable freshness/gate/cache value as present truth.
    const value={schema:'urn:merge-proof:archive-receipt:1',receipt:row.receipt,artifacts:row.artifacts||null,
      installationId:row.installationId??null,published:row.published===true};
    durable(path.join(this.root,'receipts',id.slice(0,2)),id+'.json',value);return value;
  }
  get(id){assert(UUID.test(id),'INVALID_RECEIPT_ID');const file=path.join(this.root,'receipts',id.slice(0,2),id+'.json');
    if(!fs.existsSync(file))return null;const row=JSON.parse(fs.readFileSync(file,'utf8'));assert(row.receipt?.receiptId===id,'ARCHIVE_ID_MISMATCH');
    return {...row,archived:true,current:{state:'UNAVAILABLE',reason:'ARCHIVED_HISTORICAL_RECEIPT'},observationId:row.receipt.observationId};}
  merge(record){
    assert(UUID.test(record.recordId),'INVALID_MERGE_RECORD');
    durable(path.join(this.root,'merges'),record.recordId+'.json',record);
    if(record.identity)durable(path.join(this.root,'merge-identities'),hash(record.identity)+'.json',{recordId:record.recordId});
    return record;
  }
  mergeIdentity(identity){
    const file=path.join(this.root,'merge-identities',hash(identity)+'.json');
    return fs.existsSync(file)?this.mergeRecord(JSON.parse(fs.readFileSync(file,'utf8')).recordId):null;
  }
  mergeRecord(id){
    assert(UUID.test(id),'INVALID_MERGE_RECORD');const file=path.join(this.root,'merges',id+'.json');
    if(!fs.existsSync(file))return null;const row=JSON.parse(fs.readFileSync(file,'utf8'));
    assert(row.recordId===id,'ARCHIVE_ID_MISMATCH');return row;
  }
  landing(record,observation){
    this.merge(record);
    const {observationId:ignored,...immutable}=observation;
    const value={record,observation:immutable}, id=hash(value);assert(DIGEST.test(id),'INVALID_ARCHIVE_ID');
    durable(path.join(this.root,'landings'),id+'.json',value);
    const commit=observation.landed?.sha;
    if(/^[a-f0-9]{40}$/.test(commit))durable(path.join(this.root,'commits',String(record.repositoryId),commit),id+'.json',{id});
    const receiptId=record.proof?.receiptSnapshot?.receiptId;
    if(UUID.test(receiptId))durable(path.join(this.root,'receipt-landings',receiptId),id+'.json',{id});
    return id;
  }
  landings(directory){if(!fs.existsSync(directory))return [];return fs.readdirSync(directory).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort().map(name=>{
    const value=JSON.parse(fs.readFileSync(path.join(this.root,'landings',name),'utf8'));assert(hash(value)+'.json'===name,'ARCHIVE_DIGEST_MISMATCH');return value;});}
  byReceipt(id){assert(UUID.test(id),'INVALID_RECEIPT_ID');return this.landings(path.join(this.root,'receipt-landings',id));}
  byCommit(repositoryId,commit){assert(Number.isSafeInteger(repositoryId)&&repositoryId>0&&/^[a-f0-9]{40}$/.test(commit),'INVALID_SCOPE');
    return this.landings(path.join(this.root,'commits',String(repositoryId),commit));}
}
module.exports={Archive,durable};
