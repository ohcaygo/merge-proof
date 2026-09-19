"use strict";
// Release-time tool, never invoked by the service or verifier. Existing policy
// archives must not be replaced after publication; mint a new archive instead.
const fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, "../.."), destination = path.join(__dirname, "v2");
fs.mkdirSync(destination, { recursive: true });
const version = require("../../package.json").version;
for (const name of ["proof", "rules", "subject", "bindings", "claims", "common", "authority", "actors", "setup", "local-evidence", "wording"]) {
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
fs.writeFileSync(path.join(__dirname,"compatibility.json"), JSON.stringify({
  [require("../bundle").codeDigest()]: { engine: "v2", policies: ["github-exact-state-v2", "github-exact-state-v3"], version },
},null,2)+"\n");
