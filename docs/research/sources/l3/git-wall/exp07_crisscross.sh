#!/bin/bash
# Experiment 7: criss-cross merge (multiple merge bases)
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/x >/dev/null
seq 1 30 > f; c base; B0=$(git rev-parse HEAD)
git checkout -q -b pr; sed -i 's/^10$/10-pr/' f; c "pr1"; P1=$(git rev-parse HEAD)
git checkout -q main; sed -i 's/^20$/20-main/' f; c "main1"; M1=$(git rev-parse HEAD)
# criss-cross: each side merges the other, then continues with different resolutions of the SAME hunk
git checkout -q pr; git merge -q --no-edit main >/dev/null 2>&1; sed -i 's/^15$/15-pr-after/' f; c "pr2"; P2=$(git rev-parse HEAD)
git checkout -q main; git merge -q --no-edit $P1 >/dev/null 2>&1; sed -i 's/^15$/15-main-after/' f; c "main2"; M2=$(git rev-parse HEAD)
echo "merge bases: $(git merge-base --all main pr | tr '\n' ' ') (count $(git merge-base --all main pr | wc -l))"
echo "-- default (recursive virtual base):"; mt main pr | head -8
for mb in $(git merge-base --all main pr); do echo "-- --merge-base=$mb:"; git merge-tree --write-tree --merge-base=$mb main pr | head -8; echo rc=${PIPESTATUS[0]}; done
echo "=== 7b criss-cross where the virtual base makes a clean merge that a single base would conflict on ==="
newrepo $W/y >/dev/null
seq 1 30 > f; c base
git checkout -q -b pr; sed -i 's/^10$/10-X/' f; c "pr1"; P1=$(git rev-parse HEAD)
git checkout -q main; sed -i 's/^10$/10-Y/' f; c "main1"; M1=$(git rev-parse HEAD)
# both sides resolve the conflict the same way (choose 10-X), forming a criss-cross
git checkout -q pr; git merge --no-edit main >/dev/null 2>&1; sed -i 's/^<<<<<<<.*//;s/^=======//;s/^>>>>>>>.*//;/^10-Y$/d;/^$/d' f; c "pr merge main -> X"; P2=$(git rev-parse HEAD)
git checkout -q main; git merge --no-edit $P1 >/dev/null 2>&1; sed -i 's/^<<<<<<<.*//;s/^=======//;s/^>>>>>>>.*//;/^10-Y$/d;/^$/d' f; c "main merge pr -> X"; M2=$(git rev-parse HEAD)
git checkout -q pr; sed -i 's/^1$/1-pr/' f; c pr3; git checkout -q main; sed -i 's/^30$/30-main/' f; c main3
echo "merge bases: $(git merge-base --all main pr | tr '\n' ' ')"
echo "-- default:"; mt main pr | head -4
for mb in $(git merge-base --all main pr); do echo "-- --merge-base=$mb:"; git merge-tree --write-tree --merge-base=$mb main pr | head -6; done
echo "-- --merge-base=<tree of the virtual base is not addressable>; --merge-base with original root $(git rev-list --max-parents=0 HEAD):"; git merge-tree --write-tree --merge-base=$(git rev-list --max-parents=0 HEAD) main pr | head -6
