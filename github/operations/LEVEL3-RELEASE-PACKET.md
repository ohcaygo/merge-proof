# Level 3 production acceptance packet

**Current authority update (2026-09-20):** Ryan approved the architecture and $110/month ceiling with disposable Object Lock lifecycle acceptance first and second-account functional validation using `thatguyrw-boop`. [Approved preparation and current gates](LEVEL3-PREPARATION.md) supersede the pending-approval language below. Production deployment/cutover, public trust/checkpoint publication, production companion registration and irreversible production retention remain reserved. Implementation/live-validation identities remain separate.

Current product candidate **`9a35a7a2a8491dbec6d05a567ef69ac69a94753f`** updates the scheduled-lab restriction to `ohcaygo-merge-proof-validation-lab/merge-proof-lab-control` on top of `838ed8f`; it includes the optional companion enrollment/UI, lifecycle/currentness, process credential boundary, retained Git, validation-org runner and approved operational preparation. [Exact candidate validation](../validation/enhanced-policy-production-prep-2026-09-20/README.md) separates local/Linux acceptance from provider/production gates. The last accepted live signed queue candidate remains `7953ecdbd849c8afe0379bfec1b4a61133292c62`; it does not confer live status on this new candidate. Documentation commits change neither product identity. Frozen proof-engine digest: `b770fe7f5dac86730095e768e4c3c4b4e1856eae909b3757acfc756069e47b76`.

Administration Read remains the standard installation. The separate explicitly opted-in companion requests Administration Write only for execution-policy reads and rejects administrative mutations before network I/O. Enrollment and integration are now implemented; real companion/provider and EC2 process/IMDS acceptance still require their actual environments. Positive coverage collection remains unimplemented because no qualifying provider aggregate/provenance source is available; it remains NOT_PROVEN.

Ryan approved the architecture and $110/month ceiling in [approved preparation](LEVEL3-PREPARATION.md), then explicitly authorized AWS preparation after authentication, applicable Team Terms/monthly purchase, and an ohcaygo-owned private development companion restricted to the queue lab with Administration Write plus Metadata Read only. Terms were accepted; the Team organization now exists. AWS sign-in remains an execution input. The private development companion has since been created and installed: App `5015754`, installation `163368931`, exactly the approved queue lab, Administration Write plus Metadata Read only. See the [saved installation observation](../validation/enhanced-policy-production-prep-2026-09-20/companion-installation-observation.json). Runtime enrollment and fresh provider acceptance remain NOT_PROVEN. Production deployment/cutover, production companion registration, public trust/checkpoint publication and irreversible production COMPLIANCE retention remain reserved. The [organization acceptance record](../validation/organization-rulesets-2026-09-20/README.md) confirms the Team purchase, scheduled billing correction and actual `9a35a7a` provider tests; second-account positive approval and signed App-delivered organization receipts remain open. No AWS resource or recurring job is claimed created. The [costed recommendation](LEVEL3-RECOMMENDED-PRODUCTION.md) is retained as the basis of the approved choices. Historical decision rows below are superseded by these approvals and the current preparation record.

This packet reuses existing signing, archive, verifier, root publisher, release-preflight and lab runner implementations. Fenced configurations are **owner-fillable drafts**, not installed configuration. `OWNER_*` values are unresolved; commands requiring them must wait. No production secret or lab private key belongs in this document, Git history, bundle or public root.

## Exact decisions needed from Ryan

| Gate | Specific input/decision | Work released by that decision |
| --- | --- | --- |
| Optional Enhanced Policy Proof installation | Private ohcaygo-owned development App 5015754 is installed as 163368931 on only the queue fixture; saved scope and permissions were verified. Production registration is separately reserved. Primary App remains Read. No org Write is included. | Enrollment/currentness/IPC implementation and Linux isolation tests passed on 838ed8f. Complete isolated broker setup and real product enrollment, then earn fresh provider and signed queue acceptance on that exact candidate. |
| Production signer | Existing or approved new AWS account/region, ECC_NIST_P256 SIGN_VERIFY key ARN, runtime role, `kid`, validity window, key administrator and rotation/revocation owner; approval for real signing calls/cost. | Apply narrowly scoped IAM, retrieve/verify public key, perform real adapter and signed-receipt acceptance. No key creation or live KMS call has occurred. |
| Independent portable trust | Authoritative JWKS publication URL plus separately controlled historical mirror/pin distribution, publication owner and approval to publish. | Publish reviewed public keys/history, verify bytes from an independent client, test rotation/revocation with supplied trust. The service's own JWKS endpoint alone is insufficient bootstrap. |
| Public anchoring | Existing or approved new public root-only repository, branch, publisher identity and explicit first-publication authorization. | Publish a reviewed completed-day signed root, independently retrieve and verify it, preserve commit URL/hash. No receipt/evidence upload is authorized by root publication. |
| Host and storage | Linux host/runtime identity, service origin, state/mirror paths, persistent filesystem and backup destination, encryption/access/retention ownership, approved RPO/RTO and capacity alert destination. Approve any costs. | Install tested artifacts, exercise storage/restore/failure handling in that environment and perform hosted acceptance. Local fsync/copy evidence does not close this gate. |
| Integration and deployment | Approve the exact release SHA, destination and controlled smoke repository/installation after implementation and environment acceptance; approve cutover/rollback window. | Normal integration and controlled deployment. No main-branch integration, production credentials or deployment is authorized by this packet. |
| Differential-lab operation | Choose non-production scheduler, credential owner, persistent synthetic fixture set, private evidence retention and internal alert recipient; approve weekly activation. | Install the defined observer job with bounds below. No recurring automation or outgoing notification was created. |
| Provider/plan validation | Supply an existing eligible Team/Enterprise test organization, or approve a specific paid change. Separately identify eligible private/push-rule and Code Quality fixtures. | Validate org-wide enforcement and feature-specific paths. A paid plan does not itself solve missing coverage aggregate/provenance APIs or unknown feature errors. |

The default Read model is already decided; it is not being submitted for another permission decision. Repository selection for the accepted development run is also closed. No production Write request is automatic.

## 1. KMS identity, trust and acceptance

The implemented adapter accepts an exact KMS key ARN and pinned P-256 public key, signs a SHA-256 digest, checks returned key/algorithm and verifies the signature locally. Use an asymmetric signing key and `ECDSA_SHA_256`; AWS documents these capabilities in [key specifications](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) and [Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html).

Proposed **runtime identity policy**, substituted only after owner selection. This grants no key-management operation. A compatible key policy must authorize the chosen runtime role; an account administrator must review both before applying. Use temporary workload credentials through the AWS provider chain, not static access keys in application JSON. [AWS condition keys](https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html) support these Sign restrictions.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "SignMergeProofWithChosenKey",
    "Effect": "Allow",
    "Action": "kms:Sign",
    "Resource": "OWNER_SELECTED_EXACT_KEY_ARN",
    "Condition": {"StringEquals": {
      "kms:SigningAlgorithm": "ECDSA_SHA_256",
      "kms:MessageType": "DIGEST"
    }}
  }]
}
```

A separate key-administration/publication identity retrieves `DescribeKey`/`GetPublicKey` and manages rotation. Match actual key ARN, region, enabled state, key usage, specification and public key fingerprint. Convert the returned DER SubjectPublicKeyInfo to a public JWK using Node `crypto.createPublicKey(...).export({format: 'jwk'})`; reject any `d`. Add owner-approved `kid`, `alg: ES256`, `use: sig`, ISO `nbf` and `exp`, and preserve the original AWS response privately. Do not use a lab key as production trust.

The existing service configuration accepts:

```json
{
  "signing": {
    "provider": "aws-kms",
    "executable": "/usr/local/bin/aws",
    "region": "OWNER_SELECTED_REGION",
    "keyArn": "OWNER_SELECTED_EXACT_KEY_ARN",
    "keyId": "OWNER_SELECTED_KID",
    "jwksPath": "/etc/merge-proof/approved-public-jwks.json"
  }
}
```

After approval, invoke the actual configured adapter with a fresh, locally generated acceptance challenge and verify with the independently pinned key. This is a signer test, **not** a receipt or candidate proof. For example, from the approved exact release checkout:

```sh
node - /etc/merge-proof/app.json <<'NODE'
const fs = require('node:fs'), crypto = require('node:crypto');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const sign = require('./github/signing').configured(config.signing);
if (!sign) throw Error('SIGNER_REQUIRED');
const challenge = Buffer.from(JSON.stringify({purpose: 'KMS_ACCEPTANCE_ONLY', nonce: crypto.randomUUID()}));
sign(challenge).then(signature => {
  const key = sign.keys.keys.find(k => k.kid === signature.keyid);
  if (!crypto.verify('sha256', challenge, crypto.createPublicKey({key, format: 'jwk'}), Buffer.from(signature.sig, 'base64'))) throw Error('SIGNATURE_INVALID');
  console.log(JSON.stringify({state: 'SIGNER_CHALLENGE_VERIFIED', keyId: signature.keyid, challengeSha256: crypto.createHash('sha256').update(challenge).digest('hex')}));
}).catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
NODE
```

Then issue a real service receipt in the separately approved hosted synthetic acceptance and verify its receipt and landed envelopes with independently obtained public trust. Test denied signing/timeouts in the isolated acceptance environment: issuance must refuse, with no unsigned fallback or successful acknowledgment of failed durability. Test unknown/wrong/expired/revoked trust using local copies of public trust files; do not disable a production key to simulate failure. Existing adapter fixtures cover wrong key/algorithm/signature responses; production acceptance must retain actual KMS request evidence and runtime identity privately.

Publish a public JWKS with retained historical keys and a reviewed immutable history/pin record on the approved mirror. Rotation uses a new key and unique `kid`; publish trust before issuance switches. Retain expired keys for verification of receipts issued in their validity window. A revoked key must fail verification when the verifier is given updated trusted keys; offline clients with an old trust file cannot discover revocation. The current verifier checks the supplied trust file; it does not promise automatic revocation discovery, independent signing time, or authentication from bundled keys alone. Checkpoint publication adds a public observation of bytes, not a trusted timestamp authority.

## 2. Runtime identity and deployable configuration

The examples below retain the accepted `7953ecd` baseline for reference; they are not a deployment authorization for the new component candidate. Use an exact, clean checkout of the eventual accepted release. Documentation HEAD is later and will correctly fail `release-preflight` if supplied as that product SHA. Complete Enhanced integration requires replacing every release pin below with its newly accepted SHA. Do not relabel `5fd27e1` or later code as `7953ecd`.

Use the retained static Linux Git artifact, including its required installed layout, HTTPS helper, CA trust and licenses. Tested Git version: `git version 2.50.1`. Core SHA-256 `3d2b9bc579af799be2f88ed81c01cec14e4f469dbf6fef377322c29710e66d2b`; HTTPS helper SHA-256 `f5b324107f840a22e82440e0c1bbeb6687da6f481142d5fec6fbc03085478c23`. Check both against [retained runtime provenance](../validation/final-frontier-l3-2026-09-19/linux-runtime.json). Record the Node/runtime image version/digest on the chosen host; the existing local/CI evidence used Node 24.12.0. Rebuilding Git produces a new artifact requiring validation, not an assumption of identical bytes.

Release-preflight draft (the service needs the same reconstruction/signing blocks in its own private App configuration):

```json
{
  "sourceCommit": "7953ecdbd849c8afe0379bfec1b4a61133292c62",
  "reconstruction": {
    "root": "/var/lib/merge-proof/mirrors",
    "binary": "/opt/merge-proof-git/bin/git",
    "version": "git version 2.50.1",
    "sha256": "3d2b9bc579af799be2f88ed81c01cec14e4f469dbf6fef377322c29710e66d2b"
  },
  "signing": {
    "provider": "aws-kms",
    "executable": "/usr/local/bin/aws",
    "region": "OWNER_SELECTED_REGION",
    "keyArn": "OWNER_SELECTED_EXACT_KEY_ARN",
    "keyId": "OWNER_SELECTED_KID",
    "jwksPath": "/etc/merge-proof/approved-public-jwks.json"
  }
}
```

After host authorization, from that checkout:

```sh
MP_SOURCE_COMMIT=7953ecdbd849c8afe0379bfec1b4a61133292c62 node github/operations/release-preflight.js /etc/merge-proof/release-preflight.json
```

Expected `LOCAL_CONFIGURATION_CHECKED`, all rows PASS. This command checks source/cleanliness, Git hash/version/static Linux properties and signer configuration; it **does not call KMS** or authorize deployment. Save its output separately from real signer/hosted acceptance. Existing server uses `FACTORY_CONFIG`, `MP_GITHUB_APP_CONFIG` and `MP_SOURCE_COMMIT`; hosted proof storage must be separate from factory storage. Reuse approved existing billing configuration without changing billing authority. Resolve service account, secret file ownership, origin, reverse proxy and service-manager configuration against the chosen host before deployment; an example test billing file is not a production configuration.

## 3. Durable storage acceptance

The implementation fsyncs state and immutable archive writes, guards a single writer, and acknowledges signed delivery only after durable save. The active receipt cache is not retention. Required backup set: proof `state.json`, complete `receipt-archive/` including receipt/merge/landing indexes, and operator-log/checkpoint history in state. Back up factory/account state separately where the selected hosting configuration uses it. Keep production credentials outside receipt backups, with their own approved secret recovery process. Retained Git objects support later independent reconstruction; document whether they are backed up or independently retrievable rather than assuming ephemeral provider refs survive.

Proposed operating contract is now concrete in the recommendation: independent encrypted backup copies, 30-day Object Lock, no automatic historical receipt deletion, five-minute backup cycle, daily integrity verification and monthly full restore, 15-minute RPO/4-hour outage RTO acceptance targets. Owner approval is still needed; there is no claimed recovery SLA today. Use a consistent snapshot or a checked atomic-state/immutable-object closure, or quiesce the single writer before copying the complete set. Stop the old writer before starting a restore. A crash may leave `server.lock`; verify the old process is dead and preserve evidence before operator removal. Never run two writers or clear a live lock automatically.

Completed local preparation: [real accepted-receipt restore drill](../validation/final-frontier-l3-2026-09-19/durability-restore-preparation.json). Copied 11 files/454,968 bytes into a separate backup and restore, checked every file hash, opened the restored Store, found the landed SHA index and verified the signed portable chain. The original source and backup remained unchanged. Restored currentness was UNAVAILABLE. The initial drill assembly omitted `receipt` from the artifact bundle and correctly received MALFORMED_BUNDLE; reconstructing the same envelope as `ProofService.portable()` succeeded. No evidence or product code was changed.

Required chosen-host acceptance:

1. Capture a real accepted synthetic receipt and its landed observation, then take the configured backup and restore it to an isolated new volume/instance. Compare hashes and receipt identities, replay signatures/frozen verdict and independently reconstruct content. Record actual backup age and restore time against approved RPO/RTO.
2. Verify archived download and SHA lookup with current authorized access; revoked/wrong-repository access must refuse. Recovered history must not become CURRENT without fresh provider observations.
3. In disposable storage only, exercise interrupted save/restart and capacity/write denial. No acknowledgment before durable persistence; replayed delivery must recover without duplicate receipt inflation. Restore may expose missing recovery evidence as NOT_PROVEN, never invent it.
4. Recheck restart/worker behavior, single-writer lock and alert delivery using the selected service manager/backup system. Record operator-log chain continuity. These host-specific checks remain unexecuted; local tests do not stand in for them.

## 4. Portable trust and anchoring acceptance

Customer verification command after independent key distribution:

```sh
node bin/merge-proof.js verify --bundle /absolute/receipt-bundle --trusted-keys /absolute/independently-approved-jwks.json --git-dir /absolute/retained-bare-repository --git-binary /opt/merge-proof-git/bin/git
```

Expected successful consistency/signature/content verification, with original verdict and limitations preserved. Missing provider history, actual runner checkout, exempt bypasses or atomic currentness at merge remain explicitly unavailable. Add `--online` only with authorized provider access and expect historical movement to be named rather than falsely CURRENT. Never use `--allow-unsigned` for signed production acceptance.

Prepare a completed UTC day's signed checkpoint with the existing `checkpoint.js`. The draft needs absolute `stateFile`, `output`, closed `day` and the approved `signing` block. It outputs `publication: NOT_PUBLISHED`. Current-day roots cannot be passed off as completed days. Actual production preparation waits for owner-authorized credentials and real durable receipts; no fabricated production checkpoint has been created.

Review-only publisher draft:

```json
{
  "authorized": false,
  "repository": "OWNER_SELECTED_PUBLIC_ROOT_REPOSITORY",
  "branch": "OWNER_SELECTED_BRANCH",
  "path": "anchors/OWNER_COMPLETED_UTC_DAY.json",
  "preparedFile": "/absolute/reviewed/completed-day.json",
  "trustedKeysFile": "/absolute/independently-approved-jwks.json"
}
```

After explicit destination/publication approval, substitute concrete values, set `authorized: true`, and run `node github/operations/publish-anchor.js /absolute/approved-publication.json`. Review the complete outgoing artifact first: signed checkpoint/root only; no receipt metadata, raw evidence, workflow content, access token or secret. Record the resulting immutable commit, file SHA-256 and URL. Retrieve the exact commit bytes independently and verify the checkpoint signature/inclusion against supplied trust. Existing identical bytes are idempotent; changed bytes at the same day/path must refuse. The publisher checks public ownership/admin status; that check is not authorization to choose a destination. The verifier's operator inclusion result still reports external anchoring NOT_PROVEN; keep the independently retrieved public observation as separate acceptance evidence rather than claiming automatic anchor verification is shipped.

## 5. Hosted deployment acceptance and rollback

Order: complete the selected candidate's implementation/regressions and independent review where required; approve its exact artifact; pass chosen-host preflight/storage/signer/trust preparation; obtain deployment approval; then use only the approved controlled smoke repository/installation. Record host source commit, policy digest, Git hashes, Node version, configuration fingerprint excluding secrets and permission readback before traffic.

Hosted journey must exercise signed delivery → exact subject → current evidence/policy/authorization → machine decision → provider queue → landed content → durable receipt/SHA lookup → download and independent portable replay. Include wrong-head refusal, producer/event ambiguity, relevant policy/head/base movement, revoked access and durability/signing failure. Mutations in that journey belong only to the explicitly approved synthetic fixture. Product administration and merge controls remain provider-owned.

**Read-default acceptance expects NOT_PROVEN for unavailable execution policy.** A production positive full-chain test requires the optional Enhanced integration on a newly accepted candidate and customer/owner opt-in; the old private lab credential hook is not a production integration. Do not obtain a green hosted result by suppressing a policy claim. Org-only enforcement and coverage-source limitations remain separately recorded even after successful hosted smoke.

Rollback must preserve immutable archives, trust history and operator logs. Stop the current writer, retain the failed release evidence and restore a consistent approved snapshot only if necessary. Reusing an old binary/configuration is permitted only after checking storage compatibility; do not promise an untested downgrade. Restored prior receipts remain historical. No traffic/cutover/rollback command runs without the exact deployment authorization.

## 6. Scheduled differential-lab design

Recommended cadence: weekly Sunday 14:17 UTC in the proposed private GitHub Actions lab repository, plus a manual run after a relevant GitHub schema/permission change. Single concurrency; one bounded run, no unlimited retries; 20-minute scheduler cap around the existing observer's maximum 480 provider requests and 30 fixtures. Respect rate-limit backoff and mark timeout/permission/collection failures UNAVAILABLE, never a passing baseline. The schedule is a proposal, not an activated job. New test-org support requires an explicit approved-ID allowlist change and regression validation; the current runner's `ohcaygo` restriction is not silently widened.

Use `node github/lab/run.js /absolute/private/lab.json` with an existing authorized token from the scheduler secret facility, never a token in its configuration or logs. Existing configuration keys are `fixtures` (repository, immutable repositoryId, PR, expected verdict, optional exact mergeGroup), `appId`, absolute `output`, optional `baseline` and absolute `runtimeState`. Supply only individually declared `ohcaygo/merge-proof-l3-lab-*` repositories. The current development token is confined to the selected queue fixture; do not add other lab repositories automatically. Record candidate SHA/policy digest and schema/source fingerprints alongside each run.

| Cohort | Expected observation and boundary |
| --- | --- |
| Default Read | Exact candidate/run observations; execution-policy read unavailable → NOT_PROVEN. This checks refusal, not positive policy satisfaction. |
| Optional Enhanced, after implementation/authorization | Eligible actor/event/file with complete policy; wrong actor/event; relevant policy change; duplicate/same-name producer. Expected results must be established independently from controlled fixture facts before baseline approval. |
| Rules/coverage | Repository policy/currentness and missing aggregate → NOT_PROVEN; local normalized coverage fixtures continue to test arithmetic and FAIL semantics. Positive provider coverage stays unavailable until a qualifying adapter/source exists. |
| Queue/content | Retained accepted bundle replay and exact tree/landing reconstruction; separate explicitly authorized fixture driver for fresh signed queue generation. The read-only observer cannot enqueue/create/merge or by itself retest the entire live queue journey. |
| Environment-gated | Org-wide enforcement, eligible push rules and inherited policy cases named as unavailable until their environment and access are approved; omitted positive evidence never becomes a pass. |

The observer detects false VERIFIED, verdict/claim-shape drift and unavailability; supplied runtime state adds reconciliation-supersession and rule-suite disagreement deltas. It does not independently reconstruct Git trees, create fresh fixtures, or authenticate a newly signed webhook journey. Pair it with the retained reconstruction/model suites and separate approved fixture drivers for those boundaries. Do not claim one scheduled observer covers them all.

Proposed private report retention is owner-selected, with source/capture hashes and no raw evidence in public CI artifacts. Page the approved internal recipient immediately for false VERIFIED; preserve inputs and stop promotion of that candidate. Other drift/unavailability produces a review item without automatically editing policies, granting permissions, updating expectations, or deploying. First activation needs one manually reviewed run and a deliberate baseline; keep the previous baseline immutable. Scheduler installation, credentials, alert route and persistent-fixture lifecycle remain owner operational gates.

## Verification and open implementation accounting

The original packet reused accepted `7953ecd` evidence: GitHub 331/331 (local and Linux), 1,000 model seeds with 17 invariants, static reconstruction 20/20, CLI 26/report 10 and clean factory 37/37; exact signed queue 13/13 with independent portable replay. The later companion component changes product code to `5fd27e1`: new local full suite 341/341, CLI 26/report 10 and clean factory 37/37. Its complete model/reconstruction tests passed; fresh provider acceptance and independent review are not claimed. See the component validation record for all attempts and limitations.

Required pre-addendum §43 code accounting remains [22 items](../validation/final-frontier-l3-2026-09-19/charter-coverage.md). Enhanced customer enrollment/UI, lifecycle/currentness routing, isolated broker, root-owned credential refresh, new-org runner allowlisting and chosen-host backup/deployment preparation are implemented in the current candidate. Their live provider/host acceptance remains open. Positive coverage collection remains an explicit unimplemented, provider-blocked item; no fabricated adapter is supplied. Optional log INFER, the alternative OIDC authentication branch and later Quint work remain explicitly absent as previously scoped. Production KMS/host/trust/backup/scheduler and external publication acceptance remain unexecuted owner/environment operations. **Level 3 is open.**
