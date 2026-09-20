"use strict";
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {assert}=require('./common');
// KMS identity and the independently managed JWKS are explicit operator inputs.
// No private signing key is stored in product state or exported in a bundle.
function configured(config, execute=promisify(execFile)) {
  if(!config)return null;
  assert(config.provider==='aws-kms'&&path.isAbsolute(config.executable)&&/^arn:aws(?:-[a-z]+)?:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]+$/.test(config.keyArn),'SIGNER_CONFIG_INVALID');
  assert(typeof config.region==='string'&&/^[a-z0-9-]+$/.test(config.region)&&path.isAbsolute(config.jwksPath),'SIGNER_CONFIG_INVALID');
  const keys=JSON.parse(fs.readFileSync(config.jwksPath,'utf8')).keys;
  assert(Array.isArray(keys)&&keys.length>0&&keys.every(k=>k.d===undefined),'PUBLIC_JWKS_REQUIRED');
  const key=keys.find(k=>k.kid===config.keyId);
  assert(key?.kty==='EC'&&key.crv==='P-256'&&key.alg==='ES256'&&key.use==='sig'&&key.revoked!==true&&Number.isFinite(Date.parse(key.nbf))&&Number.isFinite(Date.parse(key.exp))&&Date.parse(key.exp)>Date.parse(key.nbf),'SIGNER_KEY_INVALID');
  const publicKey=crypto.createPublicKey({key,format:'jwk'});
  const signer=async bytes=>{
    assert(Date.now()>=Date.parse(key.nbf)&&Date.now()<Date.parse(key.exp),'SIGNER_KEY_OUTSIDE_VALIDITY');
    const digest=crypto.createHash('sha256').update(bytes).digest('base64');
    const {stdout}=await execute(config.executable,['kms','sign','--key-id',config.keyArn,'--region',config.region,
      '--message-type','DIGEST','--message',digest,'--signing-algorithm','ECDSA_SHA_256','--output','json','--no-cli-pager'],{timeout:30000,maxBuffer:65536,env:{...process.env,AWS_PAGER:''}});
    const value=JSON.parse(stdout);
    assert(value.KeyId===config.keyArn&&value.SigningAlgorithm==='ECDSA_SHA_256'&&typeof value.Signature==='string','KMS_RESPONSE_INVALID');
    assert(crypto.verify('sha256',bytes,{key:publicKey,dsaEncoding:'der'},Buffer.from(value.Signature,'base64')),'KMS_SIGNATURE_INVALID');
    return {keyid:key.kid,sig:value.Signature};
  };
  signer.keys={keys};return signer;
}
module.exports={configured};
