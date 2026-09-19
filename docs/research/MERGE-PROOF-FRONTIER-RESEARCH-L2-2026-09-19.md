# Merge-Proof frontier research, Level 2

Date: 2026-09-19. Prepared for Ryan (OHCAYGO). Builds on the Level 1 assessment in `MERGE-PROOF-DEEP-RESEARCH-2026-09-19.md`.

Method. Repository truth is `ohcaygo/merge-proof` at `c07eee9` (branch `claude/merge-proof-deep-research-czjemw`), read at source level; `npm run test:github` passes 199/199. Six research reports are attached under `sources/l2/`: A competitor source teardown (twelve repositories cloned and read), B provider-divergence and git reconstruction experiments (run locally, hashes reproducible), C false-green hunt against the real engine with runnable scratch scripts and saved outputs, D field-level GitHub API authority and provenance limits, E naming collision and competitive radar, F machine contract, signing and cross-platform normalization. No implementation was changed; no production or external system was mutated; only public reads occurred. Where a claim rests on a search excerpt rather than a fetched primary page, the source report marks it.

"Astra" in the questions is read as the engineering effort that will build what this document recommends.

---

## Lead answers

### A. Are we actually behind?

**Behind, exactly here.**

1. **Two real false-green paths exist in the shipped engine.** A PR-authored workflow whose job name collides with a required check wins by check-run id and is counted as recorded execution (VERIFIED, CURRENT); and any later run of the same workflow on the same SHA (dispatch, schedule) wins the same way because the run's trigger event is never collected. Both reproduced against the real modules (`sources/l2/falsegreen/falsegreen2.js`, F1 and F2). Nobody else has this exact bug because nobody else reads job-level execution at all, but it is our claim that is broken, not theirs.
2. **Currentness is coarse enough to be a liveness failure.** Every supported repository event marks every receipt in the repository STALE and re-queues every tracked PR; one proof costs about 38 GitHub requests; an active repository with many tracked PRs cannot converge, and under an enforcing preset the required check oscillates to failure. Organization-level ruleset webhooks are rejected outright, so an org admin removing a required check or adding a bypass actor never stales anything.
3. **Coverage.** Large classes of ordinary repositories can never reach VERIFIED: any CODEOWNERS or last-push approval rule, any non-Actions CI, any behind-base PR with Actions CI, seventeen of twenty-three ruleset rule types including push-time rules with no evidence relevance, any SHA with more than twenty workflow runs, any required job with a skipped step, any PR carrying a review from an account whose permission read fails. The product is fail-closed to the point of being unusable for the platform-engineering buyer it wants.
4. **Post-merge binding is nominal.** The merge ledger binds by commit SHA, so squash and merge-commit repositories always show "bound to PR head only"; there is no tree comparison although the tree SHA is already fetched.
5. **Packaging.** Aryamanz29/mergeproof ships a policy language, `replay`, `doctor`, JSON/JUnit/rdjson outputs, agent prompts and PyPI distribution; Agent Vigil ships signed receipts, a threat model, deployment-protection integration and delivery-id idempotency discipline; ShipProof ships in-toto statements with keyless signatures. We ship a receipt JSON behind an OAuth cookie and a local CLI that checks two things.
6. **Naming.** The one-word form is already owned by others in every namespace that matters: GenLayer holds mergeproof.com, the npm `@mergeproof` scope, and the private GitHub App slug `mergeproof`; Aryaman holds PyPI `mergeproof`, the Marketplace Action "mergeproof", and the top nine Google results for the exact word.

**Not behind, exactly here.**

1. **Nobody else answers the question.** Twelve adjacent projects were read at source level. None selects the merge candidate (test-merge ref with parent matching, or live queue entry), none requires two matching observations, none distinguishes a check conclusion from a workflow run, job and step record on that SHA, none intersects rulesets with classic protection, none binds approval to the current head by a non-author with observed write permission, none writes a merge-time ledger row, and none excludes its own check from its own requirements. The parts that would close the gap for them are the parts that take weeks, not days.
2. **The observation model is right.** Test-merge parent binding, group ancestry and live queue-entry matching, fail-closed classic-absence proof via GraphQL, own-check exclusion, and the explicit gaps/notChecked/limitations vocabulary all held up under adversarial fixtures. The engine's problems are in what it ignores, not in what it asserts.
3. **GitHub does not hold the record either.** Its own merge path landed 2,092 wrong squash commits on 2026-04-23 and detected it via support tickets after 3.5 hours; a tree comparison available through its own API would have fired on every affected merge within seconds. The SLSA Source Track names our gaps as open problems and its reference implementation trusts the same API we do.

### B. The deepest defensible layer

Merge-Proof should own the **exact-candidate merge evidence record with content binding**: for one pull request candidate, a deterministic, fail-closed statement of which required controls were satisfied by which platform-recorded evidence on which commit and which tree, under which rules snapshot, whether that record is still current, and whether the content that later landed on the base branch equals the content that was validated. The layer is defined by three comparisons GitHub never makes and no adjacent tool attempts: evidence to candidate (execution on the exact SHA, approval on the exact head, rules in force at observation), candidate to expected (the tree a correct merge of base and head would produce, computed from git objects), and landed to proven (the base tip's tree after merge against both). Everything else in the product exists to feed, publish or consume those three comparisons.

### C. Hardest capability for competitors or native GitHub to replace

**Landed-tree binding backed by independent expected-tree reconstruction, joined to the pre-merge evidence record.** GitHub could add a post-merge tree check tomorrow, but it has no incentive to publish a record of its own divergence, it keeps no queryable history of destroyed merge groups, and it exposes no "this merge was clean versus bypassed" bit. A competitor would need a hosted App with webhook idempotency, the candidate-selection state machine, job-level execution proof, a per-repository blobless git mirror, `git merge-tree` reconstruction across merge methods and queue shapes, and a receipt corpus of real divergences to calibrate false positives. That stack is weeks of work for a strong team and years of edge cases for anyone. The second-hardest is the refusal machinery itself: a product whose main output is what it did not prove is unattractive for a platform vendor and unappealing to a feature-count competitor.

### D. What Astra must build first (ordered, maximum ten)

1. **Close F1 and F2.** Collect run `event`, `path`, `head_branch` and `workflow_id` per execution row; treat two same-name check runs from different workflows on the target as ambiguous; accept execution only from `pull_request` and `merge_group` events for the target; make "candidate modified the workflow that produced an accepted check" a blocking gap, not a `ci-deploy` advisory. Proof-engine work.
2. **Precise currentness.** Hash only consumed evidence (required check rows, execution rows for accepted checks, opinionated reviews, rules, target, remote, git identity), exclude `mergeable` and `mergeable_state` from identity and consistency, stale only receipts whose bindings an event can touch, route merge-group events to the PR whose head is in the group, and accept organization-level `repository_ruleset` deliveries. Proof-engine work.
3. **Landed-tree binding in the ledger.** On merge, compare the landed commit's tree with the validated candidate's tree (`merge_group.head_commit.tree_id` or the test-merge commit's tree) and record `LANDED_MATCHES_PROVEN`, `LANDED_MATCHES_EXPECTED_NOT_PROVEN`, `LANDED_DIVERGES` or `LANDED_UNRESOLVABLE`. Pure API first. Proof-engine work.
4. **Rule-type triage and the false-NOT_PROVEN cliff.** Classify ruleset rule types as evidence-relevant, push-time (already enforced by GitHub at push; irrelevant to merge evidence), or genuinely unsupported; waive `BASE_DRIFT_UNVERIFIED` when execution is recorded on a target that contains the base; require write permission for a blocking `CHANGES_REQUESTED`; scope a failed permission read to that reviewer instead of poisoning the capture; raise or page the twenty-run cap; say "update branch" and "App approvals are excluded by policy" in the wording. Proof-engine and wording work.
5. **Approval provenance.** Record reviewer account class per approval, `latestOpinionatedReviews(writersOnly)`, dismissal actor and head, the pusher of the current head from the repository activity endpoint, and the distinct-human-principal count excluding the initiating human and bots; flag Bot-authored PRs whose distinct-human count is below configured plus one. Evidence ingestion.
6. **Bypass evidence from rule suites.** With Administration:read already requested, read the rule suite for the ref update after merge and record `result: bypass` and actor into the ledger, with the explicit sentence that `exempt` actors leave no record and that `bypass_actors` are hidden from read-only installations. Evidence ingestion.
7. **The decision contract.** `urn:merge-proof:decision:1`, `POST /proof/v1/decision` with caller-supplied expected head, base and target SHAs, PROCEED / HOLD / REFUSE / UNAVAILABLE, stable reason codes, typed next action, and the `--match-head-commit` pairing; `merge-proof status` and `gh merge-proof status` with exit codes 0/1/2/3/4/8/9; `external_id` and a machine line on the check run. Interface.
8. **Expected-tree reconstruction.** Per-repository blobless mirror, `git merge-tree --write-tree` (git 2.45 or later) for merge, squash and rebase in the clean case and sequentially for queue groups; pre-merge candidate-versus-expected on `merge_group.checks_requested`; post-merge landed-versus-expected. Proof-engine work; the differentiator.
9. **Corpus and state-machine tests.** Turn every finding in `sources/l2/C-false-green.md` and every experiment in `sources/l2/B-provider-divergence.md` into fixtures with expected truth, observed evidence, correct verdict and reason; add the invariants in section 17 as property tests. Research and data.
10. **Signed receipt.** In-toto Statement with `gitCommit` subjects for head, base and target plus the canonical receipt digest, DSSE with a KMS-held P-256 key, Rekor v2 `hashedrekord`, published JWKS, embedded bundle, and a dependency-free verifier. Interface and trust.

### E. What Astra should not build

A policy language or `when/require` file; code execution of the candidate's tests; test-weakening or assertion-deletion detection inside the verdict; AI review of any kind; CODEOWNERS full resolution as a merge claim (compute and label as inference only); SLSA Source Level issuance; an evidence vault, SBOM/VEX/SARIF store or framework mapping; Kubernetes admission integration; Sigstore keyless as a prerequisite; a browser extension, VS Code status item or menu-bar light before the decision contract exists; GitLab or Bitbucket adapters now; a self-hosted transparency log; a dashboard; any surface that competes with GitHub's merge box on readiness.

### F. New facts that materially change the trajectory

1. Two exploitable false greens in the current engine, both reachable by an ordinary PR author on a `pull_request`-triggered workflow. Until fixed, the "demonstrably ran" claim is false in those cases.
2. The repository-wide staling and re-queueing model makes an enforcing installation oscillate in any active repository. This blocks the platform-engineering buyer regardless of everything else.
3. The 2026-04-23 incident was detectable post-merge by a pure-API tree comparison and reproduced locally by a wrong merge base; the queue's `merge_group.head_commit.tree_id` is delivered in the webhook. Landed-tree binding is cheap and real.
4. `pull_request`-triggered Actions runs cannot be bound to the base they tested through any API field; only the job log line "HEAD is now at … Merge H into B" reveals it. This settles the target-selection question: the engine's insistence on a check on the test-merge SHA is over-strict for Actions, and the honest replacement is log-derived inference labelled as such, or the merge-group path, which is the one PR CI event whose tested commit is a first-class field.
5. `bypass_mode: exempt` produces no rule-suite record; `bypass_actors` are hidden from read-only installations; historical reviewer permission exists only in the Enterprise audit log. Absence of evidence must never read as safety, and the receipt now has exact sentences for each case.
6. Aryamanz29/mergeproof is not a hosted App (that PR was closed unmerged); it is a Marketplace Action and PyPI package converging on our vocabulary at a release a day. GenLayer's "MergeProof" holds the .com, the npm scope and the App slug since February 2026. The one-word name is not ours anywhere that matters; the hyphenated name is ours on npm, Marketplace and GitHub. Typo packages `mergeproof` on npm and `merge-proof` on PyPI are unclaimed.
7. Agent Vigil already ships signed receipts, delivery-id idempotency, a written threat model, deployment-protection integration and merge-group verification through an external dispatcher, from one author. The bar for "reference implementation" packaging is higher than Level 1 assumed.

### G. What would make Merge-Proof the reference product rather than another GitHub Action

Three things, in this order. First, **the truth boundary in section 19 published and enforced by tests**: every receipt states what was proven, observed, inferred, not knowable and refused, with the exact GitHub field or permission behind each line; nobody else does this because nobody else has the vocabulary. Second, **the three comparisons**: evidence-to-candidate, candidate-to-expected, landed-to-proven, with the reconstruction experiments in `sources/l2/B-provider-divergence.md` turned into a public, reproducible corpus of merge-integrity failures that others cite. Third, **a machine contract agents can gate on** that pairs a decision bound to caller-supplied SHAs with GitHub's own `expectedHeadSha` merge guard, so the SHA an agent proves and the SHA it merges are the same value by construction. A reference implementation is one whose definitions other people adopt; the definitions here are the state vocabulary, the binding set, and the invariants.

---

## 1. Current capability table

Verified against source at `c07eee9`. Ratings: implemented / partially implemented / researched only / unsupported / impossible with current permissions or APIs. File references are to `github/`.

| Capability | Rating | Evidence and limits |
|---|---|---|
| Exact candidate identification (repository id, PR, head SHA, head repository id) | implemented | `collect.js:104-146`; repository and PR identity asserted on every read |
| Base/head binding to the merge target | implemented | `collect.js:206-278`: head-contains-base, else test-merge ref with parents `[base, head]`, else group; `proof.js:211-219` re-checks binding |
| Merge group | implemented for HEADGREEN; ALLGREEN unsupported; group routed to every tracked PR in the repository | `collect.js:210-254`, `check.js:20-30`, `rules.js:82-85`, `service.js:533-545` |
| Stale evidence | partially implemented: event-driven, repository-wide, no reconciliation, org ruleset events rejected, false STALE on unrelated changes, no liveness bound | `service.js:439-447, 501-511`, `proof.js:262-296` |
| GitHub Checks as evidence | partially implemented: Actions job/step records only; same-app name collisions and trigger events invisible; non-Actions apps and commit statuses cannot prove | `proof.js:53-118`, `collect.js:346-385` |
| Approvals | partially implemented: current-head human approvals by non-author with observed write; CODEOWNERS, last-push, threads, teams unsupported; bots excluded silently; permission read at observation, not at approval | `proof.js:151-206`, `rules.js:33-52` |
| Rulesets and classic protection | partially implemented: checks, approvals, merge_queue flag, classic-absence proof; seventeen rule types block; `strict` collected and unused; `evaluate`-mode rules invisible by API | `rules.js`, `collect.js:20-101` |
| Merge ledger | implemented for head binding; landed-tree binding researched only | `ledger.js:30-95`, `service.js:566-603` |
| Actor classification | implemented: account type only; tool identity impossible with current APIs | `actors.js` |
| Bypass and exception information | unsupported: rule suites and `enforce_admins` are readable with permissions already held but not read; `bypass_actors` hidden from read-only installations by API; `exempt` leaves no record | none |
| CODEOWNERS | unsupported, fails closed; no API returns owners for a path; local match is inference only | `proof.js:180-187`, `setup.js:223-225` |
| Workflow identity (path, event, blob, modified-by-candidate) | unsupported; `workflows` rule type blocks VERIFIED | `collect.js:361-385`, `rules.js:86-89`, `proof.js:299` |
| Current receipt (currentness on read, refresh, never shows saved CURRENT as live) | implemented | `service.js:296-360` |
| Trial behaviour (starts only on complete CURRENT VERIFIED or NOT_PROVEN) | implemented | `meter.js:65-82`, `service.js:199-226` |
| Check Run UX | implemented, with ambiguous states listed in section 4 | `check.js:32-70`, `policy.js:98-173` |
| Machine-readable interfaces | implemented: receipt JSON with schema behind an OAuth cookie; no bearer or OIDC path; no decision object; no `external_id`; no machine line | `receipt.schema.json`, `http.js` |
| CLI | implemented, narrower than hosted: local analyzer checks drift and boundaries only; `github/cli.js` is an operator tool | `src/analyze.js`, `github/cli.js` |
| Agent interfaces (MCP, decision endpoint, wait) | researched only | `sources/l2/F-…` |
| Decision-time (at-merge) currentness | impossible with current APIs; no atomic merge observation | `ledger.js:55-59` |
| Historical two-parent re-proof | partially implemented; rules and approval validity marked unavailable | `collect.js:150-165` |

---

## 2. Competitor source teardown (summary; full detail in `sources/l2/A-competitor-teardown.md`)

Twelve repositories were cloned and read. Disambiguation first: "ChangeProof" is five unrelated things (a Node test-discrimination CLI, a Rust review-verdict tool, two hackathon projects, an IBM demo); "ShipProof" is two unrelated things (a Go intent-to-diff traceability tool with in-toto packaging, and a Python static-analysis scanner); "LetItLoop" is a WAL and AST checker whose README describes inputs its code does not have. None of these is a merge-integrity tool.

| Row | Merge-Proof | Aryamanz29/mergeproof | Agent Vigil | gittuf App | SLSA source-tool | pr-completion |
|---|---|---|---|---|---|---|
| Subject identity | head if it contains base, else test-merge ref with parent match, else live group entry | PR head SHA only | exact head; group `base_sha/head_sha` from event | PR head; `VerifyMergeable(base, head)` re-run on base push | post-merge commit via `/activity` | GitHub `headRefOid` + `mergeStateStatus`; lands with `--match-head-commit` |
| Freshness | two matching observations; CURRENT/STALE/UNAVAILABLE | single snapshot; approval and comment bound to sha7 | single run; 1-hour timeout to NOT CHECKED; public receipt continuity states | attestation bound to base and tree; re-verified on base push | "control active since" timestamps | fresh snapshot required at landing |
| Evidence source | GitHub checks, runs/jobs/steps, reviews, permissions, rulesets, protection, refs | REST PR, files, comments, reviews, check-run conclusions; PR-body links; diff shape | own execution in Docker plus transcripts; GitHub reviews and checks for the public receipt | signed review attestations in `refs/gittuf/*` | rulesets and activity API | `gh pr view/checks` plus GraphQL queue fields |
| Policy author | Merge-Proof invariants (no repo policy) | repo `mergeproof.yaml` | repo policy pinned to base SHA via `pull_request_target` | signed policy ref | separate policies repo | plugin defaults |
| Self-modification resistance | not applicable; own check excluded | policy yes if checkout uses default branch; workflow file no | yes in hosted lane; doctor rejects repo-owned `merge_group` | yes | yes | not applicable |
| Check semantics | conclusion versus run/job/step; skipped step is no proof | newest per name; success only; name-only, no app binding | latest per (app slug, name); neutral/skipped as unknown with reason code; runs tests itself | none | required checks must be Actions integration id | bucket/state coherence; unknown fails closed |
| Approval binding | current head, non-author, observed write, actor class | `commit_id == head`; non-author; `[bot]` suffix excluded; no permission check | counts latest approvals; no author, permission or commit binding; says so | approver `login+id` attested and signed | ruleset must require last-push and dismiss-stale | trusts `reviewDecision` |
| Rules and bypass | rulesets ∩ classic; bypass disclosed as unsupported | doctor only, not in the gate | not read; documents that status names are not trust roots | none | reads rulesets, bypass gap documented | trusts `mergeStateStatus` |
| Queue | live group entry as subject | none | dispatcher Worker plus control-repo workflow | none | none | queue-mode landing |
| Fail-closed | UNAVAILABLE / NOT_PROVEN with gaps | exit 3 on API error; previously posted status persists | NOT CHECKED is a failure conclusion | check failure if verify fails | control absent lowers level | unknown is not ready |
| Machine contract | receipt JSON, Check, ledger | JSON, JUnit, rdjson, exit 0/1/2/3, receipt on a branch, replay, schema | JSON receipts with schemas, SARIF, signed, CLI | attestations in a git ref | in-toto provenance plus VSA | JSON snapshot |
| Hosted or action | hosted App | Action plus CLI (PyPI); hosted PR closed unmerged | App (Workers) plus Action plus CLI | hosted App (OpenSSF) | CLI plus Actions | agent plugin |

What they do better today: Aryaman's policy shape, `replay` against merged PRs, `doctor`, agent prompts, JUnit/rdjson, documentation depth; Agent Vigil's executed evidence with claim reconciliation, test-integrity detectors, external queue dispatcher with HMAC envelopes, lost-POST recovery rule, one-hour timeout to a terminal state, public read-only receipt with `allowsProtectedAction:false`, signed receipts, deployment-protection integration, written threat model; gittuf's offline-verifiable approval attestations; source-tool's integration-id filter and "control active since"; pr-completion's `--match-head-commit` landing and check bucket coherence table; ShipProof's in-toto envelope and jargon-banned verdict block.

What could be copied from us in days: head-contains-base compare, test-merge parent check, reviewer permission lookup, reading rulesets, app-bound check publication. What would take them significant engineering: the observation model, job-level execution proof from GitHub, test-merge selection, rules intersection, a merge-time ledger written by an App. None solves exact-candidate integrity; Aryaman, ShipProof and LetItLoop are declared-policy tools, Agent Vigil is executed-evidence with a real queue story, gittuf and source-tool are attestation systems, pr-completion consumes GitHub's verdict.

What we should copy in days: app-slug-keyed latest-check selection and workflow-id ambiguity; reason codes `checks-neutral-or-skipped`, `check-timestamp-missing`; the one-hour queued-check timeout to a terminal state; delivery-id idempotency and lost-POST recovery discipline; JSON schemas per receipt version; `replay` of a stricter policy against recent merges; recording approver `login+id`, base and tree in the ledger row; the `/activity` endpoint as pusher and durability source; recommending `--match-head-commit` in next-action text.

---

## 3. Merge-integrity failure universe

Classification codes: **D** detectable from data already collected; **I** inferable with additional reads under current permissions; **P** partially observable; **N** not observable under any App permission; **E** requires elevated permission (Administration:read, Organization Administration, or ruleset write); **A** requires Enterprise audit data; **R** independently reconstructable from git objects; **T** provider-trust dependent (relies on GitHub's report of a SHA, tree or state). "Now" is the current engine's behaviour.

### 3.1 Candidate drift

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| Base changed after evidence | D | target re-selected; head-only Actions evidence becomes NOT_PROVEN; base push stales receipts | same, with precise staling; log-derived tested-base inference labelled INFER |
| Head changed (push, amend, force push) | D | `push` stales; approval on old head excluded; check on old head excluded | same; force push flagged from `push.forced` and `HeadRefForcePushedEvent` |
| Rebase of head | D | new SHAs; all evidence excluded | same; note content equality via tree as information, never as evidence reuse |
| Queue reordered or jumped | D, T | group event with new `head_sha`; selection re-verified | same; record `destroyed: invalidated` reason and jump |
| Merge group rebuilt | D, T | new group SHA; old group check retracted | same |
| Another PR entered or left the group | P, T | selection checks only this PR's ancestry; membership not enumerated | derive membership from `pull_request.enqueued` order and compare base..head commit list; HEADGREEN attribution stays partial |
| Synthetic merge changed (test-merge ref regenerated) | D, T | `TEST_MERGE_NOT_CURRENT` fails closed | same; note 2026-02-19 regeneration schedule in the receipt |

### 3.2 CI subject mismatch

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| CI ran on PR head rather than the merge candidate | D | NOT_PROVEN unless head contains base (over-strict for `strict: false` repos) | keep strictness; add log-derived inference of the tested merge commit and its base; merge_group path is PROVE-grade |
| CI ran on an old merge candidate | I | invisible: `pull_request` run's base is not an API field | INFER from job log line; NOT KNOW otherwise; say so |
| Check reused across SHA or state | D | check must be on target SHA; `commit_id`-bound | same |
| Stale successful check (base moved since) | D | covered by target selection | same |
| Cancelled or superseded run | D | highest id wins; cancelled later attempt fails closed; earlier failed attempt invisible | record attempt history |
| Duplicate check names, different apps | D | ambiguous → NOT_PROVEN (also when both succeed) | keep; compare conclusions to reduce false NOT_PROVEN |
| Duplicate check names, same app, different workflows | D (data present, not used) | **false green (F1)** | ambiguity by `workflow_id`; candidate-modified workflow blocks |
| Status versus check confusion | D | statuses accepted only for unbound rules; never execution proof | same |
| Skipped workflow (path filter, `[skip ci]`) | D | MISSING → NOT_PROVEN | same |
| Conditional job omission (job `if:`) | D | conclusion `skipped` → NOT_PROVEN (GitHub passes it) | keep; wording |
| Skipped step inside required job | D | no execution proof → NOT_PROVEN | keep as policy; wording; consider a documented allowance for `if: event_name` steps |
| Workflow run from the wrong event (dispatch, schedule, push on the branch) | I (field exists, not collected) | **false green (F2)** | collect `event`; allow `pull_request` and `merge_group` only |
| `pull_request_target` run | I | harmless by accident (head_sha is base tip) | collect `event`; never accept |
| Reusable workflow naming | D | works via `caller / callee` names | same |
| External CI (non-Actions app) | P | never VERIFIED | distinct weaker state `APP_ASSERTED_NO_EXECUTION_RECORD`; never VERIFIED |
| More than twenty runs on a SHA | D | WORKFLOW_LIMIT → NOT_PROVEN, freshness UNAVAILABLE | page or raise; filter by `path` |

### 3.3 Policy drift

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| Branch protection changed | D | `branch_protection_rule` stales | same; snapshot diff in receipt |
| Repository ruleset changed | D | `repository_ruleset` stales | same |
| Organization ruleset changed | D (delivery exists) | **rejected as INVALID_WEBHOOK_SCOPE; nothing stales** | accept; stale all receipts under the installation |
| Required checks changed | D | rules snapshot differs → STALE | same; diff named checks |
| Required workflow changed (org `workflows` rule) | P | rule type unsupported → never VERIFIED | classify as genuinely unsupported; record presence |
| CODEOWNERS changed on base | D | `push` stales | same |
| Review requirement changed | D | same | same |
| Deployment gate changed | P | `required_deployments` unsupported | keep unsupported; record |
| Ruleset target or ref changed | D | active-rules endpoint reflects it | same |
| Evaluate-mode rules | N | invisible by API | say "GitHub returns active rules only" |
| Rules in force at merge time, reconstructed later | E, P | not attempted | rule suite `rule_evaluations[]` with Administration:read within a month; ruleset history needs write |

### 3.4 Authority changes

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| Approval dismissed | D | latest state per user; DISMISSED excluded | record dismissal actor and head |
| Approval became stale (head moved) | D | excluded by `commit_id` | same; report GitHub's own dismissal state |
| Approving actor lost authority | P | permission read at observation; historical NOT KNOW (FPT) | label "authority as of receipt time"; A on GHEC |
| Approving actor gained authority after approving | P | counts (GitHub does too) | note in receipt |
| Copilot or bot approval | D | excluded, wording silent | record Bot approvals as observed-not-counted; note Copilot approvals setting is not readable |
| Author approval (co-author of commits) | D | counts (GitHub does too) | advisory `REVIEWER_AUTHORED_COMMITS` |
| Bypass actor exists | E (ruleset write) | not read; hidden to read-only | say hidden |
| Administrator exception (classic) | E, A | not read | `enforce_admins` with Administration:read; override records A only |
| Pull-request-only bypass used | E | not read | rule suite `result: bypass` within a month |
| Always bypass used | E | same | same |
| Exempt bypass used | N | invisible by design | state that absence of record is not proof |
| Emergency exception (delegated bypass) | E, A | not applicable to branch rules; push rules and secret scanning only | record existence for push rules where readable |
| Direct push to protected branch | D | `push` to base observed; not attributed to a PR | `/activity` `activity_type: push` on the base ref → flag |
| Direct or indirect merge | P | PR marked merged; ledger records whatever receipt existed | `LANDED_UNRESOLVABLE(reason=indirect)` when `merge_commit_sha` is not in the push range |
| Merge by a different actor than expected | D | `merged_by` from webhook | cross-check with REST; record actor class |
| Who pushed the current head | I | not recorded | `/activity` row for `after = head` |

### 3.5 Workflow tampering or signal weakening

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| Failing assertion removed, test skipped, command weakened, coverage reduced | N (semantic) | out of scope by contract | remains out of scope; record which workflow and job executed so others can reason |
| Workflow changed in the same PR | D (paths collected) | `ci-deploy` advisory only | blocking gap when the modified workflow produced an accepted check |
| Required job renamed or required check replaced | D | MISSING or name mismatch → NOT_PROVEN | same |
| Policy file edited in the same PR | not applicable | no repo policy | keep no repo policy |
| Evidence generator edited by the candidate | D | same as workflow changed | same |
| Action pinned by mutable tag (tj-actions class) | I | not recorded | record `sha_pinning_required` policy state and unpinned `uses:` in the executed workflow blob |

### 3.6 Merge semantics

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| Squash | R | ledger HEAD_ONLY always | expected tree = `merge-tree(base tip, head)`; landed tree compare |
| Rebase | R (final tree), N (per-commit) | HEAD_ONLY | final-tree compare; per-commit unresolvable |
| Merge commit | R | HEAD_ONLY unless target equals landed | parents check plus tree compare |
| Merge queue, single PR | R, T | group binding pre-merge; no post-merge | landed versus `head_commit.tree_id` and versus expected |
| Multi-PR groups | R sequential, T | ALLGREEN unsupported; HEADGREEN partial | sequential expected trees; per-PR attribution partial under HEADGREEN |
| Conflict resolution | R | GitHub never auto-resolves; entry dequeued | any landing after a predicted conflict is divergence or bypass |
| Automatic conflict repair by an agent | D | new head SHA, evidence excluded | same; flag Bot pusher |
| Platform-created merge commits | T | trusted from webhook | tree compare removes trust |

### 3.7 Provider correctness

| Failure | Class | Now | Best achievable |
|---|---|---|---|
| GitHub reports success but the resulting tree is wrong (2026-04-23) | D post-merge (pure API), R | undetected | landed tree versus `merge_group.head_commit.tree_id`; then versus expected |
| Merge-group candidate differs from expected content | R pre-merge | undetected | `merge-tree(base_sha, head)` versus `head_commit.tree_id` on `checks_requested` |
| Post-merge default branch differs from the proven candidate | D, R | undetected | landed versus proven tree |
| API state inconsistent with git object state | P | two-observation consistency catches transient cases | compare `merge_commit_sha` reachability with `compare` status and push range |

---

## 4. False-green research (summary; findings, fixtures and outputs in `sources/l2/C-false-green.md` and `sources/l2/falsegreen/`)

**False VERIFIED (both reproduced, both VERIFIED with CURRENT freshness).**

| Id | Reproduction model | Expected | Current | Desired | Severity | Fix |
|---|---|---|---|---|---|---|
| F1 | Required check `test` bound to Actions; workflow 30 job `test` fails on the target; PR adds `.github/workflows/fake.yml` (workflow 31) with job `test` that succeeds; execution rows for both | ambiguous or blocked | highest check id wins; `ambiguous` compares app ids only; VERIFIED, `chosen_workflowId=31`, boundary advisory only | ambiguity by workflow id; candidate-modified workflow is a blocking gap | high | strengthens core |
| F2 | Same workflow id; `pull_request` run fails; later `workflow_dispatch` run on the same SHA succeeds | not accepted | run `event` never collected; VERIFIED | collect `event`, accept only `pull_request` and `merge_group` | medium-high | strengthens core |

**Evidence trusted too strongly.** Highest-id check run as "the" check; any Actions run on the target regardless of trigger; reviewer permission at observation as permission at approval; webhook `merged_by`, `merge_commit_sha`, `head.sha`, `merged_at` without a REST cross-check; single-point remote ref read (documented).

**Information ignored.** Run `event`, `path`, `head_branch`, `pull_requests[]`, `referenced_workflows`, `head_repository`; job `workflow_name` and timing; earlier attempts; check `started_at` versus head push time; rule suites, `bypass_actors`, `enforce_admins`, `check_response_timeout_minutes`, `merge_method`; `strict`; `auto_merge`; `author_association`; workflow blob at the target; `previous_filename`; CODEOWNERS content and team membership; organization-level webhook deliveries.

**False NOT_PROVEN, ranked by repositories excluded.** CODEOWNERS or last-push approval required (never VERIFIED); non-Actions check or commit-status CI (never); seventeen ruleset rule types including push-time rules (never); behind-base PR with Actions CI regardless of `strict`; any skipped step or any failed non-required job in the run; more than twenty runs, thirty reviewers, three hundred files, five hundred check runs; a review from an account whose permission read fails (freshness UNAVAILABLE forever, gate failure, trial never starts); `mergeable` computed between observations; CHANGES_REQUESTED from a read-only account; Bot approvals excluded with silent wording; `BASE_DRIFT_UNVERIFIED` while execution is recorded on the test-merge or group commit; skipped or neutral required conclusion; two apps both succeeding under an unbound rule; any repository event during the roughly forty-request window.

**Ambiguous states.** VERIFIED with freshness UNAVAILABLE; NOT_PROVEN with check `success` titled "merge requirement satisfied"; VERIFIED at ADMISSION_ONLY published `success` on the head; `acceptedCount` full with `ci.state` NOT_PROVEN; STALE with historical VERIFIED and check failure caused by an unrelated PR's event; PROOF_BOUND_TO_PR_HEAD_ONLY on every squash and merge-commit row; remediation text "run the required validation against the current version" when it did run.

**Liveness.** Thirty-eight requests per proof in the minimal fixture, times one hundred tracked PRs per cycle against a 5,000 per hour budget, serialized, re-staled by any event during the cycle; under enforcing policy every stale check is rewritten to failure before each re-proof.

The goal "make VERIFIED extremely difficult to earn incorrectly" is met everywhere except F1 and F2. The larger problem is the inverse: VERIFIED is too difficult to earn correctly.

---

## 5. Formal proof model

**Current implicit model.** A receipt is a function of one observation snapshot; freshness is a hash comparison over nine whole sub-objects; currentness at the service level is "any event in the repository". This is fail-closed but blind to which input changed, which is why STALE fires for a COMMENTED review, why an org ruleset edit is missed, and why F1 is possible (the claim "check X executed" carries no binding to which workflow produced it).

**Proposed explicit model.** Every evidence claim is a record:

```text
Claim(kind, subject, producer, policy, procedure, observedAt, configuration, evidence, bindings)
```

with the claim valid only while every content-addressed value in `bindings` is unchanged. Concretely:

| Claim | Subject | Producer | Procedure | Bindings (content-addressed) |
|---|---|---|---|---|
| CI_EXECUTED(check name) | target commit SHA and its tree | Actions app id, workflow id, run id, attempt | workflow file blob SHA at the target, run event | target SHA, workflow blob, required-check set hash, run conclusion set |
| APPROVAL_CURRENT | head SHA | reviewer id, account class, permission at observation | review id, `commit_id`, submitted time | head SHA, approval-rule hash (count, dismiss-stale, last-push, code-owner), set of opinionated review ids and states |
| RULES_SNAPSHOT | base ref | rulesets and classic protection | active-rules endpoint, protection endpoint, GraphQL absence proof | hash of normalized requirements and of unsupported set |
| TARGET | PR | GitHub (test-merge or group) or Merge-Proof (expected tree) | parent match, ancestry, queue entry | base SHA, head SHA, target SHA, target tree, merge method |
| REMOTE_DURABLE | head ref | head repository | ref read | head SHA |
| LANDED_BOUND | base tip after merge | GitHub merge path | tree compare | landed tree, proven tree, expected tree |

The verdict is the conjunction of required claims; freshness is per-claim re-evaluation of bindings. `STALE` is emitted only when a bound value changed; a new unrelated check run, a comment review, or a `mergeable_state` flip leaves every binding intact and the receipt CURRENT after a cheap recheck. "What changed" becomes a list of claims and the binding that moved.

**Minimum state that must remain identical for evidence to remain current.** Base tip SHA; head SHA; target SHA and tree (and for a queue, the group entry id and state); the normalized required-check set with app bindings; the approval-rule parameters; the set of opinionated reviews with ids, states and commit ids; the check run ids, conclusions and workflow ids for required names on the target; the execution rows for accepted checks; the head ref's observed SHA; the App's permission set. Not part of the binding set: unrelated check runs, comment reviews, GitHub's mergeability opinion, other PRs' events, timestamps.

**Equivalence.** Evidence for subject A never satisfies subject B. The one defined equivalence worth stating is content equality of trees: a rebased head with an identical tree and an unchanged base tip is content-identical to the proven candidate. That fact should be reported as information ("content-identical to proven candidate at …") and never used to transfer a claim, because GitHub's own checks are commit-bound and a buyer expects the check to exist on the commit that merges.

**Should this be a formal proof graph?** Yes, but a small one: a map from claim to bindings, with content hashes, persisted with the receipt. It is not a general DAG engine and it should not be exposed. It prevents: F1 (binding to workflow blob and id), F2 (binding to run event), the false-STALE class (per-claim bindings), the org-ruleset blind spot (rules claim bound to the requirements hash, re-evaluated on any ruleset delivery), the ambiguous "what changed" output, and the ledger's head-only binding (LANDED_BOUND is a first-class claim). It does not prevent anything GitHub does not expose; those remain NOT KNOW claims with a stated reason.

---

## 6. Provider-divergence detection (summary; experiments and matrix in `sources/l2/B-provider-divergence.md`)

**The incident.** 2026-04-23, 16:05 to 20:43 UTC: merge-queue squash merges of groups with more than one PR produced incorrect merge commits; "changes from previously merged PRs and prior commits were inadvertently reverted"; 230 repositories and 2,092 PRs; cause was an incompletely gated code path adjusting merge-base computation for queue ref updates; detected via support inquiries at 19:38, not monitoring. Reproduced locally by squashing the second PR of a group against a base that already contained the first PR: the three-way merge treats the first PR's changes as removed and drops them; the wrong tree differs from the validated group tree.

**Which comparison would have fired.** Post-merge only. Pre-merge, the group commit was correct; CI validated it. The cheapest detector needs no git objects: the tree of the new base tip after the group merged versus `merge_group.head_commit.tree_id`, which GitHub delivers in the webhook itself. The trust-free detector recomputes the expected tree from objects.

**Reconstruction results (git 2.43 locally; pin 2.45 or later in production for tree-only merge bases).**

| Method and shape | Expected versus provider candidate (pre-merge) | Landed versus provider candidate (post-merge) | Landed versus expected (post-merge) |
|---|---|---|---|
| Merge commit, no queue | provider-trust dependent (test-merge tree): catches substitution | provider-trust dependent: catches divergence | **independent**: catches divergence, base movement, stale-head squash; second parent must equal proven head |
| Squash, no queue | not applicable | not applicable | **independent**; expected tree is `merge-tree(base tip, head)`, collapsing to the head tree only if base did not move |
| Rebase, no queue | not applicable | not applicable | independent for the final tree in the clean case; per-commit impossible; rebase can conflict where merge is clean |
| Queue, merge method, single PR | **independent** | provider-trust dependent | **independent**; landed commit may equal `head_sha` (observe, do not assume) |
| Queue, squash, single PR | independent | **provider-trust dependent; this is the incident detector** | independent |
| Queue, rebase, single PR | independent | provider-trust dependent | independent (final tree) |
| Multi-PR ALLGREEN | independent sequentially, needs member list | provider-trust dependent | independent; order matters only under conflicts, which should never land |
| Multi-PR HEADGREEN | same | same | per-PR attribution partial: landed content includes PRs whose own checks failed |
| Indirect merge | not applicable | impossible | impossible; classify as bypass |
| Conflict at landing | expected undefined | anything landing is divergence or bypass | same |

Rename-detection thresholds are the one algorithm knob that can make a clean expected tree disagree with GitHub's; record the git version and options in the receipt. Criss-cross histories: never pass a single explicit merge base when `merge-base --all` returns more than one.

**Data and cost.** Tree SHAs via `GET /git/commits/{sha}` or GraphQL `Commit.tree.oid` (Contents:read). Objects via a persistent blobless mirror per repository (`--filter=blob:none`) authenticated with the installation token as `x-access-token`; `merge-tree` lazily fetches only blobs changed on both sides. Shallow clones are unusable.

**Honest receipt states.** `EXPECTED_TREE`, `PROVIDER_CANDIDATE_TREE`, `LANDED_TREE`; comparisons labelled independent or provider-trust dependent; "provider candidate tree recorded; expected tree not reconstructable" for rebase replay conflicts, HEADGREEN without the member list, indirect merges, missing objects, and multiple merge bases.

**Differentiator?** Yes. No adjacent tool and no GitHub feature compares landed content to validated content; the `pull_request.dequeued` reasons `GIT_TREE_INVALID` and `INVALID_MERGE_COMMIT` show GitHub checks candidates, not landings. Independence is real only for the landed-versus-expected comparison; say so.

---

## 7. Pre-merge and post-merge integrity

Two linked stages strengthen the product without widening it, because the second stage reuses the first stage's record.

**Before merge.** Is the exact candidate currently proven under the intended controls? (Existing receipt, corrected per sections 4 and 5.)

**After merge.** Did the content we proved actually land, through the path the rules required? Triggers: `pull_request.closed` with `merged`, `push` to the base ref, `merge_group.destroyed` with `reason: merged`. Resolution is idempotent per delivery id and tolerant of arrival order; read specific objects, never "tip of base"; verify reachability with `compare`.

```text
landed = git/commits/{merge_commit_sha} -> tree, parents
if landed not reachable from base: LANDED_UNRESOLVABLE(not_on_base), retry with backoff
P = recorded candidate tree (group head_commit.tree_id or test-merge tree at proof time)
E = merge-tree(landed.parents[0], proven_head), sequential for groups
tree == P and tree == E  -> LANDED_MATCHES_PROVEN
tree == E, tree != P     -> LANDED_MATCHES_EXPECTED_NOT_PROVEN (substitution or base moved between proof and landing)
tree != E                -> LANDED_DIVERGES (attach diff stat)
E undefined              -> LANDED_UNRESOLVABLE (conflict, missing objects, rebase replay)
```

It detects provider divergence, queue anomalies, unexpected content, candidate substitution, out-of-queue landings (parent is not the recorded base tip), and, with the rule suite read, the bypassed path. It does not detect anything about deployment; deployment linkage stays a later verify-by-SHA lookup.

Scope test: the stage adds one webhook handler, one tree read and one optional reconstruction; it adds no policy, no UI beyond a ledger row state, and no new buyer. It strengthens the core.

---

## 8. Evidence of evidence

The smallest high-value provenance model for a CI claim, all from data readable with permissions already held:

| Question | Field | Grade |
|---|---|---|
| Which workflow produced it | `workflow_run.path`, `workflow_id`, job `workflow_name` | prove |
| Which workflow version | blob SHA of `path` at the tested SHA (Contents:read) | prove |
| Which event | `workflow_run.event`, `head_branch` | prove |
| Which attempt, and were earlier attempts failing | `run_attempt`, `previous_attempt_url` | prove |
| Which candidate tree | `merge_group.head_sha` (prove); `pull_request` runs: job log line "HEAD is now at … Merge H into B" (infer) or nothing | prove / infer / not know |
| Did the candidate modify that workflow | `candidateFiles ∩ {path}` | prove |
| Did the candidate modify its own tests | out of contract; record executed job names only | not claimed |
| Was the evidence reused | check on exact SHA, bound to run and attempt | prove |
| Was it produced before a relevant configuration change | check `completed_at` versus rules snapshot observation and ruleset event times | infer |
| Which commands and runner | step names, `runner_name`, `runner_group_name` | observe; never claimed as coverage |

Skipped-step handling stays a policy statement: a step skipped by `if:` is recorded as no execution proof for that job. Whether to allow a documented allowance for event-conditional publish steps is an owner-facing decision, not an engine default.

---

## 9. Approval and authority provenance (summary; full tables in `sources/l2/D-authority-agent-provenance.md`)

| Fact | Grade | Receipt sentence when unavailable |
|---|---|---|
| Reviewer identity (`user.id`, `type`) | prove | — |
| Review bound to head (`commit_id`, `submittedAt`) | prove | "review `commit_id` is null (commit garbage-collected)" |
| Dismissal, by whom, at which head (`ReviewDismissedEvent`) | prove | — |
| Approval counted by GitHub (`reviewDecision`, `latestOpinionatedReviews(writersOnly)`) | observe | "GitHub does not expose which approvals satisfied the rule" |
| Reviewer permission at approval time | observe now; not know historically on Free/Team | "authority reported as of receipt time, not approval time" |
| CODEOWNERS owners for the PR's files | infer (local match, last pattern wins, team members via Members:read); `reviewRequests.asCodeOwner` observe | "GitHub exposes no code-owner evaluation; Merge-Proof's match is an inference" |
| Rules in force at merge | observe now; prove within a month via rule suite (Administration:read) | "rules shown are current, not as of merge" |
| Merge used a bypass | prove within a month with Administration:read; `exempt` never recorded | "no rule-suite access or outside window; `exempt` actors leave no record; absence is not proof" |
| Who can bypass | not know (needs ruleset write) | "`bypass_actors` hidden from read-only installations" |
| Admin override (classic) | observe `enforce_admins`; override records Enterprise only | "override records need the enterprise audit log" |
| Who merged | prove | — |
| Who pushed the current head | prove if a repository activity row exists; force pushes via timeline | "no pusher record for a non-force push" |
| Copilot approval counted | observe (setting not readable) | "whether Copilot approvals count is a setting not readable by API" |
| Unattributed-Copilot extra approval applied | not know | "GitHub does not expose the effective required-approval count" |

Rule: absence of information never becomes safety. Each NOT KNOW row carries its sentence and the permission or plan that would change it.

---

## 10. Agent provenance

Signals ranked: platform-asserted (`type: Bot`, numeric id, `performed_via_github_app` on issue and timeline objects, commit `verification.verified` and `reason`, `triggering_actor`, Enterprise audit `actor_is_agent` and `agent_session_id`); vendor-asserted (Copilot's signed commits with human co-author and `Agent-Logs-Url`); self-asserted (unsigned trailers such as `Co-Authored-By`, `Claude-Session`, `Assisted-by`, PR body markers, committer noreply email); heuristic (branch prefixes).

What Merge-Proof can say: "acted by identity X, type Bot, id N" is proven; "X is a known AI vendor bot" is observed via an allow-list of ids (to be confirmed on the live installation); "written by an agent" is not knowable. The claude-code-action default committer string uses the github-actions bot id with the `claude[bot]` name, so a committer string can be mislabelled; a hidden "anthropic code agent" App was not findable in any reachable documentation and stays unverified.

Does it change merge integrity? Yes, in exactly the two places GitHub itself says so: an unattributed Copilot PR requires one more approval, and the initiating human cannot approve the agent's PR. Merge-Proof should compute distinct human principals (approvers with write, excluding the initiating human and any Bot), report it beside the raw count, flag Bot-authored PRs whose distinct-human count is below configured plus one, and flag bot-only approvals. Vendor trailers are recorded verbatim and labelled self-asserted.

---

## 11. Cryptographic receipt reality check

| Property | Signed DSSE receipt plus Rekor v2 entry |
|---|---|
| Receipt integrity | yes; the only property signing adds that the current fingerprint cannot, since the same party computes and could rewrite the hash |
| Issuer authenticity | yes, to the extent the verifier pins the published JWKS |
| Evidence authenticity | no; GitHub does not sign REST responses, check runs, reviews or rules; only channel TLS and webhook HMAC exist |
| Evidence freshness | no, and it must stay unsigned; signing currentness freezes a claim designed to expire |
| Correctness | never |
| Platform independence | none; the predicate is GitHub-shaped |

Minimal useful design: in-toto Statement v1 with subjects `head`, `base`, `target` as `gitCommit` digests and `receipt` as the canonical fingerprint; `predicateType` versioned with the receipt schema; DSSE with one ECDSA P-256 signature from a KMS key; JWKS at a well-known URL mirrored in the repository and in each receipt; Rekor v2 `hashedrekord` from the DSSE PAE with the self-managed public key (the log stores only the hash, signature and key, so private repositories leak nothing); embed the envelope and `TransparencyLogEntry` in the HTML receipt; ship a dependency-free verifier plus a cosign recipe. Cost about two engineer-weeks and about one dollar per key per month. Avoid: signing the decision or currentness, "GitHub-verified" wording, timestamps without a log, issuing SLSA source levels, keyless via an email identity, trusting `keyid`, a self-hosted log, signing HTML or PDF, blockchain wording, a green padlock that implies correctness.

---

## 12. Cross-platform possibility

The decision object and the subject core are platform-neutral by construction (`platform`, `candidate.kind/number`, three SHAs, open `targetKind` enum, reason codes without platform nouns). The evidence body is inherently per-platform and should stay behind `policy: github-exact-state-v1`. Approval-on-SHA is native only on GitHub; GitLab and Bitbucket record approvals with timestamps and reset policies, not commit ids. Bitbucket Cloud has no merged-result ref and no SHA precondition on merge, so the core TOCTOU promise cannot be kept there. GitLab's external status checks are the cleanest external gate of the three and a later port is four to six engineer-weeks with no migration of receipts or agent integrations, provided three naming rules are enforced now. Recommendation unchanged from Level 1: GitHub only for twelve months; buy only the naming discipline today.

---

## 13. Machine-first product (summary; schema, CLI, MCP and comparison in `sources/l2/F-machine-signing-crossplatform.md`)

"Proceed" means: the live head, base and (for queues) target equal the SHAs the caller supplied; the receipt for that subject is VERIFIED; currentness is CURRENT at a fresh observation; the repository policy evaluates to success where required; collection was complete and stable. Any mismatch is a refusal, never a silent re-target. The decision is a statement about a tuple, not about the PR.

TOCTOU is closed on the head by pairing the decision with GitHub's own guard: `PUT …/pulls/{n}/merge` with `sha`, GraphQL `expectedHeadOid`, `gh pr merge --match-head-commit`, MCP `merge_pull_request.expectedHeadSha`. Base movement between decision and merge is not rejected by GitHub; the decision re-observes base immediately before answering, and with a queue the agent only enqueues.

Contract: `urn:merge-proof:decision:1` with `outcome` PROCEED / HOLD / REFUSE / UNAVAILABLE, `proceed` boolean, separate `verdict` and `currentness`, `subject`, `request.matched` and `mismatch`, `reasons[].code` (append-only), `missingEvidence[].satisfiedBy` (events that trigger automatic re-proof), `nextAction.kind` including `MERGE_WITH_SHA` with merge arguments, `receipt` pointer; under 4 KB. CLI `merge-proof status` and `gh merge-proof status` with `--expect-head`, `--require`, `--wait`, `--json`; exit codes 0 proceed, 1 usage or internal, 2 hold, 3 refuse, 4 auth, 8 wait timeout, 9 unavailable; exit 0 means exactly one thing. MCP tool `merge_proof_decision` with `outputSchema`, `readOnlyHint`, stdio first then Streamable HTTP with OAuth 2.1; no merge tool ever exposed. REST `POST /proof/v1/decision` with GitHub token pass-through, Actions OIDC (agents must still pass the PR head, never `github.sha`), and optional installation-bound API keys; HTTP status never encodes the verdict. Check run: `external_id` = decision id, last line of `output.text` a JSON comment following the convention Anthropic's code review uses. Webhook `decision.changed` with HMAC.

No adjacent tool combines caller-supplied subject SHAs, a tri-state that separates "not yet" from "no", stable reason codes, a typed next action and an explicit observation time. The GitHub MCP server supplies the merge-side guard; Merge-Proof supplies the decision-side half and makes the two SHAs identical by construction. Agent instruction text for AGENTS.md and CLAUDE.md is in the source report.

---

## 14. Human surface

Re-evaluated after the proof model: the beacon is the check run, unchanged from Level 1, with corrections. Current proof state is the conclusion and title; freshness is the observation time in the title, never a live claim; what changed is the list of claims whose bindings moved (section 5), not a hash diff; missing evidence is the reason codes with their receipt sentences; next action is the typed `nextAction` rendered as text plus the three `requested_action` buttons; the receipt is the permalink with the signed bundle. Two ambiguous states must go: NOT_PROVEN with a `success` conclusion needs a title that says "requirements enforced by your policy are satisfied; evidence gaps remain"; ADMISSION_ONLY VERIFIED published `success` on the head needs "queue proof pending" in the title and the group-stage check must be posted before the queue's status-check timeout, which the precise-currentness work makes possible. No browser extension, IDE item or menu-bar light until the decision contract exists.

---

## 15. Copyability test

| Component | Weekend | Two weeks | Three months | Why |
|---|---|---|---|---|
| UI (check run, receipt HTML) | yes | | | commodity |
| CLI | yes | | | commodity once the contract is public |
| Rules normalization (rulesets ∩ classic) | | yes | | source-tool shows the reference; edge cases (classic absence via GraphQL, unknown types) take longer |
| GitHub integration (App, webhooks, idempotency, retries) | | yes for a basic App | | Agent Vigil did it in one codebase; queue and dual publication add time |
| Receipt schema and signing | | yes | | standards-shaped; ShipProof and Agent Vigil already have it |
| Proof engine (candidate selection, execution proof, two observations, approval binding) | | | yes, with the false-green fixes | nobody has all of it; each piece is learned against real GitHub behaviour |
| Failure corpus | | | no | accumulates only with real receipts and real divergences |
| Exact-candidate state machine with per-claim bindings | | | yes, if they read this document | the design is publishable; the calibration is not |
| Provider-divergence reconstruction | | | yes for the pure-API compare; the mirror and sequential group reconstruction take longer | requires objects, git version pinning, and false-positive calibration |
| Historical edge-case knowledge (HEADGREEN, exempt, test-merge regeneration, ghost reviewers, org ruleset deliveries) | | | no | earned |

Merge-Proof becomes harder to reproduce by publishing the definitions (state vocabulary, binding set, invariants, reason codes) so that others adopt them, while keeping the corpus, the calibration and the ledger history. The published contract is the moat's front door; the corpus is the house.

---

## 16. Merge-integrity corpus

Feasible and already partly in hand. Sources: the 2026-04-23 incident reproduced as a wrong-merge-base fixture (section 6); the git experiments exp1 to exp7 with fixed identities and reproducible hashes; the false-green scripts F1 to F12 and G1 to G4 exercising the real modules; the stale-approval and protection-drift issues found at Level 1 (fullsend #7440, protoLabs release-tools #65); Aryaman's and Agent Vigil's scenario fixtures as external references; public merge-queue misconfiguration threads; synthetic git state machines generated from section 17.

Every fixture carries: expected truth (what actually happened to the content and the controls), observed evidence (the API responses as a recorded fixture, in the shape `github/test/fixtures.js` already uses), the correct Merge-Proof verdict, currentness and reason codes, and a one-line reason. The corpus is the regression suite (it runs under `node --test`) and the research asset (it is what a public write-up cites and what a competitor cannot download). Real-repository fixtures need consent; synthetic ones do not. Start with the twenty or so fixtures already implied by `sources/l2/C-false-green.md` and `sources/l2/B-provider-divergence.md`.

---

## 17. Property and model-based testing

States: `PR_OPEN → HEAD_CHANGE | BASE_CHANGE | REVIEW | CI | POLICY_CHANGE | QUEUE | GROUP_CHANGE → REPROOF → MERGE → POST_MERGE`, with `CLOSED_UNMERGED` and `INDIRECT_MERGE` as terminal branches. Transitions are generated from webhook shapes; each generated history is replayed through the collector fixture layer and the service.

Invariants:

1. A VERIFIED receipt never remains CURRENT after a binding input changes, unless exact equivalence is proven; equivalence is defined only as tree identity and is reported, never transferred.
2. Evidence for subject A never satisfies subject B: a check, run, job, review or ref observation is bound to one SHA and one claim.
3. Unknown authority never becomes valid authority by inference: a reviewer whose permission is unavailable is not counted, and their unavailability is scoped to that reviewer.
4. Missing required evidence never produces green: every required check needs an accepted conclusion and a recorded execution on the target from an allowed event and a single workflow.
5. A candidate cannot supply its own evidence: a workflow modified by the candidate cannot produce an accepted required check.
6. Absence of a bypass record is never evidence of no bypass.
7. A published check conclusion never exceeds the receipt: `success` requires VERIFIED and CURRENT (advisory) or no blocking gaps (enforcing).
8. Currentness is monotone under events that touch bindings and stable under events that do not.
9. Liveness: for a repository with bounded event rate, every tracked PR reaches a terminal currentness within a bounded number of collection cycles; the two-observation rule excludes volatile fields.
10. The ledger row for a merge is written once, before staling, and never rewritten; landed-tree state is one of four values.
11. The trial starts only on a collection-complete CURRENT VERIFIED or NOT_PROVEN receipt, exactly once.
12. Own-check exclusion: a requirement naming Merge-Proof's check is never satisfied by Merge-Proof's check.

Implementation sketch: a generator produces event sequences; an oracle computes the expected verdict from the claim model in section 5; the engine's output is compared; counterexamples become corpus fixtures. This is worth more than any single feature because it converts the vocabulary into enforced behaviour.

---

## 18. Red-team the category

**The strongest replacement.** A GitHub Enterprise Cloud organization with: merge queue on `main` requiring all queue entries to pass, status-check timeout set, CI on `pull_request` and `merge_group` with no path filters or job-level conditions on required jobs, an organization ruleset with no bypass actors, force pushes and deletions blocked, required pull request with stale-review dismissal and last-push approval, required checks pinned to the Actions app, an org required workflow from a locked repository so the gating YAML cannot be edited in the PR, CODEOWNERS on `.github/`, Actions policy with full-SHA pinning, Copilot approvals off, artifact attestations for builds, and audit-log streaming to a SIEM. This organization gets, natively: every commit on `main` arrived via a queue merge of a group commit whose required checks reported success on that exact SHA; no actor can update the ref otherwise; approvals are bound to the diff and the last push; the gating workflow is outside the PR; every ref update and bypass is recorded in rule suites and the audit stream; build artifacts carry signed provenance keyed to the commit. Concede all of it. For that organization, Merge-Proof's pre-merge verdict is almost entirely redundant with GitHub's own enforcement.

**What remains, precisely.**

1. Landed content versus validated content. GitHub does not compare them (2026-04-23), keeps no history of destroyed groups, and under squash or rebase manufactures new commits. This is the one job that survives every native improvement short of GitHub publishing a merge attestation with a tree comparison.
2. A record that lists what was not proven, with the field or permission behind each gap. GitHub's surfaces state readiness, never gaps.
3. The join across surfaces with different permissions, retention and plan gating: rules at observation, execution on the SHA, approvals on the head, rule-suite result, actor classes, in one immutable row that survives 30-day and 180-day windows.
4. Skipped-equals-success and same-app name collision, which GitHub's own evaluation shares.
5. Everything above for the organizations that are not that organization: Team plan with private repositories cannot use merge queue, required workflows or the audit API; those are the agent-heavy small teams.

If GitHub ships a native per-merge attestation binding approvals to the final head, checks to the merge-group SHA, bypass use and a landed-tree comparison, on Team plan, the pre-merge product folds and the post-merge ledger with expected-tree reconstruction is what is left. That is the kill criterion from Level 1, restated.

---

## 19. Frontier product definition

**The best possible Merge-Proof.** A read-only GitHub App that, for every open pull request candidate, records a deterministic, signed, fail-closed statement of which required controls were satisfied by which platform-recorded evidence on exactly which commit and tree under which rules snapshot; keeps that statement current per claim rather than per repository; publishes it as a check with a machine-readable decision that agents gate on by passing the SHAs they hold; and, after merge, binds the landed tree to the validated candidate and to an independently reconstructed expected tree, writing one immutable ledger row per merge that says whether what landed is what was proven, whether the path was clean or bypassed where GitHub exposes it, and what remains unknown and why.

**It proves:** identity of the candidate (repository id, PR, head, base, target SHA and tree); that a required check concluded and that an Actions run, job and steps executed on that exact target from an allowed event and a single workflow whose blob at that SHA is recorded; that approvals exist on the current head from non-author human accounts with write permission observed at receipt time; that the head ref pointed at the candidate at observation; the normalized rules in force at observation; the landed commit's tree, its parents and its equality or inequality with the validated and expected trees; who merged, who pushed (where an activity row exists), and, within the rule-suite window with Administration:read, whether the ref update was a bypass.

**It observes:** GitHub's own `reviewDecision` and mergeability; reviewer permission now; code-owner review requests flagged by GitHub; Bot identities and known vendor bot ids; run actors and triggering actors; Copilot approving reviews; ruleset and protection settings as GitHub returns active rules.

**It infers:** which merge commit and base a `pull_request` run tested, from job logs when available; local CODEOWNERS matches; distinct human principals; the expected tree for rebase merges in the clean case.

**It cannot know:** which approvals GitHub counted; reviewer permission at approval time on non-Enterprise plans; who can bypass (hidden from read-only tokens); whether an `exempt` actor bypassed; the effective required-approval count including the unattributed-Copilot rule; evaluate-mode rules; historical rules beyond the rule-suite and history windows; what a workflow checked out or semantically tested; whether an agent wrote code under a human identity; decision-time currentness at the instant of merge.

**It refuses to claim:** code correctness, security, test adequacy, coverage, "no bypass occurred" without a record, independence from GitHub's API truth, cryptographic assurance about GitHub's assertions, that a saved CURRENT is live, that a check on a different SHA proves this one, that a policy gate was GitHub's actual merge decision, and any SLSA source level.

---

## 20. Coverage scorecard

Columns: failure; real-world evidence; buyer impact; currently handled; feasible; required data; permission; native GitHub coverage; competitor coverage; proposed behaviour; priority (P0 must close, P1 moat, P2 parity, P3 optional).

| Failure | Evidence | Buyer impact | Now | Feasible | Data | Permission | Native | Competitors | Proposed | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Same-app duplicate check name from a PR-added workflow (F1) | reproduced | high: exploitable false green | no | yes | run workflow_id, path, candidate files | held | GitHub merges too | none | ambiguity by workflow id; candidate-modified workflow blocks | P0 |
| Required check satisfied by a dispatch or schedule run (F2) | reproduced | high | no | yes | run event | held | GitHub ignores such runs | none | collect event; allow-list | P0 |
| Repository-wide staling and re-queue; enforcing check oscillation | reproduced, quantified | high: uninstall risk | no | yes | per-claim bindings | held | n/a | Agent Vigil idempotency discipline | precise currentness; route group events | P0 |
| Org ruleset edit never stales | reproduced | high: silent rule change | no | yes | org-level delivery | held | rule insights (Admin:read) | none | accept delivery; stale under installation | P0 |
| Ghost reviewer poisons capture | reproduced | high liveness | no | yes | scope unavailability | held | n/a | none | per-reviewer eligibility | P0 |
| Behind-base PR with Actions can never be VERIFIED | reproduced | high coverage | policy | partial | job log line | Actions:read | `strict` off merges | Agent Vigil runs tests itself | keep strict; log-derived INFER; say "update branch" | P0 wording, P1 inference |
| CODEOWNERS or last-push required never VERIFIED | reproduced | high coverage | fails closed | inference only | CODEOWNERS, members, activity | Contents, Members:read | native evaluation not exposed | source-tool requires the rule | compute and label INFER; count toward a distinct state, not VERIFIED | P1 |
| Seventeen rule types block including push-time rules | reproduced | high coverage | no | yes | rule type triage | held | n/a | none | triage table | P0 |
| Non-Actions CI never VERIFIED | reproduced | medium-high coverage | policy | partial | none | n/a | GitHub accepts | Aryaman accepts conclusions | distinct weaker state; wording | P2 |
| Landed tree differs from validated (2026-04-23) | incident, reproduced | high; rare | no | yes, pure API | `head_commit.tree_id`, landed tree | Contents:read | none | none | ledger tree states | P1 |
| Landed tree differs from expected (substitution, base moved at landing, bypass merge) | experiments | medium | no | yes with mirror | git objects | Contents:read | none | none | expected-tree reconstruction | P1 |
| Bypass used at merge | docs; Legit research | medium-high for platform buyer | no | yes within a month | rule suites | Administration:read (held) | rule insights UI | none | ledger bypass state; `exempt` caveat | P1 |
| Skipped or neutral required conclusion | docs | medium | yes (NOT_PROVEN) | yes | present | held | counts as pass | Aryaman, Vigil mark unknown | keep; wording | done |
| Approval on old head | fullsend #7440 | high | yes | yes | present | held | optional settings | Aryaman binds to head | keep | done |
| Bot or Copilot approval counted | preview 2026-09-01 | medium | excluded silently | yes | account class | held | setting not exposed | none | report observed-not-counted; distinct humans | P1 |
| Unattributed agent PR needs extra approval | GitHub rule | medium | no | partial | author type | held | rule exists, not exposed | none | flag when distinct humans < configured + 1 | P1 |
| Who pushed the head | issue-level | medium | no | yes | activity endpoint | Contents:read | n/a | none | record pusher | P1 |
| Workflow blob and pinning at tested SHA | tj-actions incident | medium | no | yes | Contents:read | held | Actions policy | source-tool integration id | record blob, pinned refs | P1 |
| Rules snapshot at enqueue versus merge | docs | medium | no | yes | present | held | ruleset history (write) | none | diff in ledger | P1 |
| Multi-PR HEADGREEN attribution | docs | low-medium | partial | partial | member list | Merge queues:read | n/a | Vigil dispatcher | state "landed as part of group G" | P3 |
| Attempt history (flaky masking) | docs | low | no | yes | `previous_attempt_url` | held | UI shows | none | record attempts | P3 |
| More than twenty runs on a SHA | reproduced | medium coverage | fails closed | yes | paging | held | n/a | none | page, filter by path | P0 |
| `mergeable` flip between observations | reproduced | medium flakiness | no | yes | exclude field | held | n/a | none | exclude from identity hash | P0 |
| CHANGES_REQUESTED from a read-only account | reproduced | medium on public repos | over-strict | yes | permission | held | GitHub ignores | none | require write | P0 |
| BASE_DRIFT blocks despite execution on M or group | reproduced | medium | over-strict | yes | present | held | n/a | none | waive when target contains base | P0 |
| Decision-time currentness at merge | structural | low | impossible | no | none | none | none | none | keep UNAVAILABLE; pair with head guard | n/a |
| Semantic test weakening | vendor system cards | high but out of contract | no | no | diff semantics | n/a | none | Vigil detectors | record executed jobs only | do not build |

---

## 21. Prioritized frontier backlog

Kinds: proof-engine, evidence ingestion, interface, distribution, commercial, research/data.

**MUST CLOSE (credibility).**

| Item | Kind |
|---|---|
| F1 workflow-id ambiguity and candidate-modified-workflow blocking gap | proof-engine |
| F2 run event and pull_requests capture with trigger allow-list | evidence ingestion, proof-engine |
| Per-claim currentness; exclude mergeability from identity; route group events; accept org ruleset deliveries; bounded liveness | proof-engine |
| Ghost-reviewer scoping; CHANGES_REQUESTED requires write; drift waiver when target contains base; workflow-run paging | proof-engine |
| Rule-type triage (evidence, push-time, unsupported) | proof-engine |
| Wording: "update branch", App approvals excluded by policy, skipped steps, non-Actions CI, large PR limits; fix the two ambiguous check titles | interface |
| Invariant tests and the first twenty corpus fixtures from reports B and C | research/data |

**MOAT BUILDERS (deepen exact-candidate integrity).**

| Item | Kind |
|---|---|
| Landed-tree binding in the ledger (pure API) | proof-engine |
| Expected-tree reconstruction with a blobless mirror; pre-merge candidate-versus-expected on `checks_requested` | proof-engine |
| Rule-suite bypass ingestion with `exempt` caveat; `enforce_admins` | evidence ingestion |
| Rules snapshot diff enqueue-versus-merge | evidence ingestion |
| Approval provenance: account class, dismissal actor and head, pusher via activity, distinct human principals, Bot-author flag | evidence ingestion |
| Workflow blob and pinning at tested SHA | evidence ingestion |
| Job-log-derived tested merge commit for `pull_request` runs, labelled INFER | evidence ingestion |
| Signed receipt with Rekor anchor and verifier | interface |
| Public corpus write-up of merge-integrity failures (incident reproduction first) | research/data, distribution |

**PARITY (usability and distribution).**

| Item | Kind |
|---|---|
| Decision object, REST endpoint, CLI and `gh` extension, exit codes, `external_id` and machine line | interface |
| MCP tool (stdio, then HTTP) and AGENTS.md instruction snippet | interface, distribution |
| Delivery-id idempotency discipline and one-hour terminal state for queued proofs | proof-engine |
| `replay` of a stricter policy against recent merges; `doctor`-style install audit | interface |
| JSON schema per receipt version; JUnit or rdjson renderings where CI consumers exist | interface |
| Marketplace listing for the App, README rewrite (section 22), close issues 1 and 2 | distribution |
| Defensive registrations of `mergeproof` on npm and `merge-proof` on PyPI as pointer packages (Ryan's decision) | commercial |

**OPTIONAL.**

| Item | Kind |
|---|---|
| Deployment protection rule integration and verify-by-SHA | interface |
| Local CODEOWNERS match labelled as inference | evidence ingestion |
| Attempt history; HEADGREEN group attribution text | evidence ingestion |
| SVR companion statement for SLSA-aware consumers | interface |
| Weekly trial digest | commercial |

**DO NOT BUILD.** Section E above.

---

## 22. Public product gap

| Surface | What a buyer sees | Repository truth | Gap |
|---|---|---|---|
| README | "free local CLI and GitHub Action" that checks base drift and protected boundaries; hosted trial mentioned in one paragraph; "What it checks" lists two conditions and four not implemented | hosted App with candidate selection, execution proof, approvals, rulesets, queue, ledger, gates, actor classification | the headline document describes the v0.1 diagnostic; hosted capabilities live in `github/README.md` which nobody finds |
| npm `merge-proof` 0.1.0 | description "determine whether the available evidence actually proves the candidate"; package is the local analyzer | same as README | acceptable if the README points to the hosted product first; publish a 0.2 with `status` once the decision contract exists |
| GitHub repository | description "Independent exact-state merge evidence for PRs — CURRENT / STALE / NOT_PROVEN (not an AI reviewer)"; topics ci, developer-tools, github-actions, merge-queue, pull-requests; 0 stars; three open issues | fine | issues 1 and 2 (2026-09-01) ask whether merge-proof should block merges and keep a durable record; both are now answered by the hosted product and read as unresolved design questions; close them with the answers |
| Marketplace | Action "merge-proof" v0.1.0 in CI and Code Review, adjacent to Aryaman's "mergeproof" v1.0.2 | no App listing | list the App; the Action listing implies the product is the Action |
| Homepage (from `factory/public/index.html`; live site unreachable from this sandbox) | "Green checks go STALE when the tip moves"; three-step install; evidence vignette; pricing | matches hosted truth | qualify "independent"; avoid "Prove the merge" reading as correctness; add the machine contract when it ships |
| Check run | title "VERIFIED · CURRENT at observation · reporting only" and similar; summary with gaps | correct | ambiguous titles in section 14; no `external_id`; no machine line |
| Receipt | HTML and JSON behind an OAuth cookie; fingerprint | correct | no bearer path; unsigned; no verifier |
| Documentation | `github/README.md` is accurate and dense; validation records exist | correct | no public "what it proves, observes, infers, cannot know, refuses" page; section 19 should become that page |
| Category language | "exact-state merge evidence", "not an AI reviewer" | good | competitors use "evidence gate", "receipt", "approval bound to the commit"; own "exact candidate", "content binding", "what was not proven" |

---

## 23. Naming collision (summary; tables and candidates in `sources/l2/E-naming-radar.md`)

Three-way contested, and we are the youngest by GitHub and registry dates. GenLayer's "MergeProof, Staked PR Review Protocol" (February 2026) holds mergeproof.com, the npm `@mergeproof` scope, a Docker image, and most likely the private GitHub App slug `mergeproof`. Aryamanz29/mergeproof (created 2026-09-12) holds PyPI `mergeproof`, the Marketplace Action "mergeproof", a container image and a docs site, posts a commit status literally named `mergeproof`, and uses our vocabulary; its hosted-App PR was closed unmerged. We hold npm `merge-proof`, the Marketplace Action "merge-proof", the repository, and the first Google result for the hyphenated form. `npm i mergeproof` and `pip install merge-proof` are unclaimed and fail loudly today. Five dormant `mergeproof-*` repositories from June to August 2026 with near-identical "evidence-backed merge decisions" descriptions indicate a recurring challenge prompt; expect more.

Risk and cost: Marketplace conflation is high probability and moderate cost (support in the wrong repository; a repository requiring the wrong status); the PyPI typo lands on Aryaman's tool, which also writes receipts; trademark dispute is low probability near term and rises if anyone files or raises. Renaming now costs one to two focused days (the required check name is the item that becomes expensive later, since every customer ruleset would need editing with a dual-emit transition). Keeping the name costs nothing today and forfeits the one-word form permanently. Candidates with clean availability on npm, PyPI, crates and GitHub: ExactState, ProvenMerge, StaleProof, MergeWitness, MergeAttest (MergeReceipt is taken). Trademark offices were unreachable from this sandbox; URLs to check by hand are in the source report. The decision is Ryan's; the middle path (keep the name, register the two typo packages as pointers, never invest in the mark) is viable.

---

## 24. Competitive radar fix

Why it was missed: timing (created 2026-09-12, v1.0.2 on 2026-09-15); namespace blindness (npm reported `mergeproof` free while PyPI, the App slug, the .com and the Marketplace were the namespaces actually taken); query shape (hyphenated searches rank us, one-word searches rank Aryaman; GitHub `in:name` search ranks by best match, burying a days-old repo under dead clones unless sorted by `updated`); private prior art (GenLayer's main repo is private).

Process, cheap and deterministic: one script, one YAML of sources, one weekly digest with Material, Unreachable and Suppressed sections, committed to a private repository, no LLM in the loop. Sources and cadence: GitHub repository search by exact names daily and by phrases with `created:` and `stars:` filters weekly; topics `merge-queue`, `pull-requests`, `provenance`, `attestation` weekly; Marketplace queries "merge evidence", "merge proof", "pull request evidence", "receipt", "attestation" weekly with result-list diff; App slug probes weekly; release and commit feeds for the two live neighbours daily; npm exact names daily and keyword search weekly; PyPI RSS or weekly simple-index diff; crates, Go proxy, Docker Hub, RubyGems weekly; MCP registries weekly; vendor changelog feeds daily with the regex `merge queue|required (status|check)|ruleset|bypass|approv|stale|attest|stacked`; arXiv cs.SE weekly; HN Algolia daily; Reddit weekly; exact-phrase web alerts daily. Flag only: new repo with twenty or more stars, or a watch-listed owner, or a new Marketplace listing in the watched sets, or a 404 to 200 flip on a slug or package name, or a changelog item matching the regex, or an HN story at twenty or more points, or a package whose name matches `merge.*(proof|receipt|evidence|gate|witness|attest)`. Fifteen-minute Monday ritual in the source report; monthly pass on hackathon sites, Homebrew and trademark offices; re-run candidate-name availability monthly so a fallback stays open.

---

## Finish line

**If GitHub, OpenAI, GitLab and every nearby startup keep improving for three years, what narrow technical responsibility can Merge-Proof become exceptionally good at that remains valuable?**

Binding merge evidence to content, not to reports: proving that the exact tree that was validated is the exact tree that landed, under rules whose state at observation is recorded, with every unprovable fact named and the permission that would change it stated. Agents will write and repair more of the code, platforms will add more governance knobs, review opinions will be free, and each of those trends makes the evidence-to-content binding rarer and more valuable, because every additional actor and every additional knob is another way for "green" to detach from "what landed". GitHub has shown it does not check its own landings; vendors have shown their self-evidence is not evidence; the standards body has named the problem and left the implementation to others.

**What engineering work must be performed now to earn that position rather than merely claim it?**

Close the two false greens and the currentness model so that VERIFIED means what the receipt says (section D items 1 and 2). Bind the ledger to trees and reconstruct expected trees so that "what landed" is a comparison rather than a webhook field (items 3 and 8). Ingest the authority and bypass evidence GitHub does expose and write the exact sentences for what it does not (items 5 and 6). Publish the decision contract so that the SHA an agent proves and the SHA it merges are the same value (item 7). Turn every finding and experiment in this research into a fixture and every rule in section 17 into a property test (item 9), and sign the record once it is worth signing (item 10). Then publish the truth boundary in section 19 as the product's public definition and let the corpus grow.

---

## Appendix: source reports

Under `sources/l2/`:

- `A-competitor-teardown.md`: twelve repositories read at source level with file and line citations; architecture and trust-model table; copyability.
- `B-provider-divergence.md`: the 2026-04-23 incident, git reconstruction experiments with reproducible hashes, feasibility matrix, post-merge design sketch.
- `C-false-green.md`: adversarial review of the engine with runnable scripts and saved outputs under `falsegreen/`; capability table.
- `D-authority-agent-provenance.md`: field-level authority, Actions-run binding and agent-signal tables with receipt sentences.
- `E-naming-radar.md`: collision table, registries and domains, keep-versus-rename costs, candidate names, radar sources and ritual.
- `F-machine-signing-crossplatform.md`: decision schema, CLI and MCP specifications, comparison table, signing specification, normalization table.
