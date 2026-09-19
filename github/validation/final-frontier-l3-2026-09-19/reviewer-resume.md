# Second-account approval and dismissal — resumed 2026-09-19

**The requested approval/dismissal sequence passed as second-account functional validation.** The author and reviewer used distinct real GitHub User IDs and separate authenticated sessions in one owned synthetic repository. Both accounts are controlled by the same person. This does not establish independent-second-human validation or separation of duties.

The unchanged product candidate `e3984f6b3ef89b92ef1173e0e6730c27082f4505` produced VERIFIED after current-head approval, NOT_PROVEN after the author changed the head and GitHub dismissed the stale approval, VERIFIED after new-head re-approval, NOT_PROVEN after explicit reviewer-initiated dismissal, and VERIFIED after fresh approval. The missing-approval baseline was retained rather than rerun. Required CI and independently reconstructed trees remained valid at every proof observation.

Eight assertions passed: six proof states (one reused baseline and five fresh live captures) and two currentness checks. All six receipts replayed with identical verdicts, gaps, violations, bindings, claims and summary. Every VERIFIED capture had stable observations, current freshness, no gaps, all required claims TRUE and a current eligible approval bound to the exact head. No false VERIFIED or new product defect was observed in this bounded sequence. No product code changed or unrelated completed scenario was rerun.

The old VERIFIED receipt could not authorize the changed head. Explicit dismissal without a head change invalidated only APPROVAL_CURRENT; target, CI, policy and remote claims remained current. Receipt bytes and historical verdicts stayed immutable. GitHub's authoritative review and timeline APIs confirmed the exact reviewer identity, review IDs, SHAs, states and dismissal actor; browser UI success alone was not treated as proof.

The lab PR is closed without merging, the original branch protection is restored exactly, the base SHA is unchanged and no lab workflows remain active. Full captures, expected/actual matrix, currentness comparisons, cleanup evidence and artifact hashes remain private outside the product repository under Level 3 §22.

B01/B02 approval and dismissal behavior now have functional account-level evidence. Human independence remains NOT_PROVEN. B03 permission-loss validation remains unexecuted: automatic approval review rejected the additional Write-to-Read repository-access mutation because it was not specifically authorized by the approval/dismissal request. Reviewer Write access was retained; no indirect workaround was attempted. The permission test requires explicit authorization.

B04 organization-only ruleset entitlement and B06 signed merge_group delivery retain their prior status. The candidate remains **not ready for final production gates**. Production deployment, production Git pin/smoke checks, signing/JWKS and public anchoring were not performed. Development-App scope and permissions were unchanged.
