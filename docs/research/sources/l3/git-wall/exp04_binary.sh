#!/bin/bash
# Experiment 4: binary files
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 4a both sides modify a binary (NUL bytes) differently ==="
newrepo $W/b1 >/dev/null; printf 'a\0b\nc\n' > bin; c base
git checkout -q -b pr; printf 'a\0b\nd\n' > bin; c pr; git checkout -q main; printf 'a\0b\ne\n' > bin; c main
mt main pr; T=$(git merge-tree --write-tree main pr|head -1); lst $T; echo "-- blob left in tree:"; git cat-file -p $(git ls-tree $T bin | awk '{print $3}') | od -c | head -2
echo "=== 4b text file with -diff attribute (treated binary) - both sides edit different lines ==="
newrepo $W/b2 >/dev/null; seq 1 10 > t; echo 't -diff' > .gitattributes; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' t; c pr; git checkout -q main; sed -i 's/^10$/10m/' t; c main
mt main pr
echo "-- same, from a bare clone (no worktree/index):"; git clone -q --bare . $W/b2.git; cd $W/b2.git; mt main pr
echo "=== 4c text file with 'binary' attribute (=-diff -merge -text), edits on different lines ==="
newrepo $W/b3 >/dev/null; seq 1 10 > t; echo 't binary' > .gitattributes; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' t; c pr; git checkout -q main; sed -i 's/^10$/10m/' t; c main
mt main pr
echo "=== 4d binary edited on one side only ==="
newrepo $W/b4 >/dev/null; printf 'a\0b\nc\n' > bin; echo x > f; c base
git checkout -q -b pr; printf 'a\0b\nd\n' > bin; c pr; git checkout -q main; echo y > f; c main
mt main pr
echo "=== 4e both sides make identical binary change ==="
newrepo $W/b5 >/dev/null; printf 'a\0b\nc\n' > bin; c base
git checkout -q -b pr; printf 'a\0b\nd\n' > bin; c pr; git checkout -q main; printf 'a\0b\nd\n' > bin; c main
mt main pr
