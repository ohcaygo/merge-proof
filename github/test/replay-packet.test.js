"use strict";
const { test } = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { capture, H, B, M } = require("./fixtures");
const { prove } = require("../proof"), bundle = require("../bundle"), landing = require("../landing");
const packet = require("../replay-packet"), { hash } = require("../common");

function observation(record, landed) {
  const binding = { ...landing.compare(record, landed), commitResolution: { state: "AVAILABLE", value: landed.sha }, recordedAt: "2026-09-26T12:00:01.000Z" };
  return { ...binding, observationId: "a".repeat(64), attestation: {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: record.repository, digest: { gitCommit: landed.sha } }],
    predicateType: "https://merge-proof.ohcaygo.com/attestation/landed-binding/v1",
    predicate: { receiptDigest: hash(record.proof.receiptSnapshot), repositoryId: record.repositoryId, binding },
  } };
}

async function fixture(kind = "VERIFIED") {
  const evidence = capture();
  evidence.git.value.headTree = evidence.target.value.tree;
  evidence.git.value.baseTree = "f".repeat(40);
  const receipt = prove(evidence), receiptRow = { receipt, current: { state: "CURRENT", asOf: receipt.issuedAt } };
  let record = null, observed = null;
  if (kind !== "NOT_PROVEN") {
    record = {
      recordId: "00000000-0000-4000-8000-000000000001", repository: receipt.identity.repository,
      repositoryId: receipt.identity.repositoryId, pr: receipt.identity.pr, mergedAt: "2026-09-26T12:00:00.000Z",
      mergedHeadSha: receipt.identity.headSha, mergeCommitSha: M,
      proof: { receiptSnapshot: structuredClone(receipt), currentnessAtDelivery: { state: "CURRENT", asOf: receipt.issuedAt } },
    };
    observed = observation(record, { sha: M, tree: kind === "FAIL" ? B : receipt.summary.target.value.tree, parents: [B] });
  }
  const base = await bundle.create(receipt);
  const evidenceBundle = observed ? bundle.attachLandings(base, [{ record, observation: observed }]) : base;
  receiptRow.artifacts = base;
  return packet.create({ receiptRow, record, landing: observed, reconciliation: { state: "RECONCILED", asOf: "2026-09-26T13:00:00.000Z" }, evidenceBundle });
}

function rehash(value) {
  const { integrity: ignored, ...body } = value;
  value.integrity = { algorithm: "sha256", payloadDigest: hash(body) };
  return value;
}

test("unsigned replay packet deterministically reproduces VERIFIED, FAIL and NOT_PROVEN", async () => {
  for (const verdict of ["VERIFIED", "FAIL", "NOT_PROVEN"]) {
    const value = await fixture(verdict), result = packet.replay(value);
    a.equal(result.state, "REPLAY_CONSISTENT", JSON.stringify(result));
    a.equal(result.verdict, verdict);
    a.equal(result.trust, "UNSIGNED");
    a.match(result.limitation, /does not independently authenticate packet provenance/);
    a.equal(result.exitCode, 0);
  }
});

test("packet integrity and bound evidence fail closed under required tampering cases", async () => {
  const mutations = [
    ["evaluated tree", value => { value.evidenceBundle.receipt.evidence.git.value.headTree = B; }, false],
    ["landed tree", value => { value.inputs.landingObservation.landed.tree = B; }, false],
    ["repository binding", value => { value.inputs.mergeRecord.repository = "other/repository"; }, true],
    ["PR binding", value => { value.inputs.mergeRecord.pr = 2; }, true],
    ["receipt evidence", value => { value.evidenceBundle.receipt.evidence.reviews.value = []; }, true],
  ];
  for (const [name, mutate, recompute] of mutations) {
    const value = await fixture(); mutate(value); if (recompute) rehash(value);
    const result = packet.replay(value);
    a.equal(result.verdict, "NOT_PROVEN", name);
    a.notEqual(result.state, "REPLAY_CONSISTENT", name);
    a.equal(result.exitCode, 3, name);
  }
});

test("missing packet inputs and unsupported versions are refused", async () => {
  const missingReceipt = await fixture(); delete missingReceipt.evidenceBundle.receipt; rehash(missingReceipt);
  a.equal(packet.replay(missingReceipt).state, "PACKET_INCONSISTENT");
  const missingComponent = await fixture(); delete missingComponent.inputs.landingObservation; rehash(missingComponent);
  a.equal(packet.replay(missingComponent).reason, "REPLAY_PACKET_COMPONENT_MISSING");
  const future = await fixture(); future.version = 2; rehash(future);
  a.equal(packet.replay(future).state, "UNSUPPORTED");
  a.equal(packet.replay(future).exitCode, 4);
});

test("stored expected verdict labels cannot override deterministic replay", async () => {
  const value = await fixture("FAIL");
  value.expected.relationship.verdict = "VERIFIED";
  const { recordDigest: ignored, ...expectedBody } = value.expected;
  value.expected.recordDigest = hash(expectedBody);
  rehash(value);
  const result = packet.replay(value);
  a.equal(result.state, "PACKET_INCONSISTENT");
  a.equal(result.reason, "REPLAY_CONCLUSION_MISMATCH");
  a.equal(result.verdict, "NOT_PROVEN");
});

test("download serialization round trip replays through the supported CLI", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-replay-packet-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "packet.json"), value = await fixture();
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  a.deepEqual(packet.read(file), value);
  const run = spawnSync(process.execPath, [path.join(__dirname, "../../bin/merge-proof.js"), "verify", "--replay-packet", file], { encoding: "utf8" });
  a.equal(run.status, 0, run.stderr + run.stdout);
  const result = JSON.parse(run.stdout);
  a.equal(result.state, "REPLAY_CONSISTENT");
  a.equal(result.verdict, "VERIFIED");
  a.equal(result.trust, "UNSIGNED");
});

test("CLI classifies missing and malformed packet files as packet failures", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-replay-packet-invalid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.join(__dirname, "../../bin/merge-proof.js"), missing = path.join(root, "missing.json");
  const absent = spawnSync(process.execPath, [cli, "verify", "--replay-packet", missing], { encoding: "utf8" });
  a.equal(absent.status, 3);a.equal(JSON.parse(absent.stderr).reason, "REPLAY_PACKET_FILE_INVALID");
  const malformed = path.join(root, "malformed.json");fs.writeFileSync(malformed, "{not json\n");
  const invalid = spawnSync(process.execPath, [cli, "verify", "--replay-packet", malformed], { encoding: "utf8" });
  a.equal(invalid.status, 3);a.equal(JSON.parse(invalid.stderr).reason, "REPLAY_PACKET_FILE_INVALID");
});
