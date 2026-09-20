# Focused historical-recovery recheck: 838ed8f

## VERDICT

**APPROVE FOR INTEGRATION** of candidate 838ed8f422605bc814c0a7d9d0140dabbe78fedb. The concrete empty-mirror-directory recovery defect is resolved. This scoped recheck supplements the completed review and prior four-fix recheck; it does not constitute a new broad review or Level 3 completion claim.

## AUTHORITATIVE ORIGIN/DEVELOP

Repository uses main. Fresh git fetch origin succeeded. origin/main remains e76a8677aa3dfd935376981ad4b99d3444e0441d.

## CANDIDATE REVIEWED

838ed8f422605bc814c0a7d9d0140dabbe78fedb, direct child of 4f14f772838e9a5e40fd401c388efd7d11010053. Exact reviewed delta: 4f14f77..838ed8f, four files: backup.js, backup-cycle.js and their two affected test files.

## REPOSITORY / WORKTREE STATE

HEAD is exact 838ed8f. Six uncommitted documentation files were present; no executable differences were present. Review used the immutable diff and immutable source reads. Documentation edits are excluded from this product candidate review. No source edits or provider mutations were performed by reviewer.

## WHAT CHANGED

Private backups now retain validated mirror directory paths, including empty Git objects/refs directories. Both local restore and recovery-account restore recreate them. The directory list participates in the existing private manifest digest and remote manifest bytes; receipts, signing trust and proof engine are unchanged.

## VERIFICATION PERFORMED

- [ran] Exact HEAD/parent/diff inspection and fresh origin fetch. Origin/main...candidate: 0 upstream-only, 28 candidate-only commits.
- [ran] Read all four changed files and surrounding backup validation, manifest upload/readback and recovery logic.
- [ran] node --test github/test/operations-backup.test.js github/test/operations-cloud.test.js: **10/10 passed**, including real empty bare-Git restoration on local and injected cloud recovery paths, signature trust rejection, closure checks and negative directory cases. Output: /private/tmp/merge-proof-independent-838ed8f-focused.txt.
- [ran] Independent before/after regression using the parent backup module loaded from immutable Git source and the current module against equivalent actual bare repositories. Parent restored Git check exited128; fixed restored Git check exited0. Both reported historical currentness NOT_PROVEN. Temporary fixtures only.
- [ran] git diff --check 4f14f77 838ed8f: passed.
- [claimed] Builder genuine accepted7953 signed historical archive restored with independent trust/replay, four reconstruction claims and one landing passing; final rerun with exact838ed8f metadata and broader exact-candidate Mac/Linux suites were in progress. Those are not reviewer-run evidence here.
- [claimed] Earlier byte-identical unaffected UID/static module Linux acceptance after moving staged code out of an inaccessible runner home. No new Linux acceptance was performed by reviewer.
- [not run] Actual AWS account recovery/replication, production deployment or owner-gated external acceptance.

## SECURITY / SCHEMA / PROTECTED-BOUNDARY REVIEW

Directory entries are unique, relative, traversal-free paths beneath positive numeric mirror IDs. Restore validates every existing path component with lstat and rejects symlinks. The regression confirms an outside symlink target remains untouched and rejects traversal, absolute paths and non-mirror scope. Creation retains directories while holding existing mirror locks; restoration still requires a new destination and writer fencing.

Both recovery paths invoke the same validation/recreation helper. Directory omission or inconsistency cannot produce a successful full reconstruction acceptance: physical directories are checked, signed replay/reconstruction verification remains unchanged and historical currentness stays NOT_PROVEN. Existing manifest/file digests, recovery-account binding, pinned provider object versions and signature trust are preserved. Older manifests without directory metadata retain compatibility; they do not fabricate missing reconstruction evidence.

## DRIFT ANALYSIS

No upstream main drift requiring reconciliation. Candidate is NOT INTEGRATED. Prior source approval for4f14f77 is supplemented by this fix approval; product-code identity is now838ed8f. Historical7953 live evidence does not transfer to the new candidate.

## FINDINGS

No unresolved finding in this scoped delta.

The specific defect was dropping empty Git directories while retaining only files. Independent before/after execution confirms the new manifest and restore behavior removes that failure. No new source defect was established.

## INTEGRATION SAFETY

Source integration is approved against current main. Proof-engine files and prior credential/consent/signing repairs are unchanged. No broader repeat review is requested.

Actual environment acceptance and reserved owner gates remain separate: fresh signed queue/companion acceptance on the new candidate, organization plan/API coverage, deployed Linux/IMDS isolation, real AWS signer/independent recovery/lifecycle/RPO/RTO/alerts, enabled private recurring lab, and required current access/Terms/registration approvals. Production cutover, production companion registration, public trust/checkpoint publication and irreversible production Compliance retention still require their specific owner decisions.

## NEXT ACTION

Builder/integration owner: complete the in-progress exact-candidate verification and authorized source integration/remaining environment acceptance using838ed8f. Preserve truthful historical/current distinctions and the reserved owner gates.
