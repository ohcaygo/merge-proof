# Independent Level 3 review: 62c2f97

## VERDICT

NEEDS_FIXES: four established defects. This is a local integration verdict, separate from production activation and pending provider acceptance.

## AUTHORITATIVE ORIGIN/DEVELOP

This repository uses main. The review-context script fetched origin successfully and resolved origin/main to e76a8677aa3dfd935376981ad4b99d3444e0441d. There is no develop blocker.

## CANDIDATE REVIEWED

62c2f97f869a8ca3b861a036cfdf62335c2845ee on codex/final-frontier-l3, in /Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-final-frontier-l3.

Requested executable scope: 7953ecdbd849c8afe0379bfec1b4a61133292c62..62c2f97f869a8ca3b861a036cfdf62335c2845ee. Integration merge base: current origin/main. Older d162d377 findings are not carried forward against this candidate.

## REPOSITORY / WORKTREE STATE

Clean at review start. The builder began fixing reported findings during review. Subsequent original-candidate reads used git show 62c2f97:<path>. This report does not approve in-progress modifications. The reviewer made no source changes or provider mutations; this report is the only reviewer-authored artifact.

## WHAT CHANGED

The delta implements explicitly consented optional policy access through a separate credential process, lifecycle invalidation and customer surfaces, retained reconstruction objects, backup/export/recovery verification, AWS and Linux preparation, signing acceptance, disposable Object Lock lifecycle acceptance, monitoring and an inactive private recurring lab template. Standard App Administration:read is preserved.

github/operations/LEVEL3-PREPARATION.md supplies current authority. Preparation within the approved ceiling is distinct from production cutover, public trust publication, production companion registration and production Compliance retention.

## VERIFICATION PERFORMED

- [ran] Skill review-context script with --candidate 62c2f97 --base origin/main --max-files 120: fresh origin, exact SHA/merge-base, 26 candidate-only commits, no upstream-only drift, NOT INTEGRATED.
- [ran] npm run test:github on frozen candidate: 362/362 passed, 42.97 seconds. /private/tmp/merge-proof-independent-62c2f97-all.txt.
- [ran] Focused companion, policy reader, backup, cloud, retention, lab and navigation tests: 40/40 passed. /private/tmp/merge-proof-independent-62c2f97-focused.txt.
- [ran] Executable delta git diff --check: passed. Broader evidence diff has trailing whitespace in a historical factory failure transcript, not a product defect.
- [ran] Generated infrastructure templates locally: primary 26 resources, recovery 12; production Object Lock not silently enabled.
- [ran] Local reproductions for all four findings below using temporary files, fixture service state or injected provider seams; no provider calls.
- [claimed] Builder 1,000-sequence/17-invariant model report, CLI26/report10, unchanged factory37 and template cfn-lint success. These additional claims were not independently rerun here.
- [claimed/pending] Parent Linux separate-UID acceptance; result not included in this frozen review.
- [not run] AWS provisioning/signing/replication/lifecycle/recovery acceptance, fresh real signed queue on this candidate, paid-plan acceptance, production deployment or public trust publication.

## SECURITY / SCHEMA / PROTECTED-BOUNDARY REVIEW

Consent uses authenticated customer/repository authority and immutable account/installation/repository identities. Installation state is single-use and session-bound. Server-side discovery avoids trusting redirected installation IDs. Policy reading exposes fixed GET and token-lifecycle operations, validates selected-repository scope, and rejects arbitrary URLs/administrative mutations before provider I/O. Inherited-policy limitations remain UNKNOWN/NOT_PROVEN.

Backup/restore retain immutable receipt/landing/log closure, verify digests and provider object versions, require independent signature trust and original pinned Git runtimes. Historical restoration does not grant current status. Expected/candidate/landed bindings and documented HEADGREEN-prefix versus ALLGREEN limitations were not weakened by this delta. No false VERIFIED result was reproduced.

Two protected boundaries fail: companion acknowledgement can outrun durable state (finding2), and root credential staging follows workload-controlled symlinks (finding3). These need code repair, not owner waiver.

No production credential use, schema migration or deployment was performed. Repository-level refusal evidence remains scoped refusal evidence, not positive proof of every rule path.

## DRIFT ANALYSIS

Candidate contains origin/main; no upstream-only commits need reconciliation. NOT INTEGRATED. Historical accepted live product7953ecd is the executable baseline, not fresh live proof for62c2f97. Fixes require an exact new product SHA and affected-behavior recheck.

## FINDINGS

### 1. P2: Scheduled lab rejects its own installation lookup before provider I/O

Location: github/lab/scheduled.js:12; github/client.js:20 endpoint allowlist.

Scheduler calls appClient(app).get('/app/installations/<id>'), while Client permits the installation access-token endpoint but not this GET. Every scheduled fixture fails INVALID_ENDPOINT before installation validation.

Independent reproduction: a Client with counting fetch rejects get('/app/installations/123') with INVALID_ENDPOINT and zero network calls.

Regression needed: run the complete scheduler path with valid installation identity/permissions and an authorized fixture; also reject wrong App/unselected installations/disallowed endpoints without expanding the companion mutation interface.

### 2. P1: Duplicate companion acknowledgement bypasses failed durable save

Location: github/enhanced-policy.js:158-165.

First delivery records companion:<delivery> in memory, then saves. If save fails, retry sees the in-memory key and returns duplicate without flushing pending durable state. A later restart can therefore restore the old durable authorization/currentness state after the sender receives success.

Independent reproduction: injected verified installation event; first save throws ENOSPC; retry returns duplicate:true; save count remains one and persisted=false.

Regression needed: use actual service durability flags; fail save during companion revocation/invalidation; retry then restart and require durable revocation/invalidation before acknowledging. Repeated save failure must continue rejecting.

### 3. P1: Root credential refresh follows symlinks in workload-writable staging directories

Location: github/operations/refresh-credentials.js:6-7,14-15.

Root gives each credential directory to the workload UID, then opens deterministic <file>.tmp with 'w'. A workload can create this as a symlink; root follows it, changes target permissions/owner, overwrites it, then renames the symlink to the final credential path. This crosses the separate-UID write boundary, including other /run paths writable by the root refresh unit.

Independent benign temporary-file reproduction using exact frozen atomic helper: own-config.tmp points at other-workload-config; ORIGINAL becomes REPLACED in the other file; final own-config is a symlink. No actual credentials or privileged files were touched.

Regression needed: validated root-owned non-workload-writable parents, exclusive random no-follow staging; temporary/final symlinks and workload-owned staging must not modify outside files. Recheck recipient access and refresh atomicity under actual Linux identities.

### 4. P2: Monitoring misses receipt-signing outage when daily checkpoint already exists

Location: github/operations/monitor.js:9; github/service.js:885-888 and receipt-signing/retry paths.

Monitor observes only operatorLogHealth CHECKPOINT_UNAVAILABLE for signing. Existing daily checkpoint returns without signing; drain restores DAILY_ROOT_PREPARED while new receipt signatures fail and bounded retries exhaust. The adjacent permissionHealth field is not populated by reviewed service.

Independent real-service reproduction: existing daily checkpoint, signer throwing KMS_SIGNATURE_INVALID, three drains, current confirmed backup record. Subscription becomes UNAVAILABLE; operatorLogHealth remains DAILY_ROOT_PREPARED. Monitor reports only unrelated local storage capacity warning and no signing/proof-processing alarm.

Regression needed: durable real receipt/landing/checkpoint signing health and recovery; failures must alarm even with existing daily checkpoint; subsequent real success clears applicable failure without concealing other signing failures.

## INTEGRATION SAFETY

Base position is sound. No reconciliation required. Frozen candidate is not approved before fixes. Recheck affected behavior against one combined fixed SHA; another broad independent review is not requested absent a concrete broader risk.

Implementation needing repair: four findings above. No additional missing charter feature was established in the requested executable delta. This is not a full Level3 completion claim.

Environment acceptance remains separate: fresh real signed queue/currentness/landing/portable chain on new candidate; companion provider behavior; organization plan/API coverage; deployed UID/IMDS isolation; AWS signer/recovery/ObjectLock lifecycle/RPO/RTO/alerts; actual recurring lab. These limits do not justify dropping capability.

Reserved decisions: production activation/cutover, production companion registration, public JWKS/mirror/checkpoint publication, irreversible production Compliance retention. Current inputs: primary/recovery AWS access, Team Terms, nonproduction companion registration after automatic approval review rejection. Historical queue evidence cannot replace this candidate's acceptance.

## NEXT ACTION

Builder: fix four findings and provide one combined immutable candidate for focused affected-behavior recheck. Continue other authorized preparation while specific owner/provider gates remain open.
