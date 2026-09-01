'use strict';

// Zero-dependency test runner. Each test is a name plus a function that throws
// on failure; a thrown error is a failed test, anything else passes.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const h = require('./helpers');
const { analyze } = require('../src/analyze');
const rules = require('../src/rules');
const { parseActionYaml } = require('./action-meta');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const ROOT = path.join(__dirname, '..');
const analyzeAt = (dir, extra = {}) => analyze({ repoPath: dir, base: 'main', head: 'feature', version: '0.1.0', ...extra });

// --- CLI surface -----------------------------------------------------------

test('CLI help lists usage, verdicts and exit codes', () => {
  const { status, stdout } = h.cli(ROOT, ['--help']);
  assert.strictEqual(status, 0);
  for (const needle of ['Usage', '--fail-on', 'Exit codes', 'VERIFIED', 'NOT_PROVEN', 'FAIL', '--json']) {
    assert.ok(stdout.includes(needle), `help should mention ${needle}`);
  }
});

test('CLI rejects an unknown option with exit code 1', () => {
  const { status, stderr } = h.cli(ROOT, ['--not-a-real-option']);
  assert.strictEqual(status, 1);
  assert.ok(stderr.includes('Unknown option'));
});

test('CLI rejects an invalid --fail-on value', () => {
  const { status, stderr } = h.cli(ROOT, ['--fail-on', 'banana']);
  assert.strictEqual(status, 1);
  assert.ok(stderr.includes('Unknown --fail-on value'));
});

// --- Verdicts --------------------------------------------------------------

test('VERIFIED when the base moved only in files the candidate did not touch', () => {
  const dir = h.cleanScenario();
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'VERIFIED');
  assert.strictEqual(result.findings.length, 0);
  assert.strictEqual(result.metrics.overlapCount, 0);
});

test('NOT_PROVEN on base drift in an overlapping file', () => {
  const dir = h.driftScenario();
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'NOT_PROVEN');
  const finding = result.findings.find((f) => f.id === 'BASE_DRIFT_UNVERIFIED');
  assert.ok(finding, 'expected BASE_DRIFT_UNVERIFIED');
  assert.deepStrictEqual(finding.evidence.overlappingFiles, ['src/shared.js']);
  assert.strictEqual(result.metrics.baseAdvanceCommits, 1);
});

test('base drift finding answers all four output-quality questions', () => {
  const result = analyzeAt(h.driftScenario());
  const finding = result.findings[0];
  for (const field of ['whatHappened', 'whyItMatters', 'missingEvidence', 'doNext']) {
    assert.ok(finding[field] && finding[field].length > 20, `${field} should be a substantive sentence`);
  }
});

test('FAIL when the base ref cannot be resolved', () => {
  const dir = h.cleanScenario();
  const result = analyzeAt(dir, { base: 'origin/does-not-exist' });
  assert.strictEqual(result.verdict, 'FAIL');
  assert.strictEqual(result.findings[0].id, 'BASE_UNRESOLVABLE');
});

test('FAIL when no merge base exists between the two refs', () => {
  const dir = h.makeRepo('orphan');
  h.commit(dir, 'initial', { 'a.txt': 'a\n' });
  h.git(dir, 'checkout', '-q', '--orphan', 'feature');
  h.git(dir, 'rm', '-rq', '--cached', '.');
  h.commit(dir, 'unrelated root', { 'b.txt': 'b\n' });
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'FAIL');
  assert.strictEqual(result.findings[0].id, 'NO_MERGE_BASE');
});

test('FAIL when the path is not a git repository', () => {
  const result = analyze({ repoPath: path.join(require('os').tmpdir(), 'merge-proof-not-a-repo-xyz'), base: 'main', version: '0.1.0' });
  assert.strictEqual(result.verdict, 'FAIL');
  assert.strictEqual(result.findings[0].id, 'NOT_A_GIT_REPOSITORY');
});

// --- Shallow clone: the fail-closed regression test ------------------------

test('shallow clone fails closed and never returns VERIFIED', () => {
  const source = h.cleanScenario();
  h.git(source, 'checkout', '-q', 'main');
  const shallow = fs.mkdtempSync(path.join(require('os').tmpdir(), 'merge-proof-shallow-'));
  fs.rmSync(shallow, { recursive: true, force: true });
  h.run(path.dirname(shallow), 'git', ['clone', '-q', '--depth', '1', `file://${source}`, shallow]);

  const result = analyze({ repoPath: shallow, base: 'origin/main', head: 'HEAD', version: '0.1.0' });
  assert.strictEqual(result.verdict, 'FAIL');
  assert.strictEqual(result.findings[0].id, 'SHALLOW_CLONE');
  assert.notStrictEqual(result.verdict, 'VERIFIED');
  assert.ok(/fetch-depth: 0/.test(result.findings[0].doNext), 'remedy must name the fix');
  fs.rmSync(shallow, { recursive: true, force: true });
});

// --- Protected boundaries --------------------------------------------------

test('NOT_PROVEN when the candidate changes a migration', () => {
  const dir = h.makeRepo('migration');
  h.commit(dir, 'initial', { 'README.md': 'x\n' });
  h.git(dir, 'checkout', '-q', '-b', 'feature');
  h.commit(dir, 'add migration', { 'db/migrations/001_add_users.sql': 'CREATE TABLE users();\n' });
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'NOT_PROVEN');
  const finding = result.findings.find((f) => f.id === 'PROTECTED_BOUNDARY');
  assert.ok(finding);
  assert.deepStrictEqual(Object.keys(finding.evidence.categories), ['migration']);
});

test('each blocking protected category is detected', () => {
  const cases = {
    migration: 'db/migrations/002_x.sql',
    schema: 'prisma/schema.prisma',
    auth: 'src/auth/session.ts',
    secrets: 'config/secrets/app.pem',
    billing: 'src/billing/charge.ts',
    policy: 'supabase/policies/rls.sql',
  };
  for (const [category, file] of Object.entries(cases)) {
    const hits = rules.classify(file).filter((c) => c.blocking).map((c) => c.id);
    assert.ok(hits.includes(category), `${file} should classify as ${category}, got ${JSON.stringify(hits)}`);
  }
});

test('ci-deploy is advisory only and does not change the verdict', () => {
  const dir = h.makeRepo('ci-advisory');
  h.commit(dir, 'initial', { 'README.md': 'x\n' });
  h.git(dir, 'checkout', '-q', '-b', 'feature');
  h.commit(dir, 'edit workflow', { '.github/workflows/ci.yml': 'name: ci\n' });
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'VERIFIED');
  assert.ok(result.advisories.some((a) => a.evidence.files.includes('.github/workflows/ci.yml')));
});

test('a stale base alone is advisory and does not produce NOT_PROVEN', () => {
  const dir = h.makeRepo('stale');
  h.commit(dir, 'initial', { 'src/a.js': 'v1\n', 'src/b.js': 'v1\n' });
  h.git(dir, 'checkout', '-q', '-b', 'feature');
  h.commit(dir, 'candidate', { 'src/a.js': 'v2\n' });
  h.git(dir, 'checkout', '-q', 'main');
  for (let i = 0; i < 5; i += 1) h.commit(dir, `base ${i}`, { 'src/b.js': `v${i}\n` });
  const result = analyzeAt(dir, { staleCommits: 2, staleDays: 100000 });
  assert.strictEqual(result.verdict, 'VERIFIED');
  assert.ok(result.advisories.some((a) => a.id === 'STALE_BASE'));
});

// --- Exclusions ------------------------------------------------------------

test('generated artifacts are excluded from drift overlap', () => {
  const dir = h.makeRepo('lockfile');
  h.commit(dir, 'initial', { 'package-lock.json': '{"v":1}\n', 'src/a.js': 'v1\n' });
  h.git(dir, 'checkout', '-q', '-b', 'feature');
  h.commit(dir, 'candidate lock', { 'package-lock.json': '{"v":2}\n' });
  h.git(dir, 'checkout', '-q', 'main');
  h.commit(dir, 'base lock', { 'package-lock.json': '{"v":3}\n' });
  h.git(dir, 'checkout', '-q', 'feature');
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'VERIFIED');
  assert.strictEqual(result.metrics.overlapCount, 0);
  assert.ok(result.excluded.some((e) => e.file === 'package-lock.json' && e.reason === 'generated-or-vendored'));
});

test('.mergeproofignore suppresses drift in ignored paths', () => {
  const dir = h.driftScenario();
  h.git(dir, 'checkout', '-q', 'feature');
  fs.writeFileSync(path.join(dir, '.mergeproofignore'), 'src/shared.js\n');
  const result = analyzeAt(dir);
  assert.strictEqual(result.verdict, 'VERIFIED');
  assert.ok(result.excluded.some((e) => e.reason === 'mergeproofignore'));
});

test('.mergeproofignore negation re-includes a path', () => {
  const rulesList = rules.parseIgnoreFile('docs/**\n!docs/keep.md\n');
  assert.strictEqual(rules.isIgnored('docs/other.md', rulesList), true);
  assert.strictEqual(rules.isIgnored('docs/keep.md', rulesList), false);
});

// --- Output formats and exit codes ----------------------------------------

test('--json emits a parseable result with schema, verdict and coverage', () => {
  const dir = h.driftScenario();
  const { status, stdout } = h.cli(dir, ['--base', 'main', '--head', 'feature', '--json']);
  assert.strictEqual(status, 0);
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.schemaVersion, 1);
  assert.strictEqual(parsed.verdict, 'NOT_PROVEN');
  assert.strictEqual(parsed.tool.name, 'merge-proof');
  const notChecked = parsed.notChecked.map((n) => n.id);
  for (const id of ['CI_RAN_ON_FINAL_HEAD', 'HUMAN_APPROVAL_PRESENT', 'CANDIDATE_DURABLE_ON_REMOTE', 'SCOPE_CREEP_VS_DECLARED_SCOPE']) {
    assert.ok(notChecked.includes(id), `${id} must be declared as not checked`);
  }
});

test('default run is diagnostic: NOT_PROVEN still exits 0', () => {
  const dir = h.driftScenario();
  const { status, stdout } = h.cli(dir, ['--base', 'main', '--head', 'feature']);
  assert.strictEqual(status, 0);
  assert.ok(stdout.includes('NOT_PROVEN'));
});

test('--fail-on not-proven exits 2 on NOT_PROVEN and 0 on VERIFIED', () => {
  const drift = h.cli(h.driftScenario(), ['--base', 'main', '--head', 'feature', '--fail-on', 'not-proven']);
  assert.strictEqual(drift.status, 2);
  const clean = h.cli(h.cleanScenario(), ['--base', 'main', '--head', 'feature', '--fail-on', 'not-proven']);
  assert.strictEqual(clean.status, 0);
});

test('--fail-on fail exits 3 on FAIL but 0 on NOT_PROVEN', () => {
  const notProven = h.cli(h.driftScenario(), ['--base', 'main', '--head', 'feature', '--fail-on', 'fail']);
  assert.strictEqual(notProven.status, 0);
  const failing = h.cli(h.cleanScenario(), ['--base', 'origin/nope', '--head', 'feature', '--fail-on', 'fail']);
  assert.strictEqual(failing.status, 3);
});

test('human output always states what is not checked', () => {
  const { stdout } = h.cli(h.cleanScenario(), ['--base', 'main', '--head', 'feature']);
  assert.ok(stdout.includes('Not checked by this release'));
  assert.ok(stdout.includes('CI_RAN_ON_FINAL_HEAD'));
  assert.ok(stdout.includes('not a code reviewer'));
});

// --- GitHub Action metadata ------------------------------------------------

test('action.yml is valid composite-action metadata with minimal permissions', () => {
  const meta = parseActionYaml(fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8'));
  assert.ok(meta.name, 'action needs a name');
  assert.ok(meta.description, 'action needs a description');
  assert.strictEqual(meta.runs.using, 'composite');
  assert.ok(Array.isArray(meta.runs.steps) && meta.runs.steps.length > 0, 'action needs steps');
  for (const input of ['base', 'head', 'fail-on', 'comment']) {
    assert.ok(meta.inputs[input], `action should expose input ${input}`);
  }
  for (const output of ['verdict', 'drift-count', 'overlap-count']) {
    assert.ok(meta.outputs[output], `action should expose output ${output}`);
  }
});

test('action.yml pins third-party actions and requests no write scope beyond pull-requests', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
  const uses = raw.match(/uses:\s*\S+/g) || [];
  assert.ok(uses.length > 0, 'expected at least one `uses:` reference to check');
  for (const entry of uses) {
    const ref = entry.split(/\s+/)[1];
    assert.ok(/^actions\//.test(ref), `only GitHub-owned actions are allowed, found ${ref}`);
    assert.ok(/@v\d/.test(ref), `action reference must be version-pinned: ${ref}`);
  }

  // Scan the executable body only: the header comment documents the required
  // permissions in prose, and prose about `contents: write` is not a request
  // for it.
  const body = raw.split(/\r?\n/).filter((line) => !line.trim().startsWith('#')).join('\n');
  assert.ok(!/contents:\s*write/.test(body), 'action must never request contents: write');

  const comments = raw.split(/\r?\n/).filter((line) => line.trim().startsWith('#')).join('\n');
  assert.ok(/contents:\s*read/.test(comments), 'action should document the contents: read requirement');
  assert.ok(/pull-requests:\s*write/.test(comments), 'action should document when pull-requests: write is needed');
  assert.ok(/fetch-depth:\s*0/.test(comments), 'action should document the full-history requirement');
});

// --- Independence ----------------------------------------------------------

test('package declares no runtime or dev dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.dependencies, {});
  assert.deepStrictEqual(pkg.devDependencies, {});
});

test('source makes no network, model or telemetry calls', () => {
  const files = ['src/git.js', 'src/rules.js', 'src/analyze.js', 'src/report.js', 'bin/merge-proof.js'];
  const banned = [/\bfetch\s*\(/, /require\(['"](https?|net|dgram)['"]\)/, /XMLHttpRequest/, /api\.openai|api\.anthropic|generativelanguage/i, /telemetry|analytics\.track|posthog|segment\.io|mixpanel/i];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const pattern of banned) {
      assert.ok(!pattern.test(source), `${file} must not match ${pattern}`);
    }
  }
});

// --- Runner ----------------------------------------------------------------

let passed = 0;
const failures = [];
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (err) {
    failures.push({ name, err });
    process.stdout.write(`  FAIL  ${name}\n         ${err.message.split('\n')[0]}\n`);
  }
}
h.cleanup();

process.stdout.write(`\n${passed}/${tests.length} tests passed\n`);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} failing:\n`);
  for (const { name, err } of failures) process.stdout.write(`\n--- ${name}\n${err.stack}\n`);
  process.exitCode = 1;
}
