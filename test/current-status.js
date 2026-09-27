'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHALLOW_MESSAGE = 'STATUS contract requires full history and origin/main; use actions/checkout with fetch-depth: 0 or run git fetch --unshallow origin main:refs/remotes/origin/main before validation';

const requiredSections = [
  'Repository and lifecycle',
  'GitHub policy truth',
  'Active objective and finish line',
  'Level 3 and external gates',
  'Verification commands',
  'Task routing',
  'Maintenance and live verification',
];

function systemGit(args, root) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function validateCurrentStatus({ root = ROOT, now = Date.now(), runGit = systemGit } = {}) {
  const git = (args) => runGit(args, root);
  assert.strictEqual(git(['rev-parse', '--is-shallow-repository']), 'false', SHALLOW_MESSAGE);

  const status = fs.readFileSync(path.join(root, 'docs', 'current-truth', 'STATUS.md'), 'utf8');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(fs.existsSync(path.join(root, 'docs', 'current-truth', 'INDEPENDENT-REVIEW.md')), 'authoritative independent-review procedure is missing');

  for (const section of requiredSections) {
    assert.match(status, new RegExp(`^## ${section}$`, 'm'), `STATUS.md is missing required section: ${section}`);
  }

  assert.match(agents, /Independent review: `docs\/current-truth\/INDEPENDENT-REVIEW\.md` is the authoritative pinned-candidate procedure\./);
  assert.match(status, /Independent review: `INDEPENDENT-REVIEW\.md` is the authoritative pinned-candidate procedure\./);
  assert.doesNotMatch(status, /if one is established/i);

  const words = status.match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g) || [];
  assert.ok(words.length < 1000, `STATUS.md must stay under 1,000 words; found ${words.length}`);

  const updatedMatch = status.match(/^\*\*Updated:\*\* (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s*$/m);
  assert.ok(updatedMatch, 'STATUS.md must include ISO-8601 Updated metadata with an explicit offset');
  const updatedAt = new Date(updatedMatch[1]);
  assert.ok(Number.isFinite(updatedAt.getTime()), 'STATUS.md Updated metadata must be a valid date');
  const ageDays = (now - updatedAt.getTime()) / 86400000;
  assert.ok(ageDays >= -1, 'STATUS.md Updated metadata must not be more than one day in the future');
  assert.ok(ageDays <= 30, `STATUS.md is stale: Updated metadata is ${ageDays.toFixed(1)} days old`);

  const sourceMatch = status.match(/^\*\*Source main commit:\*\* `([0-9a-f]{40})`\s*$/m);
  assert.ok(sourceMatch, 'STATUS.md must include a full 40-character Source main commit');
  const sourceCommit = sourceMatch[1];
  assert.strictEqual(git(['rev-parse', `${sourceCommit}^{commit}`]), sourceCommit, 'STATUS.md source main commit must resolve exactly');
  git(['merge-base', '--is-ancestor', sourceCommit, 'HEAD']);

  const remoteMainMatch = status.match(/^- Refreshed remote `main`: `([0-9a-f]{40})`/m);
  assert.ok(remoteMainMatch, 'STATUS.md must include the full refreshed remote main commit');
  assert.strictEqual(remoteMainMatch[1], sourceCommit, 'STATUS.md source and refreshed remote main commits must match');
  const mergedNeedle = '| Merged | Yes, through `' + sourceCommit.slice(0, 8) + '` |';
  assert.ok(status.includes(mergedNeedle), 'STATUS.md merged lifecycle row must match the source main commit');

  const originMain = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']);
  const head = git(['rev-parse', 'HEAD^{commit}']);
  if (head === originMain) {
    const headAndParents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/);
    assert.ok(headAndParents.includes(sourceCommit), 'STATUS.md source must be current main or a direct parent of the landed main commit');
  } else {
    assert.strictEqual(sourceCommit, originMain, 'STATUS.md source must equal freshly fetched origin/main; refresh current truth before validating a candidate');
  }

  console.log(`STATUS contract: ${words.length} words, current review route, source ${sourceCommit.slice(0, 12)}, full history`);
}

if (require.main === module) validateCurrentStatus();

module.exports = { SHALLOW_MESSAGE, validateCurrentStatus };
