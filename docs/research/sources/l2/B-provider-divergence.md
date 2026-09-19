# B — Provider divergence: can Merge-Proof independently detect a GitHub merge whose landed tree differs from what was validated?

Research date: 2026-09-19. Local experiments run with `git version 2.43.0` in `scratchpad/l2/git-experiments/` (all hashes below are reproducible with the fixed author/committer identity `A <a@x>` and date `2026-01-01T00:00:00Z`; the scripts are in the shell transcript summarised per experiment).

Network limits during this research: `github.com` and `raw.githubusercontent.com` were reachable; `github.blog`, `docs.github.com`, `githubstatus.com`, `news.ycombinator.com`, `trunk.io`, `dev.to`, `thestack.technology` were blocked by the egress proxy. Doc text is therefore quoted from the `github/docs` Markdown sources and from the `github/rest-api-description` OpenAPI file (which also carries the webhook schemas under `x-webhooks`) and the GraphQL schema shipped in `github/docs`.

---

## Part 1 — The 2026-04-23 merge queue incident

### 1.1 What GitHub said (community discussion #193645, "[2026-04-23] Incident Thread")

Quoted from the discussion's incident summary (fetched 2026-09-19):

* Window: "April 23, 2026, between 16:05 UTC and 20:43 UTC" (3 h 38 min of incorrect merges).
* Failure mode: "PRs merged via merge queue using the squash merge method produced incorrect merge commits when the merge group contained more than one PR."
* Content of the bad commits: "changes from previously merged PRs and prior commits were inadvertently reverted by subsequent merges."
* Scope: "230 repositories and 2,092 pull requests were affected". (GitHub's separate 2026-04-28 availability post on github.blog reportedly gave 658 repositories with the same 2,092 PR count, explained as an initially conservative estimate; that page was not fetchable here, so treat 658 as second-hand. The PR count is consistent across sources.)
* Unaffected: PRs merged outside the merge queue, and queue groups using the merge-commit or rebase methods.
* Mechanism: "The regression was introduced by a new code path that adjusted merge base computation for merge queue ref updates. This code path was intended to be gated behind a feature flag for an unreleased feature, but the gating was incomplete." The result was "an incorrect three-way merge".
* Detection: not by monitoring — "the issue affected merge commit correctness rather than availability"; GitHub "became aware at 19:38 UTC following an increase in customer support inquiries" (time to detect ≈ 3 h 33 min).
* Remediation: "reverting the code change and force-deploying the fix across all environments", then GitHub "identified affected repositories and sent targeted remediation instructions". Users in the thread (andre-bonfatti, ross-imprint, 2026-04-23) report seeing GitHub-created commits whose titles carry a `[restored]` suffix after the PR number, that "HEAD didn't match PR contents merged that day", and that a subset of their ~20 affected PRs "self-healed" while others had to be re-applied by hand.
* Prevention: "expanding test coverage for merge correctness validation" across merge queue configurations.

Interpretation of the mechanism in git terms (mine, consistent with GitHub's text and reproduced locally in §2.5): with a multi-PR squash group, GitHub lands one squash commit per PR. The second and later squash commits are produced by a three-way merge whose base must be the true merge-base of the PR and the branch (the fork point). The bad code path used a different base (one that already contained the earlier PR's changes and/or recent base-branch changes). In a three-way merge, everything that is present in *ours* but absent in the (wrong) *base* and absent in *theirs* is treated as "removed on theirs" and is dropped. Hence: earlier PRs in the group and recent commits on the base were silently reverted.

### 1.2 Which read-only comparison would have detected each affected merge

Assume only GitHub API read access: the PR object (`merge_commit_sha`, `head.sha`, `base.sha`), `merge_group` webhooks (`head_sha`, `base_sha`, `head_commit.tree_id`), the Git Data API (`GET /repos/{o}/{r}/git/commits/{sha}` → `tree.sha`), the compare API, and the Contents API.

The essential observation: the queue *validated* a temporary group commit (`merge_group.head_sha`, on `refs/heads/gh-readonly-queue/<base>/pr-N-<sha>`) whose tree, by construction, is "the target branch + PR1 + … + PRn". CI ran on that tree. For a merge-commit queue the group commit itself becomes the new base tip (fast-forward), so landed tree ≡ validated tree trivially. For squash and rebase queues GitHub must *manufacture new commits* on the base branch, and it is that manufacturing step that broke. Therefore:

| Comparison | When | Would it have fired for every affected merge? | False-positive risk |
|---|---|---|---|
| **C1. LANDED vs PROVIDER_CANDIDATE**: tree of the new base tip after the group merged (last PR of the group) vs `merge_group.head_commit.tree_id` of the validated group | Post-merge (on `push` to base / `pull_request.closed`) | **Yes.** The group's final tree contained all PRs; the landed squash chain's final tree lacked reverted changes. Any difference is exactly the incident. | Near zero when the base did not move between the group build and the landing (which the queue guarantees for the base ref; the queue is the only writer). A bypass merge by an admin during the window is the only benign cause and is itself worth flagging. |
| **C2. LANDED vs EXPECTED_TREE**: locally computed `git merge-tree` of (base tip at landing time, PR head) — sequentially per PR for a group | Post-merge | **Yes**, for every affected squash — the expected tree equals what a correct 3-way merge yields; the landed tree does not. | Zero for clean merges (merge-tree is deterministic, §2). Requires the git objects locally. |
| **C3. Per-PR squash diff sanity**: `compare` base_sha..landed_sha file list vs `compare` merge-base..pr_head file list | Post-merge | Yes: the bad squash commits touched files the PR did not touch (the reverted ones). | Non-zero: a legitimate squash after base movement *can* touch only PR files, but a squash that touches files outside the PR's own diff is always abnormal. The 300-file cap on `compare` makes this incomplete for large PRs. |
| **C4. PROVIDER_CANDIDATE vs EXPECTED**: `merge_group.head_commit.tree_id` vs locally computed merge-tree | Pre-merge (on `merge_group.checks_requested`) | **No.** The group commit was correct in this incident (that is what CI validated). The corruption happened when landing. | Zero, but it only catches candidate substitution, not this incident. |
| **C5. PR object after merge**: `merge_commit_sha` reachable from base, `merged=true` | Post-merge | No. The PR was "merged" per GitHub; the SHA was real and reachable. Metadata was consistent; content was wrong. | — |

So: the incident was detectable only *post-merge*, and only by comparing **trees**, not SHAs or PR state. C1 needs no local git objects at all (both tree ids come from the API: `merge_group.head_commit.tree_id` and `GET /git/commits/{landed}` → `tree.sha`), which makes it the cheapest, fully API-based detector. The residual weakness of C1 is that it trusts GitHub's *report* of which tree the group had; C2 removes that trust by recomputing from objects. Both would have flagged all 2,092 PRs within seconds of each `push` to the base branch, instead of the 3.5 h it took support tickets.

A further clue GitHub already exposes: the `pull_request.dequeued` webhook has `reason` values `GIT_TREE_INVALID` and `INVALID_MERGE_COMMIT` (OpenAPI `webhook-pull-request-dequeued`), i.e. GitHub has internal tree-validity checks on the *candidate*, but evidently none on the *landed* commit.

---

## Part 2 — Deterministic reconstruction experiments

All experiments: `git version 2.43.0`. `git merge-tree --write-tree` exists since git 2.38 ("computes a tree that would result in the merge commit", RelNotes 2.38.0). Two features used in the discussion were **not** available in 2.43: `--quiet` (rejected as unknown option) and passing bare trees with `--merge-base` (RelNotes 2.45.0: "the three trees involved in the 3-way merge only need to be trees, not necessarily commits"; on 2.43 `main^{tree}` errors with "expected commit type"). Pin git ≥ 2.45 in the worker image.

### 2.1 Setup (exp1)

```
C0: a.txt = line1..line20, b.txt = "x"
main: B1 edits a.txt line2; B2 edits b.txt          -> BASE_TIP 9bbd8f45… tree 15f137c4…
P   : P1 edits a.txt line19; P2 adds c.txt          -> HEAD_TIP cf6e9c69… tree e0dc40e5…
merge-base(main,P) = bc0be425… (C0) tree b30949c9…
```

### 2.2 (a) Merge commit

```
$ git merge-tree --write-tree main P
7df96d8a9f551979fb0a63cd4d65353c6269273b        # exit 0
$ git merge-tree --write-tree --merge-base=bc0be425… main P
7df96d8a9f551979fb0a63cd4d65353c6269273b        # same, with explicit base
$ git merge --no-ff -m "M merge P" P
actual merge commit 7fd4fcbd… tree=7df96d8a9f551979fb0a63cd4d65353c6269273b
parents: 9bbd8f45… cf6e9c69…
$ git merge-tree --write-tree P main
7df96d8a9f551979fb0a63cd4d65353c6269273b        # symmetric in the clean case
```

The tree is a pure function of (base tip, head tip, merge-base) plus the merge algorithm (ort, default rename detection). The commit SHA is *not* predictable (message, committer, timestamp), which is why all comparisons in Part 3 are on tree ids, never commit ids.

Conflicts (exp2: both sides edit a.txt line10):

```
$ git merge-tree --write-tree main P ; echo exit=$?
b7ffdc47a969c11477659fe000cdfdfee536284c
100644 f696b4b7… 1  a.txt
100644 7583cc43… 2  a.txt
100644 5c50fadc… 3  a.txt

Auto-merging a.txt
CONFLICT (content): Merge conflict in a.txt
exit=1
$ git show b7ffdc47…:a.txt | sed -n 10,14p
 <<<<<<< main
line10 BASE
 =======
line10 PR
 >>>>>>> P
```

merge-tree still writes a tree (with conflict markers) and exits 1; `git merge` fails the same way. `-X ours` / `-X theirs` give different, deterministic trees (41ec153a…, c6d83858…). GitHub does **not** resolve conflicts itself: the PR reports `mergeable=false`/`mergeable_state=dirty`, the merge button is disabled, and a queue entry is dequeued with `reason=MERGE_CONFLICT` (docs: "if there are failed required status checks or conflicts with the base branch, the pull request will be removed from the queue"). So the honest expectation in the conflict case is "no merge should land at all"; any landing is a divergence.

### 2.3 (b) Squash

Base moved (exp1):

```
$ git merge --squash P && git commit -m "S squash P"
squash commit dc1ead2a… tree=7df96d8a9f551979fb0a63cd4d65353c6269273b  parents=9bbd8f45… (one parent: base tip)
head tree = e0dc40e5…  (differs)
```

Squash tree == merge-tree result (7df96d8a…), **not** the PR head tree, because the squash carries the base's B1/B2 changes. Single parent = base tip; GitHub's docs confirm the shape: squash merges are "merged using the fast-forward option", i.e. one new commit whose sole parent is the base tip.

Base did not move (squash onto C0):

```
squash2 tree = e0dc40e5…  == head tree e0dc40e5…  == merge-tree(C0,P) e0dc40e5…
```

So EXPECTED_TREE for squash is always `merge-tree(base_tip, head)`; it collapses to the head tree only when base_tip is the merge-base.

### 2.4 (c) Rebase

Clean case (exp1):

```
$ git rebase main   (on P)
rebased tip 4c70d94b… tree=7df96d8a9f551979fb0a63cd4d65353c6269273b   # == merge-tree result
intermediate d64ee0ab… tree=2f9d7d6d…                                   # per-commit trees are extra info
```

Final tree equals the merge-tree result; commit SHAs are new even with identical identity/dates (parent changed).

Divergence case (exp3: P contains P1 "edit line10", P2 "revert line10", P3 "append"; main edits line10):

```
$ git merge-tree --write-tree main P        -> 804a8f9e…  exit 0   (net P change is only the append: clean)
$ git rebase main                           -> CONFLICT (content) in a.txt while applying P1; exit 1
```

Merge is clean because the *net* PR change does not touch line10; rebase replays P1, which does. So for rebase the clean-merge tree is only a *necessary* prediction: GitHub may refuse ("If GitHub cannot safely rebase the pull request automatically, you can rebase locally"), and it may replay commits in a way that differs from `git rebase`. GitHub's own documented deviations (`data/reusables/pull_requests/rebase_and_merge_summary.md`): rebase and merge "Always updates the committer information and creates new commit SHAs" and "Drops commits that were empty to begin with, such as those created with `git commit --allow-empty`, whereas `git rebase` keeps originally-empty commits by default." Verified locally (exp3b): default `git rebase` kept 2 commits, `git rebase --no-keep-empty` kept 1; the final tree was identical in both (04a59185…). Empty commits do not change trees, so the *tree* prediction survives; the commit *count* does not. Rebased commits are also unsigned ("added to the base branch without commit signature verification"), so signature-based receipts cannot survive a rebase merge.

### 2.5 (d)/(e) Merge queue groups, sequential merge-tree, and the incident reproduced

exp4 setup: C0 (a.txt 30 lines, cfg.txt `cfg=0`); main B1 edits line1; PR1 edits line10 and sets `cfg=1`; PR2 edits line25. `B=e33922df… PR1=c8765c91… PR2=ceef335d…`.

Merge-method queue, computed only from objects:

```
T1 = merge-tree(B, PR1)        = 07bc59d4…   ; G1 = commit-tree T1 -p B -p PR1 = 90116e43…
T2 = merge-tree(G1, PR2)       = 039eda45…   ; G2 = commit-tree T2 -p G1 -p PR2 = d182c685…
actual `git merge --no-ff PR1; git merge --no-ff PR2`: trees 07bc59d4…, 039eda45… (identical)
order swapped (PR2 then PR1): final tree 039eda45… (identical: clean merges commute)
```

Squash-method queue:

```
S1 = commit-tree T1 -p B                 = d6fc6dae…  (tree 07bc59d4…, single parent B)
merge-base(S1, PR2) = 8a4f6ac9… (= C0)   # the fork point is still found via S1's parent chain
TS2 = merge-tree(S1, PR2)                = 039eda45…  == T2
S2 = commit-tree TS2 -p S1               = 8ab42fb0…
```

Rebase-method queue: rebase PR1 onto B, then PR2 onto that: final tree 039eda45… == T2.

So for a multi-PR group the *final* landed tree is predictable and method-independent in the clean case: `T_n = merge-tree(T_{n-1}-commit, PR_n)` applied in queue order. Order does matter when entries overlap (exp5: PR1 and PR2 both edit line10):

```
PR1 then PR2: merge-tree(G1,PR2) -> CONFLICT, exit 1  -> PR2 dequeued; landed tree 2635e1d7… (line10 PR1)
PR2 then PR1: merge-tree(G1',PR1) -> CONFLICT           -> PR1 dequeued; landed tree d2518fda… (line10 PR2)
```

Renames (exp5): PR1 renames a.txt→z.txt, PR2 edits a.txt line25; both orders give acf72aaa… with the edit inside z.txt (ort rename detection). Rename detection thresholds (`-X find-renames=…`, `merge.renameLimit`) are the one algorithm knob that could make Merge-Proof's EXPECTED_TREE disagree with GitHub's on a *clean* merge; keep defaults and record the git version in the receipt.

**Incident reproduction** (wrong merge base while squashing the second PR of a group):

```
Correct : merge-tree --merge-base=C0  S1 PR2                  -> 039eda45…   (line10 PR1, cfg=1, line25 PR2, line1 BASE)
Wrong A : merge-tree --merge-base=G1  B  G2                   -> 904e9899…
Wrong B : merge-tree --merge-base=PR1 B  PR2                  -> 904e9899…
$ git diff --stat 039eda45… 904e9899…
 a.txt   | 2 +-      # line10 back to "line10"  (PR1's edit reverted)
 cfg.txt | 2 +-      # cfg=0                     (PR1's edit reverted)
```

Using a base that already contains PR1 makes the 3-way merge see PR1's changes as "present in base and ours, removed in theirs" and drops them — exactly "changes from previously merged PRs … were inadvertently reverted by subsequent merges". Note that the wrong tree 904e9899… differs from the validated group tree 039eda45…: comparison C1 fires.

### 2.6 What is documented vs unknown about what lands from a group

Known from `managing-a-merge-queue.md`:
* The queue "creates temporary branches with a special prefix" `gh-readonly-queue/{base_branch}/…`; they "contain a different `sha` from the pull request".
* Group N's branch "contains code changes from the target branch, pull request #1, and pull request #2" (cumulative); on green CI "the temporary branch `main/pr-2` will be merged in to the target branch. The target branch now contains both changes from pull request #1 and #2."
* Merge method is per queue: "Merge method: Select which method to use when merging queued pull requests: merge, rebase, or squash." GraphQL `MergeQueueConfiguration.mergeMethod: PullRequestMergeMethod`, `mergingStrategy: ALLGREEN | HEADGREEN` (HEADGREEN: "Failing Entires are allowed to merge if they are with a passing entry").
* `merge_group` payload: `head_sha` ("The SHA of the merge group"), `base_sha` ("The SHA of the merge group's parent commit"), `head_ref`, `base_ref`, and `head_commit` (`simple-commit`: `id`, `tree_id`, `message`, `author`, `committer`, `timestamp`). **`head_commit.tree_id` is the provider candidate tree, delivered in the webhook itself.**
* GraphQL `MergeQueueEntry { baseCommit: Commit, headCommit: Commit, position, state, solo, jump, pullRequest }`; `Commit.tree.oid` is available on both. `PullRequest.mergeCommit: Commit` ("The commit that was created when this pull request was merged").
* REST PR object after merge: "If merged via a squash, `merge_commit_sha` represents the SHA of the squashed commit on the base branch. If rebased, `merge_commit_sha` represents the commit that the base branch was updated to."

Not documented (unknown, must be observed per repo and recorded as such):
* For a squash/rebase queue, whether the landed commits are freshly manufactured on the base (the incident text — "merge base computation for merge queue ref updates" — and the `[restored]` commits imply yes: one new squash commit per PR, parents chained) or whether the group's temporary commits are reused. For a merge queue with method=merge it is *plausible* that base is fast-forwarded to the group commit (head_sha), but the docs only say the branch "will be merged in to the target branch". Merge-Proof must therefore record `landed_sha == merge_group.head_sha` as an *observation*, not assume it.
* For multi-PR squash groups, whether all n squash commits are pushed in one ref update (one `push` webhook with n commits) or n updates. Design for both.
* Whether `merge_group.base_sha` is the base tip at group creation or the previous group's head (for group N>1 the docs' cumulative description implies the previous group's head).

### 2.7 Getting tree ids and objects; cost

REST (Contents:read suffices; all three endpoints are `enabledForGitHubApps: true`):

```
GET /repos/{o}/{r}/git/commits/{sha}   -> { "sha": …, "tree": { "sha": "<TREE>", "url": … }, "parents": [ {sha…}, … ] }
GET /repos/{o}/{r}/git/trees/{tree}?recursive=1   (cap: 100,000 entries / 7 MB; else walk sub-trees)
GET /repos/{o}/{r}/git/blobs/{sha}     (base64 or application/vnd.github.raw+json)
GET /repos/{o}/{r}/commits/{ref}       (300 files per page, up to 3000; diff media type may 5xx on large diffs)
GET /repos/{o}/{r}/compare/{base}...{head}   ("up to 300 changed files for the entire comparison"; 250 commits unpaged)
```

GraphQL: `repository(owner,name){ object(oid:"<sha>"){ ... on Commit { oid tree { oid } parents(first:2){ nodes{ oid } } } } }` and `pullRequest(number){ mergeCommit { oid tree{oid} } mergeQueueEntry { headCommit{oid tree{oid}} baseCommit{oid} } }`.

Git objects for `merge-tree`: the 3-way content merge needs the three commits' trees and the blobs of every path that changed on *both* sides; blobs changed on one side only are resolved at tree level. Partial clone measurements (exp7: 50 × 200-line filler files never touched by either side):

```
blobless clone (--filter=blob:none, --no-checkout): 4 commits 4 trees 0 blobs fetched
merge-tree B PR1 -> 733d2761… ; 1 lazy `git fetch --filter=blob:none --stdin` subprocess; +4 blobs, +1 tree
treeless clone (--filter=tree:0): 4 commits; merge-tree -> same tree; 4 lazy fetch subprocesses (+4 trees +4 blobs)
empty repo + `git fetch --filter=blob:none origin B PR1 PR2` (server: uploadpack.allowAnySHA1InWant): same result, 1 lazy fetch
shallow `--depth=1` of the two tips: "refusing to merge unrelated histories" — no merge base reachable
```

So `--filter=blob:none` is the right shape: commit graph (needed for merge-base) plus trees, blobs fetched on demand only for double-touched paths. Cost ≈ O(commits) metadata once, then O(files changed on both sides) blobs per merge. GitHub serves partial clones and fetch-by-SHA; an installation token authenticates git over HTTPS: "Your app must have the 'Contents' repository permission … `git clone https://x-access-token:TOKEN@github.com/owner/repo.git`" (`authenticating-as-a-github-app-installation.md`). Shallow clones are unusable; keep a persistent blobless mirror per repo and `git fetch origin <sha>` incrementally.

---

## Part 3 — Definitions and feasibility matrix

**EXPECTED_TREE (E)**: computed by Merge-Proof from git objects it fetched, given the declared merge method and queue shape: `E = merge-tree(base_tip_at_landing, pr_head)` for single PRs (all three methods, clean case), and `E_n = merge-tree(commit(E_{n-1}), pr_head_n)` in queue order for groups. Conflict → E is *undefined* and the expected outcome is "nothing lands".

**PROVIDER_CANDIDATE_TREE (P)**: the tree GitHub says it validated: `merge_group.head_commit.tree_id` (queues) or the tree of the PR's test-merge commit `merge_commit_sha` while open (non-queue merge-commit method; the test merge ref "becomes outdated without warning" and must be re-requested via `GET /pulls/{n}` before reading).

**LANDED_TREE (L)**: tree of the new base tip after merge (`push.after` → `GET /git/commits` → `tree.sha`), plus its parents and, for groups, the trees of each intermediate landed commit.

Failure classes: **PD** provider divergence (GitHub's manufacturing step produced a different tree than it validated) — the 2026-04-23 class; **CS** candidate substitution (GitHub validated/reported a candidate that is not the merge of the recorded base and head); **BM** base movement outside the queue between validation and landing; **BY** out-of-queue bypass merge (admin "Merge without waiting for requirements"); **SS** squash-of-stale-head (squash/rebase built from an older head than the one whose evidence was proven, e.g. a push raced the merge).

Feasibility classes: **D-I** deterministic and independent (Merge-Proof computes both sides from git objects); **D-T** deterministic but provider-trust dependent (one side is an API-reported SHA/tree); **IMP** impossible / not reconstructable.

| Merge method × queue shape | E vs P (pre-merge) | L vs P (post-merge) | L vs E (post-merge) | Parents/ref checks | Notes |
|---|---|---|---|---|---|
| merge commit, no queue | D-T (P from test-merge commit, refreshed): catches CS | D-T: catches PD | **D-I**: catches PD, BM (recompute with actual first parent), SS (recompute with proven head vs landed second parent) | second parent must == proven head (D-T, catches SS/BY); first parent must == base tip we fetched | Clean case fully reconstructable; conflict → nothing should land |
| squash, no queue | n/a (no candidate object exposed for squash) | n/a | **D-I**: catches PD, BM, SS | single parent == prior base tip; landed diff subset check (C3) | E collapses to head tree only if base did not move |
| rebase, no queue | n/a | n/a | D-I for final tree in clean case; per-commit trees D-I only if `git rebase` replay matches GitHub's; **IMP** when GitHub's rebase would conflict where merge is clean (exp3) or vice-versa | landed commits count == non-empty PR commits; committer rewritten; no signatures | Receipt should say "final tree matches expected" and stop there |
| merge queue, method=merge, single-PR group | **D-I** (E from base_sha+pr_head vs `head_commit.tree_id`): catches CS | D-T: catches PD | **D-I**: catches PD, BM | L's commit == `head_sha`? (observation; if equal, PD impossible by construction) | Strongest case |
| merge queue, method=squash, single-PR group | D-I: catches CS | **D-T: catches PD — this is the incident detector** | D-I: catches PD, BM | landed parent == group `base_sha` (catches BM/BY) | GitHub manufactures a new commit; both comparisons needed |
| merge queue, method=rebase, single-PR group | D-I: catches CS | D-T: catches PD | D-I for final tree; per-commit IMP | landed tip parent chain ends at `base_sha` | |
| merge queue, multi-PR group, ALLGREEN, any method | D-I sequentially (E_n vs each group's `tree_id`, needs all PR heads in the group; order from `position`/webhook sequence): catches CS | D-T: final landed tip vs last group's `tree_id`: catches PD (incident) | D-I: catches PD, BM; order sensitivity only under conflicts (which should never land) | for squash: n single-parent commits chained; each intermediate landed tree should equal the corresponding group's tree_id | Need the membership of the group; not in the `merge_group` payload — derive from `pull_request.enqueued` order and from `head_commit.message` / compare base_sha..head_sha commit list |
| merge queue, multi-PR group, HEADGREEN | same as above for E vs P | D-T | D-I *only if* all member heads are known; otherwise **IMP** for per-PR attribution: landed content includes PRs whose own checks failed | — | Receipt for a member PR must say "landed as part of group G whose head passed; this PR's own checks: <state>" |
| any method, indirect merge (PR marked merged because its commits became reachable otherwise) | n/a | **IMP** | **IMP** | `merge_commit_sha` may be a foreign commit; docs: "Pull requests merged indirectly are marked as `merged` even if branch protection rules on that pull request were not satisfied" | Classify as BY |
| any method, conflict at landing time | E undefined | — | — | If anything lands: PD or BY | Because GitHub never auto-resolves |

Minimal data and permissions:
* Webhooks: `pull_request` (Pull requests: read), `merge_group` (Merge queues: read; app webhooks only), `push` (Contents: read).
* REST/GraphQL reads above: Contents: read (Git Data API, compare, commits) and Pull requests: read (PR object, `mergeCommit`, `mergeQueueEntry`).
* Git protocol: installation token as `x-access-token` password, Contents: read. No write permission of any kind is required.

Where the honest receipt statement must be "provider candidate tree recorded; expected tree not reconstructable":
1. rebase (non-queue or queue) when local replay conflicts or when per-commit correspondence is needed;
2. HEADGREEN groups when Merge-Proof lacks the full member list;
3. indirect merges;
4. any merge where the fetched objects cannot supply a merge base (shallow/missing history) or where git versions differ in rename-detection behaviour and the tree mismatch is confined to rename outcomes (rare; record git version and `-X` options in the receipt);
5. multiple merge bases (criss-cross history): `merge-tree` performs recursive virtual-base merging like `git merge`, but `--merge-base=<one>` "may cause merge results to differ"; never pass a single explicit base when `git merge-base --all` returns more than one.

---

## Part 4 — Post-merge verification design sketch

Inputs per PR: the *proven* candidate (`proven_head`, `proven_base`, `proven_tree` = P recorded at receipt time, the group ref/sha if queued, declared merge method from repo settings or `MergeQueueConfiguration.mergeMethod`).

Triggers:
1. `pull_request.closed` with `merged=true`: read `merge_commit_sha`, `head.sha`, `base.sha`, `merged_at`.
2. `push` to `refs/heads/<base>`: read `before`, `after`, `commits[]` (≤ 2048; each with `tree_id`), `forced`.
3. `merge_group.destroyed` with `reason=merged`: read `head_sha`, `head_commit.tree_id`.

Resolution algorithm (idempotent per `X-GitHub-Delivery`, tolerant of any arrival order):
```
landed = GET /git/commits/{merge_commit_sha}   -> L.tree, L.parents
if not reachable from base ref (compare landed...base status != identical/behind): LANDED_UNRESOLVABLE(reason=not_on_base)  [retry with backoff: race]
method := infer from parents: 2 parents -> merge; 1 parent and message/PR mapping -> squash or rebase
P := recorded candidate tree (merge_group.head_commit.tree_id or test-merge tree)
E := merge-tree(L.parents[0], proven_head) computed locally  (for groups: sequential over members)
if L.tree == P and L.tree == E:        LANDED_MATCHES_PROVEN
elif L.tree == E and L.tree != P:      LANDED_MATCHES_EXPECTED_NOT_PROVEN   (candidate substitution or base moved between proof and landing; inspect parents[0] vs proven_base)
elif L.tree != E:                      LANDED_DIVERGES                       (provider divergence, or bypass; attach `git diff --stat E L`)
else:                                  LANDED_UNRESOLVABLE                   (E undefined: conflict, missing objects, rebase replay failed)
```

Squash parent structure: the landed commit has exactly one parent; `L.parents[0]` must equal the base tip immediately before landing (for a queue group, the previous member's landed commit or `merge_group.base_sha`); `proven_head` is *not* a parent, so head binding is established through E (recomputed from `proven_head`) rather than through ancestry. Merge-commit: `parents[1] == proven_head` is a direct, independent binding; `parents[0]` gives the base actually used. Rebase: no parent points at the PR; walk `before..after` on the push and require each landed commit's tree to be reproducible, or fall back to final-tree-only.

`merge_commit_sha` vs push `after`: they coincide for single-PR merges. For a multi-PR squash group `after` is the last member's commit and each PR's `merge_commit_sha` is its own squash commit inside `before..after`; verify per PR (its own commit tree vs the corresponding group tree) and per group (final tree vs last group `tree_id`). If `after` is not the PR's `merge_commit_sha` and the PR's commit is not in `commits[]`, the merge is either indirect or bypassed: LANDED_UNRESOLVABLE with reason.

Timing races:
* Webhook order is not guaranteed and redeliveries reuse `X-GitHub-Delivery`; persist every event keyed by delivery id and resolve when the set is complete (closed + push covering `merge_commit_sha`).
* The base can advance again before the reader runs: never read "tip of base"; read the specific `after`/`merge_commit_sha` object and verify reachability with `compare`. Objects are immutable, so late reads are safe; only ref reads race.
* The PR's test-merge ref becomes stale; P for non-queue merges must be captured at proof time, not at verification time.
* A force-push to base (`push.forced=true`) after landing invalidates reachability; report separately.

Cheap path first: compare `push.commits[].tree_id` / `merge_group.head_commit.tree_id` / `git/commits.tree.sha` (pure API, catches the incident); expensive path second: fetch objects into the blobless mirror and compute E to remove provider trust and to attribute the divergence.

---

## Sources

* GitHub Community, "[2026-04-23] Incident Thread", discussion #193645 — https://github.com/orgs/community/discussions/193645 (fetched 2026-09-19)
* Web search snippets of GitHub Blog "An update on GitHub availability" (2026-04-28; page blocked, second-hand only) — https://github.blog/news-insights/company-news/an-update-on-github-availability/
* github/docs `content/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue.md` (main, fetched 2026-09-19)
* github/docs `content/pull-requests/reference/pull-request-merges.md`; `data/reusables/pull_requests/{squash_and_merge_summary,rebase_and_merge_summary,rebase_and_merge_verification,merge-queue-reject,merge-queue-overview}.md`
* github/docs `content/rest/guides/using-the-rest-api-to-interact-with-your-git-database.md` (test merge commit / `merge` refs going stale)
* github/docs `content/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation.md` (`x-access-token`, Contents permission)
* github/docs `content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md` (`merge_group`, `GITHUB_SHA` = SHA of the merge group)
* github/docs `content/webhooks/using-webhooks/best-practices-for-using-webhooks.md` (redelivery keeps `X-GitHub-Delivery`)
* github/rest-api-description `descriptions/api.github.com/api.github.com.json` (main): schemas `merge-group`, `simple-commit` (`tree_id`), `webhook-pull-request-dequeued.reason`, `webhook-push`, `git-commit.tree`, endpoint descriptions for `/git/commits`, `/git/trees`, `/git/blobs`, `/compare`, `/commits/{ref}`, `/pulls/{n}`; `x-webhooks` permission text ("Merge queues", "Contents", "Pull requests")
* github/docs `src/graphql/data/fpt/schema.docs.graphql`: `MergeQueueEntry`, `MergeQueue`, `MergeQueueConfiguration`, `MergeQueueMergingStrategy`, `PullRequest.mergeCommit`, `Commit.tree`
* git `Documentation/git-merge-tree.adoc` (master) and `Documentation/RelNotes/{2.38.0,2.45.0}.adoc`
* Local experiments exp1–exp7 in `scratchpad/l2/git-experiments/` (git 2.43.0), 2026-09-19
