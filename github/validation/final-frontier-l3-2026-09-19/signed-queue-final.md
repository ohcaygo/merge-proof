# Final-candidate signed queue acceptance — 2026-09-20

**The isolated live signed queue-to-landed acceptance passed on product candidate `7953ecdbd849c8afe0379bfec1b4a61133292c62`. Administration is restored to Read on the development App and installation. Ryan subsequently selected Administration Read by default with optional Enhanced Policy Proof; the [focused investigation and design](least-privilege.md) record that decision. Level 3 remains open.**

[Sanitized machine evidence](signed-queue-final.json) records all 13 live assertions, permission transitions, policy-read comparisons, delivery hashes, exact identities, portable replay, independent Git checks and archive restart. Raw webhook bytes/signatures, credentials and service state remain private in `merge-proof-l3-live-lab-2026-09-19/frontier-resume/signed-queue-isolated/`.

## What the live journey established

[Synthetic PR 10](https://github.com/ohcaygo/merge-proof-l3-lab-queue-headgreen/pull/10) targeted only the orphan branch `l3-isolated-signed-queue-20260920`. The GitHub-generated workflow, check, queue and merge observations were real. The normal HMAC handler accepted the provider deliveries; all 80 retained deliveries had their HMAC and raw-byte hashes independently rechecked afterward. No constructed webhook or substituted policy/evidence payload was used.

| Chain element | Observed identity/result |
| --- | --- |
| Product implementation | `7953ecdbd849c8afe0379bfec1b4a61133292c62`, frozen v7; tracked runtime bytes matched before execution |
| PR head | `9765cb4141415d956d078d89c5b101f6db32b5c0` |
| Base | `31d5b01bc299874a1017909219711bf462dd4c8f` |
| First provider group | `b7022dfa3f86a9877b6cb8e67cc9d0c43ad38840` |
| Rebuilt group and landed commit | `d8e8f20681903e3f53f25fb3f3e6470effaf4bd0` |
| Expected, candidate and landed tree | `7cef7ea28e28de0614933013f24e99c9db146142` — all equal |
| Final bound receipt | `df91f650-7660-48b6-9eac-86ee304b595b` |
| Receipt SHA-256 | `e00fa1bc970aecdfec16c6fa7c71868b872b3ee1922849e6cfb25e5b80578b3a` |
| Landed observation | `LANDED_VERIFIED`, consistent parentage, exact group receipt |

The signed PR event first produced CURRENT VERIFIED admission evidence. A real `merge_group/checks_requested` event then selected the distinct group commit, whose eligible `merge_group` workflow run/check/attempt/job and workflow blob were bound to the candidate and policy snapshot. Independent Git reconstruction matched the group tree. The first signed portable bundle verified.

The driver deliberately dequeued the PR. GitHub delivered `merge_group/destroyed`; the old group lost current authority while its receipt remained byte-for-byte unchanged. Re-enqueue produced a new signed group and CURRENT VERIFIED proof. The temporary synthetic rule's minimum batch size was changed from two to one to release that group; required checks, App bindings, queue enforcement and bypass settings were retained. GitHub merged through the queue. The real signed closed-PR event drove the normal ledger/landing path, and authenticated HTTP commit lookup found the receipt.

Trusted signature verification and v7 replay passed for the complete landed bundle. A separate CLI invocation independently recomputed the recorded Git inputs, intermediate candidate tree, landed tree and parents: `INDEPENDENTLY_RECOMPUTED`, exit 0. This run used the recorded macOS Git 2.50.1 binary, SHA-256 `a961f78075d8e7621ef4f5d764c64ef8a41bf66c0a98ab5cb6ca39b85ce31c93`. The separate final Linux/static-Git acceptance remains the [previous exact-candidate run](capability-addendum.md).

After receiver shutdown and permission restoration, the receipt was evicted from the active cache, the actual store closed and reopened, and the archive recovered it through normal access authorization with a Read-scoped App token. Receipt bytes and the signed landed chain survived unchanged; restored currentness was UNAVAILABLE, never falsely CURRENT.

Scope limits remain explicit: this queue fixture had an observed empty execution-policy list and zero required reviews. Nonempty actor/event policy cases are the separately retained live addendum results. This is not independent-human approval proof. Signatures use an ephemeral lab P-256 key and independently supplied lab trust, not production KMS/public trust. Policy, queue membership and permission facts remain GitHub-observed. Atomic currentness at merge, actual runner checkout and the absence of exempt bypasses remain unproven. The portable verifier preserves those limitations.

## Temporary permission transition and cleanup

Fresh API captures recorded App `4899448` and installation `160648161` before modification. Only repository Administration changed Read → Write. GitHub's installation approval page displayed that sole change; acceptance was confirmed by installation API readback, not inferred from App settings alone. Actions, Checks, Contents, Merge queues, Metadata, Pull requests, Statuses and event subscriptions were unchanged.

Exactly `ohcaygo/merge-proof` and `ohcaygo/merge-proof-l3-lab-queue-headgreen` remained selected. The lab tokens were further restricted to repository ID `1377343185`. The private App client allowed only fixture reads, read-only GraphQL and normal receipt-check writes; its Write grant was never used to configure policy. Existing owner credentials performed only the authorized synthetic fixture setup/queue operations and receipt-lookup authorization.

The receiver/relay stopped, temporary Write tokens were revoked, and only synthetic ruleset `23733299` was disabled after landing. The fixture main branch was unchanged. At `2026-09-20T17:47:37Z`, API readback showed the App and installation restored exactly to their initial permissions/events, including Administration Read. The installation UI again showed precisely the approved pair and disabled Save. The previous developer note was restored. No production endpoint, App, content, deployment, paid plan or public anchor was touched in this run. The separately disclosed earlier production-side incident remains historical evidence and is not erased by this statement.

## Production permission finding

**The current REST policy collector needs Administration Write to read applicable Workflow Execution Protections. This is proven for the repository policy-list endpoint; it is not approval to require Write from customers.**

| Same fixture, real credential | Result |
| --- | --- |
| Stock `7953ecd` installation token: Administration Read | Policy list HTTP 403; accepted-permissions header `administration=write` |
| Temporary repository-scoped App token: Administration Write | Policy list HTTP 200; `AVAILABLE`, empty list |
| No authentication, public fixture | Policy list HTTP 401 |
| Read token, conventional Actions permissions | HTTP 200; enabled/allowed-actions settings only |
| Read token, active branch rules and repository rulesets | HTTP 200; branch rules/targets available |

GitHub documents Administration Write for both [repository policy list and detail reads](https://docs.github.com/en/rest/actions/policies). This is the provider's authorization mapping; no technical rationale for requiring mutation power on a GET was established. Organization policy detail reads separately require organization Administration Write according to that documentation. This lab had no inherited policy and does not establish that repository Write alone suffices for inherited organization/enterprise policy details. No organization grant was added or tested.

**Pinned-code qualification:** `7953ecd` deliberately requests Administration Read in `installationClient()`. Merely changing the App grant does not change its tokens. The acceptance supplied a real, restricted Write token through the existing `ProofService.appClient` injection hook without modifying product code. Thus the pinned proof/service path is live-validated under that credential; stock production credential issuance is still Read and cannot pass this policy-read preflight. This credential integration remains part of the owner decision, not an unnoticed product change.

A separate real Read-token collection produced NOT_PROVEN. `CI_EXECUTED:l3 signed queue validation` and `RULES_SNAPSHOT` were UNKNOWN because applicable execution policy was unreadable. `TARGET`, `APPROVAL_CURRENT` (zero required reviews) and `REMOTE_DURABLE` remained TRUE. Those are the directly demonstrated dependencies. Positive enabled coverage claims would also depend on eligible producer execution; their live aggregate adapter is independently still missing. Complete fresh VERIFIED/PROCEED and a newly established full proof-to-landing chain cannot be claimed with these policy facts absent. Exact Git reconstruction, observed checks/workflows/reviews/branch rules, partial claims, historical receipts and portable historical verification remain available with Read; archive restart/access was verified after restoration.

No currently exposed equivalent narrower source was established. The live GraphQL schema offers ruleset targets BRANCH/TAG/PUSH/REPOSITORY, no ACTIONS target, no actor/event restriction rule types, and no workflow-path rule condition or repository execution-policy field. This agrees with the [GraphQL repository](https://docs.github.com/en/graphql/reference/repos) and [Actions](https://docs.github.com/en/graphql/reference/actions) references. [Conventional Actions permissions](https://docs.github.com/en/rest/actions/permissions) describe allowed actions/workflows, not these actor/event execution protections. [Branch rules](https://docs.github.com/en/rest/repos/rules) do not establish the missing execution-policy facts. Successful runs or a missing webhook do not establish authoritative policy absence/completeness. A customer-controlled export, broker or future provider read endpoint is an architecture possibility requiring a provenance/completeness/currentness design and approval, not an implemented substitute.

**Subsequent owner decision:** preserve Administration Read as the production default and design optional Enhanced Policy Proof. The [completed focused investigation](least-privilege.md) found no equivalent documented narrower source. The proposed companion policy-reader credential boundary, consent UI and dedicated integration are designed but unimplemented; no App registration, production permission or proof semantics changed.

## Four-category accounting

1. **Implemented and live-validated:** final-candidate signed PR/group delivery, exact group/evidence/policy binding, independent expected trees, destroyed-group currentness, immutable history, rebuilt queue landing, landed parent/tree binding, signed portable replay, commit lookup and archive recovery. Existing affected suites remain valid because product code did not change: GitHub 331/331, factory 37/37, static Git 20/20, CLI/report 26/26 + 10/10, and all 1,000 model sequences in the complete Linux run. Those suites were previously run on this exact candidate; they were not rerun for documentation/private-driver-only changes.
2. **Implemented but provider/plan validation limited:** organization-wide ruleset enforcement remains an explicit Team/Enterprise environment gate. Coverage ingestion/evaluation/currentness and refusal are implemented, but positive live qualifying aggregates remain unavailable through the documented API. Repository policy tests do not replace organization-wide enforcement. Administration Read limitations are now experimentally isolated rather than treated as a plan restriction.
3. **Production owner gates:** optional companion App registration/customer authorization; KMS/JWKS identity and real signer acceptance; public trust/root publication; production host/storage/backup, pinned runtime and hosted acceptance; integration/deployment; private differential-lab scheduling/credential identity. The temporary development grant approves none of these. An eligible organization/Code Quality environment or paid change also requires owner approval.
4. **Unimplemented:** the positive GitHub coverage aggregate collection adapter remains unimplemented. Adequate provider evidence is still required before it can be built truthfully. The designed Enhanced Policy Proof credential integration and customer opt-in/UI also remain unimplemented; they are not silently present in `7953ecd`. The established pre-addendum charter accounting and optional omissions remain in [charter coverage](charter-coverage.md).

The signed queue gate is closed within the documented credential/environment boundary. Category 4 is nonempty, so the complete Level 3 outcome is not declared complete.
