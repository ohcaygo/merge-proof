"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{atomic,secureDirectory}=require("../operations/refresh-credentials");
test("credential refresh replaces entries without following destination or predictable staging symlinks",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-credentials-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,"private"),victim=path.join(root,"unrelated"),file=path.join(dir,"config.json");secureDirectory(dir,process.getgid(),0o710);fs.writeFileSync(victim,"unchanged");fs.symlinkSync(victim,file+".tmp");fs.symlinkSync(victim,file);
 atomic(file,"new private config",process.getuid(),process.getgid());a.equal(fs.readFileSync(victim,"utf8"),"unchanged");a.equal(fs.lstatSync(file).isFile(),true);a.equal(fs.readFileSync(file,"utf8"),"new private config");a.equal(fs.statSync(file).mode&0o777,0o600);
 fs.chmodSync(dir,0o730);a.throws(()=>atomic(file,"unsafe",process.getuid(),process.getgid()),{code:"CREDENTIAL_DIRECTORY_UNSAFE"});a.throws(()=>secureDirectory(dir,process.getgid(),0o710),{code:"CREDENTIAL_DIRECTORY_UNSAFE"});
 const alias=path.join(root,"alias");fs.symlinkSync(dir,alias);a.throws(()=>secureDirectory(alias,process.getgid(),0o710),{code:"CREDENTIAL_DIRECTORY_UNSAFE"});a.equal(fs.readFileSync(file,"utf8"),"new private config");
});
