"use strict";
const crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const { hash, canonical, assert } = require("./common");
const TYPE = "application/vnd.in-toto+json";
const PREDICATE = "https://merge-proof.ohcaygo.com/attestation/receipt/v3";
const CODE = ["package.json", "github/common.js", "github/queue-order.js", "github/reconstruct.js","github/proof.js", "github/claims.js", "github/rules.js", "github/subject.js", "github/bindings.js", "github/actors.js", "github/authority.js", "github/setup.js", "github/local-evidence.js", "github/wording.js", "github/check.js", "src/analyze.js", "src/rules.js"];
const codeDigest = () => hash(CODE.map(f => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", f))).digest("hex")]));
function pae(type, bytes) { const t = Buffer.from(type); return Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${bytes.length} `), bytes]); }
const stripNull = v => Array.isArray(v) ? v.map(stripNull) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, stripNull(x)])) : v;
async function create(receipt, { signer = null, keys = null } = {}) {
  const policy = { id: receipt.policy, proofOptions: receipt.proofOptions || {}, codeDigest: codeDigest(), semantics: { VERIFIED: "sufficient current positive evidence", NOT_PROVEN: "insufficient or unprovable evidence", FAIL: "demonstrated unmet required condition" } };
  const verdictInfo = { verifierVersion: 1, sourceCommit: process.env.MP_SOURCE_COMMIT || null, apiVersion: "2026-03-10", reconstruction: receipt.expectedTree || null, node: process.version, icu: process.versions.icu, codeDigest: policy.codeDigest, observationId: receipt.observationId, policyDigest: hash(policy) };
  const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: PREDICATE,
    subject: [{ name: "receipt", digest: { sha256: hash(receipt) } }, { name: "candidate", digest: { gitCommit: receipt.identity.headSha } },
      { name: "base", digest: { gitCommit: receipt.identity.baseSha } },
      ...(receipt.subject?.value?.commit ? [{ name: "target", digest: { gitCommit: receipt.subject.value.commit } }] : [])],
    predicate: { receiptDigest: hash(receipt), policyDigest: hash(policy), verdictInfoDigest: hash(verdictInfo), target: receipt.subject,
      trust: "Records what GitHub reported and what Merge Proof recomputed; a signature does not prove the provider's world state." } };
  const payload = Buffer.from(JSON.stringify(canonical(statement)));
  const signatures = signer ? [await signer(pae(TYPE, payload))] : [];
  return { schema: "urn:merge-proof:bundle:1", receipt: structuredClone(receipt), policy, verdictInfo, statement,
    envelope: { payloadType: TYPE, payload: payload.toString("base64"), signatures }, keys,
    signing: signatures.length ? "SIGNED_STATEMENT" : "SIGNING_NOT_CONFIGURED",
    coverage: { offline: ["receipt digest", "subject binding", "verdict replay", "policy and engine identity"],
      online: ["retained check and workflow identifiers", "review identity and commit", "commit and tree identifiers"],
      independentlyRecomputableWithGitObjects: ["commit trees", "merge bases", "test-merge parents", "group ancestry", "expected tree inside the recorded envelope"],
      providerTrusted: ["historical observations", "provider truth", "permissions at observation"],
      unavailable: ["what CI actually checked out", "unobserved exempt bypasses", "atomic currentness at merge"] } };
}
function replay(receipt, policy) {
  if (!["github-exact-state-v2", "github-exact-state-v3"].includes(receipt?.policy)) return { state: "UNSUPPORTED", reason: "POLICY_VERSION_UNSUPPORTED" };
  let engine = require("./proof");
  if (policy?.codeDigest !== codeDigest()) {
    const compatibility = require("./verifier/compatibility.json")[policy?.codeDigest];
    if (!compatibility?.policies.includes(receipt.policy) || !/^v[0-9]+$/.test(compatibility.engine)) return { state: "UNSUPPORTED", reason: "ENGINE_VERSION_UNSUPPORTED" };
    engine = require(`./verifier/${compatibility.engine}/proof`);
  }
  try {
    const computed = engine.prove(receipt.evidence, policy.proofOptions);
    const fields = ["schemaVersion", "policy", "proofOptions", "freshness", "expectedTree", "verdict", "violations", "identity", "subject", "fingerprint", "bindings", "claims", "policySnapshot", "observationId", "summary", "gaps", "local", "notChecked", "limitations"];
    const changed = fields.filter(k => hash(stripNull(computed[k])) !== hash(stripNull(receipt[k])));
    return { state: changed.length ? "INCONSISTENT" : "CONSISTENT_OFFLINE", changed };
  } catch { return { state: "INCONSISTENT", reason: "MALFORMED_EVIDENCE" }; }
}
function verifySignature(bytes, signatures, trustedKeys, issuedAt) {
  if (!Number.isFinite(Date.parse(issuedAt))) return false;
  return (signatures || []).some(signature => trustedKeys.some(jwk => {
    try {
      if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.kid !== signature.keyid || jwk.d !== undefined || jwk.revoked === true || jwk.alg && jwk.alg !== "ES256" || jwk.use && jwk.use !== "sig") return false;
      for (const field of ["nbf", "exp"]) if (jwk[field] != null && !Number.isFinite(Date.parse(jwk[field]))) return false;
      if (jwk.nbf && Date.parse(issuedAt) < Date.parse(jwk.nbf) || jwk.exp && Date.parse(issuedAt) >= Date.parse(jwk.exp)) return false;
      return crypto.verify("sha256", bytes, {key:crypto.createPublicKey({key:jwk,format:"jwk"}),dsaEncoding:"der"}, Buffer.from(signature.sig,"base64"));
    } catch { return false; }
  }));
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
    if (statement.subject.filter(s => s.name === "target").length && !statement.subject.some(s => s.name === "target" && s.digest.gitCommit === r.subject?.value?.commit)) findings.push("TARGET_SUBJECT_MISMATCH");
    if (new Set(statement.subject.map(s => s.name)).size !== statement.subject.length) findings.push("DUPLICATE_SUBJECT");
    const signed = verifySignature(pae(TYPE,bytes),bundle.envelope.signatures,trustedKeys,r.issuedAt);
    const derived = replay(r, bundle.policy);
    if (derived.state === "UNSUPPORTED") return { ...derived, exitCode: 4 };
    if (findings.length || derived.state === "INCONSISTENT") return { state: "INCONSISTENT", findings, replay: derived, exitCode: 3 };
    if (!signed && (bundle.envelope.signatures.length || !allowUnsigned)) return { state: "SIGNATURE_UNVERIFIED", reason: "No valid signature from an independently trusted key", replay: derived, exitCode: 2 };
    const landings = (bundle.landings || []).map(l => verifyLanding(l, r, {trustedKeys,allowUnsigned}));
    if (landings.some(l => l.exitCode)) return {state:"LANDED_CHAIN_UNVERIFIED",landings,exitCode:landings.find(l=>l.exitCode).exitCode};
    if(bundle.tlog)assert(bundle.tlog.entry?.receiptId===r.receiptId,"LOG_RECEIPT_MISMATCH");
    const log = bundle.tlog ? require("./operator-log").verify(bundle.tlog,bundle.envelope,{trustedKeys}) : {state:"NOT_INCLUDED"};
    if (log.exitCode) return {state:"LOG_INCONSISTENT",log,exitCode:log.exitCode};
    return { state: "CONSISTENT_OFFLINE", landings, log, signature: signed ? "VALID_TRUSTED_KEY" : "UNSIGNED", coverage: {offline:["receipt digest","subject binding","verdict replay","policy and engine identity","supplied landed binding"],providerTrusted:["historical observations","provider truth","permissions at observation"],unavailable:["what CI actually checked out","unobserved exempt bypasses","atomic currentness at merge"]},
      limitation: "Consistency does not establish provider truth or present currentness.", exitCode: 0 };
  } catch { return { state: "INCONSISTENT", findings: ["MALFORMED_BUNDLE"], exitCode: 3 }; }
}
function verifyLanding(value, receipt, {trustedKeys=[],allowUnsigned=false}={}) {
  try {
    const {record,observation}=value, statement=observation.attestation, envelope=observation.envelope;
    assert(record.repositoryId===receipt.identity.repositoryId && record.repository===receipt.identity.repository && record.pr===receipt.identity.pr && record.mergedHeadSha===receipt.identity.headSha,"LANDED_REPOSITORY_BINDING_MISMATCH");
    assert(statement._type==="https://in-toto.io/Statement/v1" && statement.predicateType==="https://merge-proof.ohcaygo.com/attestation/landed-binding/v1" && statement.predicate.receiptDigest===hash(receipt) && statement.predicate.repositoryId===receipt.identity.repositoryId,"LANDED_RECEIPT_BINDING_MISMATCH");
    const binding=statement.predicate.binding;
    const resolved=binding.commitResolution?.value||record.mergeCommitSha||null;
    if(resolved)assert(statement.subject.length===1&&statement.subject[0].name===record.repository&&statement.subject[0].digest.gitCommit===resolved&&record.mergeCommitSha===resolved,"LANDED_SUBJECT_MISMATCH");
    else assert(!binding.landed&&["LANDED_UNRESOLVED","NO_PROOF_RECORDED"].includes(binding.state)&&(statement.subject.length===0||statement.subject.length===1&&statement.subject[0].name===record.repository&&statement.subject[0].digest.gitCommit==null),"LANDED_SUBJECT_MISMATCH");
    if(binding.landed)assert(binding.landed.sha===resolved,"LANDED_SUBJECT_MISMATCH");
    const {attestation:ignored,envelope:ignoredEnvelope,observationId:ignoredId,...body}=observation;
    assert(hash(body)===hash(binding),"LANDED_OBSERVATION_MISMATCH");
    const computed=require("./landing").compare({...record,proof:{receiptSnapshot:receipt}},binding.landed);
    for(const key of ["state","reason","method","parentsConsistent","receiptDigest"]) assert((computed[key]??null)===(binding[key]??null),"LANDED_REPLAY_MISMATCH");
    let signed=false;
    if(envelope){assert(envelope.payloadType===TYPE,"LANDED_ENVELOPE_TYPE_MISMATCH");const bytes=Buffer.from(envelope.payload,"base64");assert(hash(JSON.parse(bytes))===hash(statement),"LANDED_ENVELOPE_MISMATCH");signed=verifySignature(pae(TYPE,bytes),envelope.signatures,trustedKeys,binding.recordedAt);}
    if(!signed && (!allowUnsigned || envelope?.signatures?.length)) return {state:"LANDED_SIGNATURE_UNVERIFIED",exitCode:2};
    return {state:"LANDED_CHAIN_CONSISTENT",landedState:binding.state,signature:signed?"VALID_TRUSTED_KEY":"UNSIGNED",currentnessAtMerge:"UNAVAILABLE",exitCode:0};
  }catch(e){return {state:"LANDED_CHAIN_INCONSISTENT",reason:e.code||"MALFORMED_LANDING",exitCode:3};}
}
function attachLandings(bundle,values) {
  return {...bundle,landings:values.map(({record,observation})=>({record:{repository:record.repository,repositoryId:record.repositoryId,pr:record.pr,
    mergedHeadSha:record.mergedHeadSha,mergeCommitSha:observation.commitResolution?.value||observation.landed?.sha||record.mergeCommitSha},observation}))};
}
function components(bundle){
  return {"bundle.json":bundle,"receipt.json":bundle.receipt,"policy.json":bundle.policy,"verdict-info.json":bundle.verdictInfo,
    "statement.intoto.json":bundle.statement,"envelope.dsse.json":bundle.envelope,"keys/jwks.json":bundle.keys||{keys:[]},
    "verifier-version.json":{schema:1,engineDigest:bundle.policy.codeDigest},...(bundle.tlog?{"tlog.json":bundle.tlog}:{}),...(bundle.landings?{"landings.json":bundle.landings}:{})};
}
function write(directory,bundle){
  fs.mkdirSync(directory,{mode:0o700});const entries={};
  for(const [name,value] of Object.entries(components(bundle))){const bytes=JSON.stringify(value,null,2)+"\n";fs.mkdirSync(path.dirname(path.join(directory,name)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(directory,name),bytes,{mode:0o600,flag:"wx"});entries[name]={sha256:crypto.createHash("sha256").update(bytes).digest("hex"),bytes:Buffer.byteLength(bytes)};}
  fs.writeFileSync(path.join(directory,"MANIFEST.json"),JSON.stringify({schema:"urn:merge-proof:manifest:1",files:entries},null,2)+"\n",{mode:0o600,flag:"wx"});
}
function read(directory){
  const main=path.join(directory,"bundle.json"),manifestPath=path.join(directory,"MANIFEST.json");
  // Single-file JSON downloads remain supported. A supplied manifest is mandatory to verify.
  if(fs.existsSync(manifestPath)){
    const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));assert(manifest.schema==="urn:merge-proof:manifest:1"&&manifest.files&&manifest.files["bundle.json"],"MANIFEST_INVALID");
    let total=0;
    for(const [name,entry] of Object.entries(manifest.files)){assert(/^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*\.json|keys\/jwks\.json)$/.test(name),"MANIFEST_PATH_INVALID");const file=path.join(directory,name),stat=fs.lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink(),"MANIFEST_PATH_INVALID");total+=stat.size;assert(total<=10*1024*1024,"BUNDLE_SIZE_LIMIT");const bytes=fs.readFileSync(file);assert(bytes.length===entry.bytes&&crypto.createHash("sha256").update(bytes).digest("hex")===entry.sha256,"MANIFEST_DIGEST_MISMATCH");}
    const bundle=JSON.parse(fs.readFileSync(main,"utf8"));
    for(const [name,value] of Object.entries(components(bundle)))assert(manifest.files[name]&&hash(JSON.parse(fs.readFileSync(path.join(directory,name),"utf8")))===hash(value),"MANIFEST_COMPONENT_MISMATCH");return bundle;
  }
  assert(fs.statSync(main).size<=5*1024*1024,"BUNDLE_SIZE_LIMIT");return JSON.parse(fs.readFileSync(main,"utf8"));
}
module.exports={create,verify,replay,write,read,pae,codeDigest,verifySignature,verifyLanding,attachLandings};
