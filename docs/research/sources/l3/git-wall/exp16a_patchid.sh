#!/bin/bash
# Experiment 16a': confirm rebase drops the "redo" commit because its patch-id matches an upstream commit
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/r1 >/dev/null; seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-X/' f; c A; git revert --no-edit HEAD >/dev/null; sed -i 's/^10$/10-X/' f; c "A again"
git checkout -q main; sed -i 's/^10$/10-X/' f; c "main same change"
echo "merge-tree: $(git merge-tree --write-tree main pr | head -1)"
echo "pr head tree: $(git rev-parse pr^{tree})   base+main tree: $(git rev-parse main^{tree})"
git checkout -q -B rb pr; git rebase -q main >/dev/null 2>&1; echo "rebase default:              tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD) [$(git log --format=%s main..HEAD | tr '\n' ';')]"
git checkout -q -B rb pr; git rebase -q --reapply-cherry-picks main >/dev/null 2>&1; echo "rebase --reapply-cherry-picks: tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD) [$(git log --format=%s main..HEAD | tr '\n' ';')]"
git checkout -q -B rb pr; git rebase -q --reapply-cherry-picks --empty=keep main >/dev/null 2>&1; echo "rebase --reapply-cherry-picks --empty=keep: tree=$(git rev-parse HEAD^{tree}) commits=$(git rev-list --count main..HEAD)"
echo "git replay available? $(git replay -h 2>&1 | head -1)"
