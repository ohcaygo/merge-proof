#!/bin/bash
# Experiment 1: renames under ort via merge-tree --write-tree
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
seq 1 40 > /dev/null
echo "=== 1a rename+edit on one side, edit on other (classic rename detection) ==="
newrepo $W/r1a >/dev/null
seq 1 40 > a.txt; c base
git checkout -q -b pr; git mv a.txt b.txt; sed -i 's/^40$/40x/' b.txt; c "rename+edit"
git checkout -q main; sed -i 's/^1$/1y/' a.txt; c "edit base"
mt main pr; mt main pr -X find-renames=100%  ; mt main pr -X no-renames
echo "=== 1b rename on both sides to different names (rename/rename 1to2) ==="
newrepo $W/r1b >/dev/null
seq 1 40 > a.txt; c base
git checkout -q -b pr; git mv a.txt b.txt; c "ren b"
git checkout -q main; git mv a.txt c.txt; c "ren c"
mt main pr
echo "=== 1c rename/delete ==="
newrepo $W/r1c >/dev/null
seq 1 40 > a.txt; c base
git checkout -q -b pr; git mv a.txt b.txt; sed -i 's/^2$/2z/' b.txt; c "ren b"
git checkout -q main; git rm -q a.txt; c "del a"
mt main pr
echo "=== 1d rename/add: pr renames a->b, main adds new b ==="
newrepo $W/r1d >/dev/null
seq 1 40 > a.txt; c base
git checkout -q -b pr; git mv a.txt b.txt; c "ren b"
git checkout -q main; echo other > b.txt; c "add b"
mt main pr
echo "=== 1e rename threshold: 60% similar edit + rename; default 50% vs find-renames=70% ==="
newrepo $W/r1e >/dev/null
seq 1 20 > a.txt; c base
git checkout -q -b pr; git mv a.txt b.txt; for i in 1 2 3 4 5 6 7 8; do sed -i "s/^$i\$/${i}q/" b.txt; done; c "ren+40%edit"
git checkout -q main; sed -i 's/^20$/20y/' a.txt; c "edit base"
git diff -M --stat main pr | tail -1; git diff -M --summary main pr
mt main pr; mt main pr -X find-renames=70%
echo "=== 1f directory rename: pr renames dir d/->e/, main adds d/new.txt ==="
newrepo $W/r1f >/dev/null
mkdir d; seq 1 10 > d/one; seq 1 10 > d/two; c base
git checkout -q -b pr; git mv d e; c "dir rename"
git checkout -q main; echo new > d/new.txt; c "add in old dir"
mt main pr; mt main pr -X no-renames
git -c merge.directoryRenames=false merge-tree --write-tree main pr; echo "(merge.directoryRenames=false rc=$?)"
git -c merge.directoryRenames=true merge-tree --write-tree main pr; echo "(merge.directoryRenames=true rc=$?)"
echo "=== 1g directory rename conflict: pr renames d/->e/ partially (split), main adds d/new ==="
newrepo $W/r1g >/dev/null
mkdir d; seq 1 10 > d/one; seq 1 10 > d/two; seq 1 10 > d/three; c base
git checkout -q -b pr; git mv d/one e/one; git mv d/two f/two; git mv d/three e/three; c "split dir"
git checkout -q main; echo new > d/new.txt; c "add in old dir"
mt main pr
echo "=== 1h renameLimit: many files, limit low => rename detection skipped ==="
newrepo $W/r1h >/dev/null
for i in $(seq 1 30); do seq 1 50 | sed "s/^/$i-/" > f$i.txt; done; c base
git checkout -q -b pr; for i in $(seq 1 30); do git mv f$i.txt g$i.txt; sed -i 's/^\(.*\)-50$/\1-50x/' g$i.txt; done; c "ren all"
git checkout -q main; for i in $(seq 1 30); do sed -i 's/^\(.*\)-1$/\1-1y/' f$i.txt; done; c "edit all"
echo "-- renameLimit=9999"; mt main pr | head -3
echo "-- renameLimit=5 (merge.renameLimit)"; git -c merge.renameLimit=5 merge-tree --write-tree main pr | head -8; echo rc=$?
echo "-- renameLimit=5 (diff.renameLimit only)"; git -c merge.renameLimit= -c diff.renameLimit=5 merge-tree --write-tree main pr | head -3
echo "-- exhaustive-ish: default limits unset"; git -c merge.renameLimit= merge-tree --write-tree main pr | head -3
