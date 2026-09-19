"use strict";
const fs = require("node:fs"), path = require("node:path");
const { assert } = require("./common");
async function remote(input) {
  const origin = new URL(process.env.MP_ORIGIN || "https://merge-proof.ohcaygo.com");
  assert(origin.protocol === "https:" || origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname), "INVALID_ORIGIN");
  assert(process.env.MP_GITHUB_TOKEN, "GITHUB_TOKEN_REQUIRED");
  const response = await fetch(new URL("/proof/v1/decision", origin), { method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.MP_GITHUB_TOKEN}` }, body: JSON.stringify(input) });
  assert(response.ok, response.status === 401 || response.status === 403 ? "ACCESS_DENIED" : "DECISION_UNAVAILABLE");
  const value = await response.json();
  assert(value.$schema === "urn:merge-proof:decision:1", "UNSUPPORTED_CONTRACT");
  return value;
}
function lines(d) { return [d.outcome + " · " + d.verdict + " · " + d.currentness,
  ...["expected", "candidate", "tested", "authorized", "landed"].map(k => `${k.toUpperCase()}: ${d.bindings[k] ?? "NOT_YET_APPLICABLE"}`),
  ...d.reasons.map(r => r.code), `Receipt: ${d.receipt.url}`].join("\n"); }
async function main(args) {
  if (args.includes("--help")) { console.log("merge-proof verify --repo OWNER/REPO --repository-id ID --pr N --head SHA --base SHA --target SHA [--json] [--wait SECONDS]\nmerge-proof verify --bundle DIRECTORY [--trusted-keys JWKS.json] [--allow-unsigned] [--online]\nmerge-proof mcp\nUses MP_GITHUB_TOKEN and optional MP_ORIGIN; never merges."); return 0; }
  const opts = {};
  for (let n = 0; n < args.length; n++) {
    const flag = args[n];
    assert(["--bundle", "--trusted-keys", "--allow-unsigned", "--repo", "--repository-id", "--pr", "--head", "--base", "--target", "--json", "--online", "--wait"].includes(flag), "INVALID_ARGUMENT");
    opts[flag] = ["--json", "--allow-unsigned", "--online"].includes(flag) ? true : args[++n];
  }
  if (opts["--bundle"]) {
    const bundle = JSON.parse(fs.readFileSync(path.join(opts["--bundle"], "bundle.json"), "utf8"));
    const trustedKeys = opts["--trusted-keys"] ? JSON.parse(fs.readFileSync(opts["--trusted-keys"], "utf8")).keys : [];
    const result = require("./bundle").verify(bundle, { trustedKeys, allowUnsigned: opts["--allow-unsigned"] === true });
    if (opts["--online"] && result.exitCode === 0) {
      const online = await require("./reverify").online(bundle, new (require("./client").Client)({ token: process.env.MP_GITHUB_TOKEN }));
      console.log(JSON.stringify({ offline: result, online }, null, 2)); return online.exitCode;
    }
    console.log(JSON.stringify(result, null, 2)); return result.exitCode;
  }
  const request = { repository: opts["--repo"], repositoryId: Number(opts["--repository-id"]), pr: Number(opts["--pr"]),
    expectedHeadSha: opts["--head"], expectedBaseSha: opts["--base"], expectedTargetSha: opts["--target"] };
  const seconds = opts["--wait"] == null ? 0 : Number(opts["--wait"]);
  assert(Number.isFinite(seconds) && seconds >= 0 && seconds <= 3600, "INVALID_ARGUMENT");
  const deadline = Date.now() + seconds * 1000; let delay = 5000, d;
  do {
    d = await remote(request);
    if (d.outcome !== "HOLD" || !seconds || Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(delay, deadline - Date.now()))); delay = Math.min(60000, delay * 2);
  } while (Date.now() < deadline);
  console.log(opts["--json"] ? JSON.stringify(d) : lines(d));
  if (seconds && d.outcome === "HOLD" && Date.now() >= deadline) return 8;
  return d.proceed ? 0 : d.outcome === "REFUSE" ? 3 : d.outcome === "UNAVAILABLE" ? 9 : 2;
}
const INPUT = { type: "object", additionalProperties: false, required: ["repository", "repositoryId", "pr", "expectedHeadSha", "expectedBaseSha", "expectedTargetSha"],
  properties: { repository: { type: "string" }, repositoryId: { type: "integer", minimum: 1 }, pr: { type: "integer", minimum: 1 },
    ...Object.fromEntries(["expectedHeadSha", "expectedBaseSha", "expectedTargetSha"].map(k => [k, { type: "string", pattern: "^[a-f0-9]{40}$" }])) } };
async function mcp(input = process.stdin, output = process.stdout) {
  async function* lines() {
    let buffered = Buffer.alloc(0);
    for await (const part of input) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      let offset = 0, end;
      while ((end = chunk.indexOf(10, offset)) >= 0) {
        assert(buffered.length + end - offset <= 65536, "MCP_MESSAGE_LIMIT");
        yield Buffer.concat([buffered, chunk.subarray(offset, end)]).toString("utf8");
        buffered = Buffer.alloc(0); offset = end + 1;
      }
      assert(buffered.length + chunk.length - offset <= 65536, "MCP_MESSAGE_LIMIT");
      buffered = Buffer.concat([buffered, chunk.subarray(offset)]);
    }
    if (buffered.length) yield buffered.toString("utf8");
  }
  for await (const line of lines()) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.id == null) continue;
    try {
      let result;
      if (r.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "merge-proof", version: "1" } };
      else if (r.method === "tools/list") result = { tools: [{ name: "merge_proof_decision", description: "Read current evidence bound to caller SHAs. Never merges.", inputSchema: INPUT,
        outputSchema: { type: "object", required: ["outcome", "proceed", "verdict", "subject"], properties: { outcome: { enum: ["PROCEED", "HOLD", "REFUSE", "UNAVAILABLE"] }, proceed: { type: "boolean" }, verdict: { enum: ["VERIFIED", "NOT_PROVEN", "FAIL"] }, subject: { type: "object" } } },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true } }] };
      else if (r.method === "tools/call" && r.params?.name === "merge_proof_decision") {
        const decision = await remote(r.params.arguments); result = { content: [{ type: "text", text: JSON.stringify(decision) }], structuredContent: decision };
      } else throw Object.assign(Error(), { code: "METHOD_NOT_FOUND" });
      output.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result }) + "\n");
    } catch (e) { output.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message: e.code || "DECISION_UNAVAILABLE" } }) + "\n"); }
  }
}
module.exports = { main, mcp, remote, lines };
