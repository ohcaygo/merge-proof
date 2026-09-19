#!/bin/bash
# Experiment 3: submodules (gitlinks 160000)
set -u; . "$(dirname "$0")/lib.sh"; W=$(mktemp -d)
newrepo $W/sub >/dev/null; echo s1 > s; c s1; S1=$(git rev-parse HEAD); echo s2 > s; c s2; S2=$(git rev-parse HEAD); git checkout -q -b other $S1; echo s3 > s; c s3; S3=$(git rev-parse HEAD); echo s4 >> s; c s4; S4=$(git rev-parse HEAD)
echo "sub commits: S1=$S1 S2=$S2 S3=$S3(branch from S1) S4=$S4(child of S3)"
mkgitlink() { # add gitlink without cloning: use update-index
  git update-index --add --cacheinfo 160000,$1,sub; printf '[submodule "sub"]\n\tpath = sub\n\turl = ../sub\n' > .gitmodules; git add .gitmodules; git commit -q -m "$2"; }
echo "=== 3a both sides bump gitlink to different SHAs; submodule NOT present locally ==="
newrepo $W/super >/dev/null; echo x > f; c base; mkgitlink $S1 "sub@S1"
git checkout -q -b pr; mkgitlink $S2 "sub@S2"; git checkout -q main; mkgitlink $S3 "sub@S3"
mt main pr
echo "=== 3b pr bumps gitlink, main edits unrelated file ==="
newrepo $W/super2 >/dev/null; echo x > f; c base; mkgitlink $S1 "sub@S1"
git checkout -q -b pr; mkgitlink $S2 "sub@S2"; git checkout -q main; echo y > f; c "edit f"
mt main pr; lst $(git merge-tree --write-tree main pr|head -1)
echo "=== 3c both bump; one is fast-forward of the other (S3 -> S4); submodule ABSENT locally ==="
newrepo $W/super3 >/dev/null; echo x > f; c base; mkgitlink $S1 "sub@S1"
git checkout -q -b pr; mkgitlink $S4 "sub@S4"; git checkout -q main; mkgitlink $S3 "sub@S3"
mt main pr
echo "=== 3d same as 3c but submodule PRESENT (cloned into sub/) ==="
git clone -q $W/sub sub 2>/dev/null; (cd sub && git checkout -q $S3)
mt main pr
echo "=== 3d' with submodule present and also present in .git/modules (git submodule absorbgitdirs) ==="
git submodule absorbgitdirs 2>&1 | tail -1
mt main pr
echo "=== 3e both bump to the same SHA ==="
newrepo $W/super4 >/dev/null; echo x > f; c base; mkgitlink $S1 "sub@S1"
git checkout -q -b pr; mkgitlink $S2 "sub@S2"; git checkout -q main; mkgitlink $S2 "sub@S2 too"
mt main pr
