'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { normalize, renderHtml } = require('../src/pilot-report');
const h = require('./helpers');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-proof-report-test-'));
const cli = path.join(root, 'bin/merge-proof-report.js');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 90000 });
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'study-data.json'), 'utf8'));
const kiota = { rows: dataset.rows.filter((row) => row.repo === 'microsoft/kiota') };
const options = { scope: 'Scoped pilot <review> & evidence', source: 'input.json', sha256: 'a'.repeat(64) };

test('public Kiota sample counts and all 77 records survive rendering', () => {
  const model = normalize(dataset, { repo: 'microsoft/kiota' });
  assert.deepStrictEqual(model.counts, { VERIFIED: 75, NOT_PROVEN: 2, FAIL: 0, unresolvable: 0 });
  const html = renderHtml(model, options);
  for (const value of ['Scope', 'NOT_PROVEN != bad code', 'Do nothing is an option', 'Microsoft is not a customer',
    'CI_RAN_ON_FINAL_HEAD', 'HUMAN_APPROVAL_PRESENT', 'CANDIDATE_DURABLE_ON_REMOTE', 'SCOPE_CREEP_VS_DECLARED_SCOPE',
    'Input SHA-256', 'Scoped pilot &lt;review&gt; &amp; evidence', '8093', '7981']) assert.ok(html.includes(value), value);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 78);
  assert.ok(!html.includes('github/gh-aw'));
});

test('unresolvable records and recorded FAIL are visible without inventing verdicts', () => {
  const model = normalize({ rows: [kiota.rows[0],
    { ...kiota.rows[1], verdict: 'FAIL', head: null, findings: ['MISSING_REF'] },
    { repo: 'example/project', pr: 1, verdict: null, unresolvable: 'pr-head-unavailable' },
  ] });
  assert.deepStrictEqual(model.counts, { VERIFIED: 1, NOT_PROVEN: 0, FAIL: 1, unresolvable: 1 });
  const html = renderHtml(model, options);
  for (const value of ['UNRESOLVABLE', 'pr-head-unavailable', 'MISSING_REF', 'older records may use it for collection failure', 'Resolve the recorded failures or missing collection prerequisites']) assert.ok(html.includes(value), value);
});

test('full collector dataset retains distinct landed commits for a repeated PR number', () => {
  const model = normalize(dataset);
  assert.deepStrictEqual(model.counts, { VERIFIED: 1547, NOT_PROVEN: 490, FAIL: 0, unresolvable: 42 });
  assert.strictEqual(model.rows.length, 2079);
  assert.ok(renderHtml(model, options).includes('42 unresolvable record(s)'));
});

test('invalid, empty, duplicate and contradictory evidence is rejected', () => {
  for (const data of [{}, { rows: [] }, { rows: [kiota.rows[0], kiota.rows[0]] },
    { rows: [{ ...kiota.rows[0], verdict: 'GREEN' }] },
    { rows: [{ ...kiota.rows[0], verdict: 'NOT_PROVEN' }] },
    { rows: [{ ...kiota.rows[0], base: null }] },
    { rows: [{ ...kiota.rows[0], unresolvable: 'missing' }] },
    { rows: [{ ...kiota.rows[0], overlapCount: -1 }] },
  ]) assert.throws(() => normalize(data), /Invalid report input/);
  assert.throws(() => normalize(dataset, { repo: 'missing/repo' }), /zero records/);
});

const prefix = path.join(dir, 'pilot report');
const input = path.join(dir, 'evidence.json');
fs.writeFileSync(input, JSON.stringify(kiota));
const args = ['--input', input, '--scope', options.scope, '--out', prefix];

test('CLI writes HTML to paths with spaces and preserves source bytes', () => {
  const before = fs.readFileSync(input);
  const result = run([...args, '--html-only']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(`${prefix}.html`, 'utf8').includes('NOT_PROVEN != bad code'));
  assert.deepStrictEqual(fs.readFileSync(input), before);
  assert.ok(!fs.existsSync(`${prefix}.pdf`));
});

test('missing browser fails visibly and removes an older PDF', () => {
  fs.writeFileSync(`${prefix}.pdf`, 'old report');
  const result = run([...args, '--chrome', path.join(dir, 'missing-browser')]);
  assert.strictEqual(result.status, 1);
  assert.ok(result.stderr.includes('PDF export failed'));
  assert.ok(fs.existsSync(`${prefix}.html`));
  assert.ok(!fs.existsSync(`${prefix}.pdf`));
});

test('export closes a browser that stays alive after completing the PDF', () => {
  if (process.platform === 'win32') return; // Executable Node fixture uses a POSIX shebang.
  const browser = path.join(dir, 'fixture-browser');
  fs.writeFileSync(browser, `#!/usr/bin/env node\nconst fs = require('fs');
const output = process.argv.find((arg) => arg.startsWith('--print-to-pdf=')).slice(15);
fs.writeFileSync(output, '%PDF-1.4\\n' + 'fixture '.repeat(30) + '\\n%%EOF\\n');
setInterval(() => {}, 1000);\n`, { mode: 0o755 });
  const result = run([...args, '--chrome', browser]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(`${prefix}.pdf`, 'utf8').endsWith('%%EOF\n'));
});

test('export closes owned browser descendants that retain the error pipe', () => {
  if (process.platform === 'win32') return;
  const browser = path.join(dir, 'fixture-browser-descendants');
  fs.writeFileSync(browser, `#!/usr/bin/env node\nconst fs = require('fs'), { spawn } = require('child_process');
const output = process.argv.find((arg) => arg.startsWith('--print-to-pdf=')).slice(15);
fs.writeFileSync(output, '%PDF-1.4\\n' + 'fixture '.repeat(30) + '\\n%%EOF\\n');
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: ['ignore', 'ignore', 'inherit'] });
setInterval(() => {}, 1000);\n`, { mode: 0o755 });
  const start = Date.now(), result = run([...args, '--chrome', browser]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(Date.now() - start < 6000, 'a descendant must not keep PDF delivery waiting');
});

test('CLI rejects malformed JSON, missing scope, unknown flags and input/output collision', () => {
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{');
  for (const invalidArgs of [[], ['--input', input, '--out', prefix], [...args, '--mystery'],
    ['--input', bad, '--scope', 'test', '--out', prefix]]) assert.strictEqual(run(invalidArgs).status, 1);
  const collision = path.join(dir, 'collision.html');
  fs.copyFileSync(input, collision);
  const before = fs.readFileSync(collision);
  assert.strictEqual(run(['--input', collision, '--scope', 'test', '--out', path.join(dir, 'collision')]).status, 1);
  assert.deepStrictEqual(fs.readFileSync(collision), before);
});

test('real analyzer CLI JSON flows to a report for all three verdicts', () => {
  for (const [repo, expected] of [[h.cleanScenario(), 'VERIFIED'], [h.driftScenario(), 'NOT_PROVEN'], [dir, 'NOT_PROVEN']]) {
    const collected = h.cli(repo, ['--base', 'main', '--head', 'feature', '--json']);
    assert.strictEqual(collected.status, 0, collected.stderr);
    const data = JSON.parse(collected.stdout);
    assert.strictEqual(data.verdict, expected);
    const model = normalize(data);
    assert.strictEqual(model.counts[expected], 1);
    fs.writeFileSync(input, collected.stdout);
    const result = run([...args, '--html-only']);
    assert.strictEqual(result.status, 0, result.stderr);
    const html = fs.readFileSync(`${prefix}.html`, 'utf8');
    assert.ok(html.includes(`<strong>1</strong><span>${expected}</span>`));
    if (expected === 'VERIFIED') assert.ok(html.includes('Do nothing on the basis of these checks alone'));
    if (repo === dir) assert.ok(html.includes('NOT_A_GIT_REPOSITORY'));
  }
});

if (process.argv.includes('--pdf')) test('real Chrome exports the HTML as a PDF', () => {
  fs.writeFileSync(input, JSON.stringify(kiota));
  const result = run(args);
  assert.strictEqual(result.status, 0, result.stderr);
  const pdf = fs.readFileSync(`${prefix}.pdf`);
  assert.ok(pdf.length > 10000);
  assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
});

let failures = 0;
try {
  for (const { name, fn } of tests) {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (error) { failures += 1; console.error(`  FAIL  ${name}\n${error.stack}`); }
  }
} finally {
  h.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${tests.length - failures}/${tests.length} pilot report tests passed`);
process.exitCode = failures ? 1 : 0;
