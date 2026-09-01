'use strict';

// Fixture helpers. Every scenario is a real git repository built on disk, so
// the tests exercise the same git behaviour the tool sees in production.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'merge-proof.js');

const tempRoots = [];

function run(cwd, command, args) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function git(cwd, ...args) {
  return run(cwd, 'git', args);
}

function makeRepo(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `merge-proof-${name}-`));
  tempRoots.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'merge-proof tests');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

function write(dir, file, contents) {
  const target = path.join(dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function commit(dir, message, files) {
  for (const [file, contents] of Object.entries(files)) write(dir, file, contents);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

// Runs the real CLI as a child process so exit codes and stdout are tested
// exactly as a user or CI job would experience them.
function cli(cwd, args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GITHUB_BASE_REF: '' },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function cleanup() {
  for (const dir of tempRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// A candidate that diverged, with the base moving in the same file afterwards.
function driftScenario() {
  const dir = makeRepo('drift');
  commit(dir, 'initial', { 'src/shared.js': 'v1\n', 'src/other.js': 'v1\n' });
  git(dir, 'checkout', '-q', '-b', 'feature');
  commit(dir, 'candidate edits shared', { 'src/shared.js': 'v1\ncandidate\n' });
  git(dir, 'checkout', '-q', 'main');
  commit(dir, 'base edits shared', { 'src/shared.js': 'v1\nbase\n' });
  git(dir, 'checkout', '-q', 'feature');
  return dir;
}

// A candidate that diverged, with the base moving only in unrelated files.
function cleanScenario() {
  const dir = makeRepo('clean');
  commit(dir, 'initial', { 'src/a.js': 'v1\n', 'src/b.js': 'v1\n' });
  git(dir, 'checkout', '-q', '-b', 'feature');
  commit(dir, 'candidate edits a', { 'src/a.js': 'v1\ncandidate\n' });
  git(dir, 'checkout', '-q', 'main');
  commit(dir, 'base edits b', { 'src/b.js': 'v1\nbase\n' });
  git(dir, 'checkout', '-q', 'feature');
  return dir;
}

module.exports = { CLI, run, git, makeRepo, write, commit, cli, cleanup, driftScenario, cleanScenario };
