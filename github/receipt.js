"use strict";
const { describeGap, explain } = require("./wording");
const { describe: describeActor, AGENT_IDENTITY_TEXT } = require("./actors");
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const UNREFRESHED = {
  state: "UNAVAILABLE",
  reason: "Refresh required before treating this saved receipt as current.",
};

// WHO / WHAT CHANGED THIS. Observations only; UNKNOWN stays UNKNOWN.
function actorLines(r) {
  const a = r.summary?.actors;
  if (!a || a.state !== "AVAILABLE")
    return [["Who changed this", `UNKNOWN (${a?.reason || "not collected"})`]];
  const list = (xs) =>
    xs.length ? xs.map(describeActor).join(", ") : "UNKNOWN";
  const rows = [
    ["Pull request opened by", describeActor(a.prAuthor)],
    ["Commits authored by", list(a.commitAuthors)],
    ["Commits committed by", list(a.commitCommitters)],
    ["Reviewed by", list(a.reviewers)],
    [
      "Checks published by",
      a.checkPublishers.length
        ? a.checkPublishers
            .map((x) => `${x.slug || `app ${x.appId}`} (GitHub App)`)
            .join(", ")
        : "UNKNOWN",
    ],
    ["Workflows started by", list(a.workflowActors)],
  ];
  if (a.mergedBy) rows.push(["Merged by", describeActor(a.mergedBy)]);
  rows.push([
    "App or bot authorship",
    `${a.agentIdentity} — ${AGENT_IDENTITY_TEXT[a.agentIdentity]}`,
  ]);
  if (a.commitsTruncated)
    rows.push([
      "Commit coverage",
      `First ${a.commitsObserved} commits only; this branch has more.`,
    ]);
  return rows;
}

function lines(r, current = UNREFRESHED) {
  const s = r.summary;
  return [
    ["Candidate", r.identity.headSha],
    ["Candidate tree", r.summary?.target?.value?.tree || "UNAVAILABLE"],
    ["Expected tree", r.expectedTree?.tree || "Independent reconstruction unavailable"],
    ["Evidence subject", r.subject?.id || "UNAVAILABLE"],
    ["Changed claims", current?.changed?.join(", ") || current?.touched?.join(", ") || "None recorded at this observation"],
    ["Current base at proof", r.identity.baseSha],
    [
      "Applicable validation state",
      s.target.value
        ? `${{ HEAD_CONTAINS_CURRENT_BASE: "Head includes current base", PR_TEST_MERGE: "Current test merge", MERGE_GROUP: "Merge group", LANDED_TWO_PARENT_MERGE: "Historical landed merge" }[s.target.value.kind] || s.target.value.kind}: ${s.target.value.sha}`
        : s.target.reason,
    ],
    [
      "Base movement",
      `${r.local.metrics.baseAdvanceCommits ?? "UNAVAILABLE"} commits`,
    ],
    [
      "Candidate/base overlap",
      `${r.local.metrics.overlapCount ?? "UNAVAILABLE"} files`,
    ],
    [
      "Required check conclusions satisfied",
      `${s.ci.acceptedCount} / ${(s.ci.required || []).length}`,
    ],
    ["Execution recorded on applicable state", s.ci.state],
    [
      "Human approval",
      s.approval.observed.length ? "OBSERVED" : "NOT OBSERVED",
    ],
    ["Current required approval", s.approval.state],
    [
      "Remote candidate",
      s.remote.state === "AVAILABLE" && s.remote.value.confirmed
        ? "CONFIRMED AT OBSERVATION"
        : "UNAVAILABLE / NOT CONFIRMED",
    ],
    ["Repository requirements", s.rules.state],
    [
      "Merge Proof required on this branch",
      s.gate
        ? s.gate.required === true
          ? `YES${s.gate.boundToThisApp === true ? ", bound to this App" : ", not bound to a specific App"}`
          : s.gate.required === false
            ? "NO"
            : "UNAVAILABLE"
        : "UNAVAILABLE",
    ],
    [current.reason === "REFRESH_REQUIRED" ? "Live recheck" : "Current receipt status", current.reason === "REFRESH_REQUIRED" ? "Not requested; see saved observation freshness above" : current.state],
    [
      "Protected boundary",
      r.local.collectionComplete === false || r.local.findings.some(f => f.id === "GIT_HISTORY_UNAVAILABLE")
        ? "UNAVAILABLE"
        : r.local.findings.find((f) => f.id === "PROTECTED_BOUNDARY")
            ?.whatHappened ||
          "No designated boundary detected under available path evidence",
    ],
    ...(s.ci.selfReference
      ? [["Merge Proof's own required check", s.ci.selfReference.note]]
      : []),
  ];
}

function plain(r, policyResult) {
  const items = explain(r, policyResult);
  if (!items.length)
    return [
      {
        plain: "Everything this policy checks was established for this exact state.",
        why: null,
        doNext: "Recheck before merging; evidence can move.",
        reproof: "AUTOMATIC",
        blocksMerge: false,
      },
    ];
  return items;
}

function text(r, current, policyResult = null) {
  const items = plain(r, policyResult);
  const remediation = require("./remediation").build(r, current, policyResult);
  return (
    `MERGE PROOF\n${r.verdict}\n${r.identity.repository} #${r.identity.pr}\n\n` +
    (remediation ? remediation.items.map(x => `${x.summary}\nWhy it matters: ${x.whyItMatters}\nWhat to do: ${x.nextAction}\nAutomatic recheck: ${x.automaticRecheck.text}\n`).join("\n") + `Merge status: ${remediation.mergeConsequence.text}\n\nTECHNICAL DETAILS\n` : "") +
    (policyResult ? `MERGE POLICY\n${policyResult.mergeConsequence}\n\n` : "") +
    lines(r, current)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    `\n\nWHO / WHAT CHANGED THIS\n` +
    actorLines(r)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    `\n\nMISSING EVIDENCE\n${r.gaps.map(describeGap).join("\n") || "None under the implemented policy."}\n\nWHAT TO DO\n${items
      .map(
        (x) =>
          `- ${x.plain}${x.blocksMerge === true ? " [BLOCKS MERGE]" : policyResult?.enforced ? " [reported, not blocking]" : ""}\n  ${x.doNext || ""}`,
      )
      .join("\n")}\n\nNEXT\n${r.next}\n\nNothing in this receipt establishes that the code contains a bug.\nReceipt: ${r.receiptId}\nObserved: ${r.issuedAt}\n`
  );
}

function html(r, current, policyResult = null, remediation = require("./remediation").build(r, current, policyResult)) {
  const items = plain(r, policyResult);
  const item = (x) =>
    `<li><strong>${escape(x.plain)}</strong>${x.blocksMerge === true ? ' <span class="blocks">BLOCKS MERGE</span>' : policyResult?.enforced ? ' <span class="reported">reported, not blocking</span>' : ""}${x.why ? `<br><small>Why it matters: ${escape(x.why)}</small>` : ""}${x.doNext ? `<br>What to do: ${escape(x.doNext)}` : ""}<br><small>Re-proof: ${x.reproof === "AUTOMATIC" ? "automatic once that happens" : "run proof again from your account"}</small></li>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Merge Proof receipt</title><style>
  body{font:15px/1.45 system-ui,sans-serif;color:#172a29;background:#f1f4ef;margin:0;padding:24px}main{max-width:760px;margin:auto;background:white;padding:32px;border:1px solid #cad5cd;border-radius:16px}button{display:block;margin:18px 0 0;padding:10px 16px;background:#174f43;color:white;border:0;border-radius:8px;cursor:pointer}h1{font-size:42px;margin:8px 0}header{border-bottom:2px solid #174f43;padding-bottom:18px}.brand{letter-spacing:.18em;font-size:13px}dl{display:grid;grid-template-columns:1fr 1.3fr;gap:8px}dt{color:#53655c}dd{margin:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer}small{color:#53655c}ul{padding-left:20px}li{margin:12px 0}.policy{background:#e6ece8;border-left:4px solid #174f43;padding:12px 16px;margin:18px 0}.blocks{background:#7a1f1f;color:white;border-radius:4px;padding:1px 7px;font-size:12px}.reported{background:#e6ece8;border-radius:4px;padding:1px 7px;font-size:12px}@media(max-width:520px){body{padding:8px}main{padding:18px}dl{grid-template-columns:1fr}dd{margin-bottom:10px}}@media print{body{background:white;padding:0}main{border:0}details{display:block}}</style><main><header><div class="brand">MERGE PROOF · PROVE THE MERGE</div><h1>${escape(r.verdict === "NOT_PROVEN" ? "NOT PROVEN" : r.verdict)}</h1><strong>${current?.reason === "REFRESH_REQUIRED" ? "Live recheck: not requested — saved observation freshness is separate" : "Receipt currentness: " + escape(current?.state || "UNAVAILABLE")} ${current?.state === "STALE" ? "— RE-PROOF REQUIRED" : current?.state === "CURRENT" ? "AT OBSERVATION" : ""}</strong><p>${escape(r.identity.repository)} #${escape(r.identity.pr)}</p><small>Historical result issued ${escape(r.issuedAt)}. Currentness observed ${escape(current?.asOf || "not refreshed")}.</small></header>${policyResult && !remediation ? `<p class="policy"><strong>${escape(policyResult.mergeConsequence)}</strong><br><small>Policy: ${escape(policyResult.preset)}</small></p>` : ""}
  ${remediation ? require("./remediation").html(remediation, escape) : `<h2>What this means</h2><ul>${items.map(item).join("")}</ul>`}
  ${remediation ? "<details><summary>Technical details</summary>" : ""}
  <h2>Who or what changed this</h2><dl>${actorLines(r)
    .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`)
    .join("")}</dl>
  <h2>Evidence</h2><dl>${lines(r, current)
    .map(
      ([k, v]) =>
        `<dt>${escape(k)}</dt><dd title="${escape(v)}">${escape(String(v).replace(/[a-f0-9]{40}/g, (x) => x.slice(0, 12)))}</dd>`,
    )
    .join("")}</dl>
  <h2>Missing evidence</h2><ul>${(r.gaps.length ? r.gaps : ["None under the implemented policy."]).map((x) => `<li>${escape(describeGap(x))}</li>`).join("")}</ul><h2>Next</h2><p>${escape(current?.state === "CURRENT" ? r.next : current?.next || r.next)}</p>
  <p>NOT_PROVEN means evidence is insufficient. It does not mean the change is broken. A protected boundary is a designated high-impact area, not a vulnerability finding.</p>
  <details><summary>What green actually meant</summary><pre>${escape(JSON.stringify(r.summary.ci, null, 2))}</pre></details>
  <details><summary>Inspect full receipt JSON</summary><pre>${escape(JSON.stringify({ receipt: r, current, remediation }, null, 2))}</pre></details>
  <small>${r.limitations.map(escape).join("<br>")}<br>Receipt ${escape(r.receiptId)}</small>${remediation ? "</details>" : ""}</main></html>`;
}
module.exports = { escape, text, html, lines, actorLines, plain };
