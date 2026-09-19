# B03 reviewer permission loss — resumed 2026-09-19

**B03 passed under explicit owner authorization.** In the existing owned synthetic repository, the same current-head review produced VERIFIED with observed Write access, NOT_PROVEN after GitHub confirmed Read access, and VERIFIED after Write was restored and confirmed. Evaluating the earlier immutable VERIFIED receipt against the permission-loss capture returned NOT_PROVEN/HOLD. All four expected/actual proof assertions matched; the three captured receipts replayed consistently. No false VERIFIED or product defect was observed, and no product code changed.

The pre-change access, collaborator roles, PR, reviews and protection were recorded. The role downgrade was confirmed through GitHub before proof collection; the collector independently observed write permission as false. Only APPROVAL_CURRENT became stale. Head, base, CI, rules and remote evidence remained current; the same review remained APPROVED but could not satisfy the required-authority predicate. Old receipt bytes and historical verdicts stayed unchanged.

Write was restored immediately after the permission-loss/currentness assertions, about 13 seconds after Read was confirmed. GitHub then confirmed Write and the final fresh proof returned VERIFIED. The synthetic PR was closed without merging; original protection and all collaborator roles matched the starting snapshots exactly, reviews were unchanged and no fixture workflows remained active. Other users, App permissions/scope, organization membership, production repositories and customer data were untouched.

This is second-account functional validation. Both accounts have the same operator; independent-second-human validation and separation of duties are not established. Product code tested remains `e3984f6b3ef89b92ef1173e0e6730c27082f4505`. Full expected/actual captures, access readbacks, currentness checks, cleanup records and hashes remain private outside this repository under Level 3 §22. Unrelated completed scenarios were not rerun.

## Remaining live blockers

- **B04 organization-only ruleset enforcement:** the organization currently reports the Free plan; organization-ruleset reads returned 404. The earlier owner UI required GitHub Team. The 404 alone is not evidence of the entitlement cause. No purchase or organization policy change was attempted, and live enforcement remains unproven.
- **B06 signed merge_group delivery:** the development App still selects only `ohcaygo/merge-proof`. Its merge_group subscription and Merge queues read permission are present, but main has no active branch rule and the complete currently available delivery history has no merge_group event. The queue lab repositories remain outside the selected scope. No eligible signed fixture could be exercised without additional scope or policy authority.

B03 is closed. No remaining already-authorized non-production action can close B04/B06 under the current constraints. Complete live acceptance and final production readiness remain unproven. Production Git pin/smoke gates, signing/JWKS, public anchoring and deployment were not performed.
