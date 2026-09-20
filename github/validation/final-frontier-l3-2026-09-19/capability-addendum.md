# GitHub capability addendum acceptance — 2026-09-20

Product candidate: `7953ecdbd849c8afe0379bfec1b4a61133292c62`, built on pre-addendum Level 3 baseline `a6800e68f4c1e03d0cd0de28fe7febe5864bcdc4`. Documentation commits do not supersede this product identity. The original addendum run made no production deployment, App permission change, paid upgrade or public receipt anchor. The subsequent owner-authorized temporary development Administration Write run passed the [final signed queue acceptance](signed-queue-final.md) and restored Read; the production permission model remains undecided.

## 1. Implemented and live-validated

Execution protections use the existing collector, rules, producer/event binding, policy snapshot, currentness and receipt paths. Exact User/Bot identity, workflow path, event and policy revision time constrain positive execution. Applicable unreadable policy facts block proof. A demonstrated violation on an otherwise bound producer is FAIL; unresolved actor membership, rerun eligibility, scope, timing or execution is NOT_PROVEN. Per-workflow CI claim bindings preserve unrelated claims. Disabled, evaluate-only and unrelated policies are omitted from receipts. The product remains a read-only observer of these controls.

The existing owned public rules fixture, repository ID `1377343157`, provided eight passing live assertions on proof candidate `7492959`: eligible actor/event VERIFIED; portable replay; policy change after execution NOT_PROVEN; only CI/policy currentness invalidated; excluded event refused; excluded actor refused; restored eligibility VERIFIED; main unchanged. GitHub returned `startup_failure` for the two prohibited runs. Their missing qualifying execution is NOT_PROVEN, not fabricated evidence of a completed failing job. The temporary policy change was restored and the synthetic PR closed unmerged. See [live results](addendum-live.json). Intermediate `470f679` repaired PDF process cleanup. `8882acd` also fixes the policy-snapshot claim: unavailable execution-policy discovery or malformed coverage parameters produce UNKNOWN instead of asserting snapshot completeness. The overall verdict already remained NOT_PROVEN. The final packaged v7 engine replayed all five retained live-policy captures with the same verdicts and verified a newly signed replay receipt. This is replay of recorded observations, not a new live observation or present-currentness claim, and does not stand in for the pending final-candidate signed queue journey. See [exact replay scope](addendum-v7-replay.json).

A live positive v6 receipt was signed with an ephemeral fixture P-256 key and verified by the packaged CLI with an independently supplied public key. The final 165-file package preserves v2–v6 alongside v7 and verifies current and historical signed receipts, independent Git reconstruction, MCP and the gh shim. This establishes fixture signing and portable compatibility, not production KMS or present currentness of historical receipts. [Package evidence](addendum-final-package.json).

Final candidate `7953ecd` passed the [complete Linux acceptance run](https://github.com/ohcaygo/merge-proof-l3-lab-classic/actions/runs/35522968961), using the exact committed source archive, Node 22.23.2 and real Chromium. [Source/archive/runtime provenance](addendum-final-linux.json).

| Final validation | Result |
| --- | --- |
| Complete GitHub regression, model and reconstruction suite | 331/331 locally and on Linux; [local](addendum-final-local-github-tests.txt), [Linux](addendum-final-linux-github-tests.txt) |
| Real factory HTTP/Git/PDF journey | **37/37**, zero failures or skips; [output](addendum-final-factory-tests.txt) |
| Pinned static Git reconstruction/portable chain | **20/20** with the retained Git 2.50.1 binary hash; [output](addendum-final-reconstruction-tests.txt) |
| CLI and report regressions | **26/26 + 10/10**; [output](addendum-final-cli-tests.txt) |
| Service/world model | 1,000 sequences, 28,578 actions, 28,600 deliveries, 949 duplicates, 705 faults and seventeen invariant obligations; **68.147 seconds in CI**, below the required 120 seconds; [model](addendum-final-linux-model.json) |
| Targeted event budget | 30 PRs / 200 events, 300 counted reads and 11,950 actual network requests; conditional 304 reads remain separately counted; [budget](addendum-final-linux-budget.json) |

The affected regression suite includes all nine requested addendum cases, 1,000 numeric coverage fixtures, producer/event substitution, claim-local policy currentness and signed portable replay. The world model is bounded generated testing, not exhaustive formal proof.

The serial `8882acd` model passed every assertion but exceeded the CI time budget at 188.750 seconds. Final `7953ecd` distributes every original seed across at most four isolated workers, retains failure shrinking and enforces the timing limit in CI. Every model counter matches the serial run; the runtime package and v7 engine bytes are unchanged. Locally the complete suite took 40.892 seconds and the model 27.802 seconds. No acceptance criterion or fixture was removed.

Earlier factory diagnostics found two distinct problems: the first Linux fixture archive omitted shipped sample assets and stalled before PDF generation; separately, an independently reproduced browser descendant retained stderr after its parent exited. The archive now includes `samples/`; `470f679` closes only its owned browser process group and adds the regression. The macOS sandbox bootstrap failure remains an environment observation, not a substituted passing result. The final complete Linux factory run above closes the requested non-production factory acceptance.

## 2. Implemented but blocked from positive live validation by provider/plan limits

Coverage rule ingestion, source/threshold provenance, exact rational threshold/drop evaluation and dependent claim currentness are implemented. Fixtures require complete aggregate line counts, exact repository/PR/head/candidate commit/tree, producer/workflow/blob/event/attempt/job links, and a current default-branch baseline for a drop requirement. Zero disables its threshold, as GitHub documents. Demonstrated bound violations are FAIL; ambiguous or unavailable measurements are NOT_PROVEN.

These fixtures describe an internal evidence contract, not an invented GitHub response. GitHub's documented REST surface exposes coverage rules, Code Quality configuration/findings and upload processing status, but not a complete aggregate with the necessary candidate/producer provenance. The official upload action targets PR heads and skips merge groups. Live collection therefore returns `GITHUB_COVERAGE_BOUND_AGGREGATE_API_UNAVAILABLE`. A successful upload, check, bot comment or rule-suite rollup cannot substitute for qualifying evidence. Team/Enterprise Cloud with Code Quality and coverage uploads is the documented minimum environment for live coverage; such an environment alone does not establish that the API exposes the required proof facts.

Organization-wide ruleset enforcement remains a separate Team/Enterprise validation gate. Repository-level ruleset and Actions-policy observations do not stand in for it. The [final readback](addendum-final-gates.json) remains Free and confirms unchanged product main, unchanged development-App permissions, restored disabled policy and zero open fixture PRs. Unsupported/insufficient evidence paths remain in the product as explicit NOT_PROVEN boundaries; none was removed to obtain green tests.

## 3. Owner gates

- **Repository selection and isolated signed queue gate closed.** Exactly the approved product and queue fixture remain saved. The final candidate passed all 13 real signed queue-to-landed assertions, independent Git replay and archive restart under the temporarily approved lab credential. [Current acceptance and exact boundary](signed-queue-final.md).
- **Production default is Administration Read.** Ryan selected an optional Enhanced Policy Proof design after the [focused investigation](least-privilege.md) found no equivalent documented narrower source. Real Read returns policy-list 403; temporary lab Write returned 200 and was restored. Stock `7953ecd` still issues Read tokens. The dedicated optional credential integration/customer opt-in is designed but unimplemented; companion App registration and customer grants remain explicit external gates. No production permission changed.
- Choose an existing Team/Enterprise test organization or explicitly approve a paid plan change for organization-wide ruleset enforcement and eligible Code Quality validation. Do not infer enforcement from a Free-plan ruleset API accepting parameters.
- Existing production gates remain: KMS/JWKS identity and live signer acceptance; independent public-key/root publication and anchoring authority; production credentials, persistent runtime/storage and deployment; private weekly differential-lab scheduler and credential identity. Their implementation is retained from the Level 3 baseline and their activation remains unperformed.

## 4. Unimplemented

The positive GitHub coverage aggregate collection adapter remains unimplemented because the documented provider API does not expose the required qualifying facts. The evaluator and refusal boundary do not close this item. Reassess actual API evidence in the approved eligible environment and implement an adapter only when sufficient facts can be bound; do not replace it with comments, fabricated metrics or a weaker producer/event contract.

The subsequently requested optional Enhanced Policy Proof credential integration and customer opt-in/UI are designed but also unimplemented; see [the design](least-privilege.md). These remain explicit implementation items. Level 3 is not called complete. The pre-addendum charter, full exact-candidate chain and all production owner gates remain in force.

## Primary provider sources

- [Actions policies REST API](https://docs.github.com/en/rest/actions/policies): inherited discovery, actor/event/workflow conditions, revision timestamps and read permissions.
- [Workflow execution protections](https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution): public repositories; private repositories on Team/Enterprise; provider-owned controls.
- [Coverage condition REST announcement](https://github.blog/changelog/2026-09-18-manage-the-code-coverage-ruleset-condition-with-the-rest-api/): Team/Enterprise Cloud and Code Quality/coverage prerequisites.
- [Coverage threshold semantics](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/restrict-code-coverage): minimum, percentage-point drop and zero disables.
- [Code Quality REST surface](https://docs.github.com/en/rest/code-quality), [rule-suite response](https://docs.github.com/en/rest/repos/rule-suites), [official upload action](https://github.com/actions/upload-code-coverage): observed evidence limits, not inferred success.
