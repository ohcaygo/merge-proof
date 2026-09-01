#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { analyze } = require('../src/analyze');
const report = require('../src/report');
const git = require('../src/git');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Stable exit codes. These are part of the public contract.
const EXIT = { OK: 0, USAGE: 1, NOT_PROVEN: 2, FAIL: 3 };

const HELP = `merge-proof ${pkg.version}

  Before an AI-authored PR merges, determine whether the available evidence
  actually proves the candidate against the repository state being merged.

Usage
  npx merge-proof [options]

Options
  --base <ref>        Base ref the candidate will merge into (e.g. origin/main).
                      Inferred from GITHUB_BASE_REF or origin/HEAD when omitted.
  --head <ref>        Candidate ref to verify. Default: HEAD.
  --repo <path>       Repository to analyze. Default: current directory.
  --json              Emit the full result as JSON instead of text.
  --markdown          Emit the result as Markdown.
  --fail-on <level>   Exit non-zero on a verdict. One of:
                        none        never exit non-zero (default, diagnostic)
                        fail        exit 3 on FAIL
                        not-proven  exit 2 on NOT_PROVEN, 3 on FAIL
  --ignore-file <p>   Path to an exclusion file. Default: .mergeproofignore
  --stale-commits <n> Advisory threshold for base advance. Default: 100.
  --stale-days <n>    Advisory threshold for base age in days. Default: 30.
  -h, --help          Show this help.
  -v, --version       Show the version.

Exit codes
  0  verdict reported (always, unless --fail-on says otherwise)
  1  usage or internal error
  2  NOT_PROVEN, with --fail-on not-proven
  3  FAIL, with --fail-on not-proven or --fail-on fail

Verdicts
  VERIFIED    The checks merge-proof implements found the evidence they look for.
              It is not a proof of correctness.
  NOT_PROVEN  The merge may be fine, but the evidence does not establish it.
  FAIL        merge-proof could not safely establish a result.

merge-proof runs entirely on local git state. It makes no network requests,
no model or API calls, and collects no data.
`;

function parseArgs(argv) {
  const options = {
    repoPath: process.cwd(),
    base: null,
    head: 'HEAD',
    format: 'human',
    failOn: 'none',
    ignoreFile: null,
    staleCommits: undefined,
    staleDays: undefined,
    help: false,
    version: false,
  };

  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Option ${flag} requires a value.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h': case '--help': options.help = true; break;
      case '-v': case '--version': options.version = true; break;
      case '--json': options.format = 'json'; break;
      case '--markdown': options.format = 'markdown'; break;
      case '--base': options.base = takeValue(i, arg); i += 1; break;
      case '--head': options.head = takeValue(i, arg); i += 1; break;
      case '--repo': options.repoPath = path.resolve(takeValue(i, arg)); i += 1; break;
      case '--ignore-file': options.ignoreFile = takeValue(i, arg); i += 1; break;
      case '--fail-on': {
        const value = takeValue(i, arg); i += 1;
        if (!['none', 'fail', 'not-proven'].includes(value)) {
          throw new Error(`Unknown --fail-on value "${value}". Use none, fail, or not-proven.`);
        }
        options.failOn = value;
        break;
      }
      case '--stale-commits': options.staleCommits = Number(takeValue(i, arg)); i += 1; break;
      case '--stale-days': options.staleDays = Number(takeValue(i, arg)); i += 1; break;
      default:
        throw new Error(`Unknown option "${arg}". Run merge-proof --help.`);
    }
  }
  return options;
}

// Base inference, in order of trustworthiness. Inference never invents a ref:
// each candidate must resolve in the repository or it is skipped.
function inferBase(repoPath) {
  if (process.env.GITHUB_BASE_REF) {
    for (const candidate of [`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF]) {
      if (git.resolve(repoPath, candidate)) return candidate;
    }
  }
  const originHead = git.git(repoPath, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { allowFailure: true });
  if (originHead) {
    const ref = originHead.trim().replace('refs/remotes/', '');
    if (git.resolve(repoPath, ref)) return ref;
  }
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    if (git.resolve(repoPath, candidate)) return candidate;
  }
  return null;
}

function exitCodeFor(verdict, failOn) {
  if (failOn === 'none') return EXIT.OK;
  if (verdict === 'FAIL') return EXIT.FAIL;
  if (verdict === 'NOT_PROVEN' && failOn === 'not-proven') return EXIT.NOT_PROVEN;
  return EXIT.OK;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return EXIT.USAGE;
  }

  if (options.help) { process.stdout.write(HELP); return EXIT.OK; }
  if (options.version) { process.stdout.write(`${pkg.version}\n`); return EXIT.OK; }

  if (!options.base && git.isGitRepo(options.repoPath)) {
    options.base = inferBase(options.repoPath);
  }

  let result;
  try {
    result = analyze({ ...options, version: pkg.version });
  } catch (err) {
    process.stderr.write(`merge-proof: ${err.message}\n`);
    return EXIT.USAGE;
  }

  if (options.format === 'json') process.stdout.write(`${report.renderJson(result)}\n`);
  else if (options.format === 'markdown') process.stdout.write(`${report.renderMarkdown(result)}\n`);
  else process.stdout.write(`${report.renderHuman(result)}\n`);

  return exitCodeFor(result.verdict, options.failOn);
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs, inferBase, exitCodeFor, EXIT, HELP };
