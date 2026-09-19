#!/bin/bash
# Experiment 1g/1i: directory rename split (ambiguous) and dir-rename with file edit on other side
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 1g split dir rename d/ -> e/ (2 files) and f/ (1 file); main adds d/new.txt ==="
newrepo $W/r1g >/dev/null
mkdir d; seq 1 10 > d/one; seq 11 20 > d/two; seq 21 30 > d/three; c base
git checkout -q -b pr; mkdir e f; git mv d/one e/one; git mv d/two f/two; git mv d/three e/three; c "split dir"
git checkout -q main; echo new > d/new.txt; c "add in old dir"
mt main pr; lst $(git merge-tree --write-tree main pr | head -1)
echo "=== 1i even split (1 to e/, 1 to f/): ambiguous, no dir rename ==="
newrepo $W/r1i >/dev/null
mkdir d; seq 1 10 > d/one; seq 11 20 > d/two; c base
git checkout -q -b pr; mkdir e f; git mv d/one e/one; git mv d/two f/two; c "split dir"
git checkout -q main; echo new > d/new.txt; c "add in old dir"
mt main pr; lst $(git merge-tree --write-tree main pr | head -1)
echo "=== 1j dir rename on pr, main EDITS d/one (not adds): plain rename detection moves edit ==="
newrepo $W/r1j >/dev/null
mkdir d; seq 1 10 > d/one; seq 11 20 > d/two; c base
git checkout -q -b pr; git mv d e; c "dir rename"
git checkout -q main; sed -i 's/^1$/1y/' d/one; c "edit"
mt main pr; lst $(git merge-tree --write-tree main pr | head -1)
echo "=== 1k rename limit default: >7000 files renamed => detection skipped => modify/delete conflicts. Build 7100 files ==="
newrepo $W/r1k >/dev/null
mkdir d; for i in $(seq 1 7100); do printf 'line1-%s\nline2\nline3\nline4\nline5\nline6\n' $i > d/f$i; done; c base
git checkout -q -b pr; git mv d e; for i in $(seq 1 7100); do sed -i 's/^line6$/line6x/' e/f$i; done; c "ren all + edit"
git checkout -q main; for i in $(seq 1 7100); do sed -i 's/^line2$/line2y/' d/f$i; done; c "edit all"
git config --unset merge.renameLimit
echo "-- default limit (7000): "; git merge-tree --write-tree main pr 2>&1 | head -3; echo rc=${PIPESTATUS[0]}
echo "-- merge.renameLimit=8000: "; git -c merge.renameLimit=8000 merge-tree --write-tree main pr 2>&1 | head -2; echo rc=${PIPESTATUS[0]}
echo "-- diff.renameLimit=8000 (fallback): "; git -c diff.renameLimit=8000 merge-tree --write-tree main pr 2>&1 | head -2
echo "-- diff.renameLimit=8000 and merge.renameLimit=10 : "; git -c diff.renameLimit=8000 -c merge.renameLimit=10 merge-tree --write-tree main pr 2>&1 | head -2
