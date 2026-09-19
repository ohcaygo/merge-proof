#!/bin/bash
# Experiment 12: LFS pointers, signed commits, sparse checkout, subtree: tree determinism
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 12a LFS pointer files are ordinary blobs; both sides change pointer differently -> textual conflict; one side -> clean ==="
newrepo $W/l >/dev/null
printf 'version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize 10\n' aaaa > big.bin; echo '*.bin filter=lfs diff=lfs merge=lfs -text' > .gitattributes; c base
git checkout -q -b pr; printf 'version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize 11\n' bbbb > big.bin; c pr
git checkout -q main; echo x > other; c main
mt main pr | head -2
echo "-- both sides change pointer (merge=lfs driver is NOT configured here):"; git checkout -q main; printf 'version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize 12\n' cccc > big.bin; c main2; mt main pr | head -6
echo "-- with git-lfs-style driver configured to 'false' (unavailable):"; git -c merge.lfs.driver=false merge-tree --write-tree main pr | head -1
echo "=== 12b sparse-checkout does not affect merge-tree ==="
newrepo $W/s >/dev/null; mkdir a b; echo 1 > a/x; echo 1 > b/y; c base
git checkout -q -b pr; echo 2 > a/x; c pr; git checkout -q main; echo 2 > b/y; c main
T1=$(git merge-tree --write-tree main pr | head -1); git sparse-checkout set --cone a >/dev/null 2>&1; T2=$(git merge-tree --write-tree main pr | head -1); echo "full=$T1 sparse=$T2"; git sparse-checkout disable
echo "=== 12c signed commits: signature is commit metadata; tree unaffected (compare tree of a signed vs unsigned commit with same tree) ==="
cd $W/s; git checkout -q main; T=$(git rev-parse HEAD^{tree}); echo "tree $T"; C2=$(git commit-tree $T -p HEAD -m "same tree, different commit"); echo "commit-tree gives commit $C2 with tree $(git rev-parse $C2^{tree})"; echo "(gpgsig header only changes the commit object id, never the tree id: a 'tree' line is identical in both)"
echo "=== 12d subtree: prefix directory content merges like any directory; -Xsubtree changes result ==="
newrepo $W/t >/dev/null; mkdir lib; seq 1 10 > lib/f; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' lib/f; c pr; git checkout -q main; sed -i 's/^10$/10m/' lib/f; c main
echo "default: $(git merge-tree --write-tree main pr | head -1)"; echo "-X subtree=lib: $(git merge-tree --write-tree -X subtree=lib main pr 2>&1 | head -1)"
