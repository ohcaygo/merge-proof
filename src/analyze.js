'use strict';

// The verification engine.
//
// merge-proof answers one narrow question: does the evidence available in the
// repository actually prove this candidate against the base state it will be
// merged into? It does not look for bugs and it does not judge code.

const git = require('./git');
const rules = require('./rules');

const SCHEMA_VERSION = 1;

const VERDICT = { VERIFIED: 'VERIFIED', NOT_PROVEN: 'NOT_PROVEN', FAIL: 'FAIL' };

// Conceptual checks that this release deliberately does NOT perform. They are
// published so that a VERIFIED verdict is never mistaken for broader coverage
// than the tool actually has.
const NOT_IMPLEMENTED = [
  { id: 'CI_RAN_ON_FINAL_HEAD', reason: 'merge-proof does not read CI results; it cannot tell which commit was tested.' },
  { id: 'HUMAN_APPROVAL_PRESENT', reason: 'merge-proof does not read reviews or approvals.' },
  { id: 'CANDIDATE_DURABLE_ON_REMOTE', reason: 'merge-proof inspects local git state only; it does not query a remote for durability.' },
  { id: 'SCOPE_CREEP_VS_DECLARED_SCOPE', reason: 'merge-proof has no declared-scope input to compare the diff against.' },
];

const DEFAULTS = { staleCommits: 100, staleDays: 30 };

function fail(code, title, whatHappened, doNext, extra = {}) {
  return {
    id: code,
    severity: 'blocking',
    title,
    whatHappened,
    whyItMatters: 'Without this precondition the verifier cannot distinguish "no problem found" from "nothing could be examined".',
    missingEvidence: 'The repository state merge-proof requires in order to reason at all.',
    doNext,
    evidence: extra,
  };
}

function daysBetween(laterIso, earlierIso) {
  if (!laterIso || !earlierIso) return null;
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return Math.floor((later - earlier) / 86400000);
}

// Splits a changed-file list into the paths that count toward analysis and the
// paths dropped by default exclusions or by .mergeproofignore.
function partition(files, ignoreRules) {
  const considered = [];
  const excluded = [];
  for (const file of files) {
    if (rules.isDefaultExcluded(file)) excluded.push({ file, reason: 'generated-or-vendored' });
    else if (rules.isIgnored(file, ignoreRules)) excluded.push({ file, reason: 'mergeproofignore' });
    else considered.push(file);
  }
  return { considered, excluded };
}

function analyze(options) {
  const {
    repoPath,
    base,
    head = 'HEAD',
    ignoreFile = null,
    staleCommits = DEFAULTS.staleCommits,
    staleDays = DEFAULTS.staleDays,
    version = '0.0.0',
  } = options;

  const result = {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'merge-proof', version },
    verdict: VERDICT.FAIL,
    repository: { path: repoPath, shallow: false },
    refs: {},
    metrics: {},
    findings: [],
    advisories: [],
    excluded: [],
    notChecked: NOT_IMPLEMENTED,
  };

  if (!git.isGitRepo(repoPath)) {
    result.findings.push(fail('NOT_A_GIT_REPOSITORY', 'Not a git repository',
      `No git repository was found at ${repoPath}.`,
      'Run merge-proof from inside a git working tree, or pass --repo <path>.'));
    return result;
  }

  // Fail closed on shallow history. A shallow clone can silently lack the
  // commits that a drift check depends on, and a verifier that reports
  // VERIFIED from missing history is worse than no verifier at all.
  if (git.isShallow(repoPath)) {
    result.repository.shallow = true;
    result.findings.push(fail('SHALLOW_CLONE', 'Shallow clone: required history is missing',
      'The repository is a shallow clone, so the commits needed to compute the merge base and base drift may not be present.',
      'Fetch full history and re-run. In GitHub Actions set `fetch-depth: 0` on actions/checkout; locally run `git fetch --unshallow`.'));
    return result;
  }

  const headSha = git.resolve(repoPath, head);
  if (!headSha) {
    result.findings.push(fail('HEAD_UNRESOLVABLE', 'Candidate ref could not be resolved',
      `The candidate ref "${head}" does not resolve to a commit in this repository.`,
      'Pass an existing ref with --head <ref>, and make sure it has been fetched.'));
    return result;
  }

  if (!base) {
    result.findings.push(fail('BASE_NOT_SPECIFIED', 'No base ref was given',
      'merge-proof needs the base branch the candidate will merge into, and none was supplied or inferred.',
      'Pass --base <ref>, for example --base origin/main.'));
    return result;
  }

  const baseSha = git.resolve(repoPath, base);
  if (!baseSha) {
    result.findings.push(fail('BASE_UNRESOLVABLE', 'Base ref could not be resolved',
      `The base ref "${base}" does not resolve to a commit in this repository.`,
      'Fetch the base branch and re-run, for example `git fetch origin main`, then pass --base origin/main.'));
    return result;
  }

  const forkPoint = git.mergeBase(repoPath, baseSha, headSha);
  if (!forkPoint) {
    result.findings.push(fail('NO_MERGE_BASE', 'No common ancestor between base and candidate',
      'git found no merge base for the two refs, so there is no point of divergence to measure drift from.',
      'Confirm both refs come from the same history and that full history is present (`fetch-depth: 0`).',
      { base: baseSha, head: headSha }));
    return result;
  }

  const candidateFilesRaw = git.changedFiles(repoPath, forkPoint, headSha);
  const baseFilesRaw = git.changedFiles(repoPath, forkPoint, baseSha);
  if (candidateFilesRaw === null || baseFilesRaw === null) {
    result.findings.push(fail('DIFF_UNAVAILABLE', 'Could not compute a diff',
      'git could not produce the file lists merge-proof needs to compare the candidate against the base.',
      'Check that the repository is intact and that full history is available.'));
    return result;
  }

  const { rules: ignoreRules, source: ignoreSource } = rules.loadIgnoreRules(repoPath, ignoreFile);
  const candidate = partition(candidateFilesRaw, ignoreRules);
  const baseSide = partition(baseFilesRaw, ignoreRules);

  const baseChangedSet = new Set(baseSide.considered);
  const overlap = candidate.considered.filter((file) => baseChangedSet.has(file)).sort();

  const baseAdvance = git.commitCount(repoPath, forkPoint, baseSha);
  const forkDate = git.commitDate(repoPath, forkPoint);
  const baseDate = git.commitDate(repoPath, baseSha);
  const headDate = git.commitDate(repoPath, headSha);
  const baseAgeDays = daysBetween(baseDate, forkDate);

  result.refs = {
    base: { ref: base, sha: baseSha, date: baseDate },
    head: { ref: head, sha: headSha, date: headDate },
    forkPoint: { sha: forkPoint, date: forkDate },
  };
  result.metrics = {
    baseAdvanceCommits: baseAdvance,
    baseAgeDays,
    candidateFileCount: candidate.considered.length,
    baseChangedFileCount: baseSide.considered.length,
    overlapCount: overlap.length,
    excludedCount: candidate.excluded.length + baseSide.excluded.length,
  };
  result.excluded = candidate.excluded;
  result.ignoreFile = ignoreSource;

  // Check 1 - BASE_DRIFT_UNVERIFIED.
  // The base moved under the candidate and both sides touched the same files.
  // Git can still merge this cleanly; a clean textual merge is not evidence
  // that the combined state was ever built or tested.
  if (overlap.length > 0) {
    result.findings.push({
      id: 'BASE_DRIFT_UNVERIFIED',
      severity: 'blocking',
      title: 'Base moved under this candidate, in the same files it changes',
      whatHappened: `The base advanced by ${baseAdvance} commit(s) since this candidate diverged, and ${overlap.length} file(s) changed by the candidate were also changed on the base in that interval.`,
      whyItMatters: 'Git may merge this cleanly even though the combined state was never built or tested. Any validation of the candidate ran against the older base.',
      missingEvidence: 'A validation run of the candidate combined with the current base.',
      doNext: `Merge or rebase the current base into the candidate, re-run CI on the combined state, then re-run merge-proof. Overlapping files: ${overlap.slice(0, 10).join(', ')}${overlap.length > 10 ? `, and ${overlap.length - 10} more` : ''}.`,
      evidence: { overlappingFiles: overlap, baseAdvanceCommits: baseAdvance, forkPoint },
    });
  }

  // Check 2 - PROTECTED_BOUNDARY.
  // Blocking categories only; ci-deploy is reported as an advisory.
  const byCategory = new Map();
  for (const file of candidate.considered) {
    for (const category of rules.classify(file)) {
      if (!byCategory.has(category.id)) byCategory.set(category.id, { category, files: [] });
      byCategory.get(category.id).files.push(file);
    }
  }

  const blockingCategories = [...byCategory.values()].filter((entry) => entry.category.blocking);
  if (blockingCategories.length > 0) {
    const categoryList = blockingCategories.map((entry) => entry.category.id).sort();
    const files = [...new Set(blockingCategories.flatMap((entry) => entry.files))].sort();
    result.findings.push({
      id: 'PROTECTED_BOUNDARY',
      severity: 'blocking',
      title: `Candidate changes a protected boundary (${categoryList.join(', ')})`,
      whatHappened: `This candidate modifies ${files.length} file(s) in protected categories: ${blockingCategories.map((entry) => `${entry.category.id} (${entry.files.length})`).join(', ')}.`,
      whyItMatters: 'Changes in these areas are disproportionately expensive to reverse after a merge, so a merge here should rest on explicit evidence rather than on a clean diff.',
      missingEvidence: 'Explicit confirmation that this boundary change was reviewed and validated against the base being merged into.',
      doNext: `Confirm the boundary change is intended and validated, then re-run with an exclusion if this path is routinely safe in your repository (see .mergeproofignore.example). Files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? `, and ${files.length - 10} more` : ''}.`,
      evidence: { categories: Object.fromEntries(blockingCategories.map((entry) => [entry.category.id, entry.files])) },
    });
  }

  for (const entry of byCategory.values()) {
    if (entry.category.blocking) continue;
    result.advisories.push({
      id: 'PROTECTED_BOUNDARY_ADVISORY',
      severity: 'advisory',
      title: `Candidate changes ${entry.category.label}`,
      whatHappened: `${entry.files.length} file(s) in the advisory category "${entry.category.id}" were changed.`,
      whyItMatters: 'Reported for visibility only. This category does not affect the verdict.',
      missingEvidence: null,
      doNext: 'No action required by merge-proof.',
      evidence: { files: entry.files },
    });
  }

  // Advisory - STALE_BASE.
  // Staleness on its own is not evidence of an unverified merge, so it never
  // changes the verdict; it only explains why drift may be worth a look.
  if ((baseAdvance !== null && baseAdvance > staleCommits) || (baseAgeDays !== null && baseAgeDays > staleDays)) {
    result.advisories.push({
      id: 'STALE_BASE',
      severity: 'advisory',
      title: 'Candidate diverged from the base some time ago',
      whatHappened: `The base has advanced ${baseAdvance} commit(s) over ${baseAgeDays} day(s) since this candidate diverged.`,
      whyItMatters: 'Distance from the base raises the chance of untested interaction, but on its own it is not evidence that this candidate is unproven.',
      missingEvidence: null,
      doNext: 'Consider refreshing the candidate against the current base.',
      evidence: { baseAdvanceCommits: baseAdvance, baseAgeDays },
    });
  }

  result.verdict = result.findings.length > 0 ? VERDICT.NOT_PROVEN : VERDICT.VERIFIED;
  return result;
}

module.exports = { analyze, VERDICT, SCHEMA_VERSION, NOT_IMPLEMENTED, DEFAULTS };
