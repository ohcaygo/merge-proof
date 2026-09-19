#!/bin/bash
# Experiment 6: case-only path collisions
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 6a pr adds README.md, main adds readme.md ==="
newrepo $W/c1 >/dev/null; echo x > f; c base
git checkout -q -b pr; echo A > README.md; c pr; git checkout -q main; echo b > readme.md; c main
mt main pr; T=$(git merge-tree --write-tree main pr|head -1); lst $T
echo "-- core.ignorecase=true (simulating case-insensitive FS config):"; git -c core.ignorecase=true merge-tree --write-tree main pr | head -3; echo rc=$?
echo "=== 6b pr renames a.txt -> A.txt; main edits a.txt ==="
newrepo $W/c2 >/dev/null; seq 1 20 > a.txt; c base
git checkout -q -b pr; git mv a.txt A.txt; c pr; git checkout -q main; sed -i 's/^20$/20m/' a.txt; c main
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 6c pr renames dir src -> Src; main adds src/new ==="
newrepo $W/c3 >/dev/null; mkdir src; seq 1 5 > src/a; seq 1 5 > src/b; c base
git checkout -q -b pr; git mv src Src; c pr; git checkout -q main; echo n > src/new; c main
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 6d tree with both A and a already in base (created on Linux); pr edits A, main edits a ==="
newrepo $W/c4 >/dev/null; echo 1 > A; echo 2 > a; c base
git checkout -q -b pr; echo 1x > A; c pr; git checkout -q main; echo 2y > a; c main
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
