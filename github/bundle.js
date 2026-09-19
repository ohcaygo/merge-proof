"use strict";
const crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const { hash, canonical, assert } = require("./common");
const TYPE = "application/vnd.in-toto+json";
const PREDICATE = "https://merge-proof.ohcaygo.com/attestation/receipt/v3";
const CODE = ["package.json","github/proof.js", "github/claims.js", "github/rules.js", "github/subject.js", "github/bindings.js", "github/actors.js", "github/authority.js", "github/setup.js", "github/local-evidence.js", "github/wording.js", "github/check.js", "src/analyze.js", "src/rules.js"];
const codeDigest = () => hash(CODE.map(f => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", f))).digest("hex")]));
function pae(type, bytes) { const t = Buffer.from(type); return Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${bytes.length} `), bytes]); }
const stripNull = v => Array.isArray(v) ? v.map(stripNull) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, stripNull(x)])) : v;
async function create(receipt, { signer = null, keys = null } = {}) {
  const policy = { id: receipt.policy, proofOptions: receipt.proofOptions || {}, codeDigest: codeDigest(), semantics: { VERIFIED: "sufficient current positive evidence", NOT_PROVEN: "insufficient or unprovable evidence", FAIL: "demonstrated unmet required condition" } };
  const verdictInfo = { node: process.version, icu: process.versions.icu, codeDigest: policy.codeDigest, observationId: receipt.observationId, policyDigest: hash(policy) };
  const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: PREDICATE,
    subject: [{ name: "receipt", digest: { sha256: hash(receipt) } }, { name: "candidate", digest: { gitCommit: receipt.identity.headSha } },
      { name: "base", digest: { gitCommit: receipt.identity.baseSha } }],
    predicate: { receiptDigest: hash(receipt), policyDigest: hash(policy), verdictInfoDigest: hash(verdictInfo), target: receipt.subject,
      trust: "Records what GitHub reported and what Merge Proof recomputed; a signature does not prove the provider's world state." } };
  const payload = Buffer.from(JSON.stringify(canonical(statement)));
  const signatures = signer ? [await signer(pae(TYPE, payload))] : [];
  return { schema: "urn:merge-proof:bundle:1", receipt: structuredClone(receipt), policy, verdictInfo, statement,
    envelope: { payloadType: TYPE, payload: payload.toString("base64"), signatures }, keys,
    signing: signatures.length ? "SIGNED_STATEMENT" : "SIGNING_NOT_CONFIGURED",
    coverage: { offline: ["receipt digest", "subject binding", "verdict replay", "policy and engine identity"],
      online: ["retained check and workflow identifiers", "review identity and commit", "commit and tree identifiers"],
      providerTrusted: ["historical observations", "provider truth", "permissions at observation"],
      unavailable: ["what CI actually checked out", "unobserved exempt bypasses", "atomic currentness at merge"] } };
}
function replay(receipt, policy) {
  if (!["github-exact-state-v2", "github-exact-state-v3"].includes(receipt?.policy)) return { state: "UNSUPPORTED", reason: "POLICY_VERSION_UNSUPPORTED" };
  let engine = require("./proof");
  if (policy?.codeDigest !== codeDigest()) {
    const compatibility = require("./verifier/compatibility.json")[policy?.codeDigest];
    if (!compatibility?.policies.includes(receipt.policy) || compatibility.engine !== "v2") return { state: "UNSUPPORTED", reason: "ENGINE_VERSION_UNSUPPORTED" };
    engine = require("./verifier/v2/proof");
  }
  try {
    const computed = engine.prove(receipt.evidence, policy.proofOptions);
    const fields = ["schemaVersion", "policy", "proofOptions", "freshness", "expectedTree", "verdict", "violations", "identity", "subject", "fingerprint", "bindings", "claims", "policySnapshot", "observationId", "summary", "gaps", "local", "notChecked", "limitations"];
    const changed = fields.filter(k => hash(stripNull(computed[k])) !== hash(stripNull(receipt[k])));
    return { state: changed.length ? "INCONSISTENT" : "CONSISTENT_OFFLINE", changed };
  } catch { return { state: "INCONSISTENT", reason: "MALFORMED_EVIDENCE" }; }
}
function verify(bundle, { trustedKeys = [], allowUnsigned = false } = {}) {
  const findings = [];
  try {
    if (bundle?.schema !== "urn:merge-proof:bundle:1" || bundle.envelope?.payloadType !== TYPE) return { state: "UNSUPPORTED", exitCode: 4 };
    const bytes = Buffer.from(bundle.envelope.payload, "base64"), statement = JSON.parse(bytes);
    if (statement.predicateType !== PREDICATE || statement._type !== "https://in-toto.io/Statement/v1") return { state: "UNSUPPORTED", exitCode: 4 };
    const r = bundle.receipt;
    if (bundle.policy.id !== r.policy || bundle.verdictInfo.policyDigest !== hash(bundle.policy) || bundle.verdictInfo.codeDigest !== bundle.policy.codeDigest || bundle.verdictInfo.observationId !== r.observationId) findings.push("VERDICT_INFO_BINDING_MISMATCH");
    if (statement.predicate.receiptDigest !== hash(r) || !statement.subject.some(s => s.name === "receipt" && s.digest.sha256 === hash(r))) findings.push("RECEIPT_DIGEST_MISMATCH");
    if (statement.predicate.policyDigest !== hash(bundle.policy) || statement.predicate.verdictInfoDigest !== hash(bundle.verdictInfo)) findings.push("POLICY_DIGEST_MISMATCH");
    if (hash(statement) !== hash(bundle.statement) || hash(statement.predicate.target) !== hash(r.subject)) findings.push("STATEMENT_BINDING_MISMATCH");
    for (const [name, value] of [["candidate", r.identity.headSha], ["base", r.identity.baseSha]])
      if (!statement.subject.some(s => s.name === name && s.digest.gitCommit === value)) findings.push("SUBJECT_MISMATCH");
    let signed = false;
    for (const signature of bundle.envelope.signatures || []) for (const jwk of trustedKeys) {
      if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.kid !== signature.keyid) continue;
      if (!Number.isFinite(Date.parse(r.issuedAt)) || (jwk.nbf != null && !Number.isFinite(Date.parse(jwk.nbf))) || (jwk.exp != null && !Number.isFinite(Date.parse(jwk.exp)))) continue;
      if (jwk.nbf && Date.parse(r.issuedAt) < Date.parse(jwk.nbf) || jwk.exp && Date.parse(r.issuedAt) > Date.parse(jwk.exp) || jwk.revoked === true) continue;
      const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
      if (crypto.verify("sha256", pae(TYPE, bytes), { key, dsaEncoding: "der" }, Buffer.from(signature.sig, "base64"))) signed = true;
    }
    const derived = replay(r, bundle.policy);
    if (derived.state === "UNSUPPORTED") return { ...derived, exitCode: 4 };
    if (findings.length || derived.state === "INCONSISTENT") return { state: "INCONSISTENT", findings, replay: derived, exitCode: 3 };
    if (!signed && (bundle.envelope.signatures.length || !allowUnsigned)) return { state: "SIGNATURE_UNVERIFIED", reason: "No valid signature from an independently trusted key", replay: derived, exitCode: 2 };
    return { state: "CONSISTENT_OFFLINE", signature: signed ? "VALID_TRUSTED_KEY" : "UNSIGNED", coverage: bundle.coverage,
      limitation: "Consistency does not establish provider truth or present currentness.", exitCode: 0 };
  } catch { return { state: "INCONSISTENT", findings: ["MALFORMED_BUNDLE"], exitCode: 3 }; }
}
function write(directory, bundle) {
  fs.mkdirSync(directory, { mode: 0o700 });
  for (const [name, value] of Object.entries({ "bundle.json": bundle, "receipt.json": bundle.receipt, "policy.json": bundle.policy, "verdict-info.json": bundle.verdictInfo, "statement.intoto.json": bundle.statement, "envelope.dsse.json": bundle.envelope }))
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
module.exports = { create, verify, replay, write, pae, codeDigest };
