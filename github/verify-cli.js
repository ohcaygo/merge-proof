"use strict";
const fs = require("node:fs"), path = require("node:path");
const { assert } = require("./common");
function validateRequest(input) {
  const {sha,repoName}=require("./common");
  assert(input && repoName(input.repository) && Number.isSafeInteger(input.repositoryId) && input.repositoryId>0 && Number.isSafeInteger(input.pr) && input.pr>0 && [input.expectedHeadSha,input.expectedBaseSha,input.expectedTargetSha].every(sha),"INVALID_ARGUMENT");
  return input;
}
function validateDecision(d, input) {
  const { sha } = require("./common");
  const valid = condition => assert(condition, "INVALID_DECISION_CONTRACT");
  validateRequest(input);
  valid(d && d.$schema === "urn:merge-proof:decision:1" && d.schemaVersion === 1);
  valid(["PROCEED", "HOLD", "REFUSE", "UNAVAILABLE"].includes(d.outcome) && typeof d.proceed === "boolean");
  valid(["VERIFIED", "NOT_PROVEN", "FAIL"].includes(d.verdict) && ["CURRENT", "STALE", "UNAVAILABLE"].includes(d.currentness));
  valid((d.outcome === "PROCEED") === d.proceed);
  valid(["VERIFIED","NOT_PROVEN","FAIL"].includes(d.historicalVerdict) && Number.isFinite(Date.parse(d.observedAt)));
  if(d.verdict === "FAIL") valid(d.outcome === "REFUSE" && d.currentness === "CURRENT");
  if(d.currentness !== "CURRENT") valid(d.verdict === "NOT_PROVEN" && !d.proceed);
  if(d.outcome === "UNAVAILABLE") valid(d.currentness === "UNAVAILABLE");
  valid(d.request && ["repository", "repositoryId", "pr", "expectedHeadSha", "expectedBaseSha", "expectedTargetSha"].every(k => d.request[k] === input[k]));
  valid(typeof d.request.matched === "boolean" && Array.isArray(d.request.mismatch));
  valid(d.subject && ["AVAILABLE", "UNAVAILABLE"].includes(d.subject.state));
  valid(d.receipt && typeof d.receipt.receiptId === "string" && /^[a-f0-9]{64}$/.test(d.receipt.digest) && typeof d.receipt.url === "string");
  valid(d.bindings && ["expected", "candidate", "tested", "authorized", "landed"].every(k => d.bindings[k] === null || d.bindings[k] === "UNAVAILABLE" || sha(d.bindings[k])));
  valid(Array.isArray(d.reasons) && d.reasons.every(r => typeof r.code === "string" && typeof r.blocking === "boolean") && Array.isArray(d.missingEvidence) && Array.isArray(d.exceptions));
  valid(d.nextAction && typeof d.nextAction.kind === "string" && typeof d.nextAction.text === "string");
  if (d.proceed) {
    const subject = d.subject.value;
    valid(d.verdict === "VERIFIED" && d.currentness === "CURRENT" && d.request.matched && !d.request.mismatch.length && !d.reasons.length && !d.missingEvidence.length && !d.exceptions.length);
    valid(d.subject.state === "AVAILABLE" && subject?.platform === "github" && subject.repositoryId === input.repositoryId && subject.commit === input.expectedTargetSha && subject.base === input.expectedBaseSha && sha(subject.tree));
    valid(d.bindings.candidate === subject.tree && d.bindings.tested === input.expectedTargetSha && d.bindings.authorized === input.expectedHeadSha);
    valid(d.nextAction.kind === "MERGE_WITH_SHA" && d.nextAction.mergeArguments?.sha === input.expectedHeadSha);
  }
  return d;
}
async function remote(input) {
  validateRequest(input);
  const origin = new URL(process.env.MP_ORIGIN || "https://merge-proof.ohcaygo.com");
  assert(origin.protocol === "https:" || origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname), "INVALID_ORIGIN");
  assert(process.env.MP_GITHUB_TOKEN, "GITHUB_TOKEN_REQUIRED");
  const response = await fetch(new URL("/proof/v1/decision", origin), { method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.MP_GITHUB_TOKEN}` }, body: JSON.stringify(input) });
  assert(response.ok, response.status === 401 || response.status === 403 ? "ACCESS_DENIED" : "DECISION_UNAVAILABLE");
  const value = await response.json();
  return validateDecision(value, input);
}
function lines(d) { return [d.outcome + " · " + d.verdict + " · " + d.currentness,
  ...["expected", "candidate", "tested", "authorized", "landed"].map(k => `${k.toUpperCase()}: ${d.bindings[k] ?? "NOT_YET_APPLICABLE"}`),
  ...(d.reasons.length ? [`Reason: ${d.reasons[0].code}`, `Next: ${d.nextAction.text}`] : []), `Receipt: ${d.receipt.url}`].join("\n"); }
async function main(args) {
  if (args.includes("--help")) { console.log("merge-proof verify --repo OWNER/REPO --repository-id ID --pr N --head SHA --base SHA --target SHA [--json] [--wait SECONDS]\nmerge-proof verify --bundle DIRECTORY [--trusted-keys JWKS.json] [--allow-unsigned] [--online] [--git-dir BARE_REPO] [--git-binary PATH]\nmerge-proof mcp\nUses MP_GITHUB_TOKEN and optional MP_ORIGIN; never merges."); return 0; }
  const opts = {};
  for (let n = 0; n < args.length; n++) {
    const flag = args[n];
    assert(["--bundle", "--git-dir", "--git-binary", "--trusted-keys", "--allow-unsigned", "--repo", "--repository-id", "--pr", "--head", "--base", "--target", "--json", "--online", "--wait"].includes(flag), "INVALID_ARGUMENT");
    opts[flag] = ["--json", "--allow-unsigned", "--online"].includes(flag) ? true : args[++n];
  }
  if (opts["--bundle"]) {
    const bundle = require("./bundle").read(opts["--bundle"]);
    const trustedKeys = opts["--trusted-keys"] ? JSON.parse(fs.readFileSync(opts["--trusted-keys"], "utf8")).keys : [];
    const result = require("./bundle").verify(bundle, { trustedKeys, allowUnsigned: opts["--allow-unsigned"] === true });
    const checks = { offline: result };
    if (opts["--git-dir"] && result.exitCode === 0) {
      checks.independent = require("./reverify").independent(bundle, opts["--git-dir"], opts["--git-binary"] || "/usr/bin/git");
    }
    if (opts["--online"] && result.exitCode === 0) {
      const online = await require("./reverify").online(bundle, new (require("./client").Client)({ token: process.env.MP_GITHUB_TOKEN }));
      checks.online = online;
      console.log(JSON.stringify(checks, null, 2)); return checks.independent?.exitCode || online.exitCode;
    }
    console.log(JSON.stringify(checks.independent ? checks : result, null, 2)); return checks.independent?.exitCode || result.exitCode;
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
        outputSchema: require("./decision.schema.json"),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true } }] };
      else if (r.method === "tools/call" && r.params?.name === "merge_proof_decision") {
        const decision = await remote(r.params.arguments); result = { content: [{ type: "text", text: JSON.stringify(decision) }], structuredContent: decision };
      } else throw Object.assign(Error(), { code: "METHOD_NOT_FOUND" });
      output.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result }) + "\n");
    } catch (e) { output.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message: e.code || "DECISION_UNAVAILABLE" } }) + "\n"); }
  }
}
module.exports = { main, mcp, remote, lines, validateDecision, validateRequest };
