'use strict';

// Path classification and exclusion rules.
//
// Everything here is deterministic path matching. No file contents are read
// and no judgement about code quality is made or implied.

const fs = require('fs');
const path = require('path');

// Protected boundaries are areas where a silently-untested merge tends to be
// expensive to undo. `blocking: false` categories are reported but never
// change the verdict.
const PROTECTED_CATEGORIES = [
  {
    id: 'migration',
    label: 'database migration',
    blocking: true,
    patterns: [/(^|\/)migrations?(\/|$)/i, /(^|\/)migrate(\/|$)/i, /(^|\/)db\/migrate(\/|$)/i, /(^|\/)alembic(\/|$)/i],
  },
  {
    id: 'schema',
    label: 'data or API schema',
    blocking: true,
    patterns: [/(^|\/)schema[^/]*\.(sql|prisma|graphql|gql|json|ya?ml)$/i, /(^|\/)openapi[^/]*\.(ya?ml|json)$/i, /(^|\/)swagger[^/]*\.(ya?ml|json)$/i, /\.schema\.json$/i, /(^|\/)schema(\/|$)/i],
  },
  {
    id: 'auth',
    label: 'authentication or authorization',
    blocking: true,
    patterns: [/(^|\/)auth[nz]?(\/|$)/i, /(^|\/)(login|logout|session|oauth|saml|sso)[^/]*\.[a-z0-9]+$/i, /(^|\/)(auth|jwt|token)[^/]*\.[a-z0-9]+$/i],
  },
  {
    id: 'secrets',
    label: 'secret or credential material',
    blocking: true,
    patterns: [/(^|\/)\.env($|\.)/i, /(^|\/)secrets?(\/|$)/i, /(^|\/)credentials?(\/|$)/i, /\.(pem|p12|pfx|keystore)$/i, /(^|\/)[^/]*_rsa$/i],
  },
  {
    id: 'billing',
    label: 'billing or payments',
    blocking: true,
    patterns: [/(^|\/)(billing|payments?|invoicing?|subscriptions?)(\/|$)/i, /(^|\/)(stripe|paypal|braintree)[^/]*\.[a-z0-9]+$/i],
  },
  {
    id: 'policy',
    label: 'access policy or row-level security',
    blocking: true,
    patterns: [/(^|\/)(policies|policy|rls|rbac|permissions?)(\/|$)/i, /\.rego$/i, /(^|\/)(rls|policy)[^/]*\.sql$/i],
  },
  {
    // Advisory by design: for a great many repositories CI and deployment
    // configuration changes constantly and is itself well covered by CI.
    id: 'ci-deploy',
    label: 'CI or deployment configuration',
    blocking: false,
    patterns: [/(^|\/)\.github\/workflows(\/|$)/i, /(^|\/)Dockerfile[^/]*$/i, /(^|\/)docker-compose[^/]*\.ya?ml$/i, /(^|\/)(k8s|kubernetes|helm|terraform)(\/|$)/i, /\.tf$/i],
  },
];

// Generated and vendored artifacts are excluded from overlap analysis: two
// sides editing a lockfile is a mechanical collision, not evidence that
// untested behaviour was combined.
const DEFAULT_EXCLUDE_PATTERNS = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?)$/i,
  /(^|\/)(Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum|flake\.lock)$/i,
  /(^|\/)(dist|build|out|vendor|node_modules|__generated__|\.next|target)(\/|$)/i,
  /\.min\.(js|css)$/i,
  /(^|\/)[^/]*\.generated\.[a-z0-9]+$/i,
  /(^|\/)[^/]*\.pb\.(go|js|ts|py)$/i,
  /(^|\/)[^/]*_pb2(_grpc)?\.py$/i,
];

function classify(file) {
  const hits = [];
  for (const category of PROTECTED_CATEGORIES) {
    if (category.patterns.some((re) => re.test(file))) hits.push(category);
  }
  return hits;
}

function isDefaultExcluded(file) {
  return DEFAULT_EXCLUDE_PATTERNS.some((re) => re.test(file));
}

// Translates one gitignore-style line into an anchored regular expression.
// Supports comments, negation, `**`, `*`, `?`, leading-slash anchoring and
// trailing-slash directory matching. Character classes are not supported.
function patternToRegExp(rawPattern) {
  let pattern = rawPattern;
  const negated = pattern.startsWith('!');
  if (negated) pattern = pattern.slice(1);

  const dirOnly = pattern.endsWith('/');
  if (dirOnly) pattern = pattern.slice(0, -1);

  // A pattern containing a slash anywhere but the end is anchored to the repo
  // root, matching gitignore semantics; otherwise it matches at any depth.
  const anchored = pattern.startsWith('/') || pattern.slice(0, -1).includes('/');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);

  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }

  const prefix = anchored ? '^' : '^(?:.*/)?';
  const suffix = dirOnly ? '(?:/.*)?$' : '(?:/.*)?$';
  return { regexp: new RegExp(prefix + source + suffix), negated, raw: rawPattern };
}

function parseIgnoreFile(contents) {
  const rules = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    rules.push(patternToRegExp(trimmed));
  }
  return rules;
}

function loadIgnoreRules(repoPath, ignoreFile) {
  const target = ignoreFile
    ? path.resolve(ignoreFile)
    : path.join(repoPath, '.mergeproofignore');
  if (!fs.existsSync(target)) return { rules: [], source: null };
  return { rules: parseIgnoreFile(fs.readFileSync(target, 'utf8')), source: target };
}

// Later rules win, so a `!pattern` line can re-include a previously ignored path.
function isIgnored(file, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.regexp.test(file)) ignored = !rule.negated;
  }
  return ignored;
}

module.exports = {
  PROTECTED_CATEGORIES,
  DEFAULT_EXCLUDE_PATTERNS,
  classify,
  isDefaultExcluded,
  patternToRegExp,
  parseIgnoreFile,
  loadIgnoreRules,
  isIgnored,
};
