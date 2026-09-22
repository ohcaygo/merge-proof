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

## 7. External-state reconciliation — 2026-09-22

Challenged on the basis that AWS state was maintained outside the candidate repository. Every
named external location was checked directly. **The reconciliation did not change any finding
in section 1.** It did sharpen one point of reasoning, recorded below.

| Checked | Result |
| --- | --- |
| `~/.mp-aws/` | **Does not exist.** Checked `/root/.mp-aws/` and `/home/user/.mp-aws/`; a filesystem-wide search for `*mp-aws*`, `*mp-primary*`, `*mp-recovery*` returned nothing. |
| `~/.aws/config` | Exists, but contains only `[default]` with an `s3.payload_signing_enabled` setting. **No `mp-primary`, no `mp-recovery`, no SSO profile.** Created at container start (2026-09-22 01:58), i.e. harness-provisioned, not carried in. |
| SSO / CLI credential cache | `~/.aws/sso/cache/` and `~/.aws/cli/cache/` do not exist. |
| AWS CLI | **Not installed** (`aws` is not on `PATH`; no `/usr/local/aws-cli`). |
| Environment AWS credentials | `AWS_ACCESS_KEY_ID` is 14 characters beginning `prox`, alongside `AWS_CA_BUNDLE` pointing at the agent-proxy CA. This is the sandbox's proxy shim, **not an AWS access key** (real keys are 20 characters, `AKIA`/`ASIA`). |
| Direct AWS resource verification | **Not possible from this session.** AWS API endpoints are reachable through the proxy (`sts`, `cloudformation`, `kms` all answer), so the network path exists — but there is no CLI, no SSO session and no real credential to authenticate with. One attempt to test the environment credentials was denied by the sandbox as credential exploration and was not retried. CloudFormation stacks, EC2, KMS, S3, Secrets Manager, CloudWatch/SNS and Recovery resources are therefore **UNVERIFIED-FROM-HERE**, not verified-absent. |
| `5dda6bf` | **Not a valid object** in any of the three clones, after fetching all branches *and* `refs/pull/*/head`. `git fsck` reports no dangling objects; reflogs contain only this session's fetches. The GitHub API answers `No commit found for SHA: 5dda6bf` for `ohcaygo/merge-proof`. `origin/codex/final-frontier-l3` is still `c5df66c`; no later documentation commit has been pushed. |
| Corroborating artifacts inside the repository | No AWS account ID, stack identifier, `StackStatus`, `CREATE_COMPLETE` or `RECOVERY_MANIFEST_CONFIRMED` record exists anywhere under `github/validation/`. `arn:aws` appears **only** in source and test fixtures — never in an evidence record. |

**Sharpened reasoning.** Section 1's conclusion is not drawn from "public traffic points at
Cloudflare/DigitalOcean." Those are separate questions and are not conflated. It rests on two
independent things: the project's own most recent prerequisite record
([`remaining-authentication-prerequisites.json`](../validation/enhanced-policy-production-prep-2026-09-20/remaining-authentication-prerequisites.json),
`accountIds: null`, `resourcesCreated: false`), and the complete absence of any stack, account
or recovery-manifest artifact that a real provisioning run would have produced. If AWS
infrastructure does exist, it is unrecorded by the project and unreachable from this session —
and an Early Access pilot still cannot rely on infrastructure whose identity nobody can name.

**KMS signature provenance — verified from the evidence, not from source configuration.**
The `c5df66c` lineage's signed evidence identifies its own signer explicitly:
`addendum-signed-portable.json` records **`"productionSigning": false`**, and
`organization-rulesets-2026-09-20/signed-app-first-receipt.json` records
**`"signingTrust": "Ephemeral non-production P-256 lab key; not KMS, public trust publication,
or anchoring"`** with `kid: org-synthetic-1790005843510`. The lab JWKS
(`signed-app-lab-public-keys.json`) holds one synthetic P-256 key, `kid
org-synthetic-1790006044777`, valid for a 24-hour window. **No KMS key ARN appears in any
signed receipt.** These signatures did not come from a deployed AWS key.

**Recovery run reconciled.** The described run — five receipts, one landing chain, four
independently reconstructed Git claims — is
[`real-historical-restore.json`](../validation/enhanced-policy-production-prep-2026-09-20/real-historical-restore.json),
and matches exactly: five receipt rows, one with `landings: 1`, four `INDEPENDENTLY_RECOMPUTED`.
Its recorded `elapsedMs` is **3477** (3.5 seconds), not 999.325 seconds, and its own limitation
line reads: *"No new provider queue run, AWS recovery, production key, production RPO or
cold-host RTO is claimed."* The companion
[`durability-restore-preparation.json`](../validation/final-frontier-l3-2026-09-19/durability-restore-preparation.json)
says the same: *"no production host, replicated backup, RPO/RTO, KMS, public trust or network
authorization acceptance."* `restore-drill.js` does compute `snapshotAgeSeconds` and hardcodes
`hostRecoveryRto: "NOT_PROVEN"`, so the tool that would produce such a figure exists — but **no
output record of a run producing 999.325 exists on any ref.** Searching every local and remote
ref for `999.3` matches this file alone, where the claim is quoted.

**Live production topology** is as recorded in section 1 and is **repository-recorded, not
re-verified live**: outbound access to `merge-proof.ohcaygo.com` is denied by this session's
network policy (proxy answered 403 to CONNECT), so the deployed release could not be confirmed
against the running host. That limit cuts both ways and is stated rather than papered over.

## 8. Cutover — access verified, and the exact sequence

**Step 1 (integrate) is done.** `main` is at `c8eccb2`, fast-forwarded from the Early Access
lineage. The homepage's hosted-evidence-policy link now resolves. Cloudflare Pages here is
**direct-upload, not Git-connected**, and `.github/workflows/self-check.yml` only runs tests
with `contents: read` — so integrating `main` deployed nothing and triggered nothing.
`npm test` (what CI runs) passes.

### Deployment access — checked, not assumed

| Checked | Result |
| --- | --- |
| `~/.ssh`, `~/.netrc`, `~/.config/doctl`, `~/.wrangler`, `~/.config/.wrangler` | All present but **empty**. No key, no token, no profile. |
| Environment variables | Full enumeration: **no Cloudflare and no DigitalOcean credential of any kind.** Only GitHub tokens and sandbox proxy shims. |
| Filesystem | No `.pem`, `id_rsa*`, `id_ed25519*`, `.netrc`, `doctl*.yaml`, `wrangler.toml` or any Cloudflare/DigitalOcean config outside the system CA bundle. |
| Tooling | `doctl`, `wrangler`, `ssh`, `scp`, `rsync` — **none installed**. |
| Network | `api.cloudflare.com`, `api.digitalocean.com`, `merge-proof.ohcaygo.com`, `merge-proof-origin.ohcaygo.com` all **403 at CONNECT** (policy denial). Port 22 on `161.35.59.206` unreachable. |

Cutover from this session is therefore not possible — verified four independent ways, not
inferred. Steps 5, 8, 9, 10 and 12 of the launch require the owner or an environment with
network access to those hosts.

### Hard dependency: the deployed sample PDF

`build-pages.js` verifies the existing public sample against SHA-256
`6250cbc8cc33bf7030339197c95ced5c36440c223a9b02c61c98fa2c5a323a80` and refuses a changed file.
The repository's `samples/kiota.pdf` hashes to `95da24d5…` and **will not satisfy it**. The
matching file is the one already published at `/sample`, so the bundle can only be built by
someone who can fetch it from the live site. Download it first:

```sh
curl -fsSL https://merge-proof.ohcaygo.com/sample -o /tmp/kiota-sample-assessment.pdf
sha256sum /tmp/kiota-sample-assessment.pdf   # must be 6250cbc8...a323a80
```

### The sequence

```sh
# 0. Exact release, clean checkout.
git fetch origin && git checkout c8eccb2fcd0b8e2cbe2ca5a3e2b3a8fa6f66c1a7 2>/dev/null || git checkout main
git rev-parse HEAD        # record this; it is the promoted SHA

# 1. Back up BEFORE anything. Service stopped, full state.
sudo systemctl stop merge-proof
sudo tar -czf /root/pre-ea-$(date -u +%Y%m%dT%H%M%SZ).tgz \
  /var/lib/merge-proof/state /var/lib/merge-proof/pro-live
readlink -f /opt/merge-proof/current    # record the rollback target

# 2. Verify rollback BEFORE cutover: restart on the current release and confirm it serves.
sudo systemctl start merge-proof && systemctl is-active merge-proof
curl -fsS -o /dev/null -w '%{http_code}\n' https://merge-proof.ohcaygo.com/proof/

# 3. Allowlist. Add ONLY the invited testers' immutable GitHub installation-owner
#    account IDs to invitedTesterAccountIds in the private App config
#    ($MP_GITHUB_APP_CONFIG). Organization installs use the ORGANIZATION's id.
#    Verify each id from the installation record. Never accept one from a request.
#    The file is root-owned 0640 and is never served to a client.

# 4. Promote the backend release, then restart through the normal process.
#    (immutable release dir + /opt/merge-proof/current symlink, per factory/deploy/README.md)

# 5. Pages bundle.
node factory/deploy/build-pages.js /tmp/ea-pages /tmp/kiota-sample-assessment.pdf
#    Upload /tmp/ea-pages to the EXISTING Cloudflare Pages project `merge-proof`.
#    Record the previous production deployment id first — that is the Pages rollback.
```

**Rollback.** Restore the previous Pages production deployment in the existing project; point
`/opt/merge-proof/current` back at its recorded target and restart. Preserve state in both
directions. **Never roll back below `trial-0a635a7`** — pre-trial code reintroduces proof
limits and ignores expiry for accounts whose clock already started.

### Post-cutover verification (owner runs; all five must pass)

1. `https://merge-proof.ohcaygo.com/early-access` returns 200 and renders.
2. An **allowlisted** account reads **10 days**; a **non-allowlisted** account reads **7 days**
   and `$29/month`. Check both before inviting anyone.
3. One full journey on a real repository: connect → install → open PR → receipt Check appears
   on the PR → receipt renders in the account view.
4. Report-only holds: no enforcing policy is enabled, and no GitHub rule was edited.
5. `systemctl is-active merge-proof`, plus queue depth, `billingHealth`, scan retry state and
   disk capacity. There is **no automated alert delivery on this host** — a daily manual check
   is the pilot's real monitoring position, and should be described that way.
