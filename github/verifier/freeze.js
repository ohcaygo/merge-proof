"use strict";
// Release-time tool, never invoked by the service or verifier. Existing policy
// archives must not be replaced after publication; mint a new archive instead.
const fs = require("node:fs"), path = require("node:path");
const archive=process.argv[2];
if(!/^v[0-9]+$/.test(archive||""))throw Error("Usage: node github/verifier/freeze.js NEW_ARCHIVE (for example v3)");
const root=path.join(__dirname,"../.."),destination=path.join(__dirname,archive);
if(fs.existsSync(destination))throw Error("Existing verifier archives are immutable; choose a new archive name.");
const table=JSON.parse(fs.readFileSync(path.join(__dirname,"compatibility.json"),"utf8"));
const digest=require("../bundle").codeDigest();
if(table[digest])throw Error("Existing engine digest already has an immutable archive");
fs.mkdirSync(destination);
const version = require("../../package.json").version;
for (const name of ["proof", "queue-order", "rules", "subject", "bindings", "claims", "common", "authority", "actors", "setup", "local-evidence", "wording"]) {
  let body = fs.readFileSync(path.join(root, "github", name + ".js"), "utf8")
    .replaceAll('require("../package.json").version', JSON.stringify(version))
    .replaceAll('require("./check")', 'require("./check-name")')
    .replaceAll('require("../src/analyze")', 'require("./src-analyze")');
  fs.writeFileSync(path.join(destination, name + ".js"), body);
}
fs.writeFileSync(path.join(destination,"check-name.js"), `"use strict"; module.exports = { NAME: ${JSON.stringify(require("../check").NAME)} };\n`);
for (const name of ["analyze", "rules"]) {
  const body = fs.readFileSync(path.join(root,"src",name+".js"),"utf8")
    .replace("const localGit = require('./git');", "const localGit = null;")
    .replace("const rules = require('./rules');", "const rules = require('./src-rules');");
  fs.writeFileSync(path.join(destination,"src-"+name+".js"),body);
}
table[digest]={engine:archive,policies:["github-exact-state-v2","github-exact-state-v3"],version};
fs.writeFileSync(path.join(__dirname,"compatibility.json"),JSON.stringify(table,null,2)+"\n");
