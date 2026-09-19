#!/bin/bash
# Experiment 16h: predict rebase by replaying first-parent commits with merge-tree --merge-base=<parent>
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
replay() { # replay <base> <head>; prints tree or CONFLICT/flags
  local cur=$1 flags=""; for cmt in $(git rev-list --reverse --first-parent $1..$2); do
    if [ $(git rev-list --parents -n1 $cmt | wc -w) -gt 2 ]; then echo "REFUSE: merge commit $cmt in range"; return 2; fi
    par=$(git rev-parse $cmt^); out=$(git merge-tree --write-tree --merge-base=$par $cur $cmt 2>&1); rc=$?; t=$(echo "$out"|head -1)
    [ $rc -ne 0 ] && { echo "CONFLICT at $cmt"; return 1; }
    [ "$t" = "$(git rev-parse $cur^{tree})" ] && flags="$flags become-empty:$cmt"
    cur=$(git commit-tree $t -p $cur -m replay); done; echo "tree $(git rev-parse $cur^{tree}) flags[$flags]"; }
mk() { newrepo $W/$1 >/dev/null; seq 1 30 > f; c base; }
echo "== 16e-shape (clean)"; mk a; git checkout -q -b pr; sed -i 's/^1$/1-p/' f; c c1; sed -i 's/^2$/2-p/' f; c c2; git checkout -q main; sed -i 's/^30$/30-m/' f; c main
echo "replay: $(replay main pr)"; git checkout -q -B rb pr; git rebase -q main >/dev/null 2>&1; echo "git rebase tree $(git rev-parse HEAD^{tree})"
echo "== 16c-shape (become-empty)"; mk b; git checkout -q -b pr; sed -i '/^20$/d' f; c c1; sed -i 's/^19$/19\n20/' f; c c2; git checkout -q main; sed -i '/^20$/d' f; c main
echo "replay: $(replay main pr)"; git checkout -q -B rb pr; git rebase -q main >/dev/null 2>&1; echo "git rebase tree $(git rev-parse HEAD^{tree})"; echo "merge-tree $(git merge-tree --write-tree main pr|head -1)"
echo "== 16b-shape (conflict)"; mk d; git checkout -q -b pr; sed -i 's/^10$/10-A/' f; c c1; sed -i 's/^10-A$/10-B/' f; c c2; git checkout -q main; sed -i 's/^10$/10-B/' f; c main
echo "replay: $(replay main pr)"
echo "== 8a-shape (merge commit in PR)"; mk e; git checkout -q -b pr; sed -i 's/^1$/1-p/' f; c c1; git checkout -q main; sed -i 's/^30$/30-m/' f; c main; git checkout -q pr; git merge -q --no-edit main; sed -i 's/^2$/2-p/' f; c c2
echo "replay: $(replay main pr)"
