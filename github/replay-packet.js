"use strict";

// Buyer-downloadable inputs for replaying one Merge Truth result. The packet
// is deliberately unsigned: it proves consistency, not trusted provenance.
const fs = require("node:fs");
const { hash, assert } = require("./common");

const SCHEMA = "urn:merge-proof:replay-packet:1";
const VERSION = 1;
const LIMITATION = "This packet is unsigned. Replay establishes that these exact supplied and bound inputs reproduce the stated Merge Truth conclusion; it does not independently authenticate packet provenance, GitHub, present currentness, or a public trust root.";

function create({ receiptRow, record = null, landing = null, reconciliation = {}, evidenceBundle }) {
  assert(receiptRow?.receipt && evidenceBundle, "REPLAY_PACKET_INPUTS_REQUIRED");
  assert(hash(receiptRow.receipt) === hash(evidenceBundle.receipt), "REPLAY_PACKET_RECEIPT_MISMATCH");
  const inputs = {
    currentness: structuredClone(receiptRow.current || { state: "UNAVAILABLE", reason: "CURRENTNESS_NOT_RECORDED" }),
    mergeRecord: record ? structuredClone(record) : null,
    landingObservation: landing ? structuredClone(landing) : null,
    reconciliation: structuredClone(reconciliation || {}),
  };
  const expected = require("./merge-truth").build({
    receiptRow: { receipt: evidenceBundle.receipt, artifacts: { policy: evidenceBundle.policy }, current: inputs.currentness },
    record: inputs.mergeRecord,
    landing: inputs.landingObservation,
    reconciliation: inputs.reconciliation,
  });
  const body = {
    schema: SCHEMA,
    version: VERSION,
    trust: { packetSignature: "UNSIGNED", limitation: LIMITATION },
    verifier: { engine: "merge-proof-replay-packet", version: VERSION, command: "npx merge-proof verify --replay-packet <downloaded-packet.json>" },
    evidenceBundle: structuredClone(evidenceBundle),
    inputs,
    expected,
  };
  return { ...body, integrity: { algorithm: "sha256", payloadDigest: hash(body) } };
}

function inconsistent(reason, details = {}) {
  return { state: "PACKET_INCONSISTENT", verdict: "NOT_PROVEN", reason, trust: "UNSIGNED", limitation: LIMITATION, ...details, exitCode: 3 };
}

function replay(packet) {
  try {
    if (!packet || packet.schema !== SCHEMA || packet.version !== VERSION)
      return { state: "UNSUPPORTED", verdict: "NOT_PROVEN", reason: "REPLAY_PACKET_VERSION_UNSUPPORTED", trust: "UNSIGNED", limitation: LIMITATION, exitCode: 4 };
    for (const key of ["trust", "verifier", "evidenceBundle", "inputs", "expected", "integrity"])
      assert(Object.prototype.hasOwnProperty.call(packet, key), "REPLAY_PACKET_COMPONENT_MISSING");
    assert(packet.trust?.packetSignature === "UNSIGNED" && packet.trust?.limitation === LIMITATION, "REPLAY_PACKET_TRUST_BOUNDARY_INVALID");
    assert(packet.integrity?.algorithm === "sha256" && /^[a-f0-9]{64}$/.test(packet.integrity.payloadDigest), "REPLAY_PACKET_INTEGRITY_INVALID");
    const { integrity, ...body } = packet;
    if (hash(body) !== integrity.payloadDigest) return inconsistent("REPLAY_PACKET_DIGEST_MISMATCH");

    const embeddedKeys = packet.evidenceBundle.keys?.keys || [];
    assert(Array.isArray(embeddedKeys) && embeddedKeys.every(key => key && key.d === undefined), "PRIVATE_KEY_MATERIAL_REFUSED");
    const evidence = require("./bundle").verify(packet.evidenceBundle, { trustedKeys: embeddedKeys, allowUnsigned: true });
    if (evidence.exitCode !== 0) return inconsistent("EVIDENCE_BUNDLE_INCONSISTENT", { evidence });

    const inputs = packet.inputs;
    assert(inputs && Object.prototype.hasOwnProperty.call(inputs, "currentness") && Object.prototype.hasOwnProperty.call(inputs, "mergeRecord") && Object.prototype.hasOwnProperty.call(inputs, "landingObservation") && Object.prototype.hasOwnProperty.call(inputs, "reconciliation"), "REPLAY_PACKET_COMPONENT_MISSING");
    if (inputs.mergeRecord && inputs.landingObservation) {
      const { observationId: ignoredInputId, ...inputObservation } = inputs.landingObservation;
      const attached = (packet.evidenceBundle.landings || []).some(value =>
        value.record?.repository === inputs.mergeRecord.repository && value.record?.repositoryId === inputs.mergeRecord.repositoryId &&
        value.record?.pr === inputs.mergeRecord.pr && value.record?.mergedHeadSha === inputs.mergeRecord.mergedHeadSha &&
        (() => { const { observationId: ignoredBundleId, ...bundleObservation } = value.observation; return hash(bundleObservation) === hash(inputObservation); })());
      assert(attached, "LANDING_INPUT_NOT_BOUND_TO_EVIDENCE_BUNDLE");
    }
    assert(hash(packet.evidenceBundle.receipt) === hash(inputs.mergeRecord?.proof?.receiptSnapshot || packet.evidenceBundle.receipt), "MERGE_RECORD_RECEIPT_MISMATCH");

    const actual = require("./merge-truth").build({
      receiptRow: { receipt: packet.evidenceBundle.receipt, artifacts: { policy: packet.evidenceBundle.policy }, current: inputs.currentness },
      record: inputs.mergeRecord,
      landing: inputs.landingObservation,
      reconciliation: inputs.reconciliation,
    });
    assert(require("./merge-truth").verify(packet.expected).state === "CONSISTENT_PROJECTION", "EXPECTED_MERGE_TRUTH_INCONSISTENT");
    if (hash(actual) !== hash(packet.expected)) return inconsistent("REPLAY_CONCLUSION_MISMATCH", { actual });
    return {
      state: "REPLAY_CONSISTENT", verdict: actual.relationship.verdict, reason: actual.relationship.reason,
      relationship: actual.relationship.state, repository: actual.repository, evaluated: actual.evaluated.candidate,
      landed: { commit: actual.landing.mergeCommit, tree: actual.landing.tree, path: actual.landing.path },
      packetDigest: hash(packet), evidence: { state: evidence.state, signature: evidence.signature === "VALID_TRUSTED_KEY" ? "VALID_EMBEDDED_KEY_NOT_INDEPENDENTLY_TRUSTED" : "UNSIGNED" },
      trust: "UNSIGNED", limitation: LIMITATION, exitCode: 0,
    };
  } catch (error) {
    return inconsistent(error.code || "MALFORMED_REPLAY_PACKET");
  }
}

function read(file) {
  try {
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 10 * 1024 * 1024, "REPLAY_PACKET_FILE_INVALID");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    assert(value && typeof value === "object" && !Array.isArray(value), "REPLAY_PACKET_FILE_INVALID");
    return value;
  } catch (error) {
    if (error.code === "REPLAY_PACKET_FILE_INVALID") throw error;
    throw Object.assign(new Error("REPLAY_PACKET_FILE_INVALID"), { code: "REPLAY_PACKET_FILE_INVALID" });
  }
}

module.exports = { SCHEMA, VERSION, LIMITATION, create, replay, read };
