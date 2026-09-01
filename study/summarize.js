'use strict';

// Computes every number published in STUDY.md from study-data.json.
//
// Nothing in the study is hand-tallied: run this against the dataset and you
// get the published figures back. If a number in STUDY.md disagrees with this
// script's output, the script is right and the prose is a bug.
//
//   node study/summarize.js study-data.json

const fs = require('fs');

// Repositories are split by how many distinct people commit to them, computed
// from git history rather than assigned by hand.
const TEAM_AUTHOR_THRESHOLD = 25;

function pct(numerator, denominator) {
  if (!denominator) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

function summarize(data) {
  const analyzed = data.rows.filter((row) => !row.unresolvable);
  const unresolvable = data.rows.filter((row) => row.unresolvable);
  const contributing = data.repos.filter((repo) => repo.prs > 0);
  const excluded = data.repos.filter((repo) => repo.prs === 0);

  const authorsByRepo = new Map(data.repos.map((repo) => [repo.repo, repo.distinctHumanAuthors]));
  const stratumOf = (repo) => ((authorsByRepo.get(repo) || 0) >= TEAM_AUTHOR_THRESHOLD ? 'team' : 'small');

  const verdicts = { VERIFIED: 0, NOT_PROVEN: 0, FAIL: 0 };
  const findingCounts = {};
  const categoryCounts = {};
  const strata = { team: { repos: new Set(), prs: 0, notProven: 0 }, small: { repos: new Set(), prs: 0, notProven: 0 } };
  const perRepo = new Map();

  for (const row of analyzed) {
    verdicts[row.verdict] = (verdicts[row.verdict] || 0) + 1;

    for (const finding of new Set(row.findings || [])) {
      findingCounts[finding] = (findingCounts[finding] || 0) + 1;
    }
    for (const [category, count] of Object.entries(row.protectedCategories || {})) {
      if (count > 0) categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    const stratum = strata[stratumOf(row.repo)];
    stratum.repos.add(row.repo);
    stratum.prs += 1;
    if (row.verdict === 'NOT_PROVEN') stratum.notProven += 1;

    if (!perRepo.has(row.repo)) perRepo.set(row.repo, { repo: row.repo, prs: 0, notProven: 0, stratum: stratumOf(row.repo), authors: authorsByRepo.get(row.repo) });
    const entry = perRepo.get(row.repo);
    entry.prs += 1;
    if (row.verdict === 'NOT_PROVEN') entry.notProven += 1;
  }

  const notProven = verdicts.NOT_PROVEN || 0;
  const zeroFlagRepos = [...perRepo.values()].filter((entry) => entry.notProven === 0);

  return {
    corpus: {
      prsAnalyzed: analyzed.length,
      repositoriesContributing: contributing.length,
      repositoriesAttempted: data.repos.length,
      repositoriesExcluded: excluded.map((repo) => ({ repo: repo.repo, reason: repo.error || 'no agent-authored squash merges found in the scanned window' })),
      unresolvable: unresolvable.length,
      unresolvableReasons: unresolvable.reduce((acc, row) => {
        const key = String(row.unresolvable).split(':')[0];
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
    verdicts,
    notProvenRate: pct(notProven, analyzed.length),
    findings: Object.fromEntries(Object.entries(findingCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => [id, { count, rate: pct(count, analyzed.length) }])),
    protectedCategories: Object.fromEntries(Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])),
    strata: {
      team: { repositories: strata.team.repos.size, prs: strata.team.prs, notProven: strata.team.notProven, rate: pct(strata.team.notProven, strata.team.prs) },
      small: { repositories: strata.small.repos.size, prs: strata.small.prs, notProven: strata.small.notProven, rate: pct(strata.small.notProven, strata.small.prs) },
      threshold: `distinct non-bot commit authors >= ${TEAM_AUTHOR_THRESHOLD} counts as a team repository`,
    },
    zeroFlagRepositories: { count: zeroFlagRepos.length, repos: zeroFlagRepos.map((entry) => entry.repo).sort() },
    perRepo: [...perRepo.values()]
      .sort((a, b) => b.prs - a.prs)
      .map((entry) => ({ ...entry, rate: pct(entry.notProven, entry.prs) })),
  };
}

if (require.main === module) {
  const file = process.argv[2] || 'study-data.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(`${JSON.stringify(summarize(data), null, 2)}\n`);
}

module.exports = { summarize, TEAM_AUTHOR_THRESHOLD };
