# 04 — GitLab and Atlassian/Bitbucket: merge-evidence integrity, AI agents, and the cross-platform question

Prepared 2026-09-19 for Merge-Proof. Scope: (a) has GitLab or Atlassian already solved "merge evidence integrity" natively; (b) do their AI-agent features create the same trust gap Merge-Proof targets on GitHub; (c) is cross-platform support a moat or a distraction.

**Sourcing caveat.** `docs.gitlab.com`, `about.gitlab.com`, `support.atlassian.com`, `developer.atlassian.com`, `confluence.atlassian.com`, `community.atlassian.com` and `atlassian.com` were blocked by the research proxy. GitLab findings were verified against the GitLab documentation source tree (the `gitlabhq/gitlabhq` mirror of `doc/`, which is the same Markdown that renders on docs.gitlab.com, current as of master in September 2026). Atlassian findings rely on search-result excerpts of the official pages plus the Forge manifest reference; items I could not open directly are marked **[excerpt only]**. Treat Atlassian version/date claims as medium confidence.

---

## 1. Executive summary

1. **Neither platform has natively solved "merge evidence integrity" as a single, inspectable verdict.** Both have the *inputs* (SHA-scoped CI, approval-reset-on-push, audit events, bypass logging) scattered across settings, reports and APIs, but nothing that answers, for one merge candidate, "was CI actually run on this exact SHA, do the approvals still apply, was anything bypassed, and is that still true right now?" GitLab is much closer than Bitbucket, and GitLab's own docs admit at least one hole (automatic rebase without re-running the pipeline).
2. **GitLab's external status checks are the strongest signal that Merge-Proof's product shape is correct.** GitLab already ships an Ultimate-tier, SHA-bound, fail-closed external gate with a 409 on stale SHAs and a two-minute pending timeout. That is exactly Merge-Proof's slot in the merge pipeline, productized as a *hook for third parties*, not as a first-party verdict. GitHub's Checks API is the equivalent extension point on GitHub.
3. **Both vendors' AI agents create the same trust gap, and both are actively widening it.** GitLab's MCP server now exposes `accept_merge_request` (merge) and `save_merge_request_review` with `approve`/`unapprove` methods to any agent. GitLab's own Security Review Flow is explicitly "advisory ... not authoritative." Atlassian's Rovo Dev reviews PRs against Jira acceptance criteria and has "Agent Accounts" as first-class identities. Nobody ships a second-model or deterministic verifier of agent claims.
4. **Cross-platform recommendation: GitLab = NEXT (not NOW), Bitbucket Cloud = LATER, Bitbucket Data Center = DO NOT BUILD.** GitLab has a clean external-gate API that makes an integration cheap and gives Merge-Proof a native "blocking" surface GitHub-side products have to fake with Checks. But the buyer overlap with AI-agent-heavy GitHub teams is small today; win on GitHub first.

---

## 2. GitLab

### 2.1 Merge candidate construction and pipeline freshness

| Capability | Status / tier | What it does | Relevance to Merge-Proof |
|---|---|---|---|
| Merge request pipelines (source-branch HEAD) | GA, Free | `head_pipeline` in the MR API is "the pipeline that runs on the HEAD commit of the merge request's source branch"; MR API exposes `sha`, `diff_refs.{head_sha, base_sha, start_sha}`, `merge_commit_sha`, `squash_commit_sha`, `merge_user`, `merged_at`. | Everything Merge-Proof needs to reconstruct the candidate exists in one REST object. Better than GitHub, where you must stitch PR + Checks + merge-queue objects. |
| Merged results pipelines | GA, Premium/Ultimate | Runs on "a temporary merged commit that combines code from both source and target branches"; the commit "doesn't persist in either branch." Known issue: "a failed branch pipeline is ignored when the Pipelines must succeed setting is activated" (issue 385841). Cannot run when there are conflicts. | GitLab tests a synthetic merge commit, like GitHub merge queue. The documented "failed branch pipeline is ignored" bug is a concrete evidence-integrity gap a Merge-Proof-style verifier would catch. |
| Merge trains | GA, Premium/Ultimate | Each train pipeline tests cumulative changes (A, A+B, A+B+C) against target. On failure the MR is dropped, downstream pipelines cancelled and restarted; a dropped MR's merged result is "out of date and the pipeline can't be retried" — you must re-add it. "Merge immediately" cancels the train and restarts all pipelines. Experimental `merge_trains_skip_train` (16.5+) lets an MR skip the train **unverified** against other train members. **Merge train enforcement**: 19.2 behind flag, GA 19.3 — API callers without `auto_merge=true` get 405. | Validation: GitLab explicitly models "stale" merged-results as non-retriable. Threat-ish: train enforcement closes the "merge immediately" hole natively. The skip-train flag is a documented bypass Merge-Proof would flag. |
| Automatic rebase (semi-linear / FF) | Introduced 18.0, GA 19.2 | Docs state: "Because the CI/CD pipeline does not run again after the automatic rebase, the merged result might differ from the last pipeline run." | **Strong validation.** GitLab ships a GA feature whose own docs concede the merged commit may not be the tested commit. This is precisely the "evidence was for a different SHA" case. |
| Pipelines must succeed | GA, Free | Blocks Merge / Set to auto-merge when the latest pipeline failed. Historical issue 225488: not enforced for merged-results pipelines, allowing "merge immediately" to skip protection. | Commodity pressure on the basic "CI green" check; validation that platform-native gates have had bypass bugs. |
| Auto-merge ("merge when checks pass") | Enhanced auto-merge GA 17.7; retention across rebase 19.3 (flag) | Waits on approvals, blocking MRs, conflicts, pipeline, threads, draft, **external status checks**, denied policies, Jira link, title regex, merge-after date. "If you add new commits ... GitLab cancels the request." | Commodity: the freshness-on-push rule for auto-merge exists natively. Note: the 19.3 "retain auto-merge across rebase" change combined with the automatic-rebase-no-pipeline note above is worth tracking as a new stale-evidence path. |

### 2.2 Approvals: do they apply to the current head?

| Capability | Status | What it does | Relevance |
|---|---|---|---|
| Remove all approvals when commits are added | GA, Premium+ (default on) | Uses `git patch-id` comparison so cosmetic rebases keep approvals but content changes reset them. Alternative: remove only Code Owner approvals for changed files. | Commodity: GitLab's default already answers "do approvals apply to this head" — but with a *patch-id* rather than SHA notion of sameness. Merge-Proof should be explicit about which semantics it asserts. A project can turn this off; that toggle state is itself evidence. |
| Prevent approval by author / by committer | GA, Premium+ | Author excluded by default; committer exclusion opt-in. Code Owners cannot approve if they committed to owned files. | Commodity for separation-of-duties; Merge-Proof value is in detecting when it was disabled or overridden per-MR. |
| Prevent editing approval rules in MRs | GA, Premium+ | Locks project rules from per-MR override. Instance/group settings cascade and lock. | Bypass surface: if off, per-MR rule edits can lower thresholds — an audit item Merge-Proof should look for. |
| Require user re-authentication to approve (password/SAML) | GA; `ff_require_saml_auth_to_approve` removed 18.3 | Top-level group only; "electronic signature" for CFR Part 11-style needs. | Irrelevant to core, but a strong signal GitLab sells approvals as compliance evidence. |
| Merge request approval policies (security policies) | GA, Ultimate; `bypass_settings` GA 18.3–18.6; `enforcement_type` GA 18.9 | Policy-level overrides for `prevent_approval_by_author`, `prevent_approval_by_commit_author`, `remove_approvals_with_new_commit`, `require_password_to_approve`, `block_branch_modification`, `prevent_pushing_and_force_pushing`. `fallback_behavior: fail closed` default. Bypass via branch patterns, tokens, service-account IDs, users, groups, roles; bypassers must supply a reason; "Bypass events are logged as audit events in a security policy project" but "do not include the bypass comment or dismissal reason." | Validation + opportunity: GitLab logs *that* a bypass happened but not *why*, and only in a separate security-policy project. Aggregating this into the merge verdict is unbuilt. |

### 2.3 Protected branches and bypass

- Protected branches: "Allowed to merge", "Allowed to push and merge", "Allow force push" toggle, code-owner approval required (Premium+), group-level protected branches (17.6, cannot be loosened at project level), unprotect restrictable via API. Audit event `protected_branch_allow_force_push_updated` exists since 14.3.
- Merge request approval policies can `block_branch_modification` and `prevent_pushing_and_force_pushing` regardless of scan findings.
- Bypass surfaces: policy `bypass_settings`, Maintainer/Owner unprotect, "merge immediately" (train skip), per-MR rule edits, disabling approval-reset. All are logged as *settings changes or policy audit events*, none is surfaced on the MR itself as "this merge bypassed X."

### 2.4 External status checks — the direct analogue of Merge-Proof

- Tier: **Ultimate**. GA (since 14.x; screenshots dated v14_0).
- Mechanics: GitLab POSTs an MR webhook payload on create/update/push/approve/unapprove/close/reopen/merge; the external service responds via `POST /projects/:id/merge_requests/:iid/status_check_responses` with **`sha` (required, "SHA at HEAD of the source branch")**, `external_status_check_id`, `status` ∈ {pending, passed, failed}. Responses referencing an outdated commit are rejected with **409 Conflict**. Checks "fail if they stay in the pending state for more than two minutes" (fail-closed). Manual retry endpoint exists. Project setting **"Status checks must succeed"** blocks merge; default is *not* blocking.
- Limitations: per-project only (not group-shareable), HMAC secret not viewable after creation, applies only to new MRs.
- Compliance controls include a "status checks required" control (see 2.5), so an org can prove externally-gated merges across a group.
- **Assessment:** This is an official, SHA-bound, fail-closed, third-party merge gate — exactly the slot Merge-Proof occupies. GitLab built the *hook* but not the *verdict*: there is no first-party check that validates CI/approval/bypass integrity; they expect ServiceNow-type tools to plug in. Two consequences: (1) GitLab support for Merge-Proof is architecturally trivial (one webhook receiver + one POST), (2) it is Ultimate-only, which narrows the addressable base to enterprise compliance buyers, precisely the segment likeliest to pay for merge evidence.

### 2.5 "What was true at merge time": compliance and audit surfaces

| Surface | Status | Content | Gap vs Merge-Proof |
|---|---|---|---|
| Audit event `merge_request_merged` | 17.5 | "A merge request is merged." Plus `merge_request_approval_operation` (15.3), `merge_request_invalid_approver_rules` (15.5), `*_by_project_bot` variants (16.1), `update_approval_rules` (15.2). Retained indefinitely; streamable. | Events are discrete; no event bundles SHA + pipeline + approvals + policy state at merge. Correlation is left to the customer's SIEM. |
| Chain of custody report | Ultimate | CSV per group: commit SHA, author, committer, date, project, **merge commit SHA, MR ID, merging user, merge date, pipeline ID, approvers**. Filterable by commit SHA. One-month trailing window, 1024 commits/project, 15 MB cap, emailed. | Closest native "merge-time evidence" artifact. But: (a) pipeline ID only — not whether that pipeline ran on the merged SHA or was stale; (b) no bypass/policy state; (c) 30-day window; (d) batch CSV, not a per-MR verdict. |
| Compliance violations report | Dynamic report GA 18.5 | Four controls: min approvals 1/2, author approval, committer approval; records event author/target/IP/details. | Narrow (separation of duties only). No CI-integrity violations. |
| Compliance status report + frameworks/requirements/controls | Requirements GA 18.3; status report GA 18.3; templates GA 19.1 | Controls include min approvals, prevent author/committer approval, code owner approval, default branch protected, force push disabled, linear history, **status checks required**, discussions resolved, approval-reset on push, approval-rule editing prevention, signed commits, MFA, SAST etc. Evaluated every 12 h and on framework/requirement change. **External controls** can push pass/fail from third-party systems. | Project-configuration adherence, not per-merge adherence. It says "the setting is on," not "this merge honoured it." External controls are a second integration hook (group-level posture) Merge-Proof could feed. |
| Compliance pipelines / pipeline execution policies | Ultimate | Enforce required CI jobs in project pipelines. | Commodity for "required job exists"; nothing about SHA freshness. |

### 2.6 GitLab Duo agents: identity, permissions, and the trust gap

| Capability | Status | Facts | Relevance |
|---|---|---|---|
| Duo Agent Platform | GA 18.8 (announced 2026-01-15); flag removed 18.9; Free tier via GitLab Credits 18.10 | Foundational agents (Planner, Data Analyst, Security Analyst, CI Expert, Permissions Assistant, Flow Creator) and flows (Developer, Code Review, Convert to CI, Fix pipeline, Software Development, Security Review). Custom agents/flows GA 19.2. Flows run in GitLab CI/CD on runners. Docs mention "tool-level approval policies to gate sensitive agent actions with human approval." | The agent surface that generates PRs/MRs at scale exists and is GA on all tiers. |
| Code Review Flow (`@GitLabDuo`) | Beta 18.7, GA 18.8, Free 18.10; model switched to Claude Sonnet 5 (Vertex) 2026-08-06 | Triggers: assign `@GitLabDuo` as reviewer, `/assign_reviewer`, mention, Agentic Chat, REST API, automatic reviews at project/group level. Delivers review comments. Docs do not state it approves. | An AI reviewer that *comments*, not a verifier. Not a Merge-Proof competitor; it is a generator of the review noise Merge-Proof must not be confused with. |
| Security Review Flow | Beta 19.1; Ultimate | Service account `duo-security-review-<group>`. "Never approves" MRs; sets "Request changes" for Critical/High, "Comment" otherwise; does not block merges. "Results are AI-generated and are advisory input, not an authoritative or complete security assessment." | Validation: GitLab itself draws the line between advisory AI output and authoritative gates, leaving the authoritative slot open. |
| Developer Flow | GA 18.8 | Creates draft MRs from issues, iterates on review feedback, resolves conflicts, via `duo-developer-<namespace>` service account. | Produces agent-authored MRs — the population Merge-Proof exists for. |
| Composite identity | 18.3 flag, GA 18.8, flag removed 19.3 | Token combines service account + triggering human; effective permission is the *more restrictive* of the two; MR "is attributed to the human user who triggered the flow." Explicit rationale: SOC 2 / SOX / ISO 27001 / FedRAMP separation of duties; the initiating user "should not approve their agent-authored MR." Does not apply to Agentic Chat in UI/IDE. | Validation: GitLab has thought about *who* an agent is; but attribution to the human means a naive "author ≠ approver" check can be fooled or, conversely, blocks the human unexpectedly. Merge-Proof needs to model composite identities when reading GitLab authorship. |
| External agents (Claude Code, OpenAI Codex, Amazon Q, Gemini) | 18.3; GA; triggers incl. MR created (19.4) | Run as `ai-<agent>-<group>` service accounts with Developer role and `ai_workflows` scope; can "run a CI/CD pipeline and respond ... with either a ready-to-merge change or an inline comment." | Third-party agents pushing to MRs inside GitLab — same provenance problem as GitHub Copilot/Claude agents. |
| GitLab MCP server | Experiment 18.3, Beta 18.6, Free 19.2, toolsets 19.5 | Tools include **`accept_merge_request`** (merges or schedules auto-merge; `sha` param is a "head SHA guard preventing merge if the merge request head has changed") and **`save_merge_request_review`** with methods `approve`, `unapprove`, `submit_review`, `post_duo_review`. Warning: "You're responsible for guarding against prompt injection when you use these tools." | **Threat to the ecosystem, opportunity for Merge-Proof.** Any MCP-connected agent can approve and merge with the human's OAuth token. The `sha` guard shows GitLab knows head-drift matters, but the guard only protects the merge call, not the *evidence* behind it. No second-model verification agent exists. |

### 2.7 Answer to Q3 for GitLab

- Does GitLab natively expose "evidence was for this exact SHA and is still fresh" **and** "bypass happened" in one place? **No.** SHA/pipeline is on the MR object; approval freshness is a project setting plus patch-id logic; bypasses are audit events in a *different* project (security policy project) or in group audit streams; merge-time snapshot is a 30-day emailed CSV (chain of custody). Nothing on the MR says "this merge relied on a stale pipeline" or "policy X was bypassed by Y".
- Official extension point: **Yes — external status checks** (Ultimate; SHA-bound; 409 on stale SHA; two-minute fail-closed; `Status checks must succeed`), plus compliance **external controls** for posture. GitHub's equivalent is the Checks API + required status checks; GitLab's version is arguably *more* fit for Merge-Proof because it is explicitly designed as an external approval gate with stale-SHA rejection, rather than a CI-result surface repurposed as a gate.

---

## 3. Atlassian: Bitbucket Cloud, Bitbucket Data Center, Rovo Dev

### 3.1 Merge checks (Bitbucket Cloud)

**[excerpt only]** for support.atlassian.com pages.

| Capability | Status | What it does | Relevance |
|---|---|---|---|
| Built-in merge checks | GA; enforcement requires **Premium** ("Prevent a merge with unresolved merge checks") | Minimum approvals; minimum successful builds; no failed builds; default-reviewer approvals; unresolved tasks; unresolved comments; **reset approvals when the source branch is modified** (API kind `reset_pullrequest_approvals_on_change`) with option "Keep approvals if there are no changes to the diff." On non-Premium plans these are *recommendations only*. | Commodity for the basic gates. Important nuance: for the majority of Bitbucket Cloud workspaces (Free/Standard) merge checks are advisory — approvals and builds do not actually block. That is a wider trust gap than GitHub's, but it is a *plan* gap, not an evidence gap. |
| Custom merge checks (Forge) | Beta announced 2023-10; GA ~April 2025; Premium required to make them "required", otherwise "recommended" | Forge module `bitbucket:mergeCheck`; triggers `on-code-pushed`, `on-reviewer-status-changed` (formerly reviewer-updated), `on-merge`. Payload includes `pullrequest.source.commit.hash` and `destination.commit.hash`. Required checks re-run on their trigger events and must pass before merge. Enforceable at workspace/project/repo level on Premium. | **Official extension point exists** and is SHA-aware via payload hashes. It is Forge-only (Atlassian's serverless sandbox), so a Merge-Proof port would be a separate Forge app with Atlassian's runtime, storage and review constraints — not a webhook receiver you host. `on-merge` gives a last-moment synchronous gate, which neither GitHub nor GitLab has in the same form. |
| Required builds / branch restrictions | GA; Premium for some | Branch permissions: write, merge via PR, delete, rewrite history; exemptions per user/group; admins can be exempted. Required builds are a merge-check flavour (min successful builds). | Same "who can bypass" surface as GitHub bypass lists. Evidence of *whether* an exemption was used is not surfaced on the PR. |
| Audit logs | Atlassian Guard (paid add-on) | "Enterprise-level audit logs are available ... when you subscribe to Atlassian Guard"; events rolled out incrementally and "do not currently provide a full history of repository changes." | Weak: there is no first-party, complete, per-merge audit trail on Bitbucket Cloud without Guard, and even with it coverage is partial. Strong opportunity if the Bitbucket market mattered; it mostly doesn't for the target buyer (see §5). |
| Merge queue / merge train | Not found in Cloud | Data Center has a "Merge Queue Checks" plugin guide; Cloud has no documented merge queue. | Fewer synthetic-candidate cases than GitHub/GitLab; the candidate is simply source HEAD → destination. |

### 3.2 Bitbucket Data Center

**[excerpt only]** confluence.atlassian.com. Default merge checks (9.x–10.4): all reviewers approve, minimum approvals, minimum successful builds, no "changes requested", no incomplete tasks; unapprove-on-change setting; Java plugin point for custom merge checks (`MergeRequestCheck`); Merge Queue Checks guide exists for DC. Audit log events documented per version. Rovo Dev for DC is still beta. DC is a self-hosted Java plugin ecosystem — for a tiny team this is DO NOT BUILD regardless of demand.

### 3.3 Rovo Dev and Atlassian agents

| Capability | Status | Facts | Relevance |
|---|---|---|---|
| Rovo Dev (coding agent + CLI) | GA (community announcement "Rovo Dev Now GA: AI Code Review & Automation for Bitbucket", 2025–2026); bundled in "Atlassian Software Collection" with Bitbucket Pipelines, Compass, DX | Works in Jira, Bitbucket, GitHub, IDE, CLI; can implement work items and open PRs. | Agent-generated PR volume on Bitbucket, same trust gap. |
| Rovo Dev code review | GA on Cloud Standard/Premium/Enterprise; DC beta | Reviews PRs "leveraging business and project context to validate code changes against acceptance criteria in Jira"; flags quality/security/performance; Atlassian reports 30.8 % PR-cycle-time reduction (ICSE 2026 paper). Marketed as complementing human review; no evidence it approves or merges. | AI reviewer that comments; not a verifier. The "validates against Jira acceptance criteria" claim is exactly the kind of assertion a Merge-Proof would refuse to trust without evidence. |
| Agent Accounts / Agents in Jira | Announced 2026-02-24 (Businesswire; excerpt only) | "Agents get their own scoped identity, following the same service-account pattern enterprises use for CI/CD"; Rovo actions (agents created/updated, tool invocations) captured in org audit log. | Parallel to GitLab composite identity and GitHub app identities; a governance story, not an evidence story. |
| AI governance | Atlassian Administration / Rovo Studio controls; audit logging | Admin gating of AI features and agent creation; permissions-respecting retrieval. | Irrelevant to merge evidence except as proof that enterprise buyers ask for agent auditability. |

### 3.4 Answer to Q3 for Atlassian

- Single place for "exact SHA + fresh" and "bypass happened": **No.** Bitbucket Cloud has reset-on-change and per-commit build statuses, but audit is Guard-gated and partial; nothing on the PR states that a merge used an exemption or that the last build was for a previous head. On non-Premium plans merge checks don't even block.
- Official extension point: **Yes — Forge custom merge checks** (`bitbucket:mergeCheck`) with `on-code-pushed` / `on-reviewer-status-changed` / `on-merge` triggers and commit hashes in the payload. Distinct from GitHub Checks in being (a) synchronous at merge time and (b) hosted in Atlassian's Forge sandbox rather than your own service.

---

## 4. Classification of findings

| # | Finding | Class | Why |
|---|---|---|---|
| 1 | GitLab external status checks: SHA-bound, 409 on stale SHA, 2-min fail-closed, "must succeed" toggle (Ultimate) | **Validation + opportunity** | The platform designed a slot for exactly this class of gate and left the verdict logic to third parties. |
| 2 | GitLab automatic rebase docs: "pipeline does not run again after the automatic rebase, the merged result might differ from the last pipeline run" (GA 19.2) | **Validation** | A GA first-party feature that ships a stale-evidence path in writing; a verifier that computes tested-SHA ≠ merged-SHA has a real target. |
| 3 | Merged-results known issue: failed branch pipeline ignored under "Pipelines must succeed" | **Validation** | Native gates have had integrity bugs; independent verification has value even where a gate exists. |
| 4 | Merge train enforcement GA 19.3; "merge immediately" restarts train; `merge_trains_skip_train` experimental bypass | **Commodity pressure (partial)** | GitLab is closing the "skip the queue" bypass natively; but the skip flag remains a documented, detectable bypass. |
| 5 | Approval reset via `git patch-id`; author/committer restrictions; re-auth to approve; rule-edit lock | **Commodity pressure** | The "do approvals still apply" check is native and on by default; Merge-Proof's residual value on GitLab is detecting when it was switched off or overridden. |
| 6 | Merge request approval policies with `bypass_settings`; bypass audited but "do not include the bypass comment," in a separate security-policy project | **Opportunity** | Bypass evidence exists but is fragmented and incomplete; aggregation into a per-merge verdict is unbuilt. |
| 7 | Chain of custody report (commit SHA, merge commit SHA, MR, merger, pipeline ID, approvers; 30-day CSV) | **Commodity pressure + validation** | Closest native "what was true at merge" artifact; proves demand; but it is batch, 30-day, and has no freshness or bypass semantics. |
| 8 | Compliance controls (status checks required, force push disabled, approval reset, etc.) evaluated every 12 h; external controls hook | **Commodity pressure (posture) / opportunity (feed)** | Posture ≠ per-merge evidence; but a Merge-Proof GitLab port could push results as an external control. |
| 9 | `merge_request_merged` audit event (17.5) and related events, indefinite retention, streaming | **Irrelevant-to-commodity** | Raw events, not correlated; the customer must build the verdict. |
| 10 | GitLab MCP server: `accept_merge_request` (with head-SHA guard) and `save_merge_request_review` `approve`/`unapprove`, Free tier, prompt-injection warning | **Threat (to customers) / opportunity (for Merge-Proof)** | Agents can approve and merge with a human's token; GitLab's own guard is a sha param, not an evidence check. |
| 11 | Duo Code Review Flow GA (Free tier), Security Review Flow "advisory, never approves" | **Validation** | Vendor separates advisory AI from authoritative gates and does not fill the authoritative slot. |
| 12 | Composite identity (GA 18.8): MR attributed to triggering human; effective permission = more restrictive | **Opportunity (with caution)** | Merge-Proof must model composite authorship to avoid both false PASS and false FAIL on GitLab; competitors will get this wrong. |
| 13 | External agents (Claude Code, Codex, Q, Gemini) as `ai-<agent>-<group>` service accounts, can push "ready-to-merge" changes | **Validation** | Same agent-generated-MR population as on GitHub. |
| 14 | Bitbucket built-in merge checks advisory unless Premium | **Irrelevant / market signal** | Most Bitbucket Cloud tenants cannot enforce even basic gates; the buyer who cares is on Premium, a small slice. |
| 15 | Forge custom merge checks (`on-code-pushed`, `on-reviewer-status-changed`, `on-merge`, commit hashes in payload), GA ~Apr 2025 | **Opportunity (structural), distraction (practical)** | Real extension point with a synchronous merge-time hook, but Forge-hosted, Premium-gated, and a second codebase. |
| 16 | Bitbucket Cloud audit logs require Atlassian Guard; coverage partial | **Opportunity (weak)** | Evidence gap is large, but demand from AI-agent-heavy teams on Bitbucket is small. |
| 17 | Rovo Dev code review GA; validates against Jira acceptance criteria; Agent Accounts | **Validation** | Another AI reviewer making claims without independent verification. |
| 18 | Bitbucket Data Center Java merge-check plugin point, merge-queue checks | **DO NOT BUILD / irrelevant** | Self-hosted Java plugin ecosystem; effort disproportionate for a tiny team. |

---

## 5. Assessment: NOW / NEXT / LATER / DO NOT BUILD

**Does the existence of GitLab's features mean GitHub will build a native verdict?** Partially. GitLab has had external status checks since 14.x and chain-of-custody reports for years and *still* has not shipped a first-party "merge evidence integrity" verdict; instead they keep shipping more agent capability (MCP merge/approve tools, external agents) and more compliance *posture* reporting. The pattern across both vendors is: add agents fast, add governance/identity (composite identity, Agent Accounts), add advisory AI review, leave the authoritative verification slot to third parties via an extension API. Expect GitHub to follow the same pattern (Checks API + rulesets + Copilot agents), which is neutral-to-good for Merge-Proof over a 12–24 month horizon, with the standing risk that any of the three folds "CI ran on merged SHA + approvals current + no bypass" into a ruleset checkbox.

**Do their AI agents create the same trust gap?** Yes, and more explicitly than GitHub. GitLab's MCP server hands agents `approve`/`unapprove`/`accept_merge_request` on the Free tier and tells users they are responsible for prompt-injection defence. Rovo Dev asserts that code "meets acceptance criteria." Neither vendor ships a second-model or deterministic verifier of those assertions; GitLab's Security Review Flow is labelled advisory by design.

**Cross-platform: moat or distraction?**

- **GitLab — NEXT.** Reasons: (1) the external status checks API is a near-perfect fit: one webhook receiver, one POST with `sha`, native 409 stale-SHA rejection, fail-closed timeout, a "must succeed" toggle, and a compliance control that proves the gate is on — Merge-Proof gets a *blocking* surface it cannot fully get on GitHub without a required check. (2) The MR API exposes head/base/merge SHAs, head pipeline, merge user, and merge commit in one object, so the verifier core ports with a thin adapter. (3) GitLab's documented stale-evidence paths (auto-rebase, merged-results bug, skip-train flag) give concrete, demonstrable wins. (4) GitLab's buyer for this is Ultimate/compliance — the segment that pays. Why not NOW: the AI-agent-heavy early adopters Merge-Proof is chasing are overwhelmingly on GitHub (Copilot agents, Claude Code, Codex on GitHub); GitLab's Duo agents are GA but the population of agent-heavy GitLab orgs is smaller; and external status checks are Ultimate-only, shrinking the free-tier funnel to zero. Effort estimate: small (adapter + webhook + composite-identity handling), but the go-to-market is a different motion (compliance buyer, self-managed installs, Dedicated). Build after GitHub product-market fit is evidenced, or opportunistically if an Ultimate design partner appears.

- **Bitbucket Cloud — LATER.** Forge custom merge checks are a real, SHA-aware, synchronous gate, but: Forge-only hosting (separate runtime/codebase, Atlassian review), Premium-only enforcement, Guard-only audit, no merge queue to reason about, and the smallest share of AI-agent-heavy teams of the three. Revisit only with paying demand.

- **Bitbucket Data Center — DO NOT BUILD.** Self-hosted Java plugin; Rovo Dev on DC is still beta; effort and support burden are disproportionate.

**Moat verdict.** Cross-platform support is not a moat by itself — each platform has an official gate API, so a competitor can follow. The moat is the *verdict semantics* (SHA identity across synthetic merge commits, patch-id vs SHA approval freshness, composite-identity authorship, bypass aggregation across scattered audit sources) applied consistently across platforms, and the fact that the platform vendors have shown no intent to own that slot. Being platform-neutral strengthens the "independent, not the platform grading its own homework" positioning, which matters most to the compliance buyer GitLab has already educated.

---

## 6. Sources

Where a docs.gitlab.com page is cited, content was verified from the identical Markdown in the `gitlabhq/gitlabhq` `doc/` tree (master, Sept 2026); the canonical URL is given.

### GitLab (verified from doc source)
- External status checks — https://docs.gitlab.com/user/project/merge_requests/status_checks/ — current (Sept 2026) — GA, Ultimate.
- External status checks API (`sha` required; retry endpoint) — https://docs.gitlab.com/api/status_checks/ — current — GA.
- Merge trains (candidate construction, failure, skip-train flag, enforcement 19.2→19.3) — https://docs.gitlab.com/ci/pipelines/merge_trains/ — current — GA (enforcement GA 19.3; skip-train experimental).
- Merged results pipelines (temporary merged commit; failed-branch-pipeline known issue) — https://docs.gitlab.com/ci/pipelines/merged_results_pipelines/ — current — GA Premium+.
- Auto-merge / merge when checks pass (checks list; cancel on new commits; 19.3 retention flag) — https://docs.gitlab.com/user/project/merge_requests/auto_merge/ — current — GA 17.7.
- Merge methods (automatic rebase: pipeline not re-run) — https://docs.gitlab.com/user/project/merge_requests/methods/ — current — auto-rebase GA 19.2.
- Merge request approval settings (patch-id reset, author/committer, re-auth) — https://docs.gitlab.com/user/project/merge_requests/approvals/settings/ — current — GA Premium+.
- Merge request approval rules — https://docs.gitlab.com/user/project/merge_requests/approvals/rules/ — current — GA.
- Merge request approval policies (approval_settings, bypass_settings, fallback_behavior) — https://docs.gitlab.com/user/application_security/policies/merge_request_approval_policies/ — current — GA Ultimate (bypass GA 18.3–18.6; enforcement_type GA 18.9).
- Security policies overview — https://docs.gitlab.com/user/application_security/policies/ — current — GA Ultimate.
- Protected branches — https://docs.gitlab.com/user/project/repository/branches/protected/ — current — GA (group-level 17.6).
- Merge requests API (sha, diff_refs, merge_commit_sha, head_pipeline, merge_user) — https://docs.gitlab.com/api/merge_requests/ — current — GA.
- Audit event types (`merge_request_merged` 17.5 etc.) — https://docs.gitlab.com/user/compliance/audit_event_types/ — current — GA.
- Audit events (indefinite retention, streaming) — https://docs.gitlab.com/user/compliance/audit_events/ — current — GA.
- Chain of custody report — https://docs.gitlab.com/user/compliance/compliance_center/compliance_chain_of_custody_report/ — current — GA Ultimate.
- Compliance violations report — https://docs.gitlab.com/user/compliance/compliance_center/compliance_violations_report/ — current — dynamic report GA 18.5.
- Compliance status report — https://docs.gitlab.com/user/compliance/compliance_center/compliance_status_report/ — current — GA 18.3.
- Compliance frameworks, requirements, controls, external controls — https://docs.gitlab.com/user/compliance/compliance_frameworks/ — current — requirements GA 18.3; templates GA 19.1.
- Compliance center — https://docs.gitlab.com/user/compliance/compliance_center/ — current — GA.
- Duo Agent Platform overview — https://docs.gitlab.com/user/duo_agent_platform/ — current — GA 18.8.
- Agents — https://docs.gitlab.com/user/duo_agent_platform/agents/ — current — GA 18.8.
- Flows — https://docs.gitlab.com/user/duo_agent_platform/flows/ — current — foundational GA 18.8; custom GA 19.2.
- Code Review Flow — https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/code_review/ — updated 2026-08-06 — GA 18.8.
- Security Review Flow — https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/security_review/ — current — Beta 19.1, Ultimate.
- Developer Flow — https://docs.gitlab.com/user/duo_agent_platform/flows/foundational_flows/developer/ — current — GA 18.8.
- Composite identity — https://docs.gitlab.com/user/duo_agent_platform/composite_identity/ — current — GA 18.8, flag removed 19.3.
- External agents — https://docs.gitlab.com/user/duo_agent_platform/agents/external/ — current — GA; MR-created trigger 19.4.
- MCP server — https://docs.gitlab.com/user/model_context_protocol/mcp_server/ — current — Beta; Free since 19.2; toolsets 19.5.
- MCP server tools (`accept_merge_request`, `save_merge_request_review` approve/unapprove) — https://docs.gitlab.com/user/model_context_protocol/mcp_server_tools/ — current — Beta.

### GitLab (search excerpts / secondary)
- GitLab Duo Agent Platform GA press release — https://about.gitlab.com/press/releases/2026-01-15-gitlab-announces-duo-agent-platform-general-availability/ — 2026-01-15 — GA.
- GitLab 19.2 release notes — https://docs.gitlab.com/releases/19/gitlab-19-2-released/ — 2026-07 — released.
- GitLab 19.4 release notes — https://docs.gitlab.com/releases/19/gitlab-19-4-released/ — 2026-09 — released. (MCP `accept_merge_request` / approve; governed agents — per AlternativeTo summary https://alternativeto.net/news/2026/9/gitlab-19-4-expands-mcp-tools-and-adds-governed-agents/ [excerpt only].)
- InfoQ on GitLab 19.2 agents — https://www.infoq.com/news/2026/07/gitlab-19-2-ai-agents/ — 2026-07 [excerpt only].
- Issue 225488 "Merge immediately possible in invalid scenarios with merge trains enabled" — https://gitlab.com/gitlab-org/gitlab/-/issues/225488 — historical.
- Epic 10177 "Custom external and internal status checks approval rule in merge request approval policies" — https://gitlab.com/groups/gitlab-org/-/epics/10177 — open/planning.
- Issue 585040 approval-policy bypass vs protected-branch push restrictions — https://gitlab.com/gitlab-org/gitlab/-/issues/585040 — open.
- Blog: integrate MR approvals with external systems (status checks tutorial) — https://about.gitlab.com/blog/tutorial-integrate-gitlab-merge-request-approvals-with-external-systems/ — 2024-10-08.

### Atlassian (search excerpts only; primary pages blocked by proxy)
- Set up and use custom merge checks — https://support.atlassian.com/bitbucket-cloud/docs/set-up-and-use-custom-merge-checks/ — current — GA (Premium to enforce).
- Forge `bitbucket:mergeCheck` manifest reference — https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/ — current — GA.
- Forge: required-scope changes and `on-reviewer-status-changed` trigger — https://community.atlassian.com/forums/Forge-for-Bitbucket-Cloud/Changes-to-required-scopes-for-mergeCheck-module-and-new-on/ba-p/2629273 — 2024.
- Custom merge checks GA announcement — https://bitbucket.org/blog/custom-merge-checks-are-now-generally-available — ~2025-04 — GA.
- Beta announcement — https://www.atlassian.com/blog/bitbucket/beta-custom-merge-checks-in-bitbucket-cloud — 2023-10 — historical.
- Suggest or require checks before a merge — https://support.atlassian.com/bitbucket-cloud/docs/suggest-or-require-checks-before-a-merge/ — current — GA (Premium to enforce).
- Configure a project's branch restrictions — https://support.atlassian.com/bitbucket-cloud/docs/configure-a-projects-branch-restrictions/ — current — GA.
- Branch restrictions via API (`reset_pullrequest_approvals_on_change`) — https://support.atlassian.com/bitbucket-cloud/kb/how-to-create-edit-branch-restrictions-in-bitbucket-cloud-repositories-via-api/ — current.
- Preserving pull request approvals (keep approvals if diff unchanged) — https://bitbucket.org/blog/preserving-pull-request-approvals — 2024/2025.
- Bitbucket Cloud audit log events (Atlassian Guard) — https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-audit-log-events/ — current — incremental rollout.
- Bitbucket Data Center: checks for merging pull requests (10.4) — https://confluence.atlassian.com/bitbucketserver/checks-for-merging-pull-requests-776640039.html — current — GA.
- Bitbucket DC Merge Queue Checks guide — https://developer.atlassian.com/server/bitbucket/how-tos/merge-queue-check-guide/ — current.
- Rovo Dev GA for Bitbucket Cloud (community article) — https://community.atlassian.com/forums/Pipelines-articles/Rovo-Dev-Now-GA-AI-Code-Review-amp-Automation-for-Bitbucket/ba-p/3125640 — 2025/2026 — GA.
- Enable code reviews (Rovo) — https://support.atlassian.com/rovo/docs/enable-code-reviews/ — current — GA Cloud.
- AI Code Review with Rovo Dev — https://www.atlassian.com/software/rovo-dev/code-review — current — GA.
- Atlassian blog: 30.8 % faster PRs with Rovo Dev code reviewer (ICSE 2026) — https://www.atlassian.com/blog/artificial-intelligence/developer-productivity-improved-with-rovo-dev/amp — 2026.
- DevOps.com: Atlassian makes AI coding agent GA — https://devops.com/atlassian-makes-ai-coding-agent-generally-available/ — 2025/2026.
- Atlassian "Agents in Jira" / Agent Accounts press release — https://businesswire.com/news/home/20260224033792/en/Atlassian-Introduces-Agents-in-Jira-to-Drive-Human-AI-Collaboration-at-Enterprise-Scale — 2026-02-24 — announced.
- dev.to: AI code review on Bitbucket Data Center, what's native (Rovo Dev DC beta) — https://dev.to/emilreiter/ai-code-review-on-bitbucket-data-center-whats-native-what-isnt-2b7j — 2026.
