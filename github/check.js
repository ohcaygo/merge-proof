"use strict";
const { text } = require("./receipt");
const { evaluate } = require("./policy");
const { explain } = require("./wording");
// The context name a repository requires. It must never change: renaming it
// would silently detach every ruleset already configured to require it.
const NAME = "Merge Proof exact-state receipt";

// GitHub treats a required check concluding `neutral` or `skipped` as passing.
// An enforcing policy therefore reports only `success` or `failure`.
function conclusionFor(receipt, current, policyResult) {
  return (policyResult || evaluate(receipt, current, null)).conclusion;
}

// A check run is bound to one commit and that binding cannot be moved, so the
// result has to be reported against every commit a required check is evaluated
// on. A merge-queue group is a different commit from the pull request head: the
// head needs its own check or the pull request waits forever for a status that
// only ever landed on the queue commit.
function subjects(receipt) {
  const out = [{ sha: receipt.identity.headSha, kind: "PULL_REQUEST_HEAD" }];
  const target = receipt.summary?.target;
  if (
    target?.state === "AVAILABLE" &&
    target.value?.kind === "MERGE_GROUP" &&
    target.value.sha !== receipt.identity.headSha
  )
    out.push({ sha: target.value.sha, kind: "MERGE_GROUP" });
  return out;
}

function title(receipt, current, result) {
  if (result.enforced && result.conclusion === "success" && receipt.summary?.queueStage === "ADMISSION_ONLY")
    return `${receipt.verdict} · queue proof pending · PR admission only`;
  if (result.enforced && result.conclusion === "success" && receipt.verdict === "NOT_PROVEN")
    return "NOT_PROVEN · policy requirements satisfied; evidence gaps remain";
  if (!result.enforced)
    return `${receipt.verdict} · ${current?.state || "UNAVAILABLE"} at observation · reporting only`;
  return result.conclusion === "success"
    ? `${receipt.verdict} · merge requirement satisfied`
    : `${receipt.verdict} · merge blocked · ${result.blocking.length} item(s) to resolve`;
}

function summary(receipt, current, result, remediation = require("./remediation").build(receipt, current, result)) {
  if (remediation) return (`NOT PROVEN\n\n` + remediation.items.slice(0, 3).map(x => `${x.summary}\nAction: ${x.nextAction}\nAutomatic recheck: ${x.automaticRecheck.text}`).join("\n\n") + `\n\nMerge: ${remediation.mergeConsequence.text}\n\n${remediation.items.length > 3 ? `${remediation.items.length - 3} more evidence gaps. ` : ""}Open the receipt for all gaps, why they matter, and Technical details.`).slice(0, 6000);
  const items = explain(receipt, result);
  const blocking = items.filter((x) => x.blocksMerge === true);
  const reported = items.filter((x) => x.blocksMerge !== true);
  const section = (heading, rows) =>
    rows.length
      ? `\n## ${heading}\n\n` +
        rows
          .map(
            (x) =>
              `**${x.plain}**\n\n- Why it matters: ${x.why || "—"}\n- What to do: ${x.doNext || "—"}\n- Re-proof: ${x.reproof === "AUTOMATIC" ? "automatic once that happens" : "run proof again from your account"}\n`,
          )
          .join("\n")
      : "";
  return (
    (receipt.summary?.queueStage === "ADMISSION_ONLY"
      ? "This proof covers queue admission only. GitHub must create a merge group and require a separate passing check on that group before merging.\n\n" : "") +
    `${result.mergeConsequence}\n` +
    section("What must be resolved before this merge", blocking) +
    section(
      result.enforced
        ? "Reported, not required by your policy"
        : "What could not be established",
      reported,
    ) +
    `\n## Evidence\n\n\`\`\`\n${text(receipt, current)}\`\`\`\n`
  ).slice(0, 60000);
}

// Rebuild the established proof explanation rather than replacing it with a
// sales reminder. Timing and publication conclusions remain the caller's job.
function accessNotice(receipt, current, result, usage, origin, remediation) {
  const paused = usage.plan === "PAUSED";
  return {
    title: (paused ? "Hosted access ended — action required" : `Trial ends ${usage.trial.endsAt} · ${title(receipt, current, result)}`).slice(0, 255),
    summary: usage.notice + (paused ? "\n\nPaused-access notice, not a new proof. The evidence explanation below is historical; it does not restore hosted access or satisfy an expired enforcing gate." : "") +
      `\n\nContinue: ${origin}/proof/\nHistorical receipt: ${origin}/proof/receipts/${receipt.receiptId}\n\n` +
      summary(receipt, current, result, remediation),
  };
}

async function publish(client, receipt, current, origin, policyResult = null, onPublished = null, remediation = undefined, notice = "") {
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("INVALID_ORIGIN");
  const result = policyResult || evaluate(receipt, current, null);
  const body = {
    name: NAME,
    external_id: receipt.receiptId,
    status: "completed",
    conclusion: conclusionFor(receipt, current, result),
    details_url: `${url.origin}/proof/receipts/${receipt.receiptId}`,
    output: {
      title: title(receipt, current, result).slice(0, 255),
      summary: ((notice ? notice + "\n\n" : "") + summary(receipt, current, result, remediation)).slice(0, 59000) + `\n<!-- merge-proof ${JSON.stringify({ schema: "urn:merge-proof:check:1", receiptId: receipt.receiptId, verdict: receipt.verdict, subject: receipt.subject, currentness: current?.state || "UNAVAILABLE" })} -->`,
    },
  };
  const published = [];
  let primary = null;
  for (const on of subjects(receipt)) {
    const response = await client.request(
      `/repos/${receipt.identity.repository}/check-runs`,
      { method: "POST", body: { ...body, head_sha: on.sha } },
    );
    published.push({ ...on, id: response?.id ?? null });
    // Persist each returned identity before attempting another commit.
    if (onPublished) await onPublished(published[published.length - 1], result);
    primary ||= response;
  }
  return Object.assign(primary || {}, {
    publishedOn: published[0],
    published,
    checkIds: published
      .map((x) => x.id)
      .filter((id) => Number.isSafeInteger(id)),
  });
}

module.exports = { publish, NAME, subjects, conclusionFor, title, summary, accessNotice };
