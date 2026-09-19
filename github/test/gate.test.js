"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHmac } = require("node:crypto");
const { Store } = require("../../factory/store");
const { ProofService } = require("../service");
const { Client } = require("../client");
const { prove } = require("../proof");
const { publish, NAME, subjects } = require("../check");
const policy = require("../policy");
const ledger = require("../ledger");
const setup = require("../setup");
const { explain } = require("../wording");
const { capture, fixtureFetch, H, OLD } = require("./fixtures");

// GitHub treats a required check concluding neutral or skipped as a PASS.
// Everything below exists so an enforcing gate can never emit one.
const PASSING_TO_GITHUB = new Set(["success", "neutral", "skipped"]);

function harness(t, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-gate-"));
  const store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  let options = {};
  const writes = [];
  let checkId = 900;
  const service = new ProofService({
    store,
    config: {
      webhookSecret: "s".repeat(40),
      origin: "http://127.0.0.1",
      publishChecks: true,
      appId: 42,
      ...config,
    },
    clientFactory: ({ token } = {}) =>
      new Client({ ...fixtureFetch(options), token }),
    appClient: async () => {
      const c = new Client(fixtureFetch(options));
      const request = c.request.bind(c);
      c.request = async (p, o) => {
        if (o?.method === "POST" && p.endsWith("/check-runs")) {
          writes.push({ p, o, kind: "POST" });
          return { id: checkId++ };
        }
        if (o?.method === "PATCH") {
          writes.push({ p, o, kind: "PATCH" });
          return {};
        }
        return request(p, o);
      };
      return c;
    },
  });
  return { store, service, writes, set: (o) => (options = o) };
}
function hook(event = "pull_request", extra = {}) {
  const p = {
    ref: "refs/heads/feature",
    repository: { id: 1, full_name: "fixture/public" },
    installation: { id: 2 },
    pull_request: { number: 1, state: "open" },
    ...extra,
  };
  const raw = Buffer.from(JSON.stringify(p));
  return [
    raw,
    {
      "x-github-delivery": require("node:crypto").randomUUID(),
      "x-github-event": event,
      "x-hub-signature-256":
        "sha256=" +
        createHmac("sha256", "s".repeat(40)).update(raw).digest("hex"),
    },
  ];
}
const boundaryCapture = () => {
  const c = capture();
  c.git.value.candidateFiles = ["src/auth/session.js"];
  return c;
};

// ---------------------------------------------------------------- 2, 6, 7

test("an enforcing policy never reports a conclusion GitHub treats as a pass", () => {
  const verified = prove(capture());
  const notProven = prove(
    (() => {
      const c = capture();
      c.checks.value[0].conclusion = "failure";
      return c;
    })(),
  );
  const current = { state: "CURRENT" };
  const enforcing = { preset: "REPOSITORY_REQUIREMENTS" };

  a.equal(policy.evaluate(verified, current, enforcing).conclusion, "success");

  const blocked = policy.evaluate(notProven, current, enforcing);
  a.equal(blocked.conclusion, "failure");
  a.ok(!PASSING_TO_GITHUB.has(blocked.conclusion));
  a.equal(blocked.satisfied, false);
  a.ok(blocked.blocking.length > 0);

  // Same receipt, report-only policy: the result is unchanged, the consequence
  // is not.
  const advisory = policy.evaluate(notProven, current, null);
  a.equal(advisory.conclusion, "neutral");
  a.equal(advisory.satisfied, null);
  a.equal(advisory.blocking.length, 0);
  a.equal(advisory.reported.length > 0, true);
  a.equal(notProven.verdict, "FAIL");
  a.match(advisory.mergeConsequence, /does not block/);
  a.match(blocked.mergeConsequence, /blocks the merge/);
});

test("a proof that could not complete blocks an enforcing gate and never passes", () => {
  const c = capture();
  c.git = { state: "UNAVAILABLE", reason: "GITHUB_HTTP_403" };
  const receipt = prove(c);
  a.equal(receipt.verdict, "NOT_PROVEN");
  const result = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS",
  });
  a.equal(result.conclusion, "failure");
  a.ok(result.blocking.includes("GIT_HISTORY_UNAVAILABLE"));
});

test("an unrecognised gap blocks by default rather than becoming advisory", () => {
  const receipt = prove(capture());
  receipt.gaps.push("SOME_FUTURE_GAP_CODE");
  const result = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS",
  });
  a.equal(result.conclusion, "failure");
  a.ok(result.blocking.includes("SOME_FUTURE_GAP_CODE"));
});

// ---------------------------------------------------------------------- 3

test("a stale or unrefreshed receipt can never satisfy an enforcing gate", () => {
  const receipt = prove(capture());
  a.equal(receipt.verdict, "VERIFIED");
  for (const [state, code] of [
    ["STALE", "RECEIPT_STALE"],
    ["UNAVAILABLE", "CURRENTNESS_UNAVAILABLE"],
  ]) {
    const result = policy.evaluate(receipt, { state }, {
      preset: "REPOSITORY_REQUIREMENTS",
    });
    a.equal(result.conclusion, "failure");
    a.ok(result.blocking.includes(code));
  }
  // Report-only keeps today's behaviour.
  a.equal(
    policy.evaluate(receipt, { state: "STALE" }, null).conclusion,
    "neutral",
  );
  // And a superseded published check is retracted to failure, not neutral.
  a.equal(policy.staleConclusion({ preset: "REPOSITORY_REQUIREMENTS" }), "failure");
  a.equal(policy.staleConclusion(null), "neutral");
});

test("a superseded published check is retracted with a blocking conclusion", async (t) => {
  const h = harness(t);
  await h.service.webhook(...hook());
  await h.service.drain();
  h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  await h.service.webhook(...hook("push"));
  await h.service.drain();
  const patch = h.writes.find((w) => w.kind === "PATCH");
  a.equal(patch.o.body.conclusion, "failure");
  a.match(patch.o.body.output.title, /Evidence refresh pending/);
});

// ---------------------------------------------------------------------- 4

test("a new head produces a new check bound to the new commit", async (t) => {
  const h = harness(t);
  await h.service.webhook(...hook());
  await h.service.drain();
  const first = h.writes.filter((w) => w.kind === "POST").pop();
  a.equal(first.o.body.head_sha, H);
  h.set({ head: OLD });
  await h.service.webhook(...hook("push"));
  await h.service.drain();
  const second = h.writes.filter((w) => w.kind === "POST").pop();
  a.equal(second.o.body.head_sha, OLD);
  // The earlier receipt is preserved and is not presented as current.
  const receipts = Object.values(h.service.data.receipts);
  a.equal(receipts.length, 2);
  a.equal(
    receipts.find((r) => r.receipt.identity.headSha === H).current.state,
    "STALE",
  );
});

test("a merge group is reported on the group commit as well as the pull request head", () => {
  const c = capture();
  c.target = {
    state: "AVAILABLE",
    value: {
      kind: "MERGE_GROUP",
      tree: "e".repeat(40),
      sha: "e".repeat(40),
      headSha: H,
      baseSha: "b".repeat(40),
      ref: "refs/heads/gh-readonly-queue/main/x",
      selection: {
        state: "AVAILABLE",
        value: {
          id: "q",
          state: "MERGEABLE",
          headSha: "e".repeat(40),
          baseSha: "b".repeat(40),
          candidateSha: H,
        },
      },
    },
  };
  // A check run's commit binding is immutable, so the queue commit needs its
  // own check. The head still needs one too, or the pull request waits forever
  // for a status that only ever landed on the queue commit.
  const on = subjects(prove(c));
  a.deepEqual(
    on.map((x) => [x.kind, x.sha]),
    [
      ["PULL_REQUEST_HEAD", H],
      ["MERGE_GROUP", "e".repeat(40)],
    ],
  );
  a.deepEqual(
    subjects(prove(capture())).map((x) => x.kind),
    ["PULL_REQUEST_HEAD"],
  );

  // Both commits carry the same conclusion, and both are retracted together.
  const posted = [];
  return publish(
    {
      request: async (p, o) => {
        posted.push(o.body.head_sha);
        return { id: posted.length };
      },
    },
    prove(c),
    { state: "CURRENT" },
    "https://merge-proof.ohcaygo.com",
    policy.evaluate(prove(c), { state: "CURRENT" }, {
      preset: "REPOSITORY_REQUIREMENTS",
    }),
  ).then((r) => {
    a.deepEqual(posted, [H, "e".repeat(40)]);
    a.deepEqual(r.checkIds, [1, 2]);
  });
});

test("a required check named the same as ours but owned by another app is named as a collision", () => {
  const c = capture();
  c.rules.classic.value.required_status_checks.checks.push({
    context: NAME,
    app_id: 999,
  });
  const receipt = prove(c, { appId: 42 });
  a.equal(receipt.verdict, "NOT_PROVEN");
  a.equal(receipt.summary.ci.selfReference, null);
  a.equal(
    receipt.summary.ci.required.find((x) => x.name === NAME).state,
    "NAME_COLLIDES_WITH_MERGE_PROOF_CHECK",
  );
  const item = explain(receipt, null).find(
    (x) => x.code === "CURRENT_STATE_EXECUTION_NOT_PROVEN",
  );
  a.match(item.plain, /uses Merge Proof's own check name but is bound to a different app/);
  a.match(item.doNext, /Rename that required check/);
});

// ------------------------------------------------------------------ 1, 8, 9

test("requiring Merge Proof's own check is detected and does not deadlock the gate", () => {
  const c = capture();
  c.rules.classic.value.required_status_checks.checks.push({
    context: NAME,
    app_id: 42,
  });
  const receipt = prove(c, { appId: 42 });
  a.equal(receipt.verdict, "VERIFIED");
  a.equal(receipt.summary.gate.required, true);
  a.equal(receipt.summary.gate.boundToThisApp, true);
  a.equal(receipt.summary.gate.independentRequiredChecks, 1);
  a.equal(
    policy.evaluate(receipt, { state: "CURRENT" }, {
      preset: "REPOSITORY_REQUIREMENTS",
    }).conclusion,
    "success",
  );
});

test("policy defaults derive from the requirements the repository already sets", () => {
  const status = setup.gate(capture().rules, 42);
  a.equal(status.readiness.state, "READY");
  a.equal(status.required, false);
  a.deepEqual(status.requiredChecks, [{ name: "test", appId: 10 }]);
  a.equal(status.approvalsRequired, 1);
  a.equal(status.unsupported.length, 0);
});

test("a branch with nothing to prove is refused as a gate instead of passing", () => {
  const c = capture();
  c.rules.classic.value.required_status_checks.checks = [];
  c.rules.classic.value.required_pull_request_reviews = null;
  const status = setup.gate(c.rules, 42);
  a.equal(status.readiness.state, "NOT_READY");
  a.equal(status.readiness.blockers[0].code, "NO_REQUIRED_VALIDATION_CONFIGURED");
  const receipt = prove(c, { appId: 42 });
  a.equal(receipt.verdict, "NOT_PROVEN");
  a.ok(receipt.gaps.includes("NO_REQUIRED_VALIDATION_CONFIGURED"));
  a.equal(
    policy.evaluate(receipt, { state: "CURRENT" }, {
      preset: "REPOSITORY_REQUIREMENTS",
    }).conclusion,
    "failure",
  );
});

test("a requirement Merge Proof cannot establish is declared before it is enabled", () => {
  const c = capture();
  c.rules.classic.value.required_pull_request_reviews.require_code_owner_reviews = true;
  const status = setup.gate(c.rules, 42);
  a.equal(status.readiness.state, "NOT_READY");
  const withSignatures = capture();
  withSignatures.rules.classic.value.required_signatures = { enabled: true };
  const blocked = setup.gate(withSignatures.rules, 42);
  a.equal(blocked.readiness.state, "NOT_READY");
  a.ok(blocked.readiness.blockers.some((b) => b.code === "required_signatures"));
  a.match(blocked.readiness.blockers[0].doNext, /would block merges/);
});

test("unreadable repository rules are an explicit gap and never a silent pass", () => {
  const c = capture();
  c.rules.active = { state: "UNAVAILABLE", reason: "GITHUB_HTTP_403" };
  const receipt = prove(c, { appId: 42 });
  a.equal(receipt.verdict, "NOT_PROVEN");
  a.ok(receipt.gaps.includes("RULES_UNAVAILABLE"));
  a.equal(receipt.summary.gate.required, "UNAVAILABLE");
  a.equal(receipt.summary.gate.readiness.state, "UNAVAILABLE");
  a.equal(
    policy.evaluate(receipt, { state: "CURRENT" }, {
      preset: "REPOSITORY_REQUIREMENTS",
    }).conclusion,
    "failure",
  );
});

test("setup instructions never claim automation Merge Proof is not permitted", () => {
  const text = JSON.stringify(
    setup.instructions("owner/name", "main", setup.gate(capture().rules, 42)),
  );
  a.match(text, /settings\/rules/);
  a.match(text, /never edits branch protection or rulesets/);
  a.match(text, /reports neutral does not block a merge/);
  a.match(text, /A repository administrator/);
});

// --------------------------------------------------------------------- 10

test("protected boundaries are reported by default and enforced only when chosen", () => {
  const receipt = prove(boundaryCapture(), { appId: 42 });
  a.equal(receipt.verdict, "NOT_PROVEN");
  a.ok(receipt.gaps.includes("PROTECTED_BOUNDARY"));

  const standard = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS",
  });
  a.equal(standard.conclusion, "success");
  a.deepEqual(standard.blocking, []);
  a.ok(standard.reported.includes("PROTECTED_BOUNDARY"));

  const strict = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
  });
  a.equal(strict.conclusion, "failure");
  a.ok(strict.blocking.includes("PROTECTED_BOUNDARY"));
  a.ok(strict.blocking.includes("PROTECTED_BOUNDARY_APPROVAL_REQUIRED"));
  a.equal(strict.boundaryEscalation.required, 2);
  a.equal(strict.boundaryEscalation.observed, 1);
});

test("the stricter boundary preset is satisfied by a second current approval", () => {
  const c = boundaryCapture();
  c.reviews.value.push({
    id: 61,
    userId: 3,
    login: "second",
    userType: "User",
    state: "APPROVED",
    sha: H,
    submittedAt: "2026-09-10T12:00:00Z",
    writePermission: { state: "AVAILABLE", value: true },
  });
  const receipt = prove(c, { appId: 42 });
  const strict = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
  });
  a.equal(strict.boundaryEscalation.observed, 2);
  a.ok(!strict.blocking.includes("PROTECTED_BOUNDARY_APPROVAL_REQUIRED"));
  a.equal(strict.conclusion, "success");
  a.ok(strict.reported.includes("PROTECTED_BOUNDARY"));
  a.equal(receipt.verdict, "NOT_PROVEN");
  // A change that touches no boundary is unaffected by the stricter preset.
  const clean = policy.evaluate(prove(capture()), { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
  });
  a.equal(clean.conclusion, "success");
  a.equal(clean.boundaryEscalation, null);
});

// ------------------------------------------------------------------- 5, 7

test("NOT_PROVEN says what is missing, why, what to do and whether it blocks", () => {
  const c = capture();
  c.reviews.value[0].sha = OLD;
  const receipt = prove(c, { appId: 42 });
  a.equal(receipt.verdict, "NOT_PROVEN");
  const result = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS",
  });
  const item = explain(receipt, result).find(
    (x) => x.code === "INSUFFICIENT_CURRENT_HUMAN_APPROVAL",
  );
  a.match(item.plain, /older version/);
  a.match(item.why, /New commits were added after it was approved/);
  a.match(item.doNext, /approve the current version/);
  a.equal(item.reproof, "AUTOMATIC");
  a.equal(item.blocksMerge, true);
  // Ordering puts blocking items first.
  a.equal(explain(receipt, result)[0].blocksMerge, true);
  // Advisory policy marks the same gap as not blocking.
  a.equal(
    explain(receipt, policy.evaluate(receipt, { state: "CURRENT" }, null))[0]
      .blocksMerge,
    false,
  );
  a.ok(!/unsafe|buggy|vulnerable/i.test(JSON.stringify(explain(receipt, result))));
});

test("an old check result is explained as an old version, not as a failure", () => {
  const c = capture();
  c.checks.value[0].sha = OLD;
  c.execution.value[0].sha = OLD;
  const receipt = prove(c, { appId: 42 });
  const item = explain(receipt, null).find(
    (x) => x.code === "CURRENT_STATE_EXECUTION_NOT_PROVEN",
  );
  a.match(item.plain, /recorded against another version/);
  a.match(item.doNext, /against the current version/);
});

test("the published check body carries the plain explanation and the consequence", async () => {
  const c = capture();
  c.checks.value[0].conclusion = "failure";
  const receipt = prove(c, { appId: 42 });
  const result = policy.evaluate(receipt, { state: "CURRENT" }, {
    preset: "REPOSITORY_REQUIREMENTS",
  });
  let call;
  await publish(
    { request: async (...args) => ((call = args), { id: 1 }) },
    receipt,
    { state: "CURRENT" },
    "https://merge-proof.ohcaygo.com",
    result,
  );
  a.equal(call[1].body.conclusion, "failure");
  a.match(call[1].body.output.title, /merge blocked/);
  a.match(call[1].body.output.summary, /FAIL/);
  a.match(call[1].body.output.summary, /What to do:/);
  a.ok(call[1].body.output.summary.length <= 60000);
  a.ok(call[1].body.output.title.length <= 255);
});

// ----------------------------------------------------------------- 11, 12

test("observed human, app and bot identities are recorded from GitHub evidence", () => {
  const c = capture();
  c.actors.value.commits.push({
    sha: OLD,
    author: { id: 99, login: "some-agent[bot]", type: "Bot" },
    committer: { id: 99, login: "some-agent[bot]", type: "Bot" },
    verified: true,
    verificationReason: "valid",
  });
  const actors = prove(c, { appId: 42 }).summary.actors;
  a.equal(actors.state, "AVAILABLE");
  a.equal(actors.prAuthor.login, "author");
  a.equal(actors.prAuthor.kind, "HUMAN_ACCOUNT");
  a.equal(actors.agentIdentity, "OBSERVED_APP_OR_BOT");
  a.equal(actors.nonHumanAuthorship[0].login, "some-agent[bot]");
  a.equal(actors.nonHumanAuthorship[0].kind, "APP_OR_BOT");
  a.equal(actors.signedCommits, 1);
  a.deepEqual(actors.checkPublishers, [{ appId: 10, slug: "ci", kind: "APP" }]);
  a.equal(actors.reviewers[0].login, "reviewer");
  a.equal(actors.workflowActors[0].login, "author");
  // Check publishers are apps on almost every repository and must not make a
  // human-authored change look agent-authored.
  a.equal(prove(capture(), { appId: 42 }).summary.actors.agentIdentity, "NONE_OBSERVED");
});

test("unknown actors stay unknown and are never guessed", () => {
  const c = capture();
  c.actors = { state: "UNAVAILABLE", reason: "GITHUB_HTTP_403" };
  const actors = prove(c, { appId: 42 }).summary.actors;
  a.equal(actors.state, "UNAVAILABLE");
  a.equal(actors.agentIdentity, "UNAVAILABLE");
  a.deepEqual(actors.authorship, []);

  const unlinked = capture();
  unlinked.actors.value.commits = [
    { sha: H, author: null, committer: null, verified: false, verificationReason: null },
  ];
  unlinked.actors.value.author = null;
  const partial = prove(unlinked, { appId: 42 }).summary.actors;
  a.equal(partial.agentIdentity, "UNAVAILABLE");
  a.equal(partial.prAuthor, null);

  // A missing account type is UNKNOWN, not assumed human.
  const typeless = capture();
  typeless.actors.value.author = { id: 7, login: "x", type: null };
  const t3 = prove(typeless, { appId: 42 }).summary.actors;
  a.equal(t3.prAuthor.kind, "UNKNOWN");
  a.equal(t3.agentIdentity, "UNAVAILABLE");
});

test("no free-text commit, review or check content is collected as actor evidence", () => {
  const receipt = prove(capture(), { appId: 42 });
  const serialized = JSON.stringify(receipt);
  a.ok(!serialized.includes("DO NOT STORE"));
  a.ok(!serialized.includes("NEVER STORE"));
  a.ok(!/"email"/.test(serialized));
  a.ok(!/"name":\s*"[^"]*@/.test(serialized));
});

// ------------------------------------------------------------- 13, 14, 15

test("a completed merge is preserved immutably with what was known at the time", async (t) => {
  const h = harness(t);
  h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  await h.service.webhook(...hook());
  await h.service.drain();
  const receiptId = h.service.data.subscriptions["1:1"].latestReceiptId;
  a.equal(h.service.data.receipts[receiptId].current.state, "CURRENT");

  await h.service.webhook(
    ...hook("pull_request", {
      action: "closed",
      pull_request: {
        number: 1,
        state: "closed",
        merged: true,
        merged_at: new Date().toISOString(),
        merge_commit_sha: "f".repeat(40),
        head: { sha: H },
        base: { ref: "main" },
        merged_by: { id: 5, login: "maintainer", type: "User" },
      },
    }),
  );
  const rows = ledger.list(h.store, { installationId: 2, repositoryId: 1 });
  a.equal(rows.total, 1);
  const row = ledger.get(h.store, rows.records[0].recordId, {
    installationId: 2,
    repositoryId: 1,
  });
  a.equal(row.proof.verdict, "VERIFIED");
  a.equal(row.proof.boundToMergedState, false);
  a.equal(row.proof.state, "PROOF_BOUND_TO_PR_HEAD_ONLY");
  // The currentness recorded is the one held at the decision point, not the
  // STALE state the merge event itself then applied.
  a.equal(row.proof.currentnessAtMerge.state, "UNAVAILABLE");
  a.equal(row.proof.currentnessAtDelivery.state, "CURRENT");
  a.equal(row.mergedBy.login, "maintainer");
  a.equal(row.mergedBy.kind, "HUMAN_ACCOUNT");
  a.equal(row.proof.gate.enforced, true);
  a.equal(row.proof.gate.conclusion, "success");
  a.deepEqual(row.proof.requiredChecks, [{ name: "test", appId: 10 }]);
  a.equal(row.proof.actors.agentIdentity, "NONE_OBSERVED");
  a.equal(h.service.data.receipts[receiptId].current.state, "UNAVAILABLE");

  const before = JSON.stringify(row);
  // Later evidence, a later proof and a repeated delivery must not rewrite it.
  h.set({ head: OLD });
  await h.service.webhook(...hook("push"));
  await h.service.drain();
  await h.service.webhook(
    ...hook("pull_request", {
      action: "closed",
      pull_request: {
        number: 1,
        state: "closed",
        merged: true,
        merged_at: new Date().toISOString(),
        merge_commit_sha: "f".repeat(40),
        head: { sha: H },
        base: { ref: "main" },
        merged_by: { id: 5, login: "maintainer", type: "User" },
      },
    }),
  );
  a.equal(ledger.list(h.store, { installationId: 2, repositoryId: 1 }).total, 1);
  a.equal(
    JSON.stringify(
      ledger.get(h.store, rows.records[0].recordId, {
        installationId: 2,
        repositoryId: 1,
      }),
    ),
    before,
  );
});

test("a merge of a commit no receipt covers is recorded as exactly that", async (t) => {
  const h = harness(t);
  await h.service.webhook(...hook());
  await h.service.drain();
  await h.service.webhook(
    ...hook("pull_request", {
      action: "closed",
      pull_request: {
        number: 1,
        state: "closed",
        merged: true,
        merged_at: new Date().toISOString(),
        merge_commit_sha: "f".repeat(40),
        head: { sha: OLD },
        base: { ref: "main" },
        merged_by: null,
      },
    }),
  );
  const rows = ledger.list(h.store, { installationId: 2, repositoryId: 1 });
  a.equal(rows.records[0].boundToMergedState, false);
  a.equal(rows.records[0].mergedBy, "UNKNOWN");
  const row = ledger.get(h.store, rows.records[0].recordId, {
    installationId: 2,
    repositoryId: 1,
  });
  a.equal(row.proof.state, "PROOF_BOUND_TO_OTHER_STATE");
  a.match(row.proof.plain, /does not describe the merged state/);
});

test("a merge with no proof at all is recorded without inventing one", (t) => {
  const h = harness(t);
  h.service.recordMerge("fixture/public", 1, 2, {
    number: 9,
    merged_at: new Date().toISOString(),
    merge_commit_sha: "a".repeat(40),
    head: { sha: OLD },
    base: { ref: "main" },
    merged_by: null,
  });
  const rows = ledger.list(h.store, { installationId: 2, repositoryId: 1 });
  a.equal(rows.records[0].verdict, "NO_PROOF");
  a.equal(rows.records[0].proofState, "NO_PROOF_RECORDED");
});

test("the ledger filters, states its own completeness and refuses another repository", (t) => {
  const h = harness(t);
  for (let pr = 1; pr <= 3; pr++)
    h.service.recordMerge("fixture/public", 1, 2, {
      number: pr,
      merged_at: `2026-09-0${pr}T10:00:00Z`,
      merge_commit_sha: String(pr).repeat(40),
      head: { sha: H },
      base: { ref: "main" },
      merged_by: null,
    });
  const all = ledger.list(h.store, { installationId: 2, repositoryId: 1 });
  a.equal(all.total, 3);
  a.match(all.completeness, /No merge records have been pruned/);
  a.equal(all.records[0].pr, 3);
  a.equal(
    ledger.list(h.store, { installationId: 2, repositoryId: 1, pr: 2 }).total,
    1,
  );
  a.equal(
    ledger.list(h.store, {
      installationId: 2,
      repositoryId: 1,
      since: "2026-09-02T00:00:00Z",
    }).total,
    2,
  );
  a.equal(ledger.list(h.store, { installationId: 2, repositoryId: 99 }).total, 0);
  a.equal(ledger.list(h.store, { installationId: 99, repositoryId: 1 }).total, 0);
  const id = all.records[0].recordId;
  a.throws(
    () => ledger.get(h.store, id, { installationId: 2, repositoryId: 99 }),
    /ACCESS_DENIED/,
  );
  a.throws(
    () => ledger.get(h.store, id, { installationId: 99, repositoryId: 1 }),
    /ACCESS_DENIED/,
  );
  a.throws(
    () => ledger.get(h.store, "missing", { installationId: 2, repositoryId: 1 }),
    /NOT_FOUND/,
  );
});

// --------------------------------------------------------------------- 20

test("the gate adds no billable proof: a re-proof of the same head is zero debit", async (t) => {
  const h = harness(t, { hosted: true });
  h.service.meter.connect(2, 7);
  h.service.data.subscriptions["1:1"]={installationId:2,repositoryId:1,repo:"fixture/public",pr:1};
  h.service.meter.paidPeriod("github:7",{verifiedPaid:true,quantity:1,periodStart:Date.now()-1000,periodEnd:Date.now()+86400000});
  await h.service.webhook(...hook());
  await h.service.drain();
  h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  const before = h.service.meter.usage(2);
  a.equal(before.used, 1);
  // Any number of further events on the same head re-prove without charging.
  for (const event of ["check_run", "workflow_run", "status"]) {
    await h.service.webhook(...hook(event));
    await h.service.drain();
  }
  a.equal(h.service.meter.usage(2).used, 1);
  a.equal(h.service.meter.usage(2).plan, "PRO");
  a.equal(h.service.meter.usage(2).automationAllowed, true);
});

test("policy selection is bounded, defaults to report-only and is recorded", (t) => {
  const h = harness(t);
  a.equal(policy.normalize(h.service.policyFor(1)).preset, "ADVISORY");
  a.equal(policy.normalize(h.service.policyFor(1)).enforced, false);
  const saved = h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS", 5);
  a.equal(saved.preset, "REPOSITORY_REQUIREMENTS");
  a.equal(saved.enforced, true);
  a.equal(saved.setByUserId, 5);
  a.ok(saved.setAt);
  a.throws(() => h.service.setPolicy(1, "ANYTHING_ELSE"), /UNKNOWN_POLICY/);
  a.throws(() => h.service.setPolicy(0, "ADVISORY"), /INVALID_SCOPE/);
  // An unknown stored value degrades to report-only rather than to enforcing.
  a.equal(policy.normalize({ preset: "GONE" }).enforced, false);
});

// ------------------------------------------------------- backward compatibility

test("a receipt stored by the previous version still renders, evaluates and ledgers", (t) => {
  const receipt = prove(capture());
  // Strip everything this change added, as an older stored snapshot would be.
  delete receipt.summary.actors;
  delete receipt.summary.gate;
  delete receipt.summary.ci.selfReference;
  delete receipt.evidence.actors;
  for (const row of receipt.evidence.checks.value) delete row.appSlug;
  for (const row of receipt.evidence.execution.value) {
    delete row.actor;
    delete row.triggeringActor;
  }
  const { text, html } = require("../receipt");
  const advisory = policy.evaluate(receipt, { state: "CURRENT" }, null);
  a.equal(advisory.conclusion, "success");
  const enforcing = policy.evaluate(receipt, { state: "STALE" }, {
    preset: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
  });
  a.equal(enforcing.conclusion, "failure");
  const rendered = html(receipt, { state: "CURRENT" }, advisory);
  a.match(rendered, /Who or what changed this/);
  a.match(rendered, /UNKNOWN/);
  a.match(text(receipt, { state: "CURRENT" }, advisory), /WHO \/ WHAT CHANGED THIS/);
  a.equal(subjects(receipt).length, 1);

  const snapshot = ledger.proofSnapshot(
    { receipt, current: { state: "CURRENT" } },
    receipt.identity.headSha,
    advisory,
  );
  a.equal(snapshot.verdict, "VERIFIED");
  a.equal(snapshot.actors.agentIdentity, "UNAVAILABLE");
});

test("a store snapshot missing the new keys boots without losing anything", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-old-"));
  let store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  // Exactly the shape the previous version wrote: no policies, no merges.
  store.data.github = {
    receipts: {},
    subscriptions: {},
    events: [],
    queue: [],
    revisions: {},
    completed: [],
  };
  store.save();
  const service = new ProofService({
    store,
    config: { webhookSecret: "s".repeat(40), appId: 42 },
    clientFactory: () => new Client(fixtureFetch()),
    appClient: async () => new Client(fixtureFetch()),
  });
  a.equal(service.policyFor(1), null);
  a.equal(policy.normalize(service.policyFor(1)).enforced, false);
  a.deepEqual(ledger.list(store, { installationId: 2, repositoryId: 1 }).records, []);
  a.equal(store.data.github.merges.pruned, 0);
});

test("policy activation invalidates and queues existing checks without another event", async t => {
  const h = harness(t);
  await h.service.webhook(...hook()); await h.service.drain();
  h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  a.equal(h.service.data.queue.length, 1);
  a.ok(Object.values(h.service.data.receipts).every(r => r.current.state === "STALE"));
  await h.service.retractChecks(await h.service.appClient(2, 1), 1);
  a.equal(h.writes.at(-1).o.body.conclusion, "failure");
  await h.service.drain();
  a.equal(h.writes.at(-1).o.body.conclusion, "success");
});

test("unknown App identity cannot waive an explicitly publisher-bound requirement", () => {
  const c = capture();
  c.rules.classic.value.required_status_checks.checks.push({context: NAME, app_id: 999});
  const r = prove(c);
  a.equal(r.verdict, "NOT_PROVEN");
  a.equal(r.summary.ci.selfReference, null);
  a.equal(r.summary.ci.required.find(x => x.name === NAME).state, "NAME_COLLIDES_WITH_MERGE_PROOF_CHECK");
});

test("partial publication persists the first identity before the second request fails", async () => {
  const r = prove(capture());
  r.summary.target = {state:"AVAILABLE", value:{kind:"MERGE_GROUP", sha:OLD}};
  const saved = []; let n = 0;
  await a.rejects(publish({request:async()=>{if (++n === 2) throw Error("provider"); return {id:777};}}, r,
    {state:"CURRENT"}, "https://example.test", null, on => saved.push(on)));
  a.deepEqual(saved, [{sha:H, kind:"PULL_REQUEST_HEAD", id:777}]);
});

test("a signed event during publication immediately retracts the returned check", async t => {
  const h = harness(t); h.service.setPolicy(1, "REPOSITORY_REQUIREMENTS");
  const original = h.service.appClient; let fired = false;
  h.service.appClient = async (...args) => {
    const client = await original(...args), request = client.request.bind(client);
    client.request = async (p,o) => {
      const result = await request(p,o);
      if (o?.method === "POST" && p.endsWith("/check-runs") && !fired) {
        fired = true; await h.service.webhook(...hook("pull_request_review"));
      }
      return result;
    }; return client;
  };
  await h.service.webhook(...hook()); await h.service.drain();
  a.equal(h.writes.at(-1).kind, "PATCH");
  a.equal(h.writes.at(-1).o.body.conclusion, "failure");
  a.equal(Object.values(h.service.data.receipts)[0].current.state, "UNAVAILABLE");
  a.equal(h.service.data.queue.length, 1);
});

test("delayed merge delivery never borrows a receipt issued after the merge", async t => {
  const h = harness(t); await h.service.webhook(...hook()); await h.service.drain();
  h.service.recordMerge("fixture/public",1,2,{number:1,head:{sha:H},merged_at:"2000-01-01T00:00:00Z",merge_commit_sha:OLD});
  a.equal(ledger.area(h.store).records[0].proof.state,"NO_PROOF_RECORDED");
});

test("ledger snapshot remains detached from receipt mutation and capacity is explicit", () => {
  const store = {data:{github:{}}}; const receipt = prove(capture());
  const proof = ledger.proofSnapshot({receipt,current:{state:"CURRENT"}},H,null);
  const row = ledger.record(store,{repository:"fixture/public",repositoryId:1,pr:1,mergeCommitSha:H,proof});
  receipt.summary.actors.agentIdentity = "CHANGED";
  proof.gaps.push("CHANGED");
  a.ok(!JSON.stringify(row).includes("CHANGED"));
  for(let n=2;n<=ledger.CAPACITY+1;n++) ledger.record(store,{repository:"fixture/public",repositoryId:1,pr:n,mergeCommitSha:H,proof:{state:"NO_PROOF_RECORDED"}});
  a.equal(ledger.area(store).records.length,ledger.CAPACITY);
  a.equal(ledger.area(store).pruned,1);
});

test("failed enforcing retraction remains pending and recovers without another webhook", async t => {
  const h = harness(t); await h.service.webhook(...hook()); await h.service.drain();
  h.service.setPolicy(1,"REPOSITORY_REQUIREMENTS");
  const original=h.service.appClient; let fail=true;
  h.service.appClient=async(...args)=>{const c=await original(...args),request=c.request.bind(c);c.request=(p,o)=>{if(fail&&o?.method==='PATCH')throw Error('provider unavailable');return request(p,o)};return c};
  await a.rejects(h.service.retractChecks(await h.service.appClient(2,1),1),{code:'CHECK_RECONCILIATION_PENDING'});
  await h.service.drain();
  a.equal(h.service.data.queue.length,1);
  a.equal(Object.values(h.service.data.receipts).length,1);
  fail=false;h.service.data.queue[0].retryAt=0;await h.service.drain();
  a.equal(h.service.data.queue.length,0);
  a.equal(h.writes.at(-1).o.body.conclusion,'success');
});
