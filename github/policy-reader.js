"use strict";
// Optional companion credential boundary. This module never configures GitHub.
// The caller supplies server-verified consent/primary installation access; it is
// not a public enrollment API. No token or general GitHub client leaves closure.
const { assert, repoName, unavailable } = require("./common");
const { Client } = require("./client");
const positive = n => Number.isSafeInteger(n) && n > 0;
function permissions(p) {
  return p?.administration === "write" && p?.metadata === "read" &&
    Object.keys(p).every(k => k === "administration" || k === "metadata");
}
function policyPath(endpoint, repository) {
  assert(typeof endpoint === "string", "POLICY_READ_ONLY");
  const root = `/repos/${repository}/actions/policies`;
  const [pathname, query, extra] = endpoint.split("?");
  assert(extra === undefined && (pathname === root ||
    pathname.startsWith(root + "/") && /^[1-9][0-9]*$/.test(pathname.slice(root.length + 1))), "POLICY_READ_ONLY");
  assert(!query || pathname === root, "POLICY_READ_ONLY");
  const params = new URLSearchParams(query);
  const seen = new Set();
  for (const [key, value] of params) {
    assert(!seen.has(key) && (key === "has_parents" && value === "true" ||
      key === "per_page" && value === "100" || key === "page" && /^[1-5]$/.test(value)), "POLICY_READ_ONLY");
    seen.add(key);
  }
  // Preserve the exact validated spelling; encoded path traversal, fragments,
  // absolute URLs and aliases never reach fetch.
  assert(!/[#%\\\s]/.test(endpoint), "POLICY_READ_ONLY");
}
async function withPolicyReader({ app, scope, authorize, fetchImpl = fetch }, operation) {
  assert(app && positive(app.appId) && typeof app.privateKey === "string" &&
    typeof authorize === "function" && typeof operation === "function", "ENHANCED_POLICY_NOT_CONFIGURED");
  scope = structuredClone(scope);
  assert(scope && repoName(scope.repository) &&
    [scope.accountId, scope.repositoryId, scope.primaryInstallationId, scope.companionInstallationId].every(positive), "INVALID_SCOPE");
  scope.repository = scope.repository.toLowerCase();
  Object.freeze(scope);
  // This callback must use the existing authenticated customer/repository
  // authorization. A browser-provided boolean is never sufficient.
  async function consent() {
    const grant = await authorize(scope);
    assert(grant?.enabled === true && positive(grant.authorizedByUserId) &&
      Number.isFinite(Date.parse(grant.authorizedAt)) && Date.parse(grant.authorizedAt) <= Date.now() &&
      ["accountId", "repositoryId", "primaryInstallationId", "companionInstallationId"].every(k => grant[k] === scope[k]), "ENHANCED_POLICY_NOT_AUTHORIZED");
  }
  await consent();
  const jwt = require("./app").appClient(app).token;
  let token = null, expires = 0, closed = false;
  const endpoint = `/app/installations/${scope.companionInstallationId}`;
  async function auth(path, method, bearer, body) {
    // These three literal authentication operations are the entire issuer
    // capability. They cannot be used for repository administration.
    assert(path === endpoint && method === "GET" ||
      path === endpoint + "/access_tokens" && method === "POST" ||
      path === "/installation/token" && method === "DELETE", "POLICY_AUTH_PATH_INVALID");
    const r = await fetchImpl(`https://api.github.com${path}`, {
      method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${bearer}`,
        "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15000),
    });
    assert(r.ok && !r.redirected, "ENHANCED_POLICY_AUTH_UNAVAILABLE");
    if (r.status === 204) return null;
    let size = 0; const chunks = [];
    for await (const chunk of r.body || []) { size += chunk.length; assert(size <= 4 * 1024 * 1024, "RESPONSE_LIMIT"); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const installation = await auth(endpoint, "GET", jwt);
  assert(installation.id === scope.companionInstallationId && installation.app_id === app.appId &&
    installation.account?.id === scope.accountId && installation.suspended_at === null &&
    installation.repository_selection === "selected" && permissions(installation.permissions), "COMPANION_INSTALLATION_NOT_BOUND");
  try {
    const issued = await auth(endpoint + "/access_tokens", "POST", jwt, {
      repository_ids: [scope.repositoryId], permissions: { administration: "write", metadata: "read" },
    });
    token = typeof issued.token === "string" && issued.token ? issued.token : null;
    expires = Date.parse(issued.expires_at);
    assert(token && expires > Date.now() && permissions(issued.permissions) &&
      issued.repositories?.length === 1 && issued.repositories[0].id === scope.repositoryId &&
      issued.repositories[0].full_name?.toLowerCase() === scope.repository, "COMPANION_TOKEN_NOT_BOUND");
    const client = new Client({token, fetchImpl: async (url, init) => {
      assert(!closed && Date.now() < expires, "POLICY_READER_CLOSED");
      assert(typeof url === "string" && url.startsWith("https://api.github.com/"), "POLICY_READ_ONLY");
      policyPath(url.slice("https://api.github.com".length), scope.repository);
      assert(init.method === "GET" && init.body === undefined && init.redirect === "error", "POLICY_READ_ONLY");
      await consent();
      const response = await fetchImpl(url, init);
      assert(!response.redirected, "POLICY_READ_ONLY");
      return response;
    }});
    const request = async (path, options = {}) => {
      assert(!closed && Date.now() < expires, "POLICY_READER_CLOSED");
      assert(options && Object.keys(options).every(k => k === "method") &&
        (options.method === undefined || options.method === "GET"), "POLICY_READ_ONLY");
      policyPath(path, scope.repository);
      return client.get(path);
    };
    // Reuse bounded collection and fail-closed observations without exposing
    // Client.token, fetch, cache, mutable prototypes or mutation methods.
    const reader = Object.freeze({ request, get: request,
      list: (path, key) => Client.prototype.list.call({get: request}, path, key),
      observe: fn => Client.prototype.observe.call({}, fn) });
    return await operation(reader);
  } finally {
    closed = true;
    if (token) {
      const revoke = token; token = null;
      await auth("/installation/token", "DELETE", revoke);
    }
  }
}
function executionPolicyReader(options) {
  return async ({repository, repositoryId}) => {
    if (repository.toLowerCase() !== options.scope.repository.toLowerCase() || repositoryId !== options.scope.repositoryId)
      return unavailable("ENHANCED_POLICY_SCOPE_MISMATCH");
    try {
      return await withPolicyReader(options, reader => require("./rules").executionProtections(reader, repository.toLowerCase()));
    } catch (e) {
      return unavailable(e.code || "ENHANCED_POLICY_UNAVAILABLE");
    }
  };
}
// Installation redirects are untrusted. Discover the companion server-side for
// the already authorized repository; the subsequent token read binds its ID.
async function discoverInstallation({app, repository, accountId, fetchImpl = fetch}) {
  assert(repoName(repository) && positive(accountId), "INVALID_SCOPE");
  const jwt = require("./app").appClient(app).token;
  const response = await fetchImpl(`https://api.github.com/repos/${repository.toLowerCase()}/installation`, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: {Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"},
  });
  assert(response.ok && !response.redirected, "COMPANION_INSTALLATION_UNAVAILABLE");
  let size = 0; const chunks = [];
  for await (const chunk of response.body || []) { size += chunk.length; assert(size <= 1024 * 1024, "RESPONSE_LIMIT"); chunks.push(chunk); }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert(positive(value.id) && value.app_id === app.appId && value.account?.id === accountId &&
    value.suspended_at === null && value.repository_selection === "selected" && permissions(value.permissions), "COMPANION_INSTALLATION_NOT_BOUND");
  return {installationId: value.id, appId: value.app_id, accountId};
}
module.exports = { withPolicyReader, executionPolicyReader, discoverInstallation };
