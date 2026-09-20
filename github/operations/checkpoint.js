#!/usr/bin/env node
'use strict';
// Produces a reviewable publication artifact. This command never publishes.
const fs=require('node:fs'),path=require('node:path');
const {assert,hash}=require('../common');
async function prepare({stateFile,day,output,signing}){
 assert(path.isAbsolute(stateFile)&&path.isAbsolute(output),'ABSOLUTE_PATHS_REQUIRED');
 assert(day<new Date().toISOString().slice(0,10),'CHECKPOINT_DAY_NOT_CLOSED');
 const snapshot=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const checkpoint=await require('../operator-log').checkpoint(snapshot.github||{},day,require('../signing').configured(signing));
 const result={schema:'urn:merge-proof:anchor-publication:1',checkpoint,digest:hash(checkpoint),publication:'NOT_PUBLISHED'};
 require('../archive').durable(output,day+'.json',result);return result;
}
if(require.main===module){const [configFile]=process.argv.slice(2);prepare(JSON.parse(fs.readFileSync(configFile,'utf8'))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||'CHECKPOINT_UNAVAILABLE');process.exitCode=1;});}
module.exports={prepare};
