# Level 3 — The Expected-Tree Wall: where two independent merge implementations stop agreeing

Date: 2026-09-19. Researcher environment: Linux, git 2.43.0 (`/usr/bin/git`; no newer binary trivially obtainable — apt unavailable, no static build in `/usr/local/bin`; all git version-drift claims below therefore come from release notes/source, not from local re-execution on newer versions). Every experiment is a shell script in `l3/git-wall/exp*.sh` (`lib.sh` fixes author/committer identity and dates so hashes are reproducible; `merge.renameLimit=9999` is set per repo unless an experiment says otherwise). Merge-Proof's own repository (the repository) was not touched.

Notation: `mt(B,H)` = `git merge-tree --write-tree B H` (ort, default options). B = base tip, H = PR head. "rc=0" clean, "rc=1" conflicted (tree still written, with conflict markers/stages).

## 0. Executive summary of the wall

Level 2 showed that for clean, plain-text, single-merge-base cases, `merge-tree --write-tree` produces exactly the tree GitHub lands, for merge, squash, rebase and queue groups. Level 3 finds the boundary is not one line but a set of independent axes:

1. **Configuration axis** (rename limits, `-X` options, `merge.directoryRenames`, `merge.renormalize`, custom drivers, `attr.tree`/`--attr-source`): the same git binary yields different clean trees under different config. GitHub runs with an unpublished config. Merge-Proof must pin a config and record it.
2. **Attribute-source axis**: `merge-tree` reads `.gitattributes` from the *worktree/index* (or `HEAD` in bare repos on git 2.43–2.45, and from *nothing* in bare repos on ≥2.46 unless `attr.tree` is set), never from the trees being merged. GitHub says it ignores user `.gitattributes` for merges. A PR that adds/changes `.gitattributes` `merge=` rules is a divergence class.
3. **Local-state axis**: submodule gitlink merges depend on whether the submodule's objects are present locally (exp 3c vs 3d). GitHub's outcome for two divergent gitlinks is a conflict even when git would fast-forward (community evidence, Aug 2025).
4. **History-shape axis**: criss-cross (multiple merge bases) makes the result depend on the recursive virtual-base construction (exp 7c: single-base clean, virtual-base conflict). Rebase depends on per-commit replay, not on the endpoints (exp 16).
5. **Version axis**: ort rename handling was fixed in 2.44 (incomplete last line changes similarity), 2.50, 2.52, 2.53, 2.55; bare-repo attribute default flipped in 2.43 and back in 2.46; `--merge-base` accepted trees from 2.45; `--quiet` in 2.50.

The good news: in every case where `merge-tree` reports **rc=0 with the pinned config and the tree is reproducible under a second config**, agreement with GitHub is expected; every divergence found is either (a) a conflict on our side (GitHub also refuses, so no landing should occur), or (b) a case where a *clean* result depends on config/state — those are the cases Merge-Proof must flag as "compute-with-caveat" or "not reconstructable".

## 1. Renames (`exp01_renames.sh`, `exp01g_dirrename_split.sh`)

**Hypothesis.** ort's rename handling is the largest single source of "clean here, different there" trees, because it is governed by four knobs (similarity threshold, exhaustive-detection limit, directory-rename mode, and whether detection runs at all) and GitHub publishes none of its settings.

**Observed (git 2.43.0):**

| case | result | tree |
|---|---|---|
| 1a rename+edit on PR, edit on base | clean, edit follows the rename | `248cda33…` |
| 1a with `-X find-renames=100%` | modify/delete conflict | `5f65ed8e…` (conflicted) |
| 1a with `-X no-renames` or `merge.renames=false` | **identical to default** `248cda33…` — ort ignores these | |
| 1b rename/rename(1to2) | conflict, all three paths staged | `0ace9005…` |
| 1c rename/delete | conflict (+modify/delete) | `721127d7…` |
| 1d rename/add | add/add conflict on the target path | `d67412ec…` |
| 1e 54%-similar rename; default threshold | clean `08c1e240…`; with `find-renames=70%`: conflict `ef9bcf7f…` | |
| 1f dir rename d/→e/, base adds d/new | default (`merge.directoryRenames=conflict`): **rc=1** but tree `8d726c0e…` contains `e/new.txt`; `=true`: same tree `8d726c0e…` rc=0; `=false`: `83f77f75…` (file stays in d/) | |
| 1g split dir rename 2:1 | majority wins → e/, still flagged "file location" conflict | `7afa96c4…` |
| 1i even split 1:1 | "directory rename split" conflict | `d241f867…` |
| 1j dir rename vs edit of an existing file | clean, ordinary rename detection | `cfe6d20c…` |
| 1h 30 basename-changing renames, `merge.renameLimit=5` | exhaustive detection skipped → 30 modify/delete conflicts `4cf05882…` vs clean `c1991f05…` at limit 9999 | |
| 1k 7100 same-basename dir renames, default limit | clean regardless of limit (basename-guided detection needs no exhaustive pass) | `da06b457…` |

**Source facts.** `merge-ort.c` (v2.43.0, line ~4780): "`detect_renames`, verbosity, buffer_output, and obuf are ignored fields that were used by 'recursive' rather than 'ort'". So rename detection cannot be turned off under ort; only the threshold (`rename_score`, default 50%) and the exhaustive limit (`merge.renameLimit` → `diff.renameLimit` → hard default 7000, `merge-ort.c` line 3233) matter. `merge.directoryRenames` defaults to `conflict` (Documentation/config/merge.txt).

**Implication.** (i) Any "clean" tree that depends on a rename being detected is stable across ort versions only if the similarity is not near 50% (2.44 changed similarity computation for files with an incomplete last line — see §13). (ii) `merge.directoryRenames=conflict` vs `true` produce the *same tree* but different exit codes; a landing that equals that tree tells you the provider used `true` or resolved by hand. (iii) The exhaustive limit is a genuine cliff: above 7000 basename-changing renames the same commits yield a different tree. (iv) GitHub's merge implementation is merge-ort (GitHub blog, "Scaling merge-ort across GitHub", 27 Jul 2023: merges on ort since Sept 2022, rebases since June 2023 via `git replay`), but its `merge.renameLimit`, `merge.directoryRenames` and threshold are not documented anywhere I could find. Treat them as ort defaults with confidence "likely, unverified".

## 2. File modes and symlinks (`exp02_modes.sh`)

Hypothesis: mode is merged as a separate 3-way field; only type changes (blob↔symlink) conflict.

Observed: mode-only change on one side + content edit on the other → clean `645fd6f4…`, mode 100755 with merged content (2a). Both sides set +x → clean, same tree (2b). Base 755, PR -x, base edits → clean `52e54bdc…` mode 100644 (2c). Blob→symlink on one side vs chmod on the other → "distinct types" conflict, ort writes both (`s.sh` symlink, `s.sh~pr` blob) `13c6efd3…` (2d). Symlink target changed on both sides → content conflict with three 120000 stages `a46a3ab2…` (2e); one side only → clean `1cc461fe…` (2f); same target on both → clean (2h). `core.fileMode=false` does not change merge-tree output (2i) — it is a worktree setting.

Implication: deterministic and implementation-independent for blob-mode cases (libgit2 and ort agree: mode is a field of the index entry). Only two-mode conflicts are impossible in practice because the executable bit has only two values; a true mode conflict requires a type change, which every implementation reports as a conflict. **Compute.**

## 3. Submodules / gitlinks (`exp03_submodules.sh`)

Hypothesis: gitlink merging is the one place where ort consults objects *outside* the superproject.

Observed: both sides move `sub` to different SHAs, submodule not present locally → conflict `2a595126…` ("Failed to merge submodule sub (not checked out)") (3a). PR bumps gitlink, base edits an unrelated file → clean `67ccb3cd…` (3b). Both bump, one SHA is a descendant of the other, submodule absent → **conflict** (3c) `2a595126…`; the same merge with the submodule cloned into `sub/` → **clean** `9e501fec…`, gitlink fast-forwarded to the descendant (3d, also after `absorbgitdirs`). Both bump to the same SHA → clean (3e).

Provider evidence: GitHub community discussion #168693 (4 Aug 2025): GitHub's UI reports a conflict for exactly the 3c/3d shape ("GitHub's web UI doesn't check the actual submodule history — it just sees two different SHAs and assumes a conflict"); no staff reply. That matches ort-without-submodule-objects (3c), not ort-with-objects (3d).

Implication: the merge result is a function of local object availability, not of the three trees. Merge-Proof must never have submodule objects available (or must run in a bare superproject clone without `.git/modules`) to mimic GitHub, and must treat a landing whose gitlink equals the descendant SHA in the 3c shape as a divergence-or-bypass. **Compute-with-caveat** when only one side touches a gitlink; **refuse** when both sides change the same gitlink.

## 4. Binary files (`exp04_binary.sh`)

Both sides modify a NUL-containing blob → "Cannot merge binary files" conflict; the written tree `553e4ae4…` carries the *branch1 (base) side* blob at the path (`a\0b\ne`), stages 1–3 in the output (4a). `-diff` attribute alone does not make a file binary for merging (4b, clean `4aa9ad1a…`, also from a bare clone). The `binary` macro (`-merge`) forces a conflict even for non-overlapping edits (4c). One side only or identical changes → clean (4d, 4e).

Implication: binary conflicts are deterministic and every implementation refuses. The interesting subtlety is what tree `merge-tree` writes for a conflict: **the base-side blob**, which is exactly what a naive "take ours" landing would produce — Merge-Proof must never treat the conflicted tree as an expected tree. **Refuse on rc≠0.**

## 5. `.gitattributes` (`exp05_attributes.sh`)

Hypothesis: `merge-tree` honours the `merge` attribute, but reads it from a place unrelated to the commits being merged.

Observed:

* `merge=union` committed in base, worktree at base: clean union `65b13bb0…` (`l1|l2|main|pr`). Bare clone (git 2.43): same `65b13bb0…` — attributes read from `HEAD:.gitattributes`. Worktree with `.gitattributes` deleted (index still has it): conflict `1792116e…` — attributes come from the *working tree file* first. Detached at a commit lacking the attribute: conflict; add `--attr-source=main` or `GIT_ATTR_SOURCE=main`: union again (5a).
* Attribute added **by the PR itself**: worktree at base → conflict; `--attr-source=pr` or worktree at pr → union (5b). So the same (B,H) pair has two "correct" trees depending on attribute source.
* `merge=ours` → conflict `6bdf8446…` (5c): `ours` is not a built-in driver (gitattributes(5): built-ins are `text`, `binary`, `union`); it needs `merge.ours.driver=true`. Operand order matters for the *conflict markers* (`4c57c073…` when reversed) but not for a clean result.
* `merge=foo` with no `merge.foo.driver` → conflict; with a driver configured, merge-tree **runs the external program** and writes its output: driver `true` leaves the base-side content (`808b84a8…`, `l1|l2|main`), a script writing `DRIVER-RAN` yields `bffdb33c…` — also from a bare clone on 2.43 (5d, `drv.sh`). Drivers run whenever both sides changed the file, even for non-overlapping hunks (5d', driver `false` → conflict).
* `-merge` → conflict for non-overlapping edits (5e).
* CRLF: PR converts the file to CRLF and edits line 1, base edits line 20: conflict `93125bb8…`; adding `text=auto` alone changes nothing; `merge.renormalize=true` + `text=auto` → clean `b6c35b35…`; `-X ignore-space-at-eol` → clean but a *different* tree `d6004789…` (5f). Committed `eol=crlf` does not affect the blob-level merge (5g).

Source/docs: `attr.tree` (config/attr.txt, 2.43): "In a bare repository, this defaults to `HEAD:.gitattributes`"; **2.46 release notes: "Git 2.43 started using the tree of HEAD as the source of attributes in a bare repository, which has severe performance implications. For now, revert the change"** — so on ≥2.46 a bare repo reads no attributes unless `attr.tree` is set. `--attr-source` exists since 2.41; `merge-tree` segfaulted with it until 2.43 (RelNotes 2.43).

Provider evidence: GitHub support in community discussion #9288 (8 Dec 2017): "GitHub doesn't consider user-defined .gitattributes files (normally, we use our own .gitattributes file which you can't change)"; thread still open with reports through June 2025 that `merge=union` is not honoured. No evidence that this changed with the merge-ort migration. libgit2 (PR #3564, merged 17 Mar 2016) supports `union`/`binary`/custom drivers, so GitHub's behaviour is a policy choice, not a capability limit.

Implication: **Merge-Proof should compute with an empty attribute source** (`--attr-source=<empty tree>` or `attr.tree=4b825dc6…` and no worktree) to match GitHub's documented "user attributes ignored" behaviour, and record that choice. Repositories whose merge result would change under `merge=union`, `-merge`, drivers, or `merge.renormalize` are "compute-with-caveat": ort-with-attributes gives a *different clean tree* than ort-without. Note a residual unknown: GitHub's "own .gitattributes file" content is unpublished (probably LFS/linguist-related); if it contained `merge` rules they would apply to everyone.

## 6. Case-only path collisions (`exp06_case.sh`)

PR adds `README.md`, base adds `readme.md` → clean tree with both entries `08599057…`; `core.ignorecase=true` changes nothing (6a). Rename `a.txt→A.txt` vs edit → clean `4272a435…` (6b). Directory `src→Src` plus a file added in `src/` → "file location" conflict, tree `b8c3311b…` places the file in `Src/` (6c). Both `A` and `a` in base, each edited on one side → clean (6d).

Implication: tree-level merging is case-sensitive and byte-exact in every implementation (libgit2 and ort both operate on tree entries; GitHub's servers are Linux). Divergence appears only in a *checkout* on a case-insensitive filesystem, which is where a human doing a "manual merge" on macOS/Windows could silently drop one of the two entries and push a tree that differs. Merge-Proof: **compute**, but flag trees containing case-colliding paths as "checkout-hazard" in the receipt.

## 7. Criss-cross merges (`exp07_crisscross.sh`, `exp07c_crisscross_divergence.sh`)

Construction 7c: base line 10; PR→`10-X`, base→`10-Y`; each side merges the other and resolves to `10-X` (two merge bases, `git merge-base --all` = 2); PR then changes `10-X`→`10-Z`.

* default ort (recursive virtual base): **conflict** `304d5a3d…` — the virtual base contains conflict markers, so both sides differ from it and from each other.
* `--merge-base=P1` (the PR-side base, content `10-X`): **clean** `616e8b76…`, result `10-Z`.
* `--merge-base=M1` (`10-Y`): conflict `304d5a3d…`.
* `git merge -s resolve`: clean `616e8b76…` (it picks one base).

7a/7b showed cases where all base choices agree. Docs: `--merge-base` (git-merge-tree.txt): "specifying multiple bases is currently not supported"; since 2.45 the argument may be a tree.

Implication: with >1 merge base the "expected tree" is defined only by the full recursive algorithm (order of base merging, virtual-base conflict rendering), which is implementation-specific (libgit2 also recurses but renders virtual-base conflicts differently). GitHub-on-ort should match ort defaults, but Merge-Proof cannot check it independently with a single-base computation. **Compute-with-caveat**: run default merge-tree, record `merge-base --all` count; if >1 and the result is clean, mark "multi-base: ort-specific".

## 8. Merge commits inside the PR (`exp08_prmerges.sh`)

PR with two "merge main into pr" commits (8a): `merge-tree(main,pr)` = real merge tree = squash tree = rebase tree = `rebase --rebase-merges` tree = `c1e9758b…`; only the merge base moves (to the last merged base commit). With a *manually resolved* conflict inside a PR-side merge commit (8b): merge-tree = squash = real merge = `ebeae0e9…`, but **rebase conflicts** (both plain and `--rebase-merges`), because linearising re-applies the original conflicting commit against base without the resolution.

GitHub docs (pull-request-merges.md, reusables/rebase_and_merge_summary): rebase and merge "adds each commit onto the base branch without a merge commit"; when GitHub "cannot safely rebase the pull request automatically, you can rebase locally, resolve conflicts, and push". The docs do not state in words that merge commits are dropped; the mechanism (every commit replayed individually via `git replay`, whose doc says it "mimics a cherry-pick operation") implies first-parent linearisation with merge commits skipped — unverified detail.

Implication: for merge and squash the merge-base shift is harmless (single base, same tree). For rebase, PR-internal merge commits are a **refuse** class unless the rebase is replayed exactly.

## 9. Empty commits (`exp09_empty.sh`)

PR = [empty commit, pr1, pr2 (identical to base's main1 change), pr3]; base = [main1]. `merge-tree` = squash = `cdc47822…`. `git rebase` (2.43 default `--empty=drop`, originally-empty commits kept): 3 commits [pr3; pr1; empty-from-start] — pr2 dropped as it became empty; `--no-keep-empty`: 2 commits. All variants give the same tree `cdc47822…` (9a). A PR that is entirely already applied: merge-tree = base tree `7c505ef1…`, rebase yields 0 commits, squash has nothing to commit (9b).

GitHub docs (reusables/pull_requests/rebase_and_merge_summary.md): rebase and merge "Drops commits that were empty to begin with, such as those created with `git commit --allow-empty`, whereas `git rebase` keeps originally-empty commits by default", and "Always updates the committer information and creates new commit SHAs". Nothing is said about commits that *become* empty; `git replay` (2.44 docs/`builtin/replay.c`) has no `--empty` handling, so GitHub's behaviour there is its own code — unknown.

Implication: commit *count* is not predictable, but the **tree** is unaffected by empty-commit policy in every variant tested. **Compute** (tree only); never assert commit counts.

## 10. Whitespace and line endings (`exp10_whitespace.sh`, 5f)

Re-indent (spaces→tab) on PR vs `return 0→1` on base, same line: default conflict `68fa863e…`; `-X ignore-space-change`/`ignore-all-space`/`-X ours` → clean `dc49e08e…`; `-X theirs` → clean `0a0a5be9…`; `ignore-space-at-eol`, `ignore-cr-at-eol`, `diff-algorithm=patience|histogram` → still conflict (10a). Different insertion points with all four diff algorithms → one tree `65734efc…` (10b). Whole-file CRLF conversion + edit of line 1 on PR vs LF edit of line 2 on base: default → **conflict** (tree `2122582a…` contains `<<<<<<< main` markers; the earlier `rc=0` in the script log is `head`'s exit code, verified by inspecting the blob), `ignore-cr-at-eol`/`ignore-space-at-eol` → clean tree `8c019193…` (10c).

GitHub evidence: none of the docs mention any `-X` option; the merge-ort blog describes a straight migration. libgit2's `git_merge_options` defaults are also "no whitespace flags". Confidence that GitHub uses no `-X` options: high (undocumented).

Implication: `-X` options change *clean* trees, not just conflict status. Merge-Proof must run with no `-X` options and record `strategy_options=[]`. **Compute.**

## 11. Conflicts and the web conflict editor (docs only)

* `merge-tree` writes a tree even on conflict (rc=1) — for text conflicts it contains conflict markers; for binary it contains the base-side blob (§4); for directory-rename "conflict" mode it contains the *same tree as the clean `true` mode* (§1). Those trees must never be used as EXPECTED_TREE.
* GitHub: PR `mergeable=false` / `mergeable_state=dirty` on conflict (REST field `mergeable_state` is undocumented but community-enumerated: `clean, dirty, unknown, blocked, behind, unstable, draft, has_hooks`); merge queue removes the PR with reason `MERGE_CONFLICT` (enum present in github/docs webhook schema `pull_request.dequeued.reason`: `MERGE_CONFLICT`, `QUEUE_CLEARED`, plus `CI_FAILURE`, `CI_TIMEOUT`, `MANUAL`, `BRANCH_PROTECTIONS`, … per GraphQL `PullRequestRemovedFromQueueReason`).
* Web editor: "You can resolve simple competing line change conflicts on GitHub. For other conflicts, use the command line" and "Resolving conflicts on GitHub merges the entire base branch into the head branch" — i.e. the resolution becomes a merge commit on the PR head; afterwards (B, H') merges cleanly and the merge base moves to B. The landed tree is then reproducible from the *new* head (§8, `8b`: merge-tree = squash = real merge), but not by rebase.

Implication: any landing where Merge-Proof's `merge-tree` reports rc≠0 for the recorded (B,H) is divergence-or-bypass, *unless* H changed (a resolution commit) — so the receipt must key on the exact head SHA at merge time (`merge_group.head_sha` / `pull_request.head.sha` in the `closed` event), and re-run on H'.

## 12. LFS pointers, sparse checkout, signatures, subtrees (`exp12_misc.sh`)

LFS pointers are blobs: one side changes the pointer → clean `d68a11a7…`; both sides → text conflict `e3211655…`; `merge=lfs` attribute without a driver is an undefined driver → conflict; with `merge.lfs.driver=false` still rc=1 (12a). Sparse checkout: identical tree with and without cone mode `b167fff2…` (12b). Signatures live in the commit object (`gpgsig` header); `commit-tree` on the same tree proves the tree id is independent (12c); GitHub docs confirm rebase-and-merge rewrites commits "without commit signature verification" and squash/merge create new commits — so signatures are never part of TREE identity. `-X subtree=lib` gave the same tree as default for an ordinary in-place directory (12d); real `git subtree` merges use `-Xsubtree=<prefix>` which *shifts* trees — GitHub cannot be told to do that, so any subtree-style PR that needs the shift will simply conflict on GitHub. **Compute** (all four), with LFS "both sides changed pointer" → conflict → refuse.

## 13. git version drift (release notes 2.38–2.55, source)

Relevant entries (Documentation/RelNotes, fetched from tag v2.55.0 as `.adoc`, 2.38 as `.txt` from v2.48.0):

* 2.38: `merge-tree --write-tree` introduced; "long-standing corner case bug around directory renames in merge-ort" fixed.
* 2.39: `--stdin`; ort mishandled "directory renames into a branch that changes the directory to a symlink".
* 2.40: `--merge-base`.
* 2.41: `--attr-source`; "merge-tree reads the basic configuration, which can be used by git forges to disable replace-refs" (`ds/merge-tree-use-config`) — before 2.41 merge-tree ignored config such as `merge.renameLimit`.
* 2.43: `-X` strategy options for merge-tree; `attr.tree`, bare repos default to `HEAD:.gitattributes`; `--attr-source` segfault fixed.
* 2.44: "Rename detection logic ignored the final line of a file if it is an incomplete line" — **changes similarity scores**, so a rename at ~50% can flip; `git replay` added (experimental).
* 2.45: `--merge-base` accepts trees; submodule-conflict advice squelchable.
* 2.46: **bare-repo HEAD-attributes default reverted** ("severe performance implications"); documented in 2.46 maint notes.
* 2.47: none for ort.
* 2.49: `--stdin` deadlock fix; docs renamed `.adoc`.
* 2.50: `merge-tree --quiet`; recursive backend removed; "merge-recursive and merge-ort machinery crashed in corner cases when certain renames are involved" (crash→result change).
* 2.52: "Various bugs about rename handling in 'ort' merge strategy have been fixed" (`en/…`), 2.53: "Yet another corner case fix around renames in the ort merge strategy"; "assertion failure in a history with criss-cross merges [that] renamed a directory and a non-directory".
* 2.55: "'ort' merge backend improvements".

Implication: clean-merge trees are stable across versions for plain content merges; **rename-involving** merges (especially near-threshold similarity, directory renames, criss-cross+rename) and **attribute-dependent** merges have version-specific outcomes. Recommended pin: one exact version ≥2.46 (so the bare-repo attribute semantics are the documented "none unless `attr.tree`") — pragmatically **git 2.50.x or 2.52.x**, whichever Merge-Proof can ship as a static binary; re-validate the Level-2/3 corpus on every bump. The receipt must record: `git_version` (exact), `strategy=ort`, `strategy_options=[]`, `config={merge.renameLimit, diff.renameLimit, merge.directoryRenames, merge.renormalize, merge.conflictStyle(irrelevant to clean trees), merge.default(none), core.attributesFile(none)}`, `attr_source` (empty tree OID or `H:`/`B:`), `merge_bases[]`, `submodule_objects_available=false`, `replace_refs=disabled` (`GIT_NO_REPLACE_OBJECTS=1`), `rc`.

## 14. Multi-PR queue ordering (`exp14_queue_order.sh`)

Sequential `merge-tree` + `commit-tree` chain (each group commit has the previous group commit and the PR head as parents, as GitHub's merge-group commits do):

* A,B overlapping + C independent: every order conflicts at whichever of A/B comes second (14a) — the *conflicted PR identity* is order-dependent, the surviving tree is not comparable.
* Three non-overlapping PRs: all six orders → `2186161b…` (14b).
* Rename PR + edit PR: both orders → `133c7360…` (14c). A 59%-similar rename + heavy edits elsewhere: both orders → `6cb654bf…` (14d). Rename detection is between the *merge base* and each side, and each PR's merge base stays its own fork point regardless of what landed before it, so order cannot change rename detection unless the PRs' histories differ in merge base.
* Directory rename PR + "add file in old dir" PR: default `conflict` mode → both orders conflict (tree `4010a7c9…`); `true` → both orders `4010a7c9…`; `false` → both orders `231c6cf5…` (14e). Order-independent, config-dependent.

Implication: for queue groups, EXPECTED_TREE per position is deterministic given the order GitHub used (`merge_group.base_sha`, `head_sha`, entries order in the `merge_group` webhook); non-overlapping groups are order-invariant. **Compute**, per entry, in the provider's declared order.

## 15. Squash semantics (`exp15_squash.sh`)

Squash tree == `merge-tree(B,H)` in all shapes: PR with a revert of its own commit (`3e596455…`, 15a — rebase also agrees here); PR whose head contains base (merge-tree = head tree = squash = ff-merge = `--no-ff` merge = `acef3bd6…`, 15b); PR whose net diff is empty (merge-tree = base tree `7c505ef1…`, 15c — GitHub would create an empty squash commit or refuse; tree still equals B's tree). GitHub docs: squashed PRs "are merged using the fast-forward option" — i.e. one new commit whose tree is the merge result and whose parent is B.

Implication: squash is the most robust method: EXPECTED_TREE = `merge-tree(B,H)` with no history dependence except the merge base. **Compute.**

## 16. Rebase semantics (`exp16_rebase.sh`, `exp16a_patchid.sh`)

Rebase replays *diffs of individual commits*; merge and squash use only endpoints. Findings (git rebase, `--empty=drop` default, cherry-pick detection on):

* 16e control: clean → rebase tree == merge tree `971378e8…`.
* 16b (edit depending on base-side change — PR c1 `10→10-A`, c2 `10-A→10-B`; base `10→10-B`): merge clean `54c40f5c…`; **rebase conflicts** at c1.
* 16d (change then change back; base changes the same line): merge clean `2135ecc8…`; **rebase conflicts** at c1.
* 16c (PR deletes line 20 then re-adds it; base deletes line 20): merge clean, line 20 absent `e327e849…`; **rebase succeeds with a different tree** `267818d6…` — c1 becomes empty and is dropped, c2 re-adds the line. Merge says "line gone"; rebase says "line present". Both are "correct".
* 16a′ (revert-then-redo where the redo's patch-id equals a base commit): merge clean `e7bd096e…` (10-X); default rebase drops the redo as "already upstream" and yields `267818d6…` (10 plain) with 1 commit; `--reapply-cherry-picks` restores `e7bd096e…`. A different final tree from the same endpoints, controlled by an option.
* 16f (PR-internal merge commit carrying an extra "evil" hunk): merge tree includes the hunk `3be320a5…`; rebase drops merge commits → hunk lost `8de3b836…`.
* 16g (PR contains a commit already cherry-picked to base): rebase drops it, tree equals merge `0f8fbb0b…`.
* 8b: PR-internal conflict resolution → rebase conflicts while merge is clean.

GitHub's rebase runs `git replay` (blog, changelog 27 Jun 2023) — which "mimics a cherry-pick operation" per commit, with GitHub-specific handling of originally-empty commits (docs) and unknown handling of become-empty commits and of patch-id duplicates (`builtin/replay.c` 2.44 has neither). Rebase and merge is disabled in the UI when the replay conflicts (docs: "cannot safely rebase … rebase locally").

Conclusion: **rebase cannot be predicted from (B,H) alone**. EXPECTED_TREE for rebase must be computed by replaying the first-parent commit list of `B..H` with `merge-tree --merge-base=<parent> <cur> <commit>` (a cherry-pick is a 3-way merge with the commit's parent as base), refusing on any conflict, on any merge commit in `B..H`, and flagging when any step's result tree equals its input tree (become-empty) or when a commit's patch-id matches a `H..B` commit — because GitHub's policy for those two cases is unpublished. If the replay is clean and has none of those flags, the replayed tree equals GitHub's rebase tree with the same confidence as the merge case.

Validation of the replay approach (`exp16h_replay.sh`): replaying first-parent commits with `merge-tree --merge-base=<commit^> <cur> <commit>` reproduces `git rebase`'s tree in the clean case (`971378e8…`) and in the become-empty case (`267818d6…`, flagged `become-empty`), reports the conflict in 16b, and refuses on a merge commit in range (8a shape).

## 17. Determinism boundary

Legend — *Det.*: is the clean result a pure function of (B, H, method) across correct implementations? *Agreement*: `merge-tree` (pinned config) vs GitHub, from evidence above. *Receipt*: compute / compute-with-caveat / record-provider-only / refuse.

| # | Edge case | Det. across implementations | merge-tree vs GitHub agreement | Receipt handling |
|---|---|---|---|---|
| 1a | Rename + edit vs edit (similarity ≫50%) | yes given rename detection on (libgit2 default off!) | known-likely (GitHub on ort since 2022) | compute |
| 1e | Rename with similarity 50–60% | no (threshold, 2.44 similarity change) | unknown | compute-with-caveat (flag `near-threshold-rename`) |
| 1h/1k | > `renameLimit` basename-changing renames | no (limit is config) | unknown (GitHub's limit unpublished) | compute-with-caveat; refuse if warning "exhaustive rename detection was skipped" appears |
| 1f/1g | Directory rename + file added in old dir | no (`merge.directoryRenames` conflict/true/false → two trees) | unknown (default `conflict` ⇒ GitHub should refuse) | refuse if rc≠0; if a landing equals the `true`-tree, record-provider-only |
| 1b/1c/1d | rename/rename, rename/delete, rename/add | conflict everywhere | known (conflict) | refuse |
| 2 | Mode changes, executable bit | yes | known-likely | compute |
| 2d/2g | Blob↔symlink type change on one side, change on other | conflict | known (conflict) | refuse |
| 2e/2f | Symlink target edits | yes (one side) / conflict (both) | known-likely | compute / refuse |
| 3b | One side bumps gitlink | yes | known-likely | compute |
| 3c/3d | Both sides bump same gitlink (even fast-forwardable) | **no** — depends on local submodule objects | known: GitHub conflicts (community #168693) | refuse; compute only in a clone with no submodule objects and treat rc≠0 as GitHub-conflict |
| 4 | Binary both sides | conflict | known | refuse |
| 5a/5b | `merge=union` / `-merge` / `binary` / driver attributes | **no** — depends on attribute source | known: GitHub ignores user attributes (#9288, 2017; still true 2025) | compute with empty attribute source; flag `attributes-would-change-result` when result differs with `--attr-source=B` or `=H` |
| 5d | Custom merge driver | no (needs local config) | known: cannot run on GitHub | compute with no drivers; refuse if attribute names an undefined driver and both sides changed the file |
| 5f | `merge.renormalize` / `text=auto` CRLF | no (config) | unknown (assume off) | compute with renormalize off |
| 6 | Case-only colliding paths | yes at tree level | known-likely (Linux servers) | compute; flag `case-collision` (checkout hazard for manual merges) |
| 7 | Criss-cross, >1 merge base | **no** — virtual-base construction is implementation-specific (7c: clean vs conflict) | unknown (same binary family → likely same) | compute-with-caveat; record `merge_bases[]`; if any single-base run differs from default, flag `multi-base-sensitive` |
| 8 | Merge commits inside PR (merge/squash) | yes | known-likely | compute |
| 8/16f | Merge commits inside PR (rebase) | no (dropped merges lose evil hunks) | unknown (GitHub replay policy) | refuse for rebase |
| 9 | Originally-empty / become-empty commits | tree yes; commit count no | known (tree); count documented only for originally-empty | compute tree; never assert count |
| 10 | Whitespace/CRLF hunks | yes with no `-X` | known-likely (no options) | compute |
| 11 | Any conflict | conflict | known: `mergeable=false`, `MERGE_CONFLICT` dequeue | refuse; if landed anyway → divergence-or-bypass (unless H changed via conflict editor) |
| 12 | LFS pointers, sparse, signatures, subtree dirs | yes | known | compute |
| 13 | git version drift on renames | no | n/a | pin version; record it |
| 14 | Queue order, non-overlapping | yes (order-invariant) | known-likely | compute per entry in provider order |
| 14a | Queue order, overlapping | conflict at some entry | known (dequeue) | refuse that entry |
| 15 | Squash (any history shape) | yes | known-likely | compute = merge-tree(B,H) |
| 16b/16d | Rebase where a commit depends on base-side change or flips a line back | rebase conflicts, merge clean | known (GitHub disables rebase) | refuse for rebase; compute for merge/squash |
| 16c | Rebase: delete-then-re-add vs base delete | replay tree ≠ merge tree; replay deterministic but become-empty policy unknown | unknown | compute by replay, flag `become-empty` |
| 16a′ | Rebase: redo commit whose patch-id matches base | git rebase drops it; `git replay` does not | unknown | compute by replay, flag `patch-id-duplicate` |

## 18. Recommended EXPECTED_TREE algorithm

**Inputs.** `base_sha` (B, the base tip at decision time — `merge_group.base_sha` for queues), `head_sha` (H, exact head at merge time), `method ∈ {merge, squash, rebase}`, provider-declared group order for queues, repository packfile access (a bare clone/fetch of B, H and their reachable objects; **no** submodule objects, **no** `.git/modules`).

**Environment pin.** One exact git version ≥ 2.46 (recommend 2.50.x/2.52.x, validated against the Level-2/3 corpus; re-validate on bump); `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_NOSYSTEM=1`, `GIT_NO_REPLACE_OBJECTS=1`, `GIT_ATTR_SOURCE=4b825dc642cb6eb9a060e54bf8d69288fbee4904` (empty tree ⇒ no `.gitattributes` at all), `HOME` unset/empty. Explicit config: `merge.renameLimit=7000 diff.renameLimit=7000 merge.directoryRenames=conflict merge.renormalize=false core.autocrlf=false core.ignorecase=false merge.default=` (unset), no `merge.<x>.driver`, no `-X` options, `merge.conflictStyle` irrelevant.

**Steps.**
1. `git merge-base --all B H` → `bases[]`. If 0 bases (unrelated histories) → refuse. Record count.
2. `merge` and `squash`: `T = git merge-tree --write-tree [--quiet on ≥2.50] B H`. rc≠0 → **refuse** (record the conflict message list). rc=0 → EXPECTED_TREE = T.
   * Caveat probes (cheap, run only when the flag conditions could apply): (a) if `bases.length>1`, rerun with `--merge-base=<each base>`; any difference in rc or tree → flag `multi-base-sensitive`. (b) rerun with `--attr-source=B` and `--attr-source=H` only if either tree contains a `.gitattributes` blob; a differing tree → flag `attributes-would-change-result`. (c) if merge-tree emitted the `exhaustive rename detection was skipped` warning → refuse. (d) if any changed path is a gitlink on both sides → refuse (done by rc≠0 anyway with no submodule objects); if on one side → flag `gitlink-changed`. (e) if the merged tree has two entries that are equal case-insensitively → flag `case-collision`.
3. `rebase`: `commits = git rev-list --reverse --first-parent B..H`; if any has >1 parent → refuse (`merge-commit-in-range`). Iterate `cur=B`: `T_i = merge-tree --write-tree --merge-base=<c_i^> cur c_i`; rc≠0 → refuse; if `T_i == tree(cur)` → flag `become-empty:c_i` (originally-empty commits are simply skipped — GitHub documents dropping them; tree is unaffected either way); if `patch-id(c_i)` equals a patch-id in `H..B` → flag `patch-id-duplicate`; `cur = commit-tree T_i -p cur`. EXPECTED_TREE = tree(cur). Flags `become-empty`/`patch-id-duplicate` do not change the tree we compute, but they mark cases where GitHub's unpublished replay policy could produce a different tree, so they are "compute-with-caveat".
4. Queue groups: apply step 2 sequentially in the provider's entry order using `cur` = previous group commit's tree wrapped in a `commit-tree` with parents (prev, H_i); the expected tree for entry i is the tree at that step; compare with `merge_group.head_commit.tree_id` per entry.
5. Compare EXPECTED_TREE with PROVIDER_CANDIDATE_TREE and LANDED_TREE; emit the receipt.

**Outputs / receipt fields.** `expected_tree`, `rc`, `method`, `base_sha`, `head_sha`, `merge_bases[]`, `git_version`, `strategy: ort`, `strategy_options: []`, `config{…as above…}`, `attr_source: empty-tree`, `submodule_objects: absent`, `replace_refs: disabled`, `flags[]`, `conflict_paths[]` (when refused), `replay_steps[]` (rebase: commit, base, tree, empty?).

**"Expected tree not reconstructable" — exact list.**
1. `merge-tree` rc≠0 for (B,H) (any conflict class: content, binary, rename/rename, rename/delete, rename/add, add/add, distinct types, submodule, directory-rename `conflict`/`split`, file location).
2. Unrelated histories (no merge base).
3. Both sides change the same gitlink (always a conflict without submodule objects; GitHub also conflicts).
4. The "exhaustive rename detection was skipped" warning was emitted (result depends on an unpublished limit).
5. Rebase with a merge commit in `B..H` (first-parent walk finds a multi-parent commit).
6. Rebase whose replay conflicts at any commit (even though the merge is clean — 16b, 16d, 8b).
7. A `.gitattributes` entry naming a custom driver (`merge=<name>` not in {text, binary, union}) on a path changed on both sides — with the empty attribute source we compute the plain text merge, but GitHub's behaviour with its "own .gitattributes" is unpublished; treat as not reconstructable unless the plain merge is clean *and* identical under `--attr-source=B`.
8. The head SHA at merge time cannot be established exactly (e.g. a conflict-editor commit landed between evaluation and merge).

Compute-with-caveat (tree emitted, but the receipt says the provider may legitimately differ): `multi-base-sensitive`, `attributes-would-change-result`, `near-threshold-rename` (any detected rename with similarity < 60%, from `git diff -M50% --stat`-style scoring between base and each side), `become-empty`, `patch-id-duplicate`, `gitlink-changed`, `case-collision`.

## 19. Sources

| Source | URL | Date | Status | Confidence |
|---|---|---|---|---|
| git v2.43.0 `merge-ort.c` (detect_renames ignored; renameLimit default 7000) | https://raw.githubusercontent.com/git/git/v2.43.0/merge-ort.c | 2023-11 | fetched, read | high |
| git v2.43.0 `Documentation/config/merge.txt`, `config/attr.txt`, `git-merge-tree.txt`, `gitattributes.txt` | https://raw.githubusercontent.com/git/git/v2.43.0/Documentation/… | 2023-11 | fetched | high |
| git v2.44.0 `git-replay.txt`, `builtin/replay.c` | https://raw.githubusercontent.com/git/git/v2.44.0/… | 2024-02 | fetched, grepped (no empty/patch-id handling) | high |
| git RelNotes 2.38–2.55 | https://raw.githubusercontent.com/git/git/v2.55.0/Documentation/RelNotes/<v>.adoc (2.38 from v2.48.0 `.txt`) | 2022–2026 | fetched, grepped | high |
| GitHub docs "Pull request merges" + reusables `rebase_and_merge_summary.md`, `squash_and_merge_summary.md`, `rebase_and_merge_verification*.md` | https://raw.githubusercontent.com/github/docs/main/content/pull-requests/reference/pull-request-merges.md and data/reusables/pull_requests/ | fetched 2026-09-19 | current | high |
| GitHub docs "About merge methods on GitHub" | …/content/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github.md | 2026-09-19 | current | high |
| GitHub docs "Resolving a merge conflict on GitHub" | …/content/pull-requests/how-tos/merge-and-close-pull-requests/resolving-a-merge-conflict-on-github.md | 2026-09-19 | current | high |
| GitHub docs "Managing a merge queue" | …/content/repositories/…/managing-a-merge-queue.md | 2026-09-19 | current | high |
| GitHub docs webhook schema `pull_request.dequeued.reason` (`MERGE_CONFLICT`, `QUEUE_CLEARED`) | https://raw.githubusercontent.com/github/docs/main/src/webhooks/data/fpt/pull_request.json | 2026-09-19 | current | high |
| GitHub blog "Scaling merge-ort across GitHub" (Matt Cooper) — merges on ort since Sept 2022, rebases via `git replay` | https://github.blog/engineering/infrastructure/scaling-merge-ort-across-github/ | 2023-07-27 | blocked domain; content via search snippets and Git Rev News #101 citation | medium |
| GitHub changelog "Rebase commits now created using the merge-ort strategy" | https://github.blog/changelog/2023-06-27-rebase-commits-now-created-using-the-merge-ort-strategy/ | 2023-06-27 | blocked domain; title/date via search | medium |
| Community discussion #9288 "Support merge=union in .gitattributes" (support quote 2017-12-08; open through 2025-06) | https://github.com/orgs/community/discussions/9288 | 2017–2025 | fetched | high (that GitHub ignores user attributes); medium (still true post-ort) |
| Community discussion #168693 submodule fast-forward shown as conflict | https://github.com/orgs/community/discussions/168693 | 2025-08-04 | fetched; no staff reply | medium |
| libgit2 PR #3564 custom merge drivers/union | https://github.com/libgit2/libgit2/pull/3564 | merged 2016-03-17 | fetched | high |
| libgit2 `git_merge_options` (rename_threshold 50, FIND_RENAMES off by default) | https://libgit2.org/docs/reference/main/merge/git_merge_options.html | current | search snippet | medium |
| Community discussions #24299 / #21886 `mergeable_state` values | https://github.com/orgs/community/discussions/24299 | — | search snippet | medium (field undocumented) |
| Local experiments `exp01`–`exp16h` (git 2.43.0) | docs/research/sources/l3/git-wall/ | 2026-09-19 | run, hashes recorded above | high |

Not obtained: a newer git binary (so 2.44+ behaviours are cited, not re-run); GitHub's actual merge configuration (rename limit, directory-rename mode, its "own .gitattributes"); any GitHub statement on become-empty commits or patch-id duplicates during rebase-and-merge.
