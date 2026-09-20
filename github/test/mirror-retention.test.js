"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{execFileSync}=require("node:child_process");
test("actual Git garbage collection retains old exact candidates after later fetches replace FETCH_HEAD",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mp-retained-git-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=path.join(root,"provider"),mirror=path.join(root,"mirror"),env={...process.env,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_AUTHOR_NAME:"Fixture",GIT_AUTHOR_EMAIL:"fixture@invalid",GIT_COMMITTER_NAME:"Fixture",GIT_COMMITTER_EMAIL:"fixture@invalid"};
 const git=(dir,args)=>execFileSync("/usr/bin/git",["-C",dir,...args],{env,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 fs.mkdirSync(repo);fs.mkdirSync(mirror);git(repo,["init","-b","main"]);git(repo,["commit","--allow-empty","-m","base"]);const base=git(repo,["rev-parse","HEAD"]);
 git(repo,["checkout","--orphan","queue"]);git(repo,["commit","--allow-empty","-m","old synthetic provider candidate"]);const candidate=git(repo,["rev-parse","HEAD"]);
 git(mirror,["init","--bare"]);git(mirror,["remote","add","origin",repo]);const retain=require("../mirror").fetchAndRetain;
 a.deepEqual(retain(args=>git(mirror,args),{base,head:base,candidate}),[base,candidate]);
 git(repo,["checkout","main"]);git(repo,["commit","--allow-empty","-m","later candidate"]);const later=git(repo,["rev-parse","HEAD"]);retain(args=>git(mirror,args),{base,head:later,candidate:later});
 git(repo,["branch","-D","queue"]);git(repo,["reflog","expire","--expire=now","--all"]);git(repo,["gc","--prune=now"]);
 git(mirror,["reflog","expire","--expire=now","--all"]);git(mirror,["gc","--prune=now"]);
 a.equal(git(mirror,["cat-file","-t",candidate]),"commit");a.equal(git(mirror,["rev-parse",`refs/merge-proof/retained/${candidate}`]),candidate);
 a.throws(()=>retain(()=>a.fail("invalid input reached Git"),{base:"--upload-pack=unexpected"}),{code:"EXACT_INPUT_COMMITS_REQUIRED"});
});
