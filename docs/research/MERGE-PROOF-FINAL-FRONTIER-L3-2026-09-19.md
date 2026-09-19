# Merge-Proof final frontier research, Level 3

Date: 2026-09-19. Prepared for Ryan (OHCAYGO). Final pre-implementation pass; builds on the Level 1 and Level 2 documents in this folder.

Method. Repository truth is `ohcaygo/merge-proof` at `dab5a18`, unchanged in `github/` and `src/` since Level 2, so every Level 2 finding (F1, F2, coarse currentness, false-NOT_PROVEN cliffs, head-only ledger binding, org-ruleset webhook rejection) remains current. Four research reports were produced and are attached under `sources/l3/`: G expected-tree determinism taken to the wall (sixteen experiment families, scripts and a results log), H distributed currentness, event sourcing and adversarial testing, I a thirty-incident provider-correctness corpus with practitioner-respect evidence and the naming decision, J the open verifier with a working zero-dependency prototype, the portable bundle, transparency and the provenance interface. Sections 1 to 3, 5, 7 to 13, 20, 27 to 30 and 42 to 48 were written from source reading and the reports. No production, live installation or external system was mutated; nothing was registered. Section numbering follows the brief.

---

## First page

### 1. Did we find another deeper layer?

**No.** The chain expected tree → provider candidate → bound evidence and authority → landed content → portable verifiable receipt is the coherent boundary. Three refinements were found inside existing legs, none a new leg: the landed-binding attestation (the object that makes pre-merge and post-merge one proof and satisfies SLSA's "contemporaneous with the branch update"), the evidence subject identifier with producer binding (what makes "bound evidence" exact when five things share a head SHA), and the rule-suite result as a post-merge input to the authority leg. Everything examined beyond the chain (intent versus delivered scope, continuity of controls, deployment, test adequacy, agent authorship) belongs to build, deploy, security or compliance and stays an integration. Section 42.

### 2. Is the current ceiling actually the ceiling?

Yes, with one precise correction: "independently reconstructs what should happen where possible" now has an exact envelope. Merge and squash trees are pure functions of base and head under a pinned git and an empty attribute source; rebase is predictable only by first-parent replay with explicit flags; queue groups are predictable per entry in provider order. Outside the envelope (any conflict, both-sides gitlink change, exhaustive-rename cutoff, merge commits in a rebase range, custom merge drivers on both-sides paths, an unknowable head at merge time) the receipt records the provider's tree and says "not reconstructable". The ceiling is "recompute where deterministic, record provider-only where not, refuse where conflicting". Section 4.

### 3. What should Merge-Proof become?

A read-only GitHub App that keeps a deterministic record of what was actually proven about the exact code that could merge: it identifies the candidate by commit and tree, binds every required check to the run that executed on that commit and the workflow that produced it, binds every approval to the head it covers and the account that gave it, records the rules in force, keeps each claim current or names exactly which one went stale, compares what lands on the branch with what was proven and, where a correct merge can be recomputed from git objects, with what should have landed, and writes all of it into a signed receipt anyone can verify offline with published code. It states what it cannot know and why. No model decides anything; it never merges; it never claims more than the evidence it holds. Section 46.

### 4. What is the single hardest thing we should build?

Expected-tree reconstruction under a pinned git with the caveat flags, joined to landed-tree binding and the pre-merge record: a per-repository blobless mirror, `merge-tree` for merge and squash, first-parent replay for rebase, sequential group reconstruction, the seven caveat probes, the eight refusal conditions, and a differential lab that calibrates all of it against real GitHub behaviour. Section 4 and charter Phase 3.

### 5. What makes this hard to copy?

Each part is copyable; the calibrated whole is not. The observation model, candidate selection, job-level execution proof and per-claim currentness are a year of edge cases to reach parity. The reconstruction envelope and its flags are earned experimentally. The incident corpus, the differential-lab fixtures and the production "superseded on reconciliation" baselines compound with time and installed base. The verifier and the published truth boundary make the definitions ours; a native tool has no incentive to enumerate what it does not expose or to detect its own divergence. Section 40.

### 6. What could still kill the product?

A false VERIFIED in production before Phase 0 ships. A liveness failure that makes an enforcing installation oscillate and get uninstalled (the current currentness model does this in any active repository). GitHub shipping a native merge attestation with a landed-tree comparison on the Team plan (assessed 15% within three years for the tree part; 55% for a PR-state attestation that erodes the pre-merge rollup). Revenue resting on the pre-merge rollup instead of the external comparisons and the verifier. A name that keeps sending buyers to two other products. No buyer at all, which only a design-partner trial can answer. Sections 38 and 48.

### 7. What exactly should Astra build next?

1. Producer binding for required checks: workflow id, path, event, attempt retained; same-App same-name ambiguity by workflow id; candidate-modified workflow is a blocking gap (closes F1).
2. Event binding for execution evidence: only `pull_request` and `merge_group` runs count for their subject kinds (closes F2).
3. Per-claim currentness with event routing, org-level ruleset deliveries accepted, permission events subscribed, mergeability fields excluded, TTL delivery set.
4. False-NOT_PROVEN triage: rule-type classes, per-reviewer permission scoping, write-only CHANGES_REQUESTED, drift waiver on contained targets, run paging, wording.
5. Ambiguous check titles fixed; group-stage check posted before the queue timeout.
6. Invariant harness with the first twenty fixtures; policy version bump to `github-exact-state-v2`.
7. Evidence subject identifier, workflow blob binding, authorization graph, policy snapshot and rule-suite bypass ingestion, observation ledger, reconciliation.
8. Landed-tree binding with the four ledger states, the landed-binding attestation and verify-by-SHA.
9. Mirror, pinned git, expected-tree reconstruction with caveat flags and rebase replay.
10. Signed receipt, policy and verdict-info records, portable bundle, published open verifier, operator log with public daily anchor; then the decision endpoint, `merge-proof verify`, MCP stdio tool and the differential lab.

Items 1 to 6 are Phase 0 and gate any outside enforcing installation. Section 43.

---
## 1. What "proof" means: definitions

These definitions bind the engineering. A future change that widens any of them widens VERIFIED and must be treated as a semantic change to the machine verdict.

**Subject.** The exact object a claim is about, identified by content or by a platform-stable identifier plus content: a commit (`gitCommit` SHA), a tree (tree SHA), a merge-group commit (its SHA and tree), a synthetic test-merge commit (SHA, parents, tree), a PR state (repository id, PR number, head SHA, base SHA at observation), a policy state (the normalized requirements hash and the raw rules snapshot hash), a workflow definition (path plus blob SHA at a commit), an approval set (the sorted set of review ids with state and `commit_id`). Anything not content-addressable is a subject only together with an observation time.

**Claim.** A predicate over one subject: "these required checks executed on this exact commit", "these approvals cover this exact head", "these rules were in force on this base ref at this observation", "this head ref pointed at this commit at this observation", "this landed tree equals this proven tree". A claim is `TRUE`, `FALSE`, or `UNKNOWN`. `UNKNOWN` never counts as `TRUE`.

**Evidence.** Platform-recorded facts projected to identifiers, states, timestamps and hashes (never free text): check runs, workflow runs, jobs and steps; reviews; rules; refs; commits and trees; webhook payload fields. Evidence is not a claim; it is the input from which a claim is computed.

**Trust source.** Where each fact came from: recomputed by Merge-Proof from git objects; asserted by GitHub through an authenticated API read; delivered by GitHub through an HMAC-verified webhook; inferred by Merge-Proof from other facts; or unavailable. Every evidence row carries its source class.

**Binding.** The reason a fact applies to this subject and no other: an equality on content-addressed identifiers (`check_run.head_sha == target.sha`, `review.commit_id == head`, `job.check_run_id == check.id`, `tree(landed) == tree(candidate)`), never a name match, a time proximity, or a display string.

**Producer.** The identity that produced a piece of evidence: App id, workflow id and path, workflow blob SHA, run event, run attempt, reviewer account id and type, rules source. A claim binds to its producer as well as its subject.

**Freshness.** For each claim, the set of bindings whose change invalidates it, and the events that can change those bindings. A claim is CURRENT when every binding was re-confirmed at the latest observation; STALE when a binding changed; UNAVAILABLE when a binding could not be re-read. Time passing alone changes nothing.

**Authority.** Who or what may make the decision the claim is about: the repository's rules define which approvals count and who may bypass; GitHub is the merge authority; Merge-Proof has no authority and issues none. Authority facts are subject to the same binding and freshness rules.

**Uncertainty.** Every claim that cannot be established states the exact reason: the field GitHub does not expose, the permission or plan that would expose it, the retention window that has passed, or the implementation detail that makes recomputation impossible. Uncertainty is recorded as `UNKNOWN` with a reason code and the receipt sentence from the authority tables.

**Proof.** The conjunction of all required claims for one candidate, each `TRUE`, each bound to its subject and producer, each CURRENT, with the required-claim set itself derived from the policy snapshot. "Proof" never means correctness of code.

**Verified.** The verdict when the proof holds. "Verified" never means safe, secure, tested well, or approved by the right people in the human sense; it means the required claims hold as defined.

**Integrity.** Equality between what was proven and what landed, under the declared merge semantics, at the content level.

**Provenance.** The recorded chain from each fact to its trust source, producer and observation, sufficient for another party to re-derive the verdict from the recorded facts and to re-observe the facts where GitHub still serves them.

**Candidate.** The exact commit GitHub would merge if the merge happened now: the head when it contains the base; the test-merge commit with parents `[base, head]` when it does not; the merge-group head commit when the PR is in a group. A candidate is identified by SHA and by tree.

**Expected.** The tree Merge-Proof computes from git objects for a declared merge method and candidate set. Expected is a recomputation, not an observation.

**Current.** A property of a claim at an observation, never of a receipt in storage. A stored receipt is historical; only a fresh observation makes a claim current.

**Authorized.** The claim that the approval set observed covers the current head, satisfies the policy snapshot's approval requirements with qualifying reviewers, and has not been dismissed, together with the observed merge actor and any observed bypass evidence. Authorized never asserts what GitHub itself counted; that fact is not exposed.

Per-claim table for every claim Merge-Proof makes:

| Claim | Subject | Predicate | Evidence | Trust source | Binding | Freshness (invalidating events) | Authority | Uncertainty |
|---|---|---|---|---|---|---|---|---|
| TARGET | PR candidate | the candidate GitHub would merge now is commit C with tree T | PR object, branch tip, compare merge base, test-merge ref and commit, group ref, queue entry | GitHub API; Merge-Proof recomputes containment from parentage where objects are held | `compare.merge_base == base` or `parents == [base, head]` or group ancestry plus queue entry identity | push to head or base, `pull_request` synchronize or base change, `merge_group` events | GitHub | test-merge regeneration schedule; group membership not enumerated |
| CI_EXECUTED(name) | commit C | a required check named N from producer P concluded success on C and its workflow run, job and steps executed on C from an allowed event | check run, workflow run, jobs, steps | GitHub API | `check.head_sha == C`, `job.check_run_id == check.id`, `run.head_sha == C`, `run.event ∈ {pull_request, merge_group}`, `run.workflow_id` unique among same-name checks on C | new check run or run for N on C; workflow file change on the path; rules change to N's requirement | the rule that names N | what the workflow checked out or tested; non-Actions producers have no execution record |
| APPROVAL_CURRENT | head H | at least k approving reviews on H from distinct human accounts other than the author with write permission observed | reviews, permission reads, PR author | GitHub API | `review.commit_id == H`, `review.state == APPROVED`, `user.type == User`, `user.id != author.id`, permission observed true | review submitted, dismissed or edited; push to head; approval-rule change; permission change (unobserved) | rules: count, dismiss-stale, last-push, code-owner | which approvals GitHub counted; permission at approval time; CODEOWNERS satisfaction; last-push attribution |
| RULES_SNAPSHOT | base ref R | the normalized requirements Q and unsupported set U were in force at observation | active rules, classic protection or proven absence | GitHub API | requirements hash | `repository_ruleset` (repo and org), `branch_protection_rule`, `branch_protection_configuration` | GitHub | evaluate-mode rules; bypass actors; rules at merge time beyond the rule-suite window |
| REMOTE_DURABLE | head ref | the head repository's ref pointed at H at observation | ref read | GitHub API | `ref.sha == H` | push, force push, deletion | head repository owner | future retention |
| CANDIDATE_EXPECTED | candidate C | tree(C) equals the tree a correct merge of (base, head) under method M produces | git objects | Merge-Proof recomputation | tree equality | base or head change | none | conflict, rebase replay, rename thresholds, undocumented provider behaviour |
| LANDED_BOUND | landed commit L | tree(L) equals tree(candidate) and equals expected tree; parents consistent with method M | landed commit, trees, push range | GitHub API plus recomputation | tree equality, parent equality | none after merge (immutable) | GitHub merge path | indirect merges; rebase per-commit correspondence |
| BYPASS_OBSERVED | ref update | the ref update was evaluated with result pass, fail or bypass by actor A | rule suite | GitHub API (Administration:read, ≤ 1 month) | `after_sha == L` | none | ruleset | exempt actors; window expiry; permission absent |
| ACTOR_CLASS | actor | account X is of type User or Bot with id N | account objects | GitHub API | id | none | GitHub | tool behind a human identity |

## 2. Trusted computing base

What Merge-Proof still trusts, classified. Legend: **R** independently recomputed; **A** externally asserted (accepted from a party); **C** cryptographically verifiable; **H** historically observed (recorded at a time, not re-derivable); **I** inferred; **U** unverifiable.

```text
                 +--------------------------------------------------------------+
                 |  GitHub (control plane)                                      |
                 |   API responses [A,H]   webhooks [A,C:HMAC,H]   Checks [A]    |
                 |   Actions metadata [A,H]  rules/rulesets [A,H]  merge path [A]|
                 +-------------------------------+------------------------------+
                                                 | TLS + App JWT/installation token [C]
   Git objects (commits, trees, blobs) [C:SHA-1/SHA-256 content addressing]
        |  fetched via installation token [A: which refs exist]
        v
   +---------------------------- Merge-Proof service ----------------------------+
   |  collector (projection, two observations) [H]                                |
   |  recomputation: merge-base, containment, merge-tree, tree equality [R]       |
   |  proof engine: pure function of observations + policy version [R]            |
   |  store: single JSON file, fsync, single writer [A: our own storage]          |
   |  system clock [U for ordering; A for timestamps]                             |
   |  signing key in KMS [C]; JWKS publication [A: our hosting]                   |
   +------------------------------------------------------------------------------+
        |                                       |
        v                                       v
   receipt bundle [C: signature; R: verdict]   transparency log [C: inclusion; A: log operator]
        |
        v
   open verifier (offline: C,R; online: re-observes A; trust-dependent: H,U)
```

| Component | Class | What is trusted, exactly |
|---|---|---|
| Git object cryptography | C | content addressing: a tree SHA identifies content; a commit SHA identifies tree plus parents plus metadata. Trusted as a hash function; SHA-1 collision resistance is assumed as GitHub does |
| GitHub API | A, H | that a response is what GitHub serves for that endpoint at that time. Not that the data is true. Not that two reads are atomic |
| GitHub webhook delivery | A, C (HMAC), H | that a delivery with a valid signature came from GitHub; not that every event was delivered, ordered, or delivered once |
| GitHub authentication and App identity | C | App JWT and installation tokens; the installation's repository scope |
| GitHub Actions metadata | A, H | run, job and step records as GitHub recorded them; not what the runner executed |
| GitHub Check Runs | A | conclusions as posted by apps; the App id binding |
| External CI APIs | none | not consulted; their checks are asserted conclusions only |
| Merge-Proof database | A (own) | durability and single-writer integrity of our store; not tamper-evidence beyond the signed receipt |
| Merge-Proof service code | A (own) | the proof engine and policy version; made auditable by publishing the pure engine and the verifier |
| System clock | A, U | timestamps for observation ordering are our clock; never used as evidence of GitHub-side ordering |
| Signature provider (KMS) | C | private key non-exportable; JWKS served by us |
| Transparency log | C (inclusion), A (operator) | inclusion proofs and checkpoints; the operator's availability |
| Local git reconstruction | R | merge-base, containment, merge-tree, tree equality given objects; git version pinned |
| Provider implementation details | A, U | how GitHub constructs test-merge commits, groups and landings; observed, never emulated beyond documented semantics |

**What "independent" means for Merge-Proof.** Independent of the coding agent, the review agent, the workflow author, the PR author and the merging actor: none of them can produce, alter or select the evidence Merge-Proof binds, because binding is by content identifiers and producer identity, and the candidate cannot supply its own evidence. Independent of GitHub's conclusions but not of GitHub's data: Merge-Proof recomputes containment, merge base, expected trees and landed equality from git objects, but every fact about checks, reviews, rules and refs is GitHub's assertion at a time. Not cryptographically independent of GitHub: GitHub signs nothing Merge-Proof reads. A receipt is therefore a signed, time-anchored, reproducible record of what GitHub reported and what Merge-Proof recomputed. That sentence is the whole of the independence claim.

## 3. Reducing trust in GitHub

Every assertion currently accepted from GitHub, and whether it can be recomputed from git-native data.

| Assertion accepted today | Recompute? | Class | Note |
|---|---|---|---|
| `compare.merge_base_commit` (head contains base, drift) | yes, `git merge-base` on fetched objects | cheap and deterministic | requires commit graph; blobless mirror |
| test-merge commit parents `[base, head]` | yes, from the commit object | cheap and deterministic | the commit object is fetched by SHA; parents are content |
| test-merge commit tree equals merge of base and head | yes, `merge-tree` | feasible, deterministic in the clean case | catches substituted candidates |
| merge-group head is a descendant of head and base | yes, ancestry over fetched objects | cheap | replaces two `compare` calls |
| merge-group tree equals sequential merge of members | yes, given member list | feasible but member list is not in the payload | partial |
| landed commit tree and parents | yes, from the object | cheap | webhook `merge_commit_sha` remains the pointer to fetch |
| landed tree equals candidate and expected | yes | cheap and deterministic | the incident detector |
| `compare` changed-file lists (drift overlap, boundaries) | yes, `git diff-tree --name-only` | cheap | removes the 300-file cap |
| commit `verification.verified` | partially: GPG/SSH signature verification needs key material; GitHub web-flow signatures verify against GitHub's key | feasible but expensive | keep GitHub's assertion, record reason |
| ref points at head | no: refs are GitHub state | impossible | fetch by SHA confirms the object exists, not that a ref names it |
| check runs, conclusions, app ids | no | impossible | GitHub-only data |
| workflow run, job, step records | no | impossible | GitHub-only data; the workflow blob is git data and can be fetched |
| workflow file contents at the tested SHA | yes, blob by path at commit | cheap | binds producer identity |
| reviews, states, `commit_id` | no | impossible | GitHub-only |
| reviewer permission | no | impossible | GitHub-only |
| rules and protection | no | impossible | GitHub-only; the requirements hash is ours |
| queue entry state and position | no | impossible | GitHub-only |
| who pushed | no; `/activity` is GitHub-only | impossible | git records committer, not pusher |
| rule-suite result | no | impossible | GitHub-only |
| GitHub's mergeability opinion | drop it entirely | dangerous to emulate | never an input |
| GitHub's rebase behaviour | do not emulate | dangerous to emulate | final-tree prediction only in the clean case |
| GitHub's conflict resolution | none exists; GitHub never resolves | n/a | any landing after a predicted conflict is divergence or bypass |

Minimum necessary provider trust after recomputation: refs, checks and their producers, reviews and permissions, rules, queue state, actor identities, and the pointer to the landed commit. Everything about content and ancestry is recomputed.

## 4. Expected-tree reconstruction: the wall

Sixteen experiment families were run locally (git 2.43.0; scripts and a full results log under `sources/l3/git-wall/`; 2.44 to 2.55 behaviour cited from release notes and source). The Level 2 result stands for clean, plain-text, single-merge-base merges: `git merge-tree --write-tree` (ort) produces the tree GitHub lands for merge, squash and queue groups. Level 3 finds that the boundary is not one line but five independent axes:

1. **Configuration.** ort ignores `-X no-renames` and `merge.renames=false` (rename detection is always on); only the similarity threshold (50%) and `merge.renameLimit` (default 7000) change results, and the limit is a real cliff: the same commits yield a different tree above it. `merge.directoryRenames=conflict` (default) and `=true` write the same tree with different exit codes; `=false` writes a different tree. `-X` whitespace options change clean trees, not only conflict status. GitHub runs merge-ort (since September 2022 for merges, June 2023 for rebases via `git replay`) with an unpublished configuration.
2. **Attribute source.** `merge-tree` reads `.gitattributes` from the worktree or index, or from `HEAD` in bare repositories on git 2.43 to 2.45, and from nothing in bare repositories from 2.46 unless `attr.tree` is set; never from the trees being merged. `merge=union`, `-merge`, `binary`, custom drivers (which `merge-tree` does execute when configured) and `merge.renormalize` all change clean trees. GitHub has said since 2017 that it ignores user `.gitattributes` for merges, with reports through 2025 that this is still so.
3. **Local state.** Two sides bumping the same submodule gitlink conflict when the submodule's objects are absent and fast-forward cleanly when present; GitHub reports a conflict (community evidence, August 2025). The result depends on object availability, not on the three trees.
4. **History shape.** Criss-cross histories with two merge bases: the recursive virtual base conflicts where a single chosen base merges cleanly. Rebase depends on per-commit replay, not on endpoints: three shapes were found where rebase conflicts while merge is clean, and two where rebase succeeds with a different tree than merge (delete-then-re-add against a base delete; a redo commit whose patch-id matches a base commit, which `git rebase` drops and `git replay` does not). Merge commits inside the PR are dropped by rebase, losing any hunk carried only by the merge.
5. **Version.** 2.44 changed rename similarity for files with an incomplete last line; 2.46 reverted bare-repository HEAD attributes; 2.50, 2.52, 2.53 and 2.55 fixed ort rename corner cases; `--merge-base` accepts trees from 2.45.

What is deterministic and safe to compute: merge and squash trees as a pure function of (base, head) in every history shape tested including PR-internal merges, reverts, head-contains-base and empty commits (squash tree equals `merge-tree(B,H)` always); file modes; one-sided symlink and binary changes; case-colliding paths at tree level; LFS pointers; signatures (commit data, never tree data); sparse checkout; whitespace with no options; queue order for non-overlapping PRs (all six orders of three PRs give one tree; rename-plus-edit is order-invariant).

Can two implementations independently arrive at the same canonical tree? Yes, when the merge is clean under a pinned configuration with an empty attribute source, no submodule objects, a single merge base, no near-threshold rename, and the method is merge or squash. Outside that envelope the answer is "sometimes, depending on unpublished configuration", and the receipt must say so.

**Recommended algorithm.** Pin one exact git version of 2.46 or later (2.50 or 2.52 as a static binary; re-validate the corpus on every bump). Environment: no global or system config, `GIT_NO_REPLACE_OBJECTS=1`, `GIT_ATTR_SOURCE` set to the empty tree, explicit `merge.renameLimit=7000`, `merge.directoryRenames=conflict`, `merge.renormalize=false`, no drivers, no `-X` options, a bare mirror with no submodule objects. Steps: compute all merge bases (refuse on none); for merge and squash run `merge-tree --write-tree B H` and refuse on any non-zero status; for rebase replay the first-parent commit list of `B..H` with `merge-tree --merge-base=<parent> cur commit`, refusing on any merge commit in range or any conflict, flagging become-empty steps and patch-id duplicates (validated: the replay reproduces `git rebase` trees in the clean and become-empty cases); for queue groups apply the merge step sequentially in the provider's entry order and compare each step with that entry's `head_commit.tree_id`. Caveat probes, run only when their preconditions hold: rerun per merge base when more than one exists; rerun with `--attr-source=B` and `=H` when either tree contains `.gitattributes`; refuse when the exhaustive-rename-skipped warning appears; flag one-sided gitlink changes and case collisions. Record in the receipt: expected tree, status, method, base and head, merge bases, git version, strategy `ort`, options `[]`, the explicit config, attribute source, submodule objects absent, replace refs disabled, flags, conflict paths, replay steps.

**"Expected tree not reconstructable", exactly:** any conflict for (B,H); unrelated histories; both sides changing the same gitlink; the exhaustive-rename-skipped warning; rebase with a merge commit in range; rebase whose replay conflicts although the merge is clean; a custom-driver attribute on a path changed on both sides unless the plain merge is clean and identical under `--attr-source=B`; a head SHA at merge time that cannot be established exactly (a conflict-editor commit moved the head).

**Compute-with-caveat flags:** `multi-base-sensitive`, `attributes-would-change-result`, `near-threshold-rename` (any rename below 60% similarity), `become-empty`, `patch-id-duplicate`, `gitlink-changed`, `case-collision`. The tree is emitted; the receipt says the provider may legitimately differ.

Consequence for the product: a conflicted `merge-tree` result is never an expected tree (for binary conflicts it contains the base-side blob, for directory-rename conflicts it equals the `true` tree); any landing after a predicted conflict is divergence or bypass unless the head changed through the conflict editor, so landed comparisons key on the exact head SHA at merge time and re-run on the new head.

## 5. Tree versus patch versus semantics

Tree equality is the correct main primitive and it is not sufficient alone. Cases where `expected tree == provider tree` still misses something:

| Case | Caught by tree equality? | Add |
|---|---|---|
| Same content through an unauthorized path (bypass merge, direct push producing the same tree) | no | parent check (`parents[0] == recorded base tip`), push range membership, rule-suite result |
| Correct tree, wrong parentage (landed commit's first parent is not the base tip that was proven) | no | parent binding per method: merge has `[base, head]`; squash has `[base]`; rebase chain ends at base |
| Correct tree, lost commits (rebase drops or squashes history) | no, and irrelevant to content | record commit count and method; not a verdict input |
| Rebase versus squash semantics | no | record method from `MergeQueueConfiguration.mergeMethod` or landed shape; expected tree is method-independent in the clean case |
| Commit metadata affecting downstream tooling (changelog automation, signatures) | no | out of contract; record signature state of landed commits as information |
| Provenance depending on parent history | no | the ledger row carries parents and method |

So Merge-Proof binds: content tree (primary), parentage per method (secondary, cheap), merge method (recorded), and never commit metadata as a verdict input. Patch-level equality is not needed: trees already encode the result of the patch, and patch identity across rebases (patch-id) is GitLab's approval-retention primitive, not a landing primitive.

## 6. Provider-divergence detection as a class

Thirty documented provider correctness incidents from 2021 to 2026 (18 GitHub, 9 GitLab, 2 Bitbucket, 1 Actions) are tabulated in `sources/l3/I-incidents-wow-naming.md`. They collapse into eight classes, and each class is caught by one comparison rather than by knowledge of the instance:

| Class | Definition | Examples | Comparison that catches the class | When |
|---|---|---|---|---|
| FC1 wrong merge base or wrong manufacturing | provider builds the landed commit or the candidate from a base other than the validated one | GitHub 2026-04-23 squash groups; GitLab 2022-04-07 merged-results pipelines running detached; GitHub 2023-04 commits pushed to queue prep branches | landed tree versus proven candidate tree; expected tree versus provider candidate tree | post-merge (2026-04-23); pre-merge (detached pipelines) |
| FC2 stale mergeability or stale state | provider PR state (`mergeable`, `merge_commit_sha`, head, rollups) lags or diverges from refs | GitHub "merge-base changed after approval" open 2023 to 2026; 2025-04-09 stale PR heads; 2026-08 merge-commit generation delays; GitLab stale replica reads | read refs and check runs directly; recompute merge base; never take GitHub's opinion as input | pre-merge |
| FC3 unenforced rule | a configured rule is satisfied by something that does not meet its intent | skipped required job passes auto-merge (GitHub #28864); stale approvals not dismissed after rebase (#54493); GitLab CODEOWNERS bypass CVE-2023-4812; GitLab pipeline-must-succeed bypass via `only:` and via external status | recompute "proven" from raw check runs and raw reviews bound to the head, not from rollups | pre-merge |
| FC4 missed or late delivery | webhooks dropped, throttled or delayed with no replay | GitHub 2024-07-05 (up to 71 minutes late), 2026-08-06 (throttled to 15%, "cannot be replayed"), GitLab 2025-10-29 | reconciliation by polling and the App-hook-deliveries scan | both |
| FC5 wrong actor attribution or silent semantic change | provider changes who is recorded or changes semantics without notice | merge-queue merges attributed to `github-merge-queue[bot]` (2023-06-21); auto-merge 422 change (2026-03-25) | record enqueuer, approvers and merger separately from raw events; snapshot rules and semantics in the receipt | post-merge |
| FC6 candidate mutation after validation | validated candidate changed before landing | commits pushed to queue prep branches (2023) | record candidate tree at `checks_requested`; landed parent and tree check | both |
| FC7 out-of-band landing | content reaches the protected branch without a proven PR | Actions token pushes to protected branches; CLI merges; admin bypass | every new base-tip commit must map to a proven receipt, else "unproven landing" | post-merge |
| FC8 evidence produced on wrong content | green computed on a tree other than the one that merges | detached pipelines; `pull_request_target` checkout of head; `GITHUB_SHA` confusion | bind each check to the head SHA and to the candidate tree the run actually checked out (group `head_commit.tree_id`, or log-derived for `pull_request` runs) | pre-merge |

Only one incident in thirty is a landed-tree divergence, and it is the only one the provider could not detect from its own state. The dominant classes by count are unenforced rules and stale state, both caught pre-merge by recomputing from raw events. Missed delivery is frequent and official, which makes reconciliation table stakes. Yes, Merge-Proof detects classes: the three unenforced-approval incidents across two products are the same bug, and one binding rule catches all three.

## 7. Pre-merge and post-merge as one proof

One receipt lineage per candidate, one internal lifecycle, and the same three external verdicts. Internal states:

```text
OBSERVING -> PREMERGE_PROVEN | PREMERGE_NOT_PROVEN | PREMERGE_FAIL
   |  (any binding change)            ^
   +-> STALE ---------- re-proof ------+
PREMERGE_* -> MERGE_PENDING   (pull_request.closed merged=true or push to base seen, landed not yet resolved)
MERGE_PENDING -> LANDED_VERIFIED      (tree(L) == proven tree == expected; parents consistent)
             -> LANDED_MISMATCH       (tree(L) != expected, or != proven with parents inconsistent)
             -> LANDED_UNRESOLVED     (objects missing, conflict predicted, indirect merge, rebase per-commit)
PREMERGE_* -> NEVER_LANDED            (PR closed unmerged)
any -> SUPERSEDED                     (a newer receipt for a newer head exists)
```

External mapping: pre-merge verdicts stay VERIFIED / NOT_PROVEN / FAIL with CURRENT / STALE / UNAVAILABLE. The ledger row adds `landed` ∈ {`LANDED_VERIFIED`, `LANDED_MISMATCH`, `LANDED_UNRESOLVED`, `NO_PROOF_RECORDED`}. A human sees one line: "Proven for a1b2c3d; landed as 9f8e7d6 with the proven content". No new user verdicts.

## 8. Evidence subject identity

Every way evidence attaches to the wrong subject, and the binding that prevents it:

| Misattachment | Prevention |
|---|---|
| Same SHA under a different base context (head unchanged, base moved) | subject is the candidate, not the head; a head-only check satisfies nothing once the base moves unless the head contains the base |
| Rerun on the same SHA with a changed workflow | producer binding includes workflow blob SHA at the tested commit; a different blob is a different producer |
| Same check name from a different App | `app.id` equality when the rule binds one; ambiguity → UNKNOWN when it does not |
| Same check name from a different workflow in the same App | `workflow_id` uniqueness among same-name checks on the subject; otherwise UNKNOWN (F1) |
| External CI status without subject metadata | statuses are never execution evidence; accepted conclusions only for unbound rules, and never toward VERIFIED |
| Check-run supersession | latest by id on the subject, but only after producer uniqueness holds |
| Job reruns | attempt recorded; the accepted job is the one whose check run id matches |
| Matrix jobs | each leg is its own check run with its own name; the rule names one leg or a summary job |
| Merge-group recreation | group SHA changes; old group evidence is bound to the old SHA and cannot transfer |
| Workflow dispatch or schedule against the same commit | run event binding (F2) |
| `pull_request_target` runs | never accepted; they check out the base |
| Fork PRs | head repository id is part of the subject |

Canonical Evidence Subject Identifier, justified because five distinct things can share a head SHA:

```text
ESI = platform:github/repo:<repository_id>/kind:<PULL_REQUEST_HEAD|PR_TEST_MERGE|MERGE_GROUP|LANDED>/commit:<sha>/tree:<tree_sha>/base:<base_sha>[/group:<group_sha>]
```

A claim is stored with its ESI; a claim satisfies a requirement only when the requirement's ESI equals the claim's ESI. Head-only evidence has kind `PULL_REQUEST_HEAD` and base equal to the base tip only when the head contains it, so the ESI itself expresses whether head evidence applies.

## 9. Evidence producer identity

The smallest producer set that materially prevents false confidence, ranked by the false green it prevents:

| Property | Prevents | Cost |
|---|---|---|
| App id | cross-app name collision | present |
| Workflow id and path | same-app collision (F1) | present in run rows, not retained |
| Run event | wrong-event runs (F2) | present in run rows, not retained |
| Workflow blob SHA at the tested commit | workflow edited in the candidate; rerun with changed definition | one Contents read per workflow per proof |
| Run attempt | masking of an earlier failure | present |
| Reviewer account id and type | bot approvals, renamed logins | present |
| Rules source (ruleset id, source type) | org versus repo rule provenance | present |

Not bound, by decision: runner environment, action versions inside the workflow (record `uses:` refs that are unpinned as an advisory only when the Actions pinning policy is off), reusable workflow identity beyond the caller job name, OIDC identity (applies to artifacts, not checks), external CI provider internals. Binding those reproduces the CI supply chain; the workflow blob already binds what the repository declared should run.

## 10. Self-modifying evidence

When a candidate modifies the mechanism that proves it, the correct response depends on which mechanism and whether an independent control remains:

| Candidate modifies | Independent control remains? | Response |
|---|---|---|
| Its own tests | yes: reviewers see the diff; CI still executes | annotate only; test content is outside the evidence contract |
| The workflow that produces a required check (repository-defined) | no: the same PR defines and satisfies the check | `EVIDENCE_AUTHORITY_CHANGED_BY_SUBJECT` as a blocking gap under any enforcing preset; under advisory, a named gap; VERIFIED impossible |
| An org-level required workflow's source repository | not modifiable from the PR by construction | no change |
| Linter or test configuration files | partial | annotate; not a verdict input |
| A repository policy file | Merge-Proof has none | not applicable |
| CODEOWNERS | GitHub requires owner approval for CODEOWNERS changes only if CODEOWNERS owns itself | annotate; if CODEOWNERS review is required, the claim is already UNKNOWN |
| Deployment configuration | outside the merge contract | boundary advisory as today |

Serious systems treat this the same way: Bazel and Nix separate the build definition from the thing built and hash both; SLSA Build L3 requires the build definition to come from a trusted source, not the artifact's own PR; GitHub's own mitigation is org required workflows and CODEOWNERS on `.github/`. The rule for Merge-Proof: a subject may not be the sole authority for the evidence that proves it. Self-modification of the producer is a gap, not a crime, and it is closed by an independent producer (org required workflow) or by a second human approval that the policy demands.

## 11. Authorization as its own proof graph

```text
AUTHORIZED(subject H, policy snapshot Q, approval state S, actor facts F) :=
    Q.approvals_required = k
 ∧  |{ r ∈ S : r.state = APPROVED ∧ r.commit_id = H ∧ r.user.type = User
        ∧ r.user.id ≠ author.id ∧ r.user.id ∉ initiating_humans(bot_author)
        ∧ permission_observed(r.user) = write ∧ ¬dismissed(r) }| ≥ k'
 ∧  k' = k + (1 if author.type = Bot ∧ unattributed else 0)
 ∧  ¬∃ r ∈ S : r.state = CHANGES_REQUESTED ∧ permission_observed(r.user) = write
 ∧  Q.code_owner_review → UNKNOWN            (never TRUE from API data)
 ∧  Q.last_push_approval → (pusher(H) known ∧ ∃ approver ≠ pusher(H) with submittedAt > push(H)) else UNKNOWN
 ∧  F.merged_by recorded; F.bypass ∈ {pass, fail, bypass, UNKNOWN_EXEMPT_OR_UNREADABLE}
```

The graph has three independent inputs, each with its own bindings and freshness: the policy snapshot (rules events), the approval set (review events, head pushes), and actor facts (merge and rule-suite reads after landing). Unavailable inputs evaluate to UNKNOWN with the receipt sentence from the authority tables; UNKNOWN never satisfies the conjunction. What GitHub counted is never asserted. Copilot and other Bot approvals are recorded as observed and excluded from k' with a sentence saying the repository may permit them.

## 12. Policy snapshot

The snapshot is the normalized requirements object plus the raw rule projections, hashed:

```text
PolicySnapshot = hash({
  required_checks: [{name, app_id}] sorted,
  strict: bool,
  approvals: k, dismiss_stale: bool, last_push: bool, code_owner: bool,
  thread_resolution: bool, required_reviewers: [...],
  merge_queue: {enabled, grouping_strategy, merge_method, check_response_timeout},
  allowed_merge_methods: [...],
  signatures_required: bool, linear_history: bool, deployments_required: [...],
  required_workflows: [{path, repo, ref}],
  push_time_rules: [types]            // recorded, not evidence-relevant
  unsupported: [types],
  sources: [{ruleset_id, source_type, enforcement}]
})
```

Invalidation: any `repository_ruleset` (repository or organization scope), `branch_protection_rule` or `branch_protection_configuration` delivery marks the snapshot "possibly changed"; a targeted re-read of the two rules endpoints either confirms the hash (claims stay CURRENT) or changes it, which stales only claims that depend on the changed fields (a change to `branch_name_pattern` changes the hash of the push-time section only and stales nothing evidence-relevant; a change to required checks stales CI claims; a change to approval count stales APPROVAL_CURRENT). Bypass actors are not in the snapshot because they are not readable; their absence is recorded as unknown. The snapshot at enqueue and at merge are both recorded in the ledger row when available, and the rule suite's `rule_evaluations[]` is the only platform record of what applied at the ref update.

## 13. Per-claim currentness

Dependency graph (claim → bindings → events), invalidation and recheck:

| Claim | Bindings | Events that may change a binding | Targeted recheck |
|---|---|---|---|
| TARGET | base tip SHA, head SHA, test-merge commit identity, group entry | `push` to base or head, `pull_request` synchronize or edited (base), `merge_group` | branch read, PR read, `git/ref/pull/N/merge`, queue entry query |
| CI_EXECUTED(N) | check run id and conclusion on target, run id, attempt, event, workflow id, workflow blob, rule entry for N | `check_run` or `check_suite` for N on the target SHA, `workflow_run` for the accepted run, `push` touching the workflow path on head, rules events changing N | check runs for the target filtered by name, run by id, blob by path |
| APPROVAL_CURRENT | review ids, states, commit ids; author; permissions; approval rule fields | `pull_request_review` submitted, dismissed, edited; `push` to head; rules events changing approval fields; membership events (not subscribed: rely on periodic reconciliation) | reviews list, permission reads for changed reviewers |
| RULES_SNAPSHOT | snapshot hash | `repository_ruleset` (repo and org), `branch_protection_rule`, `branch_protection_configuration` | two rules endpoints |
| REMOTE_DURABLE | head ref SHA | `push` to head ref, `delete` | ref read |
| LANDED_BOUND | immutable after resolution | none | none |

Rules: an event touches only the claims in its row; an untouched claim stays CURRENT without any read; a touched claim is rechecked with the targeted reads; if the binding hash is unchanged the claim stays CURRENT and the recheck is noted; if changed, the claim becomes STALE and only its dependents are re-proved. Unknown or unrelated events (issue comments, labels, other PRs' check runs) touch nothing. A full re-observation happens on a schedule (every N hours per tracked PR) and after any detected delivery gap, so a lost webhook degrades to a bounded delay, not to a permanent lie.

## 14. Time, ordering and race conditions

GitHub's documented guarantees: no ordering ("may deliver webhooks in a different order"), redeliveries reuse the same delivery GUID, no automatic redelivery, a 10-second response deadline, payloads over 25 MB silently not delivered, and delivery retention of **3 days** on GitHub.com (the commonly repeated 7 days applies to GHES). Conditional requests returning 304 do not count against the primary limit. Fourteen race windows are tabulated in `sources/l3/H-distributed-currentness-testing.md` §1.2; two are live holes today rather than races: org-level `repository_ruleset` deliveries are rejected, and permission-change events are unsubscribed.

Invariants for coherence under out-of-order delivery:

1. Payload timestamps are recorded and never used for ordering decisions; a delivery whose timestamp predates the last observation triggers a recheck, never an ignore and never a blind stale.
2. Duplicates are dropped by GUID with a TTL longer than retention (4 days); the current 10,000-entry cap with no age pruning is replaced.
3. Bindings that participate in one predicate (head, base, test-merge or group) are read together, twice, never patched individually; `pulls/{n}` is read before `git/ref/pull/{n}/merge`.
4. An observation that began at sequence k is invalidated only by deliveries that touch a binding it read and arrived after that read began.
5. A delivery scan every 4 hours walks `GET /app/hook/deliveries` and redelivers failed or unseen GUIDs; a full re-observation of every tracked PR runs every 6 hours; boot after a gap longer than one hour runs the scan first.
6. Reconciliation never flips a receipt to CURRENT silently; a differing reconciliation produces a new receipt marked `RECONCILED`, and "evidence changed while no event was received" is the detector for both missed deliveries and GitHub behaviour changes.

The per-PR state machine (UNTRACKED, TRACKED_UNPROVEN, PROVEN, RECHECK_PENDING, RECHECKING, REPROVING_PARTIAL, REPROVING_FULL, UNAVAILABLE with backoff 30 seconds to 16 minutes, LANDED, CLOSED) with observation and event sequence numbers is specified in the source report. Liveness: a PR converges after a burst as soon as the inter-event gap exceeds the recheck cost (about 2 seconds with a 2-second debounce), where today the condition is "no event of any kind in the repository for tens of minutes".

Budget: for 30 tracked PRs at 200 events per hour, the current design demands about 228,000 requests per hour against a 5,000 budget; the per-claim design needs about 1,500 counted requests per hour including full re-proofs on real head changes.

## 15. Event sourcing

Recommendation: the minimal variant, not a framework. Keep the single JSON store and self-contained receipts; make observations immutable and id-addressable (`observationId = hash({bindings, startedAt})`, plus the delivery GUID set); receipts cite observation ids per binding and carry `supersedes`; currentness is recomputed by binding-id comparison instead of whole-object hashing; the repository-wide revision counter and both broadcast loops are deleted; the events array becomes a TTL-pruned seen set; saves are coalesced within 250 ms because rechecks would otherwise multiply fsyncs. Observations are pruned to those referenced by a live receipt or ledger row, at most three per receipt. Effort three to five days plus a one-time migration stamping existing receipts with `observation.id = hash(receipt.evidence)`. What it buys: a per-PR receipt hash chain, per-binding "what changed", replay of any verdict from stored observations, and the ability to say which delivery was covered by which observation. What it avoids: moving evidence out of receipts (which would break the schema, the CLI's `--previous`, and the HTML renderer).

## 16. Open verifier

Claims fall into three buckets (full table with receipt fields in `sources/l3/J-verifier-bundle-provenance.md` §1.2):

- **Offline-verifiable (13 claims):** DSSE signature over the pre-authentication encoding; receipt digest equals a Statement subject and the predicate; head, base and target subjects equal identity fields; fingerprint recomputation; every gap grounded in a field; every required-check row bound to target or head with jobs on the same SHA; every counted approval on the head from a non-author present in the reviews; target binding; the verdict reproduced by re-running the pure proof logic on the stored evidence; verdict and gap invariants; and, when objects or a log entry are supplied, git relationships, expected-tree recomputation and transparency inclusion.
- **Online re-verifiable (7 claims), retention-bound:** refs, check runs, workflow runs and jobs, reviews, rules, test-merge and group refs, commits. From **2026-10-01 GitHub applies the Actions retention policy (default 90 days, maximum 90 public and 400 private) to check runs, workflow runs and commit statuses**, so the receipt becomes the only durable record of what the checks said within months of issue.
- **Trust-dependent (4 claims):** that the recorded observations are what GitHub served at that time; that GitHub's data was truthful and complete; unavailable policy facts; reviewer permission at observation.

Verifier exit semantics: `SIGNATURE_INVALID` (2), `UNSUPPORTED` (4, version outside the compatibility table; never "invalid"), `INCONSISTENT` (3, the stored verdict does not follow from the stored evidence; treat the receipt as void), `CONSISTENT_OFFLINE` (0), `CONSISTENT_AND_REVERIFIED_ONLINE` (0 with a coverage report), `REVERIFICATION_DIVERGED` (5, a retained immutable GitHub record contradicts the receipt; the only status that impeaches the trust-dependent bucket). Online comparisons resolve to MATCH, RETENTION_EXPIRED, EXPECTED_CHANGE or DIVERGED; only DIVERGED is a finding. The verifier never re-issues the verdict word; it reports whether the recorded verdict is consistent.

**Prototype result.** A zero-dependency Node verifier (`sources/l3/verifier/`) signed the example receipt with a generated P-256 key and verified the signature, digests and internal consistency, then re-ran a pure copy of the proof logic on the stored evidence: verdict and gaps reproduced, 15 of 15 body fields reproduced under null-tolerant comparison. A tampered verdict was caught four independent ways; a flipped signature byte was caught; an edited review SHA with the signature left intact was caught by subject mismatch, fingerprint mismatch and a new gap. The repository's real `prove()` and the pure copy produced byte-identical receipts on 8 of 8 fixture variants. One real finding: the example receipt predates `summary.queueStage`, so byte-strict comparison differs on a null-versus-absent field; the rule adopted is that verifiers compare bodies after dropping null and undefined members, and producers never change an existing field from absent to non-null.

## 17. Minimal portable proof bundle

```text
mp-receipt-<id>/
  MANIFEST.json           essential   bundle format version, sha256 of every file
  receipt.json            essential   schema v2 body, canonical, one line
  envelope.dsse.json      essential   DSSE v1 over the in-toto Statement
  statement.intoto.json   derivable   subjects head/base/target (gitCommit) + receipt (sha256); predicate = receipt
  keys/jwks.json          essential   public keys with kid, alg, validity window
  policy.json             essential   evidence policy parameters (App id, check name, rule types, accepted conclusions, eligibility, target kinds, git version and merge options, API version, notChecked)
  verdict-info.json       essential   every input to the verdict (buildinfo analogue): logic digest, source commit, parameters, runtime, endpoints, retention horizon
  verifier-version.txt    essential   compatibility line
  tlog.json               optional    log entry and inclusion proof, any log kind
  objects.pack            optional    commits and trees for the four commits; blobs only on request
  README.txt              optional
```

Budget 256 KB without objects (the prototype bundle is 80 KB), 5 MB with objects. Three independent versions (schema, policy, verifier) with a shipped compatibility table; the pure logic for each policy version is frozen as a module and never edited. Must never include: tokens, private keys, patches, file contents, logs, review bodies, commit messages, un-projected API bodies, any live currentness result, or the fixture marker. A 2031 verifier validates a 2026 bundle offline from the frozen policy module and the JWKS history mirrored in the public repository's git history; it does not contact GitHub, because by then the check runs are gone.

## 18. Transparency

Decision: **later for Rekor, with an honest intermediate now.** Now: sign receipts (DSSE, published JWKS, key history committed to the public repository) and run an operator-controlled append-only log whose signed daily root and tree size are committed to the public repository, persisted per receipt as `tlog.json` with kind `merge-proof-operator-log/v1` so the verifier interface does not change later. It is called an operator log with a public daily anchor, never a transparency log. Later, on any of three triggers (a customer's written procurement demand for third-party monitorability or key-compromise survivability; a key rotation or compromise; more than roughly 1,000 receipts a month): log each receipt's DSSE hash to Rekor v2 with the self-managed key, and log the daily root there too. Enterprise: the customer's own log or evidence vault with the same interface. The offline verdict never depends on any log; a missing `tlog.json` is a note, not a failure. Practitioner evidence is unambiguous that "tamper-evident" without an external anchor reads as theater and that a signature exists only so a third party can prove the service said X at time T.

## 19. Reproducible verdicts

Two different questions. **Re-derive** from the bundle: deterministic and demonstrated (verdict, gaps and body reproduced; 8 of 8 fixtures byte-identical against the real engine). **Re-observe and re-prove:** not reproducible by design, because the state the receipt describes is consumed by the merge: test-merge and group refs vanish, the head branch is deleted, PR state changes, rules mutate, reviewer permission is current-state only, and check runs expire under the 2026-10-01 retention change. A re-proof of a merged PR correctly converges to NOT_PROVEN with `LIVE_PR_NOT_OPEN`. The honest claim is "reproducible from the recorded observations, and corroborated against whatever GitHub still retains". Inputs to the verdict that are not in the receipt today (App id for self-reference, package version, check name constant, protected-category tables, analyzer defaults, ICU sort order) are pinned in `policy.json` and `verdict-info.json`; the App id matters because it can flip gaps.

## 20. Formal invariants

Stated as properties over the claim model; each has a corresponding fixture class in the corpus.

1. **Subject binding.** A claim with ESI e satisfies only requirements with ESI e. No equivalence relation is defined except tree identity, and tree identity is reported, never used to transfer a claim.
2. **Currentness locality.** A change to binding b invalidates exactly the claims whose binding set contains b. No other claim changes state.
3. **No inferred success.** A claim evaluates TRUE only from evidence rows present in the observation; UNKNOWN never contributes to a conjunction.
4. **Authorization scope.** An approval counts only for the head it names, under the policy snapshot in force at observation, from an account whose permission was observed, and only until dismissed or superseded by a push.
5. **Producer integrity.** A required check is satisfied only by evidence from the producer the rule binds (App id) and, within that producer, from a single workflow; a display-name match alone never satisfies.
6. **Event integrity.** Execution evidence counts only from an allowed event for the subject kind: `pull_request` for head and test-merge subjects, `merge_group` for group subjects.
7. **Self-evidence.** A candidate that modifies the producer of a required check cannot satisfy that check without an independent producer.
8. **Landing.** `LANDED_VERIFIED` requires tree(landed) = tree(proven candidate) = expected tree under the declared method, with parents consistent; otherwise `LANDED_MISMATCH` or `LANDED_UNRESOLVED`, never silent.
9. **Monotonic evidence history.** A receipt, once issued, is never modified; later observations create new receipts or ledger rows that reference it.
10. **Receipt integrity.** A receipt's canonical digest is a Statement subject and the Statement is signed; modification is detectable offline.
11. **Two-observation consistency.** A receipt is CURRENT at issue only if two complete observations of the binding set agree; volatile non-evidence fields are excluded from the comparison.
12. **Fail closed on absence.** A required rule of an unsupported type, an unreadable endpoint, or a missing permission yields NOT_PROVEN or UNAVAILABLE, never VERIFIED.
13. **Liveness.** Under a bounded event rate, every tracked candidate reaches a terminal currentness within a bounded number of targeted rechecks; a full re-observation occurs at least every N hours.
14. **Own-check exclusion.** A requirement naming Merge-Proof's check is never satisfied by Merge-Proof's check and never deadlocks the gate.
15. **Verdict purity.** The verdict is a pure function of the recorded observations and the policy version; re-deriving it from the receipt's stored evidence reproduces it exactly.
16. **Conclusion monotonicity.** A published check conclusion never exceeds the receipt: `success` requires VERIFIED and CURRENT under advisory, or no blocking gap under enforcing; STALE retracts.
17. **Trial monotonicity.** The trial starts once, only on a collection-complete CURRENT VERIFIED or NOT_PROVEN receipt.

## 21. Model-based testing

Reference model: the claim and binding model is the oracle; a simulated world (refs, commits with opaque trees, PRs, reviews, checks, runs, rulesets at both levels, queue entries, collaborators, permissions) renders captures for the real `prove()` and computes expected currentness and ledger state after each action. Generator: seeded PRNG, sequences of 5 to 60 actions with preconditions, weighted toward the race pairs. Harness: the real service driven through the existing `fetchImpl` seam, with ETag and 304 behaviour, `mergeable: null` after base advances, transient 502 and secondary-limit 403 with `retry-after`, and permission loss as 403 on the permission endpoint; deliveries permuted, duplicated and delayed by fault actions; `drain()` called until idle. Invariants checked after every action and at quiescence: the ten in the source report plus the seven formal additions in section 20.

Frameworks, honestly: a hand-rolled generator and delta-debugging shrinker under `node:test` fits the zero-dependency posture (about two weeks including the world model and fetch simulator); fast-check is the documented fallback if shrinking proves inadequate (it adds `pure-rand` as a dev dependency); a Quint specification of the per-PR state machine is a second phase (about one week) whose value is model-checking the reference model for currentness locality, event commutativity, monotonic history and liveness over all interleavings, with its traces replayed as harness seeds; Alloy is rejected. Total three to four engineer-weeks. This creates a moat only in combination with the differential lab: the generator finds design errors, the lab finds GitHub.

## 22. Differential testing against GitHub

An owned organization with a development App and repositories for classic protection, repository ruleset, organization-only ruleset, queue HEADGREEN, queue ALLGREEN, fork PRs, a monorepo with more than twenty runs per SHA, and a configured bypass actor. Scripted scenarios execute action sequences for real; observations stored as fixtures: every delivery from `GET /app/hook/deliveries` (which records event, action, GUID and status even when the endpoint was down), `merge_group` payloads and queue entry states, landed commit parents and trees per merge method compared with `git merge-tree`, rule suites after each merge as GitHub's own independent record, rate-limit headers, ETag behaviour, and observed `mergeable: null` durations. The fixture pack replays through the harness; a difference is a model bug or a GitHub change, and the rule-suite comparison is the independent channel. Weekly cadence plus a run on every changelog entry touching rulesets, merge queue, checks or webhooks; under 500 requests and about an hour per run, bounded by the content-creation secondary limit. Never production repositories, customers, or the production App. Drift detection: fixture-pack diffs on the weekly run, the production metric "receipt superseded on reconciliation with no touching delivery" rising above baseline, and rule-suite results disagreeing with the verdict. Yes, this becomes a conformance suite in the browser-conformance sense.

## 23. Merge-integrity conformance suite

Publishing the fixture pack (evidence binding, queue semantics, policy and approval changes, stale states, provider divergence, landing integrity) strengthens category leadership rather than arming competitors, for three reasons: the fixtures encode definitions (the state vocabulary, the binding rules, the invariants), and whoever's definitions others adopt is the reference; the fixtures without the engine reproduce nothing, and the engine's hard part is the observation and reconstruction machinery, not the expected outputs; and a public suite is how CI vendors and hosting vendors would be asked to conform, which is the only path to the category becoming a category. Publish the fixture pack and the verifier under a permissive license; keep the differential lab, the calibration data and the production corpus private. Trigger: after Phase 2 of the charter, when the fixture pack has real divergence cases.

## 24. Failure corpus

Accumulate without customer code: state-transition shapes (event sequences and binding deltas with all identifiers replaced by opaque ids), anonymized failure classifications (which class from section 6, which comparison fired), synthetic reproductions (the wrong-merge-base reproduction, the F1 and F2 fixtures), public incidents (the thirty-row table), provider regressions caught by the differential lab, and the production metric of receipts superseded on reconciliation. A customer receipt contributes at most its shape and class, never paths, logins or SHAs, and only with an opt-in. This is a durable advantage because it compounds with installed base and time, it calibrates false positives for the tree comparisons, and a native GitHub tool cannot credibly market "catches GitHub's bugs".

## 25. Cross-provider normalization

The underlying abstraction that survives all three providers: change request (repository id, number), candidate (head, base tip, merged-result commit or null, tree), evidence (a result bound to a SHA with a producer identity and an execution record where the platform has one), policy (a normalized snapshot with an opaque per-provider hash), authority (approval events with actor, time, SHA when the platform records it, plus reset policy), integration queue (present or absent; candidate construction rules), landing result (landed commit, parents, tree, actor). GitHub-specific and kept behind `platform: github`: merge groups with HEADGREEN and ALLGREEN, ruleset bypass modes and actors, expected-source-app binding, `neutral` and `skipped` semantics, the invisibility of `refs/pull/N/merge`, Actions run, job and step records. GitLab-specific: patch-id approval retention, train car states, external status check 409-on-stale. Bitbucket-specific: no merged-result ref and no SHA precondition on merge, so the TOCTOU promise cannot be kept there. The decision object and subject core are already neutral; the evidence body stays per-platform by policy id; nothing is built for other providers now, and the three naming rules from Level 2 are enforced in review.

## 26. Source provenance to build provenance

Merge-Proof produces a source-side attestation about a commit; build provenance, GitHub attestations, VSAs and SVRs are consumer-side documents that reference it. The interface (JSON in `sources/l3/J-verifier-bundle-provenance.md` §5):

- A build references the receipt in SLSA v1 provenance as a `resolvedDependencies[]` entry with `uri: merge-proof://receipt/<id>`, the receipt's canonical sha256 as digest, media type, download location and annotations; or as an `actions/attest` custom predicate `…/receipt-ref/v1` so `gh attestation verify --predicate-type` succeeds only when a receipt-ref exists for that artifact.
- The organization's VSA carries the receipt in `inputAttestations[]` and exposes `ORG_SOURCE_MERGEPROOF_VERIFIED`; Merge-Proof never issues `SLSA_SOURCE_LEVEL_n`.
- Merge-Proof itself may issue an SVR with passing `MERGEPROOF_*` properties only.
- SLSA's "contemporaneous with the branch update" requirement is satisfied by a **landed-binding attestation** issued on the merge event: subject is the new branch tip, it references the pre-merge receipt by digest, and it records the relation between tip and receipt target (`TIP_EQUALS_TARGET`, tree-equal, parents-consistent, or `UNBOUND` with reason). The pair of pre-merge receipt and landed attestation is the source provenance.
- Consumer chain: artifact → provenance → source commit → landed attestation with `BOUND` → bundle verifies `CONSISTENT_OFFLINE` → verdict VERIFIED under the expected policy → repository id matches.

Never claimed in this chain: build integrity, any SLSA level, deployment, continuity across revisions, code properties, independence from GitHub, or head-equals-built-commit without a BOUND landed binding.

## 27. The agent era: the contract

Agents need one question answered with one object. The contract from Level 2 stands, with the three-way match made explicit:

```json
{
  "schemaVersion": 1,
  "outcome": "PROCEED",
  "proceed": true,
  "verdict": "VERIFIED",
  "currentness": "CURRENT",
  "subject": { "platform": "github", "repositoryId": 1, "candidate": { "kind": "pull_request", "number": 42 },
               "headSha": "7f43a2…", "baseSha": "c0ffee…", "targetSha": "7f43a2…", "targetTree": "9a1b…",
               "targetKind": "HEAD_CONTAINS_CURRENT_BASE", "mergeMethod": "squash" },
  "request": { "expectedHeadSha": "7f43a2…", "matched": true, "mismatch": [] },
  "bindings": { "expected": "9a1b…", "candidate": "9a1b…", "tested": "7f43a2…", "authorized": "7f43a2…", "landed": null },
  "reasons": [],
  "missingEvidence": [],
  "nextAction": { "kind": "MERGE_WITH_SHA", "mergeArguments": { "sha": "7f43a2…" } },
  "receipt": { "receiptId": "…", "fingerprint": "…", "url": "…" },
  "observedAt": "2026-09-19T13:00:00Z"
}
```

and for the refusal case:

```json
{ "outcome": "HOLD", "proceed": false, "verdict": "NOT_PROVEN", "currentness": "CURRENT",
  "reasons": [{ "code": "EVIDENCE_SUBJECT_MISMATCH", "blocking": true,
                "summary": "CI evidence belongs to candidate 1b992c; current candidate is 7f43a2" }],
  "missingEvidence": [{ "code": "CI_EXECUTED:build", "satisfiedBy": ["check_run.completed on 7f43a2"] }],
  "nextAction": { "kind": "RERUN_REQUIRED_CHECKS", "text": "rerun required evidence on 7f43a2" } }
```

The `bindings` block is the five-way chain in one line; `null` means not yet applicable, never unknown (unknown is a reason code).

## 28. Should Merge-Proof auto-block?

Three postures, and where to stop:

| Posture | Mechanism | Liability | Buyer value | Position |
|---|---|---|---|---|
| Observe | advisory check (`neutral`), receipt | none beyond accuracy | low for platform buyers; fine for trial | default, keep |
| Gate | repository admin requires the check; enforcing preset emits `success` or `failure` | the failure mode is a false green that lets a merge through, or a liveness failure that blocks everything | the value platform buyers pay for | keep, owner-configured, Pro only, only after Phase 0 and 1 |
| Autonomous authorization primitive | agents proceed only with a PROCEED decision bound to their SHA | Merge-Proof never merges; the agent does, with GitHub's head guard | the value in the agent era | keep as a read-only decision; never expose a merge action |

Stop at "gate plus decision". Never merge, never enqueue, never dismiss reviews, never write rules. Remaining advisory-only would leave the platform buyer nothing to pay for; becoming a merge actor would make Merge-Proof part of the thing it measures.

## 29. Error budget for VERIFIED

| Situation | Severity | Behaviour |
|---|---|---|
| False VERIFIED | cardinal; one public case ends trust | every defence in sections 8 to 13; corpus fixture for each discovered path; a false green found in production triggers a receipt revocation notice and a written postmortem |
| False NOT_PROVEN | costly, tolerable; must carry the exact missing evidence and next action | measured as a rate in the trial digest; targeted reductions in Phase 1 |
| Unknown data | never satisfies a positive requirement | NOT_PROVEN with the field and permission named |
| Provider outage or partial read | UNAVAILABLE, never VERIFIED; previous receipts stay historical | published checks retract under enforcing policy only after the outage window, with a one-hour terminal state |
| Unsupported feature | NOT_PROVEN for evidence-relevant rules; recorded and ignored for push-time rules | rule-type triage table is part of the policy version |
| Ambiguity between producers | UNKNOWN | never resolved by recency |

Precision over recall, quantified: the target is zero false VERIFIED over the corpus and the differential lab, and a false-NOT_PROVEN rate that falls release over release, reported in the receipt policy version's changelog.

## 30. Can VERIFIED be mathematical enough to mean something?

Yes, and the current engine is already close: `prove()` is a pure function of the observation. The reformulation:

```text
Required(Q)  = { TARGET, RULES_SNAPSHOT, REMOTE_DURABLE }
             ∪ { CI_EXECUTED(n) : n ∈ Q.required_checks \ {self} }
             ∪ { APPROVAL_CURRENT : Q.approvals > 0 }
             ∪ { LANDED_BOUND : merged }
             ∪ { UNSUPPORTED_ABSENT : Q.unsupported_evidence_relevant = ∅ }

VERIFIED  iff  ∀ c ∈ Required(Q): value(c) = TRUE ∧ current(c)
NOT_PROVEN iff ∃ c ∈ Required(Q): value(c) ∈ {FALSE, UNKNOWN} ∧ collection complete
FAIL      iff  collection could not complete (history missing, budget, malformed)
```

Internally this is a small fixed rule evaluator over typed claims, not a generic policy engine: the set of claim kinds is closed, the binding functions are code, and there is no user-authored policy language. The external product stays single-purpose. The evaluator is published with the verifier so the rule is inspectable.

## 31. Attack the receipt

| Skeptic's question | Answer the receipt and verifier give |
|---|---|
| Why should I trust this? | You should not have to. Run the verifier offline: signature, digests, internal consistency, and the verdict re-derived from the stored evidence. Then re-read GitHub for the records it still retains. |
| Where did this field come from? | Every evidence row carries its endpoint, observation id and trust class (recomputed, GitHub-asserted, webhook-delivered, inferred, unavailable); `verdict-info.json` lists every input. |
| What if GitHub lied? | Content and ancestry facts are recomputed from git objects; refs, checks, reviews and rules are GitHub's assertions and the receipt says so. If GitHub's retained records later contradict the receipt, the verifier reports `REVERIFICATION_DIVERGED`. |
| What if your service was compromised? | The published key history, the daily-anchored operator log and later a public log bound when a receipt could have been issued; a compromise date partitions receipts; nothing lets a compromised service change GitHub's retained records. |
| What if a webhook was missed? | Reconciliation every 6 hours and a delivery scan every 4 hours; a receipt superseded on reconciliation with no touching delivery is recorded as exactly that. |
| What if the workflow changed? | The workflow blob SHA at the tested commit is bound to the check; a candidate that changes the producer of its own required check cannot reach VERIFIED. |
| What exactly was tested? | The target SHA and tree, the run id and attempt, the event, the workflow path and blob; for `pull_request` runs, the merged base only when the job log is available, labelled as inferred. |
| Can I reproduce this? | The verdict from the stored observations, yes, with the open verifier; the observations themselves only within GitHub's retention, and the receipt says which. |
| Why isn't this just another green check? | Because it names the tree, binds every fact to it, and says what it could not prove; a green check names nothing. |
| What can you not know? | The receipt's `notChecked`, `limitations` and per-claim `UNKNOWN` reasons list them, with the field or permission that would change each. |

## 32. Pure-coder wow test

Evidence from practitioner reactions (thread ids and dates in the source report): after the April incident the community's own remedy was "compare the tree of each merge commit against the tree the queue tested"; the "0.07% affected" framing drew hostility from supply-chain engineers; the Verified-badge malleability paper (2026-07) and "relying on the green badge is a mistake" show distrust of provider self-reports; reproducibility is respected when it claims "faithful to inputs" and attacked when it implies "trustworthy" (the xz threads); Sigstore is respected for machine identity and mocked for complexity; the bors invariant is loved for being one sentence; AI review fatigue is measurable; signed-receipt products drew "tamper-evident is not proof" and "no external anchor" criticism; `git merge-tree --write-tree` is the accepted server-side primitive.

| Candidate | Verdict |
|---|---|
| Tree-level reconstruction with the two tree ids printed | earns respect |
| Evidence bound to exact head, base and tree ids | earns respect |
| Reproducible verdict, claimed narrowly | earns respect |
| Open offline verifier with readable code | earns respect; without it two of the ten questions are unanswerable |
| Tiny CLI with exact SHAs | earns respect, unless it is a thin client for a dashboard |
| One-line enumerable reason | earns respect |
| No AI in the verdict path | earns respect; a strong 2026 differentiator |
| Signed receipt | risks theater unless the third-party or log rationale is stated |
| Transparent limitations | earns respect |
| Compliance-framework mapping, "immutable ledger", blockchain | theater; already occupied by Marketplace neighbours |

The wow is the combination: prints two tree ids, tells me if they differ, in one command, with code I can read, and never uses the word AI.

## 33. The one-command experience

Yes, this should be the canonical interaction model. `merge-proof verify <pr>` prints the five-way chain with SHAs (and the two tree ids where a tree comparison was made), a verdict, and on NOT_PROVEN exactly one reason line and one next-action line; everything else is `--json` or the receipt permalink. The `bindings` block in the decision object is the machine form of the same five lines. Exit codes as specified in Level 2 (0 proceed, 1 usage, 2 hold, 3 refuse, 4 auth, 8 wait timeout, 9 unavailable). The CLI is a client of the hosted decision endpoint; the local analyzer stays as the offline mode with its narrower claims stated in its output.

## 34. Proof Beacon revisited

The beacon represents proof state and nothing else: green when every required claim holds and is current; yellow while an observation or recheck is in progress; orange when at least one previously true claim's binding changed and re-proof is pending; red when a required claim is demonstrably false (a failed required check, a dismissed approval with none remaining, a landed mismatch); gray when evidence is insufficient (NOT_PROVEN with unknowns). Surface, smallest first: the GitHub check run conclusion and title (which GitHub already collapses when green), the CLI, then nothing else until the decision contract is stable. The mapping to check conclusions stays as in Level 2 (advisory: `success` only for VERIFIED and CURRENT, `neutral` for NOT_PROVEN, `action_required` for STALE; enforcing: `success` or `failure`).

## 35. Website truth

Claims that can be made safely once Phase 0 to 2 ship: "Evidence bound to the exact commit and tree that could merge, not to the pull request." "Every required check is matched to a workflow run, job and steps on that commit, from an allowed event, produced by the workflow the repository declared." "Approvals count only on the current head, from human accounts with write access, never from the author or a bot." "After merge, the landed tree is compared to the proven tree." "Every receipt says what it could not prove and why." "The verdict is a deterministic function of recorded evidence; verify it offline with the open verifier." "No AI model decides anything."

Claims never to make: "independent of GitHub"; "cryptographically proven"; "tamper-proof"; "immutable"; "proves the code works, is secure, or was tested well"; "detects all bypasses"; "no bypass occurred" without a rule-suite record; "reproducible from scratch"; "GitHub-verified"; any SLSA level; "compliance-ready"; any claim about what a workflow checked out or semantically tested.

## 36. Name collision: final answer

Facts: no MERGEPROOF filing was found (indexes were unreachable; confidence about 70% that none exists); GenLayer files marks (GENLAYER, serial 99016120, filed 2025-01-23) and has used "MergeProof" for a staked PR-review protocol since February 2026 with mergeproof.com and the App slug; Aryaman holds PyPI `mergeproof`, the Marketplace Action and the top Google results for the one-word form; "merge proof" is descriptive and fences nobody; the hyphenated form is ours in search and on npm; ProvenMerge is free on npm, PyPI and .com/.dev/.io with no product collisions; ExactState collides with Exact (ERP) and exactstate.com is taken; MergeWitness collides conceptually with in-toto Witness; MergeAttest invites Sigstore expectations. Confusion probabilities over twelve months: 35% that a category-searching buyer conflates the two Marketplace listings; 20% for a `pip install mergeproof` mistake; 10 to 15% crypto-adjacency bounce; under 10% for a trademark letter. Migration cost: one to two days now; one to two weeks plus a 30 to 60 day dual-emit window per required check once customers depend on the check name.

Decision-ready recommendation: **rename to ProvenMerge (`proven-merge`) before the first paid customer, publishing pointer packages under the old names, at 65% confidence.** The strongest counterargument, stated fairly: zero confusion tickets exist, the product has zero customers, the hyphenated name ranks first for its own query and converts faster than a coined one, and Aryaman's project may stall; keeping the name with defensive pointer packages is defensible as a bet that the collision decays, revisited at the first confusion ticket. Ryan decides; no registration was performed.

## 37. Competitive radar

Taxonomy of what to watch and the one filter that decides whether to notify: a development is material only if it changes differentiation (a native or third-party per-merge evidence record, landed-tree comparison, or approval-on-SHA binding), buyer value (pricing or bundling of merge gates by GitHub, Mergify, Aviator, Graphite), technical feasibility (API or webhook changes to checks, rulesets, merge queue, Actions retention, attestations), the offer (Marketplace policy, billing changes), or the recommended trajectory (a roadmap item moving to "Up Next"). Sources and cadence are specified in `sources/l2/E-naming-radar.md` §6 and §7 and stand; additions from this pass: watch the GitHub roadmap items 1320 (Proof of Presence), 1193 (Actions data stream), 1274 (attestations as first-class objects), and any item mentioning "merge attestation" or "source provenance"; watch the SLSA source-tool and gittuf release feeds; watch the MCP registry for PR-decision servers; watch arXiv cs.SE for "merge queue", "agentic pull request", "code review provenance". Deterministic rules, weekly digest, fifteen-minute Monday review.

## 38. Three-year commoditization test

Assume GitHub ships a perfect merge queue, agent review and approvals, current CI binding, strong rulesets, artifact attestations, excellent audit logs, autonomous repair and provenance. What erodes: pre-merge "required checks green on this SHA" as a standalone value (55% that GitHub ships a merge attestation of PR state); approval-bound-to-commit as a differentiator once Proof of Presence and required-reviewer rules mature (75%); webhook-gap detection for Actions once the data stream ships (50%); any UI layer. What remains external by construction: provider-external recomputation (a receipt signed by the party whose bug you are checking for is what the practitioner audience rejects); landed-content comparison across the merge boundary from git objects; an open verifier that runs offline against a portable bundle (GitHub's private-repository attestations have no transparency log); cross-provider normalization; and the incident corpus, because a native tool cannot market "catches GitHub's bugs". The roadmap today: no committed native merge receipt or source attestation; the 2026 Actions security roadmap lists provenance-in-PRs as "requested, not committed"; finer merge-queue check control was closed "not planned". The product survives the strongest plausible native future only if its revenue rests on the external comparisons and the verifier, not on the pre-merge rollup.

## 39. Platform-independence test

If GitHub implemented a native proof receipt, what remains differentiated: the expected-tree and landed-tree comparisons computed from git objects; the open verifier and portable bundle; the per-claim UNKNOWN discipline with permission-level reasons (a native tool has no incentive to enumerate what it does not expose); cross-provider normalization; the corpus and the differential lab that detect the provider's own drift; and the customer-side detector that does not share GitHub's failure domain, which the 2026-04-23 incident made concrete. Nothing else remains, and the product should be defined by these.

## 40. The true moat

| Class | Items | Time for a well-funded team |
|---|---|---|
| Commodity | check run publication, receipt HTML, CLI plumbing, per-seat billing, "AI review" | a weekend |
| Feature advantage | approval-on-head, skipped-equals-no-proof, self-check exclusion, decision contract | a month |
| Engineering depth | candidate selection across test-merge and groups, two-observation consistency, per-claim currentness, execution proof from job and step records, rule-type triage, reconciliation | a year to reach parity across edge cases |
| Data and corpus advantage | the incident corpus, the differential lab fixtures, calibration of tree comparisons, production "superseded on reconciliation" baselines | multiple years; compounds with installed base |
| Trust and reputation | published truth boundary, refusal machinery, open verifier, no false green on record | multiple years; lost in a day |
| Protocol and ecosystem | receipt predicate type, landed-binding attestation, decision schema, conformance fixtures adopted by others | multiple years if adopted; zero if not |
| Potential durable moat | expected-tree reconstruction plus landed-tree binding joined to the pre-merge record, with the corpus that calibrates it | the combination; each part is copyable, the calibrated whole is not |

## 41. Unknown unknowns adopted

From adjacent fields, only the concepts that changed a decision: certificate transparency (append-only anchoring; per-PR receipt hash chain; gossip and SCTs rejected as there is no second log); reproducible builds (buildinfo becomes `verdict-info.json` and a `replay` command; the narrow claim "faithful to inputs"); database transaction integrity (write skew: bindings in one predicate are read together, twice, in a fixed order); linearizability (currentness is a bound on staleness, never a guarantee; `currentnessAtMerge` stays UNAVAILABLE); financial audit (the three-way match on trees: expected, candidate, landed; the ledger row names which leg failed); safety-critical engineering (independent channels: reconciliation and rule suites are independent of webhooks; N-version recomputation rejected as over-engineering); package managers (the binding set is the receipt's lockfile; TUF-style key rotation deferred until signing exists); release engineering (the bors invariant "main only ever contains a tested tree" as the customer sentence for queue repositories). Rejected: consensus protocols beyond vocabulary, generic CQRS frameworks, blockchain anchoring.

## 42. Is there another layer?

**No.** The chain expected → provider candidate → bound evidence and authority → landed content → portable verifiable receipt is the coherent boundary. This pass tried to find a layer beneath or beyond it and found three refinements that live inside the existing legs, not a new leg:

1. **The landed-binding attestation.** Pre-merge and post-merge become one proof through a small object issued on the merge event whose subject is the new branch tip and whose predicate references the pre-merge receipt by digest and records the relation between tip and proven target. It is what satisfies SLSA's "contemporaneous with the branch update" requirement and what a build's provenance points at. It is an interface to the existing landed leg, not a new layer.
2. **The evidence subject identifier and producer binding.** Five distinct things can share a head SHA; the ESI (kind, commit, tree, base, group) with producer identity (App, workflow, blob, event, attempt) is what makes "bound evidence" precise. It deepens the evidence leg.
3. **The authority leg gains a post-merge input.** The rule-suite result within its window is the only platform record of what applied at the ref update. It deepens authority; it does not add a stage.

Candidates examined and rejected as belonging outside: intended change versus delivered change (scope and semantics; a diff-content judgment; out of contract); continuity of controls across revisions (a per-branch property that SLSA source levels express; an organization's VSA, not a per-change receipt); deployment and runtime (a different subject); test adequacy (a judgment, not evidence binding); agent authorship (metadata; only identity class enters the authority leg). Each would turn the product into build, deploy, security or compliance territory, and each stays an integration.

This is the coherent product boundary. Further expansion becomes build, deploy, security or compliance territory and should remain integration rather than ownership.

## 43. Astra build charter

Twenty items in five phases. For each: behaviour, acceptance, negative tests, data and permissions, limitations, migration, verdict semantics change, fixtures. "Verdict change" means the machine verdict for some existing receipts would differ; those items require a policy version bump to `github-exact-state-v2` and are grouped so the bump happens once, at the end of Phase 0.

### Phase 0. Truth repair (before any outside enforcing installation)

**0.1 Producer binding for required checks (closes F1).** Behaviour: retain `workflow_id`, `path`, `event`, `head_branch`, `run_attempt` per execution row; treat two same-name check runs on the target from different workflow ids as ambiguous (UNKNOWN); a required check whose accepted run's workflow path is in the candidate's changed files raises `EVIDENCE_AUTHORITY_CHANGED_BY_SUBJECT`, blocking under enforcing presets and a named gap under advisory. Acceptance: F1 fixture yields NOT_PROVEN with the two reason codes; unchanged-workflow fixture stays VERIFIED. Negative: same workflow rerun with a new attempt stays VERIFIED; two workflows with different names unaffected. Data: `actions/runs` fields already fetched; Contents:read for the path check. Limitations: reusable workflows bind to the caller; org required workflows are unsupported and remain a blocking gap. Migration: none (new gap codes block by default under `policy.evaluate`). Verdict change: yes. Fixtures: `falsegreen2.js` F1 plus a clean control.

**0.2 Event binding for execution evidence (closes F2).** Behaviour: execution counts only from runs whose `event` is `pull_request` for head and test-merge subjects or `merge_group` for group subjects; `pull_request_target`, `push`, `workflow_dispatch`, `schedule` and others never count; the accepted run's event is recorded in the receipt. Acceptance: F2 fixture yields NOT_PROVEN with `EXECUTION_EVENT_INELIGIBLE`. Negative: a `pull_request` run after a failed dispatch run still proves. Data: run `event`. Limitations: a `pull_request` run's tested base remains unknown (see 1.6). Verdict change: yes. Fixtures: F2 plus controls.

**0.3 Per-claim currentness and event routing.** Behaviour: replace the repository-wide revision counter and both broadcast loops with the binding map; events touch only the bindings in their row; targeted rechecks with ETag-conditional reads confirm or invalidate; `mergeable` and `mergeable_state` excluded from identity and consistency; merge-group events routed by queue entry, not broadcast; org-level `repository_ruleset` deliveries accepted and applied to every tracked repository under the installation's organization; `member`, `team`, `membership` and `organization` events subscribed and mapped to approver permissions; the seen-delivery set becomes a TTL map (4 days). Acceptance: G1 to G3 fixtures stay CURRENT; an org ruleset edit stales rules-dependent claims; a base push stales only base-dependent claims; 30 tracked PRs at 200 events per hour stay under 2,000 counted requests per hour in the harness. Negative: an issue comment, label, or another PR's check run changes nothing. Data: existing endpoints plus ETags. Limitations: a permission change without an event still waits for reconciliation. Migration: `data.revisions` and `data.events` replaced; existing receipts stamped with an observation id. Verdict change: no (currentness only). Fixtures: `freshness-noise.js`, `service-scenarios.js`, new org-ruleset and permission-event fixtures.

**0.4 False-NOT_PROVEN triage.** Behaviour: rule types classified as evidence-relevant, push-time (recorded, never blocking) or unsupported; a failed permission read scoped to that reviewer (ineligible), not to the capture; CHANGES_REQUESTED blocks only from an account with observed write permission; `BASE_DRIFT_UNVERIFIED` waived when execution is recorded on a target that contains the base; workflow-run listing paged and filtered by path rather than capped at twenty; wording says "update branch", names App and Bot approvals as excluded by policy, names skipped steps, names non-Actions producers. Acceptance: F4, F5, F6, F8 (push-time types), F10 and scenario 9 flip to the expected outcomes; CODEOWNERS and last-push remain NOT_PROVEN with their sentences. Negative: `required_deployments`, `required_signatures`, `workflows`, `code_scanning`, `linear_history` still block. Data: none new. Limitations: coverage cliffs for CODEOWNERS and non-Actions CI remain by design until Phase 1. Migration: none. Verdict change: yes. Fixtures: the named scenarios.

**0.5 Check titles and ambiguous states.** Behaviour: NOT_PROVEN with a `success` conclusion under an enforcing preset is titled "policy requirements satisfied; evidence gaps remain"; ADMISSION_ONLY VERIFIED is titled "queue proof pending"; the group-stage check is posted before the queue's `check_response_timeout`. Acceptance: title fixtures. Verdict change: no.

**0.6 Invariant harness, first corpus, policy version bump.** Behaviour: seeded-PRNG generator, world model, fetch simulator, the seventeen invariants from section 20 as `node:test` properties; the first twenty fixtures from Levels 2 and 3 as recorded captures; policy id becomes `github-exact-state-v2` with a changelog listing every verdict-affecting change in 0.1, 0.2 and 0.4. Acceptance: harness runs in CI in under two minutes for 1,000 sequences; every fixture asserts verdict, gaps, currentness and ledger state. Verdict change: the bump itself.

### Phase 1. Exact-candidate engine

**1.1 Evidence subject identifier.** Behaviour: every claim stores its ESI (platform, repository id, kind, commit, tree, base, group); requirements are matched by ESI equality; head evidence carries base equal to the base tip only when the head contains it. Acceptance: same-SHA-different-base fixture cannot reuse evidence. Verdict change: no beyond 0.1 and 0.2.

**1.2 Workflow blob binding.** Behaviour: for each accepted run, fetch the workflow file blob SHA at the tested commit; record it; when Actions pinning policy is off, record unpinned `uses:` references as an advisory. Data: Contents:read. Limitations: reusable workflows record the caller blob only. Verdict change: no.

**1.3 Authorization graph.** Behaviour: implement `AUTHORIZED` from section 11: reviewer account class per approval, `latestOpinionatedReviews(writersOnly)` recorded, dismissal actor and head from the timeline, pusher of the current head from the repository activity endpoint, distinct human principals excluding the initiating human and bots, the Bot-author plus-one rule, Bot approvals recorded as observed-not-counted with the sentence that the repository may permit them. Acceptance: fixtures for each row of the authority table. Data: GraphQL timeline, `/activity` (Contents:read). Limitations: CODEOWNERS satisfaction and last-push attribution stay UNKNOWN; permission is as of observation. Verdict change: yes (Bot-author rule); include in a `v2.1` policy note.

**1.4 Policy snapshot and rule-suite ingestion.** Behaviour: the snapshot hash from section 12 stored per receipt and at landing; after merge, read the rule suite for the ref update (Administration:read) and record result, actor and per-rule evaluations into the ledger row; state explicitly when unreadable, outside the window, or when `exempt` actors may exist. Acceptance: bypass fixture yields `BYPASS_OBSERVED: bypass`; unreadable yields the sentence. Limitations: window about one month; exempt invisible. Verdict change: no (ledger only).

**1.5 Observation ledger (minimal event sourcing).** Behaviour: immutable id-keyed observations, receipts cite observation ids per binding and `supersedes`, pruning by reference, coalesced saves. Acceptance: `replay` of any receipt reproduces it from its observation ids. Migration: one-time stamp of existing receipts. Verdict change: no.

**1.6 Reconciliation and log-derived tested base.** Behaviour: 6-hourly full re-observation per tracked PR; 4-hourly App-hook-deliveries scan with redelivery of failed or unseen GUIDs; boot reconciliation after a gap; a reconciliation that changes a receipt marks it `RECONCILED`. Optionally, for `pull_request` runs, download the checkout step log and parse "HEAD is now at … Merge H into B" to record the tested base as INFER-grade. Acceptance: a dropped delivery in the harness is recovered within one scan; a stale receipt with no touching delivery is superseded with the `RECONCILED` reason. Data: App JWT for deliveries; Actions:read for logs. Limitations: logs expire; custom checkout refs defeat the parse. Verdict change: no.

### Phase 2. Landed-content verification

**2.1 Landed-tree binding.** Behaviour: on merge, resolve the landed commit, read its tree and parents, compare with the proven candidate tree (group `head_commit.tree_id` or the test-merge commit's tree recorded at proof time) and record `LANDED_VERIFIED`, `LANDED_MISMATCH`, or `LANDED_UNRESOLVED` with reason; parents checked per method; indirect merges and out-of-range landings recorded as unresolved with reason; every new base-tip commit not mapped to a receipt recorded as an unproven landing. Acceptance: the wrong-merge-base reproduction from Level 2 yields `LANDED_MISMATCH`; a clean squash yields `LANDED_VERIFIED` with tree equality although SHAs differ. Data: `git/commits`, push range (Contents:read). Limitations: rebase per-commit correspondence unresolved until Phase 3. Verdict change: no (new ledger states; external verdict unchanged).

**2.2 Landed-binding attestation and verify-by-SHA.** Behaviour: issue the landed attestation object (section 26) on the merge event; expose `GET /proof/v1/receipts?repository_id=&commit=` returning the receipt and landed state for a commit. Acceptance: chain fixture from artifact provenance to verdict resolves. Verdict change: no.

### Phase 3. Independent reconstruction

**3.1 Mirror and pinned git.** Behaviour: per-repository bare blobless mirror fetched by SHA with the installation token; pinned git static binary; the environment from section 4. Acceptance: reproducible hashes for the Level 2 and Level 3 experiment corpus on the pinned binary. Limitations: disk and fetch cost; no submodule objects by design.

**3.2 EXPECTED_TREE for merge, squash and queue groups.** Behaviour: the algorithm in section 4 with caveat probes and flags; compare with provider candidate tree pre-merge on `merge_group.checks_requested` and with the test-merge commit's tree, and with the landed tree post-merge; receipt fields as specified. Acceptance: every determinism-boundary row behaves as its "receipt handling" column says; a substituted candidate fixture yields `CANDIDATE_MISMATCH`. Limitations: the not-reconstructable list. Verdict change: pre-merge candidate mismatch becomes a blocking gap under `github-exact-state-v3`.

**3.3 Rebase replay.** Behaviour: first-parent replay with `merge-tree --merge-base`, refusing on merge commits and conflicts, flagging become-empty and patch-id duplicates. Acceptance: exp16 shapes reproduce; refusals are explicit. Verdict change: no beyond 3.2.

### Phase 4. Receipt and verifier

**4.1 Signed receipt, policy and verdict-info, bundle, open verifier.** Behaviour: in-toto Statement with `gitCommit` subjects and the receipt digest; DSSE with a KMS-held P-256 key; JWKS with validity windows published and mirrored in the repository; `policy.json` and `verdict-info.json`; the bundle layout from section 17; the open verifier published under a permissive license with the frozen pure logic per policy version and the null-tolerance rule. Acceptance: the prototype's five runs pass against production receipts; a 2026 bundle verifies with the verifier's compatibility table. Requires Ryan's authorization for the signing key (secrets boundary). Verdict change: no.

**4.2 Operator log with public daily anchor.** Behaviour: append-only log of DSSE hashes, signed daily root committed to the public repository, `tlog.json` of kind `merge-proof-operator-log/v1` per receipt; Rekor deferred to the stated triggers. Requires authorization for the external write (public repository commit). Verdict change: no.

### Phase 5. Machine and human surfaces

**5.1 Decision endpoint, CLI and check machine line.** Behaviour: `urn:merge-proof:decision:1` with the `bindings` block; `POST /proof/v1/decision` with caller SHAs and GitHub-token or Actions OIDC auth; `merge-proof verify` and `gh merge-proof verify` printing the five-line chain; exit codes 0/1/2/3/4/8/9; check run `external_id` and the trailing JSON comment; the beacon mapping. Acceptance: contract fixtures; TOCTOU test pairs the decision with the merge guard. Verdict change: no.

**5.2 MCP tool (stdio).** Behaviour: `merge_proof_decision` with `outputSchema`, read-only annotations, no merge tool. Acceptance: the AGENTS.md snippet drives a fixture agent to merge only on PROCEED.

**5.3 Differential lab.** Behaviour: the owned organization and repositories from section 22; weekly runs; fixture-pack diffs, reconciliation-supersession metric and rule-suite disagreement as drift alarms. Requires authorization to create the lab organization and App. Verdict change: no.

Total: twenty items. Phase 0 is the gate for any outside enforcing installation; Phases 1 and 2 are the product; Phase 3 is the differentiator; Phases 4 and 5 are how it is trusted and consumed.

## 44. Astra "do not build" charter

Permanent boundaries: AI code review or any model in the verdict path; vulnerability scanning; test generation or test-adequacy judgment; a CI provider or runner; a merge queue; a generic policy engine or policy language; a compliance suite or framework mapping; an agent orchestrator; project management; a dashboard as a primary surface; a deployment system; a generic provenance platform, evidence vault, SBOM or VEX store; issuing SLSA levels of any track; Kubernetes admission integration; gittuf-style client-side independence; Sigstore keyless as a prerequisite; a self-hosted transparency log presented as transparency; cross-provider adapters before GitHub product-market fit; a browser extension, IDE item or menu-bar light before the decision contract is stable; emulation of GitHub's undocumented merge behaviour beyond the documented envelope (rebase policies for become-empty and patch-id duplicates, GitHub's own `.gitattributes`); any merge, enqueue, review-dismissal or rule-writing action.

## 45. Definition of VERIFIED

**VERIFIED** means: at a recorded observation, every claim required by the repository's policy snapshot for the exact candidate (identified by repository id, kind, commit and tree, with its base and, when queued, its group) evaluated TRUE from platform-recorded evidence bound to that candidate by content identifiers and to its producer by identity; every required check concluded successfully and has a workflow run, job and steps recorded on that commit from an eligible event and a single workflow that the candidate did not modify; the required number of approvals exists on the current head from distinct human accounts, excluding the author and any initiating human, with write permission observed; the rules snapshot was readable and contains no evidence-relevant unsupported rule; the head ref pointed at the candidate; two complete observations of the binding set agreed; no observed condition contradicts any claim; and, when the merge has completed, the landed tree equals the proven candidate's tree and, where reconstructable, the expected tree, with parents consistent with the merge method. VERIFIED asserts nothing about correctness, security, test adequacy, what a workflow checked out, which approvals GitHub counted, bypass actors that leave no record, or any fact GitHub does not expose under the installation's permissions; those are listed in the receipt as not checked or unknown.

**NOT_PROVEN** means: collection completed and at least one required claim evaluated FALSE or UNKNOWN. The receipt names each such claim, the binding or field that failed or was unavailable, the permission or plan that would change it, and the next action. NOT_PROVEN never means the code is wrong.

**FAIL** means: the proof could not be computed: history missing, request budget or time limit exceeded, malformed data, or collection could not complete. FAIL starts no trial and satisfies no gate.

**Freshness (internal, per claim; external as CURRENT / STALE / UNAVAILABLE):** CURRENT when every binding of every required claim was re-confirmed at the latest observation; STALE when at least one binding changed since the receipt was issued, with the changed bindings named; UNAVAILABLE when a binding could not be re-read. Time passing alone changes nothing. A stored receipt is historical; currentness exists only at an observation.

**Landed (internal ledger state):** `LANDED_VERIFIED`, `LANDED_MISMATCH`, `LANDED_UNRESOLVED`, `NO_PROOF_RECORDED`. Exposed as one line in the ledger and the receipt, never as a fourth user verdict.

## 46. Definition of the product

Merge-Proof is a read-only GitHub App that keeps a deterministic record of what was actually proven about the exact code that could merge: it identifies the candidate by commit and tree, binds every required check to the run that executed on that commit and to the workflow that produced it, binds every approval to the head it covers and the account that gave it, records the rules in force at observation, keeps each of those claims current or marks exactly which one went stale, compares the content that lands on the branch with the content that was proven and, where a correct merge can be recomputed from git objects, with what should have landed, and writes all of it into a signed receipt that anyone can verify offline with published code. It states what it cannot know and why. No model decides anything, it never merges, and it never claims more than the evidence it holds.

## 47. Final claim boundary

**Merge-Proof proves** (from platform records bound by content identifiers): the candidate's identity (repository id, PR, head, base, target commit and tree, group); that a named required check concluded successfully and that a workflow run, job and steps executed on that exact commit from an eligible event and a single workflow whose blob at that commit is recorded; that an approving review exists on the current head from an account of recorded type and id other than the author; the normalized rules in force at observation; that the head ref pointed at the candidate at observation; who merged and, when an activity row exists, who pushed; within the rule-suite window with Administration:read, whether the ref update was a bypass; the landed commit's tree, parents and its equality or inequality with the proven tree.

**Merge-Proof independently recomputes** (from git objects): merge bases and containment; changed-path sets; test-merge parent consistency; group ancestry; the expected tree for merge, squash and queue groups in the clean, single-base, attribute-free, no-submodule-conflict envelope; the rebase tree by first-parent replay in the clean case; landed-tree equality.

**Merge-Proof observes from providers** (asserted by GitHub, recorded with time): check run conclusions and App ids; workflow run, job and step records; review states and commit ids; reviewer permission now; GitHub's own review decision; code-owner review requests; queue entry state and position; account types and known vendor bot ids; run actors and triggering actors; Copilot approving reviews; rulesets and protection as active rules; the pointer to the landed commit.

**Merge-Proof infers** (labelled as inference): which merge commit and base a `pull_request` run tested, from job logs; local CODEOWNERS matches; distinct human principals; that a Bot id belongs to a known agent vendor; the rebase tree when become-empty or patch-id-duplicate flags are raised.

**Merge-Proof cannot know**: which approvals GitHub counted; reviewer permission at approval time on non-Enterprise plans; who can bypass; whether an `exempt` actor bypassed; the effective required-approval count including the unattributed-Copilot rule; evaluate-mode rules; rules at merge time beyond the rule-suite and history windows; what a workflow checked out or semantically tested; GitHub's merge configuration (rename limit, directory-rename mode, its own attributes) or its rebase policy for become-empty and duplicate commits; whether an agent wrote code under a human identity; decision-time currentness at the instant of merge; anything GitHub does not expose under the installation's permissions.

## 48. Final go / no-go

**Go**, on the evidence, with two conditions.

Is it technically deep enough? Yes. The determinism boundary in section 4, the failure classes in section 6, the currentness model in sections 13 and 14, and the verifier prototype in section 16 are each a body of specific, tested knowledge that no adjacent project holds and that a native tool has no incentive to publish. The two false greens found at Level 2 are the strongest evidence that the depth is real: they were found by adversarial fixtures against a working engine, and closing them is a week of work with a policy version bump.

Can it become the best implementation of this narrow problem? Yes, if Phase 0 ships before any outside enforcing installation and Phase 3 ships within the year. The reconstruction envelope is now precise; the honest "not reconstructable" list is a feature, because it is what a skeptical engineer checks first.

Does the research identify an actual defensible technical responsibility? Yes: the three comparisons (evidence to candidate, candidate to expected, landed to proven) computed by a party outside the provider's failure domain, plus the refusal machinery, plus a verifier that runs without the service. The 2026-04-23 incident is the proof of demand; thirty incidents in five years are the proof that the classes recur; GitHub's roadmap through 2026 commits to none of the three comparisons.

Or is this elegance around a problem GitHub will absorb? The pre-merge rollup will be absorbed (55% within three years for a merge attestation of PR state, 75% for approval-on-commit via Proof of Presence and required reviewers). The product survives only if revenue rests on the external comparisons, the verifier and the corpus. That is a product decision Ryan makes by funding Phase 3 and Phase 4; without them the answer flips to no-go within the window.

Conditions: (1) no outside enforcing installation until Phase 0 is complete and the harness is green; (2) the naming decision is taken before the first paid customer, whichever way.

## Finish line answers

**The strongest truthful meaning of VERIFIED** is the definition in section 45: every required claim TRUE from bound, producer-identified evidence at a recorded observation, current, contradiction-free, and, after merge, landed equals proven.

**How much can be independently established:** content and ancestry entirely (merge bases, containment, changed paths, expected trees inside the envelope, landed equality); everything about checks, reviews, rules, refs and queue state only as GitHub's recorded assertion, which the receipt says.

**What must remain provider-trusted:** refs, check runs and their producers, workflow records, reviews and permissions, rules, queue state, actor identities, the pointer to the landed commit, and the claim that GitHub served what the receipt records.

**How false green is prevented under strange behaviour:** binding by content identifiers and producer identity (sections 8 and 9); event eligibility; self-evidence exclusion; UNKNOWN never counting; two-observation consistency over the binding set; per-claim currentness with reconciliation; refusal on any reconstruction outside the envelope; the invariant harness and the differential lab that convert every discovered path into a permanent fixture.

**Can another machine verify the receipt:** offline, thirteen claims including the re-derivation of the verdict from stored evidence, demonstrated; online, seven retention-bound claims; four remain trust-dependent and are named.

**Is there a deeper layer inside the boundary:** no; three refinements inside the existing legs (section 42).

**The engineering sequence:** section 43, twenty items, Phase 0 first.

**What makes a skeptical senior engineer say it belongs in their process:** running `merge-proof verify` on a PR they know and seeing five SHAs and two tree ids, one enumerable reason when something is off, a receipt whose limitations they would have written themselves, a verifier they can read that reproduces the verdict, and, the first time GitHub or their queue lands something other than what was tested, a ledger row that says so before anyone else does.

## Appendix: source reports

Under `sources/l3/`:

- `G-expected-tree-wall.md`: sixteen experiment families on merge, squash, rebase and queue determinism; determinism boundary table; the EXPECTED_TREE algorithm; scripts and results log under `git-wall/`.
- `H-distributed-currentness-testing.md`: GitHub delivery semantics, fourteen race windows, the per-claim binding and event map, invalidation algorithm, per-PR state machine, reconciliation, event-sourcing deltas, model-based and differential testing design, adjacent-field concepts.
- `I-incidents-wow-naming.md`: thirty provider correctness incidents 2021 to 2026 with failure classes, practitioner-respect evidence with thread ids, the naming decision memo, and the GitHub roadmap erosion table.
- `J-verifier-bundle-provenance.md`: claim classification, verifier specification and exit semantics, the prototype verifier under `verifier/` with its run log, bundle layout, schema evolution, transparency decision, reproducibility and verdict-info, the provenance interface with JSON examples.
