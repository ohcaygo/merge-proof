#!/bin/bash
# Experiment 7c: criss-cross where merge-base choice changes clean/conflict outcome
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/z >/dev/null
seq 1 30 > f; c base; B=$(git rev-parse HEAD)
git checkout -q -b pr; sed -i 's/^10$/10-X/' f; c "pr1: 10-X"; P1=$(git rev-parse HEAD)
git checkout -q main; sed -i 's/^10$/10-Y/' f; c "main1: 10-Y"; M1=$(git rev-parse HEAD)
git checkout -q pr; git merge --no-edit main >/dev/null 2>&1; git checkout -q $P1 -- f; c "pr2 = merge main, resolved to 10-X"; P2=$(git rev-parse HEAD)
git checkout -q main; git merge --no-edit $P1 >/dev/null 2>&1; git checkout -q $P1 -- f; c "main2 = merge pr1, resolved to 10-X"; M2=$(git rev-parse HEAD)
git checkout -q pr; sed -i 's/^10-X$/10-Z/' f; c "pr3: 10-X -> 10-Z"; P3=$(git rev-parse HEAD)
echo "merge bases: $(git merge-base --all main pr | tr '\n' ' ') (P1=$P1 M1=$M1)"
echo "-- default (virtual base):"; mt main pr | head -8
echo "-- --merge-base=P1 ($P1):"; git merge-tree --write-tree --merge-base=$P1 main pr | head -3; echo "rc=${PIPESTATUS[0]}"
echo "-- --merge-base=M1 ($M1):"; git merge-tree --write-tree --merge-base=$M1 main pr | head -3; echo "rc=${PIPESTATUS[0]}"
echo "-- real git merge (ort default):"; git checkout -q -b real main; git merge --no-edit pr >/dev/null 2>&1 && echo "clean tree=$(git rev-parse HEAD^{tree})" || { echo "CONFLICT"; git merge --abort; }
echo "-- real git merge -s resolve (single base picked by resolve):"; git checkout -q -B real2 main; git merge -s resolve --no-edit pr >/dev/null 2>&1 && echo "clean tree=$(git rev-parse HEAD^{tree})" || { echo "CONFLICT"; git merge --abort; }
