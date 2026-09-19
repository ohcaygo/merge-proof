#!/bin/bash
# Experiment 14: multi-PR queue ordering
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
# helper: sequentially merge list of heads onto base using merge-tree, committing each result; print final tree
seqmerge() { local cur=$1; shift; for h in "$@"; do out=$(git merge-tree --write-tree $cur $h 2>&1); rc=$?; t=$(echo "$out"|head -1); if [ $rc -ne 0 ]; then echo "CONFLICT at $h (tree $t)"; return 1; fi; cur=$(git commit-tree $t -p $cur -p $h -m "merge $h"); done; echo "final tree $(git rev-parse $cur^{tree})"; }
echo "=== 14a three PRs: A,B overlap (same hunk), C independent ==="
newrepo $W/q >/dev/null; seq 1 30 > f; echo c0 > g; c base
git checkout -q -b A; sed -i 's/^10$/10-A/' f; c A; git checkout -q main
git checkout -q -b B; sed -i 's/^10$/10-B/' f; c B; git checkout -q main
git checkout -q -b C; echo c1 > g; c C; git checkout -q main
for order in "A B C" "B A C" "C A B" "A C B"; do echo "order $order: $(seqmerge main $order)"; done
echo "=== 14b three non-overlapping PRs: all 6 orders give one tree ==="
newrepo $W/q2 >/dev/null; seq 1 30 > f; echo c0 > g; c base
git checkout -q -b A; sed -i 's/^1$/1-A/' f; c A; git checkout -q main
git checkout -q -b B; sed -i 's/^30$/30-B/' f; c B; git checkout -q main
git checkout -q -b C; echo c1 > g; c C; git checkout -q main
for order in "A B C" "A C B" "B A C" "B C A" "C A B" "C B A"; do echo "order $order: $(seqmerge main $order)"; done
echo "=== 14c PR1 renames f->h (+edit), PR2 edits f: both orders ==="
newrepo $W/q3 >/dev/null; seq 1 30 > f; c base
git checkout -q -b R; git mv f h; sed -i 's/^1$/1-R/' h; c R; git checkout -q main
git checkout -q -b E; sed -i 's/^30$/30-E/' f; c E; git checkout -q main
echo "order R E: $(seqmerge main R E)"; echo "order E R: $(seqmerge main E R)"
echo "=== 14d rename that falls below 50% similarity in one order but not the other ==="
# R renames f->h with heavy edit (similarity ~55% vs base); E rewrites many lines of f. After E lands, R's rename detection compares h vs f-as-in-E => lower similarity => not a rename => modify/delete conflict
newrepo $W/q4 >/dev/null; seq 1 20 > f; c base
git checkout -q -b R; git mv f h; for i in 1 2 3 4 5 6 7 8; do sed -i "s/^$i\$/${i}r/" h; done; c R; git checkout -q main
git checkout -q -b E; for i in 13 14 15 16 17 18 19 20; do sed -i "s/^$i\$/${i}e/" f; done; c E; git checkout -q main
echo "similarity base->R: $(git diff -M --summary main R)";
echo "order R E: $(seqmerge main R E)"; echo "order E R: $(seqmerge main E R)"
echo "=== 14e directory rename in PR1 + file added in old dir by PR2 ==="
newrepo $W/q5 >/dev/null; mkdir d; seq 1 5 > d/a; seq 1 5 > d/b; c base
git checkout -q -b R; git mv d e; c R; git checkout -q main
git checkout -q -b N; echo n > d/new; c N; git checkout -q main
echo "order R N: $(seqmerge main R N)"; echo "order N R: $(seqmerge main N R)"
echo "-- with merge.directoryRenames=true:"; git config merge.directoryRenames true; echo "order R N: $(seqmerge main R N)"; echo "order N R: $(seqmerge main N R)"
echo "-- with merge.directoryRenames=false:"; git config merge.directoryRenames false; echo "order R N: $(seqmerge main R N)"; echo "order N R: $(seqmerge main N R)"
