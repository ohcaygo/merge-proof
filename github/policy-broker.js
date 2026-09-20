#!/usr/bin/env node
"use strict";
// Separate OS process: the only owner of the companion App key. Its IPC accepts
// structured observations, never an arbitrary HTTP method, URL or GitHub token.
const fs = require("node:fs"), http = require("node:http"), path = require("node:path");
const {assert, repoName, hash} = require("./common");
const reader = require("./policy-reader");
const positive = x => Number.isSafeInteger(x) && x > 0;
const fields = (value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(k => names.includes(k));
function scope(input) {
  assert(fields(input, ["repository", "repositoryId", "accountId", "primaryInstallationId", "companionInstallationId", "revision"]) &&
    repoName(input.repository) && [input.repositoryId, input.accountId, input.primaryInstallationId].every(positive), "INVALID_SCOPE");
}
function readGrants(file) {
  assert(fs.statSync(file).size <= 2 * 1024 * 1024, "GRANT_LIMIT");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function createBroker(config, {fetchImpl = fetch, grants = () => readGrants(config.grantsPath)} = {}) {
  assert(config.app && positive(config.app.appId) && config.app.privateKey && typeof config.webhookSecret === "string" && config.webhookSecret.length >= 32, "POLICY_BROKER_NOT_CONFIGURED");
  let active = 0;
  return http.createServer({requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192}, async (req, res) => {
    const send = (status, out) => {res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store"}); res.end(JSON.stringify(out));};
    try {
      assert(req.method === "POST" && ["/v1/discover", "/v1/observe", "/v1/webhook"].includes(req.url), "POLICY_BROKER_OPERATION_DENIED");
      assert(active < 8, "POLICY_BROKER_BUSY"); active++;
      try {
        let size = 0; const chunks = [];
        for await (const b of req) {size += b.length; assert(size <= 400000, "REQUEST_TOO_LARGE"); chunks.push(b);}
        const input = JSON.parse(Buffer.concat(chunks));
        if (req.url === "/v1/webhook") {
          assert(fields(input, ["raw", "signature", "event", "delivery"]) && typeof input.raw === "string" && /^[\w-]{1,100}$/.test(input.delivery), "INVALID_DELIVERY");
          const raw = Buffer.from(input.raw, "base64"); assert(raw.length <= 262144, "REQUEST_TOO_LARGE");
          require("./app").verifyWebhook(raw, input.signature, config.webhookSecret);
          const p = JSON.parse(raw);
          if (input.event === "ping") return send(200, {ignored: true});
          assert(["installation", "installation_repositories", "repository_ruleset"].includes(input.event), "POLICY_EVENT_UNSUPPORTED");
          assert(p.installation?.app_id === config.app.appId || p.installation?.app_id === undefined, "INVALID_WEBHOOK_SCOPE");
          assert(positive(p.installation?.id), "INVALID_WEBHOOK_SCOPE");
          return send(200, {delivery: input.delivery, event: input.event, action: p.action,
            installationId: p.installation.id, repositoryIds: (p.repositories_removed || []).map(r => r.id),
            repositoryId: p.repository?.id || null});
        }
        scope(input);
        if (req.url === "/v1/discover") {
          const result = await reader.discoverInstallation({app: config.app, repository: input.repository, accountId: input.accountId, fetchImpl});
          return send(200, result);
        }
        assert(positive(input.companionInstallationId) && typeof input.revision === "string", "INVALID_SCOPE");
        const authorize = async () => {
          const grant = grants()[`${input.primaryInstallationId}:${input.repositoryId}`];
          assert(grant?.revision === input.revision && grant.repository === input.repository.toLowerCase(), "ENHANCED_POLICY_NOT_AUTHORIZED");
          // UI observation timestamps are not changes to authorization.
          return Object.fromEntries(["repository", "repositoryId", "accountId", "primaryInstallationId", "companionInstallationId", "revision", "enabled", "authorizedAt", "authorizedByUserId"].map(k => [k, grant[k]]));
        };
        const before = hash(await authorize());
        const result = await reader.executionPolicyReader({app: config.app, scope: input, authorize, fetchImpl})({repository: input.repository, repositoryId: input.repositoryId});
        assert(before === hash(await authorize()), "ENHANCED_POLICY_CHANGED_DURING_READ");
        send(200, result);
      } finally {active--;}
    } catch (e) {send(403, {error: /^[A-Z][A-Z_]+$/.test(e.code || "") ? e.code : "POLICY_BROKER_UNAVAILABLE"});}
  });
}
function start(configFile) {
  const st = fs.lstatSync(configFile), cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert(typeof process.getuid === "function" && process.getuid() > 0 && st.isFile() && st.uid === process.getuid() && (st.mode & 0o077) === 0, "POLICY_CREDENTIAL_ISOLATION_REQUIRED");
  assert(positive(cfg.proofUid) && cfg.proofUid !== process.getuid() && path.isAbsolute(cfg.socketPath) && path.isAbsolute(cfg.grantsPath), "POLICY_CREDENTIAL_ISOLATION_REQUIRED");
  const key = fs.lstatSync(cfg.privateKeyPath);
  assert(key.isFile() && key.uid === process.getuid() && (key.mode & 0o077) === 0, "POLICY_CREDENTIAL_ISOLATION_REQUIRED");
  const grantsStat = fs.lstatSync(cfg.grantsPath);
  assert(grantsStat.isFile() && grantsStat.uid === cfg.proofUid && !(grantsStat.mode & 0o027), "POLICY_GRANT_PERMISSIONS_INVALID");
  const server = createBroker({...cfg, app: {appId: cfg.appId, privateKey: fs.readFileSync(cfg.privateKeyPath, "utf8")}});
  // RuntimeDirectory is owned by this service. Never unlink an arbitrary socket.
  assert(!fs.existsSync(cfg.socketPath), "POLICY_SOCKET_ALREADY_EXISTS");
  server.listen(cfg.socketPath, () => fs.chmodSync(cfg.socketPath, 0o660));
  return server;
}
if (require.main === module) {try {start(process.argv[2]);} catch(e) {console.error(e.code || "POLICY_BROKER_UNAVAILABLE"); process.exitCode = 1;}}
module.exports = {createBroker, start};
