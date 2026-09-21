# Real organization-ruleset acceptance

Product candidate **9a35a7a2a8491dbec6d05a567ef69ac69a94753f**. Product code did not change during this acceptance. [Identity check](candidate-identity.json) compared 251 runtime/configuration files against that commit. The frozen engine digest remains `b770fe7f5dac86730095e768e4c3c4b4e1856eae909b3757acfc756069e47b76`.

O01–O09 below used real GitHub organization-owned rules, Actions runs, provider enforcement responses and landed Git objects, collected with the existing owner CLI credential. Their portable records remain explicitly unsigned. The subsequent signed App acceptance below uses the actual validation installation credential and real HMAC-verified deliveries; it does not relabel the earlier owner-token evidence. Production signing and a new signed merge-group acceptance remain separate. `7953ecdbd849c8afe0379bfec1b4a61133292c62` remains the last accepted signed queue candidate.

## Owned environment and billing

- GitHub Team organization `ohcaygo-merge-proof-validation-lab`, ID `331842075`.
- Public synthetic repository [merge-proof-l3-lab-org-rules](https://github.com/ohcaygo-merge-proof-validation-lab/merge-proof-l3-lab-org-rules), ID `1378968803`.
- Active organization ruleset `23745947`, scoped to that repository and `refs/heads/main`, with no bypass actors. Required check `l3 org validation` is bound to GitHub Actions App `15368`; strict up-to-date checking remains enabled. [Imported configuration](ruleset-import.json), [final provider readback](final-provider-readback.json).
- [Authenticated billing readback](billing-readback.json): current period has three purchased seats and $12/month. Ryan's confirmed correction is scheduled for **two seats, $8/month before tax, effective October 20, 2026**. It is not an immediate refund or retroactive $8 charge.
- Until that change takes effect, reserve the current $12 Team charge in the approved $110 ceiling; AWS preparation has $4 less headroom than the original $8 Team forecast. No cloud resource was created against the larger forecast.
- GitHub still reports `thatguyrw-boop` (`249527096`) as **pending**, despite the owner's invitation-accepted report. Positive second-account approval/authority acceptance remains unexecuted. Once active, results will be labeled **second-account functional validation**, never independent-human validation.

No production organization, existing App permissions, repository selections or public installability changed. No token scope was expanded. An initial draft with an unbound “Any source” check was rejected by automatic approval review and never saved; supported JSON import preserved the exact observed Actions App binding instead.

## Executed cases

| Case | Observed result | Evidence |
| --- | --- | --- |
| O01 passing inherited organization policy | PR 1, real successful `pull_request` CI, exact producer; `VERIFIED`; unsigned portable replay exit 0 | [capture and receipt](O01-org-positive.json) |
| O02 failed required CI | PR 2, actual failed Actions check `106198483176`; `FAIL / REQUIRED_CHECK_FAILED` | [capture and receipt](O02-org-failed.json) |
| O03 provider enforcement | Failed-CI merge rejected HTTP 405; direct main update rejected HTTP 409; main unchanged | [provider responses](O03-github-enforcement.json) |
| O04 current proof to actual landing | Full refresh was CURRENT before merge; PR 1 landed at `2981ae25b39711abad60e48cae26d670d15d3046`; exact tree/parents matched; rule suite `4152146495` passed | [merge](O04-merged-provider.json), [landed observation](O04-landed.json) |
| O04 portable/reconstruction | Unsigned receipt plus landed chain replay exit 0; separate offline Git reconstruction reproduced tree `996417855217e6918b01cebd284e172603a5bac6` with no flags | [portable chain](O04-portable-landed.json), [independent reconstruction](O04-independent-reconstruction.json) |
| O05 review-policy change | On unchanged PR 3, required approvals 0→1 changed `VERIFIED` to `NOT_PROVEN`; only approval and rules-snapshot claims became stale | [before](O05-before-policy.json), [after](O05-after-policy.json), [currentness](O05-currentness.json) |
| O06 missing required review | GitHub rejected merge HTTP 405, requiring a review from a writer; main unchanged | [provider response](O06-required-review-enforcement.json) |
| O07 real coverage rule | Organization threshold 80%, maximum drop 2 points ingested; absent qualifying provider evidence remained `NOT_PROVEN / CODE_COVERAGE_EVIDENCE_UNAVAILABLE` | [policy](O07-coverage-policy.json), [capture](O07-coverage-unavailable.json) |
| O08 coverage-policy change | Threshold 80→81 changed only coverage and rules-snapshot currentness; CI, approval, target and remote claims stayed current | [capture](O08-coverage-changed.json), [currentness](O08-coverage-currentness.json) |
| O09 organization required workflow | Exact repository/file/commit-pinned workflow ingested; unsupported positive proof remained `NOT_PROVEN`; GitHub independently rejected the unsatisfied workflow | [capture](O09-required-workflow.json), [provider response](O09-provider-enforcement.json) |

The original receipts remain unchanged. Atomic currentness at merge, unobserved exemptions, and what the runner actually checked out remain explicit limitations. O04's independent reconstruction is a separate observation; its original receipt was not rewritten to add that evidence.

The private fixture driver initially interpreted the string `false` as truthy. This was corrected before O02 was accepted; the actual failing commit was `a300d786c3d103f19f7808bb2fb248dcdb192312`. Only the driver changed, not product code or verdict assertions. The temporary coverage/workflow probes were removed after their recorded observations; the final fixture retains the one-approval rule, exact Actions binding, strict checks, deletion/force-push restrictions and no bypasses. There was no merge under a relaxed rule after the probes.

## Signed validation App and replacement key

App **5022592**, installation **163531028**, is private to the validation organization and selected only for the approved public synthetic repository. [Key verification](replacement-key-verification.json) matched replacement key **4550739** to its GitHub public fingerprint and authenticated a JWT signed by that key as the exact App. The PEM is owner-readable only; configuration records its local path, not private-key material. After explicit owner approval, inaccessible old key **4550569** was revoked. GitHub showed only replacement key 4550739 afterward, and fresh App authentication and scoped installation-token preflight passed again. No private key or token is included in this evidence packet.

[Actual App-token preflight](app-preflight.json) returned HTTP 200 for effective branch rules and parent-inclusive ruleset listing, and HTTP 403 for direct organization-ruleset detail and inherited execution-policy reads. The product ingests effective organization rule facts through the repository branch-rule response; this does not establish unavailable execution-policy facts.

[Read-mode signed acceptance](signed-app-read-mode-result.json) passed 12 checks on candidate `9a35a7a`, after comparing all 251 runtime/configuration files to that commit. [PR 4](https://github.com/ohcaygo-merge-proof-validation-lab/merge-proof-l3-lab-org-rules/pull/4) retained the initial failed expectation; [PR 5](https://github.com/ohcaygo-merge-proof-validation-lab/merge-proof-l3-lab-org-rules/pull/5) completed the remaining Read-mode checks. Both are closed, unmerged, and the synthetic main ref is unchanged.

- [Passing-CI receipt](signed-app-read-mode-before.json): real signed PR/Actions deliveries, exact App/repository/installation/head binding, inherited organization rules, and independent candidate-tree reconstruction. Verdict remains `NOT_PROVEN` for unavailable execution policy and missing required approval.
- [Failed-CI observation](signed-app-read-mode-failed-ci.json): actual required Actions failure and bound producer, with execution-policy qualification still UNKNOWN. The [original `FAIL` expectation was unmet](signed-app-initial-failure.json) and is retained as such. This is **not** a passed qualified-failure acceptance; no proof semantics or permissions were changed to obtain the second run.
- [Restored-head receipt](signed-app-read-mode-restored.json): real successful CI after a new commit remains `NOT_PROVEN`; previous receipts are immutable and stale. Authorized receipt HTML/JSON/bundle delivery succeeded, and anonymous delivery was denied.
- [Signed transport index](signed-app-transport-index.json), [GitHub delivery readback](signed-app-provider-delivery.json): real provider redelivery was idempotent. Signed portable replay passed before and after reopening durable storage. The receipt signatures use an ephemeral P-256 **lab** signer, distinct from the GitHub App authentication key; this is not AWS KMS acceptance, production trust publication, or anchoring.
- [Cleanup](signed-app-shutdown.json): relay and receiver stopped; no merge, ruleset changes, existing-App changes, or production access. Key revocation occurred separately afterward under explicit owner authorization.

The execution-policy 403, missing qualifying review, and unvalidated qualified-failure path prevent positive complete organization-policy/landed acceptance with this installation. They do not undo the observed signed transport, publication, reconstruction, replay, or durability results.

## Complete candidate regression

Fresh runs on the unchanged candidate passed [367/367 GitHub tests](candidate-github-tests.txt), [26/26 CLI and 10/10 report tests](candidate-cli-report-tests.txt), and [37/37 complete factory tests](candidate-factory-tests.txt), including actual Git/PDF output. [Model](candidate-model.json): 1,000 sequences, 28,578 actions, all 17 invariants. [Affected-event budget](candidate-model.json.budget.json) passed. Reconstruction regressions are included in the complete GitHub suite; the additional real landed-object reconstruction above passed independently. Earlier retained Linux/static-Git/separate-UID results retain their original source identity and are not relabeled as a new Linux run.

## Remaining boundaries

The basic Team organization-plan gate is now closed for the observed inheritance, enforcement, policy currentness and landed-content cases. Do not continue describing those cases as plan-blocked. This is not blanket acceptance of every GitHub policy type.

- Positive required-review authority awaits actual second-account membership and its real review on [PR 3](https://github.com/ohcaygo-merge-proof-validation-lab/merge-proof-l3-lab-org-rules/pull/3), with repository writer authority verified first.
- [Signed App-delivered Read-mode receipt acceptance is now validated](signed-app-read-mode-result.json) using the separate private validation installation. Positive execution-policy proof and qualified-failure acceptance remain unproven under the observed 403; actual required-review authority is also missing. Neither existing App was expanded, Administration remains Read, and no complete organization-policy or landed acceptance is inferred from transport success.
- The required-workflow path is an implemented fail-closed unsupported-evidence boundary, now exercised live. Its refusal is not positive workflow-proof support. Enterprise-only restrictions and unavailable inherited execution-policy detail remain environment/API limits; no upgrade is authorized here.
- Positive provider coverage collection is still **unimplemented and provider-blocked**. Ingestion, bound numeric semantics and dependent currentness exist; no trustworthy aggregate/provenance adapter was manufactured. Level 3 is not called complete while this category remains nonempty.
- The fresh companion-backed signed queue journey on `9a35a7a`, separate-UID credential/runtime enrollment, AWS account/signing/storage/backup/recovery/retention lifecycle and actual scheduled-lab acceptance remain open. Architecture/spending/preparation authority is already granted. Primary/recovery AWS authentication is still needed; the local AWS CLI has no configured profiles.
- Production deployment/cutover, production companion registration, public JWKS/mirror/checkpoint publication, and irreversible production Compliance retention remain reserved owner decisions. No such operation occurred here.
