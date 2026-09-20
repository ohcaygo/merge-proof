#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function inspect(config){
 const rows=[];const check=(name,fn)=>{try{rows.push({name,state:fn()?'PASS':'NOT_PROVEN'});}catch{rows.push({name,state:'NOT_PROVEN'});}};
 check('source-commit',()=>/^[a-f0-9]{40}$/.test(config.sourceCommit)&&spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()===config.sourceCommit);
 check('clean-product-tree',()=>spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim()==='');
 check('pinned-git-binary',()=>crypto.createHash('sha256').update(fs.readFileSync(config.reconstruction.binary)).digest('hex')===config.reconstruction.sha256);
 check('pinned-git-version',()=>spawnSync(config.reconstruction.binary,['--version'],{encoding:'utf8'}).stdout.trim()===config.reconstruction.version);
 check('linux-release-environment',()=>process.platform==='linux');
 check('static-git-runtime',()=>{const binary=config.reconstruction.binary;const program=spawnSync('readelf',['-l',binary],{encoding:'utf8'}),dynamic=spawnSync('readelf',['-d',binary],{encoding:'utf8'});return program.status===0&&dynamic.status===0&&!/INTERP/.test(program.stdout)&&!/NEEDED/.test(dynamic.stdout);});
 check('signing-configuration',()=>!!require('../signing').configured(config.signing));
 const out={schema:'urn:merge-proof:release-preflight:1',at:new Date().toISOString(),rows,deploymentAuthorized:false,
  limitations:['This command does not prove a live KMS call, public JWKS publication, external anchoring, provider smoke, or deployment.']};
 return {...out,state:rows.every(r=>r.state==='PASS')?'LOCAL_CONFIGURATION_CHECKED':'NOT_PROVEN'};
}
if(require.main===module){const result=inspect(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.state==='NOT_PROVEN'?2:0;}
module.exports={inspect};
