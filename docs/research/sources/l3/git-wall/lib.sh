# common helpers for git-wall experiments (git 2.43.0)
export GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@x GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@x
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"
export GIT_CONFIG_NOSYSTEM=1 HOME=/nonexistent XDG_CONFIG_HOME=/nonexistent
newrepo() { rm -rf "$1"; git init -q -b main "$1"; cd "$1"; git config core.autocrlf false; git config merge.renameLimit 9999; }
c() { git add -A >/dev/null; git commit -q -m "$1" --allow-empty; }
mt() { # mt <base-branch> <head-branch> [opts...] -> prints tree + status
  local b=$1 h=$2; shift 2
  out=$(git merge-tree --write-tree "$@" "$b" "$h" 2>&1); rc=$?
  echo "merge-tree($b,$h $*) rc=$rc"; echo "$out" | sed 's/^/   /'
}
lst() { git ls-tree -r "$1" | sed 's/^/   /'; }
