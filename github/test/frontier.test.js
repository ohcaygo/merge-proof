"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const { capture, H, B, M, OLD, fixtureFetch } = require("./fixtures");
const { prove, freshness } = require("../proof");
const { available: A, unavailable: U, hash } = require("../common");
const { touches } = require("../currentness");
const { collect } = require("../collect");
const { Client } = require("../client");
function addRun(c, change = {}) {
  c.checks.value.push({ ...c.checks.value[0], id: 11 });
  c.execution.value.push({ ...structuredClone(c.execution.value[0]), checkId: 11, jobId: 41, runId: 21, ...change });
}
test("F1: same-App workflow collision and candidate-authored evidence cannot verify", () => {
  const c = capture(); c.checks.value[0].conclusion = "failure";
  addRun(c, { workflowId: 31, workflowPath: ".github/workflows/fake.yml" });
  c.git.value.candidateFiles.push(".github/workflows/fake.yml");
  const r = prove(c); a.equal(r.verdict, "NOT_PROVEN");
  a.ok(r.gaps.includes("EVIDENCE_PRODUCER_AMBIGUOUS"));
  a.ok(r.gaps.includes("EVIDENCE_AUTHORITY_CHANGED_BY_SUBJECT"));
});
for (const event of ["workflow_dispatch", "schedule", "push", "pull_request_target", null])
  test(`F2: ${event} never replaces qualifying execution`, () => {
    const c = capture(); c.checks.value[0].conclusion = "failure";
    addRun(c, { event });
    a.notEqual(prove(c).verdict, "VERIFIED");
    c.checks.value[0].conclusion = "success";
    c.checks.value[1].conclusion = "failure";
    a.equal(prove(c).verdict, "VERIFIED");
    c.checks.value.shift(); c.execution.value.shift();
    a.equal(prove(c).verdict, "NOT_PROVEN");
    a.ok(prove(c).gaps.includes("EXECUTION_EVENT_INELIGIBLE"));
  });
test("same producer rerun passes; unrelated workflow does not create ambiguity", () => {
  const c = capture(); addRun(c, { attempt: 2 });
  a.equal(prove(c).verdict, "VERIFIED");
  c.checks.value[1].name = "unrelated"; c.execution.value[1].workflowId = 31;
  a.equal(prove(c).verdict, "VERIFIED");
});
test("unknown producer and missing workflow blob fail closed", () => {
  for (const key of ["workflowId", "workflowPath", "workflowBlob", "event"]) {
    const c = capture(); delete c.execution.value[0][key]; a.equal(prove(c).verdict, "NOT_PROVEN");
  }
});
test("G1-G3: unrelated checks, comments and mergeability never stale claims", () => {
  const c = capture(), r = prove(c);
  c.checks.value.push({ ...c.checks.value[0], name: "noise", id: 99 });
  c.reviews.value.push({ ...c.reviews.value[0], state: "COMMENTED", id: 99 });
  c.identity.githubMergeable = null; c.identity.githubMergeState = "unknown";
  a.equal(freshness(r, c).state, "CURRENT");
});
test("a CI change invalidates only CI; historical receipt never mutates", () => {
  const c = capture(), r = prove(c), before = hash(r);
  c.checks.value[0].conclusion = "failure";
  a.deepEqual(freshness(r, c).changed, ["CI_EXECUTED"]);
  a.equal(hash(r), before);
});
test("permission unknown excludes its reviewer without contaminating other claims", () => {
  const c = capture(); c.reviews.value.push({ ...c.reviews.value[0], id: 62, userId: 5, writePermission: U("404") });
  a.equal(prove(c).verdict, "VERIFIED");
  c.reviews.value.shift(); a.equal(prove(c).verdict, "NOT_PROVEN");
  a.equal(freshness(prove(c), c).state, "CURRENT");
});
test("only observed writers can block with CHANGES_REQUESTED", () => {
  const c = capture(); c.reviews.value.push({ ...c.reviews.value[0], id: 62, userId: 5, state: "CHANGES_REQUESTED", writePermission: A(false) });
  a.equal(prove(c).verdict, "VERIFIED");
  c.reviews.value[1].writePermission = A(true); a.equal(prove(c).verdict, "FAIL");
});
test("uncertainty is NOT_PROVEN; a bound failed required check is FAIL", () => {
  const c = capture(); c.checks.value[0].conclusion = "failure"; a.equal(prove(c).verdict, "FAIL");
  c.consistency = "CHANGED_DURING_COLLECTION"; a.equal(prove(c).verdict, "NOT_PROVEN");
  c.consistency = "STABLE_OBSERVATION"; c.git = U("HISTORY_MISSING"); a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("push-time rules do not block or invalidate evidence claims", () => {
  const c = capture(), r = prove(c); c.rules.active.value.push({ type: "update" });
  a.equal(prove(c).verdict, "VERIFIED"); a.equal(freshness(r, c).state, "CURRENT");
  c.rules.active.value.push({ type: "workflows" }); a.equal(prove(c).verdict, "NOT_PROVEN");
});
test("bound execution on combined candidate resolves the behind-base drift gap", () => {
  const c = capture(); c.git.value.mergeBase = OLD; c.git.value.baseAdvanceCommits = 2; c.git.value.baseFiles = ["src/feature.js"];
  c.target = A({ kind: "PR_TEST_MERGE", sha: M, tree: "e".repeat(40), headSha: H, baseSha: B, parents: [B,H] });
  c.checks.value[0].sha = M;
  Object.assign(c.execution.value[0], { sha: M, runSha: M }); c.execution.value[0].workflowBlob.value.commit = M;
  a.equal(prove(c).verdict, "VERIFIED"); a.ok(!prove(c).gaps.includes("BASE_DRIFT_UNVERIFIED"));
});
test("collector retains producer, workflow blob, event and exact tree", async () => {
  const c = await collect(new Client(fixtureFetch()), "fixture/public", 1);
  a.equal(prove(c).verdict, "VERIFIED"); a.equal(c.execution.value[0].event, "pull_request");
  a.equal(c.execution.value[0].workflowBlob.value.commit, H); a.ok(c.target.value.tree);
});
test("1000 seeded state sequences protect subject, event, authority and locality invariants", () => {
  let seed = 0x41ce845;
  const next = () => (seed = (1664525 * seed + 1013904223) >>> 0);
  for (let n = 0; n < 1000; n++) {
    const c = capture(), receipt = prove(c), original = hash(receipt);
    for (let step = 0; step < 5; step++) {
      const action = next() % 8;
      if (action === 0) c.execution.value[0].event = "schedule";
      if (action === 1) c.execution.value[0].runSha = OLD;
      if (action === 2) c.reviews.value[0].sha = OLD;
      if (action === 3) c.reviews.value[0].writePermission = U("403");
      if (action === 4) c.checks.value[0].appId = 77;
      if (action === 5) c.consistency = "CHANGED_DURING_COLLECTION";
      if (action === 6) c.rules.active = U("403");
      if (action === 7) c.execution.value[0].workflowId = null;
      a.notEqual(prove(c).verdict, "VERIFIED");
      a.equal(hash(receipt), original);
    }
  }
});
test("event routing touches only the relevant PR, subject and claim", () => {
  const c = capture();
  a.deepEqual(touches("check_run", { check_run: { head_sha: H, name: "noise", app: { id: 10 } } }, c), []);
  a.deepEqual(touches("pull_request_review", { pull_request: { number: 2 } }, c), []);
  a.deepEqual(touches("push", { ref: "refs/heads/unrelated" }, c), []);
  a.deepEqual(touches("push", { ref: "refs/heads/main" }, c), ["TARGET", "CI_EXECUTED"]);
  a.deepEqual(touches("membership", {}, c), ["APPROVAL_CURRENT"]);
});

test("execution protection snapshots bind only relevant workflows; evaluate mode does not enforce", async () => {
  const c = capture();
  const policy = { id: 1, source: "fixture/public", sourceType: "Repository", enforcement: "active", conditions: { workflow_path: { include: [".github/workflows/ci.yml"], exclude: [] } },
    rules: [{ type: "restrict_action_events", parameters: { allowed_events: ["pull_request"] } }, { type: "restrict_actions_actors", parameters: { allowed_actors: [{ type: "User", id: 1 }] } }] };
  c.rules.executionProtections = A([policy]);
  a.equal(prove(c).verdict, "VERIFIED"); const r = prove(c);
  const unrelated = structuredClone(policy); unrelated.id = 2; unrelated.conditions.workflow_path.include = [".github/workflows/deploy.yml"];
  c.rules.executionProtections.value.push(unrelated); a.equal(freshness(r, c).state, "CURRENT");
  policy.rules[0].parameters.allowed_events = ["push"];
  a.equal(prove(c).verdict, "NOT_PROVEN"); a.ok(prove(c).gaps.includes("EXECUTION_EVENT_DENIED"));
  a.deepEqual(freshness(r,c).changed, ["CI_EXECUTED", "RULES_SNAPSHOT"]);
  policy.enforcement = "evaluate"; a.equal(prove(c).verdict, "VERIFIED");
  policy.enforcement = "active"; policy.rules[0].parameters.allowed_events = ["pull_request"];
  policy.rules[1].parameters.allowed_actors = [{type:"Team",id:99}];
  a.ok(prove(c).gaps.includes("EXECUTION_ACTOR_POLICY_UNPROVEN"));
  c.rules.executionProtections = U("GITHUB_HTTP_403");
  a.ok(prove(c).notChecked.includes("EXECUTION_PROTECTIONS_UNAVAILABLE"));
  const fixture = fixtureFetch({mutate:(p,v)=>v});
  const f = async (url, init) => {
    const p = new URL(url).pathname;
    if (p.endsWith("/actions/policies")) return Response.json({total_count:1,policies:[{id:1}]});
    if (p.endsWith("/actions/policies/1")) return Response.json({...policy,target:"actions",source_type:"Repository"});
    return fixture.fetchImpl(url,init);
  };
  const observed = await collect(new Client({fetchImpl:f}),"fixture/public",1);
  a.equal(observed.rules.executionProtections.value[0].id,1);
  a.ok(prove(observed).gaps.includes("EXECUTION_ACTOR_POLICY_UNPROVEN"));
});
test("coverage rules retain thresholds without pretending a generic CI success proves coverage", () => {
  const c=capture(), r=prove(c);
  c.rules.active.value.push({type:"code_coverage",ruleset_id:42,parameters:{minimum_coverage:80,max_coverage_drop:2}});
  const p=prove(c); a.equal(p.verdict,"NOT_PROVEN"); a.equal(p.summary.rules.unsupported.length,0);
  a.ok(p.gaps.includes("CODE_COVERAGE_EVIDENCE_UNAVAILABLE"));
  a.deepEqual(p.summary.rules.coverage[0].parameters,{minimum_coverage:80,max_coverage_drop:2});
  a.deepEqual(freshness(r,c).changed,["RULES_SNAPSHOT"]);
  c.rules.active.value[0].parameters.minimum_coverage="80";
  a.ok(prove(c).gaps.includes("CODE_COVERAGE_RULE_MALFORMED"));
});
test("wrong PR context cannot create FAIL; bot initiation and target topology remain explicit", () => {
  const c=capture(); c.checks.value[0].conclusion="failure";
  c.execution.value[0].pullRequests[0].number=2; a.equal(prove(c).verdict,"NOT_PROVEN");
  const bot=capture();bot.identity.author.type="Bot";
  bot.reviews.value.push({...bot.reviews.value[0],id:61,userId:3});
  a.ok(prove(bot).gaps.includes("INITIATING_HUMAN_UNAVAILABLE"));
  bot.authority={activity:A({actor:{type:"User",id:2},after:H})};
  a.equal(prove(bot).summary.approval.current.length,1);
  const wrong=capture();wrong.git.value.mergeBase=OLD;
  a.equal(prove(wrong).verdict,"NOT_PROVEN"); a.equal(prove(wrong).claims.find(x=>x.name==="TARGET").state,"UNKNOWN");
});
