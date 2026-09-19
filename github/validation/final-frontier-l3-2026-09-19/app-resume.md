# Development App delivery and reconciliation — resumed 2026-09-19

**B05 and B07 passed using the existing development App installation.** The owner confirmed the existing selected-repository scope, and the repository's development acceptance procedure permits an isolated public development PR in `ohcaygo/merge-proof`. No App repository selection, permissions, event subscriptions, webhook URL or SSL setting changed. The owner-controlled fixture was closed without merging.

Eleven live assertions passed: scoped token/relay connection, real signed event to current receipt, neutral App Check on the exact head, unsigned request rejection, immutable old receipt becoming stale after a head change, stale Check retraction, current new-head proof, a genuine delivery missed by the local handler, exact-ID redelivery request, current re-proof after GitHub redelivery, and duplicate-delivery idempotence. GitHub's authoritative delivery API independently matched the payload and signature header for the three core PR events. Four captured receipts replayed with identical verdicts and gaps.

The receipts correctly remained **NOT_PROVEN** with `NO_REQUIRED_VALIDATION_CONFIGURED`. The installation's selected repository has no required validation on the fixture's base. A successful delivery journey does not establish a VERIFIED merge proof. Checks remained neutral; no rule was weakened to obtain a positive verdict.

## Failure found and repaired

The live App delivery API returned 64-bit delivery IDs above JavaScript's safe integer range. Ordinary JSON parsing rounded them; the reconciler skipped all 100 IDs in the observed page while reporting `RECONCILED`, without attempting recovery. This was a real reconciliation-health defect, not an App authorization problem.

The client now preserves unsafe integer tokens as strings on the App delivery endpoints, without changing quoted strings, safe integers or other API response types. The reconciler accepts exact decimal delivery identifiers and rejects malformed identity with `UNAVAILABLE`; it no longer silently skips unreadable identities and reports success. Regression tests cover exact URL construction, cursor pagination, malformed IDs and JSON string preservation.

The repaired code requested redelivery of the precise missed GitHub delivery. The existing Smee relay transported the original signed event, the candidate’s existing webhook verifier accepted it, and the isolated local service generated a current receipt for the new head. A second actual GitHub redelivery was recognized as a duplicate without creating another receipt. The missed-delivery fault was injected only at the local test receiver; GitHub's relay-level HTTP 200 did not imply the local handler had accepted the event.

To avoid redelivering unrelated repository history, the lab adapter selected this exact fixture GUID from an unmodified real API page before invoking the normal reconciliation method. The live test proves that scoped recovery path; cursor traversal and malformed identity are additionally covered by regression tests. A separate read-only inspection traversed the complete available delivery history. No unrelated delivery was redelivered.

## Remaining boundaries

- B01–B03: legitimate human approval, revocation/dismissal and reviewer permission changes remain blocked until Ryan provides the reviewer username.
- B04: organization-only ruleset enforcement remains blocked by the previously observed plan entitlement.
- B06: signed merge_group delivery remains unexecuted. The App already subscribes to merge_group and has Merge queues read permission, but the selected repository has no applicable main-branch queue policy and no merge_group delivery in the available history. The separate queue fixture repositories are outside its selected scope. No permission is missing for the completed delivery/reconciliation cases, and scope or repository rules were not changed to manufacture this case.
- Production deployment, production Git pin/smoke checks, production signing/JWKS and public anchoring remain separate gates and were not performed.

## Validation and cleanup

The complete GitHub suite passed **291/291**; the focused service/reconciliation tests passed **18/18**. Eleven live App assertions and four receipt replays passed. The prior local and live evidence remains intact; no new independent reviewer approval is claimed. The frozen pure verdict implementation was not changed.

The temporary PR is closed and unmerged. The local server and relay stopped; proof, group and landing queues were empty. Before/after inspection confirmed identical selected repositories, App/installation permissions, event subscriptions, webhook URL hash and SSL setting. Full signed transport and the per-case expected/actual report remain in the private calibration directory outside this repository.
