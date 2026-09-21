# Hosted trial, version 1

The public/default offer is seven calendar days from the first CURRENT, collection-complete VERIFIED
or NOT_PROVEN hosted receipt. FAIL, unavailable collection, stale completion,
OAuth, repository authorization and historical scans do not start time. The
single writer saves the trial start, completion identity and receipt in the same
fsynced snapshot. All installations of the same immutable GitHub owner share one
trial. Reinstall, restart and same-head refresh cannot reset it. Existing accounts
without a trial start get their clock on their next successful proof, not on
migration. Existing paid accounts retain paid entitlement.

A trusted server-side account allowlist may assign an invited account a persisted
ten-day report-only offer; it is never client-controlled or exposed. Public
metadata remains the seven-day offer.

Before an invited tester's first qualifying receipt, put the immutable GitHub
installation-owner account ID in the private App configuration's
`invitedTesterAccountIds` array. An organization installation uses the
organization's ID, not the installing person's ID. Verify that identity through
the installation record; never accept an ID from an unauthenticated request.
All installations for that account share one trial. Restart the service through
the normal release process to load a changed allowlist. Existing trial deadlines
are preserved, including seven-day trials that have already started; removing
and re-adding an account cannot restart or extend them. No invitation email or
paid subscription is created by this setting.

Trial and paid Pro allow hosted proofs without customer proof credits. Internal
receipt, subscription, delivery, concurrent-worker and GitHub API budgets remain.
Historical metering and top-up payment records remain intact; old payment
fulfillment still reconciles. New top-up purchases are retired. No SKU or Stripe
price changes: fetched paid invoices for the existing $29 monthly licensed price
activate Pro. Redirects never activate access. Active developer quantity and
confirmation rules remain; initial discovery records the observed PR author's
original opening time, so merely discovering an old PR does not fabricate recent
activity. No card and no automatic payment at trial end.

Signed installation/repository-added events durably queue discovery of existing
open PRs. Discovery retries provider failures, uses an installation token scoped
to the exact repository and rechecks access. Authorized account reads also enroll
existing PRs. Empty repositories wait for ordinary PR events. Existing bounds are
100 tracked PRs and five pages of 100 discovery rows; a capacity failure remains
visible in activation state, never reported as complete. Multi-repository installs
are watched even without choosing each repository on the hosted page.

Days 1–4 have a quiet expiry date. Default accounts see progressive notices on days
5, 6 and 7; an invited ten-day account sees them on days 8, 9 and 10. The existing
five-second worker
updates saved checks without new PR activity; failed delivery retries. No email
transport exists in this product, so no email platform or unsolicited email is
introduced. At expiry, proof collection pauses, including repeats of already
accounted heads. Historical receipt retrieval still rechecks repository access.
Checkout fulfillment resumes tracked paused work.

## Required-check safety

Trial is report-only. Both the HTTP mutation and service policy setter reject new
enforcement without active paid Pro. GitHub rules are never changed. The app
explains that administrators must not require the trial check and that a manually
required check must be removed before expiry or continued on Pro.

Previously saved enforcing policies remain enforced. Before expiry, native and
hosted notices say subscribe OR remove the required check in GitHub Settings →
Rules / Branches. On expiry the saved check says TRIAL ENDED and explicitly fails
under an enforcing policy. Subsequent PR/head/group events publish only an expiry
notice on the current head/group, not a proof or a false passing result. Report-only
expiry notices are neutral, consistent with the existing advisory policy.

This prevents silent stranding, not every possible merge block. An administrator
who independently requires a check in GitHub must subscribe or remove it. We
cannot guarantee unblock without their action and do not hide that limitation.
GitHub/provider outage or revoked App permission can prevent notice delivery;
normal permission and availability limits still apply. No trial expiry changes a
historical verdict or weakens an enforcing check to neutral/skipped/success.
See https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks.

## Funnel contract

Operational events are in `state.json.lifecycle`, schema_version 1, using stable
hashed event IDs and server UTC occurrence times. Existing acquisition summary
counts are preserved. No source contents, commit messages, emails, OAuth tokens,
raw referrers or advertising click IDs enter these events. Identifiers are the
existing immutable GitHub account/installation/repository IDs, receipt IDs and a
random OAuth journey digest. Acquisition source is allowlisted x/other/direct;
unknown is explicit where no connection established attribution.

| Event | Definition / deduplication |
| --- | --- |
| trial_cta | Login CTA accepted; once per OAuth journey |
| github_connected | OAuth completed; once per journey |
| installation_available | Connected user sees App installation; once per journey |
| account_connected | Authorized repository access links journey to paying account |
| app_installed | Installation first observed by signed lifecycle or authorized access; once per installation |
| repo_authorized | Repository authorized by signed lifecycle or user/App intersection; once per installation/repo |
| first_successful_proof | First completion that starts a trial; once per account |
| trial_started | Atomic clock start with startedAt, endsAt; once per account |
| hosted_proof_completed | First successful observed installation/repo/PR/head key; once per key |
| proof_observed | Completed hosted receipt with verdict; once per receipt, including manual refresh |
| evidence_changed | Accepted relevant signed GitHub event invalidates evidence; once per delivery, not necessarily an existing receipt |
| automatic_proof | Worker completed receipt and publication; once per receipt |
| checkout_started | Provider returned valid checkout URL; once per purchase |
| pro_activated | Fetched verified paid period; once per account/period, renewals included |
| trial_expired | Clock elapsed and hosted access paused; once per account, recorded on next worker/read observation |
| trial_notice | Final three trial days/expiry notice processed per tracked PR; once per day/PR |

Stages are not all unique people: report event and distinct account counts, never
claim clicks, sessions, trial starts and paid renewals are interchangeable. Join
journey to account with account_connected; automatic events carry the account's
first connected source. Aggregate export resolves unknown earlier account events
against that source. A receipt verdict NOT_PROVEN is not a prevented bug. These
records support OHCAYGO consumption without giving OHCAYGO product authority here.

Read-only supported export (UTC start inclusive/end exclusive):

```
node github/funnel-export.js /var/lib/merge-proof/pro-live/state.json 2026-09-12T00:00:00.000Z 2026-09-20T00:00:00.000Z x
```

Omit date/source arguments for all rows. Output is JSON grouped by day/source/stage
with event and distinct-account counts, no account IDs or receipt contents. Treat
zero observed conversions as zero; test/sandbox ledgers must never be imported into
production. Experiment decision: seven days from actual value, evaluate funnel
and repeat automatic proof behavior before changing the offer.

## Deployment / rollback

Use the existing immutable backend release, isolated Linux acceptance and symlink
promotion. Preserve full factory and Pro snapshots before promotion. Do not copy
disposable acceptance state to live. Front-door campaign/homepage copy is a separate
lane and must wait for production acceptance.

Rolling back to pre-trial code while retaining trial users would reintroduce proof
limits and ignore expiry. Therefore retain a trial-compatible release for future
rollback. Before the first promotion, keep the previous release and pre-promotion
snapshot for evidence, but never restore an old snapshot over newly written
receipts/payments. If the new runtime cannot serve, stop hosted processing pending
a forward fix rather than run pre-trial automation against trial-bearing state.
