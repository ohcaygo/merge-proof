"use strict";
// Deterministic actor provenance: who and what GitHub records as having acted
// on this change.
//
// This records observations, never inferences. GitHub exposes an account type
// on the objects we already read, and an App identity on check runs. It does
// not expose which credential a client used, so a coding agent driven by a
// person's own token is recorded as that person and nothing else. That limit
// is stated in the receipt rather than filled in with a guess.
const { hasUnavailable } = require("./common");

// GitHub documents the account type as the field; the `[bot]` login suffix is
// a convention shown by example and is recorded only as corroboration.
function actor(user) {
  if (!user || !Number.isSafeInteger(user.id) || typeof user.login !== "string")
    return null;
  const type = typeof user.type === "string" ? user.type : null;
  return {
    id: user.id,
    login: user.login,
    type: type || "UNKNOWN",
    kind: type === "Bot" ? "APP_OR_BOT" : type === "User" ? "HUMAN_ACCOUNT" : "UNKNOWN",
    botLoginSuffix: /\[bot\]$/.test(user.login),
  };
}

const key = (a) => `${a.kind}:${a.id}`;

function dedupe(list) {
  const seen = new Map();
  for (const a of list) if (a && !seen.has(key(a))) seen.set(key(a), a);
  return [...seen.values()].sort(
    (x, y) => x.kind.localeCompare(y.kind) || x.id - y.id,
  );
}

function app(row) {
  if (!Number.isSafeInteger(row?.appId)) return null;
  return {
    appId: row.appId,
    slug: typeof row.appSlug === "string" ? row.appSlug : null,
    kind: "APP",
  };
}

function apps(list) {
  const seen = new Map();
  for (const row of list) {
    const a = app(row);
    if (a && !seen.has(a.appId)) seen.set(a.appId, a);
  }
  return [...seen.values()].sort((x, y) => x.appId - y.appId);
}

const LIMITATION =
  "GitHub records the account that acted, not the tool it was driven by. A coding agent run with a person's own credentials is recorded as that person; only an agent acting as its own GitHub App or bot account is separately identifiable here.";

function unavailable(reason) {
  return {
    state: "UNAVAILABLE",
    reason,
    authorship: [],
    review: [],
    validation: [],
    merge: [],
    agentIdentity: "UNAVAILABLE",
    limitation: LIMITATION,
  };
}

// capture -> the WHO / WHAT CHANGED THIS section of a receipt.
function summarize(capture) {
  const observation = capture?.actors;
  if (!observation || observation.state !== "AVAILABLE")
    return unavailable(observation?.reason || "ACTOR_EVIDENCE_UNAVAILABLE");
  if (hasUnavailable(observation))
    return unavailable("ACTOR_EVIDENCE_PARTIALLY_UNAVAILABLE");
  const v = observation.value;

  const prAuthor = actor(v.author);
  const mergedBy = actor(v.mergedBy);
  const commitAuthors = dedupe((v.commits || []).map((c) => actor(c.author)));
  const commitCommitters = dedupe(
    (v.commits || []).map((c) => actor(c.committer)),
  );
  const reviewers = dedupe(
    (capture.reviews?.state === "AVAILABLE" ? capture.reviews.value : []).map(
      (r) => actor({ id: r.userId, login: r.login, type: r.userType }),
    ),
  );
  const workflowActors = dedupe(
    (capture.execution?.state === "AVAILABLE"
      ? capture.execution.value
      : []
    ).flatMap((j) => [actor(j.actor), actor(j.triggeringActor)]),
  );
  const checkPublishers = apps(
    capture.checks?.state === "AVAILABLE" ? capture.checks.value : [],
  );

  // Authorship is what "who changed this" means. Check publishers are almost
  // always Apps, so including them would make every repository look
  // agent-authored.
  const authorship = dedupe([prAuthor, ...commitAuthors, ...commitCommitters]);
  const nonHuman = authorship.filter((a) => a.kind === "APP_OR_BOT");
  const unknown = authorship.filter((a) => a.kind === "UNKNOWN");

  return {
    state: "AVAILABLE",
    prAuthor,
    mergedBy,
    commitAuthors,
    commitCommitters,
    commitsObserved: (v.commits || []).length,
    commitsTruncated: v.truncated === true,
    signedCommits: (v.commits || []).filter((c) => c.verified === true).length,
    reviewers,
    checkPublishers,
    workflowActors,
    authorship,
    nonHumanAuthorship: nonHuman,
    agentIdentity: nonHuman.length
      ? "OBSERVED_APP_OR_BOT"
      : unknown.length || !authorship.length
        ? "UNAVAILABLE"
        : "NONE_OBSERVED",
    limitation: LIMITATION,
  };
}

const describe = (a) =>
  a
    ? `${a.login} (${a.kind === "APP_OR_BOT" ? "app or bot account" : a.kind === "HUMAN_ACCOUNT" ? "human account" : "unknown account type"})`
    : "UNKNOWN";

const AGENT_IDENTITY_TEXT = {
  OBSERVED_APP_OR_BOT:
    "An app or bot account is recorded as having authored part of this change.",
  NONE_OBSERVED:
    "Every account recorded as authoring this change is a human account. That does not establish that a person wrote the code.",
  UNAVAILABLE: "Authorship evidence could not be established.",
};

module.exports = {
  actor,
  summarize,
  describe,
  dedupe,
  apps,
  LIMITATION,
  AGENT_IDENTITY_TEXT,
};
