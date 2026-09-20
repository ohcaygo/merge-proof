"use strict";
const { analyze } = require("./src-analyze");
const { sha, assert } = require("./common");
// Same analyzer, same exclusions and protected boundaries. GitHub compare is
// bounded at 300 files; reaching that cap is unavailable, never a clean diff.
function analyzeMetadata(capture) {
  const { headSha: h, baseSha: b } = capture.identity;
  const g = capture.git;
  if (g.state !== "AVAILABLE")
    return {
      schemaVersion: 1,
      verdict: "NOT_PROVEN",
      refs: {},
      metrics: {},
      findings: [
        {
          id: "GIT_HISTORY_UNAVAILABLE",
          severity: "blocking",
          whatHappened: g.reason,
        },
      ],
      advisories: [],
      notChecked: [],
    };
  const v = g.value;
  assert(sha(v.mergeBase) && v.headSha === h && v.baseSha === b);
  const reader = {
    isGitRepo: () => true,
    isShallow: () => false,
    resolve: (_, ref) => ([h, b].includes(ref) ? ref : null),
    mergeBase: () => v.mergeBase,
    changedFiles: (_, from, to) =>
      from === v.mergeBase
        ? to === h
          ? v.candidateFiles
          : to === b
            ? v.baseFiles
            : null
        : null,
    commitCount: () => v.baseAdvanceCommits,
    commitDate: (_, ref) => v.dates[ref] || null,
  };
  const out = analyze({
    repoPath: capture.identity.repository,
    base: b,
    head: h,
    version: "0.2.0",
    evidenceGit: reader,
  });
  out.changedFiles = v.candidateFiles;
  out.source = "github-rest-git-metadata";
  return out;
}
module.exports = { analyzeMetadata };
