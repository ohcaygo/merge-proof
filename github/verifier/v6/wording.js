"use strict";
// Plain language on top, technical evidence underneath.
//
// Every gap answers four questions: what could not be established, why that
// matters, what to do about it, and whether Merge Proof will re-check by
// itself once it is done. Nothing here says a change is unsafe, buggy or
// vulnerable; Merge Proof does not collect evidence for those claims.
//
// `reproof` is AUTOMATIC when resolving the gap produces a GitHub event the
// App already subscribes to, so a new proof follows without being asked.

const GAPS = {
  EXECUTION_PROTECTIONS_UNAVAILABLE: {
    plain: "Applicable workflow execution protections could not be read.",
    why: "Missing policy facts cannot establish that this evidence producer was eligible.",
    doNext: "Restore authorized policy reads and refresh proof. Do not relax the policy to obtain a passing receipt.", reproof: "MANUAL",
  },
  EXECUTION_POLICY_CHANGED_AFTER_EVIDENCE: {
    plain: "An applicable execution policy changed after this workflow started.",
    why: "The current policy does not establish which restrictions applied to the recorded execution.",
    doNext: "Collect a qualifying execution under the current policy.", reproof: "AUTOMATIC",
  },
  EXECUTION_ACTOR_DENIED: {
    plain: "The bound workflow actor is excluded by an applicable actor allowlist.",
    why: "The exact producer does not satisfy the required execution policy.",
    doNext: "Collect qualifying execution from an eligible actor under the existing policy.", reproof: "AUTOMATIC",
  },
  MINIMUM_LINE_COVERAGE_NOT_MET: {
    plain: "Bound aggregate line coverage is below the required minimum.",
    why: "The qualifying measurement demonstrates an unmet required condition.",
    doNext: "Satisfy the coverage requirement and collect current bound evidence.", reproof: "AUTOMATIC",
  },
  MAXIMUM_LINE_COVERAGE_DROP_EXCEEDED: {
    plain: "Bound line coverage dropped more percentage points than the policy permits.",
    why: "The candidate and default-branch aggregates demonstrate an unmet required condition.",
    doNext: "Satisfy the coverage requirement and collect current bound evidence.", reproof: "AUTOMATIC",
  },
  CODE_COVERAGE_EVIDENCE_UNAVAILABLE: {
    plain: "This branch requires code coverage thresholds; evidence bound to this exact candidate is unavailable.",
    why: "The coverage rule and its thresholds are readable, but a generic green check does not establish GitHub Code Quality coverage for this candidate and baseline.",
    doNext: "Inspect GitHub's coverage evaluation. Keep the coverage rule enabled; this receipt remains NOT_PROVEN until exact evidence is available.", reproof: "MANUAL",
  },
  EXECUTION_EVENT_DENIED: {
    plain: "The recorded workflow event is excluded by an applicable execution-protection policy.",
    why: "A successful run cannot substitute for current authority to run that workflow and event.",
    doNext: "Use an event allowed by the existing execution policy and recollect its evidence.", reproof: "AUTOMATIC",
  },
  EXECUTION_ACTOR_POLICY_UNPROVEN: {
    plain: "The workflow actor could not be bound to the applicable execution policy.",
    why: "Team, role and App membership is not inferred from a successful run.",
    doNext: "Inspect the actor policy in GitHub. Unobservable membership remains NOT_PROVEN; no permission changes are made.", reproof: "MANUAL",
  },
  INITIATING_HUMAN_UNAVAILABLE: {
    plain: "The initiating human for this bot-authored change could not be established.",
    why: "Approval independence cannot be proved by counting an unknown initiator as an independent human.",
    doNext: "Retain the bot attribution and inspect the activity evidence. This authorization claim remains unproven.", reproof: "MANUAL",
  },
  RULES_UNAVAILABLE: {
    plain: "We could not read what this repository requires before a merge.",
    why: "Merge Proof proves the requirements your repository already sets. Without them it has no requirements to check against, and it will not call that a pass.",
    doNext:
      "Confirm Merge Proof is installed on this repository with Administration: read, then proof runs again.",
    reproof: "MANUAL",
  },
  LIVE_PR_NOT_OPEN: {
    plain: "This pull request is not open, so there is no live merge state to prove.",
    why: "A receipt is bound to the exact state being merged. A closed or merged pull request no longer has one.",
    doNext: "Use an open pull request, or the bounded historical scan for merges that already landed.",
    reproof: "MANUAL",
  },
  APPLICABLE_MERGE_STATE_UNAVAILABLE: {
    plain: "We could not confirm the combined state of your branch and the base.",
    why: "Checks prove something only about a specific commit. Without knowing which combined commit applies, no check result can be tied to what would actually merge.",
    doNext:
      "Wait for GitHub to finish computing the merge, resolve any merge conflict, then proof runs again.",
    reproof: "AUTOMATIC",
  },
  CURRENT_STATE_EXECUTION_NOT_PROVEN: {
    plain: "The required checks did not demonstrably run against this exact version.",
    why: "A green tick can be inherited from an older commit or asserted without a recorded run. That is the gap Merge Proof exists to close.",
    doNext: "Run the required validation against the current version, then proof runs again.",
    reproof: "AUTOMATIC",
  },
  CHECK_EVIDENCE_UNAVAILABLE: {
    plain: "We could not read the check or status results for this pull request.",
    why: "Missing evidence is never treated as a pass.",
    doNext: "Confirm the App still has Checks, Commit statuses and Actions read access, then run proof again.",
    reproof: "MANUAL",
  },
  NO_REQUIRED_VALIDATION_CONFIGURED: {
    plain: "This branch does not require any validation, so there was nothing to prove.",
    why: "Merge Proof reports what your repository's own rules require. With no required check configured there is no requirement to establish, and an empty requirement is not a pass.",
    doNext:
      "Make at least one existing check required on this branch. Merge Proof then proves it actually ran against the code being merged.",
    reproof: "AUTOMATIC",
  },
  INSUFFICIENT_CURRENT_HUMAN_APPROVAL: {
    plain: "This exact version does not carry the approvals your repository requires.",
    why: "An approval applies to the version it was given on. Later commits are not covered by it.",
    doNext: "Get the current version approved by an eligible reviewer other than the author.",
    reproof: "AUTOMATIC",
  },
  REVIEWS_UNAVAILABLE: {
    plain: "We could not read the reviews on this pull request.",
    why: "Missing evidence is never treated as a pass.",
    doNext: "Confirm the App still has Pull requests read access, then run proof again.",
    reproof: "MANUAL",
  },
  LAST_PUSH_ACTOR_APPROVAL_UNAVAILABLE: {
    plain:
      "Your repository requires approval from someone other than the last person to push, which Merge Proof cannot establish.",
    why: "GitHub does not expose the evidence needed to confirm that rule, and Merge Proof will not assume it was met.",
    doNext:
      "This requirement stays outside what Merge Proof can prove. GitHub still enforces it independently of this receipt.",
    reproof: "MANUAL",
  },
  CODE_OWNER_APPROVAL_UNAVAILABLE: {
    plain: "Your repository requires code-owner approval, which Merge Proof cannot establish.",
    why: "Merge Proof does not evaluate CODEOWNERS, and it will not assume the requirement was met.",
    doNext:
      "This requirement stays outside what Merge Proof can prove. GitHub still enforces it independently of this receipt.",
    reproof: "MANUAL",
  },
  CHANGES_REQUESTED_OBSERVED: {
    plain: "A reviewer's latest decision on this pull request asks for changes.",
    why: "An outstanding changes-requested review is a standing objection to merging this work.",
    doNext: "Resolve the review and have the reviewer update their decision.",
    reproof: "AUTOMATIC",
  },
  REMOTE_CANDIDATE_NOT_CONFIRMED: {
    plain: "We could not confirm that the branch still points at the commit we proved.",
    why: "If the branch has moved or been deleted, the receipt would describe code that is no longer there.",
    doNext: "Confirm the source branch still exists and points at this commit.",
    reproof: "AUTOMATIC",
  },
  EVIDENCE_CHANGED_DURING_COLLECTION: {
    plain: "Something changed while we were collecting evidence.",
    why: "A receipt must describe one consistent moment. Evidence gathered across a change is not one moment.",
    doNext: "Nothing. Merge Proof collects again once activity settles.",
    reproof: "AUTOMATIC",
  },
  TARGET_BINDING_MISMATCH: {
    plain: "The state that was validated does not match this pull request's commit and base.",
    why: "Results from a different combination cannot speak for this one.",
    doNext: "Update the pull request with the current base and let validation run again.",
    reproof: "AUTOMATIC",
  },
  CURRENT_MERGE_GROUP_SELECTION_UNAVAILABLE: {
    plain: "GitHub did not confirm this merge-queue group as the current entry for this pull request.",
    why: "Without that confirmation, results on the queue branch cannot be tied to this pull request.",
    doNext: "Wait for the merge queue to report the current group, then proof runs again.",
    reproof: "AUTOMATIC",
  },
  UNSUPPORTED_REPOSITORY_REQUIREMENTS: {
    plain: "This branch sets requirements Merge Proof cannot establish.",
    why: "Merge Proof states exactly what it cannot cover rather than quietly leaving it out of the result.",
    doNext:
      "Read the listed requirements in the evidence below. GitHub continues to enforce them itself; Merge Proof simply does not claim them.",
    reproof: "MANUAL",
  },
  HISTORICAL_RULES_AND_APPROVAL_VALIDITY_UNAVAILABLE: {
    plain: "We cannot reconstruct what the rules and approvals were at the time this merge happened.",
    why: "Applying today's rules to a past merge would describe a requirement that may not have existed then.",
    doNext: "Nothing. This is a permanent limit of looking backwards.",
    reproof: "MANUAL",
  },
  BASE_DRIFT_UNVERIFIED: {
    plain: "The base branch changed the same files this pull request changes.",
    why: "Git can merge that cleanly even though the combined result was never built or tested. Your validation ran against the older base.",
    doNext: "Merge or rebase the current base into this branch, let validation run again, then proof runs again.",
    reproof: "AUTOMATIC",
  },
  PROTECTED_BOUNDARY: {
    plain: "This change touches an area that is expensive to undo after a merge.",
    why: "Migrations, schema, auth, secrets, billing and access policy are designated high-impact areas. This is a location, not a finding about the code: it is not a bug, a vulnerability or a quality judgement.",
    doNext:
      "Confirm the boundary change is intended and validated. Whether it blocks the merge depends on the policy set for this repository.",
    reproof: "AUTOMATIC",
  },
  GIT_HISTORY_UNAVAILABLE: {
    plain: "We could not read enough Git history to analyse this change.",
    why: "Missing evidence is never treated as a pass.",
    doNext: "Confirm Contents read access, or run the offline verifier with full history.",
    reproof: "MANUAL",
  },
  PROTECTED_BOUNDARY_APPROVAL_REQUIRED: {
    plain:
      "This change touches a protected boundary and your policy asks for extra human approval on those changes.",
    why: "You chose the stricter preset, which requires at least two current eligible approvals when a high-impact area is touched.",
    doNext: "Complete the required number of eligible approvals on the current version.",
    reproof: "AUTOMATIC",
  },
  REQUIRED_CONDITION_FAILED: {
    plain: "A required condition is demonstrably unsatisfied.",
    why: "Current evidence records an unmet requirement for this candidate.",
    doNext: "Resolve the recorded failure and collect fresh evidence.",
    reproof: "AUTOMATIC",
  },
  PROOF_COULD_NOT_COMPLETE: {
    plain: "Merge Proof could not complete its analysis.",
    why: "A required merge gate must not pass when the check itself did not run properly.",
    doNext: "Check repository access, then run proof again.",
    reproof: "MANUAL",
  },
  RECEIPT_STALE: {
    plain: "The pull request changed after this receipt was produced.",
    why: "A receipt describes one exact state. Once that state moves, the receipt is history rather than a current answer.",
    doNext: "Nothing. Merge Proof re-proves the new state automatically and publishes a new result.",
    reproof: "AUTOMATIC",
  },
  CURRENTNESS_UNAVAILABLE: {
    plain: "We could not confirm that this receipt still describes the current state.",
    why: "A saved result is never presented as a live one.",
    doNext: "Refresh the receipt, or wait for the next repository event.",
    reproof: "AUTOMATIC",
  },
};

const describeGap = (code) => GAPS[code]?.plain || code;

// Some gaps have a materially better explanation when the receipt is
// available: an approval that exists but sits on an older commit is a very
// different message from no approval at all.
function specialize(code, receipt) {
  const base = GAPS[code];
  if (!base || !receipt) return base || { plain: code, why: null, doNext: null, reproof: "MANUAL" };
  const approval = receipt.summary?.approval;
  const ci = receipt.summary?.ci;
  if (
    code === "INSUFFICIENT_CURRENT_HUMAN_APPROVAL" &&
    approval?.observed?.length &&
    !approval?.current?.length &&
    approval.observed.every((x) => x.sha && x.sha !== receipt.identity?.headSha)
  )
    return {
      ...base,
      plain: "The approval on this pull request belongs to an older version of it.",
      why: "New commits were added after it was approved. An approval covers the version it was given on, not later ones.",
      doNext: "Ask the reviewer to approve the current version.",
    };
  if (code === "CURRENT_STATE_EXECUTION_NOT_PROVEN" && Array.isArray(ci?.required)) {
    const states = new Set(ci.required.map((r) => r.state));
    if (states.has("OTHER_SHA_OR_STATUS_ONLY") && ci.required.some((x) => x.state === "OTHER_SHA_OR_STATUS_ONLY" && receipt.evidence?.checks?.value?.some(check => check.name === x.name && (x.appId === null || check.appId === x.appId) && check.sha && check.sha !== ci.target?.value?.sha)))
      return {
        ...base,
        plain: "The required validation result was recorded against another version.",
        why: "The green tick you can see came from a different commit than the one that would merge.",
        doNext: "Run the required validation against the current version.",
      };
    if (states.has("FAILED"))
      return {
        ...base,
        plain: "A required check did not pass on this version.",
        why: "Merge Proof reports the conclusion GitHub recorded. It does not judge the code itself.",
        doNext: "Fix what the failing check reported and let it run again.",
      };
    if (states.has("PENDING"))
      return { ...base, plain: "A required check has not finished on this version yet.", doNext: "Wait for it to finish." };
    if (states.has("NAME_COLLIDES_WITH_MERGE_PROOF_CHECK"))
      return {
        ...base,
        plain:
          "A required check on this branch uses Merge Proof's own check name but is bound to a different app.",
        why: "Merge Proof does not read check results published under its own name, so it cannot establish that requirement for you.",
        doNext:
          "Rename that required check, or bind the rule to the app that actually publishes it.",
        reproof: "AUTOMATIC",
      };
    if (states.has("MISSING"))
      return {
        ...base,
        plain: "A required check has not reported on this version at all.",
        why: "Required validation that never ran cannot establish anything about this commit.",
        doNext: "Trigger the required validation on the current version.",
      };
    if (states.has("SUCCESS_ASSERTED_EXECUTION_UNAVAILABLE"))
      return {
        ...base,
        plain: "A required check reports success, but no record of it actually running on this version was available.",
        why: "A reported conclusion and a recorded run are different pieces of evidence. Merge Proof needs the run.",
        doNext: "Confirm Actions read access, or re-run the validation on this version.",
      };
  }
  return base;
}

// The full NOT_PROVEN layer for a receipt, ordered so that whatever is
// blocking the merge is read first.
function explain(receipt, policyResult = null) {
  const blocking = new Set(policyResult?.blocking || []);
  const codes = [
    ...new Set([...(receipt.gaps || []), ...(policyResult?.blocking || [])]),
  ];
  return codes
    .map((code) => {
      const g = specialize(code, receipt);
      return {
        code,
        plain: g.plain,
        why: g.why || null,
        doNext: g.doNext || null,
        reproof: g.reproof || "MANUAL",
        blocksMerge: policyResult ? blocking.has(code) : null,
      };
    })
    .sort(
      (a, b) => Number(b.blocksMerge === true) - Number(a.blocksMerge === true),
    );
}

function next(gaps) {
  if (gaps.includes("RULES_UNAVAILABLE"))
    return "Connect repository access that can read the applicable rules, then re-run proof.";
  if (gaps.includes("GIT_HISTORY_UNAVAILABLE"))
    return "Obtain complete supported Git metadata, or run the offline verifier with full history.";
  if (gaps.includes("LIVE_PR_NOT_OPEN"))
    return "Select an open PR for live proof, or use the bounded historical scan.";
  if (gaps.includes("BASE_DRIFT_UNVERIFIED"))
    return "Update the candidate with the current base, run validation again, and re-run proof.";
  if (gaps.includes("CURRENT_STATE_EXECUTION_NOT_PROVEN"))
    return "Run the required validation against the applicable current state, then re-run proof.";
  return gaps.length
    ? "Resolve the listed evidence gaps and run proof again against the current state."
    : "Evidence established for the recorded state and policy. Recheck before merging.";
}

module.exports = { describeGap, next, explain, specialize, GAPS };
