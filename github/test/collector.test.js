"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const { Client } = require("../client");
const { collect } = require("../collect");
const { prove, freshness } = require("../proof");
const { fixtureFetch, H, B, M, OLD } = require("./fixtures");
for (const rule of ["required_signatures", "required_linear_history"])
  test(`classic ${rule} is preserved, blocks unsupported proof and stales history`, async () => {
    const before = prove(await collect(new Client(fixtureFetch()), "fixture/public", 1));
    a.equal(before.verdict, "VERIFIED");
    const after = await collect(new Client(fixtureFetch({
      mutate: (p, v) => p.endsWith("/protection")
        ? { ...v, [rule]: { enabled: true } } : v,
    })), "fixture/public", 1);
    a.equal(after.rules.classic.value[rule].enabled, true);
    a.equal(prove(after).verdict, "NOT_PROVEN");
    a.equal(freshness(before, after).state, "STALE");
    a.equal(before.verdict, "VERIFIED");
  });
test("real collector projects REST metadata into a complete proof with no source or review bodies", async () => {
  const f = fixtureFetch(),
    c = await collect(new Client(f), "fixture/public", 1);
  a.equal(prove(c).verdict, "VERIFIED");
  a.equal(c.consistency, "STABLE_OBSERVATION");
  a.doesNotMatch(JSON.stringify(c), /NEVER STORE|DO NOT STORE/);
  a.ok(f.calls.every((x) => x.method === "GET" || x.path === "/graphql"));
});
test("classic protection 404 on protected branch is unavailable, never absent", async () => {
  const c = await collect(
    new Client(
      fixtureFetch({
        failPath: "/repos/fixture/public/branches/main/protection",
      }),
    ),
    "fixture/public",
    1,
  );
  a.equal(c.rules.classic.state, "UNAVAILABLE");
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("unprotected branch with 404 and empty active rules is confirmed no classic rule", async () => {
  const f = fixtureFetch({
    mutate: (p, v) =>
      p === "/repos/fixture/public/branches/main"
        ? { ...v, protected: false }
        : v,
  });
  const original = f.fetchImpl;
  f.fetchImpl = (u, o) =>
    new URL(u).pathname.endsWith("/protection")
      ? Promise.resolve(new Response("{}", { status: 404 }))
      : original(u, o);
  const c = await collect(new Client(f), "fixture/public", 1);
  a.equal(c.rules.classic.state, "AVAILABLE");
  a.equal(c.rules.classic.value, null);
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("300-file compare boundary fails closed", async () => {
  const c = await collect(
    new Client(
      fixtureFetch({
        changedFiles: Array.from({ length: 300 }, (_, i) => `src/${i}.js`),
      }),
    ),
    "fixture/public",
    1,
  );
  a.equal(c.git.state, "UNAVAILABLE");
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("changed check between collections is detected", async () => {
  let round = 0;
  const f = fixtureFetch({
    mutate: (p, v) => {
      if (p.endsWith("/pulls/1")) round++;
      if (p.endsWith("/check-runs") && round > 1)
        v.check_runs[0].conclusion = "failure";
      return v;
    },
  });
  const c = await collect(new Client(f), "fixture/public", 1);
  a.equal(c.consistency, "CHANGED_DURING_COLLECTION");
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("pagination limit and request budget never imply empty evidence", async () => {
  const c = new Client({
    fetchImpl: async () =>
      new Response(JSON.stringify(Array(100).fill({ id: 1 }))),
  });
  await a.rejects(c.list("/repos/fixture/public/statuses"), /PAGINATION_LIMIT/);
  const b = new Client({ maxRequests: 0 });
  await a.rejects(b.get("/repos/fixture/public"), /API_BUDGET_EXHAUSTED/);
});
test("test merge requires exact parents and current ref", async () => {
  const c = await collect(
    new Client(fixtureFetch({ mergeBase: OLD })),
    "fixture/public",
    1,
  );
  a.equal(c.target.state, "AVAILABLE");
  a.equal(c.target.value.sha, M);
  a.equal(prove(c).verdict, "NOT_PROVEN");
  const bad = await collect(
    new Client(
      fixtureFetch({
        mergeBase: OLD,
        mutate: (p, v) =>
          p.endsWith("/commits/" + M)
            ? { ...v, parents: [{ sha: OLD }, { sha: H }] }
            : v,
      }),
    ),
    "fixture/public",
    1,
  );
  a.equal(bad.target.state, "UNAVAILABLE");
});
test("merge group requires live ref and ancestor evidence, never branch-name guess", async () => {
  const group = {
    head_sha: M,
    base_sha: B,
    base_ref: "refs/heads/main",
    head_ref: "refs/heads/gh-readonly-queue/main/pr-1",
  };
  const c = await collect(new Client(fixtureFetch()), "fixture/public", 1, {
    mergeGroup: group,
  });
  a.equal(c.target.value.kind, "MERGE_GROUP");
  a.equal(prove(c).verdict, "NOT_PROVEN");
  const bad = await collect(new Client(fixtureFetch()), "fixture/public", 1, {
    mergeGroup: { ...group, base_sha: OLD },
  });
  a.equal(bad.target.state, "UNAVAILABLE");
});
test("remote ref mismatch is recorded without losing historical identity", async () => {
  const c = await collect(
    new Client(
      fixtureFetch({
        mutate: (p, v) =>
          p.endsWith("/heads/feature") ? { object: { sha: OLD } } : v,
      }),
    ),
    "fixture/public",
    1,
  );
  a.equal(c.remote.value.confirmed, false);
  a.equal(c.identity.headSha, H);
  a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("current queue selection must match live GraphQL entry; old group remains unproven", async () => {
  const f = fixtureFetch(),
    baseFetch = f.fetchImpl;
  f.fetchImpl = (u, o) =>
    new URL(u).pathname === "/graphql"
      ? Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                repository: {
                  databaseId: 1,
                  pullRequest: {
                    headRefOid: H,
                    mergeQueueEntry: {
                      id: "Q",
                      state: "MERGEABLE",
                      headCommit: { oid: M },
                      baseCommit: { oid: B },
                    },
                  },
                },
              },
            }),
          ),
        )
      : baseFetch(u, o);
  const group = {
    head_sha: M,
    base_sha: B,
    base_ref: "refs/heads/main",
    head_ref: "refs/heads/gh-readonly-queue/main/pr-1",
  };
  const c = await collect(new Client(f), "fixture/public", 1, {
    mergeGroup: group,
  });
  a.equal(c.target.value.selection.state, "AVAILABLE");
  group.head_sha = OLD;
  const old = await collect(new Client(f), "fixture/public", 1, {
    mergeGroup: group,
  });
  a.equal(old.target.state, "UNAVAILABLE");
});
test("queue admission proves PR evidence without pretending the future group is proven", async () => {
  const f = () => fixtureFetch({ mutate: (p, v) => p.includes('/rules/branches/')
    ? [{type:'merge_queue',parameters:{grouping_strategy:'HEADGREEN'}}] : v });
  const c = await collect(new Client(f()), 'fixture/public', 1);
  const receipt = prove(c);
  a.equal(receipt.verdict, 'VERIFIED');
  a.equal(receipt.summary.queueStage, 'ADMISSION_ONLY');
  a.ok(receipt.notChecked.includes('MERGE_QUEUE_GROUP_NOT_YET_PROVEN'));
  a.deepEqual(require('../check').subjects(receipt), [{sha:H,kind:'PULL_REQUEST_HEAD'}]);
  const group = {head_sha:M,base_sha:B,base_ref:'refs/heads/main',head_ref:'refs/heads/gh-readonly-queue/main/pr-1'};
  const grouped = prove(await collect(new Client(f()), 'fixture/public', 1, {mergeGroup:group}));
  a.equal(grouped.summary.queueStage, 'MERGE_GROUP');
  a.equal(grouped.verdict, 'NOT_PROVEN');
  a.ok(grouped.gaps.includes('CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE'));
  a.equal(freshness(receipt, grouped.evidence).state, 'STALE');
});
