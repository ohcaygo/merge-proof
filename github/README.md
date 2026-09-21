# Prove the merge: exact-state receipts

Hosted Merge Proof is live at [merge-proof.ohcaygo.com/proof/](https://merge-proof.ohcaygo.com/proof/). It automatically collects available GitHub evidence for authorized repositories, keeps exact-state receipts and re-proves tracked work after relevant events. The seven-day no-card trial starts with the first CURRENT, collection-complete VERIFIED or NOT_PROVEN hosted receipt, exactly once per paying account, and is report-only. Failed, unavailable or stale collection, OAuth, installation, repository authorization and historical scans do not start the clock. NOT_PROVEN does not mean broken code.

Paid Pro is US$29/month per observed active developer. No automatic charge at trial expiry: new proofs, re-proofs and scans pause without paid entitlement. Existing receipts remain available with current authorization, within retention and capacity limits. New enforcement also requires paid Pro, repository-admin configuration and a separately required GitHub Check. Existing enforcing policies remain preserved.

The canonical repository is `ohcaygo/merge-proof`. Hosted processing extends the existing single-process factory and private JSON store. The free local CLI and Action inspect local Git evidence; they do not collect hosted CI execution, approvals or remote-ref evidence. The former evidence-pack offer is retired for new sales; existing orders retain their fulfillment path.

Dated evidence: [accepted trial rollout](validation/TRIAL-AUTO-ACTIVATION-001.md), [supported ruleset and queue acceptance](validation/RULESET-FIRST-CLASS-001.md). Trial activation was founder production acceptance, not outside adoption. Queue acceptance used the development/acceptance App; HEADGREEN was exercised, ALLGREEN other-entry evidence remains unsupported. Expiry, reminders and paid resumption are fixture evidence, not a manufactured live payment. These retained records are not rewritten by documentation updates.

## Signup and automation

Connect GitHub, authorize repositories, then Merge Proof discovers open PRs and starts proving automatically. Choose an account or repository where more than one is available. With no open PR, it watches for the next one without starting the trial. “Prove it now” is optional. Provider errors, permissions and technical capacity can require attention; eligibility alone does not establish successful collection. The account shows pending, empty, working, retrying, attention-needed or paused status using scoped discovery and refresh state.

## Run it

```sh
npm test
npm run test:factory
npm run test:github
node github/cli.js OWNER/REPO PR --out /tmp/a-new-receipt-directory
node github/cli.js OWNER/REPO PR --previous /path/to/prior/receipt.json --out /tmp/a-new-refresh-directory
node github/scan.js OWNER/REPO 5 /tmp/a-new-history.json
```

The separate GitHub CLI uses optional `MP_GITHUB_TOKEN` from the environment.
Use an authorized local credential mechanism; never put tokens in command-line
arguments, repository files, receipt URLs or chat. Errors do not print tokens or
provider response bodies. This is **not** a new option on `npx merge-proof`.
The published local CLI remains offline, schema version 1, zero dependencies,
and unchanged exit codes. GitHub receipts use schema version 2 and a separate
entry point. The npm package's existing shipped file boundary is unchanged.

GitHub CLI exit codes: 0 VERIFIED, 2 NOT_PROVEN, 3 analysis/collection failure.
It creates a new output directory and refuses to overwrite existing artifacts.
A failed refresh cannot overwrite a prior receipt. The previous receipt's
currentness is a separate JSON file. Saved HTML starts UNAVAILABLE until fresh
observations establish currentness; it cannot silently become an evergreen badge.

## Hosted routes and local development

Set `MP_GITHUB_APP_CONFIG` to a private JSON configuration file outside the repo,
then start the **existing** factory normally. `{}` enables public proof routes
for local development without enabling App operations. App credentials are only
needed for installation events and authenticated collection. Existing factory
configuration, Stripe configuration and routes retain their meanings.

Configuration fields: `appId`, `privateKey` (PEM), `webhookSecret` (at least 32
characters), and optional `publishChecks: true`. Store configuration mode 0600.
Do not expose the factory state directory through static hosting.

New routes:

| Route | Behavior |
|---|---|
| `GET /proof/` | Seven-day trial welcome and GitHub sign-in; no card upfront |
| `POST /proof/run` | Authorized installation/repository/PR scope; optional manual proof |
| `GET /proof/receipts/:id` | Authorized HTML receipt; currentness requires refresh |
| `GET /proof/receipts/:id?format=json` | Same evidence as the human receipt |
| `POST /proof/receipts/:id/refresh` | Re-observe evidence; preserve original verdict |
| `POST /proof/webhook` | Verify GitHub HMAC, deduplicate delivery, stale and queue proof |
| `GET /proof/gate` | Required-check status, merge policy, presets and guided setup |
| `POST /proof/gate` | Set this repository's merge policy; repository admin only |
| `GET /proof/merges` | Durable merge evidence ledger; `?record=<id>` for one full row |

Production uses GitHub OAuth through `/proof/login`, with a cookie-bound one-use state. Tokens remain in process memory for at most one hour and expire on restart. Repository and receipt requests recheck the user's and App's installation/repository intersection. Anonymous production receipt access is denied, including for public repositories. Uninstall, suspension, repository removal and revoked access deny retrieval. Provider failures deny access rather than exposing private evidence.

The existing Pages proxy forwards `/proof/` to the immutable backend release while preserving the origin/proxy-secret boundary. Public-only local development routes are not the production customer contract.

## GitHub App connection

Use the existing production App through the normal GitHub installation flow. It requests read access for evidence and Checks write for receipt publication; it never configures repository protections. See [production operations](PRODUCTION.md) for private configuration and the documented deployment path.

Repository permissions requested by the installation-token exchange:

- Metadata: read (implicit).
- Contents: read for Git metadata and refs.
- Pull requests: read for candidate and review observations.
- Commit statuses: read.
- Checks: read; **write only if `publishChecks` is enabled** to report this App's check.
- Actions: read for workflow run/job/step records.
- Administration: read for classic protection and active rules; never write.
- Merge queues: read for queue evidence; never write.
- Organization Members: read to verify billing-owner authority, not to import inactive members as seats.

Subscribe to pull request, pull request review, check run, check suite, status,
workflow run, push, merge group, repository ruleset, branch protection rule and
repository events. Ping is supported. Signed installation/repository-added events queue discovery, and authorized account reads enroll existing open PRs. Discovery is bounded to authorized repositories and five pages of 100 rows; it does not imply unrestricted organization discovery.

Signed events conservatively invalidate tracked receipts for that repository
before work begins. A persisted queue processes one proof at a time. Queue jobs
survive restart; three failed attempts stop that job with explicit unavailability.
Later events can retry. Events arriving during collection prevent CURRENT. Own
check events are ignored and own receipt checks are excluded from proof inputs.
Optional check publication contains the exact same receipt verdict and link.
Stale enforcing checks retract to failure; advisory notices are neutral when publication can reach GitHub. A failed GitHub write cannot guarantee immediate check-UI invalidation;
the receipt remains historical and the endpoint never infers currentness.

The owner decides whether to require any check. **Merge Proof never changes
branch protection or rulesets**, and does not request the permission that would
let it. Its own check cannot serve as independent CI proof: it is recorded as an
explicit self-reference and excluded from the requirements the receipt must
establish, so requiring it does not deadlock the gate. Publication is a receipt
delivery surface bound to one commit, not an atomic merge authorization
mechanism; see "Merge assurance" below for what an enforcing policy changes.

## What the proof means

The collector projects REST responses to Git metadata, rule parameters, paths,
SHA/ref identities, IDs, states and timestamps. GitHub compare responses may
include patch text in transit; patches are discarded immediately and are not
stored, rendered, logged or sent to a model. Review bodies, commit messages and
check output text are discarded. No repository tree is cloned or customer code
executed by this layer. The local verifier still uses only local Git reads.

Two complete bounded observations must match. This detects observed races; the
GitHub API is not an atomic snapshot and cannot guarantee future merge state.
The result explicitly states that limitation. Every field is tied to the
repository ID, PR, head, base and observation that produced it.

Applicable CI target:

1. Head if it contains the exact current base.
2. Otherwise the current GitHub test-merge ref, with exactly matching base/head parents.
3. For merge queue, a live group ref, candidate/base ancestor evidence, and a
   matching live GraphQL queue entry are required. The queue entry must expose
   the same group/base/candidate identities. If GitHub does not expose that
   relationship, current selection is UNAVAILABLE. ALLGREEN requirements for
   other entries are explicitly unsupported; the receipt cannot waive them.
4. Historical scan uses only an explicit two-parent landed merge.

CI distinguishes observed accepted conclusions from execution records. The
implementation observes required contexts and App IDs, current/head/other SHA,
latest check attempt, statuses, success/neutral/skipped/failure/pending, workflow
run/attempt/job/check IDs and steps. Execution requires a successful current-SHA
check with a matching successful workflow run/job and successful recorded steps;
a skipped step prevents full execution proof. Status-only and external-provider
success assertions do not become workflow execution proof. A customer's workflow
can check out arbitrary code: **the receipt does not prove checkout contents or
semantic test coverage.** “GitHub accepted” is a computation from observed
conclusions, not a claim that all GitHub merge controls permit merging.

Rulesets and classic protection are intersected, not treated as alternatives.
A classic-protection 404 alone remains unavailable. An error-free, identity-matching GraphQL ref with explicit null can establish classic absence; applicable active rules must still be available. A 403, missing field, identity mismatch or partial read never establishes absence. Classic signature and linear-history requirements are preserved in the evidence
and block proof as unsupported; they cannot silently disappear from freshness.
Other classic controls outside CI/review policy are not comprehensively evaluated. Unknown active
ruleset requirements remain blocking limitations. No required validation
configured means no required-validation proof, not automatic VERIFIED.

Approval requires current-head human review by a non-author with independently
observed write permission, the required count, and no observed outstanding
changes-requested decision. Comments do not erase approval. Old-head approvals
are conservatively insufficient even when the repository permits them. Dismissed
reviews do not count. CODEOWNERS, required teams, review-thread resolution and
last-push actor approval remain explicit unsupported requirements, not guesses.

Remote durability means the exact head repository's branch ref equals the
candidate SHA **at observation**. It is not a future retention guarantee.

The existing analyzer evaluates collected path metadata through a supplied Git
reader. Its local findings are preserved, including BASE_DRIFT_UNVERIFIED and
PROTECTED_BOUNDARY. Remote CI never silently waives these findings. STALE_BASE
remains advisory; base movement without overlap can still produce VERIFIED when
the other exact-state evidence is sufficient. Existing protected categories and
ignore behavior remain unchanged locally. Hosted metadata does not load customer
ignore files. Additional repository-specific boundary configuration is not added.

## Level 3 hosted evidence policy

Merge Proof records GitHub-reported candidate identity, checks, approvals and applicable
repository policy for one exact observed state. A receipt is **VERIFIED** only when
available current evidence sufficiently satisfies the implemented requirements for that
scope. **NOT_PROVEN** means a required claim is missing, ambiguous, unsupported or
unavailable from GitHub; it is not a finding that the code is bad. **FAIL** means
sufficiently bound evidence demonstrated that a required condition was unmet.

A receipt records a point-in-time GitHub observation, not an atomic GitHub merge
decision or a guarantee about a future merge. When GitHub supplies the required
identities for a landing, the durable merge record can bind the pre-merge receipt to
landed content and retain it as a portable record. When those identities or provider
reads are unavailable, the corresponding claim remains unavailable or NOT_PROVEN.

## Merge assurance: the required gate, and the policy behind it

Merge Proof reports on every proof. Whether that report **blocks** a merge is two
separate decisions, and both have to agree.

**GitHub decides whether the check is required.** Merge Proof reads repository
rules (Administration read, the same two sources every proof already reads) and reports
whether its own context is currently required on the base branch, and whether the
rule binds it to this App. It never writes branch protection or a ruleset.
Writing one needs Administration: write, which also grants renaming,
transferring and deleting the repository, adding collaborators and deploy keys,
and removing the very rule that gates the merge. An App that can switch off its
own gate is not a gate, so this App does not request that permission. `setup.js`
returns the exact guided steps and deep links instead.

**Merge Proof decides what its check reports.** This matters because GitHub
treats a required check concluding `neutral` or `skipped` as a **pass**. A
report-only policy is therefore the only policy that may emit `neutral`; an
enforcing policy emits `success` or `failure` and nothing else. A superseded
published check is retracted to `failure` under an enforcing policy rather than
to `neutral`, and a check run cannot be re-pointed at a new commit, so a new head
always gets a new check run — an unreported required check leaves the pull
request blocked with "Waiting for status to be reported".

### Presets

| Preset | Blocks merge | What it enforces |
|---|---|---|
| `ADVISORY` | Reports only | Default when no enforcing policy is configured. Installing does not require the Check in GitHub. |
| `REPOSITORY_REQUIREMENTS` | yes | The evidence for the requirements the repository already configures, established for the exact state being merged. A protected boundary is reported but does not block. |
| `REPOSITORY_REQUIREMENTS_AND_BOUNDARIES` | yes | As above, and a candidate touching a protected boundary additionally needs at least two current eligible human approvals. |

New enforcing policies require paid Pro and a repository administrator. Trial does not enable them. Previously configured enforcing policies remain enforced: at hosted expiry enforcing notices report failure and advisory notices are neutral. If GitHub requires the Check, subscribe or remove the required check in GitHub Settings → Rules / Branches. Delivery failures can prevent notices; no automatic unblocking is guaranteed. A passing policy Check is not necessarily a VERIFIED receipt.

The policy is stored per repository ID, set only by a repository administrator,
and recorded with who set it and when. There is no policy language: the
requirements come from the repository's own rules.

`policy.evaluate()` never changes a verdict and never hides a gap. It partitions
the receipt's gaps into blocking and reported, and it **fails closed**: every gap
blocks under an enforcing preset unless it appears in an explicit
boundary-scoped set, so a gap code added later blocks by default rather than
silently becoming advisory. A FAIL verdict, a STALE receipt and an unconfirmed
currentness all block an enforcing gate.

### Gate readiness

Merge Proof will not recommend a blocking preset it cannot satisfy, and says so
before the gate is enabled rather than after merges stop:

- a branch that requires no validation has nothing to prove, so the gate would
  block permanently;
- a requirement outside what Merge Proof can establish (code owners, signatures,
  linear history, conversation resolution, ALLGREEN queue grouping) would block
  permanently. GitHub still enforces those itself; Merge Proof simply does not
  claim them.

### Merge Proof's own required check

When a repository requires Merge Proof's own context, that requirement is
satisfied by publishing the receipt, and the receipt cannot be independent
evidence about the change it describes. It is recorded as `selfReference` and
listed in `notChecked`, and excluded from the requirements the receipt must
establish. It is **not** emitted as a requirement no evidence could satisfy,
which would deadlock every gated pull request. Every other required check is
enforced exactly as before, and a same-named context bound to a different App is
somebody else's requirement and stays a real one.

## Who or what changed this

`summary.actors` records deterministic provenance from evidence already read:
pull request author, commit author and committer accounts, commit signature
verification, reviewers, check-publishing Apps, workflow actors, and the merging
account. Each carries the account type GitHub returned, classified as
`HUMAN_ACCOUNT`, `APP_OR_BOT` or `UNKNOWN`. The `[bot]` login suffix is recorded
as corroboration only; GitHub documents it by example, not as a guarantee.

`agentIdentity` is `OBSERVED_APP_OR_BOT`, `NONE_OBSERVED` or `UNAVAILABLE`, and
covers **authorship** only — check publishers are Apps on nearly every
repository and would otherwise make every change look agent-authored.

The limit is stated on every receipt rather than filled in: GitHub records the
account that acted, not the tool it was driven by. A coding agent run with a
person's own credentials is recorded as that person, and no API field on a pull
request, review or commit records the credential class. `NONE_OBSERVED`
therefore does not establish that a person wrote the code. Git header name and
email are unvalidated client strings and are never stored; only linked account
identity is.

## Durable merge evidence record

On a merged pull request the service writes one immutable ledger row before
staling receipts. It preserves repository, PR, landed commit, PR head, merge
actor, and a detached snapshot of the latest receipt issued no later than the
reported merge timestamp. The snapshot includes requirements, approvals,
checks, gaps, provenance and the recorded publication result when available
before merge. Later same-head receipts cannot become evidence for an earlier merge.

A webhook is not an atomic observation of GitHub's merge decision.
`currentnessAtMerge` therefore remains `UNAVAILABLE`; `currentnessAtDelivery`
records the separate delivery-time observation. A matching PR head alone is
`PROOF_BOUND_TO_PR_HEAD_ONLY`. Exact landed-state binding requires the receipt's
validated target SHA to equal the landed commit; other heads remain
`PROOF_BOUND_TO_OTHER_STATE`. No eligible pre-merge receipt means
`NO_PROOF_RECORDED`. Neither a published check nor its policy is represented as
proof of GitHub's actual decision at merge time.

The snapshot survives receipt retention. Duplicate deliveries and later evidence
never rewrite it. The ledger is bounded at 5,000 rows and explicitly reports
pruning; export records you need to retain beyond this bound.

Retrieval is scoped to the authorized installation and repository:
`GET /proof/merges` lists and filters (`pr`, `verdict`, `since`, `until`,
`limit`), and `?record=<id>` returns one full row as JSON for export or agent
consumption.

## Active-developer pricing and trial

Pro is US$29/month per distinct human GitHub ID observed opening covered PRs or pushing covered commits. Bots, configured service identities and inactive organization members are excluded. One account shares its trial and billing across installations. Initial count uses the preceding 30 days of observed covered activity; subsequent counts use the subscription month. Billing owners review the count before checkout. Withheld billing data is not a zero count. Quantity increases require confirmation; changes take effect at renewal without proration.

The current offer has no proof-credit package, five-proof trial, 50-proof allowance or top-ups. Historical accounting remains preserved; it is not a current sales allowance. Same-head refresh and reinstall do not restart the 7-day trial. Checkout redirects do not establish payment or entitlement.

## Receipt, freshness and history

`receiptId` identifies an immutable version-2 receipt. `policy` names the
implemented evidence policy; `fingerprint` hashes canonical evidence for change
detection, not cryptographic certification. `evidence` is inspectable underneath
`summary`. No confidence score, AI decision or signing system is involved.

Historical `verdict` stays VERIFIED / NOT_PROVEN / FAIL. Currentness is stored and
returned separately: CURRENT at an observation, STALE when evidence differs, or
UNAVAILABLE when refresh cannot establish currentness. Timestamp passage alone
does not expire proof. A later failed refresh retains a known STALE state and
marks refresh unavailable. Unrefreshed permalink views never show saved CURRENT
as live current. HTML is responsive and printable; no new PDF requirement is
introduced. Existing PDF delivery still depends on Chrome.

The customer historical scan is one bounded scan of at most five merged PRs selected from one page of 30 recently
updated closed PRs. It uses the same collector, proof evaluator and local analyzer.
Squash/rebase shapes remain UNAVAILABLE. Current rules cannot reconstruct rules
and approval validity at merge time, so a historical full VERIFIED result is
withheld. The scan does not start the trial, and new collection pauses at hosted expiry. Findings describe exact evidence conditions, never bugs or money saved.

## Persistence and technical capacity

Records live in `store.data.github`, separate from existing orders/payments:
receipts, subscriptions, queue, delivery IDs, repository revisions and completed
proof events. The existing single-writer lock, atomic rename, fsync and private
file modes apply. No new database/provider is required.

Stable, collection-complete CURRENT VERIFIED/NOT_PROVEN receipts can atomically start a trial. Source failures and partial observations retain diagnostic receipts without starting it. The existing trial, entitlement, billing ledger and lifecycle records share durable single-writer storage. Stored repository IDs, actors, paths, SHAs, normalized checks/rules/reviews and receipts are sensitive metadata; this is not “no customer data.”

Technical bounds include fewer than 300 files per accepted compare, bounded pagination, 1,000 stored receipts, 100 tracked PRs, 10,000 delivery IDs, five pages of 100 discovery rows and 5,000 merge records with explicit pruning. Capacity errors are explicit, not successful activation or commercial proof credits. Receipts are not promised forever or anonymously public. No customer code is executed or sent to a model.

## Primary API references

- [Active branch rules](https://docs.github.com/en/rest/repos/rules)
- [Classic branch protection](https://docs.github.com/en/rest/branches/branch-protection)
- [Required check conclusions](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Merge queue entry fields](https://docs.github.com/en/graphql/reference/pulls)
- [GitHub webhook payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

`examples/receipt.*` is explicitly synthetic fixture output, not a customer proof.

## Development owner acceptance

Follow [the exact setup and live acceptance packet](dev/OWNER-SETUP.md).
The packet uses a public owner-controlled development PR, a development-only relay,
and the existing server. `dev/acceptance.js` observes actual saved signed delivery
IDs and checks immutable history versus a changed head; it does not manufacture
webhooks or mark live acceptance complete from fixtures.

## Deterministic NOT_PROVEN remediation

Hosted run/read JSON responses add `remediation` alongside the unchanged
`receipt`, `current`, and `gate`. Account receipt summaries expose the same view.
It is a version-1 derived presentation object, described by
`remediation.schema.json`; it is not added to immutable receipt evidence or its
fingerprint. Older consumers can continue reading the existing fields. Historical
bodies and merged-record snapshots are not rewritten. Saved receipt HTML derives
remediation conservatively without asserting a live policy or automatic tracking.

Each item carries `reasonCode`, `summary`, `whatHappened`, `whyItMatters`,
`nextAction`, `automaticRecheck` (state, events, text), `mergeConsequence` (state,
text), and `policyBlocksGap`. Unknown reasons get a generic explanation with no
invented fix. The view is null for VERIFIED, FAIL, or STALE currentness.

Automatic recheck requires an open tracked PR, configured App/webhook credentials,
and a known handled event for that gap. Text promises queueing **when the event is
received**, not event delivery or successful completion. Unsupported gaps have no
known automatic remediation trigger. Receipt freshness is never inferred from
age or a saved CURRENT value. Policy failure plus a required check is reported as
blocking only at a current observation; unconfirmed currentness or requirements
remain unknown. Check publication and GitHub's ultimate merge decision remain
external to this presentation layer.

HTML puts actions first and technical evidence in a disclosure. GitHub Checks
show at most three gap/action summaries and direct readers to the full receipt.
This layer changes no evidence collection, verdict, policy, billing or permissions.

### Ruleset-only protection

GitHub's paginated `GET /repos/{owner}/{repo}/rules/branches/{branch}` supplies
active applicable rules across repository and organization levels, including
GitHub's ref targeting. Evaluate/disabled rules are excluded by GitHub. Merge
Proof uses that result instead of approximating GitHub's pattern matching.
Classic and ruleset requirements are combined: required checks retain publisher
bindings, approval counts take the maximum, and strict/stale-review requirements
accumulate. The existing receipt gate is excluded only as its own delivery check.

For a protected branch whose classic REST protection returns 404, Merge Proof
queries the exact GraphQL ref's `branchProtectionRule`. Only an error-free,
identity-matching response with an explicit null establishes classic absence.
A denied read, partial response, missing field, or existing classic rule remains
unavailable. An unavailable active-rules read still blocks proof independently.
Both observations participate in the existing consistency/freshness checks.

Unsupported signatures, linear history, deployments, required workflows, code
scanning, review threads/teams, code-owner/last-push evidence, restricted updates,
ALLGREEN other-entry evidence, unknown rule types and malformed requirements remain unproven. No bypass
entitlement or ruleset administration is inferred. GitHub remains merge authority.

References: [applicable branch rules](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch),
[GraphQL Ref](https://docs.github.com/en/graphql/reference/git#ref),
[ruleset rule semantics](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
