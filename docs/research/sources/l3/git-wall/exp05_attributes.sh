#!/bin/bash
# Experiment 5: .gitattributes handling by merge-tree (union/ours/custom driver, text/eol, attr source, bare repos)
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
echo "=== 5a merge=union in .gitattributes committed in base; both sides append to same region ==="
newrepo $W/a1 >/dev/null; printf 'l1\nl2\n' > list; echo 'list merge=union' > .gitattributes; c base
git checkout -q -b pr; printf 'l1\nl2\npr\n' > list; c pr; git checkout -q main; printf 'l1\nl2\nmain\n' > list; c main
echo "-- worktree at main (has .gitattributes):"; mt main pr; T=$(git merge-tree --write-tree main pr|head -1); git cat-file -p $(git ls-tree $T list|awk '{print $3}') | tr '\n' '|'; echo
echo "-- bare clone:"; git clone -q --bare . $W/a1.git; (cd $W/a1.git; mt main pr)
echo "-- bare clone with attr.tree=HEAD:"; (cd $W/a1.git; git -c attr.tree=HEAD merge-tree --write-tree main pr | head -1; echo rc=$?)
echo "-- bare clone with --attr-source=main:"; (cd $W/a1.git; git --attr-source=main merge-tree --write-tree main pr | head -1; echo rc=$?)
echo "-- worktree but .gitattributes deleted from worktree (index still has it):"; rm .gitattributes; mt main pr | head -2; git checkout -q -- .gitattributes
echo "-- worktree checked out at a commit WITHOUT the attribute (detached at base minus attr):"
git checkout -q --detach main; git rm -q --cached .gitattributes; rm .gitattributes; git commit -q -m "noattr"; NA=$(git rev-parse HEAD)
mt main pr | head -2; echo "(index/worktree now lack the attribute -> conflict expected if attrs read from worktree)"
echo "-- same state but --attr-source=main:"; git --attr-source=main merge-tree --write-tree main pr | head -1; echo rc=$?
echo "-- same state but GIT_ATTR_SOURCE=main:"; GIT_ATTR_SOURCE=main git merge-tree --write-tree main pr | head -1; echo rc=$?
echo "=== 5b .gitattributes added by the PR itself (merge=union only on pr side); worktree at main ==="
newrepo $W/a2 >/dev/null; printf 'l1\nl2\n' > list; c base
git checkout -q -b pr; printf 'l1\nl2\npr\n' > list; echo 'list merge=union' > .gitattributes; c pr; git checkout -q main; printf 'l1\nl2\nmain\n' > list; c main
echo "-- worktree at main:"; mt main pr | head -2
echo "-- --attr-source=pr:"; git --attr-source=pr merge-tree --write-tree main pr | head -1; echo rc=$?
echo "-- worktree at pr:"; git checkout -q pr; mt main pr | head -2; git checkout -q main
echo "=== 5c merge=ours ==="
newrepo $W/a3 >/dev/null; printf 'l1\nl2\n' > list; echo 'list merge=ours' > .gitattributes; c base
git checkout -q -b pr; printf 'l1\nl2\npr\n' > list; c pr; git checkout -q main; printf 'l1\nl2\nmain\n' > list; c main
mt main pr; T=$(git merge-tree --write-tree main pr|head -1); git cat-file -p $(git ls-tree $T list|awk '{print $3}') | tr '\n' '|'; echo " <- 'ours'= branch1 (main) side"
echo "-- reversed operand order (pr, main):"; T=$(git merge-tree --write-tree pr main|head -1); echo $T; git cat-file -p $(git ls-tree $T list|awk '{print $3}') | tr '\n' '|'; echo
echo "=== 5d custom driver merge=foo with NO merge.foo.driver config ==="
newrepo $W/a4 >/dev/null; printf 'l1\nl2\n' > list; echo 'list merge=foo' > .gitattributes; c base
git checkout -q -b pr; printf 'l1\nl2\npr\n' > list; c pr; git checkout -q main; printf 'l1\nl2\nmain\n' > list; c main
mt main pr | head -6
echo "-- with driver configured as 'true' (always succeeds, leaves %A = ours):"
git -c merge.foo.driver='true' merge-tree --write-tree main pr | head -3; echo rc=$?
echo "-- with driver configured as a script that writes 'DRIVER' to %A:"
git -c merge.foo.driver='sh -c "echo DRIVER > $0" %A' merge-tree --write-tree main pr | head -3; echo rc=$?
echo "-- merge=foo but non-conflicting edits (different regions): does driver run? (driver 'false' fails)"
newrepo $W/a5 >/dev/null; seq 1 20 > list; echo 'list merge=foo' > .gitattributes; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' list; c pr; git checkout -q main; sed -i 's/^20$/20m/' list; c main
git -c merge.foo.driver='false' merge-tree --write-tree main pr | head -3; echo rc=$?
echo "=== 5e merge=binary-ish: 'list -merge' with non-overlapping edits ==="
newrepo $W/a6 >/dev/null; seq 1 20 > list; echo 'list -merge' > .gitattributes; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' list; c pr; git checkout -q main; sed -i 's/^20$/20m/' list; c main
mt main pr | head -6
echo "=== 5f CRLF: base LF; pr converts whole file to CRLF and edits line 1; main edits line 20 (LF) ==="
newrepo $W/e1 >/dev/null; seq 1 20 > t; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' t; sed -i 's/$/\r/' t; c "crlf+edit"; git checkout -q main; sed -i 's/^20$/20m/' t; c main
echo "-- no attributes:"; mt main pr | head -6
echo "-- with 't text=auto' in worktree only (uncommitted .gitattributes):"; echo 't text=auto' > .gitattributes; mt main pr | head -6; echo "-- and merge.renormalize=true:"; git -c merge.renormalize=true merge-tree --write-tree main pr | head -6; echo rc=$?; rm .gitattributes
echo "-- -X ignore-space-at-eol:"; git merge-tree --write-tree -X ignore-space-at-eol main pr | head -3; echo rc=$?
echo "=== 5g eol=crlf attribute committed; blob stored LF; both sides edit different lines: no effect on tree expected ==="
newrepo $W/e2 >/dev/null; seq 1 20 > t; echo 't text eol=crlf' > .gitattributes; c base
git checkout -q -b pr; sed -i 's/^1$/1p/' t; c pr; git checkout -q main; sed -i 's/^20$/20m/' t; c main
mt main pr | head -3; T=$(git merge-tree --write-tree main pr|head -1); git cat-file -p $(git ls-tree $T t|awk '{print $3}') | od -c | head -2
