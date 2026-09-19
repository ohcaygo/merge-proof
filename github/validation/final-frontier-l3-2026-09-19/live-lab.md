# Level 3 live acceptance — 2026-09-19

Status of the initial run: **PARTIAL LIVE ACCEPTANCE; NOT READY for final production gates.**

Update: the subsequent [development-App resume](app-resume.md) closes B05 delivery and B07 scoped reconciliation with unchanged installation scope and permissions. The later [second-account resume](reviewer-resume.md) validates approval and dismissal behavior, with the same-person limitation explicit. This document preserves the initial run and its original blocked results.

The requested candidate `2fe609d7120cabc5dbb958a69c45ad959a1ec256` was pushed normally to `codex/final-frontier-l3` before testing. All live mutations used four newly created owned synthetic repositories and an owned fork. Production, production signing/JWKS, public anchoring, App permissions and token scopes were unchanged. Full calibration captures and the per-case expected/actual matrix remain private outside the product repository, as required by Level 3 §22.

There are 71 executed assertions (70 live-provider or consumer assertions and one explicitly derived negative control), with 68 matching their original expectations. The three discrepancies are retained: one product defect repaired and live-retested, and two incorrect fixture expectations explained below. Seven blocked scenarios are recorded separately and are not counted as passing. Offline replay reproduced all 35 distinct captured receipts; all 12 VERIFIED receipts had only TRUE required claims, stable observations, current freshness and no gaps. No false VERIFIED was observed in the exercised cases. This is bounded evidence, not proof for unexecuted cases.

| Area | Observed result |
| --- | --- |
| Classic protection and repository rulesets | Bound positive cases VERIFIED; missing required policy evidence NOT_PROVEN |
| Merge, squash, single-commit rebase | Expected trees matched; landed trees and parentage verified |
| Base/head movement and stale evidence | Old current decisions refused; immutable historical receipts retained; changed claims invalidated |
| Producer/event/workflow substitution | Wrong-event success did not replace the bound failure; ambiguous producer and candidate-modified workflow stayed NOT_PROVEN |
| Execution protections | Allowed policy VERIFIED; changed event policy NOT_PROVEN; only CI and rules claims staled |
| Code coverage rules | REST parameters recognized; unavailable bound coverage evidence NOT_PROVEN |
| Human approval | Missing required approval NOT_PROVEN; positive approval and subsequent revocation blocked |
| HEADGREEN queue | Admission held pending group; live group and rebuilt group VERIFIED; destroyed group NOT_PROVEN; landed tree verified after compatibility repair |
| ALLGREEN and two-entry queues | Unsupported or unavailable selection remained NOT_PROVEN; both ordered two-entry reconstructions matched live group trees |
| Bypass/exempt actors | Failed CI remained FAIL; explicit bypass observed in rule suite; exempt authorization remained unknown |
| Landing after base movement | GitHub accepted a merge whose tree differed from the old proof; product returned LANDED_MISMATCH |
| Fork and 22 runs per SHA | Fork repository identity preserved; missing run-to-PR association NOT_PROVEN; required producer found among 22 runs |
| CLI/service/MCP and bundle | Live CLI decision passed; wrong-head MCP refused; unsigned bundle untrusted by default; explicit offline consistency and independent Git recomputation passed |
| Conditional transport | Real HTTP 304 observed; anonymous required-policy read remained unavailable |

## Failure and repair

GitHub REST version 2026-03-10 removed `merge_commit_sha` from pull-request responses ([official breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes)). The original queue landing was therefore LANDED_UNRESOLVED, and test-merge/historical selection could not resolve its subject. This failed closed but broke the supported journey.

The repair reads the exact PR test-merge ref, validates its SHA and ordered base/head parents, and resolves merged PR identity through GraphQL with exact repository ID/name, PR number, head, base ref and merged-state checks. Later landed observations preserve the immutable decision-time ledger; commit lookup joins the resolved observation. Missing, partial or mismatched metadata stays unavailable. The pure verdict implementation and its published frozen archive are unchanged.

Live retests established HEADGREEN LANDED_VERIFIED, exact merged identity in both queue repositories, historical two-parent merge identity, and a refreshed test-merge tree matching independent reconstruction. The base-ahead proof correctly remained NOT_PROVEN because available execution evidence named the PR head rather than the test-merge subject.

The ALLGREEN admission fixture initially expected VERIFIED even though the implementation explicitly refuses unobserved sibling validation; its NOT_PROVEN result was correct. A test-merge retest initially expected GitHub to have regenerated the ref; GitHub still exposed the previous base parent. The collector correctly rejected it. A subsequent synthetic head update regenerated the ref and the ordered-parent/tree checks passed. Original failures were not overwritten.

## Remaining gates

- A legitimate second human reviewer is unavailable. The owner explicitly marked positive approval, dismissal/revocation and reviewer-permission changes blocked.
- The development App cannot access the new test repositories. The existing repository-selection API returned 403 and the owner browser required re-authentication. Signed live event delivery, signed merge_group-to-receipt propagation and missed-delivery reconciliation remain blocked. Live API/queue observations are not represented as signed webhook acceptance.
- Organization-only ruleset enforcement requires a plan upgrade in the observed organization. No purchase, token-scope expansion or replacement organization was attempted.
- Production Linux Git pin/equivalence, production-backed smoke tests, signing/JWKS, external anchoring and release approval remain separate production gates. No production work was performed.

Known conservative limits remain visible: ALLGREEN validation, later multi-entry queue selection, hosted queue membership/order, complex rebases, opaque exempt authorization and unavailable coverage evidence. No limit was converted into positive proof to complete the matrix.

## Validation and cleanup

The complete GitHub suite passed **281/281**, including 35 focused collector/service/compatibility tests. The live capture replay audit passed 35/35. Earlier factory 37/37, CLI 26/26 and report 9/9 results are reused because their code and dependencies were unchanged; they were not rerun as new live evidence. The prior independent review applies to its recorded candidate; no new reviewer approval is claimed for this bounded compatibility repair.

All remaining synthetic PRs were closed, queue entries removed, temporary bypass actors removed, and no active lab workflow runs remained at cleanup. Owned repositories, branches, artifacts and API audit records are retained for inspection. No recurring lab automation was installed.
