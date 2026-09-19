"use strict";
const R = require("path").join(__dirname, "..", "..", "..", "..", "..", "github");
const { capture, fixtureFetch, H, T } = require(R + "/test/fixtures");
const { prove, freshness } = require(R + "/proof");
const { collect } = require(R + "/collect");
const { Client } = require(R + "/client");
const { available: A } = require(R + "/common");
(async () => {
  const r = prove(capture());
  // G1. Unrelated new check run (different name) on head -> STALE
  const c1 = capture(); c1.checks.value.push({ id: 99, name: "lint-unrelated", appId: 77, appSlug: "x", sha: H, status: "completed", conclusion: "success", startedAt: T, completedAt: T, suiteId: 9 });
  console.log("G1 unrelated check run appears ->", freshness(r, c1).state, freshness(r, c1).changed);
  // G2. COMMENTED review appears -> STALE
  const c2 = capture(); c2.reviews.value.push({ id: 61, userId: 5, login: "x", userType: "User", state: "COMMENTED", sha: H, submittedAt: T, writePermission: A(true) });
  console.log("G2 COMMENTED review appears ->", freshness(r, c2).state, freshness(r, c2).changed);
  // G3. mergeable_state string flips (e.g. clean -> unstable) -> STALE
  const c3 = capture(); c3.identity.githubMergeState = "unstable";
  console.log("G3 mergeable_state flips ->", freshness(r, c3).state, freshness(r, c3).changed);
  // G4. requests per proof through real collector
  const f = fixtureFetch(); await collect(new Client(f), "fixture/public", 1);
  console.log("G4 GitHub requests per proof (two observations, 1 check, 1 run, 1 reviewer):", f.calls.length, "; per collectOnce:", f.calls.length / 2);
  const perProof = f.calls.length;
  for (const [prs, evPerHour] of [[10, 60], [50, 120], [100, 600]])
    console.log(`   ${prs} tracked PRs, ${evPerHour} repo events/h -> ${prs * perProof} requests per full re-proof cycle; 5000/h budget allows ${Math.floor(5000 / perProof)} proofs/h; cycle needs ${(prs * perProof / 5000 * 60).toFixed(0)} min at budget, but every event restales all ${prs} receipts (mean gap between events ${(60 / evPerHour).toFixed(1)} min)`);
})();
