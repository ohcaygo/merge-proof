#!/bin/bash
# Experiment 8: merge commits inside the PR branch; squash and rebase of such PRs
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/m >/dev/null
seq 1 30 > f; echo a > g; c base
git checkout -q -b pr; sed -i 's/^1$/1-pr/' f; c pr1
git checkout -q main; sed -i 's/^30$/30-m/' f; c main1
git checkout -q pr; git merge -q --no-edit main; sed -i 's/^2$/2-pr/' f; c pr2
git checkout -q main; echo b > g; c main2
git checkout -q pr; git merge -q --no-edit main; sed -i 's/^3$/3-pr/' f; c pr3
git checkout -q main; sed -i 's/^29$/29-m/' f; c main3
echo "PR history:"; git log --oneline --graph pr | head -12
echo "merge bases pr..main: $(git merge-base --all main pr)"
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree(main,pr) = $MT"
# real merge
git checkout -q -b mergeit main; git merge -q --no-edit pr; echo "real merge tree = $(git rev-parse HEAD^{tree})"
# squash
git checkout -q -b squashit main; git merge -q --squash pr >/dev/null; git commit -q -m squash; echo "squash tree     = $(git rev-parse HEAD^{tree})"
# rebase (default drops merges)
git checkout -q -b rebaseit pr; git rebase -q main >/dev/null 2>&1 && echo "rebase tree     = $(git rev-parse HEAD^{tree}) (commits: $(git rev-list --count main..HEAD))" || { echo "rebase CONFLICT"; git rebase --abort; }
git checkout -q -b rebasem pr; git rebase -q --rebase-merges main >/dev/null 2>&1 && echo "rebase-merges tree= $(git rev-parse HEAD^{tree}) (commits: $(git rev-list --count main..HEAD))" || { echo "rebase --rebase-merges CONFLICT"; git rebase --abort; }
echo "=== 8b PR whose merge-from-base resolved a conflict manually (resolution differs from what ort would do) ==="
newrepo $W/m2 >/dev/null
seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-pr/' f; c pr1
git checkout -q main; sed -i 's/^10$/10-main/' f; c main1
git checkout -q pr; git merge --no-edit main >/dev/null 2>&1; sed -i 's/^<<<<<<<.*//;s/^=======//;s/^>>>>>>>.*//;/^10-main$/d;/^$/d;s/^10-pr$/10-resolved/' f; c "merge main into pr (resolved)"
git checkout -q main; sed -i 's/^30$/30-m/' f; c main2
MT=$(git merge-tree --write-tree main pr | head -1); echo "merge-tree(main,pr) = $MT"
git checkout -q -b squashit main; git merge -q --squash pr >/dev/null; git commit -q -m squash; echo "squash tree     = $(git rev-parse HEAD^{tree})"
git checkout -q -b mergeit main; git merge -q --no-edit pr; echo "real merge tree = $(git rev-parse HEAD^{tree})"
git checkout -q -b rebaseit pr; git rebase -q main >/dev/null 2>&1 && echo "rebase tree     = $(git rev-parse HEAD^{tree})" || { echo "rebase CONFLICT (linearising drops the manual resolution; pr1 hunk conflicts with main1)"; git rebase --abort; }
git checkout -q -b rebasem pr; git rebase -q --rebase-merges main >/dev/null 2>&1 && echo "rebase-merges tree= $(git rev-parse HEAD^{tree})" || { echo "rebase --rebase-merges CONFLICT"; git rebase --abort; }
