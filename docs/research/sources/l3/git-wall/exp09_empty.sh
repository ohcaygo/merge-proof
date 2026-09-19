#!/bin/bash
# Experiment 9: empty commits and commits that become empty
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/e >/dev/null
seq 1 30 > f; c base
git checkout -q -b pr; c "empty-from-start"; sed -i 's/^1$/1-pr/' f; c pr1; sed -i 's/^30$/30-m/' f; c "pr2 (same change main will make)"; sed -i 's/^2$/2-pr/' f; c pr3
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
echo "merge-tree = $(git merge-tree --write-tree main pr | head -1)"
git checkout -q -b sq main; git merge -q --squash pr >/dev/null; git commit -q -m s; echo "squash     = $(git rev-parse HEAD^{tree})"
for opt in "" "--empty=drop" "--empty=keep" "--keep-empty" "--no-keep-empty"; do git checkout -q -B rb pr; git rebase -q $opt main >/dev/null 2>&1; echo "rebase $opt: tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD) [$(git log --format=%s main..HEAD | tr '\n' ';')]"; done
echo "=== 9b: PR that is entirely already-applied (all commits become empty) ==="
git checkout -q -b pr2 main~1 2>/dev/null || git checkout -q -b pr2 $(git rev-parse main^); sed -i 's/^30$/30-m/' f; c "same as main1"
echo "merge-tree(main,pr2) = $(git merge-tree --write-tree main pr2 | head -1); main tree = $(git rev-parse main^{tree})"
git checkout -q -B rb pr2; git rebase -q main >/dev/null 2>&1; echo "rebase: tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD)"
git checkout -q -b sq2 main; git merge -q --squash pr2 >/dev/null; git commit -q -m s 2>&1 | head -1; echo "squash commit (nothing to commit) tree=$(git rev-parse HEAD^{tree})"
