#!/usr/bin/env node
'use strict';
// Explicit owner-operated release step; not invoked by ProofService.
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {assert,repoName,hash}=require('../common');
async function publish(config,execute=promisify(execFile)){
 assert(config.authorized===true&&repoName(config.repository)&&typeof config.branch==='string'&&/^[\w/-]+$/.test(config.branch)&&/^anchors\/[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$/.test(config.path),'ANCHOR_AUTHORIZATION_REQUIRED');
 const bytes=fs.readFileSync(config.preparedFile),prepared=JSON.parse(bytes);
 assert(prepared.schema==='urn:merge-proof:anchor-publication:1'&&prepared.digest===hash(prepared.checkpoint)&&prepared.checkpoint.signature&&config.path===`anchors/${prepared.checkpoint.day}.json`,'SIGNED_CHECKPOINT_REQUIRED');
 const keys=JSON.parse(fs.readFileSync(config.trustedKeysFile,'utf8')).keys;
 const {signature,...body}=prepared.checkpoint;
 assert(require('../bundle').verifySignature(Buffer.from(JSON.stringify(require('../common').canonical(body))),[signature],keys,body.issuedAt),'CHECKPOINT_SIGNATURE_UNVERIFIED');
 const gh=async args=>JSON.parse((await execute('gh',args,{timeout:30000,maxBuffer:1024*1024})).stdout);
 const repository=await gh(['api',`repos/${config.repository}`]);
 assert(repository.private===false&&repository.permissions?.admin===true&&repository.full_name.toLowerCase()===config.repository.toLowerCase(),'OWNED_PUBLIC_ANCHOR_REPOSITORY_REQUIRED');
 const endpoint=`repos/${config.repository}/contents/${config.path}`;
 try{const existing=await gh(['api',endpoint+'?ref='+encodeURIComponent(config.branch)]);assert(Buffer.from(existing.content,'base64').equals(bytes),'ANCHOR_IMMUTABILITY_VIOLATION');return {state:'ALREADY_PUBLISHED',url:existing.html_url,blob:existing.sha};}
 catch(e){if(e.code==='ANCHOR_IMMUTABILITY_VIOLATION'||!String(e.stderr||'').includes('404'))throw e;}
 const result=await gh(['api','--method','PUT',endpoint,'-f',`message=Publish Merge Proof operator checkpoint ${prepared.checkpoint.day}`,'-f',`branch=${config.branch}`,'-f',`content=${bytes.toString('base64')}`]);
 return {state:'PUBLISHED',repository:config.repository,commit:result.commit.sha,path:config.path,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),url:result.content.html_url};
}
if(require.main===module){publish(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||'ANCHOR_PUBLICATION_UNAVAILABLE');process.exitCode=1;});}
module.exports={publish};
