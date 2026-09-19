#!/bin/bash
# Experiment 15: squash semantics
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 15a PR reverted part of its own history; squash tree == merge-tree ==="
newrepo $W/s >/dev/null; seq 1 30 > f; echo a > g; c base
git checkout -q -b pr; sed -i 's/^1$/1-pr/' f; c pr1; echo b > g; c pr2; git revert --no-edit HEAD; sed -i 's/^2$/2-pr/' f; c pr3
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
MT=$(git merge-tree --write-tree main pr | head -1); git checkout -q -b sq main; git merge -q --squash pr >/dev/null; git commit -q -m s; echo "merge-tree=$MT squash=$(git rev-parse HEAD^{tree})"
git checkout -q -b rb pr; git rebase -q main >/dev/null 2>&1 && echo "rebase=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD)" || { echo rebase CONFLICT; git rebase --abort; }
echo "=== 15b head contains base (PR merged base into itself last; base has no new commits): squash tree == head tree == merge-tree ==="
newrepo $W/s2 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^1$/1-pr/' f; c pr1
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
git checkout -q pr; git merge -q --no-edit main;
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree=$MT head tree=$(git rev-parse pr^{tree})"
git checkout -q -b sq main; git merge -q --squash pr >/dev/null; git commit -q -m s; echo "squash=$(git rev-parse HEAD^{tree})"
git checkout -q -b mg main; git merge -q --no-edit pr; echo "merge (ff) tree=$(git rev-parse HEAD^{tree}) commit==pr? $( [ $(git rev-parse HEAD) = $(git rev-parse pr) ] && echo yes || echo no )"; git checkout -q -b mgnoff main; git merge -q --no-ff --no-edit pr; echo "merge --no-ff tree=$(git rev-parse HEAD^{tree})"
echo "=== 15c PR whose net diff is empty (revert everything): squash yields base tree ==="
newrepo $W/s3 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^1$/1-pr/' f; c pr1; git revert --no-edit HEAD
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree=$MT main tree=$(git rev-parse main^{tree})"
