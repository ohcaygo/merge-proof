"use strict";
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
module.exports = { next };
