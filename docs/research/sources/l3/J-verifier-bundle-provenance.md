# J — Open verifier, portable proof bundle, transparency, reproducible verdicts, and the receipt→provenance interface

Research date: 2026-09-19. Method: read the receipt schema (`github/receipt.schema.json`, `$id urn:merge-proof:github-receipt:2`), the canonical hash (`github/common.js`), the pure proof logic (`github/proof.js`, `rules.js`, `actors.js`, `setup.js`, `local-evidence.js`, `src/analyze.js`), the example receipt, prior research F and 06; read the in-toto Statement/DSSE/SVR/VSA specs, SLSA `source-requirements.md`, `verification_summary.md`, `build-provenance.md`, `rekor-tiles` README/CLIENTS, `actions/attest` README and the `github/docs` retention reusables directly from their source repositories (slsa.dev, in-toto.io, docs.sigstore.dev, docs.github.com were blocked). A zero-dependency prototype verifier was written and run at `scratchpad/l3/verifier/` (`sign.js`, `verify.js`, `crosscheck.js`, `pure/`, `RUN.log`). No repository file was modified and no network call was made beyond fetching public spec text.

**Headline.** Every claim in a Merge-Proof receipt falls into one of three buckets: offline-verifiable (signature, digests, internal and proof-graph consistency, git relationships when objects are supplied), online-re-verifiable (GitHub can be re-read — but only within retention windows that GitHub is about to shorten sharply), and trust-dependent (that GitHub served those responses, and that they were true). The prototype shows the whole offline bucket is implementable in ~250 lines of Node with `node:crypto`: signature over the DSSE PAE, receipt digest as a Statement subject, fingerprint recomputation, internal consistency checks, and a full re-run of `prove()` from the stored `evidence` block that reproduces the stored `verdict`, `gaps`, and 15/15 body fields on the example receipt and 8/8 mutated fixtures. The one wrinkle found is real: the example receipt predates `summary.queueStage`, so a byte-strict comparison differs on a `null`-vs-absent field — schema evolution must be handled explicitly (Part 2). Recommendation for transparency: LATER, with an honest intermediate (Part 3); reproducibility: "re-derive from recorded observations" is 100 %, "re-observe and re-prove" is not reproducible by design (Part 4); provenance interface: reference the receipt by `merge-proof://receipt/<id>` + sha256 in `resolvedDependencies[]`, summarise with SVR, and let the customer's own VSA carry `ORG_SOURCE_MERGEPROOF_VERIFIED` (Part 5).

---

## PART 1 — Open verifier

### 1.1 What the receipt contains (fields that matter to a verifier)

From `receipt.schema.json` and `proof.js`:

- `schemaVersion` (const 2), `policy` (const `github-exact-state-v1`), `receiptId` (uuid, random — not derivable), `issuedAt` (= `evidence.observedAt`), `tool.version` (from `package.json`), `verdict` ∈ {VERIFIED, NOT_PROVEN, FAIL}.
- `identity`: repository, repositoryId, visibility, authorization, pr, headSha, baseSha, headRef, baseRef, plus unschema'd extras (`mergeCommitSha`, `authorId`, `prState`, `merged`, `analysisMode`, `githubMergeState`…).
- `fingerprint` = `sha256(JSON.stringify(canonical(evidence − {startedAt, observedAt, source, consistency})))` (`proof.js fingerprint()`; `canonical` = recursive key sort, `common.js`).
- `summary`: `ci` (target, state, required[] rows with `acceptanceSha`, `checkId`, `executionRecorded`, `workflowJobs[]`, `observedCheck`), `approval` (observed[], current[] rows `{id, reviewer, sha}`, required), `remote`, `rules` (checks[], approvals, strict, lastPush, codeOwners, mergeQueue, unsupported[]), `target`, `actors`, `gate`, `queueStage`.
- `gaps[]` (string codes), `local` (the `src/analyze.js` result computed from `evidence.git`), `evidence` (the projected API observations: identity, rules{classic,active}, git, target, remote, checks, statuses, execution, reviews, actors, consistency, observedAt), `notChecked[]`, `limitations[]`, `next`, `freshness` (explicitly "current only at the recorded observation").

### 1.2 Claim classification table

| # | Claim | Class | Receipt fields involved | How a verifier checks it |
|---|-------|-------|-------------------------|--------------------------|
| O1 | The envelope was signed by a Merge-Proof key | **Offline** | `envelope.dsse.json` (`payloadType`, `payload`, `signatures[{keyid,sig}]`), `keys/jwks.json` | Rebuild DSSE PAE `"DSSEv1" SP len(type) SP type SP len(body) SP body`; ES256 verify with the JWK selected by `keyid` (hint only, never a security decision per DSSE spec). |
| O2 | The receipt JSON I hold is the one that was signed | **Offline** | `fingerprint`-style canonical sha256 of the whole receipt; Statement `subject[name=receipt].digest.sha256`; `predicate` | `sha256(canonical(receipt)) == subject.receipt.sha256 == sha256(canonical(predicate))`. |
| O3 | The receipt is about these commits | **Offline** | `identity.headSha/baseSha`, `summary.target.value.sha`; Statement subjects `head/base/target` (`gitCommit` digests) | Subjects equal identity fields. Consumer additionally matches subjects against the commit it cares about. |
| O4 | `fingerprint` is the digest of `evidence` | **Offline** | `fingerprint`, `evidence` | Recompute `fingerprint(evidence)`. |
| O5 | Internal consistency: every gap is grounded | **Offline** | `gaps[]` ↔ `summary.*`, `evidence.*`, `local.findings`, `identity.prState/merged`, `evidence.consistency` | Map gap code → field path(s) (table in `verify.js GAP_GROUNDS`); each ground exists. |
| O6 | Every required-check row is bound to the target or head | **Offline** | `summary.ci.required[].acceptanceSha/observedCheck.sha/workflowJobs[].sha,runSha`, `summary.target.value.sha`, `identity.headSha`, `evidence.checks[].id`, `summary.rules.checks[]` | `acceptanceSha ∈ {target, head}`; if `executionRecorded`, observed check and every job carry `sha == runSha == target`; `checkId` exists in `evidence.checks`; rule exists in `summary.rules.checks`. |
| O7 | Every counted approval references head and an observed review by a non-author | **Offline** | `summary.approval.current[].{id,sha}`, `identity.headSha`, `identity.authorId`, `evidence.reviews[].{id,userId,sha}` | Row sha == head; row id present in `evidence.reviews`; `userId != authorId`. |
| O8 | Target binding | **Offline** | `summary.target`, `evidence.target`, `identity` | `target.headSha == identity.headSha`, `target.baseSha == identity.baseSha`, summary target == evidence target. |
| O9 | Verdict is a pure function of the observations (proof-graph consistency) | **Offline** | `evidence` (input); `verdict`, `gaps`, `summary`, `local`, `freshness`, `notChecked`, `next`, `limitations` (outputs); `policy`, `tool.version`, `summary.gate.appId` (parameters) | Re-run `prove(evidence, {appId, toolVersion, receiptId})` with the pure logic and compare every output field (null-tolerant). |
| O10 | Verdict/gap invariants | **Offline** | `verdict`, `gaps`, `local.verdict` | VERIFIED ⇒ gaps empty; non-VERIFIED ⇒ gaps non-empty or local FAIL; CI PROVEN ⇒ ≥1 required row. |
| O11 | Git object relationships | **Offline, conditional** (needs `objects.pack`) | `identity.headSha/baseSha`, `evidence.git.value.mergeBase/candidateFiles/baseFiles/baseAdvanceCommits`, `summary.target.value.{kind,sha}` | Parse commit objects: head and base exist; merge-base is an ancestor of both; `baseAdvanceCommits == count(mergeBase..base)`; for `PR_TEST_MERGE`/`MERGE_GROUP` target: target's parents ⊇ {head-or-candidate, base-or-group-parent}; for `LANDED_TWO_PARENT_MERGE`: merge commit parents = {base, head}; `candidateFiles == diff-tree(mergeBase, head)` paths. |
| O12 | Expected tree | **Offline, conditional** (objects) | `summary.target.value.sha`, head/base trees | Recompute a three-way merge tree of head onto base at mergeBase (git merge-ort semantics, options recorded in `policy.json`) and compare to target commit's tree. Only meaningful for `PR_TEST_MERGE`/`MERGE_GROUP`; conflicts ⇒ "not computable", not "mismatch". |
| O13 | Transparency inclusion | **Offline, conditional** (needs `tlog.json` + log key) | `tlog.json` (`logIndex`, `logId`, `inclusionProof{hashes,rootHash,treeSize,checkpoint}`, `canonicalizedBody`), envelope | RFC 6962 leaf hash of `canonicalizedBody`, fold `hashes` to `rootHash`, root equals the signed checkpoint root, checkpoint signature verifies with the log's public key (from the Sigstore trusted root, pinned in the bundle). Proves "this envelope hash existed in the log at tree size N", i.e. non-backdating relative to the checkpoint time. |
| N1 | The refs still point where recorded | **Online** | `identity.headSha/baseSha/headRef/baseRef`, `summary.remote.value.observedSha` | `GET /repos/{r}/git/ref/heads/{ref}` — after merge the head branch is usually deleted; base has moved. Divergence is expected and is *not* contradiction: compare to `evidence.remote` at `observedAt`, not to now. |
| N2 | Check runs exist as recorded | **Online, retention-bound** | `evidence.checks[].{id,sha,status,conclusion,appId,completedAt}`, `summary.ci.required[].checkId` | `GET /repos/{r}/check-runs/{id}` and `/commits/{sha}/check-runs`. Today retained 400+ days; **from 2026-10-01 GitHub applies the Actions retention policy (default 90 days, max 90 public / 400 private) to checks, workflow runs and commit statuses** (`github/docs` reusable `about-artifact-log-retention.md`, changelog 2026-07-17). |
| N3 | Workflow run/job/step records | **Online, retention-bound** | `evidence.execution[].{runId,jobId,attempt,runSha,steps[]}` | `GET /repos/{r}/actions/runs/{id}`, `/jobs/{id}`. Logs/artifacts 90 days default; the run/job metadata joins the same policy on 2026-10-01. |
| N4 | Reviews as recorded | **Online** | `evidence.reviews[].{id,userId,state,sha,submittedAt}` | `GET /repos/{r}/pulls/{n}/reviews/{id}`. Reviews persist with the PR; `writePermission` at observation cannot be re-read (permission is current-state only). |
| N5 | Rules as recorded | **Online, weakly** | `evidence.rules.classic`, `evidence.rules.active` | `GET /repos/{r}/rules/branches/{b}` returns *current* rules; ruleset history is Administration:write and ~180 days; rule suites ~30 days (research 01). Divergence is expected after edits; agreement is only weak corroboration. |
| N6 | Test-merge / merge-group commit | **Online, ephemeral** | `summary.target.value.sha` (`PR_TEST_MERGE`, `MERGE_GROUP`) | `refs/pull/{n}/merge` is regenerated on any push and gone after merge; merge-group refs are deleted when the group leaves the queue. Only the SHA remains; the object may be unreachable. Hence the objects.pack option (O11). |
| N7 | Commits and authorship | **Online** | `evidence.actors.value.commits[]`, `identity.author` | `GET /repos/{r}/commits/{sha}` works as long as the object is reachable from any ref (merged commits: yes; squash-merged branch heads: often garbage-collected after branch deletion). |
| T1 | The recorded observations are what GitHub served at `observedAt` | **Trust-dependent** | all of `evidence`, `evidence.observedAt`, `evidence.consistency` | Rests on the Merge-Proof signing key and operational integrity; a transparency log bounds *when* the claim was made, not *whether it was true*. Independent corroboration only via the customer's own audit log / webhook archive. |
| T2 | GitHub's data was truthful and complete | **Trust-dependent** | everything | Source-tool's own design lists "trust in GitHub APIs to return trustworthy information" as an assumption; Merge-Proof inherits it and says so in `limitations[]`. |
| T3 | Unavailable policy facts | **Trust-dependent / unknowable** | `summary.rules.unsupported[]`, `summary.rules.lastPush/codeOwners`, bypass actors (never readable with read tokens), exempt actors, `notChecked[]` | Cannot be verified by anyone from the receipt; the receipt's honesty is that it *names* them. |
| T4 | `writePermission` at observation | **Trust-dependent** | `evidence.reviews[].writePermission` | Permission is a current-state API; the historical value is only in the receipt. |

### 1.3 Verifier specification

**Inputs.** A bundle directory (Part 2). Optional: `--online` with a GitHub token or anonymous access; optional `--objects objects.pack`; optional Sigstore trusted root for O13.

**Procedure (order matters; each stage gates the next).**

1. *Version gate.* `receipt.schemaVersion`, `receipt.policy`, `statement.predicateType`, `envelope.payloadType` must be in the verifier's compatibility table (Part 2.4). Otherwise **UNSUPPORTED** — never "invalid".
2. *Signature (O1).* No valid signature with any bundled/known key ⇒ **SIGNATURE_INVALID**; stop. Also check the key's validity window (`mp:nbf`/`mp:exp` in the JWK) against `issuedAt`.
3. *Binding (O2–O4).* Receipt digest is a subject; predicate equals receipt; head/base/target subjects match; fingerprint recomputes.
4. *Internal consistency (O5–O8, O10).*
5. *Proof-graph consistency (O9).* Re-run pure `prove()` on `evidence` with the parameters from `policy.json`; compare `verdict`, `gaps` (as sets), and each body field with null-vs-absent tolerance; report byte-strict differences as notes, not findings.
6. *Optional offline (O11–O13)* when the inputs exist; absence is a note, never a finding.
7. Any finding in 3–6 ⇒ **INCONSISTENT**; else **CONSISTENT_OFFLINE**.
8. *Optional online.* Re-read N1–N7. Every field is compared to `evidence`, and each comparison resolves to one of: `MATCH`, `RETENTION_EXPIRED` (404/410 on an id older than the applicable window), `EXPECTED_CHANGE` (refs moved after merge, rules edited, test-merge ref gone), `DIVERGED` (a *retained, immutable* record disagrees: e.g. check run `{id}` exists with a different `head_sha` or `conclusion`, review `{id}` has a different `commit_id` or user). Only `DIVERGED` produces **REVERIFICATION_DIVERGED**; the rest yield **CONSISTENT_AND_REVERIFIED_ONLINE** with a coverage report (`n matched / m expired / k expected-change`).

**Exit semantics.**

| Status | Exit | Meaning |
|---|---|---|
| `SIGNATURE_INVALID` | 2 | The envelope is not a Merge-Proof statement (or key unknown). Nothing else is evaluated. |
| `UNSUPPORTED` | 4 | Schema/policy/predicate version outside this verifier's table. Get a newer verifier; do not conclude anything. |
| `INCONSISTENT` | 3 | Signed statement is internally contradictory or the stored verdict does not follow from the stored evidence. Treat the receipt as void. |
| `CONSISTENT_OFFLINE` | 0 | Everything derivable from the bundle holds. Says nothing about whether GitHub's data was true (T1–T4). |
| `CONSISTENT_AND_REVERIFIED_ONLINE` | 0 (+ report) | Offline consistent and every retained immutable GitHub record agrees. Coverage may be partial after retention. |
| `REVERIFICATION_DIVERGED` | 5 | A retained immutable record contradicts the receipt: either GitHub rewrote history, or the receipt is false. Escalate; this is the only status that impeaches T1. |

The verdict word (`VERIFIED/NOT_PROVEN/FAIL`) is **never re-issued** by the verifier; it reports whether the *recorded* verdict is consistent. A 2031 verifier that recomputes `NOT_PROVEN` from 2026 evidence confirms the receipt, it does not re-prove the PR.

### 1.4 Prototype results (`scratchpad/l3/verifier/`)

Built: `sign.js` (generate P-256 key, build Statement with subjects head/base/target/receipt, DSSE-sign over PAE with DER ECDSA, write bundle) and `verify.js` (stages 1–5 above plus notes for 6), `pure/` = verbatim copies of `common.js`, `rules.js`, `actors.js`, `src/rules.js`, and `proof.js`/`local-evidence.js`/`setup.js`/`src/analyze.js` with three I/O edges parameterised: `require("../package.json").version` → `options.toolVersion`, `randomUUID()` → `options.receiptId`, and `require("./git")` dropped (never used when `evidenceGit` is supplied). `wording.js` reduced to `next()`; `check.js` reduced to the `NAME` constant.

Runs (`RUN.log`):

- Clean bundle from `github/examples/receipt.json`: signature OK; receipt digest `187661b4…` is the `receipt` subject and equals the predicate hash; fingerprint recomputed equals stored `f0963a26…`; `prove()` re-run yields `NOT_PROVEN`, gaps `["CURRENT_STATE_EXECUTION_NOT_PROVEN"]`, **15/15 body fields reproduced** under null-tolerant comparison → `CONSISTENT_OFFLINE`, exit 0. Byte-strict comparison differs only in `summary` because the recomputed body has `queueStage: null` and the fixture (older) lacks the field. The unsigned extra key `example: "SYNTHETIC_FIXTURE_NOT_CUSTOMER_EVIDENCE"` is reported as an extra field (it is inside the signed predicate, so it is covered by the signature; it is simply not something `prove()` emits).
- `verdict` edited to VERIFIED: caught four independent ways (subject digest, predicate digest, `VERIFIED_WITH_GAPS`, `VERDICT_NOT_REPRODUCED`) → `INCONSISTENT`, exit 3.
- One byte flipped in the signature → `SIGNATURE_INVALID`, exit 2.
- Evidence edited (review `sha` changed) with the signed envelope left intact: subject mismatch, fingerprint mismatch, and the re-run now adds `INSUFFICIENT_CURRENT_HUMAN_APPROVAL` → `INCONSISTENT`. This demonstrates that even *without* the signature the proof-graph check detects evidence/verdict drift.
- `crosscheck.js`: repository's real `prove()` versus the pure copy on the test fixture plus 7 mutations (executed success, MERGE_GROUP target with selection, no reviews, rules unavailable, git unavailable, changed-during-collection, self-rule bound to appId 777): **8/8 byte-identical receipts** given the same `receiptId`, `toolVersion`, `appId`.

What did *not* work / was not attempted: O11–O13 (no git objects or log entry in a fixture; the fixture SHAs are synthetic `aaaa…`), online mode (read-only research session; also the fixture repo `fixture/public` does not exist). Bundle size for this receipt: 80 KB on disk, 43 KB of JSON, of which the receipt appears three times (receipt.json, statement predicate, base64 envelope payload) — see Part 2 on de-duplication.

---

## PART 2 — Minimal portable proof bundle

### 2.1 Layout

```
mp-receipt-<receiptId>/
  MANIFEST.json            essential  what is here, bundle format version, sha256 of every file
  receipt.json             essential  schema v2 body, canonical form (sorted keys), one line
  statement.intoto.json    essential* in-toto Statement v1; predicate = receipt (byte-equal after canonicalisation)
  envelope.dsse.json       essential  DSSE v1 {payloadType, payload(b64 of canonical statement), signatures[]}
  keys/jwks.json           essential  the public key(s) with kid, alg ES256, mp:nbf / mp:exp
  policy.json              essential  the evidence-policy record (2.2)
  verifier-version.txt     essential  verifier build that produced/validated the bundle + compatibility line
  tlog.json                optional   Sigstore TransparencyLogEntry (+ pinned log public key, shard id)
  observations/            optional   raw projected observations, or POINTER.txt into receipt.json#/evidence
  objects.pack             optional   git pack with head, base, mergeBase, target commits + trees (no blobs needed for O11; blobs needed for O12)
  README.txt               optional   one paragraph: what this proves, what it does not, how to verify
```

`*` `statement.intoto.json` is derivable from `envelope.dsse.json` (`payload` base64-decoded) and could be dropped; keep it for human readability at ~17 KB. Conversely `receipt.json` is derivable from the statement's `predicate`; keep it because it is what `--check-claims`-style tools hash. The bundle is therefore triple-redundant on the receipt body by design; the MANIFEST hash ties them and the verifier cross-checks all three (O2).

### 2.2 `policy.json` — the evidence policy version

`prove()` is not parameterised by a policy document; the policy is the code. `policy.json` records the parameters and constants a re-implementer needs so that a 2031 verifier can *evaluate the same policy* rather than "whatever the code did":

```json
{
  "policy": "github-exact-state-v1",
  "schemaVersion": 2,
  "predicateType": "https://merge-proof.ohcaygo.com/attestation/receipt/v2",
  "toolVersion": "0.1.0",
  "pureLogicDigest": { "sha256": "<sha256 of the concatenated pure modules used>" },
  "appId": 123456,
  "requiredCheckContextName": "Merge Proof exact-state receipt",
  "supportedRuleTypes": ["required_status_checks","pull_request","merge_queue","deletion","non_fast_forward","creation"],
  "classicFields": ["required_status_checks","required_pull_request_reviews","required_conversation_resolution","required_signatures","required_linear_history"],
  "acceptedConclusions": ["success","neutral","skipped"],
  "executionConclusions": ["success"],
  "approvalStatesConsidered": ["APPROVED","DISMISSED","CHANGES_REQUESTED"],
  "approvalEligibility": ["userType=User","userId!=authorId","writePermission=true","sha=identity.headSha"],
  "targetKinds": ["HEAD_CONTAINS_CURRENT_BASE","PR_TEST_MERGE","MERGE_GROUP","LANDED_TWO_PARENT_MERGE"],
  "localAnalysis": { "staleCommits": 100, "staleDays": 30, "protectedCategories": "<digest of src/rules.js tables>" },
  "gitSemantics": { "mergeStrategy": "github-test-merge (server side)", "note": "target trees are GitHub-computed; O12 recomputation uses git merge-ort defaults" },
  "githubApiVersion": "2022-11-28",
  "notChecked": ["CODE_CORRECTNESS","SECURITY","WORKFLOW_CHECKOUT_CONTENTS","SCOPE_CREEP_VS_DECLARED_SCOPE","FUTURE_REMOTE_RETENTION","WHICH_TOOL_OR_MODEL_PRODUCED_THE_CODE"]
}
```

`appId` matters: `ciEvidence()` and `gate()` treat a required check named `Merge Proof exact-state receipt` as self-reference only when its `app_id` equals the configured App id (`setup.js selfRule`). Without it, a re-run can differ in `summary.ci.selfReference`, `summary.gate`, and thereby in `gaps` (`NO_REQUIRED_VALIDATION_CONFIGURED`). The receipt already exposes it as `summary.gate.appId`; `policy.json` makes it explicit.

### 2.3 Essential vs optional, and size budget

| File | Class | Typical size | Why |
|---|---|---|---|
| receipt.json | essential | 5–40 KB (grows with checks × jobs × steps) | the claim |
| envelope.dsse.json | essential | receipt × 1.4 | the signature |
| statement.intoto.json | essential-derivable | receipt × 1.1 | subjects + predicateType in the clear |
| keys/jwks.json | essential | < 1 KB | offline key; verifiers should *also* cross-check against the published JWKS and the copy in the public repo |
| policy.json | essential | 1–2 KB | parameters not in the receipt |
| verifier-version.txt / MANIFEST.json | essential | < 2 KB | compatibility + integrity of the bundle itself |
| tlog.json | optional | 2–4 KB | non-backdating proof; only meaningful with the log key |
| observations/ | optional | 0 (pointer) or = evidence | already inside receipt.json#/evidence; a separate copy only when the raw (un-projected) API bodies are retained, which they currently are not |
| objects.pack | optional | 2–50 KB commits+trees only; MBs with blobs | O11/O12; pack only commits and trees; blobs only when tree recomputation is wanted |
| README.txt | optional | 1 KB | human context |

Budget: **≤ 256 KB without objects**, typically 50–120 KB; **≤ 5 MB with objects.pack** (commits+trees for four commits are tiny; a full-blob pack is the exception and should be an opt-in flag). Anything larger indicates a receipt carrying step-level workflow data for large matrices and should trigger projection (keep `steps.length` and the aggregate booleans, drop per-step timestamps beyond the first successful one) — a schema v3 consideration.

### 2.4 Schema evolution over five years

Three independently versioned things, each with its own field:

1. **Receipt schema** — `schemaVersion` (2) and the `$id urn:merge-proof:github-receipt:2`. Rule: additive fields within a major (the `queueStage` case); any removal/rename/semantic change ⇒ `schemaVersion: 3` and `predicateType …/v3`. Publish `receipt.schema.v2.json` permanently at a stable URL and inside the public repo; a verifier ships every schema it supports.
2. **Evidence policy** — `policy` string (`github-exact-state-v1`). Rule: any change to what counts (conclusions, eligibility, self-reference, target selection) ⇒ `github-exact-state-v2`. The pure logic for each policy version is frozen as a module (`pure/github-exact-state-v1/`) and never edited, only superseded; `policy.json.pureLogicDigest` pins it.
3. **Verifier** — `verifier-version.txt` and a compatibility table shipped with the verifier:

| verifier | receipt schema | policy | predicateType | statement | DSSE | tlog format |
|---|---|---|---|---|---|---|
| 0.1 (2026) | 2 | github-exact-state-v1 | …/receipt/v2 | in-toto Statement/v1 | DSSE v1 | Sigstore TransparencyLogEntry (rekor v2) |
| 0.x (future) | 2, 3 | v1, v2 | v2, v3 | Statement/v1 | DSSE v1 | + whatever rekor v3 emits |

The null-vs-absent lesson from the prototype becomes a written rule: **verifiers compare bodies after dropping `null` and `undefined` members; producers never change the meaning of an existing field from absent to non-null.**

Cryptographic agility: keys are P-256/ES256 today; the JWK carries `alg`, and `kid` = base64url(sha256(SPKI DER)). Keys are never removed from the published JWKS; each carries `mp:nbf`/`mp:exp` so a 2031 verifier can check `issuedAt` was inside the key's validity window (the prototype does this). If a key is ever compromised, the JWKS gets `mp:revoked` with a date, and receipts issued after it fail; receipts before it survive only if they are in the transparency log (this is the concrete argument for Part 3).

### 2.5 What must NOT be in the bundle

- Tokens, installation ids with secrets, webhook secrets, private keys (the prototype writes one for demo only, outside the bundle and clearly named).
- Patches/diffs, file contents, workflow logs, review bodies, comments, commit messages. The receipt carries paths (`evidence.git.value.candidateFiles`) and logins; that is already the maximum for a private repository. Paths are policy-relevant (protected boundaries) and stay; nothing else about content enters.
- Un-projected raw API responses (they contain avatar URLs, emails in some commit objects, node ids, rate-limit headers) — the projection in `collect.js` is the privacy boundary; keep it that way.
- Any *currentness* result. `freshness` inside the receipt is a statement about `observedAt` only; the live recheck (`proof.js freshness()`) is unsigned by design and must not be bundled as if it were evidence.
- The `example` marker on fixtures must never appear on customer receipts; the verifier should treat `example` present as a hard `INCONSISTENT` outside test mode (not done in the prototype — noted).

### 2.6 How a verifier in 2031 validates a 2026 bundle

1. Reads `MANIFEST.json`, confirms file hashes.
2. Reads `verifier-version.txt`: `schema=2 policy=github-exact-state-v1 predicateType=…/v2`. Its table says supported.
3. Verifies the DSSE signature with the JWK in `keys/`, then cross-checks that `kid` appears in the *published* key history (the JWKS mirrored in the public repo's git history — five-year-old commits are still there — and, if the domain is dead, in the tlog checkpoint's signed content if the key was logged there). Checks `issuedAt` within `mp:nbf..mp:exp`.
4. Binds receipt ↔ statement ↔ subjects.
5. Loads the frozen `pure/github-exact-state-v1` module, re-runs `prove()` with `policy.json` parameters, and confirms verdict/gaps/body under the null-tolerant rule.
6. If `tlog.json` is present, verifies the inclusion proof against the checkpoint and the pinned log key (the shard `log2025-1` will be long inactive, but inactive shard keys remain in the Sigstore trusted root, and the bundle pins a copy).
7. Does *not* contact GitHub; by 2031 checks, runs and statuses from 2026 are gone under the 90-day default retention that starts 2026-10-01 (400 days max for private repos). The receipt is the only surviving record of what the check runs said. This is exactly why the bundle exists.

Result: `CONSISTENT_OFFLINE` with the explicit caveat that the T-class claims rest on Merge-Proof's 2026 key and on GitHub's 2026 data.

---

## PART 3 — Transparency logging: now, later, or enterprise

### 3.1 What Rekor inclusion adds

- **Non-backdating.** The log entry carries a signed checkpoint at tree size N; a receipt cannot be minted "as of" an earlier date after the fact. With Rekor v2 the entry stores `sha256(PAE)`, the signature and the public key (hashedrekord) or the payload hash + signatures (dsse) — no payload, no repository name, no SHAs (`rekor-tiles CLIENTS.md`; F §2.2).
- **Third-party monitoring.** Anyone can watch for entries under Merge-Proof's key; an unexpected volume, or an entry after a claimed key-retirement date, is detectable without Merge-Proof's cooperation. This is the only mechanism by which a *compromised or dishonest Merge-Proof* becomes detectable by the customer.
- **Key-compromise survivability.** Receipts logged before a compromise date remain distinguishable from forgeries produced afterwards (Part 2.4).

### 3.2 What it costs

- **Shard rotation.** The community instance changes URL roughly every 6 months ("we 'shard' the log… advise against hardcoding this URL", `rekor-tiles` README); clients must resolve the active shard from the TUF SigningConfig and keep inactive-shard keys for verification. That is a runtime dependency on Sigstore TUF plus a yearly-ish operational chore.
- **Public entries for private repositories.** Entry bodies are hashes and a key, so no repository data leaks; but *existence and timing* of an entry are public. Salting is unnecessary for content, and cannot hide count/timing anyway. For most customers this is acceptable; for some (regulated, air-gapped) it is a hard no — hence ENTERPRISE below.
- **Dependency and SLO.** Public-good Rekor v2 is 99.5 % SLO with no contract; a log outage must not block receipt issuance (log asynchronously, record `tlog: PENDING`, backfill).
- **Engineering.** F estimated ~2 weeks including signing; the log part is a few days plus the shard-tracking runbook. Small but not zero for a product whose first-year buyers are unlikely to check it.

### 3.3 Who would check it in the first year

Realistically: nobody outside Merge-Proof and a security reviewer during procurement. The customers who would run `verify.js --tlog` in year one are the same ones who would demand a private log. The value in year one is *sales-facing* (a credible answer to "how do I know you didn't fabricate this later?") and *insurance* (key-compromise survivability), not operational.

### 3.4 The honest intermediate: a private append-only log with a published daily root

A Merge-Proof-operated Merkle log (any tile-based implementation, or a plain hash chain over `sha256(PAE)` entries) whose **daily root hash and tree size are committed to the public repository** (`transparency/roots/2026-09-19.txt`, signed) gives:

- non-backdating at day granularity, anchored in GitHub's own commit timestamps and the public repo's history (which a third party can clone and keep);
- no shard rotation, no external SLO, no public per-receipt entries;
- a clear upgrade path: each daily root can itself be logged to Rekor as a single entry, giving public-log non-backdating at 1 entry/day instead of 1 per receipt.

Its honesty condition: state plainly that it is **operator-run** — it detects tampering *after the root is published*, and it does not let a third party monitor per-receipt issuance. Called "operator log with public daily anchor", never "transparency log", in customer-facing text.

### 3.5 Decision

**Recommend: LATER, with the intermediate NOW.**

- NOW: sign receipts (DSSE, published JWKS, key history in the repo) and run the operator log with a public daily root anchored in the public repo. Persist per-receipt `{logIndex, leafHash, dailyRoot, inclusionProof}` in the bundle as `tlog.json` with `"kind": "merge-proof-operator-log/v1"` so the verifier interface does not change later.
- LATER — trigger: any of (a) the first customer whose procurement asks for third-party monitorability or key-compromise survivability in writing; (b) Merge-Proof key rotation/compromise event; (c) issuing more than ~1,000 receipts/month, when the daily anchor's granularity becomes too coarse to be meaningful. Then log each receipt (hashedrekord over the DSSE PAE, self-managed key) to Rekor v2, keep the operator log, and also log the daily root there.
- ENTERPRISE: for customers who reject any public entry, offer *their* log — write the same entries to a customer-hosted tile log or to their evidence vault (Archivista/Kosli, research 06) — and anchor daily roots in their own repository. Same `tlog.json` interface, different `kind`.

Do not make the offline verdict depend on any log: `tlog.json` absent is a note, not a failure (prototype behaviour).

---

## PART 4 — Reproducible verdicts

### 4.1 Two different questions

- **Re-derive:** given the bundle and the verifier version, does `prove(receipt.evidence, params)` produce the recorded `verdict`, `gaps` and body? This is a deterministic computation over a fixed input and **should be 100 % reproducible**. Tested: example receipt (verdict, gaps, 15/15 fields null-tolerant) and 8/8 fixture variants byte-identical against the repository's real `prove()`.
- **Re-observe and re-prove:** re-collect from GitHub now and prove again. **Not reproducible by design**: the receipt is an exact-state claim (`freshness.meaning`: "Current only at the recorded observation"), and the state it describes has been consumed by the merge. Any product claim that a third party can "reproduce the verdict from scratch" would be false; the honest claim is "reproduce the verdict from the recorded observations, and corroborate the observations against whatever GitHub still retains".

### 4.2 Every input to `prove()` that is not in the receipt

Enumerated from `proof.js`, `setup.js`, `local-evidence.js`, `src/analyze.js`, `wording.js`, `actors.js`, `check.js`:

| Input | Where it comes from | In the receipt? | Effect if different | Bundle fix |
|---|---|---|---|---|
| `options.appId` | service configuration (`MERGE_PROOF_APP_ID`) | indirectly: `summary.gate.appId` | self-reference detection flips ⇒ `selfReference`, `gate.required/boundToThisApp`, possibly `NO_REQUIRED_VALIDATION_CONFIGURED` gap ⇒ verdict | `policy.json.appId` (done in prototype) |
| `require("../package.json").version` | build | `tool.version`, `local.tool.version` | text only; hash differs | `policy.json.toolVersion` |
| `randomUUID()` | runtime entropy | `receiptId` | not derivable | inject `receiptId` from the receipt |
| `check.NAME` (`"Merge Proof exact-state receipt"`) | constant in code | no | collision/self rules misdetected | `policy.json.requiredCheckContextName` |
| `wording.next(gaps)`, `limitations[]` text, `actors.LIMITATION`, `setup.UNSUPPORTED_TEXT`, `analyze.js` finding prose | code constants | yes as output, no as input | prose drift changes hashes but not verdict | pin by `pureLogicDigest`; verifiers compare `verdict`+`gaps` strictly and prose null-tolerant or per policy version |
| `src/rules.js` PROTECTED_CATEGORIES / DEFAULT_EXCLUDE_PATTERNS | code constants | no | `PROTECTED_BOUNDARY` finding ⇒ NOT_PROVEN vs VERIFIED | `policy.json.localAnalysis.protectedCategories` digest; frozen module |
| `analyze.js DEFAULTS` (staleCommits 100, staleDays 30) | code constants | no | advisory only (never verdict) | record anyway |
| `.mergeproofignore` | not read in hosted mode (`evidenceGit` ⇒ rules `[]`) | `local.ignoreFile: null` | none hosted | note |
| `Date.parse` semantics for `submittedAt`, `startedAt` | Node runtime | no | edge: malformed timestamps | ISO-8601 only; policy says so |
| `Array.prototype.sort`/`localeCompare` on rule names | Node ICU | no | order of `summary.rules.checks` | canonical hash is key-sorted but arrays are order-sensitive: pin "sort by `localeCompare` under ICU root locale" in policy |
| `structuredClone` | Node ≥ 17 | — | none | verifier requires Node ≥ 18 |

### 4.3 Mutable external state that prevents re-observation

| State | Mutability | Consequence for re-proof |
|---|---|---|
| Check runs / statuses / workflow runs | 400+ days today; **90-day default (max 90 public / 400 private) from 2026-10-01** | after the window, `checks/execution` become UNAVAILABLE ⇒ `CHECK_EVIDENCE_UNAVAILABLE`/NOT_PROVEN on re-proof regardless of history |
| Workflow logs | 90 days default | never used by `prove()`; irrelevant |
| `refs/pull/N/merge`, merge-group refs | regenerated on push, deleted after merge/dequeue | `PR_TEST_MERGE`/`MERGE_GROUP` target unobtainable ⇒ `APPLICABLE_MERGE_STATE_UNAVAILABLE` |
| Head branch | usually deleted after merge | `REMOTE_CANDIDATE_NOT_CONFIRMED` |
| PR state | `open` → `merged`/`closed` | `LIVE_PR_NOT_OPEN` gap by design |
| Rulesets / classic protection | editable any time; history 180 days (admin:write); rule suites ~30 days | re-proof evaluates *today's* rules, not the rules at merge time |
| Reviewer write permission | current-state API | `writePermission` may differ ⇒ approval eligibility changes |
| Actor accounts | renamed, deleted, converted | `login` differs; numeric ids stable |
| Repository | renamed, transferred, deleted, visibility changed | `identity.repositoryId` stable; name not |

Consequence: a re-proof of a merged PR converges to `NOT_PROVEN` with `LIVE_PR_NOT_OPEN` (or the historical `LANDED_TWO_PARENT_MERGE` analysis mode with `HISTORICAL_RULES_AND_APPROVAL_VALIDITY_UNAVAILABLE`), which is correct behaviour and exactly why "re-observe" must not be sold as reproduction.

### 4.4 `verdict-info` record (the buildinfo analogue)

Emitted next to every receipt (and inside the bundle as `verdict-info.json`), listing every input to the verdict so that a re-derivation is fully specified:

```json
{
  "_type": "https://merge-proof.ohcaygo.com/verdict-info/v1",
  "receiptId": "fa418b22-ce91-47ab-9000-4d38acee9659",
  "receiptDigest": { "sha256": "187661b4f6194e9ee6fa5134c80c8bc817b918ff32924f56f31177f9c4d91abe" },
  "evidenceFingerprint": { "sha256": "f0963a26f8e886072ee04fbf400ae805efb05c8b5c8182f2d406d7c9e8b23e79" },
  "policy": { "id": "github-exact-state-v1", "schemaVersion": 2, "predicateType": "https://merge-proof.ohcaygo.com/attestation/receipt/v2" },
  "logic": { "toolVersion": "0.1.0", "pureModules": ["github/proof.js","github/rules.js","github/actors.js","github/setup.js","github/local-evidence.js","src/analyze.js","src/rules.js","github/wording.js#next","github/check.js#NAME"], "pureLogicDigest": { "sha256": "<digest over those files at the release commit>" }, "sourceCommit": "<git sha of merge-proof at release>" },
  "parameters": { "appId": 123456, "requiredCheckContextName": "Merge Proof exact-state receipt", "staleCommits": 100, "staleDays": 30, "acceptedConclusions": ["success","neutral","skipped"] },
  "runtime": { "node": "22.22.2", "icu": "root", "timeSource": "GitHub response timestamps only; wall clock not used in prove()" },
  "observation": { "source": "github-rest", "apiVersion": "2022-11-28", "authorization": "GITHUB_TOKEN", "startedAt": "2026-09-10T12:00:00Z", "observedAt": "2026-09-10T12:00:00Z", "consistency": "STABLE_OBSERVATION", "endpoints": ["GET /repos/{r}/pulls/{n}", "GET /repos/{r}/rules/branches/{b}", "GET /repos/{r}/branches/{b}/protection", "GET /repos/{r}/commits/{sha}/check-runs", "GET /repos/{r}/commits/{sha}/status", "GET /repos/{r}/actions/runs/{id}/jobs", "GET /repos/{r}/pulls/{n}/reviews", "GET /repos/{r}/compare/{base}...{head}", "GET /repos/{r}/git/ref/heads/{ref}"] },
  "reproducibility": { "rederive": "DETERMINISTIC", "reobserve": "NOT_REPRODUCIBLE_BY_DESIGN", "retentionHorizon": { "checks": "2027-09-10 (400d) or 2026-12-09 (90d policy after 2026-10-01)", "testMergeRef": "until next push or merge" } },
  "excluded": ["receiptId (random)", "issuedAt (= observedAt)", "wording (prose)"]
}
```

`verdict-info` is itself covered by the bundle MANIFEST but is *not* a signed subject — it describes the computation, it is not the claim.

---

## PART 5 — Source receipt → build provenance interface

Principle: Merge-Proof produces a **source-side attestation about a commit**; SLSA build provenance, GitHub artifact attestations, VSAs and SVRs are **consumer-side documents that reference it**. Merge-Proof never issues build provenance, never asserts SLSA levels, and never signs anything whose subject is an artifact rather than a commit.

### 5.1 (a) Referencing the receipt from SLSA v1 build provenance

The build (e.g. a GitHub Actions job) already lists the checked-out commit in `resolvedDependencies` (`build-provenance.md`: `uri: "git+https://github.com/org/repo@refs/heads/main", digest: {gitCommit}`). Add the receipt as a second resolved dependency — it is an input the builder fetched and, if compromised, would change the build's trust story:

```json
"buildDefinition": {
  "buildType": "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
  "externalParameters": { "workflow": { "ref": "refs/heads/main", "repository": "https://github.com/org/repo", "path": ".github/workflows/release.yml" } },
  "resolvedDependencies": [
    { "uri": "git+https://github.com/org/repo@refs/heads/main", "digest": { "gitCommit": "cccccccccccccccccccccccccccccccccccccccc" } },
    { "uri": "merge-proof://receipt/fa418b22-ce91-47ab-9000-4d38acee9659",
      "digest": { "sha256": "187661b4f6194e9ee6fa5134c80c8bc817b918ff32924f56f31177f9c4d91abe" },
      "name": "merge-proof-receipt",
      "mediaType": "application/vnd.merge-proof.receipt.v2+json",
      "downloadLocation": "https://merge-proof.ohcaygo.com/r/fa418b22-ce91-47ab-9000-4d38acee9659/bundle.tar",
      "annotations": { "merge-proof.ohcaygo.com/verdict": "VERIFIED", "merge-proof.ohcaygo.com/binding": "landed", "merge-proof.ohcaygo.com/headSha": "aaaa…", "merge-proof.ohcaygo.com/policy": "github-exact-state-v1" } }
  ]
}
```

`resolvedDependencies` entries are in-toto ResourceDescriptors, so `name`, `mediaType`, `downloadLocation` and `annotations` are all spec fields. The URI scheme `merge-proof://receipt/<id>` is stable and resolves via the published route; the digest is the same canonical sha256 that is the Statement's `receipt` subject, so a consumer can fetch the bundle and check O2 directly. Put the *reference* here, never the receipt body (provenance should stay small; the spec says parameter metadata belongs in `resolvedDependencies`, which is what this is). The GitHub-generated provenance from `actions/attest-build-provenance` is not editable, so this belongs in a build that generates its own provenance (slsa-github-generator custom builders, Tekton Chains, etc.) or in a *second* attestation via `actions/attest`:

```yaml
- uses: actions/attest@v3
  with:
    subject-path: dist/app.tar.gz
    predicate-type: https://merge-proof.ohcaygo.com/attestation/receipt-ref/v1
    predicate: |
      {"receipt":{"id":"fa418b22-…","digest":{"sha256":"187661b4…"}},
       "commit":{"gitCommit":"cccc…"},"binding":"landed","verdict":"VERIFIED",
       "policy":"github-exact-state-v1","issuedAt":"2026-09-10T12:00:00Z",
       "bundle":"https://merge-proof.ohcaygo.com/r/fa418b22-…/bundle.tar"}
```

This makes `gh attestation verify dist/app.tar.gz --owner org --predicate-type https://merge-proof.ohcaygo.com/attestation/receipt-ref/v1` succeed only when a receipt-ref attestation signed by the org's workflow exists for that artifact digest; the consumer then follows the ref. The custom predicate is capped at 16 MB and 1024 subjects (`actions/attest` README) — a reference is a few hundred bytes.

### 5.2 (b) VSA carrying the receipt as an input attestation

A VSA (`https://slsa.dev/verification_summary/v1`) is issued by whoever verifies — the org's policy engine or the SCS — not by Merge-Proof. It can list the receipt in `inputAttestations[]` ("MUST contain information on *all* the attestations used to perform verification… each entry MUST contain a `digest` and SHOULD contain a `uri`") and expose the result as an org-defined verified property (`ORG_SOURCE_` prefix is the only prefix the SCS is allowed to accept for org properties, `source-requirements.md` "Protected Named References"):

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "_", "digest": { "gitCommit": "cccccccccccccccccccccccccccccccccccccccc" } }],
  "predicateType": "https://slsa.dev/verification_summary/v1",
  "predicate": {
    "verifier": { "id": "https://example.org/source-policy-verifier/v1", "version": { "merge-proof-verify": "0.1.0" } },
    "timeVerified": "2026-09-10T12:05:00Z",
    "resourceUri": "git+https://github.com/org/repo",
    "policy": { "uri": "https://github.com/org/source-policies/repo.json", "digest": { "sha256": "…" } },
    "inputAttestations": [
      { "uri": "merge-proof://receipt/fa418b22-ce91-47ab-9000-4d38acee9659", "digest": { "sha256": "187661b4f6194e9ee6fa5134c80c8bc817b918ff32924f56f31177f9c4d91abe" } }
    ],
    "verificationResult": "PASSED",
    "verifiedLevels": ["SLSA_SOURCE_LEVEL_2", "ORG_SOURCE_MERGEPROOF_VERIFIED", "ORG_SOURCE_MERGEPROOF_POLICY_GITHUB_EXACT_STATE_V1"],
    "slsaVersion": "1.2"
  }
}
```

Note the subject: the VSA is about the **landed commit** (`cccc…`), while the receipt's subjects are head/base/target; the VSA issuer is the one that bridges them (5.5). `SLSA_SOURCE_LEVEL_n` is the SCS/org claim; Merge-Proof contributes only the `ORG_SOURCE_MERGEPROOF_*` properties, and only via the org's own VSA.

### 5.3 (c) SVR as the Merge-Proof-issued summary

Merge-Proof *can* honestly issue an SVR (`https://in-toto.io/attestation/svr/v0.2`; `verifier.id`, `verifier.policies[]` required even if empty, `timeCreated`, `properties[]`; "The SVR does not include information for reproducing the verification result" — that is what the receipt is for):

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    { "name": "head", "digest": { "gitCommit": "aaaa…" } },
    { "name": "target", "digest": { "gitCommit": "aaaa…" } },
    { "name": "receipt", "digest": { "sha256": "187661b4…" } }
  ],
  "predicateType": "https://in-toto.io/attestation/svr/v0.2",
  "predicate": {
    "verifier": { "id": "https://merge-proof.ohcaygo.com/verifier/github-exact-state-v1",
                  "policies": [{ "uri": "https://merge-proof.ohcaygo.com/policy/github-exact-state-v1", "digest": { "sha256": "<policy.json digest>" } }] },
    "timeCreated": "2026-09-10T12:00:00Z",
    "properties": ["MERGEPROOF_VERIFIED", "MERGEPROOF_REQUIRED_CHECKS_EXECUTED_ON_TARGET", "MERGEPROOF_APPROVAL_ON_HEAD", "MERGEPROOF_REMOTE_CONFIRMED", "MERGEPROOF_NO_APP_OR_BOT_AUTHORSHIP_OBSERVED"]
  }
}
```

Only *passing* properties are listed (spec: "Indicates the passing properties verified"); a NOT_PROVEN receipt yields an SVR with the subset that did hold (e.g. `MERGEPROOF_APPROVAL_ON_HEAD` but no `MERGEPROOF_VERIFIED`), or no SVR at all — never a property that encodes failure. Use a `MERGEPROOF_` prefix, never `SLSA_` or `ORG_SOURCE_`.

### 5.4 (d) Source Track "source provenance" and the contemporaneity question

`source-requirements.md`: source provenance attestations "contain information about how a specific revision was created and how it came to exist on a protected branch"; the SCS "MUST document the format and intent"; they "MUST be created contemporaneously with the branch being updated such that they provide a credible, auditable, record of changes"; "the SCS MUST issue" them (L2+). Two consequences:

1. Merge-Proof is not the SCS, so a receipt is *org-distributed additional evidence* ("Allow organizations to distribute additional attestations related to their technical controls to consumers") that the org's VSA issuer may consume — the source-tool model, where policies live in a public repo and the VSA issuer "MUST understand which entity should issue each provenance attestation type". Merge-Proof documents its format (this is the `predicateType` URI resolving to the schema) and the org registers it in its policy.
2. Which receipt is the source provenance for the landed revision? The **pre-merge receipt** is contemporaneous with the *decision* (issued while the PR is open, subjects head/base/target); the **landed binding** is contemporaneous with the *branch update* (subject: the new tip). The spec's requirement attaches to the branch update, so the artifact that satisfies "contemporaneous with the branch being updated" is a **landed-binding attestation** issued on the `push`/`pull_request.closed(merged)` event that (i) names the new branch tip as subject, (ii) references the pre-merge receipt by digest, (iii) records which relationship holds between the tip and the receipt's target (`tip == target` for merge-queue/merge-commit; `tip.tree == target.tree` for squash when base did not move; `parents(tip) == {base, head}` for a plain merge commit; otherwise `UNBOUND` with the reason), and (iv) is issued within minutes of the update. Shape:

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "refs/heads/main", "digest": { "gitCommit": "cccc…" } }],
  "predicateType": "https://merge-proof.ohcaygo.com/attestation/landed/v1",
  "predicate": {
    "repository": { "id": 1, "name": "org/repo" }, "ref": "refs/heads/main", "prevTip": "bbbb…",
    "pullRequest": 1, "mergedAt": "2026-09-10T12:07:41Z", "mergedBy": { "id": 2, "login": "reviewer", "type": "User" },
    "receipt": { "id": "fa418b22-…", "digest": { "sha256": "187661b4…" }, "verdict": "VERIFIED", "issuedAt": "2026-09-10T12:00:00Z",
                 "target": { "kind": "PR_TEST_MERGE", "sha": "dddd…" } },
    "binding": { "state": "BOUND", "relation": "TIP_EQUALS_TARGET" },
    "rulesAtUpdate": { "state": "AVAILABLE", "digest": { "sha256": "<hash of evidence.rules re-read at landing>" }, "sameAsReceipt": true },
    "controls": [{ "name": "MERGEPROOF_EXACT_STATE_RECEIPT", "receiptPolicy": "github-exact-state-v1" }],
    "observedAt": "2026-09-10T12:08:02Z"
  }
}
```

So: the *pair* is the source provenance; the pre-merge receipt alone is a code-review-style attestation about a candidate, and the landed attestation alone is a thin pointer. Consumers and VSA issuers take the landed attestation's subject and follow the digest.

### 5.5 (e) Consumer verification of the chain

```
artifact digest
  └─ build provenance (SLSA v1, signed by builder)          verify: builder identity, subject == artifact
       └─ resolvedDependencies[gitCommit C]                   C = source commit built
            └─ landed attestation, subject C, signed by MP    verify: MP key, subject == C, binding.state == BOUND
                 └─ receipt digest D  ──────────────────────► bundle: verify.js ⇒ CONSISTENT_OFFLINE
                      └─ verdict VERIFIED, policy v1, gaps [] and receipt.identity.repositoryId == provenance repo
```

Concrete steps: (1) `gh attestation verify` or `slsa-verifier` on the artifact → provenance; (2) extract `gitCommit` C from `resolvedDependencies` (or `externalParameters` + repo); (3) fetch `landed` attestation for C (from the bundle store, or from `refs/merge-proof/attestations` if the org opts into git-notes storage as source-tool does), verify signature and subject; (4) require `binding.state == BOUND`; (5) fetch bundle D, run the open verifier, require `CONSISTENT_OFFLINE` (or better) and `verdict == VERIFIED` under the expected `policy`; (6) require `receipt.identity.repositoryId` equals the repository id the provenance names (names can be re-used after transfer, ids cannot). Steps 3–6 can be packaged as the org's VSA (5.2) so downstream only checks one document.

### 5.6 (f) What Merge-Proof must never claim in this chain

- **Build integrity** — that the artifact was built from C, hermetically, by that builder. That is the builder's provenance and its SLSA Build level.
- **SLSA levels of any track** — `SLSA_BUILD_LEVEL_n`, `SLSA_SOURCE_LEVEL_n` are the builder's/SCS's/org's assertions. Merge-Proof emits `MERGEPROOF_*` (SVR) and, only via the org's VSA, `ORG_SOURCE_MERGEPROOF_*`.
- **Deployment** — that anything ran anywhere.
- **Continuity** — that controls were enforced for every prior revision (Source L3 wording). A receipt is per-change; continuity would need the operator log plus a chain of landed attestations, and is a separate, explicit future claim.
- **Code content properties** — correctness, security, "no AI", scope. Already in `notChecked[]`; the chain must not launder them.
- **Independence from GitHub** — every O-class check is about the receipt's own consistency; T1/T2 remain and `limitations[]` say so.
- **That the artifact's source matches the receipt's head** — only the landed binding relates the built commit to the reviewed candidate; if `binding.state != BOUND` (squash after base moved, rebase merge, manual push), the chain stops there and says so.

---

## Sources (URL — accessed 2026-09-19 — status — confidence)

Repository (read-only):
- `./github/receipt.schema.json`, `common.js`, `proof.js`, `rules.js`, `actors.js`, `setup.js`, `local-evidence.js`, `check.js`, `wording.js`, `collect.js` (target kinds), `src/analyze.js`, `src/rules.js`, `examples/receipt.json`, `test/fixtures.js` — current tree — high.
- `docs/research/sources/l2/F-machine-signing-crossplatform.md` §2.2 (Statement/DSSE/key/Rekor design) and `docs/research/sources/06-attestation-slsa-sigstore.md` — 2026-09-19 — high for design lineage; some items there are marked [snippet].

Specifications (read from source repos because the doc sites were blocked):
- in-toto Statement v1 — https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/statement.md — current — high. Subjects matched purely by digest; `name` informational.
- in-toto envelope / DSSE — https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/envelope.md ; DSSE protocol — https://raw.githubusercontent.com/secure-systems-lab/dsse/master/protocol.md — v1.0 — high. PAE definition; KEYID unauthenticated hint.
- SVR predicate v0.2 — https://raw.githubusercontent.com/in-toto/attestation/main/spec/predicates/svr.md — vetted — high. `verifier.policies` required (may be empty); passing properties only.
- SLSA VSA — https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/verification_summary.md — v1.2 text on main — high. `inputAttestations` optional; if present MUST list all; `verifiedLevels` required.
- SLSA Source requirements — https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/source-requirements.md — v1.2 — high. Source provenance "MUST be created contemporaneously with the branch being updated"; `ORG_SOURCE_` prefix rule; org may distribute additional attestations.
- SLSA build provenance (`resolvedDependencies`, `externalParameters`) — https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/build-provenance.md — v1.2 — high.
- SLSA verifying source — https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/verifying-source.md — v1.2 — medium (used for chain framing only).
- slsa-framework/source-tool README and docs/DESIGN.md — https://github.com/slsa-framework/source-tool — in development — medium (policy-in-public-repo model; "trust GitHub APIs" assumption per prior research 06).
- Rekor v2 (rekor-tiles) README and CLIENTS.md — https://github.com/sigstore/rekor-tiles — GA; shard "approximately every 6 months", URL via TUF SigningConfig; hashedrekord from DSSE PAE — high.
- Sigstore protobuf-specs `sigstore_rekor.proto`, `sigstore_bundle.proto` — https://github.com/sigstore/protobuf-specs — current — medium (TransparencyLogEntry field names for `tlog.json`).
- actions/attest README — https://raw.githubusercontent.com/actions/attest/main/README.md — v3 — high. Custom `predicate-type`/`predicate`/`predicate-path`, ≤1024 subjects, ≤16 MB predicate; private repos use GitHub private Sigstore.
- GitHub docs retention reusable — https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/about-artifact-log-retention.md — current — high. "Starting October 1, 2026, these policies will apply to checks, workflow runs, and commit statuses… Until then… retained for 400+ days"; default 90 days; public max 90, private max 400. Changelog link: https://github.blog/changelog/2026-07-17-actions-retention-will-cover-checks-workflow-runs-and-statuses/ (not fetched; blocked domain) — medium.
- GitHub status checks reference — https://raw.githubusercontent.com/github/docs/main/content/pull-requests/reference/status-checks.md — current — high for `stale` after 14 days; 400-day archive figure via prior research 01/02 — medium.
- Ruleset history 180 days / rule suites ~30 days / test-merge ref behaviour — prior research 01 (`docs/research/sources/01-github-merge-queue-protection.md`) — medium (partly [snippet] there).
- gittuf design document (RSL, attestations in `refs/gittuf/attestations`) — https://raw.githubusercontent.com/gittuf/gittuf/main/docs/design-document.md — current — medium (git-ref storage precedent only).

Prototype evidence: `scratchpad/l3/verifier/RUN.log` (sign, clean verify, tampered verdict, bad signature, edited evidence, 8-variant cross-check) — this session — high.
