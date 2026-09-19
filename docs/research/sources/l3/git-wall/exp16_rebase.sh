#!/bin/bash
# Experiment 16: rebase semantics vs merge
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
try_rebase() { git checkout -q -B rb "$1"; if git rebase -q "$2" >/dev/null 2>&1; then echo "rebase OK tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count $2..HEAD)"; else echo "rebase CONFLICT at: $(git status --short | head -3 | tr '\n' ' ')"; git rebase --abort; fi; }
echo "=== 16a revert-then-redo: PR commits A(change line 10), revert A, redo A'; main changes line 10 the same way as A' ==="
newrepo $W/r1 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-X/' f; c A; git revert --no-edit HEAD; sed -i 's/^10$/10-X/' f; c "A again"
git checkout -q main; sed -i 's/^10$/10-X/' f; c "main same change"
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1) rc=${PIPESTATUS[0]}"; try_rebase pr main
echo "=== 16b edit depending on base-side change: PR's first commit edits line 10 to 10-A, second edits 10-A to 10-B; main edits line 10 to 10-B as well ==="
newrepo $W/r2 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-A/' f; c c1; sed -i 's/^10-A$/10-B/' f; c c2
git checkout -q main; sed -i 's/^10$/10-B/' f; c "main 10-B"
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1) rc=${PIPESTATUS[0]}"; try_rebase pr main
echo "=== 16c rebase succeeds with DIFFERENT tree than merge: PR commit1 adds line 'X' after line 5; commit2 removes line 6 (which main ALSO removes) ... construct: PR: c1 deletes line 20; c2 re-adds line 20 identical to base. Net PR diff vs base = nothing on line 20. main deletes line 20. merge: base==pr on line 20, main deleted -> line 20 gone. rebase: c1 (delete 20) becomes empty on main -> dropped; c2 (add 20) applies cleanly?? -> line 20 present ==="
newrepo $W/r3 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i '/^20$/d' f; c "c1 del 20"; sed -i 's/^19$/19\n20/' f; c "c2 re-add 20"
git checkout -q main; sed -i '/^20$/d' f; c "main del 20"
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree: $MT rc=${PIPESTATUS[0]}; line20 present in merge? $(git cat-file -p $(git ls-tree $MT f|awk '{print $3}') | grep -c '^20$')"
try_rebase pr main; echo "line20 present after rebase? $(git show HEAD:f | grep -c '^20$')"; echo "rebase tree == merge tree? $( [ $(git rev-parse HEAD^{tree}) = $MT ] && echo yes || echo NO )"
echo "=== 16d same shape but with context so the re-add is a clean patch elsewhere: PR: c1 changes line 10 to 10-A; c2 changes it back to 10. main changes line 10 to 10-M. merge: pr side == base -> take 10-M cleanly. rebase: c1 conflicts (10-M vs 10-A) ==="
newrepo $W/r4 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-A/' f; c c1; sed -i 's/^10-A$/10/' f; c c2
git checkout -q main; sed -i 's/^10$/10-M/' f; c main
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1) rc=${PIPESTATUS[0]}"; try_rebase pr main
echo "=== 16e clean everywhere: rebase tree == merge tree (control) ==="
newrepo $W/r5 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^1$/1-p/' f; c c1; sed -i 's/^2$/2-p/' f; c c2
git checkout -q main; sed -i 's/^30$/30-m/' f; c main
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1)"; try_rebase pr main
echo "=== 16f rebase of PR that contains a merge commit from base, where the merge commit carried a manual (evil) change ==="
newrepo $W/r6 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^1$/1-p/' f; c c1
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
git checkout -q pr; git merge -q --no-edit main; sed -i 's/^15$/15-evil/' f; git commit -q --amend --no-edit -a
git checkout -q main; sed -i 's/^29$/29-m/' f; c main2
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree: $MT evil line present? $(git cat-file -p $(git ls-tree $MT f|awk '{print $3}') | grep -c evil)"
try_rebase pr main; echo "evil line present after rebase? $(git show HEAD:f | grep -c evil); rebase tree == merge tree? $( [ $(git rev-parse HEAD^{tree}) = $MT ] && echo yes || echo NO )"
echo "=== 16g cherry-pick-equivalent commits: PR contains commit identical to one already on main (patch-id equal) plus another; rebase drops it; trees equal ==="
newrepo $W/r7 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-S/' f; c shared; sed -i 's/^1$/1-p/' f; c c2
git checkout -q main; git cherry-pick -q pr~1 >/dev/null 2>&1 || git cherry-pick pr~1 >/dev/null; sed -i 's/^30$/30-m/' f; c main
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1)"; try_rebase pr main
