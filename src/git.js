'use strict';

// Deterministic git access. No network, no model calls, no dependencies.
// Every function here is a thin, side-effect-free wrapper over `git` reads.

const { execFileSync } = require('child_process');

class GitError extends Error {
  constructor(message, args, stderr) {
    super(message);
    this.name = 'GitError';
    this.args = args;
    this.stderr = stderr;
  }
}

// Runs git with a fixed, quoting-safe configuration and returns stdout.
// `core.quotepath=false` keeps non-ASCII paths readable; callers that need
// exact bytes ask for NUL-delimited output instead of parsing lines.
function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFailure) return null;
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    throw new GitError(`git ${args.join(' ')} failed: ${stderr || err.message}`, args, stderr);
  }
}

function isGitRepo(cwd) {
  return git(cwd, ['rev-parse', '--git-dir'], { allowFailure: true }) !== null;
}

// A shallow or partial clone can hide the very history this tool reasons about.
// Detecting it is what lets the verifier fail closed instead of guessing.
function isShallow(cwd) {
  const out = git(cwd, ['rev-parse', '--is-shallow-repository'], { allowFailure: true });
  return out !== null && out.trim() === 'true';
}

function resolve(cwd, ref) {
  const out = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true });
  return out === null ? null : out.trim();
}

function mergeBase(cwd, a, b) {
  const out = git(cwd, ['merge-base', a, b], { allowFailure: true });
  return out === null ? null : out.trim();
}

// Paths changed between two commits, as an ordered, de-duplicated list.
// NUL-delimited so newlines in filenames cannot desynchronize the parse.
function changedFiles(cwd, from, to) {
  const out = git(cwd, ['diff', '--name-only', '-z', `${from}`, `${to}`], { allowFailure: true });
  if (out === null) return null;
  const seen = new Set();
  for (const path of out.split('\0')) {
    if (path) seen.add(path);
  }
  return [...seen];
}

function commitCount(cwd, from, to) {
  const out = git(cwd, ['rev-list', '--count', `${from}..${to}`], { allowFailure: true });
  return out === null ? null : Number(out.trim());
}

// Committer date as a UTC ISO-8601 string, so reports are stable across machines.
function commitDate(cwd, ref) {
  const out = git(cwd, ['show', '-s', '--format=%cI', ref], { allowFailure: true });
  return out === null ? null : out.trim();
}

function shortSha(sha) {
  return typeof sha === 'string' ? sha.slice(0, 12) : sha;
}

module.exports = { git, GitError, isGitRepo, isShallow, resolve, mergeBase, changedFiles, commitCount, commitDate, shortSha };
