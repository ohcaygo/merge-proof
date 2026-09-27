"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const procedurePath = path.join(root, "docs/current-truth/INDEPENDENT-REVIEW.md");
const productPath = path.join(root, "docs/current-truth/PRODUCT.md");
const procedure = fs.readFileSync(procedurePath, "utf8");

test("independent-review procedure has canonical metadata and bounded size", () => {
  assert.match(procedure, /\*\*Authority:\*\* Canonical Merge-Proof procedure/);
  assert.match(procedure, /\*\*Procedure version:\*\* 1/);
  const source = procedure.match(/\*\*Source main commit:\*\* `([0-9a-f]{40})`/);
  assert.ok(source, "missing full source main commit");
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", source[1], "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(ancestor.status, 0, ancestor.stderr || "source main commit must be an ancestor of HEAD");
  assert.ok(procedure.trim().split(/\s+/).length < 2200, "procedure must remain navigation-first and below 2,200 words");
});

test("independent-review procedure preserves required proof and lifecycle boundaries", () => {
  const required = [
    "## 2. Pin the review subject",
    "## 3. Establish current repository and lifecycle truth",
    "## 4. Review passes",
    "## 5. Evidence and proof semantics",
    "## 6. Findings and reviewer verdict",
    "## 7. Required review record",
    "## 8. Repairs, drift, and recheck",
    "## 9. Integration and landed truth",
    "[ran]",
    "[observed]",
    "[claimed]",
    "[not run]",
    "APPROVE_FOR_INTEGRATION",
    "NEEDS_FIXES",
    "NOT_PROVEN",
    "LANDED_VERIFIED",
    "LANDED_MISMATCH",
    "currentness at the original proof observation",
    "currentness held when the merge event arrived",
    "currentness at the merge decision",
    "OHCAYGO reviewer procedure is not Merge-Proof authority",
    "does not authorize integration",
  ];
  for (const item of required) assert.ok(procedure.includes(item), `missing required contract: ${item}`);
});

test("procedure is routed from product truth and is not candidate-specific", () => {
  const product = fs.readFileSync(productPath, "utf8");
  assert.match(product, /\[INDEPENDENT-REVIEW\.md\]\(\.\/INDEPENDENT-REVIEW\.md\).*authoritative pinned-candidate review procedure/);
  assert.doesNotMatch(procedure, /3c25aae2/i);
  assert.doesNotMatch(procedure, /context-routing-pilot/i);
});
