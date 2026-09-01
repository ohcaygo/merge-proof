'use strict';

// G1 corpus collector.
//
// Reconstructs a corpus of merged, agent-authored pull requests from public
// repositories and runs the shipped merge-proof verifier against each one.
//
// Everything here is deterministic git. There are no model calls: an
// "agent-authored" PR is identified by commit trailers, not by judgement.
//
//   node study/collect.js --repos study/repos.txt --out study-data.json
//
// Method, per repository:
//   1. Blobless clone (commits and trees only - enough for --name-only diffs).
//   2. Walk the default branch's first-parent history for squash merges whose
//      message carries an AI-agent co-author trailer and a PR number.
//   3. base-at-merge  = first parent of the squash commit (the exact base
//      state the PR was merged into).
//      candidate head = refs/pull/N/head (the PR's own last commit).
//   4. Run merge-proof with that base and that head.
//
// Known limitations, reported rather than papered over:
//   - Rebase-merged PRs are missed: they leave no single squash commit.
//   - PRs whose head ref was deleted and garbage-collected cannot be fetched
//     and are counted as unresolvable, never as VERIFIED.
//   - Agent detection depends on trailers being present and honest.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyze } = require('../src/analyze');

// Trailers left by AI coding agents. Dependency bots (dependabot, renovate)
// are deliberately NOT included: they are automation, not code agents, and
// counting them would inflate the corpus with mechanical version bumps.
const AGENT_PATTERNS = [
  { label: 'copilot', pattern: /copilot/i },
  { label: 'claude', pattern: /claude|anthropic/i },
  { label: 'cursor', pattern: /\bcursor\b/i },
  { label: 'devin', pattern: /\bdevin\b/i },
  { label: 'codex', pattern: /\bcodex\b/i },
  { label: 'aider', pattern: /\baider\b/i },
  { label: 'sweep', pattern: /\bsweep(-ai)?\b/i },
  { label: 'openhands', pattern: /openhands|opendevin/i },
  { label: 'cody', pattern: /\bcody\b/i },
  { label: 'jules', pattern: /\bjules\b/i },
];

function git(cwd, args, { allowFailure = false, timeout = 900000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFailure) return null;
    throw new Error(`git ${args.slice(0, 3).join(' ')}: ${err.stderr ? String(err.stderr).slice(0, 300) : err.message}`);
  }
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

// A commit is agent-authored if an AI agent appears as author, committer, or
// co-author trailer. The PR number comes from the squash subject GitHub
// generates, e.g. "Fix the thing (#123)".
function inspectCommit({ author, email, body, subject }) {
  const trailers = body.split(/\r?\n/).filter((line) => /^co-authored-by:/i.test(line.trim()));
  const identity = `${author} ${email} ${trailers.join(' ')}`;
  const agentHit = AGENT_PATTERNS.find((entry) => entry.pattern.test(identity));
  if (!agentHit) return null;

  const prMatch = subject.match(/\(#(\d+)\)\s*$/);
  if (!prMatch) return null;

  return { pr: Number(prMatch[1]), agent: agentHit.label };
}

function cloneRepo(fullName, workDir) {
  const target = path.join(workDir, fullName.replace('/', '__'));
  if (fs.existsSync(target)) return target;
  log(`  cloning ${fullName} (blobless)`);
  git(workDir, ['clone', '--filter=blob:none', '--no-checkout', '--quiet', `https://github.com/${fullName}.git`, target], { timeout: 1800000 });
  return target;
}

function collectRepo(fullName, options) {
  const { workDir, maxCommits, maxPrs } = options;
  const repoDir = cloneRepo(fullName, workDir);

  const defaultRef = (git(repoDir, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { allowFailure: true }) || '').trim()
    || 'refs/remotes/origin/HEAD';

  const RS = '\x1e';
  const US = '\x1f';
  const raw = git(repoDir, [
    'log', '--first-parent', defaultRef,
    `--max-count=${maxCommits}`,
    `--format=%H${US}%P${US}%an${US}%ae${US}%s${US}%b${RS}`,
  ], { allowFailure: true });

  if (raw === null) {
    log(`  ! could not read history for ${fullName}`);
    return { repo: fullName, error: 'history-unreadable', rows: [], meta: null };
  }

  // Objective stratification input: how many distinct humans commit to this
  // repository. Computed from git alone so the strata are reproducible and
  // not assigned by hand.
  const shortlog = git(repoDir, ['shortlog', '-sne', '--no-merges', defaultRef], { allowFailure: true, timeout: 600000 }) || '';
  const authorLines = shortlog.split(/\r?\n/).filter((line) => line.trim());
  const humanAuthors = authorLines.filter((line) => !/\[bot\]|noreply@github\.com>\s*$/i.test(line));
  const repoMeta = { distinctAuthors: authorLines.length, distinctHumanAuthors: humanAuthors.length };

  const candidates = [];
  for (const record of raw.split(RS)) {
    const entry = record.replace(/^\s+/, '');
    if (!entry) continue;
    const [sha, parents, author, email, subject, body = ''] = entry.split(US);
    if (!sha || !parents) continue;
    const parentList = parents.trim().split(/\s+/);
    // Squash merges have exactly one parent; that parent is the base state.
    if (parentList.length !== 1) continue;
    const hit = inspectCommit({ author, email, body, subject: subject || '' });
    if (hit) candidates.push({ squash: sha, base: parentList[0], pr: hit.pr, agent: hit.agent, subject });
  }

  const selected = candidates.slice(0, maxPrs);
  log(`  ${fullName}: ${candidates.length} agent-authored squash merges found, taking ${selected.length}`);
  if (selected.length === 0) return { repo: fullName, error: null, rows: [], meta: repoMeta, agentMergesFound: candidates.length };

  // Fetch PR heads in chunks. A missing head is recorded, never guessed.
  const fetched = new Set();
  const chunkSize = 60;
  for (let i = 0; i < selected.length; i += chunkSize) {
    const chunk = selected.slice(i, i + chunkSize);
    const refspecs = chunk.map((row) => `+refs/pull/${row.pr}/head:refs/mp/${row.pr}`);
    const ok = git(repoDir, ['fetch', '--quiet', '--filter=blob:none', 'origin', ...refspecs], { allowFailure: true, timeout: 1800000 });
    if (ok !== null) {
      for (const row of chunk) fetched.add(row.pr);
    } else {
      // One bad ref fails the whole batch, so retry the chunk one ref at a time.
      for (const row of chunk) {
        const single = git(repoDir, ['fetch', '--quiet', '--filter=blob:none', 'origin', `+refs/pull/${row.pr}/head:refs/mp/${row.pr}`], { allowFailure: true, timeout: 300000 });
        if (single !== null) fetched.add(row.pr);
      }
    }
    log(`    fetched ${fetched.size}/${selected.length} PR heads`);
  }

  const rows = [];
  for (const row of selected) {
    if (!fetched.has(row.pr)) {
      rows.push({ repo: fullName, pr: row.pr, agent: row.agent, squash: row.squash, verdict: null, unresolvable: 'pr-head-unavailable' });
      continue;
    }
    let result;
    try {
      result = analyze({ repoPath: repoDir, base: row.base, head: `refs/mp/${row.pr}`, version: 'study' });
    } catch (err) {
      rows.push({ repo: fullName, pr: row.pr, agent: row.agent, squash: row.squash, verdict: null, unresolvable: `analyze-error: ${err.message.slice(0, 120)}` });
      continue;
    }
    const categories = {};
    const boundary = result.findings.find((f) => f.id === 'PROTECTED_BOUNDARY');
    if (boundary) {
      for (const [key, files] of Object.entries(boundary.evidence.categories)) categories[key] = files.length;
    }
    rows.push({
      repo: fullName,
      pr: row.pr,
      agent: row.agent,
      squash: row.squash,
      base: row.base,
      head: result.refs.head ? result.refs.head.sha : null,
      verdict: result.verdict,
      findings: result.findings.map((f) => f.id),
      advisories: (result.advisories || []).map((a) => a.id),
      baseAdvanceCommits: result.metrics.baseAdvanceCommits,
      candidateFileCount: result.metrics.candidateFileCount,
      overlapCount: result.metrics.overlapCount,
      protectedCategories: categories,
      unresolvable: null,
    });
  }
  return { repo: fullName, error: null, rows, meta: repoMeta, agentMergesFound: candidates.length };
}

function main(argv) {
  const options = { repos: 'study/repos.txt', out: 'study-data.json', workDir: path.join(os.tmpdir(), 'merge-proof-study'), maxCommits: 4000, maxPrs: 120, prune: false };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (key === 'max-commits') options.maxCommits = Number(value);
    else if (key === 'max-prs') options.maxPrs = Number(value);
    else if (key === 'work-dir') options.workDir = value;
    else if (key === 'prune') { options.prune = value === 'true'; }
    else if (key in options) options[key] = value;
  }

  fs.mkdirSync(options.workDir, { recursive: true });
  const repos = fs.readFileSync(options.repos, 'utf8').split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

  const all = [];
  const perRepo = [];
  for (const repo of repos) {
    log(`[${perRepo.length + 1}/${repos.length}] ${repo}`);
    let outcome;
    try {
      outcome = collectRepo(repo, options);
    } catch (err) {
      log(`  ! ${repo}: ${err.message}`);
      outcome = { repo, error: err.message.slice(0, 200), rows: [] };
    }
    perRepo.push({
      repo,
      error: outcome.error,
      prs: outcome.rows.length,
      agentMergesFound: outcome.agentMergesFound ?? 0,
      distinctAuthors: outcome.meta ? outcome.meta.distinctAuthors : null,
      distinctHumanAuthors: outcome.meta ? outcome.meta.distinctHumanAuthors : null,
    });
    all.push(...outcome.rows);
    fs.writeFileSync(options.out, JSON.stringify({ rows: all, repos: perRepo }, null, 1));

    // Clones are large and only needed while a repository is being measured.
    if (options.prune) {
      const dir = path.join(options.workDir, repo.replace('/', '__'));
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  log(`\ncollected ${all.length} PRs across ${perRepo.length} repositories -> ${options.out}`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { inspectCommit, AGENT_PATTERNS };
