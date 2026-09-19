"use strict";
// Prototype bundle producer. Zero dependencies. Generates a throwaway P-256 key,
// wraps the example receipt in an in-toto Statement, signs it as a DSSE
// envelope, and writes a minimal portable proof bundle to ./bundle/.
//
// Usage: node sign.js <receipt.json> [outDir]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { canonical, hash } = require("./pure/common");

const PREDICATE_TYPE = "https://merge-proof.ohcaygo.com/attestation/receipt/v2";
const PAYLOAD_TYPE = "application/vnd.in-toto+json";
const VERIFIER_VERSION = "merge-proof-verify/0.1.0-prototype";

function pae(type, body) {
  const t = Buffer.from(type, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${t.length} `, "utf8"), t,
    Buffer.from(` ${body.length} `, "utf8"), body,
  ]);
}

function main() {
  const receiptPath = process.argv[2];
  const outDir = process.argv[3] || path.join(__dirname, "bundle");
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const body = canonical(receipt);
  const digest = hash(receipt);

  // Key: ECDSA P-256, kid = base64url(sha256(SPKI DER)) (Sigstore convention).
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const kid = crypto.createHash("sha256").update(spki).digest("base64url");
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig",
    "mp:nbf": receipt.issuedAt, "mp:exp": null };

  const target = receipt.summary?.target?.value?.sha || receipt.identity.headSha;
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      { name: "head", digest: { gitCommit: receipt.identity.headSha } },
      { name: "base", digest: { gitCommit: receipt.identity.baseSha } },
      { name: "target", digest: { gitCommit: target } },
      { name: "receipt", digest: { sha256: digest } },
    ],
    predicateType: PREDICATE_TYPE,
    predicate: body,
  };
  const payload = Buffer.from(JSON.stringify(canonical(statement)), "utf8");
  const sig = crypto.sign("sha256", pae(PAYLOAD_TYPE, payload), { key: privateKey, dsaEncoding: "der" });
  const envelope = {
    payloadType: PAYLOAD_TYPE,
    payload: payload.toString("base64"),
    signatures: [{ keyid: kid, sig: sig.toString("base64") }],
  };

  const policy = {
    policy: receipt.policy,
    schemaVersion: receipt.schemaVersion,
    predicateType: PREDICATE_TYPE,
    toolVersion: receipt.tool?.version || null,
    appId: receipt.summary?.gate?.appId ?? null,
    supportedRuleTypes: ["required_status_checks", "pull_request", "merge_queue", "deletion", "non_fast_forward", "creation"],
    classicFields: ["required_status_checks", "required_pull_request_reviews", "required_conversation_resolution", "required_signatures", "required_linear_history"],
    acceptedConclusions: ["success", "neutral", "skipped"],
    executionConclusions: ["success"],
    approvalStatesConsidered: ["APPROVED", "DISMISSED", "CHANGES_REQUESTED"],
    approvalEligibility: ["userType=User", "userId!=authorId", "writePermission=true", "sha=identity.headSha"],
    targetKinds: ["HEAD_CONTAINS_CURRENT_BASE", "PR_TEST_MERGE", "MERGE_GROUP", "LANDED_TWO_PARENT_MERGE"],
    notChecked: receipt.notChecked,
    requiredCheckContextName: "Merge Proof exact-state receipt",
    localAnalysis: { staleCommits: 100, staleDays: 30, evidenceSource: "github-rest-git-metadata" },
  };

  fs.mkdirSync(path.join(outDir, "keys"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "observations"), { recursive: true });
  const w = (f, x) => fs.writeFileSync(path.join(outDir, f), typeof x === "string" ? x : JSON.stringify(x, null, 2) + "\n");
  w("receipt.json", JSON.stringify(body) + "\n");
  w("statement.intoto.json", statement);
  w("envelope.dsse.json", envelope);
  w("policy.json", policy);
  w(`keys/${kid}.jwk.json`, jwk);
  w("keys/jwks.json", { keys: [jwk] });
  w("verifier-version.txt", `${VERIFIER_VERSION}\nschema=2 policy=${receipt.policy} predicateType=${PREDICATE_TYPE}\n`);
  w("observations/POINTER.txt", "Raw projected observations are embedded in receipt.json#/evidence; no separate copy in this prototype.\n");
  // For demonstration only: a private key is NEVER part of a real bundle.
  fs.writeFileSync(path.join(__dirname, "PROTOTYPE-PRIVATE-KEY.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log(`bundle written to ${outDir}; receipt digest ${digest}; kid ${kid}`);
}
main();
