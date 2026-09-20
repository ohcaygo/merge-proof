#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{assert}=require("../common"),{client}=require("./aws");
async function accept(c,make=client){
 require("./authority").environment(c);assert(path.isAbsolute(c.output)&&!fs.existsSync(c.output)&&/^arn:aws:kms:[\w-]+:\d{12}:key\/[a-f0-9-]+$/.test(c.keyArn)&&c.inspection.accountId===c.runtime.accountId&&c.inspection.region===c.runtime.region&&c.keyArn.startsWith(`arn:aws:kms:${c.runtime.region}:${c.runtime.accountId}:key/`),"SIGNER_ACCEPTANCE_CONFIG_INVALID");
 const admin=make(c.inspection),runtime=make(c.runtime);await admin.checkIdentity();const identity=await runtime.checkIdentity();
 const description=(await admin.call("kms","describe-key",["--key-id",c.keyArn])).KeyMetadata;
 assert(description?.Arn===c.keyArn&&description.KeySpec==="ECC_NIST_P256"&&description.KeyUsage==="SIGN_VERIFY"&&description.KeyState==="Enabled"&&!description.MultiRegion,"KMS_KEY_NOT_BOUND");
 const response=await admin.call("kms","get-public-key",["--key-id",c.keyArn]);assert(response.KeyId===c.keyArn&&response.KeySpec==="ECC_NIST_P256"&&response.SigningAlgorithms?.includes("ECDSA_SHA_256"),"KMS_PUBLIC_KEY_NOT_BOUND");
 const key=crypto.createPublicKey({key:Buffer.from(response.PublicKey,"base64"),type:"spki",format:"der"}).export({format:"jwk"});assert(key.kty==="EC"&&key.crv==="P-256"&&!key.d,"PUBLIC_JWKS_REQUIRED");
 assert(typeof c.keyId==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(c.keyId)&&Date.parse(c.notBefore)<=Date.now()&&Date.parse(c.expires)>Date.now(),"TRUST_WINDOW_REQUIRED");
 fs.mkdirSync(c.output,{mode:0o700});const jwks={keys:[{...key,kid:c.keyId,alg:"ES256",use:"sig",nbf:c.notBefore,exp:c.expires}]},jwksPath=path.join(c.output,"unpublished-jwks.json");fs.writeFileSync(jwksPath,JSON.stringify(jwks,null,2)+"\n",{flag:"wx",mode:0o600});
 const signing={provider:"aws-kms",executable:c.runtime.executable||"/usr/local/bin/aws",region:c.runtime.region,keyArn:c.keyArn,keyId:c.keyId,jwksPath};
 const sign=require("../signing").configured(signing,async(_,args)=>({stdout:JSON.stringify(await runtime.call(args[0],args[1],args.slice(2)))})),challenge=Buffer.from(JSON.stringify({purpose:"KMS_ACCEPTANCE_ONLY",nonce:crypto.randomUUID()}));
 await sign(challenge);const out={state:"KMS_ADAPTER_ACCEPTED",identity,keyArn:c.keyArn,keyId:c.keyId,jwksSha256:require("./backup").digestFile(jwksPath),challengeSha256:require("./backup").digest(challenge),at:new Date().toISOString(),published:false,productionReceiptAcceptance:"NOT_PROVEN"};fs.writeFileSync(path.join(c.output,"acceptance.json"),JSON.stringify(out,null,2)+"\n",{flag:"wx",mode:0o600});return out;
}
if(require.main===module)accept(JSON.parse(fs.readFileSync(process.argv[2]))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||"KMS_ACCEPTANCE_UNAVAILABLE");process.exitCode=2;});
module.exports={accept};
