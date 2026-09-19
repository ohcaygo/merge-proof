#!/bin/bash
# Experiment 2: file modes, symlinks
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 2a mode-only change on pr (644->755), content edit on main ==="
newrepo $W/r2a >/dev/null; seq 1 10 > s.sh; c base
git checkout -q -b pr; chmod +x s.sh; c "chmod"; git checkout -q main; sed -i 's/^1$/1y/' s.sh; c edit
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 2b mode conflict: pr 644->755, main 644->755 too (same) ==="
newrepo $W/r2b >/dev/null; seq 1 10 > s.sh; c base
git checkout -q -b pr; chmod +x s.sh; c "chmod"; git checkout -q main; chmod +x s.sh; sed -i 's/^1$/1y/' s.sh; c "chmod+edit"
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 2c mode conflict: pr 644->755, main 755->644 from a 755 base? no: base 644, pr->755, main stays; edit both sides diff hunks ==="
newrepo $W/r2c >/dev/null; seq 1 10 > s.sh; chmod +x s.sh; c base
git checkout -q -b pr; chmod -x s.sh; c "chmod -x"; git checkout -q main; chmod +x s.sh; sed -i 's/^1$/1y/' s.sh; c "edit"
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 2d true mode conflict: base 644; pr: 755 + edit line10; main: 644 + edit line1; vs base 755 pr->644 main->644?? (both change to same => fine). Conflict requires both changing mode differently: impossible w/ only 2 modes unless base differs. Test: base 100644, pr->100755, main-> symlink ==="
newrepo $W/r2d >/dev/null; seq 1 10 > s.sh; c base
git checkout -q -b pr; chmod +x s.sh; c "chmod"; git checkout -q main; rm s.sh; ln -s target s.sh; c "to symlink"
mt main pr
echo "=== 2e symlink target changes on both sides (different) ==="
newrepo $W/r2e >/dev/null; ln -s t1 l; c base
git checkout -q -b pr; rm l; ln -s t2 l; c "t2"; git checkout -q main; rm l; ln -s t3 l; c "t3"
mt main pr
echo "=== 2f symlink target changed on pr only; main edits unrelated ==="
newrepo $W/r2f >/dev/null; ln -s t1 l; echo x > f; c base
git checkout -q -b pr; rm l; ln -s t2 l; c "t2"; git checkout -q main; echo y > f; c "f"
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 2g symlink vs regular file: pr replaces symlink with regular file of same content as target; main changes symlink target ==="
newrepo $W/r2g >/dev/null; ln -s t1 l; c base
git checkout -q -b pr; rm l; echo t1 > l; c "regular"; git checkout -q main; rm l; ln -s t3 l; c "t3"
mt main pr
echo "=== 2h symlink content merge: pr changes symlink target, main changes same symlink target identically ==="
newrepo $W/r2h >/dev/null; ln -s t1 l; c base
git checkout -q -b pr; rm l; ln -s t2 l; c "t2"; git checkout -q main; rm l; ln -s t2 l; c "t2 also"
mt main pr
echo "=== 2i core.fileMode / core.symlinks config does not affect merge-tree (bare-ish tree ops): run with core.fileMode=false ==="
cd $W/r2a; git -c core.fileMode=false merge-tree --write-tree main pr | head -1
