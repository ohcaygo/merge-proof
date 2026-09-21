# Level 3 operator steps

The [continuation tracker](../validation/aws-production-continuation-2026-09-21/README.md) is current authority for candidate identity, accepted foundations, and remaining gates. This operator material is preparation/source configuration only; it does not claim hosted operational acceptance. Administration Read remains the default; `7953ecd` is a historical signed-queue acceptance only.

These steps implement the researched boundary without granting new authority. Normal service operation never merges, enqueues, dismisses reviews, edits GitHub policies, or publishes anchors.

## Durable receipts

A persistent `Store` automatically creates a `receipt-archive/` sidecar with immutable, fsync-backed receipt and landed-observation records. Back up this directory with `state.json`; both are needed for complete recovery. A bounded active cache can evict old receipts without removing the portable historical bundle. Every download still checks repository identity, current access, and installation entitlement. Archived receipts never regain CURRENT merely because they were restored. Storage exhaustion fails the write; it never upgrades a verdict.

Retain the entire archive and operator-log history. This is local operator retention, not replicated storage or an independently witnessed timestamp. Configure filesystem backup/restore and capacity monitoring in the release environment. Those production operations require the owner's infrastructure authorization.

The optional Healthchecks.io integration projects `primary.monitor.healthchecks`
from the existing root refresh into the root-owned 0600 monitor file and reads
it only through the configured `monitor.externalHealthFile`. It accepts an exact `OK` response from each fixed `hc-ping.com` UUID,
and reports unavailable or stale service/backup state as a monitor failure. It
is not active until the owner creates the checks and completes real alert
delivery and missing-heartbeat acceptance; no configured or simulated result
is an operational claim.

## Monitor metrics and redacted logs

The monitor publishes backup age, storage use, Linux `MemAvailable`/`MemTotal`-based memory use, warning health, and critical health. Its CloudFormation template binds a 30-day `/merge-proof/preparation/monitor` log group and `health` stream to the selected primary account. The exact stream ARN and `logs:CreateLogStream`/`logs:PutLogEvents` actions follow the [AWS CloudWatch Logs authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html). The root-owned monitor configuration must bind the same account and region before any network request:

```json
{
  "memoryInfoFile": "/proc/meminfo",
  "logs": {
    "accountId": "SAME_12_DIGIT_PRIMARY_ACCOUNT_AS_AWS",
    "region": "SAME_PRIMARY_REGION_AS_AWS",
    "group": "/merge-proof/preparation/monitor",
    "stream": "health"
  }
}
```

Each event contains only timestamp, monitor state, hardcoded alarm codes/severities, backup age, storage/memory percentages, and external-health states. It contains no log path, healthcheck URL, repository, receipt, credential, or arbitrary provider text. Invalid destination binding, unavailable memory, CloudWatch partial rejection, or failed log delivery is a monitor failure; none is reported as healthy.

## Signing and published keys

`signing` in the existing App configuration may select the implemented AWS KMS adapter:

```json
{
  "provider": "aws-kms",
  "executable": "/usr/local/bin/aws",
  "region": "OWNER_SELECTED_REGION",
  "keyArn": "OWNER_SELECTED_KMS_KEY_ARN",
  "keyId": "OWNER_SELECTED_JWKS_KID",
  "jwksPath": "/absolute/path/to/public-jwks.json"
}
```

The KMS key must be asymmetric P-256 (`ECC_NIST_P256`, `SIGN_VERIFY`). The public JWKS key must use EC/P-256, `ES256`, `use: sig`, a `kid`, ISO date `nbf`/`exp` windows, and no private `d` member. The adapter sends only a SHA-256 digest with `ECDSA_SHA_256`, checks the exact returned key ARN and algorithm, and verifies every returned DER signature with the pinned public key. AWS credentials use the normal AWS credential provider chain; no credentials belong in a receipt or this repository. A failed configured signer refuses issuance; it never falls back to unsigned output.

The runtime exposes configured public keys at `/proof/.well-known/jwks.json`. Independently publish and mirror the approved JWKS history before customers trust it. Retain expired historical keys and record revocation explicitly. Bundled keys never authenticate themselves. Selecting/creating the production KMS key, IAM access, JWKS identity and any associated spending remains an owner gate. Local simulated KMS tests are not live KMS validation.

Set `MP_SOURCE_COMMIT` to the verified release SHA. Run `node github/operations/release-preflight.js CONFIG.json` against the intended Linux release. The configured Git binary and exact version are hashed; run the reconstruction corpus and real provider smoke there. The preflight does not deploy or claim those tests ran.

## Daily operator roots

A configured signer prepares a signed checkpoint for the previous completed UTC day during normal draining. The bundle can include the receipt's Merkle inclusion path. A verified inclusion path establishes membership in the operator's checkpoint; it does not establish public anchoring or independent time.

`node github/operations/checkpoint.js CONFIG.json` prepares a reviewable publication file from an atomic store snapshot. Configuration contains absolute `stateFile`, `output`, a completed `day`, and the approved `signing` settings. Keep private receipts and evidence out of the public root repository.

After the owner approves a dedicated public destination, `node github/operations/publish-anchor.js CONFIG.json` publishes only that prepared signed root. Its configuration requires `authorized: true`, `repository`, `branch`, `path: anchors/YYYY-MM-DD.json`, and `preparedFile`. It verifies public visibility and owner administration, refuses an existing different anchor, and reports the resulting commit and URL. It is never invoked automatically by the product. Root destination and initial publication remain owner gates; no root has been published by this work.

## Portable verification

Use `merge-proof verify --bundle DIRECTORY --trusted-keys OWNER_JWKS.json`; optionally add `--git-dir BARE_REPOSITORY --git-binary PINNED_GIT` for independent content reconstruction and `--online` for retained provider records. The component manifest, receipt DSSE, frozen verdict logic, target subjects, landed DSSE/receipt linkage, tree/parent comparison, and supplied log inclusion are checked. An absent landing or operator inclusion is named as absent rather than manufactured. The verifier reports consistency; it does not reissue VERIFIED or infer currentness. `--allow-unsigned` permits explicit consistency checks only.

## Differential lab

`node github/lab/run.js CONFIG.json` observes up to 30 explicitly named owned synthetic fixtures and writes private capture reports. Configuration provides `fixtures: [{repository, repositoryId, pr, expected}]`, optional `appId`, `baseline`, and absolute `output`. Supply an existing authorized token through `MP_LAB_TOKEN`. The runner detects a false VERIFIED, changed claim/verdict shape, and unavailable evidence. Runtime reconciliation and rule-suite observations remain separate evidence in the receipt/ledger.

Run weekly in the owner's selected non-production scheduler after credentials and persistent fixture ownership are approved. The runner and comparison are implemented; activating a recurring external job is an owner operational gate. Never commit private calibration captures, secrets, or signed webhook payloads to the public product repository.

For an existing App with Merge queues read already granted, `mergeQueues: true` requests that permission in the repository-scoped installation token. The default token request remains compatible with installations without this grant. It does not change App permissions or select additional repositories.

## Static Linux Git artifact

`static-git-builder.json` pins the disposable Alpine builder image and upstream Git 2.50.1 archive SHA-256. `build-static-git.sh /out` builds the core and HTTPS helper statically, rejects ELF interpreter/shared-library dependencies, records package versions and executable hashes, includes Git's license, and tests TLS transport against an owned public synthetic repository. It installs inside the disposable builder at `/opt/merge-proof-git`; it does not install into production.

Run the reconstruction corpus against the resulting binary, retain the artifact, and configure its exact digest in the release. The source and builder image are pinned; dependency versions and output hashes are recorded per build. Bit-for-bit reproducible rebuilding is not asserted. Deployment must use the tested artifact. The runtime and linked libraries retain upstream licensing obligations; the product's MIT license does not relicense Git.

The anchor publisher additionally requires `trustedKeysFile` pointing to the independently approved public JWKS. It verifies the prepared checkpoint signature before making any external write. The differential runner accepts an optional absolute `runtimeState` snapshot, compares the two runtime drift counters against `baseline`, and budgets at most 480 provider requests across declared fixtures.
