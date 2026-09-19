"use strict";
const { assert, available, unavailable, repoName } = require("./common");
class Client {
  constructor({
    token = null,
    fetchImpl = fetch,
    maxRequests = 240,
    maxDurationMs = 120000,
    cache = new Map(),
  } = {}) {
    this.token = token;
    this.cache = cache;
    this.links = new Map();
    this.fetch = fetchImpl;
    this.remaining = maxRequests;
    this.deadline = Date.now() + maxDurationMs;
  }
  async request(endpoint, { method = "GET", body } = {}) {
    assert(
      /^\/(repos\/[\w.-]+\/[\w.-]+(?:[/?]|$)|(?:orgs|enterprises)\/[\w.-]+\/actions\/policies\/\d+$|app\/installations\/\d+\/access_tokens$|app\/hook\/deliveries(?:[/?]|$)|graphql$)/.test(
        endpoint,
      ),
      "INVALID_ENDPOINT",
    );
    assert(--this.remaining >= 0, "API_BUDGET_EXHAUSTED");
    assert(Date.now() < this.deadline, "COLLECTION_TIME_LIMIT");
    const cached = method === "GET" ? this.cache.get(endpoint) : null;
    const response = await this.fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "Merge-Proof-Exact-State",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 304) {
      assert(cached, "UNBOUND_CONDITIONAL_RESPONSE");
      this.remaining++;
      return structuredClone(cached.body);
    }
    if (!response.ok)
      throw Object.assign(new Error("GITHUB_UNAVAILABLE"), {
        code: "GITHUB_UNAVAILABLE",
        status: response.status,
      });
    // Bound bytes while streaming, not after an unbounded allocation.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body || []) {
      size += chunk.length;
      assert(size <= 4 * 1024 * 1024, "RESPONSE_LIMIT");
      chunks.push(chunk);
    }
    this.links.set(endpoint, response.headers.get("link") || "");
    const bytes = Buffer.concat(chunks).toString("utf8");
    // Delivery IDs are opaque 64-bit identifiers. JSON.parse would round
    // them before the reconciler can address the original delivery. Preserve
    // unsafe integer tokens only on this API; quoted JSON strings are intact.
    const json = /^\/app\/hook\/deliveries(?:[/?]|$)/.test(endpoint)
      ? bytes.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
        token => /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token)
      : bytes;
    const value = json.length ? JSON.parse(json) : null;
    if (method === "GET" && response.headers.get("etag")) {
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(endpoint, { etag: response.headers.get("etag"), body: structuredClone(value) });
    }
    return value;
  }
  get(endpoint) {
    return this.request(endpoint);
  }
  async list(endpoint, key) {
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const data = await this.get(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      const rows = key ? data[key] : data;
      assert(Array.isArray(rows));
      all.push(...rows);
      if (rows.length < 100) {
        if (key && Number.isInteger(data.total_count))
          assert(all.length >= data.total_count, "TRUNCATED_EVIDENCE");
        return all;
      }
    }
    throw Object.assign(new Error("PAGINATION_LIMIT"), {
      code: "PAGINATION_LIMIT",
    });
  }
  async observe(fn) {
    try {
      return available(await fn());
    } catch (e) {
      return unavailable(
        e.status ? `GITHUB_HTTP_${e.status}` : e.code || "SOURCE_ERROR",
      );
    }
  }
  async authorize(repo, expectedId) {
    assert(repoName(repo));
    const r = await this.get(`/repos/${repo}`);
    assert(
      r.id === expectedId && r.full_name.toLowerCase() === repo.toLowerCase(),
      "ACCESS_DENIED",
    );
    return r;
  }
}
module.exports = { Client };
