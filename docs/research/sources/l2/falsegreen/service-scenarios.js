"use strict";
// Service-level: merge_group fan-out to every tracked PR, event-during-collection liveness,
// org-ruleset webhook without `repository`, behind-base PR through the real collector.
const R = require("path").join(__dirname, "..", "..", "..", "..", "..", "github");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHmac, randomUUID } = require("node:crypto");
const { Store } = require(require("path").join(__dirname, "..", "..", "..", "..", "..", "factory", "store"));
const { ProofService } = require(R + "/service");
const { Client } = require(R + "/client");
const { collect } = require(R + "/collect");
const { prove } = require(R + "/proof");
const { fixtureFetch, H, B, M, OLD } = require(R + "/test/fixtures");
const SECRET = "s".repeat(40);
function hook(event, p) {
  const raw = Buffer.from(JSON.stringify(p));
  return [raw, { "x-github-delivery": randomUUID(), "x-github-event": event,
    "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex") }];
}
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-fg-"));
  const store = new Store(root);
  let options = {};
  const service = new ProofService({ store, config: { webhookSecret: SECRET, origin: "http://127.0.0.1" },
    clientFactory: ({ token } = {}) => new Client({ ...fixtureFetch(options), token }),
    appClient: async () => new Client(fixtureFetch(options)) });
  const repo = { id: 1, full_name: "fixture/public" }, inst = { id: 2 };

  // A. Two tracked PRs; a merge_group checks_requested event for PR 1's group.
  await service.webhook(...hook("pull_request", { repository: repo, installation: inst, pull_request: { number: 1, state: "open" } }));
  await service.webhook(...hook("pull_request", { repository: repo, installation: inst, pull_request: { number: 2, state: "open" } }));
  service.data.queue.length = 0;
  await service.webhook(...hook("merge_group", { action: "checks_requested", repository: repo, installation: inst,
    merge_group: { head_sha: M, base_sha: B, base_ref: "refs/heads/main", head_ref: "refs/heads/gh-readonly-queue/main/pr-1-abc" } }));
  console.log("A. after merge_group checks_requested (group is PR 1's):");
  for (const s of Object.values(service.data.subscriptions)) console.log("   sub pr", s.pr, "mergeGroup.head_ref =", s.mergeGroup?.head_ref);
  console.log("   queue:", service.data.queue.map(q => `pr${q.pr}:${q.mergeGroup ? "GROUP" : "plain"}`).join(" "));

  // B. What collect() does for PR 2 when given PR 1's group (PR 2's head is not an ancestor of the group).
  const H2 = "1".repeat(40);
  const f = fixtureFetch({ mutate: (p, v) => {
    if (p.endsWith("/pulls/2")) return { ...v, number: 2, head: { ...v.head, sha: H2 } };
    if (p.includes(`/compare/${H2}...${M}`)) return { ...v, merge_base_commit: { sha: OLD, commit: { committer: { date: "2026-09-10T12:00:00Z" } } } };
    return v; } });
  const orig = f.fetchImpl;
  f.fetchImpl = (u, o) => { const p = new URL(u).pathname; return p.endsWith("/pulls/2") || p.endsWith("/pulls/1") ? orig(u.replace("/pulls/2", "/pulls/1"), o).then(async r => { const v = await r.json(); return new Response(JSON.stringify(p.endsWith("/pulls/2") ? { ...v, number: 2, head: { ...v.head, sha: H2 } } : v)); }) : orig(u, o); };
  const c2 = await collect(new Client(f), "fixture/public", 2, { mergeGroup: { head_sha: M, base_sha: B, base_ref: "refs/heads/main", head_ref: "refs/heads/gh-readonly-queue/main/pr-1-abc" } });
  console.log("B. PR 2 collected with PR 1's group: target =", c2.target.state, c2.target.reason, "| verdict =", prove(c2).verdict, "| gaps =", prove(c2).gaps.join(","));

  // C. Event during collection for an UNRELATED PR in the same repo -> STALE.
  service.data.queue.length = 0;
  const original = service.clientFactory;
  service.clientFactory = () => { const cl = new Client(fixtureFetch()); const get = cl.get.bind(cl); let n = 0;
    cl.get = async (e) => { if (++n === 5) await service.webhook(...hook("check_run", { action: "completed", repository: repo, installation: inst, check_run: { app: { id: 15368 } } })); return get(e); };
    return cl; };
  const out = await service.run("fixture/public", 1, {});
  console.log("C. unrelated check_run event during collection -> receipt", out.receipt.verdict, "current =", out.current.state, out.current.reason, "| policy(enforcing).conclusion =", require(R+"/policy").evaluate(out.receipt, out.current, {preset:"REPOSITORY_REQUIREMENTS"}).conclusion);
  service.clientFactory = original;

  // D. Org-level repository_ruleset delivery with no `repository` object.
  try { await service.webhook(...hook("repository_ruleset", { action: "edited", organization: { login: "fixture" }, installation: inst, repository_ruleset: { id: 42, source_type: "Organization" } })); console.log("D. accepted"); }
  catch (e) { console.log("D. org-level repository_ruleset without repository ->", e.code, "(no receipt staled, no re-proof queued)"); }

  // E. Behind-base PR through the real collector with Actions-style head-attached checks.
  const c = await collect(new Client(fixtureFetch({ mergeBase: OLD })), "fixture/public", 1);
  const r = prove(c);
  console.log("E. real collector, behind-base: target.kind =", c.target.value.kind, "sha =", c.target.value.sha.slice(0,4), "| checks on:", c.checks.value.map(x=>x.sha.slice(0,4)).join(","), "| verdict =", r.verdict, "| ci.required[0].state =", r.summary.ci.required[0].state, "| accepted =", r.summary.ci.acceptedCount);
  store.close(); fs.rmSync(root, { recursive: true, force: true });
})().catch(e => { console.error("SCRIPT ERROR", e); process.exit(1); });
