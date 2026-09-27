"use strict";
const { test } = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
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
  return packet.create({ receiptRow, record, landing: observed, reconciliation: {
    state: "RECONCILED", asOf: "2026-09-26T13:00:00.000Z",
    subject: { repositoryId: receipt.identity.repositoryId, pullRequest: receipt.identity.pr, candidate: receipt.identity.headSha },
  }, evidenceBundle });
}

function rehash(value) {
  const { integrity: ignored, ...body } = value;
  value.integrity = { algorithm: "sha256", payloadDigest: hash(body) };
  return value;
}

async function standardMergePacket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-independent-packet-"));
  const repo = path.join(root, "work"), bare = path.join(root, "objects.git");
  fs.mkdirSync(repo);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "fixture", GIT_COMMITTER_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@invalid", GIT_COMMITTER_EMAIL: "fixture@invalid" };
  const git = (...args) => { const result = spawnSync("/usr/bin/git", ["-C", repo, ...args], { env, encoding: "utf8" }); a.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const write = (name, body) => fs.writeFileSync(path.join(repo, name), body);
  const commit = message => { git("add", "-A"); git("commit", "-m", message); return git("rev-parse", "HEAD"); };
  git("init", "-b", "main"); git("config", "core.hooksPath", "/dev/null");
  write("common", "common\n"); const ancestor = commit("ancestor");
  git("checkout", "-b", "feature"); write("feature", "feature\n"); const head = commit("feature");
  git("checkout", "main"); write("base", "base\n"); const base = commit("base");
  git("merge", "--no-ff", "feature", "-m", "standard merge");
  const landed = git("rev-parse", "HEAD"), landedTree = git("rev-parse", "HEAD^{tree}"), headTree = git("rev-parse", `${head}^{tree}`), baseTree = git("rev-parse", `${base}^{tree}`);
  const mirrored = spawnSync("/usr/bin/git", ["clone", "--bare", repo, bare], { env, encoding: "utf8" }); a.equal(mirrored.status, 0, mirrored.stderr);
  const config = { binary: "/usr/bin/git", version: git("--version"), sha256: crypto.createHash("sha256").update(fs.readFileSync("/usr/bin/git")).digest("hex") };
  const evidence = capture();
  Object.assign(evidence.identity, { repository: "fixture/public-standard-merge", repositoryId: 101, pr: 23, headSha: head, baseSha: base, mergeCommitSha: landed, headRepository: "fixture/public-standard-merge", headRepositoryId: 101 });
  evidence.git.value = { headSha: head, baseSha: base, mergeBase: ancestor, headTree, baseTree, candidateFiles: ["feature"], baseFiles: ["base"], baseAdvanceCommits: 1, dates: { [head]: evidence.observedAt, [base]: evidence.observedAt, [ancestor]: evidence.observedAt } };
  evidence.target = { state: "AVAILABLE", value: { kind: "PR_TEST_MERGE", sha: landed, tree: landedTree, headSha: head, baseSha: base, parents: [base, head] } };
  Object.assign(evidence.remote.value, { repositoryId: 101, observedSha: head, expectedSha: head });
  evidence.checks.value[0].sha = landed;
  Object.assign(evidence.execution.value[0], { sha: landed, runSha: landed, pullRequests: [{ number: 23, headSha: head, repositoryId: 101 }] });
  evidence.execution.value[0].workflowBlob.value.commit = landed;
  evidence.reviews.value[0].sha = head;
  evidence.actors.value.commits[0].sha = head;
  evidence.expectedTree = require("../reconstruct").reconstruct(bare, { base, head, method: "merge", providerTree: landedTree }, config);
  const receipt = prove(evidence); a.equal(receipt.verdict, "VERIFIED", JSON.stringify(receipt.gaps));
  const record = { recordId: "00000000-0000-4000-8000-000000000023", repository: evidence.identity.repository, repositoryId: 101, pr: 23, mergedAt: "2026-09-27T12:00:00.000Z", mergedHeadSha: head, mergeCommitSha: landed, proof: { receiptSnapshot: structuredClone(receipt), currentnessAtDelivery: { state: "CURRENT", asOf: receipt.issuedAt } } };
  const observed = observation(record, { sha: landed, tree: landedTree, parents: [base, head] });
  const originalBundle = await bundle.create(receipt), evidenceBundle = bundle.attachLandings(originalBundle, [{ record, observation: observed }]);
  const value = packet.create({ receiptRow: { receipt, current: { state: "CURRENT", asOf: receipt.issuedAt }, artifacts: originalBundle }, record, landing: observed, reconciliation: { state: "RECONCILED", asOf: "2026-09-27T12:00:01.000Z", subject: { repositoryId: 101, pullRequest: 23, candidate: head } }, evidenceBundle });
  return { root, bare, value, ids: { ancestor, base, head, landed, landedTree, baseTree } };
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
  a.match(value.verifier.independentGitCommand, /--replay-packet .* --git-dir .* --git-binary/);
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

test("one replay-packet command separates replay consistency, independently recomputed Git facts and provider-trusted records", async t => {
  const fixture = await standardMergePacket(t), file = path.join(fixture.root, "packet.json");
  fs.writeFileSync(file, JSON.stringify(fixture.value, null, 2) + "\n");
  const run = spawnSync(process.execPath, [path.join(__dirname, "../../bin/merge-proof.js"), "verify", "--replay-packet", file, "--git-dir", fixture.bare, "--git-binary", "/usr/bin/git"], { encoding: "utf8" });
  a.equal(run.status, 0, run.stderr + run.stdout);
  const result = JSON.parse(run.stdout);
  a.equal(result.state, "INDEPENDENT_VERIFICATION_COMPLETE");
  a.equal(result.replayConsistency.state, "REPLAY_CONSISTENT");
  a.equal(result.independentlyRecomputedGitFacts.state, "INDEPENDENTLY_RECOMPUTED");
  a.equal(result.providerRecordTrustedFacts.state, "NOT_INDEPENDENTLY_AUTHENTICATED");
  for (const kind of ["BASE_COMMIT", "HEAD_COMMIT", "CANDIDATE_COMMIT", "CANDIDATE_TREE", "EXPECTED_TREE", "TEST_MERGE_PARENTS", "LANDED_COMMIT", "LANDED_TREE", "LANDED_PARENTS"])
    a.equal(result.independentlyRecomputedGitFacts.rows.find(row => row.kind === kind)?.state, "MATCH", kind);
});

test("substituted or missing commit, tree and parent claims fail closed", async t => {
  const fixture = await standardMergePacket(t), verify = require("../reverify").independent;
  const cases = [
    ["substituted candidate commit", b => { b.receipt.evidence.target.value.sha = fixture.ids.base; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
    ["missing candidate commit", b => { b.receipt.evidence.target.value.sha = M; }, "INDEPENDENT_VERIFICATION_UNAVAILABLE"],
    ["substituted candidate tree", b => { b.receipt.evidence.target.value.tree = fixture.ids.baseTree; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
    ["missing candidate tree claim", b => { delete b.receipt.evidence.target.value.tree; }, "INDEPENDENT_VERIFICATION_UNAVAILABLE"],
    ["substituted landed commit", b => { b.landings[0].observation.landed.sha = fixture.ids.base; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
    ["missing landed commit", b => { b.landings[0].observation.landed.sha = M; }, "INDEPENDENT_VERIFICATION_UNAVAILABLE"],
    ["substituted landed tree", b => { b.landings[0].observation.landed.tree = fixture.ids.baseTree; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
    ["substituted landed parents", b => { b.landings[0].observation.landed.parents = [fixture.ids.head, fixture.ids.base]; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
    ["missing landed parent", b => { b.landings[0].observation.landed.parents = [fixture.ids.base]; }, "INDEPENDENT_VERIFICATION_DIVERGED"],
  ];
  for (const [name, change, state] of cases) {
    const changed = structuredClone(fixture.value.evidenceBundle); change(changed);
    a.equal(verify(changed, fixture.bare).state, state, name);
  }
});

test("missing required Git object returns NOT_PROVEN without consulting the network", async t => {
  const fixture = await standardMergePacket(t), incomplete = path.join(fixture.root, "incomplete.git");
  fs.cpSync(fixture.bare, incomplete, { recursive: true });
  const object = path.join(incomplete, "objects", fixture.ids.landedTree.slice(0, 2), fixture.ids.landedTree.slice(2));
  a.equal(fs.existsSync(object), true, object); fs.unlinkSync(object);
  const file = path.join(fixture.root, "packet.json"); fs.writeFileSync(file, JSON.stringify(fixture.value) + "\n");
  const run = spawnSync(process.execPath, [path.join(__dirname, "../../bin/merge-proof.js"), "verify", "--replay-packet", file, "--git-dir", incomplete], { encoding: "utf8" });
  a.equal(run.status, 2, run.stderr + run.stdout);
  const result = JSON.parse(run.stdout);
  a.equal(result.state, "INDEPENDENT_VERIFICATION_NOT_PROVEN");
  a.ok(result.independentlyRecomputedGitFacts.rows.some(row => row.state === "OBJECT_UNAVAILABLE" || row.state === "OBJECT_OR_RECONSTRUCTION_UNAVAILABLE"));
});
