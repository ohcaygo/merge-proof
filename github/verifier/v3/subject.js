"use strict";
const { sha } = require("./common");
function of(c) {
  const i = c.identity, t = c.target?.value;
  if (!Number.isSafeInteger(i.repositoryId) || !sha(t?.sha) || !sha(t.tree) || !sha(t.baseSha))
    return { state: "UNAVAILABLE", reason: "EXACT_SUBJECT_UNAVAILABLE" };
  const kind = t.kind === "HEAD_CONTAINS_CURRENT_BASE" ? "PULL_REQUEST_HEAD" : t.kind;
  const value = { platform: "github", repositoryId: i.repositoryId, kind, commit: t.sha,
    tree: t.tree, base: t.baseSha, group: t.kind === "MERGE_GROUP" ? t.sha : null };
  return { state: "AVAILABLE", value, id: `platform:github/repo:${i.repositoryId}/kind:${kind}/commit:${t.sha}/tree:${t.tree}/base:${t.baseSha}${value.group ? `/group:${value.group}` : ""}` };
}
function equal(a, b) { return a?.state === "AVAILABLE" && b?.state === "AVAILABLE" && a.id === b.id; }
module.exports = { of, equal };
