# Independent focused recheck: 4f14f77

## VERDICT

**APPROVE FOR INTEGRATION** of source candidate 4f14f772838e9a5e40fd401c388efd7d11010053. All four findings against62c2f97 are resolved. This is not production activation approval and does not declare the complete Level3 outcome achieved.

## AUTHORITATIVE ORIGIN/DEVELOP

The repository uses main. A fresh git fetch origin during this recheck succeeded. origin/main remains e76a8677aa3dfd935376981ad4b99d3444e0441d.

## CANDIDATE REVIEWED

4f14f772838e9a5e40fd401c388efd7d11010053, direct child of62c2f97f869a8ca3b861a036cfdf62335c2845ee.

Scope: the combined fix delta62c2f97..4f14f77 and adjacent failure paths. This completes the fixes to the one independent complete review preserved at /private/tmp/merge-proof-level3-review-62c2f97.md; it is not another broad review.

## REPOSITORY / WORKTREE STATE

HEAD resolved to exact4f14f77 and the worktree was clean. No source edits, deployments, provider mutations or credential use by reviewer. Only the review report is reviewer-authored.

## WHAT CHANGED

- Added a narrowly constrained installation GET to the existing client and repaired scheduler integration, preserving Standard App Administration:read.
- Companion duplicate delivery now flushes pending durable state before acknowledging.
- Root credential directories remain root-owned and non-workload-writable. Staging uses random UUID paths, exclusive no-follow creation and atomic replacement with fsync; unsafe parents are rejected.
- Real receipt/checkpoint/landing signer calls record signer health independently of daily checkpoint existence. Monitoring consumes actual signing, subscription, delivery and Enhanced access state.
- Added focused regressions and extended disposable Linux UID acceptance to recipient staging-entry refusal/readability.

## VERIFICATION PERFORMED

- [ran] Fresh origin fetch, exact candidate/parent resolution, clean status and origin/main...candidate counts: 0 upstream-only,27 candidate-only.
- [ran] Reviewed all12 files in62c2f97..4f14f77, including tests and the authority-document clarification.
- [ran] node --test github/test/enhanced-policy.test.js github/test/lab-allowlist.test.js github/test/operations-cloud.test.js github/test/operations-credentials.test.js: **19/19 passed** on exact4f14f77. Output /private/tmp/merge-proof-independent-4f14f77-focused.txt.
- [ran] node --test github/test/productionization.test.js github/test/chain.test.js github/test/policy-reader.test.js: **48/48 passed**. Covers signed portable tampering/trust, immutable archive/restart, operator checkpoints, landed chain, HEADGREEN-prefix binding, unresolved historical landings, policy-reader pre-I/O refusals and adjacent durability. Output /private/tmp/merge-proof-independent-4f14f77-adjacent.txt.
- [ran] Additional real Store/ProofService exercise: repeated ENOSPC rejects; successful companion revocation retry survives store close/reopen with REVOKED, disabled grant and retained delivery identity.
- [ran] Additional scheduler factory exercise: wrong App, all-repositories selection and suspended installation each reject after the installation GET and before minting a token.
- [ran] git diff --check62c2f97 4f14f77: passed.
- [claimed/pending] Builder broad Mac/Linux exact-candidate suites and actual Linux separate-UID acceptance. These concurrent results are not claimed as reviewer-run evidence here.
- [not run] Actual EC2/systemd/IMDS enforcement, AWS signer and independent recovery, disposable Object Lock lifecycle, fresh signed GitHub queue journey, organization paid-plan coverage, recurring external schedule, public publication or production deployment.

## SECURITY / SCHEMA / PROTECTED-BOUNDARY REVIEW

The installation endpoint change allows exactly GET with no body; POST/PATCH/DELETE/body attempts reject before provider I/O. Existing companion policy reader remains independently constrained. Standard App scope is unchanged.

Credential recipients can traverse their own root-owned directory and read their0600 file, but cannot create or replace privileged staging entries. lstat rejects symlink parents and workload-writable parents. Random exclusive no-follow staging plus rename replaces a destination symlink without following it. Local regression confirms outside bytes remain unchanged. Actual root/separateUID Linux acceptance remains an environment observation, not inferred from Mac tests.

Pending durable companion saves must succeed before duplicate acknowledgement. Repeated failures propagate; successful persistence retains revocation on restart. Signer failure is persisted before propagation, and the existing checkpoint path cannot clear it without a real successful signer call. The wrapper preserves trusted-key metadata and all sign call sites use it. The adjacent signed-chain tests pass.

No receipt/proof-policy semantic downgrade, tenant-boundary weakening, public trust publication, production mutation or scope substitution was found. Frozen proof/verifier files are outside the fix delta. HEADGREEN prefix and documented ALLGREEN limitations remain unchanged.

## DRIFT ANALYSIS

No upstream-only main drift. Candidate is NOT INTEGRATED; no reconciliation required. The integration verdict applies to this immutable candidate only. Historical live queue evidence for7953ecd does not become current live proof merely because the new candidate passed tests.

## FINDINGS

No unresolved finding in the scoped fix recheck.

1. Prior P2 scheduler installation read: **resolved** by narrow GET support and integrated factory regression.
2. Prior P1 companion duplicate durability: **resolved** by flushing pending save before duplicate acknowledgement; repeated-failure/restart behavior checked.
3. Prior P1 credential staging boundary: **resolved in implementation and local regression** by root-owned parents and no-follow exclusive random staging. Actual Linux acceptance remains separately reportable.
4. Prior P2 missing signer alarm: **resolved** by recording actual signer failure/recovery and consuming it independently of checkpoint state.

No additional charter-required source omission was established by this review/recheck. This does not convert unexecuted environmental acceptance into passing evidence or declare Level3 complete.

## INTEGRATION SAFETY

Source integration is approved against current main. Keep production activation, new provider acceptance and public trust actions separate. Use4f14f77 as the new product-code candidate; documentation-only commits do not replace it. Relevant broader evidence remains reusable when code and conditions are unchanged, while the new candidate needs its own fresh signed queue/companion acceptance.

Remaining environment and owner gates:
- Fresh real signed queue admission through exact candidate/evidence/policy/currentness, landing and portable replay on the new candidate with Standard Read and separately authorized companion.
- Actual companion registration/provider behavior and organization-wide ruleset coverage in the minimum approved plan; preserve unavailable API/Enterprise paths as explicit NOT_PROVEN limits.
- Authenticated primary/recovery AWS contexts; actual signer, replication, lifecycle, isolated restore, measured RPO/RTO and alert delivery.
- Actual deployed Linux/systemd/IMDS enforcement and enabled private recurring lab acceptance.
- GitHub Terms/nonproduction companion registration approvals currently pending.
- Separately reserved production deployment/traffic cutover, production companion registration, public JWKS/mirror/checkpoint publication and irreversible production Compliance retention.

## NEXT ACTION

Builder/integration owner: proceed with authorized source integration and remaining environment acceptance using exact4f14f77; retain the reserved owner gates and report implemented, tested, reviewed, live-validated and deployed states separately.
