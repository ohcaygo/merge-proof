"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { renderHtml, normalize } = require("../src/pilot-report");
const { printPdf } = require("../src/pdf");
const { escape: e, hash, scrub } = require("./common");
const { diff } = require("./evidence");
function handoff(result, scope, actionRef) {
  return `# Merge-Proof Action handoff\n\nRepository: ${scope.repo}\nPR: ${scope.pr}\nBase: ${scope.baseSha}\nCandidate: ${scope.headSha}\n\n## Install the existing Action\n\nAdd a workflow under .github/workflows, adapting this to your PR workflow.\n\n\`\`\`yaml\non: [pull_request]\npermissions:\n  contents: read\njobs:\n  merge-proof:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n          ref: \${{ github.event.pull_request.head.sha }}\n      - uses: ohcaygo/merge-proof@${actionRef}\n        with:\n          base: \${{ github.event.pull_request.base.sha }}\n          head: \${{ github.event.pull_request.head.sha }}\n\`\`\`\n\n## Rerun\n\nFetch full history and the exact refs, then run:\n\n\`\`\`sh\nnode bin/merge-proof.js --base ${scope.baseSha} --head ${scope.headSha} --json\n\`\`\`\n\nThe existing Action/CLI runs local Git checks only. It does not collect the factory's GitHub CI/review evidence. Use your secure pack page for the single included reassessment of this PR. Required CI: ${scope.required.map((r) => `${r.name} (App ${r.appId})`).join(", ")}. Human review requires a non-author collaborator approval on the exact candidate; outstanding changes requested prevents proof.\n\nVERIFIED: implemented checks found no blocking evidence gap; not proof of correctness.\nNOT_PROVEN: missing evidence; not defective code.\nFAIL: current bound evidence demonstrates an unmet required condition. Collection uncertainty is NOT_PROVEN.\n\nCANDIDATE_DURABLE_ON_REMOTE and SCOPE_CREEP_VS_DECLARED_SCOPE remain outside this proof. No Action installation is performed by this document.\n`;
}
async function generate({
  directory,
  result,
  capture,
  scope,
  runId,
  orderId,
  prior,
  actionRef,
  printer = printPdf,
}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const clean = scrub(result);
  const json = JSON.stringify(clean, null, 2) + "\n";
  const model = normalize(clean);
  model.notChecked = clean.notChecked;
  model.kind = "factory";
  if (scope.shape === "two-parent-merge") model.rows[0].squash = scope.ciSha;
  let html = renderHtml(model, {
    scope: `${scope.repo} PR #${scope.pr}; ${scope.shape}. One record, captured ${capture.capturedAt}. CI on ${scope.ciSha}; approval on ${scope.headSha}.`,
    source: "report.json",
    sha256: hash(json),
  });
  html = html
    .replace(
      "MERGE-PROOF / GUIDED PILOT ASSESSMENT",
      "MERGE-PROOF / STANDARD EVIDENCE PACK",
    )
    .replace("Merge-Proof pilot report", "Merge-Proof Standard Evidence Pack")
    .replaceAll("Landed squash", "Landed state")
    .replace(
      "This report renders one recorded local CLI analysis against its supplied base and candidate refs. It does not establish that the candidate landed on that base, fetch fresh evidence, or inspect CI. The CLI format has no capture timestamp; freshness must be established separately.",
      "This report combines isolated Git object analysis with a bounded GitHub API capture. Open PRs use the captured candidate head for CI; supported two-parent merges use the landed merge SHA for CI and original PR head for approval. GitHub metadata was checked again after capture. It records evidence available at capture time, not a reconstruction of approval or CI as of merge time. It does not certify every branch rule, CODEOWNER requirement, or test quality. No customer source code is executed. Custom .mergeproofignore files are not loaded in the factory.",
    )
    .replace(
      "Implemented blocking checks: BASE_DRIFT_UNVERIFIED (overlapping base drift) and PROTECTED_BOUNDARY (sensitive path categories).",
      "Implemented blocking checks: BASE_DRIFT_UNVERIFIED (overlapping base drift), PROTECTED_BOUNDARY (sensitive path categories), CI_RAN_ON_FINAL_HEAD, and HUMAN_APPROVAL_PRESENT. CI requires every scope-confirmed name/App pair to succeed on the relevant SHA. Approval requires at least one non-author human collaborator on the candidate SHA with no outstanding changes requested.",
    )
    .replace(
      "This report cannot establish whether CI ran on the exact state that landed.",
      "For open PRs, CI on the head does not prove the eventual combined merge state. For supported merges, only CI bound to the recorded landed SHA meets the factory CI check.",
    );
  const section = (title, data) =>
    `<h2>${title}</h2><p><strong>${e(data.state)}</strong></p><p class="refs">Relevant SHA: ${e(data.targetSha)}</p><p>${e(data.policy)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.5 monospace">${e(JSON.stringify(data, null, 2))}</pre>`;
  const delta = prior ? diff(prior, clean) : null;
  html = html.replace(
    "<h2>Method and limits</h2>",
    section("Final-head CI evidence", clean.evidence.ci) +
      section("Human approval evidence", clean.evidence.approval) +
      (delta
        ? `<h2>Reassessment diff</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.5 monospace">${e(JSON.stringify(delta, null, 2))}</pre>`
        : "") +
      "<h2>Method and limits</h2>",
  );
  const files = {
    "report.json": json,
    "report.html": html,
    "action-handoff.md": handoff(clean, scope, actionRef),
    "capture.json": JSON.stringify(scrub(capture), null, 2) + "\n",
  };
  if (delta)
    files["reassessment-diff.json"] = JSON.stringify(delta, null, 2) + "\n";
  for (const [name, contents] of Object.entries(files))
    fs.writeFileSync(path.join(directory, name), contents, { mode: 0o600 });
  await printer(
    path.join(directory, "report.html"),
    path.join(directory, "report.pdf"),
  );
  const pdf = fs.readFileSync(path.join(directory, "report.pdf"));
  if (
    pdf.subarray(0, 5).toString() !== "%PDF-" ||
    !/%%EOF\s*$/.test(pdf.subarray(-128).toString())
  )
    throw Error("REPORT_FAILED");
  fs.chmodSync(path.join(directory, "report.pdf"), 0o600);
  const manifest = {
    schemaVersion: 1,
    orderId,
    runId,
    scope,
    capturedAt: capture.capturedAt,
    engineSource: actionRef,
    factoryCodeSha256: hash(
      fs
        .readdirSync(__dirname)
        .filter((n) => n.endsWith(".js") || n.endsWith(".sh"))
        .sort()
        .map((n) => n + ":" + hash(fs.readFileSync(path.join(__dirname, n))))
        .join("\n"),
    ),
    priorReportSha256: prior
      ? hash(JSON.stringify(prior, null, 2) + "\n")
      : null,
    artifacts: {},
  };
  for (const name of [...Object.keys(files), "report.pdf"])
    manifest.artifacts[name] = {
      sha256: hash(fs.readFileSync(path.join(directory, name))),
    };
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  return {
    result: clean,
    files: [...Object.keys(files), "report.pdf", "manifest.json"],
    diff: delta,
  };
}
module.exports = { generate, handoff };
