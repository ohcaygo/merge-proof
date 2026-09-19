"use strict";
// Cross-check: the repository's real prove() vs the scratch pure copy on the
// test fixture and on mutated variants (merge group, executed check, approval
// removed, unavailable rules). Same evidence, same receiptId -> same body?
const real = require("../../../../../github/proof.js");
const pure = require("./pure/proof.js");
const { capture } = require("../../../../../github/test/fixtures.js");
const { hash } = require("./pure/common.js");
const variants = {
  fixture: (c) => c,
  executedSuccess: (c) => { c.checks.value[0].conclusion = "success"; return c; },
  mergeGroup: (c) => { c.target.value = { kind: "MERGE_GROUP", sha: "e".repeat(40), headSha: c.identity.headSha, baseSha: c.identity.baseSha,
    selection: { state: "AVAILABLE", value: { headSha: "e".repeat(40), baseSha: c.identity.baseSha, candidateSha: c.identity.headSha } } }; return c; },
  noReviews: (c) => { c.reviews.value = []; return c; },
  rulesUnavailable: (c) => { c.rules.classic = { state: "UNAVAILABLE", reason: "403" }; return c; },
  gitUnavailable: (c) => { c.git = { state: "UNAVAILABLE", reason: "compare-capped" }; return c; },
  changedDuring: (c) => { c.consistency = "CHANGED_DURING_COLLECTION"; return c; },
  selfRuleApp: (c) => { c.rules.classic.value.required_status_checks.checks.push({ context: "Merge Proof exact-state receipt", app_id: 777 }); return c; },
};
let ok = 0, bad = 0;
for (const [name, mutate] of Object.entries(variants)) {
  const c = mutate(structuredClone(capture()));
  const a = real.prove(structuredClone(c), { appId: 777 });
  const b = pure.prove(structuredClone(c), { appId: 777, toolVersion: a.tool.version, receiptId: a.receiptId });
  const same = hash(a) === hash(b);
  same ? ok++ : bad++;
  console.log(`${same ? "SAME" : "DIFF"} ${name}: verdict ${a.verdict}/${b.verdict} gaps=${JSON.stringify(a.gaps)}`);
  if (!same) for (const k of Object.keys(a)) if (hash(a[k]) !== hash(b[k])) console.log("   differs in", k);
}
console.log(`${ok} identical, ${bad} different`);
