# 05 — Adjacent Vendors: Who Replaces, Commoditizes, Strengthens, or Feeds Merge-Proof

Research date: 2026-09-19. Analyst: Claude (research subagent).

## Method and evidence-quality caveat

The research proxy in this session blocked direct fetches of nearly every vendor domain (mergify.com, graphite.com, aviator.co, trunk.io, help.vanta.com, help.drata.com, kosli.com, chainloop.dev, legitsecurity.com, docs.github.com, github.blog, and others returned `EGRESS_BLOCKED`). Only github.com repository/marketplace pages could be fetched directly. Everything else below comes from search-engine result snippets of the vendor's own pages (marked **primary/snippet** in Sources) or from third-party coverage (marked **third-party**). Where a number rests only on third-party pricing aggregators, it is flagged. Before any of these figures go into a pricing page or a competitive deck, the specific vendor page should be re-fetched from an unblocked environment.

Classification key used throughout:

- **(1) REPLACES** — a buyer could reasonably choose it instead of Merge-Proof for the same job.
- **(2) COMMODITIZES PART** — it does a subset of Merge-Proof's checks well enough to reduce willingness to pay for that subset.
- **(3) STRENGTHENS NEED** — its existence or trajectory makes the question "was this exact candidate actually verified?" more urgent.
- **(4) INTEGRATION OPPORTUNITY** — Merge-Proof could consume its signals or supply a verdict to it.
- **(5) DOES NOT MATERIALLY MATTER** — adjacent in name only.

Merge-Proof's job, restated, so the classifications have a fixed reference: given the exact candidate (head / base / merge-group SHA), independently determine whether CI actually executed on that SHA, whether approvals apply to the current head, whether protections/rulesets applied or were bypassed, and whether the evidence is still fresh (CURRENT/STALE) — and emit VERIFIED / NOT_PROVEN / FAIL without claiming more than the evidence shows.

---

## Executive read

1. **Nobody in the four groups sells the same thing.** No vendor found markets "independent, SHA-exact, evidence-bounded verdict on whether the merge candidate was actually proven." The closest analog is an open-source project with a colliding name (`Aryamanz29/mergeproof`, MIT, v1.0.2 on 2026-09-15) that gates PRs on a policy file of evidence requirements — but it runs as a policy *gate the repo author configures*, not an independent verifier of GitHub's own state, and it has 1 star.
2. **The merge-queue vendors (Mergify, Graphite, Aviator, Trunk) commoditize the "is CI green on the thing we're merging" half** because a queue's entire purpose is to run CI on the exact merge candidate. They do not produce a retrospective, bypass-aware, approval-freshness verdict, and they are $20–$40/seat, above Merge-Proof.
3. **GitHub itself is moving toward Merge-Proof's territory in the observability layer** — Rule Insights went GA at repo level (2026-08-25) and org-level public preview (2026-08-12), with per-PR merge-queue records, bypass-activity auditing, and a new "exempt" bypass type that *silently skips enforcement*. That last feature is simultaneously a commoditization risk (GitHub now surfaces bypasses) and the strongest argument for an independent verifier (silent exemptions are exactly what an auditor would want a third party to catch).
4. **Compliance-automation platforms (Vanta, Drata, Secureframe, Sprinto) are the most important adjacent category.** They already run per-PR tests ("GitHub code changes were approved or provided justification for exception" at Vanta; "Test 8: Formal Code Review Process" at Drata) but, as far as the public docs show, they check *approved by someone other than the author* and *branch-protection/ruleset configuration*. None of the public docs describe head-SHA binding of approvals, CI-executed-on-this-SHA checks, or bypass/exemption detection. That is a gap Merge-Proof fills, which makes them **integration targets and evidence consumers, not competitors**, and their $10k–$80k/yr contracts mean a $29/dev add-on is not price-threatening to them.
5. **AI PR reviewers (Group 2) strengthen the need** rather than compete: every one of them adds another non-deterministic signal to the PR, several have moved to usage billing (Cursor Bugbot, Greptile per-review, Qodo credits, Copilot AI Credits), and Codacy's own positioning ("why most AI review tools can't safely block a merge") concedes the gap. None claims exact-SHA verification or approval-freshness.
6. **Pricing benchmark:** the $12–$30/dev/month band is crowded — CodeRabbit $24–30, Greptile $30 (+$1/review over 50), Baz $30, Ellipsis $20, Codacy $18–21, Snyk $25, Socket $25, Datadog Code Security $25, Cycode ~$30 (AWS Marketplace), Buildkite $30, Semgrep $30–35. Merge-Proof's $29 sits at the top of the band but bundles a *narrower, deterministic* thing than any of them. Its active-developer metering (charged only on observed active developers, trial starting at first successful proof) is closest to CodeRabbit ("only developers who open PRs") and Mergify ("active contributor in 30-day sliding window").

---

## Group 1 — Merge queue / PR workflow / stacking (most effort)

### Mergify — **(2) COMMODITIZES PART + (4) INTEGRATION**
- What it does: Merge Queue, **Merge Protections** (a single "Mergify Merge Protections" check run on every PR whose pass/fail is determined by rules — title patterns, labels, CI signals, file changes, authorship, PR dependencies, merge freezes/schedules), CI Insights, Test Insights (flaky detection/quarantine), Stacks, and a CLI. Docs describe "branch_protection_injection_mode" — Mergify reads every branch protection and ruleset applying to the target branch and turns supported rules into merge conditions; a 2025-11-20 changelog added an `exempt` bypass-actor mode to skip that injection.
- Pricing: free for OSS and for private teams up to 5 active contributors; paid "starts at $21/user/month" with all five products in every plan; "active contributor" = anyone who opens a PR or pushes commits to one in a 30-day sliding window, prorated daily. (Vendor pricing page via snippet.)
- Evidence for classification: Merge Protections is a *pre-merge policy gate that the repo owner configures*; it evaluates conditions on live PR state. It does not produce an independent post-hoc verdict on whether checks ran on the exact head SHA or whether a ruleset was bypassed after the fact. Because it can run in an "exempt" bypass mode, it is itself a bypass actor that Merge-Proof should detect and report. Closest feature overlap of any vendor in Group 1.
- Note: no product called "Mergify Shield" surfaced in search; treat as non-existent or unannounced.

### Graphite — **(2) COMMODITIZES PART (queue CI) / (5) otherwise**
- What it does: stacked PRs, merge queue (basic in Hobby/Starter/Team; advanced in Enterprise), **Graphite Agent** (AI review; the "Diamond" name was retired in October 2025 and folded into Graphite Agent), "Graphite Protections" (custom code-ownership and branch-protection-like rules, per a graphite.dev blog post whose date could not be confirmed).
- Pricing: Free (Hobby), $20/seat Starter, $40/seat Team (unlimited AI reviews), Enterprise custom; annual billing 20% off; new plans effective 2026-01-08. $52M Series B (Accel; Anthropic participated).
- Evidence: Graphite's docs explicitly say that with GitHub's "dismiss stale approvals on new commits" rule enabled you *cannot* merge a stack via the Graphite UI and must work around it — i.e., Graphite's workflow is in tension with approval freshness, which is exactly the thing Merge-Proof reports. Graphite does not market verification or evidence.

### Aviator — **(2) COMMODITIZES PART + (4) INTEGRATION**
- What it does: MergeQueue, **FlexReview** (custom ownership rules; a FlexReview *Validation* status check that turns green when the required approvals are met; "smart dismissal of approvals based on the modifications in a given commit"; SLO-based auto-dismissal of owner requirements), Releases, StackedPRs, AI review.
- Pricing: per product, billed on active collaborators (defined per product: e.g., MergeQueue counts collaborators who created a PR and used Aviator on it); free for teams under 15. Third-party figures conflict: Mergify's compare page says "starts at $12/user/month"; Trunk's compare page says Team $20/dev and Scale $40/dev. Treat the vendor page as unverified.
- Evidence: FlexReview's per-commit approval dismissal is the nearest thing in Group 1 to "approval applies to the current head." It is, however, a review-*routing* product that emits its own status check, so it becomes one more check Merge-Proof would verify ran on the head SHA. The SLO feature that *auto-dismisses* reviewer requirements when reviews are slow is precisely a policy-relaxation event a verifier should surface.

### Trunk — **(2) COMMODITIZES PART (queue CI) / (5)**
- What it does: flake-aware parallel merge queue with batching and bisection; Flaky Tests detection/quarantine; "CI platform" positioning; $25M raise.
- Pricing: free tier includes full merge queue (parallel mode) for teams up to 5 committers; paid is per-seat plus usage that scales with CI workload (docs.trunk.io/billing via snippet). Per-seat amount not surfaced.
- Evidence: Trunk's value is keeping main green and CI cheap; it quarantines flaky tests — which means a "green" queue run may have had tests deliberately excluded. That is a freshness/evidence nuance Merge-Proof could expose (which checks were quarantined for this SHA) rather than compete on.

### GitHub native merge queue + Rulesets + Rule Insights — **(2) COMMODITIZES PART + (3) STRENGTHENS**
- Availability: merge queue is available for public org repos and for private repos on GitHub Enterprise Cloud (docs snippet); merge queue configuration inside rulesets went public beta 2024-02-27.
- 2026 changes: Rule Insights dashboard GA at repo level (changelog 2026-08-25) and org level in public preview (2026-08-12). It shows each PR in a merge queue as an individual record linked to the actor who enqueued it, includes the checks needed for the queue, and lets orgs "identify top repositories by bypasses" and filter by evaluation status/branch/ruleset/date. Rulesets gained an **exempt** bypass type (2025-09-10 changelog) that "silently skips enforcement," unlike a standard bypass which is recorded. Enabling merge queue in a ruleset removes the merge-queue bypass option from the UI. A 2026 community discussion (#190610) reports an undocumented behavior change: auto-merge now returns HTTP 422 unless all PR requirements are already met.
- Actions pricing: hosted-runner price cuts (up to 39%) took effect 2026-01-01; the announced $0.002/min control-plane charge for self-hosted runners (announced 2026-03-01) was postponed indefinitely after backlash.
- Evidence: GitHub is now the incumbent source of *raw* bypass and rule-evaluation data, which commoditizes "did a bypass happen." But GitHub does not (a) bind approvals to head SHAs beyond the dismiss-stale toggle, (b) verify that a check run actually executed against the merge-group SHA rather than being re-reported, or (c) issue any verdict. Silent exemptions and Rule Insights are the raw material Merge-Proof should ingest and the reason a third-party verdict has value.

### Bors-NG / Kodiak / Rultor — **(5)**
- Bors-NG: public service deprecated in favor of GitHub merge queue; repo archived 2024-04-04. Kodiak: AGPL-3.0 auto-update/auto-merge bot, free Marketplace app, still maintained (629 commits, 54 open issues), with a known incompatibility between "require merge queue" and its automerge. Rultor: legacy NRSROSE implementer, no 2026 activity found. None produce evidence or verdicts.

### Linear — **(5)**
- GitHub integration links issues to PRs and auto-transitions state on open/merge, with conditional transitions (e.g., only close when merged to main). 2026 adds "review and merge pull requests in Linear with native diffs and guided reviews." It is a workflow surface, not a verifier; at most a place to display a Merge-Proof verdict badge.

### Shipfox — **(5)**
- Managed GitHub Actions runners, per-minute billing, "2x faster, 50% cheaper," EU-based. Relevant only insofar as any runner substitution is a place where "CI ran" can become "CI ran somewhere else on something else" — a generic argument for SHA-exact verification, not a competitor.

---

## Group 2 — AI PR review

Common finding: **none of these vendors claims exact-SHA verification, approval freshness, bypass detection, or an evidence-bounded merge verdict.** Their claims cluster around bug-catch rate, F1 score, "merge gates" tied to their own findings, and cost per review. Every one of them is a *signal producer* whose check run Merge-Proof would verify executed on the head; as a category they are **(3) STRENGTHENS NEED** and **(4) INTEGRATION** targets.

| Vendor | What it actually does | Pricing model (2026) | Verification / merge-readiness claim? | Class |
|---|---|---|---|---|
| CodeRabbit | AI PR review, IDE, CLI | $24/dev/mo annual, $30 monthly; counts only devs who open PRs; free OSS | No; review comments/summaries | (3)(4) |
| Greptile | Codebase-aware AI review, "82% bug catch" | $30/seat incl. 50 reviews, then $1/review (from March 2026); free 50 reviews/mo | No | (3)(4) |
| Qodo (Qodo Merge / PR-Agent / Qodo Gen) | Multi-agent review (Qodo 2.0, Feb 2026), PR description, test-gap detection; raised $70M in March 2026 explicitly on "code verification as AI coding scales" | Pro was $19/user; 2026 restructure to $30 base (up to 30 users) + metered credits | Markets "verification" as a *brand*, but the product is review + test-gap finding, not evidence-bounded SHA verification | (3)(4) — watch: brand collision on the word "verification" |
| PR-Agent (OSS) | Original open-source PR reviewer; `/review`, `/describe` | MIT, 13.1k stars, active, BYO-LLM | No blocking/approval mechanism | (5) |
| Sourcegraph Amp / Cody | Amp: agentic coding + "agentic code review" (credit-based); Cody Free/Pro terminated July 2025, Cody Enterprise $59/user/mo | Credits / $59 enterprise | No | (5) |
| Cursor Bugbot | PR bug finder | Moved from $40/seat to usage billing (~$1–1.50/run) at renewals after 2026-06-08 | No | (3) |
| Ellipsis | AI review | $20/dev/mo unlimited; free public repos | No | (5) |
| Sonar (SonarQube AI Code Assurance) | Project labels for AI code, "Sonar way for AI Code" quality gate, badges; "AI-generated code detection" (2026.1 LTA docs); Sonar's site now also hosts Gitar ("agentic AI code review… Gitar Native Reasoning"; Gitar plans Core $20 / Pro $40) — suggests an acquisition, unconfirmed | Per LOC (Cloud Team ~€30–32/mo at 100k LOC; free to 50k LOC) | "AI Code Verification" language but it is a quality gate on analysis results, not merge-evidence verification | (3)(4) |
| Codacy | "AI code governance": AI Guardrails (IDE), AI Reviewer with **merge gates**; blog: "Why most AI review tools can't safely block a merge" | $18/dev annual, $21 monthly; Business custom | Claims deterministic merge gates on its own findings; does not claim SHA/approval/bypass verification | (3)(4) |
| DeepSource | Static analysis + AI review credits | Team $24/user/mo (bundled AI credits) | No | (5) |
| Bito | AI review + "AI Architect" | Team $12–15/seat, Pro $20–25/seat; 5k LOC reviewed/seat included, $5 per extra 1k | No | (5) |
| Macroscope | Codebase understanding + review | Usage-based, $100 free | No | (5) |
| Baz | AI review | $30/active dev + $0.01/credit | No | (5) |
| Entelligence | AI review; publishes 2026 F1 benchmark | Custom; "cost per verified bug" | Uses "verified" for bugs, not merges | (5) |
| Gitar | Agentic review that fixes code; now on sonarsource.com | Core $20, Pro $40 | No | (5) |
| Kodus (OSS) | Model-agnostic review agent, AGPL + EE | Community free; Teams $10/dev/mo + tokens | No | (5) |
| Tessl Code Review | Reviews agent-written PRs against team "standards" stored as skills; free beta | Free (beta) | No | (5) |
| GitHub Copilot code review | Native AI review | From 2026-06-01: consumes AI Credits (model multiplier 13 under legacy premium requests) *and* Actions minutes; plans unchanged ($19 Business / $39 Enterprise) | No | (3) |
| Devin Review (Cognition) | "AI to stop slop" review UX for human or agent diffs; free preview ended, 2-week trial then usage billing; free for OSS | Usage (ACUs) | No | (3) |
| OpenAI Codex review | `@codex review`, auto-reviews, AGENTS.md rules; included in paid ChatGPT plans (Plus $20 with 20–50 reviews per 5-hour window; Pro $100); token-credit billing since April 2026 | Bundled/usage | No | (3) |

Group-2 takeaways for Merge-Proof:
- The move to usage billing (Cursor, Greptile, Qodo, Copilot) means teams will increasingly *skip* AI review on some PRs to save money. A verdict that says "no review check ran on this head" becomes more valuable, not less.
- Qodo's "code verification" fundraising language and Sonar's "AI Code Verification" pages mean the word *verification* is being claimed by review/analysis vendors. Merge-Proof's differentiation should lean on "evidence," "exact candidate," and "refuses to claim more than the evidence shows" rather than the bare word.
- Codacy is the only Group-2 vendor whose messaging directly addresses "can this safely block a merge," which makes it the most natural co-marketing or integration partner in the group.

---

## Group 3 — Supply chain / policy / Actions security / evidence / compliance

### Sub-group 3a: SDLC-integrity / ASPM vendors that talk about branch protection and bypass

- **Legit Security — (3) STRENGTHENS + (4) INTEGRATION; partial (2).** "AI-native ASPM"; discovers/maps the SDLC, inventories controls, "enforces hundreds of policies," "AI-generated code validation," AI governance. Its research blog (Feb 2026 per snippet) documented how collaborators with reviewer permission can bypass GitHub required reviewers and got GitHub to change mitigations. Legit clearly has posture checks on branch protection; no public evidence it emits per-PR, per-SHA verdicts. Enterprise pricing, not per-seat public. Best "audience validator" for the problem.
- **Cycode — (3) + partial (2).** Source-control/CI-CD security, Change Impact Analysis, SDLC privilege auditing and separation-of-duties for SSDF/SOC 2/PCI/FedRAMP, insider-threat baselining. AWS Marketplace list price $360/monitored developer/year (~$30/mo) — the one ASPM with a per-developer public price at Merge-Proof's exact level. No per-PR evidence verdict surfaced.
- **Arnica — (2) partial + (4).** "Pipelineless" ASPM; ingests the SCM audit trail into a behavioral graph and flags anomalies including "lack of expected administrative activity"; inventories Git posture (branch protection, misconfigured CODEOWNERS, important-branch classification). Free tier "100% coverage across all repos"; paid undisclosed. Overlaps on *posture and anomaly*, not on per-candidate proof.
- **Apiiro — (3).** Risk Graph policy engine, developer guardrails at PR stage, Guardian Agent (prompt-layer interception), Apiiro CLI for agents (April 2026). Enterprise, 50-seat minimum, no public price. Not a verifier.
- **OX Security — (3).** "Active ASPM," Pipeline Bill of Materials, no-code workflows that can "block a merge until fixed" and "enable branch protection on all important repos." $60M Series B (May 2025). Posture enforcement, not evidence verdict.
- **Boost Security — (3).** Acquired Korbit.ai (code review) and SecureIQx; released SmokedMeat CI/CD exploitation tool (April 2026). Pipeline-attack focus; not a merge verifier.
- **Kusari Inspector — (5)/(3).** Free GitHub App giving "go/no-go" PR comments on vulnerabilities, secrets, workflow issues, licenses; enterprise rate card private (~$10/seat per launch coverage, unverified). Uses "go/no-go" language on a PR, which is adjacent phrasing, but it is a scanner verdict, not a merge-evidence verdict.
- **StepSecurity (Harden-Runner) — (4).** EDR-style runner agent: egress allowlists, file-integrity monitoring, "detection of unauthorized changes to source code during CI." Free for public repos and "Harden Runner Community" $0 on Marketplace (fetched directly); enterprise contact-sales. Its runner telemetry is a natural upstream signal for "CI actually executed on this SHA."

### Sub-group 3b: Evidence stores / attestation

- **Kosli — (4) INTEGRATION, partial (1)/(2) at enterprise scale.** "Governance infrastructure for AI SDLC": append-only evidence database, Evidence Vault, `kosli evaluate` (Rego policy over compliance data), Kosli Answers (AI compliance assistant). Has `kosli attest pullrequest github` which checks that a PR exists for a merge commit and records commits, approvers, merge commit SHA, timestamps. Pricing: annual contracts only, volume-tiered, capped for the contract term. This is the closest *enterprise* analog: it records PR/approval evidence bound to commits. Differences: Kosli is a CI-instrumented, self-reported attestation pipeline (the pipeline attests about itself), priced for regulated enterprises; Merge-Proof is an independent GitHub-side observer that issues a verdict at $29/dev. Kosli would be a strong consumer of Merge-Proof verdicts as an attestation type.
- **Chainloop — (4).** Open-source (Apache-2.0) SDLC evidence store and policy engine for in-toto attestations, SBOM, VEX, SARIF; "Pull Request Info" metadata collected during attestation; control gates that block non-conforming builds/releases. Free tier / Enterprise contact. Same shape as Kosli: pipeline-emitted evidence, not independent verification.
- **in-toto Witness / TestifySec — (4).** Witness moved from TestifySec to the in-toto org; `witness-run` GitHub Action attests CI processes on push and pull_request; TestifySec's "Judge" portal searches attestations; a `judge-k8s` admission controller is a PoC. TestifySec is refocusing its own tooling ("rookery"). Attestation plumbing, not a verdict product.
- **GitHub Artifact Attestations — (4)/(3).** Signed statement that an artifact digest was produced by a specific workflow run from a specific commit, logged to a transparency log; for public repos generation is shifting toward default. This proves *build* provenance, not *merge* provenance (approvals, protections, freshness). Merge-Proof could sign its verdicts as attestations and become the "merge provenance" predicate alongside build provenance.

### Sub-group 3c: Policy engines and OpenSSF

- **OPA/Conftest, Kyverno — (5).** Generic policy engines; Kosli and Harness embed Rego. A Merge-Proof verdict could be an input to Rego policy, but they are not competitors.
- **OpenSSF Allstar — (5)/(2) minor.** GitHub App enforcing branch protection, CODEOWNERS presence, dangerous-workflow, Scorecard checks; actions are log/issue/fix. The OpenSSF-hosted instance has been retired; self-host only. A PR merged 2026-09-18 keeps enforcement going when branch-protection is unavailable. Posture, not per-candidate evidence.
- **OpenSSF Scorecard — (5).** Branch-Protection check scores whether the default branch requires review, blocks force-push, requires status checks. Repository-level score, not PR-level.
- **Stacklok Minder — (5).** Still releasing (v0.3.2 on 2026-09-15); free public instance. Policy/profile engine for repos; no merge verdict.

### Sub-group 3d: CI vendors

- **Harness — (4)/(3).** OPA-based Policy as Code, Rego policy packs, "AI Test Automation," Harness AI generating Rego. Per-developer pricing across modules; third-party estimates $50–100/dev/month for CI Team tier. A pipeline-side approval gate; would consume a Merge-Proof verdict as a policy input.
- **Buildkite — (4).** Block steps record who unblocked (`$BUILDKITE_UNBLOCKER`), Test Engine for flaky tests. Pro $30/user/month (per-seat, unlimited builds, BYO compute). Unblocker identity is a piece of approval evidence Merge-Proof could ingest for non-GitHub-native approvals.
- **CircleCI — (5).** Credit-based ($0.0006/credit; Performance from $15/mo + $15/user). No merge-governance product.
- **Datadog Code Security — (2) minor + (4).** "PR Gates"/Quality Gates that block merges on new vulnerabilities/quality violations; the repo admin must make the check *required* in GitHub for it to block. $25/committer, $40 bundle; committer = 3+ commits/month. Its docs explicitly note the gate only blocks if made required — which is exactly the "was the protection actually applied" question Merge-Proof answers.
- **Semgrep — (4).** Unified Policies (beta; migration from 2026-08-24, old Policies sunset 2026-11-01) decide PR comments, blocking, Jira, Slack per rule; Assistant for AI remediation. $30–35/contributor/month per module, 90-day rolling contributor count; free ≤10 contributors. Another "blocking check" whose actual application Merge-Proof verifies.
- **Snyk ($25/contributing dev, 90-day window), Socket (Team $25, Business $50 per contributor), Aikido (flat $350/$700/$1,050 per month at 10 seats), Endor Labs (per contributing developer, quote-only), GitGuardian (free <25 devs, then ~$18/dev), Chainguard (catalog from ~$19k for 10) — all (5)** for Merge-Proof's job; relevant only as pricing comparables and as producers of required checks.

### Sub-group 3e: Compliance automation platforms (the important adjacent)

Question (b): do Vanta, Drata, Secureframe, Sprinto already check "every PR merged had approval + passing CI," and how deeply?

- **Vanta.** Two documented GitHub tests: (i) "Application changes reviewed" — reads required-approval counts from classic branch protection *and* Rulesets, applying the highest; (ii) "GitHub code changes were approved or provided justification for exception" — evaluates *each merged PR individually* on the default/production branch to confirm it was approved by someone other than the author, or carries a documented justification. There is also a "Code Changes in Vanta" hub page. What the public docs do **not** say: that approval must be on the latest commit/head SHA; that required status checks actually executed on the merged SHA; that a bypass or ruleset *exemption* was used; or that evidence was still fresh at merge time. Pricing: not public; third-party observed $12k–$25k/yr for ≤50 employees, up to $100k+.
- **Drata.** "Test 8: Formal Code Review Process" — passes when repos require a PR before merging with ≥1 required approval; supports org and repo Rulesets read-only; remediation guidance says ensure "reviews cannot be bypassed." Drata Compliance as Code opens PRs to fix control drift. Public docs describe a *configuration* test plus PR-approval data capture "as a verifiable, timestamped record of every code review"; no SHA binding or bypass detection described. Pricing: Foundation ~$7.5k/yr; Advanced $15k–25k; observed median ~$25k.
- **Secureframe.** "Version Control Branch Approval Configurations (GitHub)" test; pulls required-approval counts from Rulesets and follows GitHub's stricter-of-two policy; notes ruleset data is only readable on public repos or non-free GitHub org tiers. Export improvements for audit-ready evidence. Configuration-level. Pricing ~$7.5k–$20k startups.
- **Sprinto.** Automated tests such as "GitHub repositories without branch protection," mapped to SOC 2 TSC; guidance that PRs should merge only after review and CI. Configuration-level.
- **Delve (delve.co)** publishes a GitHub SOC 2 configuration checklist; positioning is AI-native compliance; not examined in depth.
- **Independent commentary corroborates the gap.** OneUptime's 2026-08-04 post argues PRs alone "do not prove that every production change used the workflow or that the reviewed commit is the code that reached production," and that the evidence chain must "connect repository rules, the pull request, the exact commit, and the deployment." heygrc's post "SOC 2 never said a human has to approve your pull requests" signals that AI-agent approvals are becoming an audit question.

**Implication for Merge-Proof:** compliance platforms are **(4) INTEGRATION / evidence source and sink**, not **(1)**. They already own the auditor relationship and the control mapping; they test *configuration* and *author ≠ approver*. Merge-Proof's per-candidate, SHA-exact, bypass- and freshness-aware verdict is the missing depth. The productive positions are: (a) a Vanta/Drata custom-test or evidence-upload integration where each VERIFIED/NOT_PROVEN/FAIL verdict becomes a control artifact; (b) marketing to teams already paying $10k–$80k/yr for compliance automation, for whom $29/dev is a rounding error if it closes an auditor finding. Risk to monitor: any of the four adding "approval on head SHA" and "bypass used" fields to their existing per-PR test would commoditize the most legible part of Merge-Proof's story for the compliance buyer. Vanta's per-PR test is the closest to doing so.

---

## Group 4 — Agent verification

- **Devin Review, Cursor Bugbot, Codex review, Graphite Agent, Copilot code review, Tessl** — all covered above; all are "AI reviewing AI (or human) diffs." None markets *independent, evidence-bounded* verification of GitHub merge state. **(3)** as a group.
- **Qodo** is the one vendor explicitly raising money on "code verification" (March 2026, $70M per snippet). Its product remains review + test generation; but expect it to keep occupying the word. **(3) with brand-collision risk.**
- **Sema AI Code Monitor** — detects GenAI-origin code for legal/regulatory risk; pricing not public. **(5)**; at most a future signal ("this PR is 80% AI-authored, therefore require stricter evidence").
- **Mabl / Momentic (AI QA)** — Mabl quote-only (third-party estimates $499/mo to $40k+/yr), Momentic meters test-step credits with a free tier. Test *producers*; **(5)** except that their results are more status checks whose execution on the head Merge-Proof would verify.
- **Harness AI Test Automation** — intent-driven no-code testing inside Harness pipelines. **(5)**.
- **"Uncover," "Blackbird"** — no code-verification startup by those names surfaced; Blackbird.AI is narrative-intelligence/disinformation. **(5)**.
- **Kodus, Jolt AI** — Kodus is an OSS review agent (AGPL, $10/dev Teams); Jolt AI is a codebase assistant with all-inclusive per-seat pricing and a 5-seat minimum. **(5)**.
- **Academic framing** strengthens the thesis: 2026 arXiv work ("The Verification Horizon," "contract-driven adversarial verification") argues that for coding agents "reliably verifying the solution has become the harder problem," and that a verifier "that did not write the code is less likely to adopt the implementation's assumptions." That is Merge-Proof's independence argument, stated by researchers.

### The one startup positioned near "merge evidence / proof of verification"

- **`Aryamanz29/mergeproof` (open source, MIT).** README: "Proof before merge: evidence gates for pull requests (tests, traces, human verification) as one policy file, enforced in CI and readable by agents." A `mergeproof.yaml` pairs `when` (paths, labels, title, base branch) with `require` checks: test changes for touched modules, named check runs succeeding **on the head commit**, before/after evidence links verified at source, **human approvals bound to specific commits**, and agent verdicts. Motto: "Evidence, not attestation." Ships as a GitHub Action and, per PR #16 (2026-09-12), as a hosted GitHub App that reads policy from the base branch and publishes a comment, status, and check run. Releases: v0.5.0/v0.6.0 (2026-09-12), v1.0.0 (2026-09-14), v1.0.1/v1.0.2 (2026-09-15). 1 star, 0 forks, 158 commits; also on PyPI (`mergeproof` 0.4.0).
- Why it matters: it is the only thing found that binds approvals and check runs to the exact head commit as a *product concept*, uses nearly the same name, and launched the same week. Differences: it is a repo-owner-authored *policy gate* (what must be proven) rather than an *independent verdict* on what GitHub's own state shows (including bypasses, ruleset application, merge-group SHA, and freshness); it has no bypass/ruleset dimension; it is free. Classification: **(2) COMMODITIZES the "approval bound to commit + check on head" idea at the free/OSS end; (3) validates the category; trademark/name-collision risk should be reviewed.** Note also that Merge-Proof's own repository (`ohcaygo/merge-proof`) and its PRs are already indexed by search engines, so both projects are discoverable side by side.

---

## (a) Which vendors' pricing is closest to $29/developer, and what they bundle

| Vendor | Price | Metering unit | What the money buys |
|---|---|---|---|
| CodeRabbit Pro | $24 annual / $30 monthly | devs who open PRs | unlimited AI review, IDE, CLI |
| Greptile Pro | $30 + $1/review >50 | seat | codebase-aware AI review |
| Baz | $30 + credits | active developer | AI review |
| Cycode | ~$30 ($360/yr AWS Marketplace) | monitored developer | full ASPM platform |
| Buildkite Pro | $30 | active user | unlimited CI builds, 10 agents |
| Semgrep Team | $30–35 per module | 90-day contributors | SAST/SCA/Secrets + Assistant |
| Snyk Team | $25 | 90-day contributing dev | per-product security testing |
| Socket Team | $25 | contributor | dependency risk |
| Datadog Code Security | $25 ($40 bundle) | committer with 3+ commits/mo | SAST/SCA + PR Gates |
| Mergify | $21 | 30-day active contributor | queue + protections + CI/Test insights + stacks |
| Codacy Pro | $18 annual / $21 monthly | developer | quality/security + AI Reviewer with merge gates |
| Graphite Starter/Team | $20 / $40 | seat | stacking, queue, AI reviews |
| Aviator | $12–$40 (third-party, conflicting) | active collaborator per product | queue / review routing / releases |
| Ellipsis | $20 | developer | unlimited AI review |
| Bito | $12–25 | seat (+LOC overage) | AI review |
| Kodus Teams | $10 + tokens | dev | OSS review agent |

Observations: (1) Merge-Proof's $29 is priced like a full AI reviewer or a security-scanning module, while delivering a single deterministic verdict; the value story must be audit/compliance and agent-era risk, not feature count. (2) Its "observed active developer" metering is standard in this market (CodeRabbit, Mergify, Snyk, Semgrep, Datadog all meter active contributors over 30–90-day windows); the 7-day trial "starting at first successful proof" is unusual and defensible — nobody else keys the trial to first value. (3) The nearest *bundled* substitute a buyer will name is Mergify at $21, which includes a merge queue plus configurable Merge Protections; Merge-Proof should be explicit that it is the auditor of those protections, not a replacement for them.

## (b) Compliance automation platforms — summary answer

Yes, at the configuration level and (for Vanta, and by evidence capture for Drata) at the per-merged-PR "approved by non-author" level. No public documentation from Vanta, Drata, Secureframe, or Sprinto describes checking that the approval applies to the final head SHA, that required checks executed on that SHA (or the merge-group SHA), that a bypass or silent ruleset exemption was used, or that the evidence was fresh at merge time. They are integration sources (they already normalize the auditor's control language) and evidence sinks (a Merge-Proof verdict is the artifact that would let their per-PR test say more), not competitors. The competitive watch item is Vanta's per-PR test gaining SHA and bypass fields.

---

## Ranked list — the 8 most relevant players

1. **GitHub (Rulesets, Rule Insights GA Aug 2026, exempt bypasses, merge queue)** — owns the raw data; the only party that could make Merge-Proof redundant or, by shipping silent exemptions, make it indispensable.
2. **Vanta (per-PR "approved or justified" test)** — the most advanced compliance-side check; top integration target and top commoditization watch.
3. **Mergify (Merge Protections at $21)** — closest paid feature overlap and the bundle buyers will compare against.
4. **Kosli (PR attestation with approvers + merge SHA, evidence vault, Rego evaluate)** — closest enterprise analog in concept; integration partner at the high end.
5. **Aviator FlexReview (commit-aware approval dismissal, validation status check)** — nearest "approval freshness" mechanic in a workflow tool.
6. **Legit Security (required-reviewer bypass research, SDLC posture)** — validates the threat model; potential channel to security buyers.
7. **Drata (Test 8 Formal Code Review, Rulesets read, Compliance as Code)** — second compliance integration target.
8. **Codacy (deterministic merge gates; "why most AI reviewers can't safely block a merge")** — the Group-2 vendor whose message most closely sets up Merge-Proof's.

**Single closest analog:** the open-source **`Aryamanz29/mergeproof`** project (MIT; v1.0.2, 2026-09-15; hosted GitHub App since 2026-09-12) — "evidence gates for pull requests… human verification bound to specific commits… check runs on the head commit… evidence, not attestation." It is a policy gate rather than an independent verdict, has no bypass/ruleset/merge-group/freshness dimension, and is free with 1 star — but it is the same idea, the same week, and nearly the same name. Among commercial products, the closest analog is **Kosli's pull-request attestation**.

---

## Sources

Status legend: **fetched** = page retrieved directly; **primary/snippet** = vendor's own page, seen only through search-result snippet because the domain was egress-blocked; **third-party** = non-vendor coverage. Dates are page/announcement dates where shown, otherwise the access date 2026-09-19.

Group 1
- https://mergify.com/pricing — primary/snippet — accessed 2026-09-19
- https://docs.mergify.com/merge-protections/ — primary/snippet — accessed 2026-09-19
- https://docs.mergify.com/merge-queue/github-rulesets/ — primary/snippet
- https://docs.mergify.com/changelog/2025-11-20-bypass-the-injection-of-rulesets-conditions-in-the-merge-queue/ — primary/snippet — 2025-11-20
- https://mergify.com/compare/aviator ; https://mergify.com/compare/graphite ; https://mergify.com/compare/trunk — primary/snippet (competitor-authored comparisons)
- https://graphite.com/pricing — primary/snippet
- https://graphite.com/blog/introducing-graphite-agent-and-pricing — primary/snippet — Oct 2025 / plans effective 2026-01-08
- https://graphite.com/docs/merge-pull-requests — primary/snippet (dismiss-stale caveat)
- https://graphite.dev/blog/graphite-merge-rules — primary/snippet (Graphite Protections; date unconfirmed)
- https://www.aviator.co/pricing — primary/snippet
- https://docs.aviator.co/manage/faqs/billing — primary/snippet
- https://docs.aviator.co/flexreview/concepts/validation-in-flexreview — primary/snippet
- https://trunk.io/pricing ; https://docs.trunk.io/billing — primary/snippet
- https://trunk.io/trunk-vs-aviator — primary/snippet (competitor-authored)
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue — primary/snippet
- https://github.blog/changelog/2024-02-27-repository-rules-configure-merge-queue-rule-public-beta/ — primary/snippet — 2024-02-27
- https://github.blog/changelog/2025-09-10-github-ruleset-exemptions-and-repository-insights-updates/ — primary/snippet — 2025-09-10
- https://github.blog/changelog/2026-04-16-rule-insights-dashboard-and-unified-filter-bar/ — primary/snippet — 2026-04-16
- https://github.blog/changelog/2026-08-12-rule-insights-for-organizations-in-public-preview/ — primary/snippet — 2026-08-12
- https://github.blog/changelog/2026-08-25-rule-insights-dashboard-generally-available/ — primary/snippet — 2026-08-25
- https://github.com/orgs/community/discussions/190610 — primary (community) — 2026
- https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/ — primary/snippet — 2025-12-16
- https://github.com/resources/insights/2026-pricing-changes-for-github-actions — primary/snippet — 2026
- https://github.com/bors-ng/bors-ng — primary — archived 2024-04-04
- https://github.com/chdsbd/kodiak — fetched
- https://linear.app/docs/github-integration — primary/snippet
- https://www.shipfox.io/pricing — primary/snippet

Group 2
- https://www.coderabbit.ai/pricing — primary/snippet
- https://costbench.com/software/ai-code-review/greptile/ — third-party; https://www.agent-wars.com/news/2026-05-01-greptile-per-review-pricing — third-party — 2026-05-01
- https://aicodereview.cc/blog/qodo-pricing/ — third-party; https://en.wikipedia.org/wiki/Qodo — third-party (Qodo 2.0 Feb 2026; $70M March 2026)
- https://github.com/qodo-ai/pr-agent — fetched
- https://cursor.com/blog/may-2026-bugbot-changes — primary/snippet — May 2026
- https://www.sonarsource.com/solutions/ai/ai-code-assurance/ ; https://docs.sonarsource.com/sonarqube-server/2026.1/quality-standards-administration/ai-code-assurance/overview — primary/snippet
- https://www.sonarsource.com/products/gitar/ ; https://gitar.ai/pricing — primary/snippet
- https://blog.codacy.com/ai-code-review-tools-compared-2026-why-most-cant-safely-block-a-merge-and-what-code-governance-fixes — primary/snippet — 2026
- https://blog.codacy.com/github-copilot-code-review-used-to-be-included-from-june-1st-you-pay-twice — primary/snippet — 2026
- https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/ — primary/snippet — 2026-04-27
- https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/ — primary/snippet — 2026
- https://deepsource.com/changelog/2026-02-23 — primary/snippet — 2026-02-23
- https://bito.ai/pricing/ — primary/snippet
- https://baz.ai/pricing — primary/snippet
- https://macroscope.com/content/usage-based-pricing-developer-tools-ai-code-review — primary/snippet
- https://entelligence.ai/code-review-benchmark-2026 — primary/snippet
- https://tessl.io/blog/launching-tessl-code-review — primary/snippet — 2026
- https://github.com/kodustech/kodus-ai — fetched
- https://cognition.com/blog/devin-review — primary/snippet
- https://developers.openai.com/codex/pricing ; https://developers.openai.com/codex/integrations/github — primary/snippet
- https://weavai.app/blog/en/2026/04/30/sourcegraph-cody-review-2026-enterprise-ai-at-59-mo/ — third-party

Group 3
- https://www.legitsecurity.com/blog/bypassing-github-required-reviewers-to-submit-malicious-code — primary/snippet — Feb 2026 (per snippet)
- https://www.legitsecurity.com/ai-native-application-security-platform-for-modern-sdlc — primary/snippet
- https://cycode.com/source-control-ci-cd-security/ — primary/snippet; https://aws.amazon.com/marketplace/pp/prodview-7hkuvbdbm4pwg — primary (AWS listing, $360/dev/yr)
- https://docs.arnica.io/arnica-documentation/git-posture/excessive-dev-permissions/excessive-admins ; https://github.com/marketplace/arnica-software-supply-chain-security — primary/snippet
- https://apiiro.com/rsa-conference-2026/ ; https://aws.amazon.com/marketplace/pp/prodview-g7uwpqwze7cow — primary/snippet
- https://www.ox.security/ ; https://www.ox.security/pricing/ — primary/snippet
- https://boostsecurity.io/blog/announcing-two-acquisitions-and-a-funding-round — primary/snippet
- https://www.kusari.dev/inspector ; https://github.com/apps/kusari-inspector — primary/snippet
- https://github.com/marketplace/harden-runner-app — fetched; https://github.com/step-security/harden-runner — primary
- https://www.kosli.com/ ; https://www.kosli.com/evidence-vault/ ; https://www.kosli.com/blog/introducing_kosli_evaluate/ ; https://docs.kosli.com/client_reference/kosli_attest_pullrequest_github/ — primary/snippet
- https://chainloop.dev/pricing/ ; https://github.com/chainloop-dev/chainloop — primary/snippet; https://www.helpnetsecurity.com/2026/08/10/chainloop-open-source-supply-chain-security/ — third-party — 2026-08-10
- https://github.com/in-toto/witness ; https://github.com/testifysec/witness ; https://github.com/marketplace/actions/witness-run — primary
- https://docs.github.com/en/actions/concepts/security/artifact-attestations — primary/snippet
- https://github.com/ossf/allstar — fetched (hosted app retired); https://github.com/ossf/allstar/pull/893 — primary — 2026-09-18
- https://github.com/ossf/scorecard — primary
- https://github.com/stacklok/minder/releases — fetched — v0.3.2 2026-09-15
- https://www.harness.io/blog/compliance-without-complexity-introducing-harness-rego-policy-packs ; https://developer.harness.io/ai-test-automation — primary/snippet; https://www.cloudzero.com/blog/harness-pricing/ — third-party
- https://buildkite.com/docs/pipelines/configure/step-types/block-step ; https://buildkite.com/pricing/ — primary/snippet
- https://circleci.com/pricing/price-list/ — primary/snippet
- https://docs.datadoghq.com/pr_gates/ ; https://docs.datadoghq.com/account_management/billing/pricing/ — primary/snippet
- https://docs.semgrep.dev/release-notes/june-2026 ; https://semgrep.dev/docs/usage-and-billing — primary/snippet
- https://snyk.io/plans/ — primary/snippet; https://comparetiers.com/tools/socket-dev — third-party; https://konvu.com/compare/aikido-vs-snyk — third-party; https://www.endorlabs.com/pricing ; https://docs.endorlabs.com/introduction/licenses — primary/snippet; https://www.gitguardian.com/pricing — primary/snippet; https://edu.chainguard.dev/chainguard/chainguard-images/about/pricing/ — primary/snippet
- https://help.vanta.com/en/articles/11345528-application-changes-reviewed-test-github — primary/snippet
- https://help.vanta.com/en/articles/14845240-github-integration-guide ; https://help.vanta.com/en/articles/12498226-code-changes-in-vanta — primary/snippet
- https://help.drata.com/en/articles/4776886-test-8-formal-code-review-process ; https://help.drata.com/en/articles/9755132-github-rulesets-integration ; https://docs.drata.com/drata-compliance-as-code/connecting-github-code-to-drata — primary/snippet
- https://support.secureframe.com/hc/en-us/articles/4437928192019-Github — primary/snippet
- https://sprinto.com/soc-2/automation/ — primary/snippet
- https://delve.co/blog/github-configuration-checklist-for-soc-2-compliance — primary/snippet
- https://oneuptime.com/blog/post/2026-08-04-github-pull-requests-change-management-evidence/view — third-party — 2026-08-04
- https://heygrc.com/blog/soc-2-never-said-a-human-approves-your-prs — third-party
- https://costbench.com/software/compliance-management/vanta/ ; https://soc2auditors.org/insights/drata-pricing/ ; https://www.vendr.com/marketplace/secureframe — third-party pricing observations

Group 4
- https://github.com/Aryamanz29/mergeproof — fetched; https://github.com/Aryamanz29/mergeproof/releases — fetched (v1.0.2 2026-09-15); https://github.com/Aryamanz29/mergeproof/pull/16 — primary — 2026-09-12; https://pypi.org/project/mergeproof/0.4.0/ — primary
- https://www.semasoftware.com/ai-code-monitor — primary/snippet
- https://bug0.com/knowledge-base/mabl-pricing ; https://www.aipricing.guru/ai-qa-agentic-test-automation-pricing-index/ — third-party
- https://arxiv.org/pdf/2606.26300 ("The Verification Horizon") ; https://arxiv.org/pdf/2605.25665 — academic — 2026
- https://aicompetence.org/coding-agent-verification/ — third-party
