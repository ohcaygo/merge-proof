"use strict";
// Merge assurance policy.
//
// The receipt says what the evidence established. The policy says which of the
// receipt's evidence gaps the repository owner has chosen to enforce at merge.
// These are deliberately separate: a policy can never turn NOT_PROVEN into
// VERIFIED, and it can never hide a gap. It only decides whether a gap is
// reported or blocks the merge.
//
// Fail closed by construction: under an enforcing preset every gap blocks
// unless it appears in an explicit non-enforced set. A gap code introduced
// later therefore blocks by default rather than silently becoming advisory.
const { assert } = require("./common");

const PRESETS = {
  // Existing behavior. Merge Proof reports; it never blocks a merge.
  ADVISORY: {
    id: "ADVISORY",
    enforced: false,
    boundaries: false,
    label: "Report only",
    description:
      "Merge Proof publishes its result and never blocks a merge. This is the default for every repository.",
  },
  // "Read what the repository already requires, then prove whether the
  // available evidence actually establishes it for the state being merged."
  REPOSITORY_REQUIREMENTS: {
    id: "REPOSITORY_REQUIREMENTS",
    enforced: true,
    boundaries: false,
    label: "Require proof of this repository's own requirements",
    description:
      "Blocks merge unless the evidence for the requirements this repository already configures is established for the exact state being merged. Protected-boundary changes are reported but do not block.",
  },
  REPOSITORY_REQUIREMENTS_AND_BOUNDARIES: {
    id: "REPOSITORY_REQUIREMENTS_AND_BOUNDARIES",
    enforced: true,
    boundaries: true,
    label: "Also require extra approval for protected boundaries",
    description:
      "As above, and a candidate touching a protected boundary (migration, schema, auth, secrets, billing, access policy) additionally needs at least two current eligible human approvals.",
  },
};

// The only gaps an enforcing preset may leave non-blocking, and only when the
// preset says so. Everything else blocks.
const BOUNDARY_SCOPED_GAPS = new Set(["PROTECTED_BOUNDARY"]);

const BOUNDARY_APPROVALS = 2;
const DEFAULT_PRESET = "ADVISORY";

function preset(id) {
  return PRESETS[id] || PRESETS[DEFAULT_PRESET];
}

function normalize(stored) {
  const p = preset(stored?.preset);
  return {
    version: 1,
    preset: p.id,
    enforced: p.enforced,
    boundaries: p.boundaries,
    label: p.label,
    description: p.description,
    setAt: stored?.setAt || null,
    setByUserId: Number.isSafeInteger(stored?.setByUserId)
      ? stored.setByUserId
      : null,
  };
}

function select(id) {
  assert(Object.prototype.hasOwnProperty.call(PRESETS, id), "UNKNOWN_POLICY");
  return PRESETS[id];
}

// Additional evidence an enforcing boundary preset requires beyond the
// repository's own rules. Derived from evidence already in the receipt.
function boundaryEscalation(receipt) {
  const local = receipt.local || {};
  const touched = (local.findings || []).some(
    (f) => f.id === "PROTECTED_BOUNDARY",
  );
  if (!touched) return null;
  const approval = receipt.summary?.approval;
  const current = approval?.current?.length ?? 0;
  const required = Math.max(approval?.required ?? 0, BOUNDARY_APPROVALS);
  return {
    touched: true,
    required,
    observed: current,
    satisfied:
      approval?.state !== undefined &&
      approval.reason !== "REVIEWS_UNAVAILABLE" &&
      current >= required,
  };
}

// receipt + currentness + stored policy -> what the merge gate should say.
// Never mutates the receipt and never changes its verdict.
function evaluate(receipt, current, stored) {
  const policy = normalize(stored);
  const gaps = [...new Set(receipt.gaps || [])];
  const currentState = current?.state || "UNAVAILABLE";
  const blocking = [];
  const reported = [];

  const escalation = policy.boundaries ? boundaryEscalation(receipt) : null;
  for (const gap of gaps) {
    const boundaryScoped = BOUNDARY_SCOPED_GAPS.has(gap);
    const enforcedHere =
      policy.enforced && (!boundaryScoped || (policy.boundaries && !escalation?.satisfied));
    (enforcedHere ? blocking : reported).push(gap);
  }

  if (escalation && !escalation.satisfied)
    blocking.push("PROTECTED_BOUNDARY_APPROVAL_REQUIRED");

  if (receipt.verdict === "FAIL" && policy.enforced)
    blocking.push("REQUIRED_CONDITION_FAILED");
  if (currentState !== "CURRENT" && policy.enforced)
    blocking.push(
      currentState === "STALE" ? "RECEIPT_STALE" : "CURRENTNESS_UNAVAILABLE",
    );

  const uniqueBlocking = [...new Set(blocking)].sort();
  const satisfied = policy.enforced ? uniqueBlocking.length === 0 : null;
  const conclusion = policy.enforced
    ? uniqueBlocking.length
      ? "failure"
      : "success"
    : receipt.verdict === "VERIFIED" && currentState === "CURRENT"
      ? "success"
      : "neutral";

  return {
    version: 1,
    preset: policy.preset,
    enforced: policy.enforced,
    boundaries: policy.boundaries,
    // `success`/`failure` are the only conclusions an enforcing gate emits.
    // `neutral` and `skipped` are treated by GitHub as a passing required
    // check, so an enforcing gate must never report them.
    conclusion,
    satisfied,
    blocking: uniqueBlocking,
    reported: [...new Set(reported)].sort(),
    currentness: currentState,
    verdict: receipt.verdict,
    boundaryEscalation: escalation,
    mergeConsequence: consequence(policy, uniqueBlocking, conclusion),
  };
}

function consequence(policy, blocking, conclusion) {
  if (!policy.enforced)
    return conclusion === "success"
      ? "Merge Proof is set to report only. It is not blocking this merge."
      : "Merge Proof is set to report only. This result does not block the merge.";
  return blocking.length
    ? "Merge Proof reports failure under this policy. If the repository requires this check, it blocks the merge until the listed evidence is established."
    : "Merge Proof reports success under this policy. If the repository requires this check, this result satisfies it.";
}

// The conclusion to leave on a previously published check whose evidence has
// moved. Under an enforcing policy a superseded proof must not keep allowing
// the merge, so it becomes `failure` rather than `neutral`.
function staleConclusion(stored) {
  return normalize(stored).enforced ? "failure" : "neutral";
}

module.exports = {
  PRESETS,
  DEFAULT_PRESET,
  BOUNDARY_APPROVALS,
  BOUNDARY_SCOPED_GAPS,
  preset,
  select,
  normalize,
  evaluate,
  staleConclusion,
  boundaryEscalation,
};
