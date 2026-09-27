"use strict";

const providerBoundary = "Checks, approvals, repository rules, currentness, provider history and repository/PR association remain provider-supplied.";
const provenanceBoundary = "The replay packet is unsigned, so replay and Git recomputation do not independently authenticate packet provenance.";

function project(result = null) {
  if (!result) return {
    state: "READY",
    tone: "unknown",
    title: "Recompute Git facts on your machine",
    summary: "Use the replay packet with a separately acquired copy of the repository to check applicable Git-derived facts directly from Git objects.",
    matched: 0,
    total: 0,
    rows: [],
    machine: null,
    providerBoundary,
    provenanceBoundary,
  };
  const rows = Array.isArray(result.independentlyRecomputedGitFacts?.rows)
    ? result.independentlyRecomputedGitFacts.rows.filter(row => row && typeof row.kind === "string" && typeof row.state === "string")
    : [];
  const matched = rows.filter(row => row.state === "MATCH").length;
  const machine = {
    overall: result.state || "UNAVAILABLE",
    replay: result.replayConsistency?.state || "UNAVAILABLE",
    git: result.independentlyRecomputedGitFacts?.state || "UNAVAILABLE",
    provider: result.providerRecordTrustedFacts?.state || "UNAVAILABLE",
    exitCode: Number.isSafeInteger(result.exitCode) ? result.exitCode : null,
  };
  const coherentComplete = result.schema === "urn:merge-proof:independent-verification-result:1" &&
    machine.overall === "INDEPENDENT_VERIFICATION_COMPLETE" &&
    machine.replay === "REPLAY_CONSISTENT" &&
    machine.git === "INDEPENDENTLY_RECOMPUTED" &&
    machine.provider === "NOT_INDEPENDENTLY_AUTHENTICATED" &&
    machine.exitCode === 0 && rows.length > 0 && matched === rows.length;
  const coherentFailure = result.schema === "urn:merge-proof:independent-verification-result:1" &&
    machine.overall === "INDEPENDENT_VERIFICATION_FAILED" &&
    machine.replay === "REPLAY_CONSISTENT" &&
    machine.git === "INDEPENDENT_VERIFICATION_DIVERGED" &&
    machine.provider === "NOT_INDEPENDENTLY_AUTHENTICATED" &&
    machine.exitCode === 5 && rows.some(row => row.state === "DIVERGED");
  if (coherentComplete) return {
    state: "COMPLETE",
    tone: "good",
    title: "Git facts independently recomputed",
    summary: "A separately acquired copy of the repository confirmed the applicable Git-derived facts behind this merge.",
    matched,
    total: rows.length,
    rows,
    machine,
    providerBoundary,
    provenanceBoundary,
  };
  if (coherentFailure) return {
    state: "FAILED",
    tone: "bad",
    title: "Git facts did not match",
    summary: "Independent Git-object recomputation found a demonstrated difference. Merge-Proof does not present this result as independently verified.",
    matched,
    total: rows.length,
    rows,
    machine,
    providerBoundary,
    provenanceBoundary,
  };
  return {
    state: "NOT_PROVEN",
    tone: "unknown",
    title: "Independent Git verification not proven",
    summary: "The available result did not establish a complete match for every applicable Git-derived fact.",
    matched,
    total: rows.length,
    rows,
    machine,
    providerBoundary,
    provenanceBoundary,
  };
}

function summaryHtml(result, { detailUrl }, escape) {
  const value = project(result);
  const count = value.state === "READY"
    ? "Run from your repository copy"
    : `${value.matched} / ${value.total} matched`;
  return `<aside class="independent-verification-status ${escape(value.tone)}" aria-label="Independent Git verification">
    <p class="independent-verification-heading"><span>Independent Git verification</span><strong>${escape(value.state === "COMPLETE" ? "Complete" : value.state === "FAILED" ? "Mismatch" : value.state === "READY" ? "Available" : "Not proven")}</strong></p>
    <h2>${escape(value.title)}</h2><p>${escape(value.summary)}</p>
    <p class="independent-verification-count"><strong>${escape(count)}</strong></p>
    ${value.state === "COMPLETE" ? "<p>Candidate, trees, merge relationship, parents and landed state were recomputed directly from Git objects.</p>" : ""}
    <small><strong>What still relies on GitHub:</strong> ${escape(value.providerBoundary)} ${escape(value.provenanceBoundary)}</small>
    <p><a href="${escape(detailUrl)}">${value.state === "READY" ? "How independent verification works" : "View independent verification"} →</a></p>
  </aside>`;
}

function technicalRows(value, escape) {
  if (!value.rows.length) return "<p>No independently recomputed Git-fact rows are available.</p>";
  return `<div class="independent-verification-table-wrap"><table class="independent-verification-table"><thead><tr><th>Git-derived fact</th><th>Result</th><th>Observed or expected value</th></tr></thead><tbody>${value.rows.map(row => `<tr><td>${escape(row.kind)}</td><td><strong>${escape(row.state)}</strong></td><td><code>${escape(row.actual ?? row.expected ?? "Unavailable")}</code></td></tr>`).join("")}</tbody></table></div>`;
}

function page(result, { packetUrl, proofUrl, resultUrl = null, command }, escape) {
  const brand = require("./customer-brand");
  const value = project(result);
  const complete = value.state === "COMPLETE";
  const headline = complete
    ? "Git facts independently recomputed from the repository."
    : value.state === "READY"
      ? "Verify Git facts from your own repository copy."
      : value.title;
  const lede = complete
    ? `${value.matched} / ${value.total} applicable Git-derived facts matched a separately acquired repository object store.`
    : value.summary;
  const machine = value.machine;
  const technical = machine ? `<dl class="independent-verification-machine">
    <dt>Overall result</dt><dd>${escape(machine.overall)}</dd>
    <dt>Replay consistency</dt><dd>${escape(machine.replay)}</dd>
    <dt>Git-object recomputation</dt><dd>${escape(machine.git)}</dd>
    <dt>Provider records</dt><dd>${escape(machine.provider)}</dd>
    <dt>Exit code</dt><dd>${escape(machine.exitCode ?? "Unavailable")}</dd>
  </dl>${technicalRows(value, escape)}` : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merge Proof · Independent Git Verification</title><style>${brand.css}</style><body class="brand-page proof-page">${brand.header}<main id="main" class="independent-verification-page">
    <header class="proof-intro"><p class="eyebrow">INDEPENDENT GIT VERIFICATION</p><h1>${escape(headline)}</h1><p class="merge-truth-lede"><strong>${escape(lede)}</strong></p><p class="merge-truth-context">${complete ? "Merge-Proof did not rely only on the supplied replay packet for these Git facts. It recomputed them from Git objects in a separately acquired bare repository." : "Download the replay packet, acquire a bare repository from a location you trust independently, and run the recorded verification command."}</p></header>
    <section class="independent-verification-boundaries" aria-labelledby="verification-boundaries-heading"><h2 id="verification-boundaries-heading">What this establishes</h2><div class="independent-verification-grid"><article><h3>Git-derived facts</h3><strong>${escape(complete ? `${value.matched} / ${value.total} matched` : value.state === "READY" ? "Ready to recompute" : value.title)}</strong><p>Candidate, commit trees, merge relationship, parents, expected tree and landed state are checked where applicable.</p></article><article><h3>What still relies on GitHub</h3><strong>Not independently authenticated</strong><p>${escape(value.providerBoundary)}</p></article><article><h3>Packet provenance</h3><strong>Unsigned</strong><p>${escape(value.provenanceBoundary)}</p></article></div></section>
    <section aria-labelledby="run-independent-heading"><h2 id="run-independent-heading">Run it independently</h2><p><a class="primary" href="${escape(packetUrl)}" download>Download replay packet</a></p><pre class="independent-verification-command">${escape(command)}</pre></section>
    ${machine ? `<details class="independent-verification-details"><summary>Technical verification details</summary>${technical}<p><a href="${escape(packetUrl)}">Inspect replay packet JSON</a>${resultUrl ? ` · <a href="${escape(resultUrl)}">Inspect verification result JSON</a>` : ""}</p></details>` : ""}
    <p><a href="${escape(proofUrl)}">← Back to Merge Truth proof</a></p>
  </main></body></html>`;
}

module.exports = { page, project, summaryHtml };
