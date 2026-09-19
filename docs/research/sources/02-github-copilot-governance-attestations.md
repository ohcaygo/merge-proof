# GitHub Copilot agents, AI governance, attestations and audit surfaces vs. Merge-Proof

Research date: 2026-09-19. Window: roughly September 2025 to September 2026, with older items included only where they set the current baseline.

Method note: the network proxy in this session blocks `github.blog` and `docs.github.com` directly, so primary text was pulled from the public `github/docs` source repository (`raw.githubusercontent.com/github/docs/main/...`, which is the content behind docs.github.com) and from the `slsa-framework/source-tool` repository, supplemented by search-engine summaries of changelog posts. Where a claim rests only on a changelog summary and not on docs text I say so. Status labels use GitHub's own phases: GA, public preview, technical preview, announced.

Classification key for Merge-Proof (MP): **threat** (GitHub does what MP does, natively), **commodity pressure** (narrows the space or makes part of MP a checkbox feature), **validation** (confirms the problem MP solves is real and unsolved by GitHub), **opportunity** (creates a new input, customer need, or wedge for MP), **irrelevant**.

---

## 1. Copilot cloud agent (formerly "Copilot coding agent"), Agent HQ, third-party agents

### 1.1 Rename and current capabilities

GitHub renamed "Copilot coding agent" to "Copilot cloud agent" during spring 2026. The docs tree now lives at `copilot/concepts/agents/cloud-agent/` with redirects from every `coding-agent` path, and the 2026-04-13 changelog ("Fix merge conflicts in three clicks with Copilot cloud agent") already uses the new name while the 2026-03-19/20 changelogs still say "coding agent". Audit-log event names have not been renamed (`copilot.swe_agent_repo_enabled`, `copilot.swe_agent_firewall_allowlist_updated`, `copilot.swe_agent_mcp_config_updated`), which matters for anyone querying the audit log.

What it does today (docs, `about-cloud-agent.md`; status: GA for all paid Copilot plans, disabled by default for Business/Enterprise until an admin enables it):

- Research a repository, create an implementation plan, and make code changes on a branch, optionally iterating *before* a PR exists ("research, plan, iterate" is github.com-only, in preview for Teams/Slack).
- Fix bugs, implement features, improve tests, update docs, address tech debt, **resolve merge conflicts**.
- Respond to `@copilot` mentions on an existing PR, including "fix the failing Actions workflows" and "address review comments".
- Run as **Copilot automations** on a schedule or on events such as issue opened or PR created/updated (changelog 2026-06-02; docs `about-automations.md`).
- Be assigned security alerts from security campaigns.
- Runs in an ephemeral GitHub Actions-powered environment with a firewall, MCP servers (GitHub MCP and Playwright MCP on by default), custom agents, hooks and skills.
- Hard limits: one repo per task, one branch, exactly one PR per task, 59-minute session cap.

### 1.2 How its PRs and commits are identified

From `risks-and-mitigations.md` and `manage-and-track-agents.md` (GA):

- Commits "are authored by Copilot, with the developer who assigned the issue or requested the change to the pull request marked as the co-author."
- Commits "are signed, so they appear as 'Verified' on GitHub."
- Since 2026-03-20 (changelog "Trace any Copilot coding agent commit to its session logs", GA) every agent commit carries an **`Agent-Logs-Url`** trailer linking to the session log.
- The agent works on a `copilot/` branch unless it was invoked on an existing PR, in which case it has write access to that PR's branch only.
- A PR can be opened "under its own app identity" rather than on behalf of a person when the prompt came from a shared context (Slack/Teams channel). Those are "unattributed Copilot pull requests" (see 4.3).
- Automations: "Pull requests opened and code pushed by an automation are attributed to the user who created the automation."

The docs no longer mention the literal `copilot-swe-agent[bot]` login; a grep of the fetched docs returns nothing. Treat the login as an implementation detail that may change; the stable signals are the Copilot author, the human co-author trailer, the `Agent-Logs-Url` trailer, GitHub's signature, and the `copilot/` branch prefix.

### 1.3 Permissions, sandbox, workflow approval, approve/merge

Direct quotes from `risks-and-mitigations.md` (GA):

- "Only users with write access to the repository can trigger Copilot cloud agent to work."
- "Copilot cloud agent can only perform simple push operations. It cannot directly run `git push` or other Git commands."
- "The agent is also subject to any branch protections and required checks for the working repository."
- "Draft pull requests created by Copilot cloud agent must be reviewed and merged by a human. Copilot cloud agent cannot mark its pull requests as 'Ready for review' and **cannot approve or merge a pull request**."
- "By default, workflows are not triggered until Copilot cloud agent's code is reviewed and a user with write access to the repository clicks the **Approve and run workflows** button." Since 2026-03-13 ("Optionally skip approval for Copilot coding agent Actions workflows") a repository admin can disable **Require approval for workflow runs**; the docs warn this "may allow unreviewed code written by Copilot to gain write access to your repository or access your GitHub Actions secrets."
- "Prevents the user who asked Copilot cloud agent to create a pull request from approving it." The review how-to is blunt: "your approval of a Copilot pull request won't count toward the required number. Another reviewer must approve."
- Rulesets incompatible with the agent (for example commit-author restrictions) block it; the documented workaround is to **add Copilot as a bypass actor** on the ruleset. That is a bypass grant that MP should surface.

Sandbox: firewall-restricted internet, hidden-character filtering for prompt injection, CodeQL + secret scanning + advisory-database checks on generated code, and a "second opinion" from Copilot code review before the PR is finalised (`cloud-agent-validation-tools-intro.md`). Third-party agents got the same security validation, GA 2026-06-09.

### 1.4 Agent HQ, mission control, third-party agents, agent apps

- **Agent HQ** was announced at Universe on 2025-10-28 (github.blog "Introducing Agent HQ: Any agent, any way you work"): an "open ecosystem" where agents from Anthropic, OpenAI, Google, Cognition, xAI and others run inside GitHub under existing identity, branch-permission and audit controls, with a **mission control** view to assign, steer and track agent sessions across github.com, VS Code, mobile and CLI. Status: announced, then shipped incrementally as below.
- **Claude and Codex on GitHub**: public preview 2026-02-04 for Pro+/Enterprise, extended 2026-02-26 to Business/Pro; model selection 2026-04-14; still labelled public preview in docs (`about-third-party-coding-agents.md`). "Coding agents are subject to the same security protections, mitigations, and limitations as Copilot cloud agent." Enabling them installs a GitHub App: "Allow Claude coding agent will install `anthropic code agent`; Allow Codex coding agent will install `openai code agent`. Actions taken by these GitHub Apps will be visible in your audit log, but the GitHub Apps themselves will not be visible in your account's list of GitHub App installations."
- **Agent apps** (public preview, Marketplace category `agent-apps`): partner GitHub Apps configured to act as custom agents, authorised via OAuth, running on Copilot cloud agent infrastructure. Docs mention Devin/Cognition, Cursor, Jules only in the Universe framing; the docs list of supported third-party *coding* agents is Claude and Codex.
- **GitHub Agentic Workflows** (`gh-aw`): technical preview 2026-02-13, public preview 2026-06-11. Markdown-defined agent jobs compiled to hardened `.lock.yml` Actions workflows, read-only tokens by default, writes restricted to declared "safe outputs".
- **Enterprise AI Controls and agent control plane**: public preview 2025-10-28, GA 2026-02-26. **Enterprise managed permissions for agent operations** (2026-09-09, per changelog summary): admins centrally set which agent operations are blocked, require human approval, or proceed; covers shell commands, file reads/edits and network domains, not merge decisions.
- **Agent session streaming** to SIEM: public preview 2026-07-02, EMU enterprises only.
- **Copilot usage metrics API** now reports PRs created by the cloud agent, PRs merged, and median time-to-merge (docs `about-cloud-agent.md`).

### 1.5 Classification

| Development | Class | Justification |
|---|---|---|
| Cloud agent cannot approve or merge; requester's approval doesn't count | **validation** | GitHub itself treats agent-authored PRs as needing an independent human gate, which is precisely the gate MP proves was honoured for the exact SHA. |
| Workflow-run approval default, and the admin switch to skip it | **opportunity** | Whether "Approve and run workflows" was clicked, by whom, and for which head SHA is a first-class fact MP can surface; the skip switch creates a silent policy change MP should flag. |
| Copilot as ruleset bypass actor | **opportunity** | A documented, recommended bypass grant to a bot is exactly the "bypass/exception visibility" MP promises. |
| `Agent-Logs-Url` trailer, signed commits, human co-author | **opportunity** | Cheap, stable provenance signals MP can parse to classify actor identity (human vs agent vs automation) without heuristics. |
| Third-party agent apps hidden from the installations list | **opportunity** | Admins cannot see these apps in the normal UI; MP can list which app identity pushed or opened the PR. |
| Agent HQ / mission control | **irrelevant** to MP's core, mild **commodity pressure** on "who did what" dashboards | Mission control shows session state, not merge-readiness proof; but it will absorb generic "agent activity" views. |
| Enterprise managed permissions (2026-09-09) | **irrelevant** | Governs what the agent may execute inside its sandbox, not what evidence supports a merge. |
| Automations attributed to the automation creator | **opportunity** | An automation-created PR looks human-attributed; MP should distinguish "attributed via automation" from "authored by human". |

---

## 2. "Agent Merge" and related merge automation

**No GitHub feature named "Agent Merge", "agentic merge" or "Copilot auto-merge" exists as of 2026-09-19.** Searching GitHub docs, changelog titles and the community forum found nothing by that name. What does exist:

| Feature | Date | Status | What it does |
|---|---|---|---|
| Ask `@copilot` to resolve merge conflicts | 2026-03-26 | GA (all paid plans) | Copilot merges base into the PR branch, resolves conflicts, checks build/tests, pushes. Docs list "Resolve merge conflicts" as a core capability. |
| "Fix with Copilot" button for conflicts, powered by cloud agent | 2026-04-13 | GA | Three-click UI entry to the same capability. |
| Same on GitHub Mobile | 2026-07-08 | GA | Mobile entry point. |
| `@copilot` "fix failing Actions workflows" | 2025-2026 | GA | Copilot pushes fixes to the PR branch; it does not re-approve or merge. |
| Copilot cloud agent merging | n/a | does not exist | Docs: "cannot approve or merge a pull request". |
| GitHub auto-merge (non-AI) | long-standing | GA | Merges when requirements are met; unchanged. `enable_pr_auto_merge` remains available to apps and MCP. |
| Copilot code review approvals | 2026-09-01 | public preview | See section 3; this is the closest thing to an "AI closes the loop" feature and it stops at approval, not merge. |

Bot-created PRs and CI: "Bot-created pull requests can run workflows if approved" (2026-06-11, per changelog summary) lets PRs from `github-actions[bot]` run workflows after a user with write access approves them. GITHUB_TOKEN docs add: "If you need workflow runs from workflow-created pull requests to execute without requiring approval, use a GitHub App installation access token or a personal access token instead of GITHUB_TOKEN."

Classification:

| Development | Class | Justification |
|---|---|---|
| Copilot conflict resolution | **opportunity** | Every conflict fix pushes a *new head SHA* authored by Copilot; approvals and checks on the previous head are stale, which is MP's CURRENT/STALE story. |
| Absence of any Copilot merge capability | **validation** | GitHub has deliberately kept merge as a human act; MP's proof of *what the human merged against* remains the unowned layer. |
| Bot PRs can run workflows after approval | **opportunity** | Adds another "approved to run" decision that MP can bind to a SHA and actor. |

---

## 3. Copilot code review and Copilot approvals

Source: `copilot/concepts/agents/code-review.md`, `configure-code-review.md` (docs main, September 2026) and changelog 2026-09-01.

Capabilities (GA unless noted): reviews any language on github.com, CLI, mobile, VS Code, Visual Studio, Xcode, JetBrains, Azure DevOps (preview); "agentic capabilities" run on Actions runners for full-repo context and to hand fixes to the cloud agent (that hand-off is public preview); review effort levels **Lite** and **Balanced**; automatic reviews configurable per user, repository, organisation, or via an **enterprise-level branch ruleset** ("Automatically request Copilot code review" policy); custom instructions via `.github/copilot-instructions.md`, path-scoped `*.instructions.md`, `AGENTS.md`, and skills; MCP servers; code review for members without a Copilot licence (Business/Enterprise, off by default); "resolution reasons" (2026-08-27, per changelog title). Copilot cloud agent asks Copilot code review for a second opinion before finalising its PR.

**Copilot approvals** (public preview, 2026-09-01):

- "Every Copilot code review includes an approval assessment in the overview comment, indicating whether Copilot has determined the pull request ready to approve after reviewing it. By default, Copilot's reviews do not count toward required approvals for the pull request."
- "When Copilot approvals are enabled in repository, organization, and enterprise settings, Copilot can submit an approving review that satisfies your repository's required-approval rule the same way a teammate's approval would. If new commits are pushed after Copilot approves, the approval is dismissed, and you can re-request a review."
- Controls are three-tier and all default off: enterprise "Allow Copilot to approve pull requests" (Disabled everywhere is the default; or Let organizations decide; or Enable for selected organizations); organisation "Count Copilot approvals toward merge requirements" (Enabled everywhere / Let repositories decide / Enable for selected repositories / Disabled everywhere); repository "Allow Copilot to approve pull requests" plus "Allow Copilot approvals to count toward merge requirements" plus optional **file-path globs (up to 15)** so approvals count only when every changed file matches.
- Audit events exist for settings changes: `copilot.code_review_organization_settings_updated`, `copilot.code_review_repository_settings_updated`.
- Interaction with the unattributed-Copilot rule: "If you also require an approval from someone other than the last person to push, at least one approval must cover the last push and come from someone other than Copilot."

Classification:

| Development | Class | Justification |
|---|---|---|
| Copilot approvals counting toward required approvals | **opportunity** (primary) and mild **threat** | It creates a brand-new question customers will ask ("was the required approval a human or Copilot, and on which head?") that GitHub's merge box answers only implicitly; MP can show approval *provenance*. The threat is limited to any MP positioning that says "AI can't approve". |
| Approval dismissed on new push | **validation** | GitHub had to build exactly the freshness rule MP enforces, confirming the "approval on current head" invariant is the right one. |
| Path-glob scoping of Copilot approvals | **opportunity** | Whether a given PR's file set fell inside the glob is non-obvious from the PR page; MP can evaluate and display it. |
| Copilot code review itself (findings, suggestions) | **irrelevant** | MP is not an AI code reviewer; review content is orthogonal. |
| Automatic review requested via enterprise rulesets | **commodity pressure** | Rulesets are becoming the place where "AI participation" policy is expressed, so MP should read rulesets rather than replicate policy. |

---

## 4. AI governance in GitHub: policies, audit, provenance, rulesets

### 4.1 Policy surfaces

- **AI Controls tab** in enterprise settings is now "the permanent home for all AI-related policies" (GA 2026-02-26). Cloud agent and third-party MCP are disabled by default at enterprise level; org owners then pick which partner agents to allow. REST endpoints under `copilot/copilot-coding-agent-management` select organisations by custom properties.
- Org-level policies: enable cloud agent, opt repositories out, allow Claude/Codex coding agents, allow agent apps (separate single policy), allow automations, MCP settings, code review settings, approvals.
- Repository-level: validation tools on/off, "Require approval for workflow runs", automation level for issue triage (Full control / Cautious / Balanced / Full automation).

Docs are explicit that the issue-automation approvals are not a security boundary: "Approvals are a workflow convenience, not a security control. They don't enforce a server-side boundary."

### 4.2 Audit log

Enterprise (`agentic-audit-log-events.md`, enterprise owners):

- Filter `actor:Copilot` for agentic activity over 180 days.
- Fields: `action` (for example `pull_request.create`), `actor_is_agent` (always `true` for agentic events), `agent_session_id`, `user` ("The person who initiated the agentic event").
- Third-party agent actions appear under their app identity.
- Session streaming (public preview, EMU/data-residency only) delivers request/response records to SIEM.

Organisation (`audit-log-events-for-your-organization` generated data, `reviewing-the-audit-log-for-your-organization.md`):

- "Only owners can access an organization's audit log." Retention 180 days. **The REST/GraphQL audit-log API requires GitHub Enterprise Cloud** and the `read:audit_log` scope; there is no GitHub App fine-grained permission for it. Docs steer integrators to webhooks: "Webhooks might be a good alternative to the audit log or API polling."
- Relevant event names present in the org-level catalogue: `pull_request.merge`, `pull_request.indirect_merge`, `pull_request.ready_for_review`, `pull_request.converted_to_draft`, `pull_request.rebase`, `pull_request_review.submit`, `pull_request_review.dismiss`, `pull_request_review.delete`, `protected_branch.policy_override` ("A branch protection requirement was overridden by a repository administrator"), `protected_branch.rejected_ref_update`, `protected_branch.authorized_users_teams`, `protected_branch.branch_allowances`, `repository_ruleset.create/update/destroy`, `merge_queue.pull_request_dequeued`, `merge_queue.pull_request_queue_jump`, `merge_queue.queue_cleared`, `merge_queue.update_settings`, `workflows.approve_workflow_job`, `workflows.reject_workflow_job`, `workflows.bypass_protection_rules`, `workflows.actions_policy_violation`, `workflows.rerun_workflow_run`, `workflows.created_workflow_run`/`completed_workflow_run` (API/streaming only), `checks.delete_logs`, `integration_installation.*`, `copilot.swe_agent_*`, `copilot.code_review_*_settings_updated`.
- **Gap:** there is no dedicated event for "pull request merged with ruleset bypass". `protected_branch.policy_override` covers legacy branch protection overrides by admins; ruleset bypasses are only inferable. There is also no event for "required check was not run".

### 4.3 Rulesets and provenance features

- **Additional approval for unattributed Copilot pull requests** (public preview, on by default in rulesets, always on for legacy branch protection): "When Copilot opens a pull request that isn't attributed to a person, the ruleset requires one more approval than the number you configured."
- **Restrict who can dismiss reviews** in rulesets (GA 2026-07-07, per changelog summary): users, teams and GitHub Apps.
- **Required status checks with an expected source app**: "you can select an app as the expected source of status updates... If the status is set by any other person or integration, merging won't be allowed. If you select 'any source,' you can still manually verify the author of each status, listed in the merge box."
- **Require workflows to pass before merging** (ruleset-native "required workflows"), with Evaluate mode.
- **Require merge queue** with "Require all queue entries to pass required checks" and a status-check timeout after which un-reported checks "will be assumed to have failed".
- **Bypass actors** may be roles, teams or GitHub Apps; docs recommend adding Copilot as a bypass actor when rules block it.
- Commit provenance: GitHub signs cloud-agent commits and marks them Verified; adds human co-author and `Agent-Logs-Url`. There is no repo-level attestation of *who approved what*.

Classification:

| Development | Class | Justification |
|---|---|---|
| `actor_is_agent`, `agent_session_id`, `user` audit fields | **opportunity** | Gives MP a canonical, GitHub-asserted agent/human distinction; MP should read it when a customer has GHEC and otherwise fall back to commit trailers. |
| Audit log API GHEC-only, owner-only, no App permission | **validation** | A small App cannot rely on the audit log; MP's approach of reconstructing evidence from the PR, checks, rules and webhooks is the only path for non-enterprise tenants. |
| No "merged with bypass" event | **validation** | The single most important governance fact for a merge is not natively logged; MP computing "rules said X, actual merge satisfied Y" fills it. |
| Unattributed-Copilot extra approval | **opportunity** | MP can display whether the rule applied, how many approvals were required as a result, and whether they were on the final head. |
| Expected-source app for required checks | **commodity pressure** and **opportunity** | GitHub now binds a check name to an app identity, removing a class of spoofing MP would otherwise detect; but "any source" remains the default, so MP's check-author verification is still needed for most repos. |
| Restrict who can dismiss reviews | **opportunity** | Dismissals by apps are now policy-controlled; MP should show dismissed approvals and by whom. |
| Merge-queue status-check timeout "assumed failed" | **opportunity** | A queue merge can succeed when a check never reported; MP's "required vs actually executed" distinction is precisely this case. |
| Enterprise AI Controls / agent control plane | **irrelevant** | Enables and scopes agents; does not attest merges. |

---

## 5. Artifact attestations and source-level attestation

Facts (docs `artifact-attestations.md`, `use-artifact-attestations.md`, `increase-security-rating.md`, `immutable-releases.md`):

- Artifact attestations (GA since 2024) sign a SLSA v1 provenance predicate containing "A link to the workflow associated with the artifact; the repository, organization, environment, commit SHA, and triggering event for the artifact; other information from the OIDC token". By itself it "provides SLSA v1.0 Build Level 2"; with a reusable build workflow, Build Level 3. Public repos use the Sigstore Public Good instance with a transparency log; private repos use GitHub's Sigstore instance with no transparency log.
- Docs guidance on what to sign: "You should **not** sign... individual files like source code."
- **Immutable releases**: public preview 2025-08-26, GA 2025-10-28 (fpt, ghec, GHES >= 3.20). Locks tag and assets and "automatically generates a release attestation, which is a cryptographically verifiable record of a release containing the release tag, commit SHA, and release assets." Includes resurrection-attack protection.
- **Code-to-cloud traceability and SLSA Build Level 3** (changelog 2026-01-20, per summary): linked-artifacts view in the org Packages tab, virtual registry, deployment records.
- The 2026 attestation how-to still covers only binaries, container images, SBOMs and releases.

**There is no GitHub feature that attests source-level facts such as "this merge passed these checks and had these approvals".** No "verified merge", "source provenance", "protected-branch attestation" or "provenance of code review" product appears in docs or changelog titles through September 2026. GitHub signs web-UI and agent commits (including merge commits made via the web), but a signature proves origin, not that rules were satisfied.

Outside GitHub: SLSA v1.2 defines a **Source Track** (source levels 1-4 with Verification Summary Attestations). The reference implementation `slsa-framework/source-tool` is "Status: in development", a "proof-of-concept implementation of the SLSA Source Track using GitHub's existing functionality". Its design notes are the best available statement of the problem:

- It "leverages GitHub's existing controls and APIs to determine what restrictions are placed on the creation or update of branches" and writes VSAs into git notes from a reusable workflow.
- Caveats: "Our trust in GitHub APIs to return trustworthy information", "That the 'bypass' list in the rules is not so large as to be meaningless", and the usability problem that any change to rules resets the "controls since" clock because the Get Rules for Branch API does not expose history.
- Requirements mapping gap: "There is no technical enforcement to ensure that the bypass list is used only for safe expunging."

Classification:

| Development | Class | Justification |
|---|---|---|
| Build provenance / SLSA Build L3 | **irrelevant** to the merge decision, **opportunity** downstream | It attests the build's source SHA, so MP verdicts keyed by SHA could later be joined to build provenance for "this artifact was built from a VERIFIED merge". |
| Immutable releases + release attestation | **irrelevant** | Locks tags and assets after the fact; says nothing about how the commit reached the branch. |
| Absence of any GitHub source attestation | **validation** | The layer MP occupies is empty in GitHub's product line as of September 2026. |
| SLSA Source Track and `source-tool` PoC | **validation** and **opportunity** | An OpenSSF-backed spec now names MP's problem; the PoC's stated caveats (bypass lists, no rule history, trusting the API) are MP's feature list, and MP could emit Source Track-compatible VSAs. |

---

## 6. Audit log availability summary (for App design)

- Org audit log: web UI for owners; REST/GraphQL only on GHEC; PAT scope `read:audit_log`; no GitHub App permission; 180-day retention; Git events only via REST and excluding web/API-initiated pushes ("when you merge a pull request in the web browser... the Git event for that push is not included").
- Enterprise audit log: same events plus enterprise policy events, streaming to SIEM, `actor:Copilot` and `actor_is_agent`.
- Relevant events exist for merge, review submit/dismiss, protected-branch override, ruleset CRUD, merge-queue dequeue/jump/clear, workflow job approval and protection-rule bypass. No ruleset-bypass-merge event; no "required check skipped" event.
- Practical implication: MP cannot depend on the audit log for its core verdict and should treat it as an optional enrichment for GHEC customers, using webhooks (`pull_request`, `pull_request_review`, `check_run`, `check_suite`, `workflow_run`, `merge_group`, `repository_ruleset`, `branch_protection_rule`) as the primary feed. Classification: **validation** for MP's webhook-plus-API reconstruction design.

---

## 7. Actions security and supply chain

| Development | Date | Status | What it does | Class |
|---|---|---|---|---|
| tj-actions/changed-files compromise (CVE-2025-30066) and reviewdog (CVE-2025-30154) | 2025-03-14 | incident | Mutable tags redirected to secret-exfiltrating code across 23k+ repos. | **validation**: proves "which action code actually ran for this check" is a real question; MP can record action refs resolved at run time. |
| Actions policy: block specific actions, **require full-length SHA pinning** | 2025-08-15 | GA (fpt, ghec, GHES >= 3.19) | Enterprise/org/repo policy; `!` prefix blocks; reusable workflows may still be tagged. `sha_pinning_required` in the repo API. | **opportunity**: MP can show whether the workflows that produced the required checks were policy-compliant at the run SHA. |
| Immutable releases | GA 2025-10-28 | GA | Tag and asset locking with release attestation; basis for immutable action versions. | **irrelevant** to merge proof. |
| Immutable actions (package-backed action versions) | not confirmed in this research | unverified | Referenced by community posts; I could not confirm GA status from primary sources within the session's fetch limits. | **irrelevant** pending confirmation. |
| GITHUB_TOKEN default read-only | 2023-02 | GA (old) | Not new; docs now add that workflow-created PRs need an App token to run workflows without approval. | **irrelevant**. |
| Ruleset "Require workflows to pass before merging" (required workflows) | GA | GA | Org-level ruleset can require a specific workflow file to pass; Evaluate mode. | **opportunity**: MP can verify the required workflow run actually executed at the head SHA rather than being skipped or reported from a stale ref. |
| `workflows.actions_policy_violation`, `workflows.bypass_protection_rules`, `workflows.approve_workflow_job` audit events | GA | GA | Enterprise/org audit only. | **opportunity** for GHEC enrichment. |
| Agentic Workflows: read-only tokens, safe outputs, threat detection | public preview 2026-06-11 | preview | Agents in Actions can only write via declared safe outputs. | **irrelevant** to MP verdicts; mild **validation** that GitHub separates "agent proposes" from "human merges". |

---

## 8. Checks API, merge box and app UI surface

Constraints (docs `status-checks.md`, `using-the-rest-api-to-interact-with-checks.md`, community issues):

- Only GitHub Apps can create check runs ("Write permission for the REST API to interact with checks is only available to GitHub Apps"); app needs `checks:write`.
- `output.text` is limited to 65,535 bytes (measured in bytes, so multi-byte characters count more); `output.summary` has a similar cap; at most 50 annotations per create/update request (batch further updates to add more). Markdown and images render in summary/text.
- Requested actions: up to three `actions` buttons on a check run ("Fix this" style) that fire `check_run.requested_action` to the app; buttons appear after completion. Re-run from the UI sends `check_run.rerequested`.
- Check runs incomplete for 14 days become `stale`; checks data retained 400 days then archived; to merge with archived required checks you must re-run them.
- `neutral` and `skipped` conclusions "treated as a success for dependent checks in GitHub Actions" and, importantly for MP, a *skipped* required job can satisfy a required check.
- Apps have no UI extension points beyond: check runs (Checks tab, merge box row, annotations in Files changed), commit statuses, issue/PR comments, reviews, and the "expected source" app label in the merge box. Nothing in the 2026 PR redesigns adds an app-injectable panel.

Merge box and PR UI timeline:

- Improved merge experience GA 2025-03-04: checks grouped by status, failing first, keyboard accessible.
- New "Files changed" on by default 2026-01-22; CODEOWNERS validation 2026-02-05; docked panels (overview, comments, **merge status**, alerts) side-by-side 2026-03-19.
- **Quick access to merge status anywhere in the PR** public preview 2026-03-05: merge readiness (blockers, missing approvals) at the top of every PR page, later GA per community thread.
- New pull requests dashboard GA 2026-07-09; refreshed repository PR list public preview 2026-09-10.

Classification:

| Development | Class | Justification |
|---|---|---|
| Merge-status panel everywhere | **commodity pressure** | GitHub's own "am I ready to merge" summary is now prominent, so MP must lead with what the merge box does not say (stale approvals, skipped-but-green checks, bypasses, agent identity) rather than restating readiness. |
| Check-run limits (64 KB, 50 annotations, 3 buttons) | **irrelevant** | Ample for a verdict card; MP should keep the summary short and link out for detail. |
| Requested-action buttons | **opportunity** | "Re-prove", "Explain NOT_PROVEN" and "Refresh evidence" buttons give MP an interactive surface without leaving GitHub. |
| Skipped/neutral counted as success; stale after 14 days | **validation** | GitHub's own semantics allow a required check to be "green" without running, which is the core NOT_PROVEN case. |
| No app UI beyond checks/comments | **validation** of MP's check-run-first design | The check run *is* the product surface; nothing new changes that. |

---

## 9. Overall assessment

**Does GitHub replace Merge-Proof?** No. Every 2025-2026 feature that touches merging either (a) adds an actor that can push or approve (cloud agent, Claude/Codex, agent apps, Copilot approvals, automations), or (b) adds a policy knob (rulesets, AI Controls, managed permissions, workflow-run approval skip), or (c) attests the *build* or the *release*. None of them attests the *merge*: which required checks actually executed against which SHA, which approvals were on the final head, whether a bypass actor was used, and whether the merging identity was a human, an agent, or an automation attributed to a human. GitHub's own docs keep repeating the invariants MP enforces (approval dismissed on push; requester cannot approve; unattributed agent PRs need an extra approval; assumed-failed on queue timeout) but exposes them only as live merge-box state, not as a durable proof keyed to a SHA.

**Commoditisation pressure** is concentrated in two places: the merge-status panel (a better native "readiness" summary) and the expected-source app for required checks (removes one spoofing case). MP should not compete on readiness; it should compete on *proof after the fact* and on *exception visibility*.

**Validation** is strongest from the SLSA Source Track work, whose reference implementation explicitly names bypass lists, missing rule history, and blind trust in GitHub's API as open problems, and from the audit-log design (GHEC-only, owner-only, no ruleset-bypass-merge event).

**Opportunities** created in the last twelve months, in priority order for MP:

1. **Agent-identity classification** using `Agent-Logs-Url`, human co-author trailers, GitHub signatures, `copilot/` branches, hidden third-party agent apps, and (for GHEC) `actor_is_agent` and `agent_session_id`; distinguish authored-by-agent, attributed-via-automation, and unattributed.
2. **Approval provenance**: human vs Copilot approval, whether Copilot approvals were policy-enabled and path-scoped for the PR's file set, whether the extra unattributed-agent approval applied, and whether any approval was dismissed by an app.
3. **Workflow-run approval facts**: who clicked "Approve and run workflows", for which head, and whether the repo has disabled the requirement.
4. **Bypass and exception visibility**: Copilot or other apps as ruleset bypass actors; merge-queue timeouts treated as failures; skipped required jobs; archived checks.
5. **Source Track alignment**: emit a VSA-shaped statement for VERIFIED merges so MP verdicts can be consumed by SLSA-aware pipelines and joined to build provenance.

**Watch list** (could turn into threats): a native "merge attestation" or Source Track support from GitHub (no signal yet); Copilot approvals moving from preview to default-on; mission control growing a per-PR governance view; the audit log gaining a GitHub App permission or org-level API on non-GHEC plans.

---

## Sources

Primary text was read from the `github/docs` repository (main branch, fetched 2026-09-19); the docs.github.com URL is given for each. Changelog posts are cited by URL and date; where only a search summary was available it is marked (summary).

| Source | URL | Date | Status |
|---|---|---|---|
| About GitHub Copilot cloud agent | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent | docs main, Sept 2026 | GA |
| Risks and mitigations for Copilot cloud agent | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations | docs main, Sept 2026 | GA |
| Review output from Copilot | https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/review-copilot-output | docs main | GA |
| Configuring agent settings (workflow approval, validation tools) | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/configuring-agent-settings | docs main | GA |
| Managing and tracking agent sessions (trailer, signed commits) | https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents | docs main | GA |
| Trace any Copilot coding agent commit to its session logs | https://github.blog/changelog/2026-03-20-trace-any-copilot-coding-agent-commit-to-its-session-logs/ | 2026-03-20 | GA (summary) |
| Optionally skip approval for Copilot coding agent Actions workflows | https://github.blog/changelog/2026-03-13-optionally-skip-approval-for-copilot-coding-agent-actions-workflows/ | 2026-03-13 | GA (summary) |
| More visibility into Copilot coding agent sessions | https://github.blog/changelog/2026-03-19-more-visibility-into-copilot-coding-agent-sessions/ | 2026-03-19 | GA (summary) |
| Ask @copilot to resolve merge conflicts | https://github.blog/changelog/2026-03-26-ask-copilot-to-resolve-merge-conflicts-on-pull-requests/ | 2026-03-26 | GA (summary) |
| Fix merge conflicts in three clicks with Copilot cloud agent | https://github.blog/changelog/2026-04-13-fix-merge-conflicts-in-three-clicks-with-copilot-cloud-agent/ | 2026-04-13 | GA (summary) |
| GitHub Mobile: fix merge conflicts with Copilot cloud agent | https://github.blog/changelog/2026-07-08-github-mobile-fix-merge-conflicts-with-copilot-cloud-agent/ | 2026-07-08 | GA (summary) |
| Schedule and automate tasks with Copilot cloud agent | https://github.blog/changelog/2026-06-02-schedule-and-automate-tasks-with-copilot-cloud-agent/ | 2026-06-02 | GA/preview (summary) |
| About Copilot automations; rationale, confidence, approvals | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automation-rationale-and-approvals | docs main | public preview |
| Agent automation controls in GitHub Issues | https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/ | 2026-07-23 | public preview (summary) |
| About third-party coding agents | https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents | docs main | public preview |
| About agent apps | https://docs.github.com/en/copilot/concepts/agents/agent-apps | docs main | public preview |
| Anthropic Claude coding agent | https://docs.github.com/en/copilot/concepts/agents/anthropic-claude | docs main | public preview |
| Claude and Codex available in public preview on GitHub | https://github.blog/changelog/2026-02-04-claude-and-codex-are-now-available-in-public-preview-on-github/ | 2026-02-04 | public preview (summary) |
| Claude and Codex for Business and Pro | https://github.blog/changelog/2026-02-26-claude-and-codex-now-available-for-copilot-business-pro-users/ | 2026-02-26 | public preview (summary) |
| Model selection for Claude and Codex agents | https://github.blog/changelog/2026-04-14-model-selection-for-claude-and-codex-agents-on-github-com/ | 2026-04-14 | public preview (summary) |
| Security validation for third-party coding agents | https://github.blog/changelog/2026-06-09-security-validation-for-third-party-coding-agents/ | 2026-06-09 | GA (summary) |
| Introducing Agent HQ | https://github.blog/news-insights/company-news/welcome-home-agents/ | 2025-10-28 | announced (summary) |
| Pick your agent: Claude and Codex on Agent HQ | https://github.blog/news-insights/company-news/pick-your-agent-use-claude-and-codex-on-agent-hq/ | 2026-02 | public preview (summary) |
| About agent management (Agents tab, mission control) | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management | docs main | GA |
| Enterprise AI controls and agent control plane public preview | https://github.blog/changelog/2025-10-28-enterprise-ai-controls-the-agent-control-plane-are-in-public-preview/ | 2025-10-28 | public preview (summary) |
| Enterprise AI Controls and agent control plane GA | https://github.blog/changelog/2026-02-26-enterprise-ai-controls-agent-control-plane-now-generally-available/ | 2026-02-26 | GA (summary) |
| Enterprise managed permissions for Copilot agent operations | https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/ | 2026-09-09 | GA/preview unclear (summary) |
| Enable Copilot cloud agent for enterprise | https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-cloud-agent | docs main | GA |
| Copilot agent session streaming public preview | https://github.blog/changelog/2026-07-02-copilot-agent-session-streaming-is-now-in-public-preview/ | 2026-07-02 | public preview (summary) |
| Audit log events for agents | https://docs.github.com/en/copilot/reference/enterprise-administrators/agentic-audit-log-events | docs main | GA |
| Reviewing audit logs for GitHub Copilot | https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/review-audit-logs | docs main | GA |
| Audit log events for your organization (generated catalogue) | https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization | docs main | GA |
| Reviewing the audit log for your organization (API access rules) | https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization | docs main | GA |
| GitHub Agentic Workflows technical preview | https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/ | 2026-02-13 | technical preview (summary) |
| GitHub Agentic Workflows public preview | https://github.blog/changelog/2026-06-11-github-agentic-workflows-is-now-in-public-preview/ | 2026-06-11 | public preview (summary) |
| About GitHub Agentic Workflows | https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows | docs main | public preview |
| About GitHub Copilot code review | https://docs.github.com/en/copilot/concepts/agents/code-review | docs main | GA; approvals public preview |
| Configure Copilot code review (approval settings, path globs) | https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review | docs main | approvals public preview |
| Copilot code review can now approve pull requests | https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests/ | 2026-09-01 | public preview (summary) |
| Copilot code review: resolution reasons and expanded capabilities | https://github.blog/changelog/2026-08-27-copilot-code-review-resolution-reasons-and-expanded-capabilities/ | 2026-08-27 | GA (title only) |
| Available rules for rulesets (unattributed Copilot approval, expected source, merge queue, required workflows) | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets | docs main | GA; Copilot extra approval public preview |
| Restrict who can dismiss reviews (rulesets) | GitHub changelog 2026-07-07 | 2026-07-07 | GA (summary) |
| Bot-created pull requests can run workflows if approved | https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/ | 2026-06-11 | GA (summary) |
| GITHUB_TOKEN concept | https://docs.github.com/en/actions/concepts/security/github_token | docs main | GA |
| Artifact attestations concept | https://docs.github.com/en/actions/concepts/security/artifact-attestations | docs main | GA |
| Using artifact attestations (verify, SBOM, release attestations) | https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations | docs main | GA |
| SLSA v1 Build Level 3 with reusable workflows | https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating | docs main | GA |
| Immutable releases concept | https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases | docs main | GA |
| Releases support immutability (public preview) | https://github.blog/changelog/2025-08-26-releases-now-support-immutability-in-public-preview/ | 2025-08-26 | public preview (summary) |
| Immutable releases GA | https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/ | 2025-10-28 | GA (summary) |
| Code-to-cloud traceability and SLSA Build Level 3 | https://github.blog/changelog/2026-01-20-strengthen-your-supply-chain-with-code-to-cloud-traceability-and-slsa-build-level-3-security/ | 2026-01-20 | GA (summary) |
| SLSA source-tool README, DESIGN.md, REQUIREMENTS_MAPPING.md | https://github.com/slsa-framework/source-tool | 2025-2026 | in development (PoC) |
| GitHub Actions policy: blocking and SHA pinning | https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/ | 2025-08-15 | GA (summary) |
| Enforcing policies for GitHub Actions in your enterprise | https://docs.github.com/en/admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-github-actions-in-your-enterprise | docs main | GA |
| tj-actions/changed-files advisory CVE-2025-30066 | https://github.com/advisories/ghsa-mrrh-fwg8-r2c3 | 2025-03 | incident |
| CISA alert on tj-actions and reviewdog | https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction | 2025-03-18 | incident |
| Status checks reference (types, conclusions, retention) | https://docs.github.com/en/pull-requests/reference/status-checks | docs main | GA |
| Using the REST API to interact with checks (requested actions) | https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks | docs main | GA |
| Checks API 65535 limit (community/docs issues) | https://github.com/github/docs/issues/3765 ; https://github.com/github/safe-settings/issues/493 | 2020-2025 | GA behaviour |
| Checks API 50-annotation limit (reviewdog issue) | https://github.com/reviewdog/reviewdog/issues/1207 | 2022-2025 | GA behaviour |
| Improved pull request merge experience GA | https://github.blog/changelog/2025-03-04-improved-pull-request-merge-experience-is-now-generally-available/ | 2025-03-04 | GA (summary) |
| Improved Files changed on by default | https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/ | 2026-01-22 | GA (summary) |
| Files changed February 5 updates | https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/ | 2026-02-05 | GA (summary) |
| Quick access to merge status in pull requests | https://github.blog/changelog/2026-03-05-quick-access-to-merge-status-in-pull-requests-in-public-preview/ | 2026-03-05 | public preview (summary) |
| Docked panels in Files changed | https://github.blog/changelog/2026-03-19-view-code-and-comments-side-by-side-in-pull-request-files-changed-page/ | 2026-03-19 | GA (summary) |
| New pull requests dashboard GA | https://github.blog/changelog/2026-07-09-new-pull-requests-dashboard-is-now-generally-available/ | 2026-07-09 | GA (summary) |
| Refreshed repository pull requests page | https://github.blog/changelog/2026-09-10-refreshed-repository-pull-requests-page-in-public-preview/ | 2026-09-10 | public preview (summary) |
| Copilot usage metrics for cloud agent PR outcomes | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent#measuring-pull-request-outcomes-for-copilot-cloud-agent | docs main | GA |
