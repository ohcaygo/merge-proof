"use strict";
const { createHash, randomUUID } = require("node:crypto");
const sha = (x) => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const repoName = (x) =>
  typeof x === "string" &&
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x) &&
  !x.split("/").some((p) => p === "." || p === "..");
function assert(ok, code = "INVALID_EVIDENCE") {
  if (!ok) throw Object.assign(new Error(code), { code });
}
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, canonical(x[k])]),
    );
  return x;
}
const hash = (x) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(x)))
    .digest("hex");
const available = (value) => ({ state: "AVAILABLE", value });
const unavailable = (reason) => ({ state: "UNAVAILABLE", reason });
const hasUnavailable = (value) =>
  value &&
  typeof value === "object" &&
  (value.state === "UNAVAILABLE" || Object.values(value).some(hasUnavailable));
module.exports = {
  sha,
  repoName,
  assert,
  hash,
  canonical,
  available,
  unavailable,
  hasUnavailable,
  randomUUID,
};
