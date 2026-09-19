# Merge-Proof: Buyer Pain, Pricing, and Product Surface

Research memo, 2026-09-19. Scope: (1) documented buyer pain vs. theory, (2) pricing benchmarks for a passive integrity GitHub App billed per observed active developer, (3) technical/behavioral assessment of surfaces for a "Proof Beacon" indicator that disappears when green.

**Method and limits.** Web search budget for this session was exhausted after ~25 queries; many primary domains (github.blog, docs.github.com, dora.dev, metr.org, survey.stackoverflow.co, linearb.io, faros.ai, vendor pricing pages) were blocked by the egress proxy. Where a claim comes from a search-engine summary rather than a fetched page it is marked **[search summary]**; where it comes from prior knowledge not re-verified today it is marked **[unverified today]**. github.com itself (docs source repo, community discussions, issues, Marketplace) was reachable and those claims are fetched. Community sources are used for pain/sentiment only.

---

## Part 1 — Buyer pain

### 1a. Documented pain vs. theory

The pain Merge-Proof targets decomposes into five claims. Each is graded: **Documented** (first-party evidence found), **Documented-adjacent** (evidence of the surrounding problem, not the exact mechanism), or **Theory** (plausible, not yet evidenced).

**Claim 1: Agent PR volume is outrunning human review capacity. — Documented.**

- Faros AI, "The AI Productivity Paradox" (telemetry from 10,000+ developers, 1,255 teams): high-AI-adoption teams merge 98% more PRs, but PR review time rises 91%, average PR size grows 154%, and bug counts rise 9%. The report's own framing: the bottleneck moved from code generation to human approval. (https://www.faros.ai/blog/ai-software-engineering, 2025) [search summary]
- LinearB 2026 Software Engineering Benchmarks (8.1M+ PRs, 4,800+ orgs): agentic PRs have 5.3x longer pickup time than unassisted PRs; AI-generated PRs merge within 30 days 32.7% of the time vs. 84.4% for unassisted. (https://linearb.io/resources/software-engineering-benchmarks-report, early 2026) [search summary]
- DORA 2025 State of AI-assisted Software Development: 90% AI adoption (+14 pts YoY); core framing is "speed without stability is just accelerated chaos" and "AI is an amplifier" of existing process weakness. Winning orgs share "stable pipelines" as one of three patterns. (https://dora.dev/dora-report-2025/, Sept 2025) [search summary]
- Open-source maintainer overload: The New Stack ("Open source maintainers are drowning in AI-generated pull requests. Enterprise teams are next.") and bex.co ("17 Million Robot PRs a Month", 2026-09-08) both describe agents generating faster than humans can verify, with the observation that better-written agent PRs *increase* per-PR review effort because a structurally sound, confidently written PR that is wrong in the middle demands full line-by-line review. (https://thenewstack.io/ai-generated-code-crisis/; https://bex.co/blog/2026/09/08/ai-coding-agents-open-source-maintainership) [search summary; community/press, sentiment only]

**Claim 2: Developers do not trust AI output and want verification. — Documented.**

- Stack Overflow 2025 Developer Survey: trust in AI accuracy fell from 40% to 29%; 46% actively distrust; only 3% "highly trust"; 66% cite "almost right, but not quite" as the top frustration; 45% say debugging AI code is more time-consuming. (https://survey.stackoverflow.co/2025/ai, July 2025; press release https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/) [search summary]
- METR RCT (16 experienced OSS devs, 246 tasks): developers were 19% slower with AI but believed they were 20% faster. The relevant inference for Merge-Proof: developer self-report about whether something is "done and checked" is unreliable, which is an argument for machine-verified evidence rather than self-attestation. (https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/, 2025-07-10) [search summary]
- GitClear 2025 (211M changed lines): duplicated code blocks up 8x in 2024, two-week churn up from 3.1% (2020) to 5.7% (2024), refactoring line-moves down 70% vs 2022. (https://www.gitclear.com/ai_assistant_code_quality_2025_research, Feb 2025) [search summary]

**Claim 3: Stale approvals / "approval doesn't apply to the current head" is a real, recurring failure. — Documented (issue-level evidence).**

- fullsend-ai/fullsend#7440 (fetched): a reviewer approved commit A; ~14 hours later the author force-pushed commit B (containing merge-conflict markers) and merged ~70 seconds later. The approval stayed valid because the ruleset had `require_last_push_approval: false` and `dismiss_stale_reviews_on_push: false`. The issue's own wording: code that "no human (or the review agent) ever actually reviewed" merged. Proposed fix: require approval on the exact landing SHA. (https://github.com/fullsend-ai/fullsend/issues/7440, 2026)
- GitHub docs (fetched from github/docs source): "dismiss stale pull request approvals when commits are pushed that affect the diff" and "require approval of the most recent reviewable push" are *optional* settings, and admins/bypass roles can circumvent protections by default unless "do not allow bypassing" is enabled. (https://github.com/github/docs/blob/main/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md)
- This is exactly the gap Merge-Proof's "do approvals apply to the current head" check fills, and the fullsend issue shows a team discovering it *after* a bad merge rather than before.

**Claim 4: Branch-protection drift and bypass happen silently, especially with automation identities. — Documented (issue-level evidence).**

- protoLabsAI/release-tools#65 (fetched, 2026-09-14): an org-wide policy set `required_approving_review_count: 1`; three automation-heavy repos silently reverted to 0 within hours because a tooling script hardcoded `DEFAULT_REQUIRED_APPROVING_REVIEWS = 0`. Rationale in the tool's own docs: "the fleet's automation identity authors every PR and cannot approve its own, so any positive count deadlocks every PR at REVIEW_REQUIRED despite green CI." Two contradictory policies oscillated; "whichever mechanism runs last silently overwrites the other." (https://github.com/protoLabsAI/release-tools/issues/65)
- This is a first-class example of the "did rulesets/protections apply or get bypassed" question and shows that the pressure to weaken protections comes from agent workflows themselves.

**Claim 5: AI reviewers approving AI-authored work. — Documented (product change), sentiment forming.**

- GitHub docs source (fetched): "By default, Copilot's reviews do not count toward required approvals" but when admins enable it, "Copilot can submit an approving review that satisfies your repository's required-approval rule the same way a teammate's approval would." Approval is dismissed if new commits are pushed. (https://github.com/github/docs/blob/main/content/copilot/concepts/agents/code-review.md)
- A DEV Community post ("Copilot Can Now Approve Pull Requests. Should It Count Toward Your Branch Protection?") dates the change to 2026-09-01 and notes Copilot can now be on both sides of a PR (author via cloud agent, reviewer via code review). (https://dev.to/pwd9000/copilot-can-now-approve-pull-requests-should-it-count-toward-your-branch-protection-2b78) [search summary; community]
- Unanswered community discussions (fetched index): "Copilot code review says 'Approval recommended' but always submits COMMENTED, never APPROVED" (2026-09-04) and "Copilot Coding Agent review when 'Require approval of the most recent reviewable push' is enabled" (2025-09-02). Both show teams confused about *which* approvals count and against *which* push. (https://github.com/orgs/community/discussions/categories/copilot-conversations)

**Claim 6: "Green but stale" / base-drift merges break main. — Documented-adjacent (sophisticated-team baseline), thin for the mid-market.**

- Google TAP: a Graphite history piece and an HN thread describe the classic failure: presubmit passes on the branch, the change merges, and the build breaks anyway because presubmit did not check the resulting merge state (a race). (https://graphite.com/blog/bors-google-tap-merge-queue; https://news.ycombinator.com/item?id=21586079) [search summary]
- Uber SubmitQueue (README fetched): "keeps your trunk consistently green at scale"; addresses "concurrent changes [that] can introduce subtle conflicts and destabilize builds," including "semantic incompatibilities between concurrent changes." Uber's blog explicitly notes code review tools cannot report semantic conflicts (e.g. a call to a function renamed in another PR); only running CI on the combined state detects them. (https://github.com/uber/submitqueue; https://www.uber.com/us/en/blog/bypassing-large-diffs-in-submitqueue/) [README fetched; blog search summary]
- A 2026 agent-fleet issue (anthony-chaudhary/fak#11460) describes worker worktrees landing concurrently: a clean textual 3-way merge advanced `refs/heads/main` without a build check, leaving trunk broken. (https://github.com/anthony-chaudhary/fak/issues/11460) [search summary]
- GitHub docs: the "strict" status-check mode ("branch must be up to date with the base branch before merging") is optional; the loose mode is the default and permits exactly this. (about-protected-branches.md, fetched)
- GitHub Merge Queue pain (community discussion #46757, fetched): top issue is CI not configured to run on `merge_group`; checks "staying on pending for every PR even though they completed on them prior to entering the Queue"; PR-specific checks incompatible with queue runs; no view of which PRs merged together. GitHub's own merge-queue docs (fetched) warn the queue "will wait for required checks to be reported" and can stall indefinitely without a status-check timeout. (https://github.com/orgs/community/discussions/46757; managing-a-merge-queue.md)

**What is still theory.** No public postmortem in the last 12 months was found that attributes an incident specifically to "CI ran on a different SHA than the one merged." The mechanism is well documented at Google/Uber scale, and issue-level evidence exists in agent-heavy repos, but there is not yet a widely cited mid-market postmortem naming this failure. Expect buyers to recognize the *symptoms* (broken main after a green PR, "it passed on the branch") more readily than the *taxonomy* (head/base/merge-group SHA mismatch). Merge-Proof marketing should lead with the symptom.

**Sophisticated-team baseline.** Google (TAP + presubmit), Meta (land-time verification), and Uber (SubmitQueue, open-sourced) all solved this with speculative merge queues that re-run CI on the predicted post-merge state. GitHub Merge Queue is the commodity version and is the thing Merge-Proof must position against: Merge-Proof does not *produce* the evidence (a queue does), it *audits* whether evidence exists for the exact candidate. The honest pitch is "you may not have a queue, or your queue may be misconfigured; we tell you whether the proof is actually there."

### 1b. Who feels it most, and willingness to pay

**Segments, ranked by documented pain × plausible budget:**

1. **2-10 person AI-native teams.** Help Net Security (2026-07-22) reports "small teams are the heaviest users of AI coding agents." (https://www.helpnetsecurity.com/2026/07/22/users-of-ai-coding-agents/) [search summary]. These teams have the highest agent-PR ratio, often no merge queue, and admin-bypass defaults. They already pay per-seat for CodeRabbit ($30/seat, 14-day trial per Marketplace listing, fetched), Cursor, and Graphite. Buying cycle: self-serve, days. Risk: they are also the most price-sensitive and the most likely to say "I'll just turn on `require_last_push_approval`."
2. **Solo agent-heavy developers.** Highest volume of unreviewed agent merges by construction (the protoLabs issue is a fleet whose "automation identity authors every PR"). Willingness to pay for a single seat at $29 is plausible but the value is largely self-discipline; churn risk is high once the trial's novelty fades. Buying cycle: minutes.
3. **Platform engineering at 50-500.** Feels the Faros/LinearB numbers directly (review load, PR size). Already pays for Mergify ($21/user, active-contributor billing), Aviator (free <15 devs, then per active dev), Trunk, Graphite (~$20/user, ~$40 with merge queue add-on per Mergify's comparison page) [all search summary]. Buying cycle: weeks to a quarter; needs a security/procurement review because a GitHub App reads repo metadata. This segment is the most likely to understand "evidence for the exact SHA" without education because they own the queue.
4. **Security/compliance in regulated companies.** The SLSA/attestation framing ("did required controls actually apply to this artifact") maps naturally; they already pay per active committer for GitHub Advanced Security, and per contributing developer for Snyk and StepSecurity. Buying cycle: quarters, with SOC 2 / data-handling questionnaires. They are the best long-term ACV but the worst fit for a no-card 7-day trial.
5. **OSS maintainers.** Strongest documented pain (17M agent PRs/month; "AI slop"), but near-zero willingness to pay; every comparable tool is free for public repos (CodeRabbit, Mergify, Codecov, Harden-Runner Community, Allstar). Value is distribution and credibility, not revenue.
6. **Agencies.** No direct evidence found; theory only.

**Evidence of what they already pay (fetched from GitHub Marketplace unless noted):**

- CodeRabbit: Pro $30/seat/mo, Pro Plus $60/seat/mo, free for OSS, 14-day trial. (https://github.com/marketplace/coderabbitai)
- Codecov: Umbrella $12/user/mo, 14-day trial, free for public repos. (https://github.com/marketplace/codecov)
- Mergify: free for public repos on Marketplace; $21/user/mo elsewhere, billing only "active contributors" (opened a PR or pushed commits to one in the last 30 days), free for up to 5 users on private repos. (https://github.com/marketplace/mergify; https://docs.mergify.com/billing/) [Marketplace fetched; billing rule search summary]
- Aviator: Marketplace listing is free-to-install; site pricing reported as free under 15 developers then per active developer, ~$12-$40/dev/mo by tier. (https://github.com/marketplace/mergequeue; https://www.aviator.co/pricing) [search summary for prices]
- Kodiak: free, per-repository install. (https://github.com/marketplace/kodiakhq)

**Buying-cycle signal.** Every self-serve comparable uses a 14-day trial (CodeRabbit, Codecov). Merge-Proof's 7 days from first successful proof is shorter than the norm; the "starts at first proof" clock is a good design, but 7 days may be too short for a tool whose value is *the absence of an event* (see Part 3 on badge blindness).

### 1c. Do buyers understand "failed" vs "not proven"?

Direct evidence about three-state signals in merge tooling is thin; analogues are informative.

- **Nagios UNKNOWN.** Nagios has OK/WARNING/CRITICAL/UNKNOWN; UNKNOWN means "the check itself could not run" (bad args, plugin crash). Support-forum and mailing-list threads show recurring confusion because status is derived from the exit code while the human-readable "status info" text may say something else, producing conflicting displays; users struggle to tell misconfiguration from a real data problem. A nagioscore issue (#550) reports notifications firing on UNKNOWN→OK transitions, i.e. even the tool treats UNKNOWN as a state worth alerting on. (https://support.nagios.com/forum/viewtopic.php?t=57640; https://github.com/NagiosEnterprises/nagioscore/issues/550) [search summary]. Lesson: a third state works only if its *cause* is one click away and its transitions are not noisy.
- **Sigstore/cosign.** The generic "no matching signatures" error conflates missing signature, wrong key, expired cert, offline verification errors, and transient KMS failures; multiple issues (#2915, #3719, #4024, #4207) show users unable to tell "unsigned" from "verification failed." (https://github.com/sigstore/cosign/issues/2915 and related) [search summary]. Lesson: NOT_PROVEN must enumerate *what* evidence is missing, or it collapses into "broken" in users' minds.
- **Chrome lock icon.** Chrome removed the padlock in Chrome 117 (Sept 2023) after a 2021 study found only ~11% of participants correctly understood its meaning, and many read it as "trustworthy site" rather than "encrypted connection." (https://blog.chromium.org/2023/05/an-update-on-lock-icon.html) [unverified today; prior knowledge]. Lesson: a positive indicator that is always present becomes semantically inflated ("green means safe") and eventually ignored; Chrome's move was toward *neutral by default, warn on exception*, which is exactly the "disappear when green" posture under consideration.
- **GitHub's own merge box.** In the improved-merge-experience feedback thread (fetched), users objected that the *red* indicator for "awaiting review" reads as failure: "red implies that action from author is required, but waiting for review is not an action for the author." (https://github.com/orgs/community/discussions/143787). This is direct evidence that GitHub users distinguish "blocked by missing input" from "failed" and resent conflation. It supports having NOT_PROVEN be visually distinct (amber/gray) from FAIL (red).
- **Test frameworks.** JUnit/pytest "skipped"/"inconclusive" states are widely understood by developers as "no verdict," distinct from "failed." [unverified today; general knowledge]

Net: developers already carry a three-state mental model (pass / fail / no-verdict) from tests and monitoring. The failure modes are (1) conflating no-verdict with failure via color, and (2) no-verdict without a stated cause. The Proof Beacon's "attention" vs "stale" vs "gray" mapping needs a strict rule: **FAIL is the only red**; NOT_PROVEN is never red.

---

## Part 2 — Pricing

### Benchmarks (per developer/user/seat per month)

| Tool | Price | Billing unit | Free / OSS | Trial | Source |
|---|---|---|---|---|---|
| CodeRabbit | $30 Pro / $60 Pro Plus (Marketplace); $24 annual reported | seat; third-party reports say only developers who author PRs count | Free for OSS | 14 days | Marketplace (fetched); costbench [search summary] |
| Greptile | $30/seat incl. 50 review credits; $1/credit overage (since March 2026) | seat + usage | Free tier | — | https://www.greptile.com/pricing [search summary] |
| Qodo | Teams $30/user annual, $38 monthly; 2026 restructure: $30/mo base up to 30 users + credit packs | user then pooled credits | Free tier | — | https://docs.qodo.ai/pricing-and-usage [search summary] |
| Cursor Bugbot | Was $40/seat; moved to usage-based ~$1-1.50/run (May 2026) | run | — | — | https://cursor.com/blog/may-2026-bugbot-changes [search summary] |
| Mergify | $21/user | active contributor (PR opened or commits pushed, last 30 days) | Free for public repos; free ≤5 users private | — | Marketplace (fetched); docs [search summary] |
| Graphite | ~$20/user; ~$40 with merge queue | user | Free tier | — | Mergify comparison page [search summary] |
| Aviator | free <15 devs; $12-$40/dev by tier | active developer | Free tier | — | [search summary] |
| Trunk | not published; sells merge queue and flaky tests separately | — | — | — | [search summary] |
| Codecov | $12/user (Marketplace Umbrella); $4-5/user Team ≤10 users on site | user with private-repo report access | Free for public repos | 14 days | Marketplace (fetched) |
| Snyk | $25/contributing developer (Team) | committed to a private monitored repo in last 90 days; public repos not counted | Free tier | — | https://docs.snyk.io/... [search summary] |
| Socket | $25/dev Team, $50/dev Business | developer | Unlimited free for OSS | — | https://socket.dev/pricing [search summary] |
| GitGuardian | $18/active developer above 25 devs | active developer | Free <25 devs | — | https://www.gitguardian.com/pricing [search summary] |
| StepSecurity Harden-Runner | Enterprise, priced per contributing developer (last 90 days); amount not published | contributing developer | Community free for public repos on GitHub-hosted runners; self-hosted runners require Enterprise even for public repos | — | Marketplace (fetched); site [search summary] |
| GitHub Advanced Security | Code Security and Secret Protection sold separately (per-committer list price not on the fetched page) | active committer: a commit *pushed* within last 90 days, counted once across the org | — | — | github/docs billing page (fetched) |
| Kodiak | Free | per repo | Free | — | Marketplace (fetched) |
| Allstar (OpenSSF) | Free, self-hosted; OpenSSF-hosted app retired | per org | Free | — | https://github.com/ossf/allstar (fetched) |
| Dependabot | Free | per repo | Free | — | [general knowledge] |
| Bors | Free/self-hosted, deprecated in favor of merge queues | per org | Free | — | [general knowledge] |

Not benchmarked due to search budget: Sonar, Linear, Sentry per-event, Datadog CI Visibility. Prior knowledge (unverified today): Sonar Team ~$32/mo tiered by lines of code, not seats; Linear $8-14/user; Sentry per-event/volume; Datadog CI Visibility per committer (~$8/committer/mo for pipeline visibility, test visibility priced separately). The Datadog "per committer" unit is relevant: it is the closest infra-observability precedent to observed-active-developer billing.

### The "observed active developer" precedent

GitHub Advanced Security's "active committer" (fetched wording: "A committer is considered active if one of their commits has been pushed to the repository within the last 90 days, regardless of when it was originally authored," counted once across the org) is the canonical precedent. Snyk (90 days, private repos only), StepSecurity (90 days), Mergify (30 days, PR or push), and GitGuardian ("active developer") all use the same idea. Buyers at 50+ developers already understand it; it is now a normal unit.

Two design details from the precedents matter for Merge-Proof:

1. **Window length.** GHAS/Snyk/StepSecurity use 90 days; Mergify uses 30. A 90-day window over-counts departed contributors and contractors; 30 days matches billing cycles and is easier to audit. For a monthly $29 price, a 30-day observed window is more defensible.
2. **What counts as "observed."** Merge-Proof's natural unit is "author of a PR candidate that Merge-Proof evaluated in the period." That is narrower than "pushed a commit" and closer to CodeRabbit's reported "developers who create PRs." Bots and agent identities must be excluded or explicitly priced, otherwise agent-heavy teams (the target market) see inflated bills. Evidence of the backlash: Cursor Bugbot's original $40/seat model was criticized for billing "$40 per unique open source contributor," and Cursor moved to per-run pricing in May 2026 with the stated rationale that seat pricing breaks when an agent does variable work per user. (https://stacker.news/items/1195586; https://x.com/marty_kausas/status/2057140155215921525) [search summary; community]. Greptile's move from flat $30 to $30 + $1/review was labeled "predatory" by at least one public site. (https://greptile-fail.vercel.app/) [search summary; community]. Lesson: per-seat with a clear, capped, bot-excluded definition is *safer* than usage for a passive tool, because usage pricing on a tool the buyer did not actively invoke feels like a tax.

### Buyer resistance to per-seat for a passive tool

Passive/"insurance-like" tools that succeed on per-developer pricing (Snyk, GitGuardian, StepSecurity, GHAS) share three traits: (a) a security/compliance budget owner, (b) a free tier that generates internal champions, and (c) a threshold below which it is free (GitGuardian <25 devs, Aviator <15 devs, Mergify ≤5 users). Tools that are purely passive *and* lack a compliance buyer end up free (Allstar, Kodiak, Dependabot, Codecov at $4-12).

Codecov is the closest analogue in posture (a status check that is usually green and only occasionally blocks) and it sits at $4-12/user, not $29. Snyk/Socket/GitGuardian sit at $18-25 because they carry a security budget line. CodeRabbit/Greptile/Qodo sit at $30 because they produce visible work product on every PR.

**Is $29/observed active developer plausible?** For the AI-native small team buying with an engineering card: it is at the top of the plausible band and 2.4x Codecov; it will be compared to CodeRabbit ($30), which does visible work on every PR. For a platform/security buyer: $29 is in the Snyk/Socket band and defensible *if* Merge-Proof is positioned as a control (evidence that approvals, checks, and rulesets applied to the merged SHA) with an exportable receipt, because that is what a compliance buyer pays $18-25 for. Recommendation: keep $29 as list, but add (1) a free tier below ~5 observed active developers or for public repos, (2) explicit bot/agent-identity exclusion from the count, (3) a 30-day observed window, and (4) a per-org cap for small teams (e.g. "never more than $145/mo under 10 devs") to blunt the "passive tool tax" objection. Consider that the 7-day trial from first proof is shorter than the 14-day norm and that value accrues on the *first NOT_PROVEN/STALE catch*, not on time; a trial that ends at "7 days or first non-green verdict inspected, whichever is later" would match how value is actually experienced.

---

## Part 3 — Product surface

Design goal: glance → understand → act → inspect, with the indicator nearly invisible when everything is VERIFIED/CURRENT.

### 3.1 GitHub Checks / status checks UI

**What an App can render (fetched, github/docs "building CI checks with a GitHub App"):** a check run has `title`, `summary`, optional `text` (Markdown, 65,535-byte limit per community reports), up to 50 annotations per API call (display capped at 10 warnings + 10 errors per step in Actions UI), `images`, and **up to three action buttons** (`label`, `description`, `identifier`) that fire a `requested_action` webhook back to the App. Conclusions are success/failure/neutral/cancelled/skipped/timed_out/action_required. Users can re-request a check run from the UI.

**How the 2025-2026 merge box changes it.** The improved merge experience (GA 2025-03-04; further "quick access to merge status anywhere in pull requests" preview 2026-02/03) now pins merge readiness at the top of every PR page, groups checks by state with failures first, and **collapses successful checks by default**. Community feedback (fetched): "I really dislike that the passed checks are hidden... seeing a blank/empty box here is an internal red flag for me, whereas if all is well I expect to see a line-up of green checkmarks," and a bug where "once all checks have passed, they all disappear." (https://github.com/orgs/community/discussions/143787; https://github.com/orgs/community/discussions/188033)

Implications:
- **GitHub already implements "disappear when green" for checks.** A green Merge-Proof check is now one collapsed line among many. That is fine for the "mostly disappears" goal; it also means green gives Merge-Proof essentially zero brand presence.
- **Non-green is exactly where checks shine.** A `neutral` or `action_required` conclusion is surfaced above the fold, in the merge box, on the Files Changed page, and in the new top-of-page merge status. This is the highest-visibility surface Merge-Proof can get without a browser extension, and it is free.
- **Mapping verdicts to conclusions matters.** VERIFIED → `success`. FAIL → `failure` (blocks merge if required). NOT_PROVEN → `action_required` or `neutral`. `action_required` shows a "Details" affordance and the check's actions; `neutral` reads as gray. Given the "red means action for the author" complaint, use `action_required` for STALE (there *is* an author action: re-run/re-approve) and `neutral` for NOT_PROVEN when the missing evidence is not the author's to supply.
- **Action buttons are the "act" step.** Three buttons: "Re-check now", "Why not proven?", "Open receipt". They are rendered on the check details page, not in the merge box, so "act" is one click deeper than "glance."
- **Erosion risk: high.** GitHub is actively redesigning this area; the top-of-page merge status is GitHub's own "merge readiness" light. GitHub has the data to add "approval applies to latest push" or "checks ran on merge group" indicators natively (it already dismisses Copilot approvals on new pushes). Merge-Proof's differentiation on this surface is the *cross-check* (did the ruleset apply, was bypass used, is the queue check the one that ran on the merge group) and the *receipt*, not the light itself.
- **Limit to note:** GitHub displays checks per head SHA; a check posted for the merge-group SHA appears on the merge-queue's temporary branch, not on the PR page, which is precisely the confusion community discussion #46757 documents. Merge-Proof should post its verdict on the PR head *about* the merge-group evidence, and say so in the summary.

### 3.2 Other GitHub App surfaces

- **Sticky PR comment (updated in place).** Used by Vercel, Codecov, and CodeRabbit. Highest legibility (Markdown tables, links), but it is noise on every PR when green and the community's "AI slop" fatigue applies to bot comments generally. Use only for non-green verdicts, or not at all; a comment that appears only when STALE/NOT_PROVEN is a reasonable escalation channel. [Vercel behavior: unverified today]
- **Commit statuses.** Four states (error/failure/pending/success), context, description, target_url (fetched). No `neutral`, no actions, no Markdown. Inferior to check runs for a three-state verdict; useful only for third-party CI compatibility.
- **Deployments API / environments.** Wrong semantics; skip.
- **"Custom UI."** GitHub Apps have no custom panels in the PR UI. The only App-rendered surfaces are check runs, comments, statuses, and Marketplace. This is why GitHub-native "custom UI" tools (Graphite, Sourcegraph) all shipped browser extensions.
- **Marketplace listing.** Discovery and pricing display only (CodeRabbit and Codecov show plans and 14-day trial inline). Required for credibility; not a runtime surface.

### 3.3 Browser extension injecting into github.com

**Feasibility:** proven pattern (Refined GitHub: 100+ features, Chrome/Firefox/Safari including iOS; Graphite, Sourcegraph, Octotree). A one-feature extension that reads the PR head SHA from the DOM and calls Merge-Proof's API to draw a light next to the merge box is a few hundred lines.

**Costs:**
- **DOM churn.** GitHub is mid-redesign of exactly the area (merge box, Files Changed) the beacon would attach to; Refined GitHub's own history is a stream of "feature X broken by GitHub change" fixes. Expect monthly maintenance.
- **Enterprise policy.** Chrome's `ExtensionInstallBlocklist` with `*` blocks all extensions except an allowlist; this is common in regulated companies (the segment with the best ACV). (https://chromeenterprise.google/policies/extension-install-blocklist/) [search summary]. The extension would be *unavailable* to the compliance buyer and available to the small-team buyer who is least willing to pay.
- **Store friction.** Chrome Web Store review, Safari requires a signed Mac App Store wrapper, Firefox AMO review. Manageable but nonzero.
- **Trust asymmetry.** A tool whose pitch is "we don't overclaim" asking for `github.com` host permissions on every page is a mixed signal.

Verdict: do **not** make the extension the primary surface. It is a good *second* surface for solo/small-team users who want the light in the merge box, and it can be community-maintained.

### 3.4 IDE status bar (VS Code / JetBrains)

VS Code `StatusBarItem` supports text with codicons, Markdown tooltip, a click command, and background color restricted to `statusBarItem.warningBackground` / `errorBackground` (so exactly the amber/red escalation needed; no green background exists, which enforces "disappear when green" by API design). The GitHub Pull Requests extension exposes the current PR; a Merge-Proof extension could show a dot only when the checked-out branch has an open PR whose verdict is non-green. [unverified today; prior knowledge of the API]

Behavioral fit: glance is excellent (the status bar is always visible), understand is one hover (tooltip), act is one click (command to re-check or open receipt), inspect opens the web viewer. The cost is another install and it only covers the person with the branch checked out, not the reviewer or the platform owner. Good third surface; strongest for the solo/agent-heavy developer who lives in the IDE while agents open PRs.

### 3.5 macOS menu bar / desktop light

CCMenu (App Store; GitHub Actions support via token/OAuth; fetched README) and several xbar/actionMonitor clones exist. Adoption is niche: they serve people watching *their own* pipelines. A Merge-Proof menu-bar light would need to aggregate across repos and only turn non-green on STALE/NOT_PROVEN/FAIL. This is the physical "build light" tradition (lava lamps, traffic lights) whose success condition is a *shared* space where red is socially visible; on a personal menu bar, it competes with dozens of icons. Low priority; a later "team light" for a wall display is more on-brand than a personal one.

### 3.6 CLI (`gh merge-proof`)

`gh extension create --precompiled=other` and `cli/gh-extension-precompile` make distribution trivial (`gh extension install owner/repo`, multi-platform binaries via Releases; fetched README). A `gh merge-proof status [PR]` that prints verdict/why/next/receipt URL is cheap, works in every enterprise (no extension policy issue), scripts into agent workflows (agents can be told "do not merge unless `gh merge-proof status` is VERIFIED"), and is the most honest surface for a "refuses to overclaim" product because output is text. Must-have.

### 3.7 Slack/Teams

Alert-fatigue evidence was not retrievable this session (search budget). The structural argument holds without it: a passive integrity tool that posts on every PR is noise; one that posts only on transitions to STALE/NOT_PROVEN/FAIL on protected branches, throttled per PR, is a reasonable escalation channel for the platform-owner persona. Optional, off by default.

### 3.8 Badges and receipt permalinks

README badges are an OSS distribution channel (Codecov's coverage badge is the model) but they suffer from exactly the "always green, therefore ignored" problem; the merge-box feedback ("I expect to see a line-up of green checkmarks") shows some users *want* the reassurance while others treat it as furniture. A badge showing "last 30 days: N merges, N proven" is more informative than a binary light. The **receipt permalink** is the real asset: an immutable page per (repo, PR, SHA) with verdict, evidence list, freshness at the time, and what would change the conclusion. It is what a compliance buyer will paste into an audit ticket and what makes NOT_PROVEN legible (Sigstore lesson). It should exist regardless of which light is chosen.

### 3.9 Analogies: what made them adopted, what fails

- **Smoke detector / check-engine light:** silent by default, unmistakable when not; works because there is a single owner (driver) and a single next action ("go to a mechanic"). Fails when it chirps for low battery (false positives train people to pull the battery). Merge-Proof's equivalent of the chirp is STALE on a PR nobody intends to merge yet; STALE must be quiet until merge is attempted or auto-merge is armed.
- **TLS padlock:** always-on positive indicator became semantically inflated and was removed; browsers moved to neutral-by-default with warnings on exception. Supports the "disappear when green" thesis directly.
- **Build lights / lava lamps:** adopted where the light is shared and social; fail in personal contexts.
- **Nagios UNKNOWN:** a third state survives only with a visible cause and non-noisy transitions.
- **Vercel/Netlify deploy status in PRs:** adopted because the status carries a *link to something the reviewer wants anyway* (the preview). The lesson: attach the light to something people already click (the merge box / Details link / receipt), not to a new destination.
- **Merge-box collapsing checks:** GitHub's own evidence that some users read "nothing shown" as "something's wrong." The beacon should have a *tiny* explicit green state on the check line ("Proven for a1b2c3d, 4 min ago") rather than literally nothing, while staying collapsed.

### Recommendation

**Smallest combination:** (1) a GitHub Check Run as the beacon, (2) a hosted compact proof viewer reachable from the check's Details link and action buttons, (3) an immutable receipt permalink, and (4) a `gh merge-proof` extension. Ship the browser extension and VS Code status-bar item only after those four are stable and only if trial users ask for the light "in the merge box."

Mapping:
- **Glance:** check-run conclusion in the merge box / top-of-page merge status. VERIFIED+CURRENT → `success` with a one-line title including the SHA prefix and age. STALE → `action_required` ("Proof is for a1b2c3d; head is now e4f5g6h"). NOT_PROVEN → `neutral` with the missing-evidence list in the title. FAIL → `failure`. Gray/checking → `in_progress` / `queued`.
- **Understand:** the check's `summary` is the compact viewer's first screen (verdict, why, what changed, next action, freshness); no second product needed for 80% of cases.
- **Act:** the three check-run action buttons: "Re-check now", "Request fresh approval/CI" (opens the PR with the correct next step), "Open receipt". `gh merge-proof status` for agents and terminals.
- **Inspect:** receipt permalink with the full evidence set and "what would change this."

Risks, honestly:
- **GitHub erosion is the main risk.** The merge box is now GitHub's own readiness light, and GitHub already knows whether approvals are stale and whether checks ran on the merge group. Expect GitHub to close the "approval applies to latest push" gap by default over time. Merge-Proof's durable value is the independent, exportable receipt and the ruleset/bypass audit, not the light. Price and message accordingly.
- **Check-run visibility when green is near zero.** That is by design, but it starves the 7-day trial of "moments of value" if the team's PRs are all VERIFIED. The trial should surface a weekly digest or a "what we checked" count so the buyer sees work being done; otherwise cancellation at day 7 is rational.
- **STALE noise.** If STALE fires on every push while a PR is in progress, users will learn to ignore it (smoke-detector chirp). Evaluate freshness at merge intent (auto-merge armed, queue entry, merge button hover is not observable, so use ready-for-review + approvals present as the trigger).
- **Color semantics.** Never render NOT_PROVEN in red. The community reaction to red-for-awaiting-review is the closest direct evidence available.
- **Merge-group SHA reporting.** Posting evidence about the merge-group SHA on the PR head requires a clear sentence in the summary; the merge-queue discussion shows this is already the most confusing part of GitHub's own UI.
- **Extension policy.** Any surface requiring a browser extension excludes the regulated buyer; keep the check + receipt + CLI path complete on its own.

---

## Sources

Fetched (github.com) unless marked. Dates are publication or last-observed dates.

- GitHub docs source, Copilot code review concepts (approvals do not count by default; can be enabled; dismissed on new push): https://github.com/github/docs/blob/main/content/copilot/concepts/agents/code-review.md (accessed 2026-09-19)
- GitHub docs source, about protected branches (dismiss stale approvals, most-recent-push approval, up-to-date requirement, bypass): https://github.com/github/docs/blob/main/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md (accessed 2026-09-19)
- GitHub docs source, managing a merge queue (merge_group, checks must report, status check timeout): https://github.com/github/docs/blob/main/content/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue.md (accessed 2026-09-19)
- GitHub docs source, building CI checks with a GitHub App (output fields, 50 annotations, three action buttons, requested_action): https://github.com/github/docs/blob/main/content/apps/creating-github-apps/writing-code-for-a-github-app/building-ci-checks-with-a-github-app.md (accessed 2026-09-19)
- GitHub docs source, commit statuses: https://github.com/github/docs/blob/main/content/rest/commits/statuses.md (accessed 2026-09-19)
- GitHub docs source, GHAS billing (active committer definition): https://github.com/github/docs/blob/main/content/billing/concepts/product-billing/github-advanced-security.md (accessed 2026-09-19)
- GitHub community, improved PR merge experience feedback (collapsed checks, red-for-awaiting-review): https://github.com/orgs/community/discussions/143787 (2024-11 to 2025-03)
- GitHub community, quick access to merge status preview: https://github.com/orgs/community/discussions/188033 (2026-02-25)
- GitHub community, merge queue beta feedback: https://github.com/orgs/community/discussions/46757 (2023 onward)
- GitHub community, Copilot conversations index (unanswered approval questions 2025-09-02, 2026-09-04): https://github.com/orgs/community/discussions/categories/copilot-conversations
- GitHub community, annotation limitation: https://github.com/orgs/community/discussions/26680
- fullsend-ai/fullsend#7440, stale-approval force-push merge: https://github.com/fullsend-ai/fullsend/issues/7440 (2026)
- protoLabsAI/release-tools#65, branch protection silently reverted: https://github.com/protoLabsAI/release-tools/issues/65 (2026-09-14)
- anthony-chaudhary/fak#11460, concurrent landing broke trunk [search summary]: https://github.com/anthony-chaudhary/fak/issues/11460 (2026)
- uber/submitqueue README: https://github.com/uber/submitqueue (accessed 2026-09-19)
- Uber blog, Bypassing Large Diffs in SubmitQueue [search summary]: https://www.uber.com/us/en/blog/bypassing-large-diffs-in-submitqueue/
- Graphite, Bors and Google TAP history [search summary]: https://graphite.com/blog/bors-google-tap-merge-queue
- HN thread on TAP presubmit race [search summary]: https://news.ycombinator.com/item?id=21586079
- ccmenu/ccmenu2 README: https://github.com/ccmenu/ccmenu2
- refined-github README: https://github.com/refined-github/refined-github
- cli/gh-extension-precompile README: https://github.com/cli/gh-extension-precompile
- ossf/allstar README: https://github.com/ossf/allstar
- Marketplace listings (fetched 2026-09-19): CodeRabbit https://github.com/marketplace/coderabbitai; Mergify https://github.com/marketplace/mergify; Codecov https://github.com/marketplace/codecov; Kodiak https://github.com/marketplace/kodiakhq; Aviator https://github.com/marketplace/mergequeue; Harden-Runner https://github.com/marketplace/actions/harden-runner
- DORA 2025 report [search summary]: https://dora.dev/dora-report-2025/ (2025-09)
- Stack Overflow 2025 Developer Survey, AI section [search summary]: https://survey.stackoverflow.co/2025/ai (2025-07); press release https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/
- METR, early-2025 AI and experienced OSS developers [search summary]: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ (2025-07-10)
- GitClear 2025 AI Copilot Code Quality [search summary]: https://www.gitclear.com/ai_assistant_code_quality_2025_research (2025-02)
- Faros AI Productivity Paradox [search summary]: https://www.faros.ai/blog/ai-software-engineering (2025)
- LinearB 2026 Software Engineering Benchmarks [search summary]: https://linearb.io/resources/software-engineering-benchmarks-report (2026)
- The New Stack, AI-generated code crisis [search summary; press]: https://thenewstack.io/ai-generated-code-crisis/ (2026)
- bex.co, 17 Million Robot PRs a Month [search summary; blog]: https://bex.co/blog/2026/09/08/ai-coding-agents-open-source-maintainership (2026-09-08)
- Help Net Security, small teams heaviest users of AI coding agents [search summary]: https://www.helpnetsecurity.com/2026/07/22/users-of-ai-coding-agents/ (2026-07-22)
- DEV Community, Copilot can now approve PRs [search summary; community]: https://dev.to/pwd9000/copilot-can-now-approve-pull-requests-should-it-count-toward-your-branch-protection-2b78 (2026-09)
- Mergify billing docs [search summary]: https://docs.mergify.com/billing/; Mergify comparison pages https://mergify.com/compare/graphite, https://mergify.com/compare/trunk, https://mergify.com/compare/aviator
- Greptile pricing [search summary]: https://www.greptile.com/pricing; criticism site https://greptile-fail.vercel.app/ (2026)
- Qodo pricing [search summary]: https://docs.qodo.ai/pricing-and-usage
- Cursor Bugbot changes [search summary]: https://cursor.com/blog/may-2026-bugbot-changes (2026-05); stacker.news complaint https://stacker.news/items/1195586; X post https://x.com/marty_kausas/status/2057140155215921525
- Snyk usage settings, contributing developer [search summary]: https://docs.snyk.io/platform-administration/snyk-hierarchy/usage-settings
- Socket pricing [search summary]: https://socket.dev/pricing
- GitGuardian pricing [search summary]: https://www.gitguardian.com/pricing
- StepSecurity pricing [search summary]: https://www.stepsecurity.io/pricing
- Aviator pricing [search summary]: https://www.aviator.co/pricing
- Chrome Enterprise ExtensionInstallBlocklist [search summary]: https://chromeenterprise.google/policies/extension-install-blocklist/
- Nagios UNKNOWN confusion [search summary]: https://support.nagios.com/forum/viewtopic.php?t=57640; https://github.com/NagiosEnterprises/nagioscore/issues/550
- Sigstore cosign "no matching signatures" issues [search summary]: https://github.com/sigstore/cosign/issues/2915, /3719, /4024, /4207
- Chromium blog, lock icon update [unverified today]: https://blog.chromium.org/2023/05/an-update-on-lock-icon.html (2023-05)
