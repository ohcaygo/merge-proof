"use strict";
// Prototype OFFLINE verifier for a Merge-Proof proof bundle. Zero dependencies.
//
// Exit semantics (also printed as the last line):
//   0 CONSISTENT_OFFLINE          every offline check passed
//   2 SIGNATURE_INVALID           envelope/signature/key failure
//   3 INCONSISTENT                digest, schema, internal or proof-graph mismatch
//   4 UNSUPPORTED                 schema/policy/predicate version this verifier cannot evaluate
// (5 CONSISTENT_AND_REVERIFIED_ONLINE and 6 REVERIFICATION_DIVERGED are reserved for --online,
//  which this prototype does not implement; read-only research session, no network calls.)
//
// Usage: node verify.js <bundleDir> [--tamper]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { canonical, hash, sha } = require("./pure/common");
const { prove, fingerprint } = require("./pure/proof");

const SUPPORTED = { schemaVersion: [2], policy: ["github-exact-state-v1"],
  predicateType: ["https://merge-proof.ohcaygo.com/attestation/receipt/v2"], payloadType: ["application/vnd.in-toto+json"] };

// Which receipt field(s) each gap code is grounded in. A gap that maps to
// nothing is a verifier finding: the receipt asserts a gap it cannot point at.
const GAP_GROUNDS = {
  TARGET_BINDING_MISMATCH: ["evidence.target", "identity.headSha", "identity.baseSha"],
  CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE: ["evidence.target.value.selection"],
  EVIDENCE_CHANGED_DURING_COLLECTION: ["evidence.consistency"],
  HISTORICAL_RULES_AND_APPROVAL_VALIDITY_UNAVAILABLE: ["identity.analysisMode"],
  LIVE_PR_NOT_OPEN: ["identity.prState", "identity.merged"],
  RULES_UNAVAILABLE: ["evidence.rules"],
  UNSUPPORTED_REPOSITORY_REQUIREMENTS: ["summary.rules.unsupported"],
  APPLICABLE_MERGE_STATE_UNAVAILABLE: ["evidence.target"],
  CURRENT_STATE_EXECUTION_NOT_PROVEN: ["summary.ci.required", "evidence.checks", "evidence.execution"],
  CHECK_EVIDENCE_UNAVAILABLE: ["evidence.checks", "evidence.statuses"],
  NO_REQUIRED_VALIDATION_CONFIGURED: ["summary.rules.checks"],
  INSUFFICIENT_CURRENT_HUMAN_APPROVAL: ["summary.approval", "evidence.reviews"],
  REVIEWS_UNAVAILABLE: ["evidence.reviews"],
  LAST_PUSH_ACTOR_APPROVAL_UNAVAILABLE: ["summary.rules.lastPush"],
  CODE_OWNER_APPROVAL_UNAVAILABLE: ["summary.rules.codeOwners"],
  CHANGES_REQUESTED_OBSERVED: ["evidence.reviews"],
  CURRENT_APPROVAL_NOT_PROVEN: ["summary.approval"],
  REMOTE_CANDIDATE_NOT_CONFIRMED: ["evidence.remote"],
  BASE_DRIFT_UNVERIFIED: ["local.findings", "evidence.git"],
  PROTECTED_BOUNDARY: ["local.findings", "evidence.git.value.candidateFiles"],
  GIT_HISTORY_UNAVAILABLE: ["evidence.git"],
};

function pae(type, body) {
  const t = Buffer.from(type, "utf8");
  return Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${body.length} `), body]);
}
const get = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
// JSON.stringify drops `undefined` but keeps `null`; a field added later as
// `null` must not be read as a mismatch against an older receipt that lacks it.
const stripNull = (x) => Array.isArray(x) ? x.map(stripNull)
  : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNull(v)])) : x;

function verify(dir, opts = {}) {
  const findings = [];
  const notes = [];
  const fail = (code, detail) => findings.push({ code, detail });
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

  const receipt = read("receipt.json");
  const envelope = read("envelope.dsse.json");
  const jwks = read("keys/jwks.json");
  const policy = fs.existsSync(path.join(dir, "policy.json")) ? read("policy.json") : null;
  if (opts.tamper) receipt.verdict = "VERIFIED"; // demonstrate detection

  // ---- 0. version gate --------------------------------------------------
  if (!SUPPORTED.schemaVersion.includes(receipt.schemaVersion)) return done("UNSUPPORTED", [{ code: "SCHEMA_VERSION", detail: receipt.schemaVersion }], notes);
  if (!SUPPORTED.policy.includes(receipt.policy)) return done("UNSUPPORTED", [{ code: "POLICY", detail: receipt.policy }], notes);
  if (!SUPPORTED.payloadType.includes(envelope.payloadType)) return done("UNSUPPORTED", [{ code: "PAYLOAD_TYPE", detail: envelope.payloadType }], notes);

  // ---- 1. signature over the DSSE envelope ------------------------------
  const payload = Buffer.from(envelope.payload, "base64");
  let signed = false;
  for (const s of envelope.signatures || []) {
    const jwk = jwks.keys.find((k) => k.kid === s.keyid) || null; // kid is a hint only
    const candidates = jwk ? [jwk] : jwks.keys;
    for (const k of candidates) {
      try {
        const key = crypto.createPublicKey({ key: k, format: "jwk" });
        if (crypto.verify("sha256", pae(envelope.payloadType, payload), { key, dsaEncoding: "der" }, Buffer.from(s.sig, "base64"))) { signed = k; break; }
      } catch (e) { /* try next key */ }
    }
    if (signed) break;
  }
  if (!signed) return done("SIGNATURE_INVALID", [{ code: "NO_VALID_SIGNATURE", detail: "no signature verified with any bundled key" }], notes);
  notes.push(`signature OK with kid ${signed.kid} (ES256, DSSE PAE)`);
  if (signed["mp:nbf"] && Date.parse(receipt.issuedAt) < Date.parse(signed["mp:nbf"])) fail("KEY_NOT_YET_VALID", signed["mp:nbf"]);
  if (signed["mp:exp"] && Date.parse(receipt.issuedAt) > Date.parse(signed["mp:exp"])) fail("KEY_EXPIRED_AT_ISSUE", signed["mp:exp"]);

  // ---- 2. statement / digest binding -----------------------------------
  const statement = JSON.parse(payload.toString("utf8"));
  if (statement._type !== "https://in-toto.io/Statement/v1") fail("STATEMENT_TYPE", statement._type);
  if (!SUPPORTED.predicateType.includes(statement.predicateType)) return done("UNSUPPORTED", [{ code: "PREDICATE_TYPE", detail: statement.predicateType }], notes);
  const digest = hash(receipt);
  const subj = (n) => (statement.subject || []).find((s) => s.name === n);
  if (subj("receipt")?.digest?.sha256 !== digest) fail("RECEIPT_DIGEST_NOT_A_SUBJECT", `${digest} vs ${subj("receipt")?.digest?.sha256}`);
  if (hash(statement.predicate) !== digest) fail("PREDICATE_DIFFERS_FROM_RECEIPT", hash(statement.predicate));
  if (subj("head")?.digest?.gitCommit !== receipt.identity.headSha) fail("HEAD_SUBJECT_MISMATCH");
  if (subj("base")?.digest?.gitCommit !== receipt.identity.baseSha) fail("BASE_SUBJECT_MISMATCH");
  const targetSha = receipt.summary?.target?.value?.sha;
  if (targetSha && subj("target")?.digest?.gitCommit !== targetSha) fail("TARGET_SUBJECT_MISMATCH");
  if (receipt.fingerprint !== fingerprint(receipt.evidence)) fail("FINGERPRINT_MISMATCH", `${receipt.fingerprint} vs ${fingerprint(receipt.evidence)}`);
  notes.push(`receipt digest ${digest}; fingerprint recomputed ${receipt.fingerprint === fingerprint(receipt.evidence) ? "OK" : "MISMATCH"}`);

  // ---- 3. internal consistency ----------------------------------------
  const id = receipt.identity, ev = receipt.evidence, sm = receipt.summary;
  for (const k of ["repository", "repositoryId", "pr", "headSha", "baseSha", "headRef", "baseRef"])
    if (JSON.stringify(id[k]) !== JSON.stringify(ev.identity?.[k])) fail("IDENTITY_EVIDENCE_MISMATCH", k);
  for (const g of receipt.gaps) {
    const grounds = GAP_GROUNDS[g];
    if (!grounds) fail("GAP_WITHOUT_GROUND", g);
    else if (!grounds.some((p) => get(receipt, p) !== undefined)) fail("GAP_GROUND_MISSING", `${g} -> ${grounds.join("|")}`);
  }
  if (sm.target?.state === "AVAILABLE") {
    const t = sm.target.value;
    if (!sha(t.sha) || t.headSha !== id.headSha || t.baseSha !== id.baseSha) fail("TARGET_NOT_BOUND_TO_IDENTITY");
    if (hash(sm.target) !== hash(ev.target)) fail("SUMMARY_TARGET_DIFFERS_FROM_EVIDENCE");
  }
  for (const row of sm.ci?.required || []) {
    if (row.state === "NAME_COLLIDES_WITH_MERGE_PROOF_CHECK") continue;
    if (row.acceptanceSha && ![targetSha, id.headSha].includes(row.acceptanceSha)) fail("REQUIRED_CHECK_ACCEPTANCE_SHA_UNBOUND", row.name);
    if (row.executionRecorded) {
      if (row.observedCheck?.sha !== targetSha) fail("EXECUTION_NOT_ON_TARGET", row.name);
      if (!row.workflowJobs?.every((j) => j.sha === targetSha && j.runSha === targetSha)) fail("JOB_SHA_NOT_TARGET", row.name);
      const rule = (sm.rules.checks || []).find((r) => r.name === row.name && r.appId === row.appId);
      if (!rule) fail("REQUIRED_ROW_NOT_IN_RULES", row.name);
    }
    if (row.checkId && ev.checks?.state === "AVAILABLE" && !ev.checks.value.some((c) => c.id === row.checkId)) fail("ROW_CHECK_NOT_IN_OBSERVATIONS", row.name);
  }
  for (const a of sm.approval?.current || []) {
    if (a.sha !== id.headSha) fail("CURRENT_APPROVAL_NOT_ON_HEAD", a.reviewer);
    const rv = ev.reviews?.state === "AVAILABLE" && ev.reviews.value.find((r) => r.id === a.id);
    if (!rv) fail("APPROVAL_ROW_NOT_IN_OBSERVATIONS", a.id);
    else if (rv.userId === id.authorId) fail("SELF_APPROVAL_COUNTED", a.reviewer);
  }
  if (sm.ci?.state === "PROVEN" && !(sm.ci.required || []).length) fail("CI_PROVEN_WITH_NO_REQUIREMENTS");
  if (receipt.verdict === "VERIFIED" && receipt.gaps.length) fail("VERIFIED_WITH_GAPS", receipt.gaps.join(","));
  if (receipt.verdict !== "VERIFIED" && !receipt.gaps.length && receipt.local?.verdict !== "FAIL") fail("NOT_VERIFIED_WITHOUT_GAPS");
  if (sm.remote?.state === "AVAILABLE" && sm.remote.value.observedSha !== id.headSha && !receipt.gaps.includes("REMOTE_CANDIDATE_NOT_CONFIRMED")) fail("REMOTE_SHA_DIVERGES_SILENTLY");
  if (ev.consistency !== "STABLE_OBSERVATION" && !receipt.gaps.includes("EVIDENCE_CHANGED_DURING_COLLECTION")) fail("UNSTABLE_OBSERVATION_NOT_GAPPED");

  // ---- 4. proof-graph consistency: verdict is a pure function of evidence --
  const appId = policy?.appId ?? sm.gate?.appId ?? null;
  const toolVersion = policy?.toolVersion ?? receipt.tool?.version ?? "0.0.0";
  const re = prove(ev, { appId, toolVersion, receiptId: receipt.receiptId });
  if (re.verdict !== receipt.verdict) fail("VERDICT_NOT_REPRODUCED", `${receipt.verdict} recorded, ${re.verdict} recomputed`);
  if (JSON.stringify([...re.gaps].sort()) !== JSON.stringify([...receipt.gaps].sort())) fail("GAPS_NOT_REPRODUCED", `${receipt.gaps} vs ${re.gaps}`);
  const diffs = [];
  for (const k of Object.keys(re)) if (k !== "receiptId" && hash(stripNull(re[k])) !== hash(stripNull(receipt[k] ?? {}))) diffs.push(k);
  const extra = Object.keys(receipt).filter((k) => !(k in re));
  if (diffs.length) fail("RECEIPT_BODY_NOT_REPRODUCED", diffs.join(","));
  notes.push(`prove() re-run: verdict ${re.verdict}, gaps ${JSON.stringify(re.gaps)}; body fields reproduced=${Object.keys(re).length - 1 - diffs.length}/${Object.keys(re).length - 1}; unsigned-extra fields in receipt: ${extra.join(",") || "none"}`);
  const strict = Object.keys(re).filter((k) => k !== "receiptId" && hash(re[k]) !== hash(receipt[k] ?? {}));
  if (strict.length) notes.push(`byte-strict comparison differs in: ${strict.join(",")} (null-vs-absent schema drift; tolerated)`);

  // ---- 5. optional: transparency + git objects (not present in this bundle) --
  if (!fs.existsSync(path.join(dir, "tlog.json"))) notes.push("tlog.json absent: no transparency inclusion checked (offline verdict does not depend on it)");
  if (!fs.existsSync(path.join(dir, "objects.pack"))) notes.push("objects.pack absent: git relationships not checked");

  return done(findings.length ? "INCONSISTENT" : "CONSISTENT_OFFLINE", findings, notes);
}

function done(status, findings, notes) {
  for (const n of notes) console.log("  note:", n);
  for (const f of findings) console.log("  FINDING:", f.code, f.detail ?? "");
  console.log(status);
  return { status, findings, notes };
}

const codes = { CONSISTENT_OFFLINE: 0, SIGNATURE_INVALID: 2, INCONSISTENT: 3, UNSUPPORTED: 4 };
const { status } = verify(process.argv[2] || path.join(__dirname, "bundle"), { tamper: process.argv.includes("--tamper") });
process.exitCode = codes[status];
