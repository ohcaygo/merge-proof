"use strict";
const {execFile}=require("node:child_process"),{promisify}=require("node:util"),{assert}=require("../common");
const execute=promisify(execFile);
function client({executable="/usr/local/bin/aws",profile,region,accountId},run=execute){
 assert(/^\/[\w/.-]+$/.test(executable)&&(!profile||/^[\w-]{1,80}$/.test(profile))&&/^us-(east|west)-[12]$/.test(region)&&/^\d{12}$/.test(accountId),"AWS_CONFIG_INVALID");
 const call=async(service,operation,args=[])=>{
  try {const r=await run(executable,[...(profile?["--profile",profile]:[]),"--region",region,"--no-cli-pager","--output","json",service,operation,...args],{timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,AWS_PAGER:""}});return r.stdout?.trim()?JSON.parse(r.stdout):{};}
  catch(e){const text=String(e.stderr||"");throw Object.assign(Error("AWS_OPERATION_FAILED"),{code:"AWS_OPERATION_FAILED",providerCode:text.match(/An error occurred \(([^)]+)\)/)?.[1]||null});}
 };
 return {call,checkIdentity:async()=>{const id=await call("sts","get-caller-identity");assert(id.Account===accountId&&/^arn:aws:sts::\d{12}:assumed-role\//.test(id.Arn),"SHORT_LIVED_EXPECTED_ACCOUNT_ROLE_REQUIRED");return {accountId:id.Account,role:id.Arn};}};
}
module.exports={client};
