# Controlled Early Access — readiness, blockers and owner runbook

**Date:** 2026-09-22. **Scope:** a limited, reversible, monitored pilot for **20 invited
testers**, explicitly separate from the September 26 final Level 3 certification.

**Level 3 is not complete and nothing here marks any Level 3 acceptance criterion passed.**
No acceptance criterion is weakened, redefined or waived by this document. The open Level 3
items recorded in [preparation](LEVEL3-PREPARATION.md) and the
[release packet](LEVEL3-RELEASE-PACKET.md) stay open exactly as written.

## 1. Verified repository and infrastructure truth

Checked directly against the repository and this container, 2026-09-22.

| Claim | Verified state |
| --- | --- |
| Handoff document `github/validation/aws-production-continuation-2026-09-21/candidate-c5df66c/controlled-early-access-handoff.md` | **Does not exist.** No such path on any ref of `ohcaygo/merge-proof`, `dupageinspect-beep/vera-mvp` or `dupageinspect-beep/skynet`. No `aws-production-continuation-2026-09-21` directory exists. The assessment below was therefore built from repository evidence only. |
| Candidate `c5df66c` | Exists: `c5df66c7a5fc19c142ba32cf232655c84d6fe88d`, tip of `origin/codex/final-frontier-l3`, 2026-09-21. Reachable only from that branch. |
| AWS production architecture | **No AWS resource exists.** [`remaining-authentication-prerequisites.json`](../validation/enhanced-policy-production-prep-2026-09-20/remaining-authentication-prerequisites.json) records `accountIds: null`, `resourcesCreated: false`, and primary sign-in only *started*. `prepare-infrastructure.js` emits CloudFormation and creates nothing. |
| Production KMS signing | **Not in service.** No key created, no live KMS call. `github/signing.js` `configured()` returns `null` when unconfigured, so hosted receipts are issued unsigned. The deployed release has no `github/signing.js` at all. |
| Recovery RPO "999.325s vs 900s target" | **Not corroborated.** That figure appears nowhere in the repository. No production recovery drill has been run, because no production recovery infrastructure exists. The 15-minute RPO / 4-hour RTO figures are *unmet targets*, per preparation step 9: "unachieved until measured." |
| Cold-host RTO | NOT_PROVEN — consistent with repository evidence. Unmeasured, for the same reason. |
| Signed queue-to-landed acceptance | Earned in the **lab**, with lab trust keys, on candidate `7953ecd`. The current candidate's signed queue journey is recorded NOT_PROVEN. Not repeated here. |
| Live production infrastructure | **Cloudflare Pages + DigitalOcean, not AWS.** Pages project `merge-proof`, `merge-proof.ohcaygo.com`; origin `merge-proof-origin.ohcaygo.com` on Droplet `598775880` (`merge-proof-factory`, NYC1, $12/month). Deployed backend release `/opt/merge-proof/releases/trial-0a635a7`, source `0a635a7f9035d027d97aad7b10287e7b925a0e4c`. See [deployment guidance](../../factory/deploy/README.md) and [trial acceptance](../validation/TRIAL-AUTO-ACTIVATION-001.md). |

The premise that Early Access can be deployed "using the existing AWS architecture" does not
hold: there is no deployed AWS architecture. Early Access, if it happens, happens on the
existing Cloudflare/DigitalOcean front door that already serves the live 7-day trial.

## 2. Are the open Level 3 items safety blockers to a 20-person pilot?

Assessed as pilot safety/integrity risk, not as certification completeness.

| Open item | Blocks final certification | Blocks a controlled 20-person pilot | Why |
| --- | --- | --- | --- |
| RPO target unmet/unmeasured | Yes | **No** | The pilot is report-only and makes no durability commitment. Receipts are re-derivable from GitHub, which remains the system of record. Worst case is losing recent receipts, not corrupting a customer repository. Requires the limitation to be stated to testers, which it now is. |
| Cold-host RTO NOT_PROVEN | Yes | **No** | The pilot carries no availability commitment. An outage pauses hosted proofs; it cannot change a GitHub rule or block a merge, because Early Access enables no enforcing gate. |
| Scheduled differential lab unfinished | Yes | **No** | Internal observation job. No customer-facing surface. |
| Final certification unfinished | Yes | **No** | Definitionally separate, provided nothing claims otherwise. The tester page states plainly that this is not a certified release. |
| Production signing not in service | Yes | **No, but it constrains the claims** | Unsigned receipts are still inspectable records. It is only unsafe if the product or its copy claims attestable signatures. It does not, and the tester page says so explicitly. |
| Positive coverage collection unimplemented | Yes | **No** | Fails closed to NOT_PROVEN. A missing claim is never a false positive. |

**No unresolved Level 3 item makes a controlled, reversible, report-only 20-person pilot
unsafe.** The fail-closed design is what carries this: every gap degrades to NOT_PROVEN, the
trial cannot enable enforcement, and Merge Proof never edits branch protection or rulesets.

## 3. What actually blocks Early Access

Two blockers, both owner-only. Neither is a Level 3 acceptance item.

**Blocker 1 — production cutover authority and credentials.** Promoting any release to
`merge-proof.ohcaygo.com` needs Cloudflare Pages access and SSH to Droplet `598775880`.
This session holds neither, and outbound access to `merge-proof.ohcaygo.com` is denied by
network policy (verified: proxy answered 403 to CONNECT). Production deployment/cutover is
also an explicitly reserved protected boundary under `AGENTS.md` and
[preparation](LEVEL3-PREPARATION.md). It cannot be delegated by inference.

**Blocker 2 — the invited-tester allowlist is private host configuration.** The 10-day offer
is granted by `invitedTesterAccountIds` in the private App configuration on the host
(see [TRIAL.md](../TRIAL.md)). It is deliberately never client-controlled or exposed, so it
can only be set by someone with host access. Until it is set, invited testers receive the
ordinary public 7-day offer — which is safe and correct, just not the intended 10 days.

**Minimum work to remove both:** section 5. It is a short, well-bounded owner session. No new
architecture, no AWS, no new spend, no permission change.

## 4. What is complete and ready

Product code for Early Access is implemented, tested and unchanged from `c5df66c`.

- **Invited 10-day trial.** `github/meter.js` validates the allowlist, freezes it at
  construction so configuration cannot change a live account's offer, and resolves 10 days for
  allowlisted owner IDs and 7 for everyone else. Started deadlines are persisted, so
  removing and re-adding an account cannot restart or extend a trial.
- **Correct copy before and after the clock starts.** `persistedTrialDays` falls back to the
  configured term, so an invited tester reads "Your 10-day report-only trial starts with…"
  before their first proof and "Your 10-day report-only trial expires at…" after it.
  Progressive notices move to days 8/9/10 for invited accounts.
- **Public metadata is unchanged at 7 days**, as [TRIAL.md](../TRIAL.md) requires. The public
  commercial offer remains a 7-day no-card trial and US$29/month per active developer.
- **Tester onboarding path** — new `factory/public/early-access.html`, served at
  `/early-access`, `noindex`, unlinked from site navigation, for people who received a direct
  invitation. It states the 10-day term and that it applies only to allowlisted accounts, the
  four install steps, what NOT_PROVEN means, the known limitations in section 1 including
  unsigned receipts and the absent recovery commitment, and the feedback path.
- **Feedback path** — `support@ohcaygo.com` with "Early Access" in the subject,
  `github.com/ohcaygo/merge-proof/issues`, `ryan@ohcaygo.com` as fallback, and `SECURITY.md`
  for anything security-shaped. No new external service and no email transport is introduced.

### Verification run in this session

- `node --test github/test/*.test.js` — 384 tests, **372 pass, 12 fail**. All 12 failures are
  `GIT_VERSION_OUTSIDE_ENVELOPE` in `github/test/chain.test.js`: this container has Git
  2.43.0 and the reconstruction envelope pins Git 2.50.1. This is the envelope refusing to
  reconstruct outside its pinned runtime — the intended fail-closed behavior — not a defect.
  The retained pinned-runtime evidence is
  [`linux-final-reconstruction.json`](../validation/final-frontier-l3-2026-09-19/linux-final-reconstruction.json).
- `node --test factory/test/*.test.js` — 37 tests, **36 pass, 1 fail**. `journey.test.js`
  reaches `REPORT_FAILED` because PDF export needs a Chrome sandbox this container cannot
  provide, and `src/pdf.js` correctly refuses to pass `--no-sandbox`. Chromium prints fine
  here *with* that flag, confirming the cause. The actual host's retained result is 34/34.
- Presentation checked at 1440px and 390px for `/`, `/early-access`, `/privacy`, `/terms`:
  document `scrollWidth` 375 against a 390 viewport, **no element overflowing the viewport on
  any page**. Header, navigation, stacked hero and full-width CTA render correctly at phone
  width. (Direct `--screenshot` output in this container is cropped and misleading; the
  measurement above was taken in-page.)

**Not verified, and not claimable:** anything requiring the live host — the deployed journey,
the real install flow, monitoring delivery, or any live receipt. Section 5 leaves those to
the owner session, where they are real.

## 5. Owner runbook — the remaining Early Access cutover

Everything below needs host access. Nothing below requires AWS, new spend, a permission
change, or any Level 3 gate.

**Precondition.** Integrate this Early Access lineage into `main` before inviting testers.
The homepage's hosted-evidence-policy link now points at `main` instead of a feature branch
(a branch-pinned link would rot); it resolves correctly once the lineage is on `main`.

1. **Pin the release.** Backend product code is unchanged from
   `c5df66c7a5fc19c142ba32cf232655c84d6fe88d`; this branch changes only the Cloudflare Pages
   front door and its build script. Record the exact SHA promoted.
2. **Back up first.** Stop the service, snapshot the full factory and Pro state
   (`/var/lib/merge-proof/...`) including the receipt archive and the billing ledger, and keep
   the release symlink's current target. Never restore an old snapshot over newer receipts.
3. **Set the allowlist.** Add each invited tester's **immutable GitHub installation-owner
   account ID** to `invitedTesterAccountIds` in the private App configuration. Use the
   *organization's* ID for an organization installation, not the installing person's. Verify
   each ID through the installation record; never accept one from an unauthenticated request.
   Restart through the normal release process to load it.
4. **Deploy the Pages bundle.** `node factory/deploy/build-pages.js <new-dir> <existing-sample.pdf>`
   (it now includes `early-access.html`; it verifies the sample PDF's SHA-256 and refuses a
   changed file), then upload to the existing `merge-proof` project. Keep the current
   production deployment ID for rollback.
5. **Smoke-test the tester journey from a clean profile** — visit, connect GitHub, install on a
   repository, open an eligible PR, confirm the receipt Check appears on the PR and the
   receipt renders in the account view. Confirm an allowlisted account reads **10** days and a
   non-allowlisted one reads **7**. Do this before the first invitation goes out.
6. **Invite at most 20 accounts**, sending each the `/early-access` URL directly.

**Rollback.** Restore the previous Cloudflare Pages production deployment in the existing
project; point the backend release symlink back to `/opt/merge-proof/releases/trial-0a635a7`
and restart. Preserve production state in both directions. **Do not roll back below
`trial-0a635a7`**: pre-trial code reintroduces proof limits and ignores trial expiry for
accounts that already started a clock. Treat any rollback across the neutral/failure change as
gate-affecting and notify any repository that requires the Check.

**Monitoring.** `healthcheck.js` and `monitor.js` on the candidate emit bounded operational
health signals with redacted logs; the prepared timers (five-minute backup, daily snapshot
retention, monthly restore, minute-level health, credential renewal) are **AWS-targeted and
inactive**, because no AWS resource exists. On the DigitalOcean host, operational inspection
today means the existing manual surface: queue depth, exhausted or failed refreshes,
`billingHealth`, scan retry state and disk capacity, plus the active
`merge-proof-certbot.timer`. **There is no automated alert delivery on the live host.** For a
20-person pilot, schedule a daily manual health check and say so rather than implying
paging exists.

**Backup/recovery during the pilot.** Keep taking the state backups in step 2 on a regular
cadence and keep them off the host. Record the actual backup age achieved. The 15-minute RPO
objective is **not met and not measured on production infrastructure**; record that as the
pilot's real durability position rather than restating the target.

## 6. Claims that must not be made during Early Access

- Not "Level 3 complete", "certified", or "production-certified".
- Not "signed receipts", "attestable" or "independently verifiable" for hosted Early Access
  receipts, while no production signing key is in service.
- No availability, recovery-time or recovery-point commitment.
- No claim that AWS infrastructure, cross-account backup, Object Lock retention or public
  trust publication is in service. None of it exists.
- Nothing that presents a 10-day term as the public commercial offer. The public offer is
  7 days, no card, then US$29/month per active developer.
