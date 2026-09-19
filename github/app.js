"use strict";
const { createSign, createHmac, timingSafeEqual } = require("node:crypto");
const { Client } = require("./client");
const { assert } = require("./common");
// Tokens are scoped to one repository. Only optional receipt checks need write permission.
async function installationClient(
  config,
  installationId,
  repositoryId,
  fetchImpl,
) {
  assert(
    Number.isSafeInteger(installationId) &&
      installationId > 0 &&
      Number.isSafeInteger(repositoryId) &&
      repositoryId > 0,
  );
  const client = appClient(config, fetchImpl);
  const value = await client.request(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      body: {
        repository_ids: [repositoryId],
        permissions: {
          contents: "read",
          pull_requests: "read",
          checks: config.publishChecks ? "write" : "read",
          statuses: "read",
          actions: "read",
          administration: "read",
        },
      },
    },
  );
  assert(
    typeof value.token === "string" &&
      Date.parse(value.expires_at) > Date.now(),
    "INSTALLATION_TOKEN_UNAVAILABLE",
  );
  return new Client({ token: value.token, fetchImpl });
}
function appClient(config, fetchImpl) {
  assert(config.appId && config.privateKey, "APP_NOT_CONFIGURED");
  const now = Math.floor(Date.now() / 1000);
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: String(config.appId) })}`;
  const signature = createSign("RSA-SHA256")
    .update(payload)
    .sign(config.privateKey, "base64url");
  return new Client({ token: `${payload}.${signature}`, fetchImpl });
}
function verifyWebhook(raw, signature, secret) {
  assert(
    typeof secret === "string" && secret.length >= 32,
    "WEBHOOK_NOT_CONFIGURED",
  );
  assert(
    typeof signature === "string" && /^sha256=[a-f0-9]{64}$/.test(signature),
    "WEBHOOK_DENIED",
  );
  const actual = Buffer.from(signature.slice(7), "hex"),
    expected = createHmac("sha256", secret).update(raw).digest();
  assert(timingSafeEqual(actual, expected), "WEBHOOK_DENIED");
}
module.exports = { installationClient, verifyWebhook, appClient };
