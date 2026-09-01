'use strict';

// Rendering only. Every fact printed here comes from the analysis result;
// this module never re-derives a verdict.

const VERDICT_LINE = {
  VERIFIED: 'VERIFIED  - the checks merge-proof implements found the evidence they look for',
  NOT_PROVEN: 'NOT_PROVEN - this merge may be fine, but the available evidence does not prove it',
  FAIL: 'FAIL      - merge-proof could not establish a result',
};

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((entry, index) => (index === 0 ? entry : indent + entry)).join('\n');
}

function renderFinding(finding, width) {
  const indent = '    ';
  const out = [`  [${finding.severity === 'advisory' ? 'advisory' : finding.id}] ${finding.title}`];
  const field = (label, value) => {
    if (!value) return;
    out.push(`${indent}${label.padEnd(18)}${wrap(value, width - indent.length - 18, indent + ' '.repeat(18))}`);
  };
  field('What happened:', finding.whatHappened);
  field('Why it matters:', finding.whyItMatters);
  field('Missing evidence:', finding.missingEvidence);
  field('Do next:', finding.doNext);
  return out.join('\n');
}

function renderHuman(result, { width = 100 } = {}) {
  const lines = [];
  lines.push(`merge-proof ${result.tool.version}`);
  lines.push('');
  lines.push(VERDICT_LINE[result.verdict] || result.verdict);
  lines.push('');

  if (result.refs && result.refs.base) {
    lines.push(`  base        ${result.refs.base.ref} @ ${result.refs.base.sha.slice(0, 12)}`);
    lines.push(`  candidate   ${result.refs.head.ref} @ ${result.refs.head.sha.slice(0, 12)}`);
    lines.push(`  merge base  ${result.refs.forkPoint.sha.slice(0, 12)}`);
    const metrics = result.metrics;
    lines.push(`  base moved  ${metrics.baseAdvanceCommits} commit(s) since divergence`);
    lines.push(`  files       ${metrics.candidateFileCount} changed by candidate, ${metrics.overlapCount} also changed on base`);
    lines.push('');
  }

  if (result.findings.length === 0) {
    lines.push('  No blocking findings.');
    lines.push('');
  } else {
    lines.push(`Findings (${result.findings.length}):`);
    lines.push('');
    for (const finding of result.findings) {
      lines.push(renderFinding(finding, width));
      lines.push('');
    }
  }

  if (result.advisories && result.advisories.length > 0) {
    lines.push(`Advisories (${result.advisories.length}, do not affect the verdict):`);
    lines.push('');
    for (const advisory of result.advisories) {
      lines.push(renderFinding(advisory, width));
      lines.push('');
    }
  }

  // Always printed. A verdict is only meaningful alongside its coverage.
  lines.push('Not checked by this release:');
  for (const item of result.notChecked) {
    lines.push(`  - ${item.id}: ${item.reason}`);
  }
  lines.push('');
  lines.push('merge-proof checks merge evidence. It is not a code reviewer, a bug finder,');
  lines.push('a correctness proof, a security scanner, or a replacement for CI.');
  return lines.join('\n');
}

function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

function renderMarkdown(result) {
  const lines = [];
  lines.push(`### merge-proof: \`${result.verdict}\``);
  lines.push('');
  lines.push(VERDICT_LINE[result.verdict] ? VERDICT_LINE[result.verdict].split(' - ').slice(1).join(' - ') : '');
  lines.push('');

  if (result.refs && result.refs.base) {
    lines.push('| | |');
    lines.push('|---|---|');
    lines.push(`| base | \`${result.refs.base.ref}\` @ \`${result.refs.base.sha.slice(0, 12)}\` |`);
    lines.push(`| candidate | \`${result.refs.head.ref}\` @ \`${result.refs.head.sha.slice(0, 12)}\` |`);
    lines.push(`| base moved | ${result.metrics.baseAdvanceCommits} commit(s) since divergence |`);
    lines.push(`| overlapping files | ${result.metrics.overlapCount} |`);
    lines.push('');
  }

  for (const finding of [...result.findings, ...(result.advisories || [])]) {
    lines.push(`#### ${finding.severity === 'advisory' ? 'Advisory' : finding.id}: ${finding.title}`);
    lines.push('');
    lines.push(`**What happened.** ${finding.whatHappened}`);
    lines.push('');
    lines.push(`**Why it matters.** ${finding.whyItMatters}`);
    lines.push('');
    if (finding.missingEvidence) {
      lines.push(`**Missing evidence.** ${finding.missingEvidence}`);
      lines.push('');
    }
    lines.push(`**Do next.** ${finding.doNext}`);
    lines.push('');
  }

  lines.push('<details><summary>Not checked by this release</summary>');
  lines.push('');
  for (const item of result.notChecked) {
    lines.push(`- \`${item.id}\`: ${item.reason}`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push('<sub>merge-proof checks merge evidence. It is not a code reviewer, a bug finder, a correctness proof, or a replacement for CI.</sub>');
  return lines.join('\n');
}

module.exports = { renderHuman, renderJson, renderMarkdown, VERDICT_LINE };
