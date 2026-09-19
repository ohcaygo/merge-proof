'use strict';

// Presentation of recorded evidence only: never rerun checks or upgrade verdicts.
const { VERDICT, NOT_IMPLEMENTED } = require('./analyze');
const verdicts = Object.keys(VERDICT);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
const validRepo = (value) => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value);

function requireInput(condition, message) {
  if (!condition) throw new Error(`Invalid report input: ${message}`);
}

function normalize(data, options = {}) {
  requireInput(data && typeof data === 'object' && !Array.isArray(data), 'expected a JSON object');
  let rows;
  let notChecked;
  let kind;
  if (Array.isArray(data.rows)) {
    kind = 'collector';
    requireInput(!options.repo || validRepo(options.repo), '--repo must be owner/name');
    rows = data.rows.filter((row) => !options.repo || row?.repo === options.repo).map((row, index) => {
      requireInput(row && validRepo(row.repo) && Number.isSafeInteger(row.pr) && row.pr > 0, `row ${index + 1} needs a repository and positive PR number`);
      const unresolved = text(row.unresolvable);
      requireInput(row.unresolvable == null || unresolved, `PR ${row.pr}: malformed unresolvable reason`);
      requireInput(unresolved ? row.verdict == null : verdicts.includes(row.verdict), `PR ${row.pr}: unknown, missing or contradictory verdict`);
      if (!unresolved) {
        requireInput(Array.isArray(row.findings) && row.findings.every(text), `PR ${row.pr}: findings must be an array of IDs`);
        requireInput(row.verdict === 'VERIFIED' ? row.findings.length === 0 : row.findings.length > 0, `PR ${row.pr}: verdict contradicts findings`);
        requireInput(sha(row.squash) && sha(row.base) && (row.verdict === 'FAIL' || sha(row.head)), `PR ${row.pr}: recorded merge/base/head SHAs are required`);
        for (const metric of ['baseAdvanceCommits', 'candidateFileCount', 'overlapCount']) {
          requireInput(row[metric] == null || (Number.isSafeInteger(row[metric]) && row[metric] >= 0), `PR ${row.pr}: invalid ${metric}`);
        }
      }
      return { ...row, findings: (row.findings || []).map((id) => ({ id })), label: `${row.repo} #${row.pr}` };
    });
    // One PR can be recorded against multiple landed squash commits.
    const ids = rows.map((row) => `${row.repo}#${row.pr}@${row.squash || 'not-recorded'}`);
    requireInput(new Set(ids).size === ids.length, 'duplicate merge records would inflate counts');
    notChecked = NOT_IMPLEMENTED;
  } else {
    kind = 'cli';
    requireInput(!options.repo, '--repo filtering is only supported for collector datasets');
    requireInput(data.schemaVersion === 1 && data.tool?.name === 'merge-proof' && text(data.tool.version), 'expected a merge-proof CLI schemaVersion 1 result or collector rows');
    requireInput(verdicts.includes(data.verdict), 'unknown or missing verdict');
    requireInput(Array.isArray(data.findings) && data.findings.every((f) => text(f?.id) && text(f.whatHappened)), 'CLI findings need id and whatHappened');
    requireInput(data.verdict === 'VERIFIED' ? data.findings.length === 0 : data.findings.length > 0, 'verdict contradicts findings');
    requireInput(text(data.repository?.path), 'CLI repository.path is required');
    requireInput(Array.isArray(data.notChecked) && data.notChecked.every((item) => text(item?.id) && text(item.reason)), 'CLI coverage list is required');
    if (data.verdict !== 'FAIL' && !(data.verdict === 'NOT_PROVEN' && data.collectionComplete === false)) {
      requireInput(['base', 'head', 'forkPoint'].every((key) => sha(data.refs?.[key]?.sha)), 'CLI result needs base, head and fork-point SHAs');
    }
    rows = [{ ...data, ...data.metrics, repo: data.repository.path, label: data.repository.path,
      base: data.refs?.base?.sha, head: data.refs?.head?.sha }];
    notChecked = [...new Map([...NOT_IMPLEMENTED, ...data.notChecked].map((item) => [item.id, item])).values()];
  }
  requireInput(rows.length > 0, 'scope contains zero records; check --repo and the input');
  const counts = { VERIFIED: 0, NOT_PROVEN: 0, FAIL: 0, unresolvable: 0 };
  for (const row of rows) counts[row.unresolvable ? 'unresolvable' : row.verdict] += 1;
  return { rows, counts, notChecked, kind };
}

function explanation(row, finding) {
  if (finding.whatHappened) return finding.whatHappened;
  if (finding.id === 'BASE_DRIFT_UNVERIFIED') {
    return `The base advanced by ${row.baseAdvanceCommits ?? 'an unrecorded number of'} commit(s), with ${row.overlapCount ?? 'an unrecorded number of'} overlapping file(s). This flags a possible evidence gap for the combined state. CI results were not inspected.`;
  }
  if (finding.id === 'PROTECTED_BOUNDARY') {
    const categories = Object.keys(row.protectedCategories || {}).join(', ') || 'a protected category';
    return `The candidate changed ${categories}. The implemented path checks request closer validation of this boundary; they do not establish that code is defective or that existing CI failed.`;
  }
  return row.verdict === 'FAIL'
    ? 'The recorded policy reported FAIL. Inspect its finding and policy version: current policies use FAIL for a demonstrated unmet requirement; older records may use it for collection failure.'
    : 'The source records this evidence-gap condition without a detailed explanation. Inspect the original evidence before deciding what to do.';
}

function renderHtml(model, { scope, source, sha256 }) {
  const e = escapeHtml;
  const { rows, counts, notChecked, kind } = model;
  const notable = rows.filter((row) => row.verdict !== 'VERIFIED' || row.unresolvable);
  const repoNames = [...new Set(rows.map((row) => row.repo))];
  const prLink = (row) => row.pr
    ? `<a href="https://github.com/${e(row.repo)}/pull/${row.pr}">${e(row.label)}</a>` : e(row.label);
  const recommendation = counts.FAIL || counts.unresolvable
    ? 'Resolve the recorded failures or missing collection prerequisites, then rerun the same scope. Until then, leave those records unresolved; this report cannot support a clean evidence conclusion for them.'
    : counts.NOT_PROVEN
      ? 'Inspect the flagged records and any existing validation of the combined state. If evidence is insufficient for the risk, validate that state and repeat the assessment. Start with the small flagged set rather than changing every merge workflow.'
      : 'Do nothing on the basis of these checks alone. No implemented evidence-gap condition was recorded in this scope. Keep normal CI and review practices.';
  const details = notable.map((row) => `<article class="finding">
    <h3>${prLink(row)} <span class="badge">${e(row.unresolvable ? 'UNRESOLVABLE' : row.verdict)}</span></h3>
    ${row.unresolvable ? `<p>Collection could not produce a verdict: ${e(row.unresolvable)}. This record is excluded from verdict counts and retained in scope. Restore the missing evidence and recollect it.</p>` : row.findings.map((f) => `<p><strong>${e(f.id)}</strong><br>${e(explanation(row, f))}</p>${f.missingEvidence ? `<p><strong>Missing evidence:</strong> ${e(f.missingEvidence)}</p>` : ''}${f.doNext ? `<p><strong>Do next:</strong> ${e(f.doNext)}</p>` : ''}`).join('')}
    <p class="muted refs">Base: ${e(row.base || 'not recorded')}<br>Candidate: ${e(row.head || 'not recorded')}${row.squash ? `<br>Landed squash: ${e(row.squash)}` : ''}</p>
  </article>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>Merge-Proof pilot report</title><style>
@page { size: A4; margin: 17mm 16mm; @bottom-right { content: counter(page) " / " counter(pages); font: 9px Arial, sans-serif; color: #526269; } }
* { box-sizing: border-box; } body { margin: 0 auto; padding: 36px; max-width: 980px; color: #18272d; background: #fff; font: 14px/1.5 Arial, sans-serif; }
h1 { font-size: 34px; line-height: 1.1; margin: 8px 0 20px; } h2 { font-size: 21px; margin: 28px 0 12px; } h3 { font-size: 16px; margin: 0 0 12px; }
p { margin: 8px 0 12px; } .eyebrow { letter-spacing: 2px; font-size: 11px; font-weight: bold; color: #276352; } .muted { color: #526269; font-size: 12px; }
.scope { border-left: 4px solid #276352; padding: 5px 0 5px 16px; overflow-wrap: anywhere; }
.counts { display: flex; gap: 10px; margin: 20px 0; } .count { flex: 1; background: #eef3f1; padding: 14px; border-top: 3px solid #276352; } .count strong { display: block; font-size: 30px; } .count span { font-size: 11px; font-weight: bold; }
.notice { background: #f5f1e7; padding: 14px 18px; } .finding { border-top: 1px solid #c6d2ce; padding-top: 16px; margin-top: 16px; } .badge { display: inline-block; font-size: 10px; padding: 3px 7px; background: #eee; }
a { color: #205b4d; text-decoration: underline; } .refs { font-family: monospace; overflow-wrap: anywhere; } table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; } th, td { text-align: left; padding: 7px; border-bottom: 1px solid #dbe1df; vertical-align: top; overflow-wrap: anywhere; } th { background: #eef3f1; } th:first-child { width: 34%; } th:nth-child(2) { width: 18%; } thead { display: table-header-group; }
li { margin-bottom: 6px; } footer { border-top: 1px solid #c6d2ce; margin-top: 24px; padding-top: 10px; }
@media print { body { padding: 0; max-width: none; font-size: 11px; } h1 { font-size: 28px; } h2 { font-size: 18px; } h3 { font-size: 13px; } .muted { font-size: 10px; } h2,h3 { break-after: avoid; } .finding, tr, .counts, .notice { break-inside: avoid; } .appendix { break-before: page; } a { text-decoration: none; } .count, .notice, th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
@media (max-width: 600px) { body { padding: 18px; } .counts { flex-wrap: wrap; } .count { min-width: 40%; } }
</style></head><body>
<div class="eyebrow">MERGE-PROOF / GUIDED PILOT ASSESSMENT</div>
<h1>Merge evidence, made inspectable.</h1>
<section class="scope"><strong>Scope</strong><p>${e(scope)}</p><p>${e(repoNames.join(', '))} &middot; ${rows.length} selected record(s).</p></section>
${repoNames.includes('microsoft/kiota') ? '<p class="muted">Public Kiota methodology sample. Microsoft is not a customer; no customer relationship or endorsement is implied.</p>' : ''}
<div class="counts">${verdicts.map((v) => `<div class="count"><strong>${counts[v]}</strong><span>${v}</span></div>`).join('')}</div>
<p>${counts.VERIFIED + counts.NOT_PROVEN + counts.FAIL} verdict(s) recorded; ${counts.unresolvable} unresolvable record(s), excluded from verdict counts. Counts are per record, not per finding.</p>
<div class="notice"><strong>NOT_PROVEN != bad code.</strong> NOT_PROVEN means missing evidence under implemented checks, not defective code. VERIFIED means those checks found no blocking evidence gap; it is not proof of correctness. FAIL means current bound evidence demonstrates an unmet required condition. Historical inputs retain their recorded verdict and policy meaning.</div>
<h2>Recommendation</h2><p>${e(recommendation)}</p>
<p><strong>Do nothing is an option.</strong> If the recorded limitation is acceptable for this scope, document that decision and leave the workflow unchanged. Accepting a gap does not change a NOT_PROVEN, FAIL or unresolvable record into VERIFIED. No action is executed by this report.</p>
<h2>Notable NOT_PROVEN / FAIL records</h2>${details || '<p>None in this scope. Normal CI and review remain necessary.</p>'}
<h2>Method and limits</h2>
<p>${kind === 'collector'
    ? 'This report renders recorded study/collect.js output; it does not fetch current repository or CI state. The collector examines selected agent-authored squash merges, using the squash commit first parent as base-at-merge and the fetched PR head as candidate. The source format does not record collection time or merge timestamps, so no date window is inferred. Sampling is purposive and bounded, not representative of all merges. See STUDY.md for methodology.'
    : 'This report renders one recorded local CLI analysis against its supplied base and candidate refs. It does not establish that the candidate landed on that base, fetch fresh evidence, or inspect CI. The CLI format has no capture timestamp; freshness must be established separately.'}</p>
<p>Implemented blocking checks: BASE_DRIFT_UNVERIFIED (overlapping base drift) and PROTECTED_BOUNDARY (sensitive path categories). Stale-base and CI/deploy path advisories do not affect verdict counts. The source JSON retains detailed metrics, exclusions and advisories; collector rows retain finding IDs rather than full file-level explanations.</p>
<strong>Not checked</strong><ul>${notChecked.map((item) => `<li><strong>${e(item.id)}</strong>: ${e(item.reason)}</li>`).join('')}</ul>
<p>This report cannot establish whether CI ran on the exact state that landed. It is not a code review, bug detector, security scan, correctness proof or replacement for CI.</p>
<footer class="muted">Source: ${e(source)}<br><span class="refs">Input SHA-256: ${e(sha256)}</span><br>Generated solely from the supplied JSON. Re-rendering does not refresh or authenticate its evidence.</footer>
<section class="appendix"><h2>Evidence register</h2><p class="muted">All selected records; full refs for notable records appear above. Abbreviated refs below are locators, not additional validation. The input JSON preserves full available evidence.</p>
<table><thead><tr><th>Record</th><th>Verdict</th><th>Base / candidate</th><th>Landed squash</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${prLink(row)}</td><td>${e(row.unresolvable ? 'UNRESOLVABLE' : row.verdict)}</td><td>${e(row.base?.slice(0, 12) || 'not recorded')}<br>${e(row.head?.slice(0, 12) || 'not recorded')}</td><td>${e(row.squash?.slice(0, 12) || 'not recorded')}</td></tr>`).join('')}</tbody></table></section>
</body></html>\n`;
}

module.exports = { normalize, renderHtml };
