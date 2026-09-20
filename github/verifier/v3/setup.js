"use strict";
// Required-merge-gate detection and guided setup.
//
// Merge Proof reads repository rules (Administration: read, already collected for
// every proof) and reports whether its own check is currently required. It
// never writes branch protection or a ruleset. Writing a ruleset requires
// Administration: write, which also grants renaming, transferring and deleting
// the repository, adding collaborators and deploy keys, and removing the very
// rule that gates the merge. An App that could switch off its own gate is not
// a gate, so this App does not request that permission.
const { NAME } = require("./check-name");
const { requirements } = require("./rules");

const UNSUPPORTED_TEXT = {
  required_signatures:
    "Required commit signatures cannot be established by Merge Proof.",
  required_linear_history:
    "Required linear history cannot be established by Merge Proof.",
  REVIEW_THREAD_RESOLUTION:
    "Required conversation resolution cannot be established by Merge Proof.",
  REVIEW_THREADS_OR_REQUIRED_TEAMS:
    "Required review threads or named reviewer teams cannot be established by Merge Proof.",
  ALLGREEN_OTHER_GROUP_ENTRIES_UNAVAILABLE:
    "A merge queue using the ALLGREEN grouping strategy requires evidence about other queue entries, which Merge Proof cannot establish.",
  MALFORMED_REQUIRED_CHECK:
    "A required status check was returned in a shape Merge Proof does not recognize.",
  MALFORMED_REQUIRED_CHECKS:
    "A required status check rule was returned in a shape Merge Proof does not recognize.",
  MALFORMED_APPROVAL_RULE:
    "A required review rule was returned in a shape Merge Proof does not recognize.",
};

const describeUnsupported = (code) =>
  UNSUPPORTED_TEXT[code] ||
  `The repository requirement "${code}" cannot be established by Merge Proof.`;

// Is this required-check rule entry our own receipt check?
function selfRule(rule, appId) {
  if (rule.name !== NAME) return null;
  const known = Number.isSafeInteger(appId) && appId > 0;
  if (rule.appId !== null && (!known || rule.appId !== appId)) return null;
  return {
    context: rule.name,
    ruleAppId: rule.appId,
    boundToThisApp: rule.appId === null ? false : known ? true : null,
  };
}

// `rules` is capture.rules; `appId` is this App's integer ID when configured.
function gate(rules, appId = null) {
  const req = requirements(rules);
  if (req.state !== "AVAILABLE")
    return {
      context: NAME,
      appId: Number.isSafeInteger(appId) ? appId : null,
      required: "UNAVAILABLE",
      boundToThisApp: null,
      independentRequiredChecks: 0,
      readiness: {
        state: "UNAVAILABLE",
        blockers: [
          {
            code: "RULES_UNAVAILABLE",
            plain:
              "The rules for this branch could not be read, so Merge Proof cannot tell you whether it is required.",
            doNext:
              "Confirm the App is installed on this repository and has Administration: read, then check again.",
          },
        ],
      },
      unsupported: [],
    };

  const self = req.checks.map((r) => selfRule(r, appId)).find(Boolean) || null;
  const independent = req.checks.filter((r) => !selfRule(r, appId));
  const blockers = [];
  if (!independent.length)
    blockers.push({
      code: "NO_REQUIRED_VALIDATION_CONFIGURED",
      plain:
        "This branch does not require any validation, so there is nothing for Merge Proof to prove.",
      doNext:
        "Make at least one of your existing checks required on this branch first. Merge Proof then proves whether that check actually ran against the exact code being merged.",
    });
  const unsupported = [...req.unsupported,
    ...(req.codeOwners ? ["CODE_OWNER_APPROVAL_UNAVAILABLE"] : []),
    ...(req.lastPush ? ["LAST_PUSH_ACTOR_APPROVAL_UNAVAILABLE"] : [])];
  for (const code of unsupported)
    blockers.push({
      code,
      plain: describeUnsupported(code),
      doNext:
        "Requiring Merge Proof would block merges on this branch. Keep the existing protection and use report-only mode until Merge Proof supports this requirement.",
    });

  return {
    context: NAME,
    appId: Number.isSafeInteger(appId) ? appId : null,
    required: Boolean(self),
    boundToThisApp: self ? self.boundToThisApp : null,
    independentRequiredChecks: independent.length,
    requiredChecks: independent.map((r) => ({ name: r.name, appId: r.appId })),
    approvalsRequired: req.approvals,
    readiness: {
      state: blockers.length ? "NOT_READY" : "READY",
      blockers,
    },
    unsupported,
  };
}

// One guided action, stated exactly, with no automation Merge Proof is not
// permitted to perform.
function instructions(repository, baseRef, status) {
  const branch = baseRef || "your default branch";
  return {
    whoCanDoThis:
      "A repository administrator. Merge Proof cannot make its own check required and does not ask for permission to change your repository settings.",
    prerequisite:
      "Merge Proof must have published at least one check on this repository in the last seven days before GitHub offers it in the required-checks list. Open a pull request and Merge Proof publishes one automatically.",
    steps: [
      `Open https://github.com/${repository}/settings/rules and either edit the ruleset that protects ${branch} or create a new branch ruleset targeting it.`,
      "Enable “Require status checks to pass”.",
      `Add the check named “${status.context}” and, when GitHub offers the source, select the Merge Proof App so only Merge Proof can satisfy it.`,
      "Save the ruleset, then set Merge Proof's own policy below to a blocking preset so it reports failure — not neutral — when the evidence is not established.",
    ],
    classicAlternative: `If this branch still uses classic branch protection, the same setting is at https://github.com/${repository}/settings/branches under “Require status checks to pass before merging”.`,
    whyBothSteps:
      "GitHub decides whether the check is required. Merge Proof decides what its check reports. A required check that reports neutral does not block a merge, so both settings must agree before the gate is real.",
    permissionsNote:
      "Merge Proof never edits branch protection or rulesets. Doing so needs Administration: write, which would also let this App delete the rule that gates it.",
  };
}

// Live, read-only gate status for one branch. Uses only Metadata/Administration
// read, the same two sources every proof already reads, so the setup screen and
// the receipt cannot disagree about what the repository requires.
async function observe(client, repo, baseRef, appId) {
  const { collectRules } = require("./collect");
  if (typeof baseRef !== "string" || !baseRef)
    return {
      branch: null,
      ...gate(
        {
          classic: { state: "UNAVAILABLE", reason: "DEFAULT_BRANCH_UNAVAILABLE" },
          active: { state: "UNAVAILABLE", reason: "DEFAULT_BRANCH_UNAVAILABLE" },
        },
        appId,
      ),
    };
  const branch = await client.observe(() =>
    client.get(`/repos/${repo}/branches/${encodeURIComponent(baseRef)}`),
  );
  const rules = await collectRules(
    client,
    repo,
    baseRef,
    branch.state === "AVAILABLE" ? branch.value.protected === true : null,
  );
  return { branch: baseRef, ...gate(rules, appId) };
}

module.exports = {
  gate,
  observe,
  instructions,
  selfRule,
  describeUnsupported,
  NAME,
};
