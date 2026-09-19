#!/bin/bash
# Experiment 10: whitespace / -X options change merge results
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/w >/dev/null
printf 'int main() {\n    return 0;\n}\n' > c.c; c base
git checkout -q -b pr; printf 'int main() {\n\treturn 0;\n}\n' > c.c; c "reindent tabs"
git checkout -q main; printf 'int main() {\n    return 1;\n}\n' > c.c; c "return 1"
for o in "" "-X ignore-space-change" "-X ignore-all-space" "-X ignore-space-at-eol" "-X ignore-cr-at-eol" "-X ours" "-X theirs" "-X diff-algorithm=patience" "-X diff-algorithm=histogram"; do echo "-- $o"; git merge-tree --write-tree $o main pr | head -1; echo "   rc=${PIPESTATUS[0]}"; done
echo "=== 10b diff-algorithm changes a CLEAN result? construct: both sides insert similar blocks ==="
newrepo $W/w2 >/dev/null
printf 'a\nb\nc\n\nx\ny\nz\n' > f; c base
git checkout -q -b pr; printf 'a\nb\nc\nnew1\n\nx\ny\nz\n' > f; c pr
git checkout -q main; printf 'a\nb\nc\n\nx\ny\nz\nnew2\n' > f; c main
for o in "" "-X diff-algorithm=patience" "-X diff-algorithm=histogram" "-X diff-algorithm=minimal"; do echo "-- $o: $(git merge-tree --write-tree $o main pr | head -1)"; done
echo "=== 10c CRLF conflict: pr edits line 1 with CRLF endings (whole file), main edits line 2 with LF ==="
newrepo $W/w3 >/dev/null
printf 'one\ntwo\nthree\n' > f; c base
git checkout -q -b pr; printf 'one!\r\ntwo\r\nthree\r\n' > f; c pr
git checkout -q main; printf 'one\ntwo!\nthree\n' > f; c main
echo "-- default: $(git merge-tree --write-tree main pr | head -1) rc=${PIPESTATUS[0]}"; echo "-- ignore-cr-at-eol: $(git merge-tree --write-tree -X ignore-cr-at-eol main pr | head -1)"; echo "-- ignore-space-at-eol: $(git merge-tree --write-tree -X ignore-space-at-eol main pr | head -1)"
