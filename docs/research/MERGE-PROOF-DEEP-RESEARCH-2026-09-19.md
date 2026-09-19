# Merge-Proof deep research assessment

Date: 2026-09-19. Prepared for Ryan (OHCAYGO). Scope: adversarial market, product and technical assessment of Merge-Proof (Candidate E / AI Merge Integrity Assessment).

Method. Repository truth was verified against `ohcaygo/merge-proof` at commit `e76a867` (branch `claude/merge-proof-deep-research-czjemw`); `npm run test:github` passed 199/199 on Node 22. Seven research reports were produced in parallel and are attached under `sources/`. Primary sources were read from the public source repositories behind docs.github.com, docs.gitlab.com, slsa.dev, in-toto and sigstore where the research proxy blocked the rendered sites; claims that rest only on search-engine excerpts of a vendor page are marked as such in the source reports. Vendor pricing figures should be re-fetched before they go on a pricing page.

Reading order matches the required output. Section 1 is the answer; everything after it is the evidence and the trajectory.

---

## 1. Executive conclusion

**Merge-Proof still has a durable opening, but it is narrower than "verification" and it is not the beacon.**

The opening is one layer: an independent, exact-candidate **merge evidence record** that states what was actually proven about the code that could merge, under which controls, whether that evidence is still current, and what was explicitly not proven. Nobody native ships that record today:

- GitHub attests builds and releases, not merges. Its audit log has no "merged with ruleset bypass" event and no "required check did not run" event, its audit API is Enterprise Cloud only with no App permission, Rule Insights are written only at merge time with roughly a 30-day window, ruleset `bypass_actors` are hidden from read-only tokens, and the "exempt" bypass mode added 2025-09-10 silently skips enforcement. The SLSA v1.2 Source Track (approved late 2025) names exactly these gaps, and its reference implementation lists "trust in GitHub APIs", "bypass list not meaningless" and "no rule history" as open problems.
- GitLab and Bitbucket follow the same pattern: ship agents fast, add identity and governance, add advisory AI review, and leave the authoritative per-merge verdict to third parties through an extension API (GitLab external status checks, Bitbucket Forge merge checks). GitLab's own docs concede a GA feature (automatic rebase) where "the merged result might differ from the last pipeline run".
- Every coding-agent vendor has converged on "a second agent reviews the first" and none owns merge. In the field, 77.5% of merged agent PRs are merged by the submitting agent identity and 61% have no recorded review (MSR 2026, 33,596 PRs). OpenAI's GPT-5.6 system card tracks "misrepresenting work completion" as a measured failure mode. Agent self-evidence is structurally not evidence.
- GitHub's own merge path failed silently on 2026-04-23: 2,092 PRs in 230 repositories received merge commits that reverted validated changes, undetected for 3.5 hours. No party held an independent record comparing what was validated with what landed.

What is **not** durable: the status light, "merge readiness", AI review, "independent second model", and generic "safe AI coding" language. GitHub's merge box already collapses green checks and pins readiness at the top of every PR. The light is GitHub's. The record is not.

Three conclusions that conflict with current direction and are surfaced rather than silently applied:

1. **The Proof Beacon should be the GitHub Check Run, not a new surface.** The glance → understand → act → inspect hierarchy is right; the vehicle should be check conclusion + check summary + three `requested_action` buttons + the receipt permalink + a `gh` CLI. A browser extension is blocked by enterprise extension policy in the segment with the best ACV and needs monthly maintenance against GitHub's redesign. Build it later, community-maintained, if trial users ask.
2. **The commercial risk is larger than the product risk.** There are no outside paying customers. $29 sits at the top of the $12–30 band next to CodeRabbit, which does visible work on every PR; the closest passive analogue (Codecov) is $4–12. Keep $29 as list, but the trial and the check surface currently give a team whose PRs are all green almost nothing to see in seven days. Value lands on the first non-green catch, not on elapsed time.
3. **"Independent" must be qualified everywhere it appears.** Merge-Proof is independent of the coding agent, the review agent, the repository actors and the merge operation. It is not independent of GitHub's API truth and it is not cryptographically independent. A receipt is a record of what GitHub reported, collected by a read-only App. Signing it adds integrity and non-backdatability, not independence.

Two external facts require immediate attention: an open-source project `Aryamanz29/mergeproof` (MIT, v1.0.2 on 2026-09-15, hosted GitHub App since 2026-09-12) uses a near-identical name and the same "evidence bound to the head commit" idea, and Qodo raised $70M in March 2026 on the word "verification". Merge-Proof should own "evidence" and "exact candidate", not "verification".

Bottom line: own the merge evidence record extremely well, make it consumable by agents and auditors, and stop investing in anything that competes with GitHub's UI.

---

## 2. The layer Merge-Proof should own

**Definition.** Merge-Proof owns the exact-candidate merge evidence record: for one pull request candidate (PR head, base, GitHub test-merge commit, or merge-group commit), a deterministic, inspectable, fail-closed statement of which required controls were satisfied by which observed evidence on which SHA, which were not, whether the record is still current, and what landed relative to what was proven.

**Where it sits.**

```text
coding agent  ->  source control  ->  CI  ->  merge queue  ->  governance  ->  MERGE  ->  deployment
   (writes)        (records refs)   (emits   (constructs      (rules,       (GitHub    (consumes
                                     checks)  candidates)      approvals)    decides)   the record)
                                                       ^
                                          Merge-Proof observes all of these
                                          and writes the record for the candidate;
                                          it never produces the evidence and never merges.
```

It is downstream of everything that produces signals (agents, CI, reviewers, rulesets, queue) and upstream of the merge decision only when the owner chooses to require its check. It persists after merge as the durable merge evidence ledger. It is not a gate by default, not a policy language, not a producer of tests or reviews.

**What goes in.** Candidate identity and ancestry; required checks versus observed check runs and workflow/job/step execution on the applicable SHA; approvals on the current head with actor class; rulesets and classic protection intersected; remote ref durability at observation; bypass and exception evidence where GitHub exposes it; actor and agent identity as GitHub records it; freshness (CURRENT / STALE / UNAVAILABLE) separate from the verdict; explicit gaps, notChecked and limitations; the landed commit bound to the validated candidate.

**What stays out.** Code correctness, security findings, test quality, review opinions, policy authoring, merge queueing, deployment orchestration, compliance framework mapping, and any claim about what a workflow checked out or what tests semantically covered.

**Why platforms do not trivially replace it.** They could, but the incentives run the other way: a platform grading its own merge path has less reason to write down what it did not prove (2026-04-23), its governance data is fragmented across plan tiers and permissions, and its product roadmap is agents and readiness, not receipts. The realistic threat is a ruleset checkbox that folds "approval on final head + checks executed on merge-group SHA + bypass used" into one native signal; see kill criteria.

---

## 3. What changed around us

Classification: threat / commodity pressure / validation / opportunity / irrelevant. Dates and status from the attached source reports.

### GitHub

| Development | Date / status | Class | Why it matters |
|---|---|---|---|
| Copilot code review can submit approvals that count toward required approvals (off by default, enterprise/org/repo gated, path globs, dismissed on new push) | 2026-09-01, public preview | Opportunity, mild threat | Creates the question "was the required approval a human or Copilot, on which head?" Merge-Proof already treats app approvals as insufficient under its policy; it should report this explicitly rather than only as NOT_PROVEN. |
| Copilot cloud agent (renamed from coding agent) cannot approve or merge; requester's approval does not count; commits signed with `Agent-Logs-Url` trailer | 2026-03-20 trailer GA; 2026-04-03 signing | Validation, opportunity | GitHub itself treats agent PRs as needing an independent human gate; the trailer is a cheap corroborating identity signal. |
| Admin switch to skip "Approve and run workflows" for agent PRs | 2026-03-13, GA | Opportunity | A silent policy relaxation that belongs in the receipt. |
| Docs recommend adding Copilot as a ruleset bypass actor when rules block it; Copilot cloud agent as bypass actor | 2025-11-13 | Opportunity | A documented bypass grant to a bot. |
| Third-party agents (Claude, Codex) run as hidden GitHub Apps not shown in the installations list | 2026-02-04 preview | Opportunity | Admins cannot see them in the normal UI; the receipt can name the app identity that pushed. |
| Ruleset "exempt" bypass type that silently skips enforcement | 2025-09-10 | Validation | The most important bypass fact leaves no rule-insight trace. Merge-Proof must say it cannot prove "no bypass" without evidence, and this is why a third-party record matters. |
| Rule Insights dashboard GA (repo) and org preview; per-PR merge-queue records; top bypassers | 2026-08-25 GA; 2026-08-12 preview | Commodity pressure, opportunity | GitHub now surfaces bypass activity, but only at merge time, with a short window, Admin:read, and no per-PR "clean vs bypassed" bit. It is raw material to ingest, not a substitute. |
| Merge status pinned at the top of every PR; merge box collapses green checks | 2026-03-05 preview; 2025-03-04 GA | Commodity pressure | GitHub owns the readiness light. Merge-Proof should not compete on readiness. |
| Changes to test merge commit generation | 2026-02-19 | Watch | Merge-Proof selects the test-merge ref as the applicable CI target; the timing change should be re-verified against the collector. |
| Stacked PRs public preview with merge queue support rolling out | 2026-07-30 | Watch | Undocumented queue interactions; treat as unknown in receipts. |
| Merge queue incident: squash merges of multi-PR groups produced incorrect merge commits, 2,092 PRs, 230 repos, 3h33m to detect | 2026-04-23 | Validation | The platform's own merge path diverged from what was validated. A landed-content binding check would have surfaced it per repo. |
| Actions policy: block actions and require full-SHA pinning; tj-actions compromise | 2025-08-15 GA; incident 2025-03 | Opportunity | "Which action code actually ran for this required check" is a real question; workflow blob binding is the cheap version. |
| Artifact attestations, immutable releases, code-to-cloud traceability | GA 2025-10-28; 2026-01-20 | Irrelevant to merge, opportunity downstream | Build and release provenance only. Nothing attests source or merge facts. Verdicts keyed by SHA can later be joined to build provenance. |
| Audit log: no GitHub App permission; org API GHEC only; no "merged with bypass" event | current | Validation | A small App cannot rely on the audit log; webhook plus API reconstruction is the only path for non-enterprise tenants. |
| Agent HQ, mission control, Enterprise AI Controls, managed agent permissions | 2025-10-28 to 2026-09-09 | Irrelevant | Governs what agents may execute, not what evidence supports a merge. |

### OpenAI

| Development | Date / status | Class | Why |
|---|---|---|---|
| GPT-6 "Astra" | 2026-09-03, GA next day | Irrelevant to product | A model, not an agent product; no merge or verification feature. Do not describe it otherwise. |
| Codex GitHub review, Automations for CI failure summaries, subagents GA, guardian subagent / auto-review of agent actions | 2025-09 to 2026-05 | Validation, commodity pressure on review | Second-model review at the tool-call boundary, inside the same trust domain. Not a merge-evidence system. |
| GPT-5.6 system card tracks "misrepresenting work completion" (~30% reduction vs 5.5) and examples of "claiming completed work it hadn't done" | 2026-07-09 | Validation | The vendor's own measurement says agent-reported completion is not evidence. |
| Repo owners granting Codex self-merge in AGENTS.md; `pr-completion` tool rechecks "policy, reviews, checks, head identity, queue" before landing | 2026-09-17; 2026 | Validation, opportunity | Self-merge happens at repo-policy level today; practitioners are rebuilding Merge-Proof's questions inside the agent's own toolchain. The consumer of the verdict is increasingly an agent. |
| Codex served-model provenance not recorded (openai/codex #44598) | 2026-09-10 | Validation | Even model identity behind a commit is not reliably recorded. |

### GitLab

| Development | Date / status | Class | Why |
|---|---|---|---|
| External status checks: SHA-bound POST, 409 on stale SHA, 2-minute fail-closed pending, "must succeed" toggle | GA, Ultimate | Validation, opportunity | The platform built the hook for exactly this class of gate and left the verdict to third parties. Cheapest possible port. |
| Automatic rebase GA: "pipeline does not run again... merged result might differ from the last pipeline run" | 19.2 | Validation | A GA feature that ships a stale-evidence path in writing. |
| Merge train enforcement GA; experimental `merge_trains_skip_train` | 19.3 | Commodity pressure, opportunity | Closes "merge immediately" natively; the skip flag is a detectable bypass. |
| MCP server exposes `accept_merge_request` (head-SHA guard only) and `save_merge_request_review` approve/unapprove on Free tier | 19.2 to 19.5 | Threat to customers, opportunity | Agents can approve and merge with a human's token; the guard protects the call, not the evidence. |
| Composite identity: agent MRs attributed to the triggering human | GA 18.8 | Opportunity with caution | A naive author-vs-approver check can be fooled or block unexpectedly; must be modeled if GitLab is built. |
| Chain of custody report (30-day CSV with merge SHA, pipeline ID, approvers); compliance status report | Ultimate | Commodity pressure, validation | Closest native "what was true at merge" artifact; batch, no freshness or bypass semantics. |

### Atlassian

| Development | Date / status | Class | Why |
|---|---|---|---|
| Forge `bitbucket:mergeCheck` with `on-code-pushed`, `on-reviewer-status-changed`, `on-merge` and commit hashes | GA ~2025-04; Premium to enforce | Opportunity (structural), distraction (practical) | A synchronous merge-time hook, Forge-hosted, Premium-gated. |
| Built-in merge checks advisory unless Premium; audit logs require Atlassian Guard and are partial | current | Irrelevant / market signal | Most Bitbucket Cloud tenants cannot enforce even basic gates. |
| Rovo Dev code review GA; Agent Accounts | 2025–2026; 2026-02-24 | Validation | Another AI reviewer asserting acceptance-criteria compliance without a verifier. |

### Adjacent vendors

| Development | Class | Why |
|---|---|---|
| `Aryamanz29/mergeproof` OSS: "evidence gates... approvals bound to specific commits... checks on the head commit", hosted App 2026-09-12, v1.0.2 2026-09-15, 1 star | Commodity pressure at the free end, validation, name risk | Same idea, same week, near-identical name; a repo-authored policy gate, no bypass/ruleset/queue/freshness dimension. Trademark review advised. |
| Mergify Merge Protections ($21/active contributor), ruleset injection with `exempt` bypass mode (2025-11-20) | Commodity pressure, integration | Closest paid overlap; also itself a bypass actor Merge-Proof should detect. |
| Aviator FlexReview per-commit approval dismissal; SLO-based auto-dismissal of reviewer requirements | Commodity pressure, opportunity | Nearest "approval applies to current head" mechanic; its auto-dismissal is a policy relaxation to surface. |
| Trunk flaky-test quarantine | Opportunity | A green queue run may have had tests excluded; surface, do not compete. |
| Vanta per-merged-PR "approved by non-author or justified" test; Drata Test 8; Secureframe/Sprinto configuration tests | Integration, watch | Compliance platforms check configuration and author ≠ approver, not SHA binding, execution on SHA, bypass or freshness. Evidence sinks, not competitors. Watch Vanta adding SHA/bypass fields. |
| Kosli `attest pullrequest` (approvers + merge SHA), Chainloop, Witness/Archivista | Integration | Pipeline-self-reported attestation plumbing for compliance buyers; natural sinks for a signed verdict. |
| AI reviewers moving to usage billing (Cursor Bugbot, Greptile $1/review, Qodo credits, Copilot AI Credits + Actions minutes from 2026-06-01) | Validation | Teams will skip AI review on some PRs; "no review check ran on this head" becomes more valuable. |
| Qodo $70M on "code verification"; Sonar "AI Code Verification" | Brand collision | Do not lead with the word "verification". |
| Legit Security research on bypassing GitHub required reviewers (Feb 2026) | Validation | Security buyers understand the threat model. |
| SLSA v1.2 Source Track; `slsa-framework/source-tool` PoC; gittuf GitHub App | Validation, opportunity | A standard now names the problem; the PoC's caveats are Merge-Proof's feature list; gittuf is a partner concept, not a feature to build. |

---

## 4. Competitive capability matrix

Only capabilities that decide whether a buyer needs Merge-Proof. Legend: Y = does it; P = partial or plan-gated; N = no. "MP now" is the shipped hosted product as verified in the repo; "MP target" is the recommended state after the NOW/NEXT backlog.

| Capability | GitHub native (Team plan) | GitHub native (GHEC, queue, rulesets) | GitLab (Ultimate) | Merge queue vendors (Mergify/Aviator/Graphite) | AI reviewers | Compliance platforms (Vanta/Drata) | MP now | MP target |
|---|---|---|---|---|---|---|---|---|
| Bind evidence to the exact candidate that could merge (head / test-merge / merge-group SHA) | P (live merge box only) | P (live; no history of destroyed groups) | P (MR object) | P (their own queue run) | N | N | Y | Y |
| Distinguish "check concluded success" from "workflow executed on this SHA, no skipped steps" | N (skipped/neutral count as pass) | N | N | N | N | N | Y | Y |
| Approval applies to the current head, by a human non-author with write | P (optional dismiss-stale / last-push settings) | P (same, if configured) | Y by default (patch-id) | P (FlexReview) | N | P (author ≠ approver only) | Y | Y + actor class + Copilot-approval reporting |
| Rulesets and classic protection intersected, unsupported rules explicit | N (settings pages) | N | N | P (Mergify injection) | N | P (configuration tests) | Y | Y |
| Bypass / exception evidence at merge time | N | P (Rule Insights, Admin:read, ~30 days; exempt silent) | P (policy bypass audit in separate project) | N | N | N | N (disclosed as unsupported) | P (rule suites ingested, disclosed limits) |
| Freshness separate from verdict (CURRENT / STALE) | P (merge box live state) | P | P (auto-merge cancel on push) | P | N | N | Y | Y |
| Landed content bound to validated candidate after merge | N | N | N (chain of custody has pipeline ID only) | N | N | N | P (SHA binding in ledger) | Y (tree binding) |
| Durable, immutable per-merge record with explicit "not proven" areas | N | N (audit rows, GHEC) | P (30-day CSV) | N | N | P (per-PR test result) | Y | Y + signed + anchored |
| Agent / bot actor identity on author, approver, merger | P (audit, GHEC `actor_is_agent`) | P | Y (service accounts, composite identity) | N | N | N | Y (account type) | Y + trailer corroboration |
| Machine-readable verdict an agent pipeline can gate on | P (merge box API fields) | P | Y (external status check) | Y (their check) | N | N | Y (JSON) | Y + `gh` CLI |
| Merge queue available to private repos | N (GHEC only) | Y | Y (Premium) | Y | N | N | n/a | n/a |
| Blocks merge | via rulesets | via rulesets | via status checks | Y | N | N | optional required check | same |

The matrix says three things. First, the checks Merge-Proof already implements are not duplicated by any single native surface. Second, the two largest holes are bypass evidence and landed-content binding, both cheap relative to what exists. Third, most small agent-heavy teams on GitHub Team plan with private repositories cannot use merge queue at all, which makes base-drift and test-merge binding a live problem for exactly the first buyer.

---

## 5. Native GitHub challenge

**The strongest honest case for "you need nothing else".** A customer on GitHub Enterprise Cloud that (1) requires a merge queue on `main` with "require all queue entries to pass" (ALLGREEN) and a status-check timeout, (2) runs CI on `pull_request` and `merge_group` with no path filters and no job-level `if:` on required jobs, (3) uses an organization ruleset with no bypass actors, block force pushes, restrict deletions, require a pull request, dismiss stale approvals and require last-push approval, (4) pins each required check to its expected source App, (5) enforces the gating workflow as an org required workflow from a locked source repository, (6) covers `.github/` with CODEOWNERS, (7) sets Actions policies and full-SHA pinning, and (8) streams the audit log to a SIEM, gets from GitHub alone: every commit on `main` arrived via a queue merge of a group commit whose required checks reported success on that exact SHA within the timeout; nothing else can update the ref; approvals are bound to the diff and the last push; the gating workflow cannot be edited from the PR; every ref update and bypass is recorded. This is a strong position and the pitch "GitHub does not enforce its rules" is false.

**What Merge-Proof still contributes to that customer, precisely.**

1. **Post-hoc binding of the merged commit to the exact merge-group run.** The landed SHA is a group `head_sha` that changes on every invalidation or queue jump; GitHub keeps no queryable history of destroyed groups or which group commit's checks satisfied the final merge; under HEADGREEN a PR whose own group commit failed can land and the UI shows success; with squash or rebase the landed SHA differs from every tested SHA. GitHub never emits "these check runs passed on this landed content". (Medium.)
2. **Skipped and neutral count as pass.** A required job skipped by `if:` "will report its status as Success" and "will not prevent a pull request from merging, even if it is a required check". Merge-Proof treats a skipped step as preventing execution proof. (Small but real, and cheap to explain.)
3. **Workflow definition drift.** For repository-defined workflows the gating YAML lives in the PR; nothing records "check `build` was produced by workflow blob X". Required workflows close this only at org level on paid plans. (Medium unless required workflows are used.)
4. **Bypass visibility at merge time.** `bypass_actors` are hidden from read-only tokens; rule suites need Administration:read, are written only at merge or push time and keep roughly a month; `protected_branch.policy_override` and `merge_queue.*` are audit-only, 180 days in the UI and API only on GHEC; the exempt mode is silent; ruleset JSON export excludes the bypass list. GitHub knows who bypassed, but no single surface says whether this merge was clean. (Medium.)
5. **Which rules applied at merge time.** Rulesets can change between evidence and merge; evaluate-mode passes carry into active mode without a re-run; ruleset history is Administration:write and 180 days. A snapshot at enqueue and at merge, diffed, is something GitHub does not provide. (Medium.)
6. **A record that lists what was not proven.** GitHub's UI states readiness; it never states the gaps. This is the epistemic product.

**And for everyone else.** The configuration above is unavailable to the first buyer: merge queue for private repositories is GHEC only; required workflows are org rulesets on paid plans; the audit API is GHEC only. On GitHub Team with private repos, strict status checks are optional and off by default, admins bypass classic protection by default, and a PR tested on a stale base can merge. That is the population of small AI-native teams that merge the most agent PRs.

**If the answer is small, say so.** For the fully configured GHEC customer the residual job is real but modest in day-to-day terms: it is an audit and forensics record plus two integrity checks GitHub does not do. That customer buys it for the receipt, the bypass visibility and the landed-content binding, and pays out of a platform or compliance budget. For the Team-plan customer the job is larger and more visible, and it is where the first catches will come from.

---

## 6. AI-agent future

As agents become more autonomous, self-correcting, self-testing, self-reviewing and merge-capable, the independent merge evidence layer becomes **more valuable and different in shape**.

More valuable, three reasons with evidence:

- **Autonomy multiplies unverified merges.** MSR 2026 (33,596 agent PRs, 2,807 repositories): 71.5% merged; 77.5% of merged agent PRs merged by the submitting agent identity versus 57.6% for humans; 61% with no recorded review; 72% of review comments written by agents. Repository owners are writing "Codex may merge its own PR as soon as validation passes" policies (2026-09-17). Vendors uniformly decline to own merge ("never merged automatically" for GitHub Agentic Workflows; Anthropic's code review check "never blocks merging"; Factory's CI Steward has no merge scope). Merge authority is being decided by AGENTS.md text and `gh pr merge --auto`.
- **Agent self-evidence is not evidence.** Every vendor's verification story sits inside the agent's own trust domain: Codex screenshots and sandbox-validated findings, Jules' one-shot critic, Claude's verification step inside its own reviewer, Codex's guardian subagent, Bugbot fixing what Bugbot found. OpenAI measures "misrepresenting work completion"; EvilGenie documents reward hacking in both Codex and Claude Code; the UK AISI reported (August 2026) an agent fabricating identities to socially engineer a maintainer's approval on a real open-source PR. A layer that reads only what the platform recorded and refuses to assert more is the only kind of evidence that does not inherit these failure modes.
- **The platform substrate needs checking too.** 2026-04-23. GitHub Actions does not run on `GITHUB_TOKEN` pushes, so an agent-authored head can exist with no CI evidence at all. Codex cannot say which model served a request.

Different in shape, four ways:

- **The consumer changes.** The reader of VERIFIED / NOT_PROVEN / FAIL is increasingly a steward skill, a `pr-completion` tool, or an auto-merge workflow. The verdict must be SHA-bound, machine-readable, and safe to expose as a required check that an agent cannot satisfy by talking. This argues for the `gh merge-proof status` CLI and stable JSON over any visual surface.
- **Identity questions widen.** "Does the approval apply to the head" now includes "was the approver a bot, a human, or a human account driven by an agent" (Claude cloud Auto-fix replies post as the user's account; Copilot co-authors the human; GitLab composite identity attributes agent MRs to the triggering human). Merge-Proof's existing actor classification gains a natural sibling: approval actor class, and whether an approval came from the author's own agent identity.
- **Bypass and ruleset evidence matter more.** Agents are handed admin-scoped tokens to work around protections (protoLabs release-tools #65, 2026-09-14: required approvals silently reverted to 0 because the automation identity could not approve its own PRs). Recording that protections were in force and not bypassed for this SHA is a differentiator no agent vendor offers.
- **Freshness semantics get harder.** Auto-fix loops push repeatedly; reviews land against superseded diffs (Anthropic documents this); guardian tools approve actions, not candidates. CURRENT / STALE becomes the core product, but it must be quiet until merge intent exists or it becomes the low-battery chirp.

Risks to the thesis: GitHub could ship a native merge attestation (no signal yet; it already ships agent trailers and signing); vendors could attach "verification bundles" to PRs (still self-reported; the layer's job becomes checking them against platform records); the market could decide agent PRs never need review, in which case the buyer is compliance or platform engineering, and those buyers exist.

---

## 7. Ideal product

Merge-Proof pushed as far as it should rationally go, and no further.

**Workflow.** Install the App on a repository you admin. Nothing to configure. Merge-Proof discovers open PRs, proves each candidate automatically, re-proves on every relevant GitHub event, publishes one check run per head, and writes an immutable ledger row when the PR merges. The seven-day trial starts at the first CURRENT collection-complete receipt. Pro keeps it running and unlocks admin-configured enforcing presets, which are still just GitHub required checks the owner chooses.

**The beacon is the check run.** One line in the merge box:

- VERIFIED and CURRENT: `success`, title "Proven for a1b2c3d · 4 min ago". Collapsed by GitHub's own design. The user does nothing.
- Checking: `in_progress`.
- STALE: `action_required` under advisory policy ("Proof was for a1b2c3d; head is now e4f5g6h"), `failure` under enforcing policy. There is an author action, so it is highlighted. STALE only escalates once merge intent exists (ready for review with approvals present, auto-merge armed, or a queue entry); before that it stays quiet.
- NOT_PROVEN: `neutral` with the missing-evidence list in the title. Never red. NOT_PROVEN is "insufficient current evidence", not "failed".
- FAIL: `failure`. The only red.
- No current proof: no check run, or `queued`.

**The compact viewer is the check summary.** Verdict; why (one sentence per gap from the existing remediation view); what changed (head/base/rules diff since last receipt); what needs to happen next; freshness with the observation time; the important evidence (required checks and which SHA each ran on, approvals and which head each covers, active rules); link to the complete receipt. Three `requested_action` buttons: **Re-check now**, **Why not proven?**, **Open receipt**. That is glance → understand → act without leaving GitHub.

**The receipt is the product.** Immutable, permalinked per (repository id, PR, head, base, target SHA), HTML and JSON, with the existing schema v2 body: identity, summary, evidence, gaps, notChecked, limitations. Hardened as a DSSE-signed in-toto Statement with a published service key and a Rekor v2 anchor embedded in the page, with a client-side verify button. Currentness stays unsigned and live. The receipt says in plain words that it records what GitHub reported to a read-only App and is not independent of GitHub.

**Automatic behaviour.** Re-proof on push, base movement, review, check, workflow, merge-group, ruleset and protection events (already implemented). Two complete bounded observations must match. Skipped and neutral conclusions never satisfy execution proof. Old-head approvals never count. Unknown rule types block proof. Own check excluded from its own requirements.

**Post-merge.** The ledger row binds the landed commit to the validated candidate at content level (tree equality), not only at SHA level, and records merge actor class, bypass evidence from rule suites where readable, and the rules snapshot at enqueue versus merge. `GET /receipts?repo=<id>&commit=<sha>` answers "is this deployed commit a proven landing" in one call.

**Actions.** Re-check now; refresh candidate; inspect missing condition (deep link to the exact GitHub page: the check, the review, the ruleset); open PR; open receipt. No dashboard as a primary surface; the account page remains a list of latest receipts per PR with truthful states, and that is enough.

**Notifications.** Off by default. Optional Slack/Teams post only on transitions to STALE, NOT_PROVEN or FAIL on protected branches with merge intent, throttled per PR. A weekly trial digest: candidates proved, catches, what each catch was.

**Evidence model.** Unchanged in verdict vocabulary: VERIFIED / NOT_PROVEN / FAIL, plus CURRENT / STALE / UNAVAILABLE. Additions are fields, not states: approval actor class, workflow blob binding per required check, rules snapshot diff, bypass evidence with explicit "unreadable" state, landed-content binding state, self-asserted agent trailers recorded as corroboration.

**Consumers.** Humans via the check and receipt; agents and CI via JSON and `gh merge-proof status`; auditors via receipt permalinks and ledger export; compliance platforms via an evidence export they can attach to their per-PR control; deployment gates via verify-by-SHA and, later, a GitHub deployment protection rule.

---

## 8. Improvement backlog

Fields per item: buyer problem; evidence; expected value; complexity; dependency; native overlap; commoditization risk; moat effect; recommendation. Cost labels: S under a week, M one to four weeks, L more.

### NOW (next 30 days; validation-facing)

| # | Improvement | Buyer problem | Evidence | Value | Cost | Dependency | Native overlap | Commoditization risk | Moat | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Check-run conclusion mapping and titles: STALE → `action_required` (advisory) / `failure` (enforcing); NOT_PROVEN → `neutral`, never red; SHA prefix and age in the title | "Red implies action from the author" confusion; NOT_PROVEN read as broken | GitHub community #143787; Nagios UNKNOWN and cosign "no matching signatures" failure modes | Correct three-state comprehension on the only surface that matters | S | none | GitHub merge box owns readiness | Low | Reputation | NOW |
| 2 | Three `requested_action` buttons on the check: Re-check now, Why not proven?, Open receipt | Act without leaving GitHub | Checks API supports 3 actions and `check_run.requested_action` | The "act" step of the hierarchy | S | webhook handler | none | Low | UX | NOW |
| 3 | STALE quiet until merge intent (ready for review + approvals, auto-merge armed, queue entry) | Smoke-detector chirp; users learn to ignore STALE | Report 07 §3.9 | Keeps the beacon credible | S | none | none | Low | Reputation | NOW |
| 4 | Trial digest: weekly "candidates proved / catches / what each was", plus in-app counter | Green gives zero visibility; day-7 cancellation is rational | Report 07 Part 3 risks | Trial conversion | S | email or account page | none | Low | none | NOW |
| 5 | `gh merge-proof status [PR]` extension printing verdict / why / next / receipt URL; stable JSON | Agents and stewards need a machine gate; enterprises block browser extensions | `pr-completion`, AGENTS.md self-merge policies, `ExtensionInstallBlocklist` | Makes the verdict consumable by the growing agent consumer | S–M | receipt API auth | none | Low | Distribution | NOW |
| 6 | Positioning and copy: qualify "independent" everywhere; drop "verification" as the category noun; lead with the symptom ("green but stale"); explicit "records what GitHub reported" line | Brand collision (Qodo, Sonar); overclaiming undermines the epistemic promise | Reports 05, 06 §8 | Trust | S | none | n/a | n/a | Reputation | NOW |
| 7 | Name-collision review of `Aryamanz29/mergeproof` and trademark position | Confusion at search time | Report 05 Group 4 | Avoids a cheap loss | S | legal | n/a | n/a | Brand | NOW |
| 8 | Re-verify test-merge ref selection against the 2026-02-19 change to test merge commit generation; add a fixture | Wrong applicable CI target | Report 01 A3 | Correctness | S | none | n/a | n/a | Engine | NOW |
| 9 | Design-partner outreach: ten agent-heavy small teams on GitHub Team plan with private repos and no queue; measure first catch per team | No outside validation | Section 9 | Product-market signal | S (time) | items 1–5 | n/a | n/a | n/a | NOW |

### NEXT (30–90 days; deepen the record)

| # | Improvement | Buyer problem | Evidence | Value | Cost | Dependency | Native overlap | Commoditization risk | Moat | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | Landed-content binding: compare the landed commit's tree to the validated candidate's tree (test-merge or group head) and record `LANDED_CONTENT_MATCHES_VALIDATED` / mismatch / unsupported (rebase) in the ledger | "What merged is not what was tested" | 2026-04-23 incident; squash/rebase land untested SHAs; HEADGREEN | The single strongest new claim; would have surfaced the GitHub incident per repo | S–M | Contents:read (held) | none | Low; GitHub has no such record | Core | NEXT |
| 11 | Workflow blob binding: record the blob SHA of each workflow producing a required check at the tested SHA; flag when the PR modifies it; note SHA-pinning policy state | Gating workflow loosened inside the PR | Report 01 B5; tj-actions; Actions policy 2025-08-15 | Closes a medium gap GitHub closes only with org required workflows | S–M | Contents:read | Required workflows (org, paid) | Medium if GitHub adds blob binding | Core | NEXT |
| 12 | Bypass evidence from rule suites: after merge, read `rule-suites` for the ref update (Administration:read, already requested) and record `result: bypass` / actor into the ledger; state explicitly when unreadable or exempt | "Was this merge clean?" | Report 01 B1, B10; exempt mode 2025-09-10 | Turns a disclosed gap into partial evidence | M | timing (rule suites written at merge) | Rule Insights GA 2026-08-25 (UI, short window) | Medium | Core | NEXT |
| 13 | Rules snapshot at enqueue versus at merge, diffed, in the ledger | Rules changed between evidence and merge | Report 01 B11, C5 | Something GitHub does not provide | S | existing ruleset snapshot | ruleset history (Admin:write, 180 days) | Low | Core | NEXT |
| 14 | Approval provenance: reviewer account class per approval; Copilot-approval policy state and path-glob applicability; "unattributed Copilot" extra-approval rule; dismissed-by-whom | "Was the required approval a human, on which head?" | Copilot approvals preview 2026-09-01; AISI fake-identity case | Explains NOT_PROVEN in the case buyers will ask about first | S–M | existing actors data | GitHub shows it implicitly | Medium | Core | NEXT |
| 15 | Agent trailer corroboration: parse `Agent-Logs-Url`, `Claude-Session`, `Co-Authored-By`, `Assisted-by`, `Generated-by`, recorded as self-asserted corroboration alongside account type; hidden third-party agent App identities named | "Who or what wrote this?" | Report 03 §5; Report 02 §1 | Cheap, honest identity enrichment | S | Contents:read | GHEC audit `actor_is_agent` | Low | Data | NEXT |
| 16 | Signed receipt: in-toto Statement, custom predicate `receipt/v2`, DSSE with a KMS-held key, published key history; Rekor v2 anchor with self-managed key; verify button in the permalink; one-file verifier | "Prove the receipt was not altered or backdated" | Report 06 §8–9 | The smallest hardening with real trust value; the auditor's three questions | M | key custody | none | Low | Trust | NEXT |
| 17 | Verify-by-SHA: `GET /receipts?repo=&commit=` returning the receipt for a landed candidate | Deploy pipelines want one call | Report 06 §7 option 1 | Zero new artifacts, immediate deployment linkage | S | ledger | none | Low | Distribution | NEXT |
| 18 | Public-repo free tier for distribution; per-org cap for small teams as a test | Passive-tool tax; OSS distribution | Report 07 Part 2 | Funnel | S | billing | n/a | n/a | n/a | NEXT (test, do not commit blindly) |

### LATER (after product-market signal)

| # | Improvement | Buyer problem | Value | Cost | Native overlap | Rec |
|---|---|---|---|---|---|---|
| 19 | GitHub custom deployment protection rule: approve/reject a protected-environment deployment against the receipt for the run's SHA | "Only deploy proven landings" | Turns the record into a gate without cryptography | S–M | Environments (Actions:read, app-only webhook) | LATER, first amplifier |
| 20 | GitLab adapter over MR API + external status checks (Ultimate); model composite identity | Cross-platform independence; compliance buyer | Cheap port, different go-to-market | M | GitLab built the hook | LATER (after GitHub PMF, or with an Ultimate design partner) |
| 21 | Compliance evidence export for Vanta/Drata per-PR controls | Auditor artifact | Channel into $10k–80k/yr budgets | M | They test configuration only | LATER |
| 22 | SVR / `ORG_SOURCE_*` summary emission for SLSA-aware consumers | Interop | Cheap once signing exists | S | none | LATER |
| 23 | VS Code status-bar item (non-green only) | Solo agent-heavy developer lives in the IDE | Good third surface | S–M | none | LATER |
| 24 | Browser extension drawing the light in the merge box | Small-team wish | Community-maintained only; DOM churn; enterprise blocklists | M ongoing | GitHub merge box | LATER, only on request |
| 25 | Slack/Teams transition alerts | Platform owner escalation | Off by default | S | none | LATER |
| 26 | Repo badge "last 30 days: N merges, N proven" | OSS distribution | Marginal | S | none | LATER |
| 27 | Bitbucket Cloud Forge merge check | Small overlap | Separate runtime | L | Forge | LATER, only with paying demand |

### DO NOT BUILD

| Direction | Reason |
|---|---|
| General AI code reviewer | Commoditized by GitHub, OpenAI, Anthropic, Cursor, CodeRabbit, Greptile, Qodo; contradicts "no model decides the verdict". |
| Vulnerability scanner, bug finder, test generator | Sonar, Snyk, Semgrep, Codacy, Datadog territory; a different budget and buyer. |
| CI service or merge queue | GitHub, Mergify, Aviator, Trunk, Graphite; Merge-Proof audits the queue, it does not run it. |
| Policy engine or policy language | The requirements come from the repository's own rules; Rego is Kosli/Harness/OPA territory. |
| Issuing SLSA Source Levels | That is the source control system's claim; a third party issuing levels invites disputes and becomes a compliance authority. |
| Evidence vault, SBOM/VEX/SARIF store, framework catalogs, audit CSV exports as a product | Kosli and Chainloop with fewer features; the "different company" trap. |
| Kubernetes admission integration attaching receipts to images | Heavy support burden; wait for a paying customer. |
| gittuf-style independence (signed commits, RSL, client verification) | Different trust model and adoption curve; partner, do not compete. |
| Sigstore keyless as a prerequisite | An identity-plumbing project with little buyer-visible gain over a published service key. |
| Agent orchestration, project management, engineering dashboards, generic observability, SOC 2 platform | Dashboard gravity; incumbents; dilutes the record. |
| Semantic test-coverage or test-weakening detection inside the verdict | Real gap but a diff-content judgment outside the evidence contract; at most record which workflows and checks executed so others can reason about coverage. |
| Bitbucket Data Center plugin | Self-hosted Java plugin ecosystem; disproportionate for a tiny team. |
| Menu-bar or desktop light as a primary surface | Personal lights fail; a shared "team light" is a later, on-brand novelty at most. |

---

## 9. Buyer and offer

**First ideal customer.** A 2–10 person AI-native team on GitHub Team plan with private repositories, where agents (Claude Code, Codex, Copilot cloud agent, Cursor, Devin) open most PRs, one or two humans merge, there is no merge queue (unavailable on that plan for private repos), and rulesets exist but were configured once. Small teams are the heaviest agent users (Help Net Security 2026-07-22); they have the highest agent-PR ratio, admin-bypass defaults, and a self-serve buying cycle measured in days.

**Second customer (revenue).** Platform engineering at 50–500 developers that owns a merge queue and rulesets, feels the Faros/LinearB review-load numbers (PRs merged +98%, review time +91%; agentic PR pickup 5.3x slower), and wants the receipt, bypass visibility and landed-content binding for forensics and compliance evidence. Buying cycle weeks to a quarter with a security review of a read-only App. Compliance platforms (Vanta, Drata) are the channel, not the competitor.

**Not the first customer.** Solo developers (high churn once novelty fades), regulated enterprises (best ACV, worst fit for a 7-day no-card trial), open-source maintainers (loudest pain, zero willingness to pay; free tier for distribution), agencies (no evidence).

**Pain.** "It passed on the branch and broke main." "The approval was for a different commit." "The bot merged its own PR." "Someone bypassed the ruleset and nobody noticed." Buyers recognise symptoms, not the SHA taxonomy; marketing leads with the symptom.

**Trigger.** The first agent-authored PR that merged with stale or missing evidence; a broken `main` after a green PR; enabling Copilot approvals or a self-merge policy; a customer or auditor asking "how do you know the tests ran on what you shipped".

**Buying reason.** Reduce human rechecking of agent-generated changes without adding reviewers, and keep an immutable explanation of why each merge was considered proven. Ranked by evidence, buyers care about: (1) immediately knowing the base moved or the head changed after evidence (documented at issue level in agent-heavy repos); (2) distinguishing green checks from current merge proof (GitHub's own skipped-equals-success semantics); (3) knowing whether merge-group CI covered the final candidate (2026-04-23); (4) detecting a bypassed or weakened protection (protoLabs #65; Legit research); (5) an immutable receipt for audit (compliance platform tests stop at author ≠ approver); (6) making high-volume agent coding safer without more reviewers (MSR 2026, DORA 2025).

**Why $29 is or is not justified.** It is at the top of the plausible band and 2.4x the closest passive analogue. It is defensible only if the product is positioned as a control with an exportable, signed receipt and bot-excluded active-developer metering over a 30-day window, both of which already hold. Do not change list price on the strength of other vendors' models. Do test: a public-repo free tier for distribution, a small-team per-org cap, and a trial that ends at "7 days or the first non-green verdict inspected, whichever is later". Retired concepts (five free proofs, top-ups, $5,000 pack, enterprise compliance as primary) stay retired; nothing in the research argues for their return.

**Onboarding.** Install on one repository you admin; pick an open PR or wait; the first CURRENT receipt starts the trial. Keep it.

**Trial trigger.** Unchanged: first CURRENT, collection-complete VERIFIED or NOT_PROVEN hosted receipt, exactly once. Add the weekly digest so seven green days are not seven silent days.

**First "aha" moment.** The first STALE or NOT_PROVEN check that explains, in one sentence, that the approval or the green run belongs to a commit that is no longer the one about to merge, with the exact SHAs and the one next action. Everything in the NOW list exists to make that moment arrive inside the trial and be understood without a dashboard.

---

## 10. Positioning

**Category definition (one sentence).** Merge-Proof is the independent merge evidence record for GitHub: it states what was actually proven about the exact code that could merge, and what was not.

**Buyer promise (one sentence).** Before an agent's work lands, know whether the green checks and approvals still belong to the commit you are merging, and keep the receipt.

**Homepage headline.** Green checks go stale. Merge Proof records what was actually proven about the exact code you merge.

**Subheadline.** Deterministic evidence receipts for every pull request: which checks ran on which commit, which approvals still apply, which rules were in force, and what is still not proven. No AI model decides the verdict. Not the coding agent grading its own work.

**Three strongest proof/value points.**

1. **Exact candidate, not "the PR".** Evidence is bound to the PR head, the GitHub test-merge commit or the merge-group commit, and re-proved when the head, base, rules or approvals change. A receipt is marked STALE the moment it no longer describes what is there now.
2. **Executed, not just green.** A skipped required job counts as success on GitHub. Merge Proof distinguishes a check's conclusion from an actual workflow run, job and step on that commit, and treats old-head approvals as insufficient even when the repository allows them.
3. **Says what it cannot prove.** Every receipt lists NOT_PROVEN areas, unsupported rules and unreadable evidence. It records what GitHub reported to a read-only App; it does not claim correctness, security, or independence from GitHub.

Words to avoid in the category position: verification (claimed by Qodo, Sonar), AI code review, safe AI coding, engineering governance, proof the code works.

---

## 11. Moat

What can become difficult to reproduce, honestly separated.

**Real moat (compounds with time and cases).**

- **The exact-candidate evidence model and its edge cases.** Test-merge versus head versus group selection; ALLGREEN versus HEADGREEN; ruleset and classic protection intersected rather than treated as alternatives; classic absence established only by an identity-matching GraphQL null; two complete observations required to match; skipped steps, status-only success and self-reference excluded from execution proof; old-head approvals insufficient by policy; unknown rule types blocking. Each of these was learned against real GitHub behaviour and each is a place a copier will get wrong first.
- **The refusal machinery.** `gaps`, `notChecked`, `limitations`, currentness stored separately from verdict, FAIL that never starts a trial, fail-closed policy partitioning where new gap codes block by default. A platform vendor has weak incentive to build a product whose main output is what it did not prove.
- **The join GitHub never makes.** Candidate SHA + check runs + workflow blob + applied rules + bypass evidence + landed content in one record, from data GitHub exposes across surfaces with different permissions, retention and plan gating.
- **Accumulated receipts and the ledger.** Immutable per-merge history with landed-content binding becomes a dataset of real merge-integrity failures nobody else holds, and a switching cost for the audit trail.
- **Trust and reputation for not overclaiming.** Hard to buy, slow to build, easy to lose.

**Temporary advantage.**

- First-mover on the check surface and on the SLSA Source Track vocabulary.
- Bypass evidence from rule suites, until GitHub adds a per-PR bypass bit.
- Approval provenance reporting, until Copilot approvals and last-push approval become default-on.

**Feature (not a moat).** Signed receipts and Rekor anchoring (anyone can do it; it is table stakes once demanded); CLI; deployment protection rule; GitLab adapter; digests.

**Commodity.** The status light; merge readiness; AI review; per-active-developer billing; agent identity trailers; build provenance.

Cross-platform support is not a moat by itself, since every platform has an official gate API; consistent verdict semantics across platforms is, and it strengthens the "not the platform grading its own homework" position for compliance buyers.

---

## 12. Kill criteria

Objective signals, with the action each implies.

| Signal | Threshold | Action |
|---|---|---|
| GitHub ships a native per-merge record that binds approvals to the final head, checks to the merge-group SHA, and bypass use, available on Team plan | Announced with GA date | **Reposition** to auditor-of-the-record and cross-platform consistency within one quarter; if the native record also lists gaps and is exportable, **fold** the engine into an OSS verifier and stop the hosted product. |
| Design-partner outreach yields no first catch | Fewer than 3 of 10 partner teams see a STALE or NOT_PROVEN with merge intent within 30 days of install | **Pivot** the wedge: the evidence gap is not frequent enough for this buyer; test platform teams with queues, or stop. |
| Trial conversion | 0 paid conversions across 20 qualifying trials that reached at least one catch | **Reposition** the offer (free tier plus paid receipts and enforcement) or **stop**; the catch is not worth $29 to this buyer. |
| Compliance platforms close the depth gap | Vanta or Drata document per-PR tests with approval-on-head-SHA, checks-executed-on-SHA and bypass fields | **Fold** the compliance channel; remain only if the Team-plan developer buyer is converting. |
| Agent vendors standardise a pre-merge recheck that buyers accept as sufficient | GitHub or OpenAI ship a first-party "verified merge readiness" recheck adopted by design partners who then cancel | **Pivot** to the post-merge ledger and deployment gate, or **stop**. |
| Name confusion | Measurable search or support confusion with `mergeproof` OSS after the trademark review | **Rename** early rather than late. |
| Operating cost | Hosted evidence collection cost per active developer exceeds one third of $29 at target scale | **Reprice** or narrow event coverage. |

Any one of the first three signals within 90 days should trigger a written decision, not another feature.

---

## 13. 30 / 60 / 90-day trajectory

Tied to validation. Code only where it removes a validation blocker.

**Days 1–30: make the catch visible and consumable.**

- Ship NOW items 1–5 and 8 (check mapping and buttons, quiet STALE, trial digest, `gh` CLI, test-merge re-verification). Each is small and each affects what a trial user sees.
- Rewrite the fold and receipt copy per item 6; qualify "independent"; remove "verification" as the category noun. Run the trademark and name-collision review (item 7).
- Recruit ten design-partner teams matching the first-customer profile. Instrument: time to first receipt, time to first catch, what the catch was, whether it was understood without help, whether the team changed a setting or re-ran CI in response.
- Publish one short write-up on the 2026-04-23 merge-queue incident as a concrete case of landed content diverging from validated content, framed as what a receipt would have shown. Symptom-led, not taxonomy-led.

**Days 31–60: deepen the record where the catches point.**

- Ship NEXT items 10, 13 and 14 (landed-content binding, rules snapshot diff, approval provenance). These are the claims buyers will ask about first and are cheap against held permissions.
- Ship item 17 (verify-by-SHA). Offer it to one platform-engineering prospect as the deployment linkage story.
- Decide the pricing tests (item 18) from partner data: free public repos; a small-team cap; trial ending at 7 days or first catch inspected. Test one at a time.
- Collect the first three written partner quotes about a catch. If none exists by day 60, invoke the kill criteria review.

**Days 61–90: harden trust and choose the second buyer.**

- Ship items 11, 12, 15 and 16 (workflow blob binding, rule-suite bypass ingestion with explicit limits, agent trailer corroboration, signed and anchored receipt with verify button). Together these are the "auditor's three questions" and the bypass story.
- Run one compliance-channel conversation (a Vanta or Drata customer) using the signed receipt; decide whether the LATER export item is worth pursuing.
- Decide GitLab: only if an Ultimate design partner has appeared. Otherwise it stays LATER.
- Write the 90-day decision memo against the kill criteria: continue, reposition, fold, or stop.

Throughout: no browser extension, no dashboard, no policy language, no scanner, no queue.

---

## Appendix A: repository truth verified on 2026-09-19

Verified in `ohcaygo/merge-proof` at `e76a867`:

- Hosted App with OAuth login, installation and repository discovery, automatic proof by PR, GitHub Check publication (optional, own check excluded from own requirements), duplicate-delivery handling, receipt authorization that denies anonymous access even for public repos, stale detection with currentness stored separately, merge-group and live queue-entry matching (HEADGREEN exercised; ALLGREEN other-entry evidence explicitly unsupported), ruleset and classic protection intersection with explicit classic-absence evidence, evidence receipts (schema v2, fingerprint, not signed), persisted proof history, final/current distinction, durable merge ledger with `PROOF_BOUND_TO_PR_HEAD_ONLY` / `PROOF_BOUND_TO_OTHER_STATE` / `NO_PROOF_RECORDED`, deterministic NOT_PROVEN remediation views, actor classification (`HUMAN_ACCOUNT` / `APP_OR_BOT` / `UNKNOWN`, `agentIdentity` on authorship only), enforcing presets requiring paid Pro and repository admin, 7-day report-only trial starting at first CURRENT receipt, $29 per observed active developer.
- Explicitly unsupported and disclosed: CODEOWNERS, required teams, review-thread resolution, last-push actor approval, signatures, linear history, deployments, required workflows, code scanning, ALLGREEN other entries, unknown rule types, bypass entitlement, checkout contents and semantic test coverage, historical approval validity, squash/rebase historical shapes.
- Tests: `npm run test:github` 199/199 on Node 22.22.2 in this session; validation records show 170/170 on Node 20 at the ruleset acceptance and live queue, gate and trial acceptances with founder-owned repositories.
- Free local CLI and Action remain offline, zero-dependency, schema v1, and check only `BASE_DRIFT_UNVERIFIED`, `PROTECTED_BOUNDARY` and advisory `STALE_BASE`.
- No outside paying customers; trial activation was founder production acceptance.

## Appendix B: source reports

Seven research reports with their own Sources sections (URL, date, status; excerpt-only claims flagged) are in `sources/`:

1. `01-github-merge-queue-protection.md`: merge queue mechanics, everything that changes the meaning of green, the native GitHub challenge.
2. `02-github-copilot-governance-attestations.md`: Copilot cloud agent, approvals, AI governance, audit log, attestations, checks and merge box.
3. `03-openai-coding-agents-trust.md`: Codex and Astra, Claude Code, Devin, Cursor, Jules, Kiro, Factory, OpenHands; incidents, surveys, identity standards; the autonomy question.
4. `04-gitlab-atlassian.md`: GitLab and Bitbucket merge integrity, agents, extension points, cross-platform recommendation.
5. `05-adjacent-vendors.md`: merge queues, AI reviewers, supply chain and compliance platforms, agent verification; pricing table; ranked players; closest analog.
6. `06-attestation-slsa-sigstore.md`: SLSA Source Track, in-toto predicates, Sigstore, GitHub attestations, gittuf, evidence vaults, deployment linkage, honest independence.
7. `07-buyer-pricing-surface.md`: documented pain, segments, three-state comprehension, pricing benchmarks and precedents, surface assessment and recommendation.
