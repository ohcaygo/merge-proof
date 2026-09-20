# GitHub capability addendum acceptance — 2026-09-20

Product candidate: `7492959d9ae5ef5bb9c889edb3bcfe3b410d8f69`, built on pre-addendum Level 3 baseline `a6800e68f4c1e03d0cd0de28fe7febe5864bcdc4`. Documentation commits do not supersede this product identity. No production deployment, App permission change, paid upgrade or public receipt anchoring occurred in this addendum run.

## 1. Implemented and live-validated

Execution protections use the existing collector, rules, producer/event binding, policy snapshot, currentness and receipt paths. Exact User/Bot identity, workflow path, event and policy revision time constrain positive execution. Applicable unreadable policy facts block proof. A demonstrated violation on an otherwise bound producer is FAIL; unresolved actor membership, rerun eligibility, scope, timing or execution is NOT_PROVEN. Per-workflow CI claim bindings preserve unrelated claims. Disabled, evaluate-only and unrelated policies are omitted from receipts. The product remains a read-only observer of these controls.

The existing owned public rules fixture, repository ID `1377343157`, provided eight passing live assertions on this exact product candidate: eligible actor/event VERIFIED; portable replay; policy change after execution NOT_PROVEN; only CI/policy currentness invalidated; excluded event refused; excluded actor refused; restored eligibility VERIFIED; main unchanged. GitHub returned `startup_failure` for the two prohibited runs. Their missing qualifying execution is NOT_PROVEN, not fabricated evidence of a completed failing job. The temporary policy change was restored and the synthetic PR closed unmerged. See [live results](addendum-live.json).

A live positive v6 receipt was signed with an ephemeral fixture P-256 key and verified by the packaged CLI using an independently supplied public key. The 149-file npm package also verified trusted historical receipts and independently recomputed their Git content; existing v2–v5 archives were preserved. This establishes fixture signing and portable compatibility, not production KMS or present currentness of historical receipts.

Local complete affected suite: 330/330 GitHub tests, including 1,000 service/world sequences, 1,000 new coverage arithmetic fixtures, negative binding tests and reconstruction tests. Required addendum cases cover eligible actor/event, wrong actor/event, post-evidence policy changes, satisfied/failed/missing coverage, coverage policy currentness and duplicate check substitution. [Local output](addendum-local-github-tests.txt), [package smoke](addendum-package.json).

## 2. Implemented but blocked from positive live validation by provider/plan limits

Coverage rule ingestion, source/threshold provenance, exact rational threshold/drop evaluation and dependent claim currentness are implemented. Fixtures require complete aggregate line counts, exact repository/PR/head/candidate commit/tree, producer/workflow/blob/event/attempt/job links, and a current default-branch baseline for a drop requirement. Zero disables its threshold, as GitHub documents. Demonstrated bound violations are FAIL; ambiguous or unavailable measurements are NOT_PROVEN.

These fixtures describe an internal evidence contract, not an invented GitHub response. GitHub's documented REST surface exposes coverage rules, Code Quality configuration/findings and upload processing status, but not a complete aggregate with the necessary candidate/producer provenance. The official upload action targets PR heads and skips merge groups. Live collection therefore returns `GITHUB_COVERAGE_BOUND_AGGREGATE_API_UNAVAILABLE`. A successful upload, check, bot comment or rule-suite rollup cannot substitute for qualifying evidence. Team/Enterprise Cloud with Code Quality and coverage uploads is the documented minimum environment for live coverage; such an environment alone does not establish that the API exposes the required proof facts.

Organization-wide ruleset enforcement remains a separate Team/Enterprise validation gate. Repository-level ruleset and Actions-policy observations do not stand in for it. The latest organization readback remains Free. Unsupported/insufficient evidence paths remain in the product as explicit NOT_PROVEN boundaries; none was removed to obtain green tests.

## 3. Owner gates

- Add **only** `ohcaygo/merge-proof-l3-lab-queue-headgreen` to development App installation `160648161` through [GitHub owner settings](https://github.com/organizations/ohcaygo/settings/installations/160648161). The final-candidate positive signed merge_group → exact candidate/evidence/currentness → landed tree → portable receipt journey is still pending. The latest repository-installation read is 404. Use the isolated runner; never the abandoned product-repository fixture.
- The Actions policy API documents Administration **write** for reads, while the unchanged App requests Administration read. Bearer-authorized live validation succeeded. Once the isolated repo is selected, verify the actual App read response before attempting positive signed acceptance. If unavailable, preserve NOT_PROVEN and report this provider permission limitation; selection alone must not be reported as sufficient. No App scope change is authorized here.
- Choose an existing Team/Enterprise test organization or explicitly approve a paid plan change for organization-wide ruleset enforcement and eligible Code Quality validation. Do not infer enforcement from a Free-plan ruleset API accepting parameters.
- Existing production gates remain: KMS/JWKS identity and live signer acceptance; independent public-key/root publication and anchoring authority; production credentials, persistent runtime/storage and deployment; private weekly differential-lab scheduler and credential identity. Their implementation is retained from the Level 3 baseline and their activation remains unperformed.

## 4. Unimplemented

The positive GitHub coverage aggregate collection adapter remains unimplemented because the documented provider API does not expose the required qualifying facts. The evaluator and refusal boundary do not close this item. Reassess actual API evidence in the approved eligible environment and implement an adapter only when sufficient facts can be bound; do not replace it with comments, fabricated metrics or a weaker producer/event contract.

This is an explicit remaining addendum implementation item. Level 3 is not called complete. The pre-addendum charter, full exact-candidate chain and all production owner gates remain in force.

## Primary provider sources

- [Actions policies REST API](https://docs.github.com/en/rest/actions/policies): inherited discovery, actor/event/workflow conditions, revision timestamps and read permissions.
- [Workflow execution protections](https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution): public repositories; private repositories on Team/Enterprise; provider-owned controls.
- [Coverage condition REST announcement](https://github.blog/changelog/2026-09-18-manage-the-code-coverage-ruleset-condition-with-the-rest-api/): Team/Enterprise Cloud and Code Quality/coverage prerequisites.
- [Coverage threshold semantics](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/restrict-code-coverage): minimum, percentage-point drop and zero disables.
- [Code Quality REST surface](https://docs.github.com/en/rest/code-quality), [rule-suite response](https://docs.github.com/en/rest/repos/rule-suites), [official upload action](https://github.com/actions/upload-code-coverage): observed evidence limits, not inferred success.
