# L3-I: Provider Correctness Incidents, "Pure-Coder Wow" Evidence, Naming Decision, 3-Year Commoditization Test

Status: COMPLETE (2026-09-19). Research analyst notes. Repository not modified; nothing registered; no external writes.

Reachability note: github.com, raw.githubusercontent.com, registry.npmjs.org, pypi.org reachable. Other domains are attempted; where blocked, the claim is marked `[excerpt-only]` (from search-result snippet) or `[unreachable]`.

## PART 1 — Provider correctness incident corpus (2020–2026)

Method: web search over githubstatus.com history (site itself blocked from sandbox; entries recovered via search snippets and third-party mirrors), GitHub community discussions with staff replies (reachable), GitHub changelog (github.blog blocked; text via search snippets), GitLab gl-infra production incident issues and gitlab-org bug/security issues (reachable), Bitbucket status (snippets only). "Detect?" names the Merge-Proof comparison layer: **EB** evidence binding (evidence bound to exact head/base/tree ids), **CU** currentness (is the proven state still the state that will land), **PC/E** provider candidate vs expected (recomputed `merge-tree` vs provider's `merge_commit_sha`/`merge_group.head_commit.tree_id`), **L/P** landed vs proven (landed base-tip tree vs proven tree), **AZ** authorization (who approved/merged, rule satisfaction recomputed from raw events), **WR** webhook reconciliation (poll-vs-push gap detection). B-provider-divergence.md already covers the 2026-04-23 incident in depth; it is included in the table for completeness only.

### 1.1 Incident table

| # | Date | Provider / feature | Mechanism (what was actually wrong) | What users saw | Merge-Proof layer that detects | Pre/post-merge | Source | Confidence |
|---|---|---|---|---|---|---|---|---|
| I1 | 2026-04-23 16:05–20:43 UTC | GitHub merge queue (squash; GitHub later added rebase) | Incomplete feature-flag gating of a new merge-base computation for queue ref updates; squash/rebase commits generated from the wrong base state, reverting earlier PRs' changes. 230 repos / 2,092 PRs per incident thread; Kyle Daigle on X gave 2,804 PRs "out of over 4M". Remediation commits carried `[restored]` suffix. | Merged PRs' content missing from `main`; "HEAD didn't match PR contents merged that day" | **L/P** (landed tree ≠ `merge_group.head_commit.tree_id`); PC/E does *not* catch it (candidate was correct, landing was wrong) | Post-merge only | community #193645; x.com/kdaigle (excerpt); dev.to write-ups | High |
| I2 | 2023-02-08 → fixed 2023-02-10 | GitHub merge queue public beta | `merge_group` event not firing Actions workflows in some repos; PRs sat in queue with checks "expected" | Queue stalled; nothing merged | WR (expected `merge_group.checks_requested` never followed by check_run events → reconcile by polling) | Pre-merge (fail-safe direction: nothing merged) | community #46757 (staff willsmythe 2023-02-10) | High |
| I3 | 2023-04-19 changelog | GitHub merge queue beta | (a) failing queued PRs stayed failing after checks were re-run and passed; (b) commits were pushed to queue-created prep branches (branch used as a real branch); (c) `merge_group` not triggering in some repos | Stale FAIL state; unexpected commits on `gh-readonly-queue/*` | (a) CU: PR check state vs latest check_run for the *same* head sha; (b) EB: group ref head ≠ recorded group head → candidate mutated after validation | (a) pre-merge (fail-safe), (b) pre-merge (**fail-unsafe**: validated candidate could be changed) | github.blog changelog 2023-04-19 [excerpt-only] | Medium (blocked; snippet) |
| I4 | 2023-06-21 | GitHub merge queue attribution | Merges now attributed to `github-merge-queue[bot]` instead of the enqueuing user; silently changed then announced | `sender.login`, closing-keywords, CircleCI contexts, notifications broke; audit "who merged" lost | AZ: Merge-Proof must record *enqueuer* (from `pull_request.enqueued` sender) separately from *merger* (`pull_request.closed` sender/`merged_by`) | Post-merge (attribution) | community #58673 (staff willsmythe) | High |
| I5 | 2023-05-05 → still unanswered 2024-10 | GitHub branch protection "Dismiss stale approvals" | Approvals not dismissed after rebase + commit-message change (gramine#2031 example); no staff response; behaviour appears to treat patch-id-equal pushes as non-stale | PR still "approved" after head sha changed | **EB/CU**: approval bound to `commit_id` of the review; new head sha ≠ reviewed sha → NOT_PROVEN regardless of GitHub's approval state | Pre-merge (fail-unsafe on GitHub's side) | community #54493 | Medium-High (no staff confirmation of bug vs intended) |
| I6 | 2023-06-06 change → reported 2023-06-20, still occurring 2026-09 | GitHub required approvals "merge-base changed after approval" | After a June 2023 security hardening, PRs blocked with "The merge-base changed after approval" although neither branch moved; platform-side merge-base recomputation inconsistency; workaround close/reopen | Cannot merge an approved PR | CU/PC/E: Merge-Proof recomputes `merge-base` locally and can state whether the merge base *actually* changed (currentness verdict independent of GitHub's) | Pre-merge (fail-safe, but proves GitHub's mergeability engine is not deterministic from the user's view) | community #58535 | High for symptom; Medium for cause |
| I7 | 2022-08 (reported) → unanswered 2025-07 | GitHub auto-merge + required checks | A required check that is *skipped* (because `needs:` dependency failed) does not block auto-merge; PR merged with required job never run | PR merged though `check-all` never succeeded | **EB**: Merge-Proof requires a *conclusion=success* check_run bound to head sha; "skipped"/absent ≠ proven | Pre-merge (fail-unsafe on GitHub) | community #28864 | High (documented GitHub semantics, not a transient bug) |
| I8 | 2026-03-25 → fix "in the queue" 2026-03-26; still reported failing 2026-09 | GitHub auto-merge / rulesets + merge queue (ALLGREEN) | Undocumented behaviour change: enabling auto-merge returns HTTP 422 unless all requirements already met; contradicts docs | `gh pr merge --auto` fails; UI error | None directly (availability/UX, not correctness). Relevant as evidence that merge semantics change without changelog | Pre-merge | community #190610 (staff willsmythe) | High |
| I9 | 2026-02-04 → 02-26 | GitHub merge queue | PRs removed "due to no response for status checks" during a concurrent status incident; queue 120-min timeout vs long-running jobs; no dedicated incident declared | PRs dropped from queue although CI green later | WR/CU: check_run completion for a group head arriving after `merge_group.destroyed` → flag "checks completed for a candidate no longer queued" | Pre-merge (fail-safe) | community #186339 | Medium |
| I10 | 2024-12-17 (Mercari blog), GitHub reply May 2024 "expected behaviour" | GitHub branch protection vs Actions | Workflow with `contents:write` (or `GITHUB_TOKEN`/App) pushes directly to protected branch or approves; branch protection allows bypass through Actions under "expected" conditions | Code lands on protected branch with no PR/review | **AZ + L/P**: landed commit not reachable from any proven PR merge → "unproven landing" | Post-merge | engineering.mercari.com [excerpt-only, blocked] | Medium |
| I11 | 2026-02 (Legit Security) | GitHub required reviewers | "Required reviewers can be bypassed" when relying on ≥1 review (mechanism per snippet: reviewer-of-record manipulation / approving own changes via second identity or bot) | Merged with a review that does not satisfy the intent of the rule | AZ: Merge-Proof recomputes "approved by a non-author, non-bot, with write access, bound to head sha" from raw review events | Pre-merge | legitsecurity.com [excerpt-only, blocked] | Low-Medium (mechanism not verifiable from sandbox) |
| I12 | 2024-07-05 16:31–18:08 UTC | GitHub Webhooks | Config change removed auth from webhook background jobs → deliveries delayed avg 24 min, max 71 min; secondary Actions delays 18:21–21:14 | Late/absent triggers; PR checks late | **WR**: event age vs `updated_at` on poll; late delivery of `pull_request.synchronize` after a verdict was issued → re-evaluate | Both | github.blog availability report July 2024 [excerpt-only] | High (official) |
| I13 | 2026-08-06 15:05 → 08-07 00:14 UTC | GitHub Actions/Webhooks | Webhook triggers throttled to ~15% for recovery; "some workflow-triggering events including push and pull_request were not processed and cannot be replayed automatically" | Checks never started on some PRs; users told to push again | **WR**: `pull_request.synchronize` with no subsequent check_suite → reconcile; **EB**: no evidence for head → NOT_PROVEN (fail-safe) | Pre-merge | githubstatus summary via search [excerpt-only]; pulsetic mirror | Medium-High |
| I14 | 2025-07-21 07:00–09:45 UTC | GitHub API/PRs/Webhooks | Seattle edge fiber cut → dropped requests across API, PRs, Webhooks | Missed deliveries, failed API calls | WR (dropped deliveries); poll reconciliation | Both | availability report/status [excerpt-only] | Medium |
| I15 | 2026-08 (status summary) | GitHub Pull Requests | Delays in merge-commit generation, mergeability info, merge-button availability (background job timeouts) | `mergeable: null`, `merge_commit_sha` stale/absent for long periods | **PC/E + CU**: Merge-Proof computes its own candidate; treats provider `merge_commit_sha` as observation; verdict not blocked on provider async job | Pre-merge | status summary via search [excerpt-only] | Medium |
| I16 | 2025-04-09 → 04-10 | GitHub Pull Requests | "Processing updates" stuck; new commits not shown in PR; one user needed force-push hours after resolution | PR view/API reflected stale head | **CU/EB**: Merge-Proof reads the ref via git (`refs/pull/N/head`) not PR JSON; head mismatch between API and refs → STALE | Pre-merge | community #156245 | High |
| I17 | 2022-09-08 19:44 → 09-09 00:55 UTC | GitHub PR merge (EMU accounts) | Data transition removed data required to merge via UI/API for EMU users; CLI merges unaffected | Merge failures | None (availability). Note: CLI pushes bypassing UI leave no PR-merge record → L/P flags "landed without proven PR" | Post-merge | availability report Sept 2022 [excerpt-only] | High |
| I18 | 2025-11-18 18:49 UTC (~15 min) | GitHub Pull Requests | PR creation, conflict checking, pushes 500; status page said operational | Discrepancy user-vs-status | WR/CU (provider unreliable; self-computed state) | — | community #179897 | Medium |
| I19 | 2021-08-16 23:43 → 08-17 11:01 UTC | GitLab merge trains | Feature flag `cache_merge_to_ref_calls` (MR !67789) broke `merge_to_ref` caching; ~2,000 MRs/~400 projects removed from trains "Reference not found"; flag skipped staging | Trains stalled | PC/E (train ref missing vs expected candidate) | Pre-merge (fail-safe) | gl-infra/production #5367 | High |
| I20 | 2022-04-07 → 04-08 10:45 UTC | GitLab merged-results pipelines | Mergeability-check logic change (!84669) made MR-event pipelines run "detached" instead of merged-results; reverted | Pipelines validated wrong candidate (source head instead of merged result) | **PC/E + EB**: evidence bound to source head, not to the merged-result tree → "evidence not on candidate" | Pre-merge (**fail-unsafe**: green on the wrong tree) | gl-infra/production #6788 | High |
| I21 | 2024-10-08 | GitLab pipelines/MRs | Redis repo-cache shard timeouts + workers reading stale replica data despite `data_consistency: always` → pipelines stuck, MRs stuck | Stuck MR state | CU (stale state read) | Pre-merge (fail-safe) | gl-infra/production #18676 | High |
| I22 | 2025-10-29 14:10–16:45 UTC | GitLab webhooks | Sidekiq slowdown → webhook latency up to 15 min; "no webhooks failed to deliver" | Delayed events | WR | Both | gl-infra/production #20791 | High |
| I23 | 2023 (CVE-2023-4812, fixed 16.5.5/16.6.4/16.7.2, 2024-01-11) | GitLab CODEOWNERS approval | Adding changes to a previously approved MR bypassed required CODEOWNERS approval (CVSS 7.6) | Approved-state carried over to new content | **EB**: approval bound to the reviewed sha/patch; new content ≠ approved content → NOT_PROVEN | Pre-merge (fail-unsafe) | GitLab critical release 2024-01-11; NVD | High |
| I24 | 2026-05-14 (CVE-2026-6883, fixed 18.9.7/18.10.6/18.11.3) | GitLab MR approval policies | Orphaned policy records not cleaned up → approval requirements bypassable (CVSS 2.6) | Rule not enforced | AZ: rule satisfaction recomputed from declared policy + raw approvals | Pre-merge | GitLab patch release [excerpt-only] | Medium |
| I25 | 2023 (issue #395506) | GitLab approvals | Approval lost if given within ~60 s after commit (race); reproduced by GitLab Support | Approval silently dropped | EB/CU (fail-safe direction) | Pre-merge | gitlab-org/gitlab #395506 | Medium (HTTP 429 on fetch; snippet) |
| I26 | 2018→ (#53674, FOSS) and 2026-04 (#597487) | GitLab "Pipelines must succeed" | (a) `only:` rules → no pipeline → setting bypassed; (b) external commit status marks a `config_error` pipeline successful → mergeable | MR merged with failing/absent CI | **EB**: evidence = concrete successful job runs bound to the candidate, not the provider's aggregate "pipeline success" flag | Pre-merge (fail-unsafe) | gitlab-org issues #53674, #597487 | High |
| I27 | undated (#344021), open | GitLab merge train | Transient "Merge request is not mergeable" after successful train pipeline; retry merges with no changes | Non-deterministic mergeability | CU/PC/E (independent mergeability) | Pre-merge (fail-safe) | gitlab-org/gitlab #344021 | Medium |
| I28 | 2026-09-11 05:30–06:45 UTC | Bitbucket Cloud PRs | "Intermittent reliability issue affecting pull requests" (no detail) | PR errors | — | — | bitbucket.status.atlassian.com [excerpt-only] | Low |
| I29 | KB, undated | Bitbucket Cloud merge checks | Merge check does not honour build statuses created via API for commits (required-builds check fails/ignores) | Required build check inconsistent | EB (evidence identity from raw statuses) | Pre-merge | Atlassian KB [excerpt-only] | Low-Medium |
| I30 | 2026-06 (thehackernews) | GitHub actions/checkout | Update blocks common "pwn request" patterns (checkout of PR head in `pull_request_target`) — evidence that CI evidence could be produced by attacker-controlled code | Green checks on attacker-controlled content | EB + AZ: evidence provenance (which workflow, which ref, which token) recorded | Pre-merge | thehackernews [excerpt-only] | Medium |

Also noted but not correctness incidents: 2026-09-13 permission-DB outage (28 services), 2026-08-26 PR-triggered workflow delays (2.6%, peak 25%), 2026-02-02 Azure compute, 2026-04-27 Elasticsearch (PRs/Actions ~6 h). They matter only as WR (delivery gaps) evidence.

### 1.2 Failure-class table

| Class | Definition | Incidents | Merge-Proof comparison that catches the *class* | Direction |
|---|---|---|---|---|
| **FC1 Wrong merge base / wrong manufacturing** | Provider builds the landed commit (or the candidate) from a base other than the validated one | I1, I20 (detached vs merged-results), I3b | L/P: `tree(landed tip)` vs `tree(proven candidate)`; PC/E: `merge-tree(base, head)` vs provider candidate tree | Post (I1) / Pre (I20) |
| **FC2 Stale mergeability / stale state** | Provider's PR JSON (`mergeable`, `merge_commit_sha`, head, approvals, check rollup) lags or diverges from refs | I6, I15, I16, I21, I27, I25 | CU: read refs and check_runs directly, bind verdict to observed `head_sha`/`base_sha`/tree; recompute merge-base | Pre |
| **FC3 Unenforced rule** | A configured rule (required check, approval, CODEOWNERS, pipeline-must-succeed) is satisfied by something that does not meet its intent | I7, I11, I23, I24, I26, I5 | EB + AZ: recompute "proven" from raw check_runs (conclusion=success on head sha) and raw reviews (state=APPROVED, `commit_id`==head, reviewer ≠ author, human) rather than the provider's rollup | Pre |
| **FC4 Missed / late delivery** | Webhook events dropped, throttled or delayed; provider cannot replay | I2, I9, I12, I13, I14, I22 | WR: periodic poll of `updated_at`/refs vs last-seen event; re-open verdict when a late `synchronize`/`review_dismissed` arrives | Both |
| **FC5 Wrong actor attribution / silent semantic change** | Provider changes who is recorded as merger/author or changes semantics without changelog | I4, I8, I17 | AZ: record enqueuer, approver(s), merger and `merged_by` separately from raw events; snapshot rule config at verdict time; diff on change | Post |
| **FC6 Candidate mutation after validation** | Validated candidate (queue prep branch, merge ref) changed before landing | I3b, (I10 as out-of-band landing) | EB: candidate `tree_id` recorded at `checks_requested`; L/P: landed parent/tree check | Both |
| **FC7 Out-of-band landing** | Content reaches protected branch without a proven PR (Actions token push, admin bypass, CLI) | I10, I17 (CLI path), GHES CVEs (auth bypass) | L/P: every new base-tip commit must map to a proven receipt; otherwise "unproven landing" | Post |
| **FC8 Evidence produced on wrong content** | Green check computed on a tree other than the one that will merge (detached pipelines, pwn-request, `GITHUB_SHA` merge-commit confusion) | I20, I30, actions/checkout #27 | EB: bind each check_run to `head_sha` *and* to the candidate tree the workflow actually checked out (`merge_group.head_commit.tree_id` / merge ref tree) | Pre |

Observations for the product:
1. Of 30 items, only **one** (I1) is a landed-tree divergence. It is also the only one the provider could not have detected from its own state; it is the strongest single justification for post-merge L/P.
2. The dominant classes by count are FC3 (unenforced rule) and FC2 (stale state). Both are caught pre-merge by *recomputing from raw events rather than trusting rollups*. That is the "evidence binding" layer, and it catches classes, not instances: I5, I7, I23 are the same bug in three products.
3. FC4 is frequent and official (GitHub July 2024, Aug 2026; GitLab Oct 2025). Webhook reconciliation is table stakes, not a differentiator, but every incident is a time window in which a push-only tool would issue a wrong CURRENT.
4. Pre-merge fail-unsafe items (I3b, I5, I7, I20, I23, I26) are the ones where a customer's own rules were green and wrong. Post-merge items (I1, I10) are the ones where the branch is wrong and nobody's dashboard says so.
5. Silent semantic changes (I4, I8) argue for snapshotting rule configuration and attribution semantics in the receipt so a verdict can be re-explained a year later.

## PART 2 — "Pure-coder wow": what earns respect and what reads as theater

Reachability caveat: news.ycombinator.com, hn.algolia.com, brianlovin.com/hn, hn.makr.io, lobste.rs, lwn.net, dreamwidth, research.swtch.com, words.filippo.io, dev.to and most blogs are blocked from this sandbox. HN evidence below is therefore from search-result snippets of the named threads (`[excerpt-only]`), plus GitHub-hosted discussions and official docs that were fully readable. Thread IDs are given so Ryan can read the full comments.

### 2.1 Signals extracted

| Signal | Evidence (source, date) | Strength |
|---|---|---|
| S1. After I1 the community's own remedy was a *tree comparison*, not a dashboard | HN 47881672 "GitHub Merge Queue Silently Reverted Code" (2026-04-24): "the practical check to identify affected PRs is to compare the tree of each merge commit in that window against the tree of the rebased-and-tested commit that the queue ran CI on"; "the window to audit is 2026-04-23 16:05 to 20:43 UTC" [excerpt-only]. Mergify's post-incident piece: they model-checked their queue in TLA+ because "the cost of being wrong is the customer's main branch is broken and they don't know which commits to trust" [excerpt-only]. Trunk.io "What happens if a merge queue builds on the wrong commit" (2026-05) [title only]. | High: this is exactly Merge-Proof's L/P comparison, phrased by practitioners unprompted |
| S2. Hostility to minimizing ("0.07%") and to capacity talk instead of integrity talk | Mihai Maruseac (Google, SLSA/Sigstore contributor) on X, 2026-04-24: replying to an incident "that impacted the integrity of repositories and broke the mental model of git operations with a 'roughly 0.07% were affected' is not right" [excerpt-only]; The Stack: "COO plays down incident"; dev.to write-ups: "stop assuming, start verifying" [excerpt-only] | High |
| S3. Distrust of the provider's own badge | GitHub "Verified" commit malleability (Ginesin, CMU, arXiv 2026-07-02; HN 48274410): attacker "with no access to the signing key" produces a second commit with a fresh Verified badge; GitHub "dismissed" the bounty report [excerpt-only]. Community #72294: Verified badge shown for commits signed after key expiry. Practitioner advice: "relying on the green badge status of GitHub is a mistake … those who care should always verify the signatures themselves" [excerpt-only] | High |
| S4. "Green" is not proof; engineers want the exact SHA and the changed surface named | dev.to korovinaa97 "What does a green CI check actually prove?" (2026, author of `ci-evidence-gate`): green "does not answer whether those gates measure the right thing"; Medium (Seyitoglu 2026-07) "Your CI is green because the agent wrote the tests that pass itself"; "The CI check that never ran once gave us a fake green checkmark"; "A green checkmark should name its machine" [all excerpt-only] | Medium-High (blog corpus, not HN scores) |
| S5. Reproducibility respected when its claim is precise, attacked when overclaimed | HN 43448075 / 43448745 (2025-03): top reply "Note that NixOS and reproducible builds *did not* detect the xz backdoor"; "xz was possible because of a meatspace exploit"; NixOS thread 38057591 (2023-11): "It's not about proving that the result is 100% trustable. It's about proving it's 100% faithful to the source"; Linderud's "NixOS is not reproducible" clickbait admission; Guix full-source bootstrap praised for a 357-byte trusted base [excerpt-only] | High: the community rewards *narrow, exact* claims and punishes "could have" |
| S6. Sigstore: respected for machine identity, mocked for complexity | HN 41874428 (2024-10): "Rube Goldberg trust machine", "a dozen moving pieces and obscure protocols"; "a whole parallel universe" of Cosign/Rekor/Fulcio; defender who implemented it for Homebrew and PyPI: "the goal wasn't to build complex verifiable policies, but to enable signing with machine identities" [excerpt-only]. GitHub attestations discussion #122028: private repos use a GitHub Sigstore instance with "no transparency log" | High |
| S7. Attestations: "valid provenance, malicious package" | matrixgard 2026: an attestation "answers where an artifact came from … doesn't claim it answers whether the artifact should be trusted"; HN 47649478 (2026-04) "Preventing accidental npm leaks by reviewing the final artifact": provenance is not artifact review [excerpt-only]; SLSA practitioner posts: "generating provenance means nothing if nobody verifies it", "compliance theater" when gates are applied indiscriminately | Medium-High |
| S8. Merge queues/bors: respect for a one-sentence invariant | NRSR: "automatically maintain a repository of code that always passes all the tests" (Hoare via Elliston; graphite/mergify histories); HN 36707239 (2023-07): GitHub's queue "pretty flaky early on, got stuck, double commits" then "pretty good now"; commenters hoped it would replace bors (deprecated 2023-05-01) [excerpt-only]; Jane Street "Making never break the build scale" | High |
| S9. AI review fatigue | HN 46766961 "There is an AI code review bubble" (2026-02-07): reviewers "struggle with distinguishing important functional issues from trivial comments"; Pragmatic Engineer "What is happening with code reviews": humans now "review the review" [excerpt-only]; HN 45371283 "The Theatre of Pull Requests and Code Review" (416 comments): rubber stamps and "obligation nitpicks" [excerpt-only] | High |
| S10. Signed-receipt skepticism | NotaryOS Show HN 47193330 (2026): criticism that "'tamper-evident' is starting to read as a synonym for proof"; "a hash chain with no signature can be rewritten by anyone who holds the file"; "no external timestamp authority, signature service, or transparency log … calling the receipt tamper-proof would be false"; SCITT: "transparency does not guarantee the accuracy of statements" [excerpt-only]. HN 43697153 "Maybe we can solve this with blockchain?" (title itself is the joke) | High |
| S11. Transparency logs earn respect because a *skeptical client* can check them | CT literature: inclusion + consistency proofs, gossip, auditors "produce irrefutable cryptographic evidence of misbehavior"; Russ Cox "Transparent Logs for Skeptical Clients" (title; page blocked) | Medium (literature, not reactions) |
| S12. gittuf: respected for using git's own primitives, questioned on threat model | HN 38004178 (2023-11-01): commenter asked about the intended threat model and whether authenticated transport already covers it; HN 40303338 (2024-05-10): appreciation for "Git ref namespaces, an underused aspect of Git for extending it" [excerpt-only] | Medium |
| S13. `git merge-tree --write-tree` is the accepted server-side primitive | Elijah Newren's series merged in Git 2.38 (2022-10); GitLab Gitaly !4479 "Implement merges using the new git merge-tree" | High (facts) |

### 2.2 Questions skeptical engineers ask of a receipt (synthesised from S3, S5, S6, S7, S10)

1. "Which exact object ids does this bind? head sha, base sha, tree id of the candidate — or just a PR number?"
2. "Who ran the computation, on what inputs, and can I rerun it and get the same bytes?"
3. "What does this *not* prove? Say it in the receipt, not in the FAQ."
4. "If GitHub is wrong, does your verdict change, or do you just re-render GitHub?"
5. "Who holds the signing key, and what stops you from re-signing a different receipt later? Is there a log I don't have to trust you for?"
6. "Why is there a signature at all if the receipt is a deterministic function of public git objects?"
7. "Is there a model anywhere in the verdict path?"
8. "Can I verify it offline with a tool I can read, without your service, after you go out of business?"
9. "What happens on stale: does it fail closed?"
10. "Show me one real incident it would have caught, and one it would not."

### 2.3 Wow-factor verdict table

| Candidate wow factor | Verdict | Why (evidence) |
|---|---|---|
| Tree-level reconstruction (`merge-tree` recompute, landed-tree comparison) | **Earns respect** | S1: practitioners reached for tree comparison themselves after I1; S13: the primitive is mainstream git. The pitch should be "we compute the tree GitHub should have landed and compare", one sentence, with the two tree ids printed |
| Evidence binding to exact head/base/tree | **Earns respect** | S3, S4: the badge/green fatigue is precisely about *unbound* signals. FC3 in Part 1 shows three products shipped the same unbound-approval bug. State it as "approval bound to `commit_id`, check bound to `head_sha`" |
| Reproducible verdict (same inputs → same bytes) | **Earns respect, if narrow** | S5: reproducibility is respected when it claims "faithful to inputs", attacked when it implies "trustworthy". Say "reproducible from public git objects + recorded API observations", never "proves correctness" |
| Open verifier (readable code, offline) | **Earns respect** | S6/S7: the Sigstore defence that survived was "verify without infrastructure GitHub controls"; attestations discussion values portability. Without an open verifier, S10 questions 5 and 8 are unanswerable |
| Tiny CLI, exact SHAs in output | **Earns respect** | S8: NRSR is loved for being one sentence; `npx merge-proof` with a JSON of ids matches the bors aesthetic. Risk only if the CLI is a thin client for a dashboard |
| One-line reason (`BASE_DRIFT_UNVERIFIED` + the two shas + the overlapping paths) | **Earns respect** | S4 "name its machine"; S9 fatigue is with prose. Keep reasons enumerable and greppable |
| No AI opinion in the verdict path | **Earns respect** (strong differentiator in 2026) | S9: "review the review" fatigue; "not an AI reviewer" in the README is the right line. Do not add an LLM "explanation" layer to the receipt |
| Signed receipt | **Risks theater** unless justified | S10: "tamper-evident ≠ proof"; operator-controlled key invites question 5/6. Acceptable framings: (a) signature exists only so a *third party* can prove the hosted service said X at time T, and (b) a public append-only log or Sigstore bundle for public repos. If neither, ship unsigned deterministic receipts and say why |
| Transparent limitations ("does not determine correctness", "cannot see landed tree until push") | **Earns respect** | S5: the xz thread punished "could have detected"; NixOS thread rewarded the precise claim. A `NOT_PROVEN` verdict is itself a limitation statement, which is why it reads well |
| Dashboard / compliance-framework mapping ("25 frameworks") | **Risks theater** | S7 "compliance theater"; Marketplace neighbours MergeWhy ("tamper-proof audit evidence … 25 compliance frameworks") and Signetry ("seal every agent's PR") already occupy the theater slot. Merge-Proof should not sound like them |
| "Blockchain"/"immutable ledger" language | **Theater** | S10, HN 43697153. Never use "immutable" for a file you host; use "content-addressed" and show the hash |

Net: the wow for a pure coder is not any single feature but the combination "prints two tree ids, tells me if they differ, in one command, with code I can read, and never uses the word AI". Everything in the theater column is what neighbours already sell.

## PART 3 — Naming: decision-ready memo

Base: E-naming-radar.md (2026-09-19). New checks this run (2026-09-19): npm/PyPI HTTP probes, DNS, api.github.com (403 through this proxy for `users/*` and `orgs/*`; cannot confirm handles), USPTO/EUIPO/WIPO/UK IPO/RDAP/justia all blocked (HTTP 000 via curl, EGRESS_BLOCKED via fetch).

### 3(a) Trademark exposure

- **No filing found for MERGEPROOF / MERGE PROOF** by any party in web-search-indexed sources (Justia snippets index USPTO filings and show MERGE, MERGE DESIGN 98721766, MERGE LABS Reg. 5115636, MERGE FAMILY; none for MergeProof). Justia's own index is blocked, so absence is *weak* evidence. Confidence that no US application exists: ~70%.
- **GenLayer has a live USPTO application for GENLAYER** (serial 99016120, filed 2025-01-23, status "New Application – Record Initialized" per Justia snippet). That shows GenLayer does file marks; a MERGEPROOF filing would be a natural next step for them and would date priority to their Feb 2026 launch either way (use-based priority does not need a filing).
- **Descriptiveness:** "merge proof" for a tool that proves merges is descriptive-to-generic in classes 009/042. It would likely draw a §2(e)(1) refusal without acquired distinctiveness, and it is weak against third parties for the same reason. That cuts both ways: GenLayer could not easily stop us on the two-word/hyphenated form, and we could not stop Aryaman or the five hackathon clones. The mark has no fence value for anyone.
- **Exposure ranking:** GenLayer (senior use Feb 2026, .com, App slug "mergeproof", filing history) > Aryaman (PyPI, Marketplace Action, Google) > us. If either files first on the one-word form, our hyphenated Marketplace listing and npm name are the assets most likely to receive a takedown request; Marketplace and npm both act on trademark complaints administratively.
- Action for Ryan (not performed): search TESS/TSDR for "MERGEPROOF", "MERGE PROOF", "MERGE" in 009/042; EUIPO eSearch; WIPO Global Brand DB. 20 minutes.

### 3(b) SEO reality (2026-09-19 queries)

| Query | Result |
|---|---|
| `"mergeproof"` | Aryaman's PyPI + repo dominate; GenLayer's mergeproof.com appears for `mergeproof genlayer`; ours absent |
| `"merge-proof" github` | ours #1, #2, #5; Aryaman #4; Agda mergesort proof #3 |
| `"merge proof" -sort -ethereum 2026` | Ethereum "The Merge"/proof-of-stake swamps the phrase; zero PR-tool hits in the top 9 |
| `"merge proof" github action exact-state evidence receipt` | ours #1,#2,#5,#7; Aryaman #8,#9 |
| category `merge evidence receipt pull request … exact sha` | ours #2; Aryaman #7,#9; four unrelated repos using the same vocabulary |
| `"ExactState" OR "exact state" software` | Exact (Dutch ERP, 500k customers), ExactEstate, NetKet `exact.state`; no PR tool |
| `"MergeWitness" OR "ProvenMerge" OR "MergeAttest"` | zero products; in-toto **Witness** (CNCF) owns "witness" in supply chain |

Reading: the hyphenated form is ours in search; the one-word form is not; the two-word phrase is unwinnable against Ethereum. "Exact state" has a large incumbent (Exact) in adjacent B2B software, which is a real trademark-adjacency cost for ExactState.

### 3(c) GitHub search and Marketplace adjacency

- `github.com/search "mergeproof" OR "merge-proof"` returns 24 repos; we are #1 by recency, Aryaman #2, willow-network zk "table-merge proofs" #3, bukacdan #4.
- Marketplace `merge proof`: merge-proof (ours), proof-it, MergeWhy, QWED Security, REACHABLE, Receipt Gate, Signetry Admission, plus an unrelated Microsoft model. Marketplace `merge evidence`: Merge-Evidence Gate (MergeWhy), MergeWhy, merge-proof, **mergeproof (Aryaman)** adjacent, MaintainerGuard, QWED, BootProof, Source Review Coverage, QE Sentinel. Our listing sits one row from Aryaman's in the category query buyers actually type.

### 3(d) Package naming

| Name | npm | PyPI | Note |
|---|---|---|---|
| `merge-proof` | ours 0.1.0 | free | |
| `mergeproof` | free (404) | Aryaman 1.0.2 | GenLayer holds npm scope `@mergeproof` |
| `exact-state`/`exactstate` | free | free | |
| `proven-merge`/`provenmerge` | free | free | |
| `merge-witness`/`mergewitness` | free | free | |
| `merge-attest`/`mergeattest` | free | free | |
| `mergereceipt` | taken (2026-08) | free | rejected earlier |

DNS: exactstate.com registered (199.230.104.71); mergewitness.com registered (76.223.105.230, parked-style); provenmerge.* and mergeattest.* NXDOMAIN on .com/.dev/.io; mergeproof.dev/.io and merge-proof.com/.dev NXDOMAIN. GitHub handles for all candidates: **unverified** (403 through proxy); run `gh api users/<name>` locally.

### 3(e) Buyer confusion scenarios (12-month probability, this analyst's estimate)

| Scenario | P | Cost |
|---|---|---|
| Buyer installs Aryaman's `mergeproof` Action believing it is ours (adjacent in Marketplace, both emit a status named after themselves) | 35% for any given curious buyer who searches the category | Support in the wrong repo; a customer requires the wrong check name |
| LLM assistant or Python-first buyer runs `pip install mergeproof` | 20% | Same as above plus "your tool has no `--json`" style tickets |
| Buyer confuses us with GenLayer's staked-review protocol (crypto) and bounces | 10–15% among those who Google the one-word form | Lost lead; reputational adjacency to crypto is a negative with the Part 2 audience |
| Trademark letter from GenLayer | <10% in 12 months; rises with either party's funding | Forced rename at the worst time |
| Buyer thinks "merge proof" = formal-methods/Ethereum | 5% | Nil beyond a bad first click |

### 3(f) Migration cost

- **Today (0 customers, 0 stars, npm 0.1.0, no required check in any customer ruleset):** ~1–2 focused days: repo rename (GitHub redirects), publish new npm name + `npm deprecate` old, relist Marketplace Action, rename hosted App display name, change status context, add receipt `tool` field version, new subdomain + redirects. Nothing external breaks because nothing external depends on us yet.
- **After 10 customers with `merge-proof` as a required status check:** the status context name is baked into ten rulesets; a rename requires dual-emitting both contexts for a transition window, customer comms, and a support risk that a customer's merges block if they edit the ruleset wrong. Plus Marketplace ranking/reviews reset, receipts reference the old name forever, and every blog/mention needs redirects. Realistic: 1–2 engineering weeks plus a 30–60 day dual-emit window, and it scales with customer count. The cost curve is at its floor this month.

### 3(g) Three options and a recommendation

**Option A — KEEP "Merge Proof" / `merge-proof` with defensive registrations.** Claim npm `mergeproof` (pointer package) and PyPI `merge-proof` (pointer), register merge-proof.com/.dev, keep `mergeproof` out of our vocabulary. Pros: zero migration, search already ranks us for the hyphenated form, the name explains the product. Cons: we are permanently the junior user of a descriptive name that two other projects own in the namespaces buyers type (PyPI, .com, App slug, Google one-word); every Marketplace query places us beside Aryaman; the mark cannot be defended, so the defensive registrations only reduce typo damage, not confusion.

**Option B — RESTYLE: "Merge Proof by OHCAYGO" / "MergeProof Exact-State".** Adds a distinguishing tail without a migration. Pros: cheap; "Exact-State" is our actual differentiator. Cons: does not change the slug, the status context, the npm name, or search behaviour; "by OHCAYGO" is unknown to buyers; "MergeProof" one-word styling *moves toward* GenLayer's and Aryaman's form, not away. This is the option that looks like a decision but is not one.

**Option C — RENAME now.** Candidates, re-checked today:
- **ProvenMerge** (`proven-merge`): npm/PyPI free, .com/.dev/.io NXDOMAIN, zero search collisions, keeps "merge" for category recall. Weakness: "proven" overclaims slightly against our own `NOT_PROVEN` vocabulary (fixable: the verdict vocabulary stays, the brand says what the receipt is *for*).
- **MergeWitness** (`merge-witness`): honest about what we are (observer, not reviewer); .com registered/parked; collides conceptually with in-toto Witness (CNCF), which the Part 2 audience knows.
- **MergeAttest**: everything free; but "attest" pulls us into Sigstore/SLSA expectations (S6/S7), which invites "where is your Rekor entry" questions we do not want to answer today.
- **ExactState**: names the differentiator, escapes "merge*"; but exactstate.com is taken, Exact (ERP) is a large adjacent mark, and the name does not say "PR" to a Marketplace browser.

**Recommendation: Option C, rename to ProvenMerge (`proven-merge`, status context `proven-merge`, receipts field `tool: proven-merge`), executed this month, with A's defensive pointer packages published under the *old* name (`merge-proof` → "renamed to proven-merge").** Confidence: 65%.

Reasoning a founder needs: (1) the only namespaces we hold are the hyphenated npm name and a 0.1.0 Marketplace listing with no installs; (2) the one-word form is already owned by two parties in every channel buyers use, and one of them files trademarks; (3) the Marketplace adjacency is not a future risk, it is the current result page; (4) the migration cost is at its lifetime minimum and rises roughly linearly with required-check adoption, which is the thing we are about to sell; (5) the Part 2 audience punishes crypto adjacency, and GenLayer's MergeProof is a staking protocol; (6) ProvenMerge has clean namespaces today and no incumbents, and its "Proven" root is the same word our receipt vocabulary already teaches. Do the rename before the first paid customer, not after.

Strongest counterargument: renaming spends a week and a name-recognition reset on a problem that has produced zero actual confusion tickets, while the product has zero customers; "merge-proof" ranks #1 for its own hyphenated query, the descriptive name converts browsers faster than a coined one, and if Aryaman's project stalls (1 star, one author, hosted-App PR closed) the collision may evaporate on its own. If Ryan weighs early traction over long-run brand hygiene, Option A with pointer packages is defensible; it is a bet that the collision decays, and it can be revisited at the first confusion ticket, at which point the cost will be higher but still bounded (<10 customers). No registration was performed.

## PART 4 — Three-year commoditization and platform-independence test

### 4.1 GitHub public roadmap items (github.com/github/roadmap, read 2026-09-19; labels as shown, no dates beyond GHES version tags)

| # | Item | Status/labels | Created | Erodes which Merge-Proof layer |
|---|---|---|---|---|
| 370 / 455 / 272 | Pull Request Merge Queue (cloud GA, GHES, private beta) | Shipped, closed 2024-03-12 / 2022-09-08 / 2021-11-16 | — | Baseline; queue is the thing that failed in I1 |
| 824 | More control over required status checks for PRs using merge queue | **Closed, not planned** (2024-11-20) | — | None; GitHub declined finer check control |
| 1300 | Convert Branch Protections to Rulesets [GA] | Open, Shipped, GHES 3.23 | 2026 | AZ (rule snapshotting must read rulesets, not legacy protections) |
| 1241 | Workflow Execution Protections: Actor and Event Configuration [GA] | Open, GA, GHES 3.23 | 2026-06-05 | Partially FC7/FC8: allowlists of actors/events that may trigger workflows; reduces pwn-request evidence, does not bind evidence to trees |
| 1290 | Path-based exclusions for push rules [Public Preview] | Shipped | 2026 | None |
| 1320 / 1319 / 1321 | Proof of Presence: re-authentication on PR merge & approval (Entra), GA across IdPs | Public Preview "Up Next" / GA | 2026-08-13 | **AZ, partially**: proves a human was present at approve/merge; does not bind approval to content, does not survive I5/I23-class bugs |
| 1274 | Attestation as first-class object in repo UI + Security Overview, SLSA level indicators [Public Preview] | Open, "Exploring", Enterprise/GHAS | 2026-06-12 | UI for build attestations; not merge/source attestations |
| 1261 | Attested SBOMs in Dependency Graph | Open, **Paused** | — | None |
| 1138 / 1137 | Immutable Releases GA / Preview | Shipped (GHES 3.20) | — | None (release artifacts) |
| 1103 | Immutable Actions Publishing | **Closed, not planned** | — | None |
| 947 / 943 | Artifact Attestations; Release Attestations | Shipped / Duplicate | 2024 | None directly; establishes Sigstore plumbing GitHub could reuse for a "merge attestation" |
| 1193 | GitHub Actions Data Stream (real-time job/run metadata; "immutable audit trail" per the 2026-03-26 security roadmap post) | Preview, "Up Next", Enterprise, GHES 3.23 | 2025-12-16 | **EB/WR partially**: a reliable stream of check evidence would replace webhook-reconciliation for Actions (not for external CI) |
| 1181 / 1179 | Automated security and quality validation for Copilot coding agent; security tools integration | Shipped GA | 2025-11 | None (content validation, not exact-state) |
| 1264 / 1262 / 1254 | Agentic autofix for security alerts / code scanning in PRs | Open / GA / Preview | 2026 | None; increases agent-authored PR volume (demand driver) |
| 1310 | AI Security Detections on PRs [GA] | Open, GA | 2026 | None |
| 921 | Historical audit log exports | Closed, not planned | — | None |
| 807 / 602 | Auth metadata for git events in audit logs; token data in audit events | Shipped | — | AZ input quality (better actor attribution) |
| 1326 / 1325 | Mobile: auto-merge / rebase for stacked PRs | Open GA | 2026 | None |
| Actions 2026 security roadmap (community #190621, 2026-03-26) | Dependency locking, workflow execution protections, scoped secrets, data stream, egress firewall; provenance-in-PRs "requested, not committed" | Blog post | 2026-03-26 | Confirms no committed native "merge receipt" |
| Changelog 2026-01-20 | Code-to-cloud traceability, SLSA Build L3 | Shipped | 2026-01-20 | Build side only |
| Changelog 2026-02-19 | "Changes to test merge commit generation for pull requests" | Shipped | 2026-02-19 | **PC/E input**: GitHub changed when/how `merge_commit_sha` is produced (I15/#843 show `null` until async); Merge-Proof must not depend on it |

Not on the roadmap as of today: a native attestation that binds approvals + checks to head/base/tree ids; a landed-tree vs validated-tree post-merge comparison; a portable, provider-independent receipt; a public log for private repos (attestations discussion #122028: private-repo Sigstore instance "does not have a transparency log").

### 4.2 Erosion assessment per layer (3-year view)

| Merge-Proof layer | Likely GitHub move by 2029 | Probability (analyst) | What remains external |
|---|---|---|---|
| Evidence binding (EB) | Rulesets already bind checks to head sha; PoP (#1320) binds a human moment to approve/merge; a "merge attestation" (Sigstore bundle of PR state at merge) is a natural extension of #947 + #1274 | 55% ships something | Independent recomputation from raw events (FC3 shows GitHub's own rollups were wrong in I5/I7); cross-provider normalisation (GitLab I23/I26); receipts for external CI (Buildkite, CircleCI) not in the Actions data stream |
| Currentness (CU) | #2026-02-19 changelog shows GitHub investing in test-merge generation; likely faster/more reliable `mergeable` | 70% improves | Provider-external recompute of merge-base/merge-tree (I6 shows GitHub's own merge-base engine disagreeing with itself); a verdict that is not blocked on GitHub's async job |
| Provider candidate vs expected (PC/E) | Very unlikely: GitHub attesting that its own candidate equals an independent `merge-tree` is self-audit | 15% | Everything: this layer is definitionally external |
| Landed vs proven (L/P) | After I1, GitHub "expanded automated test coverage"; could add an internal invariant check and surface a "merge integrity" status | 40% surfaces something | Independent comparison of landed tree vs proven tree from git objects; the incident showed GitHub's self-report was wrong for 3.5 h and remediation took days; a customer-side detector is the only one that does not share GitHub's failure domain |
| Authorization (AZ) | PoP, required-reviewer rules, better audit metadata: strong native progress | 75% | Snapshotting the rule config at verdict time (I4/I8/#193295 silent semantic changes); recomputing "who approved what content"; cross-provider |
| Webhook reconciliation (WR) | Actions data stream (#1193) reduces gaps for Actions; webhooks themselves have no replay for dropped `push`/`pull_request` (I13) | 50% for Actions, 10% for webhooks | Poll-vs-push reconciliation remains; external CI remains |

### 4.3 If GitHub ships a native "proof receipt"

What survives: (1) provider-external recomputation (PC/E, L/P) — a receipt signed by the party whose bug you are checking for is exactly what S2/S3 audiences reject; (2) landed-content comparison across the merge boundary from git objects, not API rollups; (3) an open verifier that runs offline against a portable bundle (GitHub's private-repo attestations have no public log, per #122028); (4) cross-provider normalisation (GitLab has a parallel incident corpus: I19–I27); (5) the incident corpus itself as a regression suite ("would have caught I1, I5, I7, I20, I23") — a native tool cannot credibly market "catches GitHub's bugs".

What does not survive, honestly: pre-merge "are the required checks green on this exact sha" as a standalone value, if GitHub attests it natively and reliably; approval-bound-to-commit as a differentiator once PoP + required-reviewer rules mature; webhook-gap detection for Actions once the data stream ships; and any UI/dashboard layer. If Merge-Proof's revenue depends on the pre-merge rollup alone, a native GitHub feature erodes it within the window. If it depends on external recomputation, post-merge tree comparison, portability and a verifier, nothing on the roadmap touches it, and I1 is the reason a buyer will believe that.

## Sources (URL, date read or snippet date, status from sandbox, confidence)

Part 1
- https://github.com/orgs/community/discussions/193645 — 2026-04-23 incident thread — reachable (via B-provider-divergence.md) — High
- https://x.com/kdaigle/status/2047803291988590609 — 2026-04-24 — snippet only — Medium-High
- https://x.com/mihaimaruseac/status/2047840698221867343 — 2026-04-24 — snippet — Medium
- https://www.thestack.technology/github-bug-messed-up-customer-code-coo-plays-down-incident/ — snippet — Medium
- https://github.com/orgs/community/discussions/46757 — merge queue beta feedback, 2023-02 — reachable — High
- https://github.blog/changelog/2023-04-19-pull-request-merge-queue-public-beta-api-support-and-recent-fixes/ — blocked; snippet — Medium
- https://github.com/orgs/community/discussions/58673 — bot attribution, 2023-06-21 — reachable — High
- https://github.com/orgs/community/discussions/54493 — dismiss stale approvals, 2023-05→2024-10 — reachable — Medium-High
- https://github.com/orgs/community/discussions/58535 — merge-base changed after approval, 2023-06→2026-09 — reachable — High
- https://github.com/orgs/community/discussions/28864 — skipped checks and auto-merge — reachable — High
- https://github.com/orgs/community/discussions/190610 — auto-merge 422, 2026-03-25 — reachable — High
- https://github.com/orgs/community/discussions/193295 — require-merge-queue rule enforcement change, 2026-04 — reachable — Medium
- https://github.com/orgs/community/discussions/186339 — queue not merging, 2026-02 — reachable — Medium
- https://github.com/orgs/community/discussions/156245 — 2025-04-09 PR processing — reachable — High
- https://github.com/orgs/community/discussions/179897 — 2025-11-18 — reachable — Medium
- https://github.com/orgs/community/discussions/185003 — webhooks essay, no staff — reachable — Low
- https://engineering.mercari.com/en/blog/entry/20241217-github-branch-protection/ — blocked; snippet — Medium
- https://www.legitsecurity.com/blog/bypassing-github-required-reviewers-to-submit-malicious-code — blocked; snippet — Low-Medium
- https://github.blog/news-insights/company-news/github-availability-report-july-2024/ — blocked; snippet — High
- https://github.blog/news-insights/company-news/github-availability-report-august-2026/ — blocked; snippet — High
- https://github.blog/news-insights/company-news/github-availability-report-september-2022/ — blocked; snippet — High
- https://pulsetic.com/status/github/incidents/6249/ — 2026-08-06 Actions/webhooks — snippet — Medium
- https://github.com/actions/checkout/issues/27 — merge commit from wrong base sha — reachable (title) — High
- https://github.com/github/docs/issues/15302 — GITHUB_SHA is merge commit — reachable (title) — High
- https://thehackernews.com/2026/06/github-updates-actionscheckout-to-block.html — snippet — Medium
- https://gitlab.com/gitlab-com/gl-infra/production/-/issues/5367 — 2021-08-17 merge trains — reachable — High
- https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6788 — 2022-04-07 merged-results — reachable — High
- https://gitlab.com/gitlab-com/gl-infra/production/-/issues/18676 — 2024-10-08 — reachable — High
- https://gitlab.com/gitlab-com/gl-infra/production/-/issues/20791 — 2025-10-29 webhooks — reachable — High
- https://gitlab.com/gitlab-org/gitlab/-/issues/395506 — approval lost race — HTTP 429; snippet — Medium
- https://gitlab.com/gitlab-org/gitlab/-/issues/344021 — merge train transient not-mergeable — reachable — Medium
- https://gitlab.com/gitlab-org/gitlab-foss/-/work_items/53674 — pipeline-must-succeed bypass via `only` — snippet — High
- https://gitlab.com/gitlab-org/gitlab/-/work_items/597487 — external status marks config_error pipeline success — reachable — High
- https://docs.gitlab.com/releases/patches/patch-release-gitlab-16-7-2-released/ — CVE-2023-4812 — snippet — High
- https://cyberstrike.io/cve/CVE-2026-6883/ — snippet — Medium
- https://bitbucket.status.atlassian.com/ — 2026-09-11 — snippet — Low
- https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-pull-request-merge-check-functionality-doesnt-work-for-commit-build-status-updated-through-api/ — snippet — Low-Medium

Part 2
- https://news.ycombinator.com/item?id=47881672 — 2026-04-24 — blocked; snippet — Medium-High
- https://news.ycombinator.com/item?id=48274410 ; https://thehackernews.com/2026/07/github-verified-commits-can-be.html — 2026-07 — snippet — High
- https://github.com/orgs/community/discussions/72294 — Verified after key expiry — reachable (title/snippet) — Medium
- https://news.ycombinator.com/item?id=43448075 and 43448745 — 2025-03 — snippet — High
- https://news.ycombinator.com/item?id=38057591 — 2023-11 — snippet — Medium
- https://news.ycombinator.com/item?id=41874428 ; 31253999 ; 28121060 ; 42784892 — Sigstore threads — snippet — Medium-High
- https://github.com/orgs/community/discussions/122028 — Artifact Attestations beta; private-repo instance has no transparency log — reachable — High
- https://news.ycombinator.com/item?id=36707239 ; 45199378 ; 27858013 — merge queue/bors — snippet — Medium
- https://graphite.com/blog/bors-google-tap-merge-queue ; https://mergify.com/blog/the-origin-story-of-merge-queues ; https://mergify.com/blog/merge-queue-is-critical-infrastructure/ — snippet — Medium
- https://news.ycombinator.com/item?id=46766961 (2026-02-07) ; 45371283 ; https://newsletter.pragmaticengineer.com/p/what-is-happening-with-code-reviews — snippet — Medium-High
- https://news.ycombinator.com/item?id=47193330 (NotaryOS) ; https://dev.to/luckypipewrench/what-a-hash-chain-cant-prove — snippet — Medium
- https://news.ycombinator.com/item?id=38004178 (2023-11-01) ; 40303338 (2024-05-10) — gittuf — snippet — Medium
- https://github.com/gitgitgadget/git/pull/1122 ; https://gitlab.com/gitlab-org/gitaly/-/merge_requests/4479 — merge-tree — reachable — High
- https://dev.to/korovinaa97/what-does-a-green-ci-check-actually-prove-hn5 and related dev.to/Medium posts — blocked; snippets — Medium
- https://matrixgard.com/blog/npm-pypi-provenance-attestation-supply-chain-2026/ — blocked; snippet — Medium

Part 3
- https://github.com/ohcaygo/merge-proof — README read 2026-09-19 — reachable — High
- https://github.com/marketplace?query=merge+proof and ?query=merge+evidence — read 2026-09-19 — reachable — High
- https://github.com/search?q=%22mergeproof%22+OR+%22merge-proof%22&type=repositories — reachable — High
- registry.npmjs.org and pypi.org probes for 10 names — reachable — High
- DNS via getent for 17 domains — High (DNS only; not WHOIS)
- api.github.com/users|orgs/<name> — 403 via proxy — unverified
- https://trademarks.justia.com/990/16/genlayer-99016120.html — GENLAYER serial 99016120, filed 2025-01-23 — blocked; snippet — Medium
- USPTO TESS/TSDR, EUIPO, WIPO, UK IPO, rdap.org — all blocked (curl 000) — unverified

Part 4
- https://github.com/github/roadmap/issues (queries: merge queue; rulesets; attestation OR provenance; audit log OR data stream OR webhook; copilot review OR coding agent; newest open) — read 2026-09-19 — reachable — High
- https://github.com/github/roadmap/issues/1274 , /1241 , /1320 , /1193 , /1181 — reachable — High
- https://github.com/orgs/community/discussions/190621 — Actions 2026 security roadmap, 2026-03-26 — reachable — High
- https://github.blog/changelog/2026-01-20-strengthen-your-supply-chain-with-code-to-cloud-traceability-and-slsa-build-level-3-security/ ; https://github.blog/changelog/2026-02-19-changes-to-test-merge-commit-generation-for-pull-requests/ — blocked; titles/snippets — Medium
