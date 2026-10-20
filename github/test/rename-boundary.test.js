"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const { Client } = require("../client");
const { collect } = require("../collect");
const { prove } = require("../proof");
const policy = require("../policy");
const { fixtureFetch, H } = require("./fixtures");

async function renamed(previous_filename, filename, extra = {}) {
  return collect(new Client(fixtureFetch({
    mutate: (p, v) => p.includes("/compare/") && p.endsWith(`...${H}`)
      ? { ...v, files: [{ filename, previous_filename, status: "renamed", ...extra }] }
      : v,
  })), "fixture/public", 1);
}
const strictGate = (receipt) => policy.evaluate(receipt, { state: "CURRENT" }, {
  preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
});

for (const [name, origin, destination, extra, protectedPaths] of [
  ["rename in", "src/handler.js", "auth/handler.js", {}, ["auth/handler.js"]],
  ["rename plus edit", "auth/handler.js", "src/handler.js", { changes: 9, additions: 5, deletions: 4, patch: "NEVER STORE PATCH" }, ["auth/handler.js"]],
  ["protected origin to excluded destination", "auth/handler.js", "vendor/handler.js", {}, ["auth/handler.js"]],
  ["excluded origin to protected destination", "vendor/handler.js", "auth/handler.js", {}, ["auth/handler.js"]],
  ["excluded protected origin to normal destination", "vendor/auth/handler.js", "src/handler.js", {}, []],
  ["normal origin to excluded protected destination", "src/handler.js", "vendor/auth/handler.js", {}, []],
  ["both endpoints excluded", "vendor/auth/handler.js", "build/auth/handler.js", {}, []],
  ["ordinary rename", "src/old.js", "src/new.js", {}, []],
]) test(`${name} classifies each non-excluded endpoint independently`, async () => {
  const c = await renamed(origin, destination, extra);
  const receipt = prove(c), gate = strictGate(receipt);
  a.deepEqual(c.git.value.candidateFiles, [origin, destination].sort());
  const boundary = receipt.local.findings.find(f => f.id === "PROTECTED_BOUNDARY");
  a.deepEqual(boundary?.evidence.categories.auth || [], protectedPaths);
  a.equal(gate.conclusion, protectedPaths.length ? "failure" : "success");
  a.equal(gate.blocking.includes("PROTECTED_BOUNDARY_APPROVAL_REQUIRED"), !!protectedPaths.length);
  a.equal(receipt.verdict, protectedPaths.length ? "NOT_PROVEN" : "VERIFIED");
  a.doesNotMatch(JSON.stringify(c), /NEVER STORE/);
  const excluded = [origin, destination].filter(p => /^(vendor|build)\//.test(p)).sort();
  a.deepEqual(receipt.local.excluded.map(x => x.file).sort(), excluded);
});

test("rename between protected categories reports both endpoints", async () => {
  const c = await renamed("auth/handler.js", "billing/handler.js");
  const receipt = prove(c);
  const boundary = receipt.local.findings.find(f => f.id === "PROTECTED_BOUNDARY");
  a.deepEqual(boundary.evidence.categories, {
    auth: ["auth/handler.js"], billing: ["billing/handler.js"],
  });
  a.equal(strictGate(receipt).conclusion, "failure");
});

test("advisory CI rename origin does not become a blocking boundary", async () => {
  const receipt = prove(await renamed(".github/workflows/old.yml", "src/old.yml"));
  a.equal(receipt.verdict, "VERIFIED");
  a.equal(strictGate(receipt).conclusion, "success");
  a.deepEqual(receipt.local.advisories.find(f => f.id === "PROTECTED_BOUNDARY_ADVISORY")
    .evidence.files, [".github/workflows/old.yml"]);
});

test("second current approval satisfies rename boundary policy without changing verdict", async () => {
  const c = await renamed("auth/handler.js", "src/handler.js");
  a.equal(strictGate(prove(c)).conclusion, "failure");
  c.reviews.value.push({ ...c.reviews.value[0], id: 61, userId: 3, login: "second" });
  const receipt = prove(c), gate = strictGate(receipt);
  a.equal(gate.conclusion, "success");
  a.equal(gate.boundaryEscalation.observed, 2);
  a.ok(gate.reported.includes("PROTECTED_BOUNDARY"));
  a.equal(receipt.verdict, "NOT_PROVEN");
});

test("rename metadata with a missing or malformed origin fails closed", async () => {
  for (const origin of [undefined, null, "", 7, {}]) {
    const c = await renamed(origin, "src/handler.js");
    a.equal(c.git.state, "UNAVAILABLE", `origin ${JSON.stringify(origin)}`);
    a.equal(prove(c).verdict, "NOT_PROVEN");
    a.equal(strictGate(prove(c)).conclusion, "failure");
  }
});

test("rename out of auth still requires extra boundary approval", async () => {
  const c = await renamed("auth/handler.js", "src/handler.js");
  const receipt = prove(c);
  const gate = strictGate(receipt);
  a.equal(gate.conclusion, "failure");
  a.ok(gate.blocking.includes("PROTECTED_BOUNDARY_APPROVAL_REQUIRED"));
  a.deepEqual(c.git.value.candidateFiles, ["auth/handler.js", "src/handler.js"]);
  a.deepEqual(receipt.local.findings.find(f => f.id === "PROTECTED_BOUNDARY")
    .evidence.categories.auth, ["auth/handler.js"]);
  a.equal(receipt.verdict, "NOT_PROVEN");
});
