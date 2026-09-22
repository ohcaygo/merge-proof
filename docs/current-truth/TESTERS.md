# Merge-Proof — Testers / Early Access

**Authority:** Cohort goals + soft-close. No private PII dumps.

## Goal

About **20 carefully targeted Early Access testers**, especially:

- agent-heavy developers
- founder/CTO engineers
- small AI-native engineering teams
- teams using multiple coding agents
- high-PR-volume teams
- platform/release/DevOps engineers
- skeptical senior engineers who understand Git/GitHub internals

Purpose is **not** vanity signups. Learn: install? first proof? meaningful catch/explain? understand VERIFIED/STALE/NOT_PROVEN? keep installed? $29 friction? what would make removing it feel irresponsible?

## Offer for invited testers

Intended **10-day** report-only trial for allowlisted accounts. Public offer remains 7-day / $29 (see [OFFER.md](./OFFER.md)).

## Soft-close until Ryan confirms EA live

> We’re finishing the new tester build now. Happy to send it over when it’s live.

No trial CTA/link as if ready. No fake urgency.

## Feedback (when live)

Repo ops: `support@ohcaygo.com` with “Early Access” in subject; GitHub issues; `ryan@ohcaygo.com` fallback; `SECURITY.md` for security-shaped reports.

## Prospect INPUT

Warm leads and soft packs live under `research/grok-inbox/` as **INPUT**, not established truth. Do not paste private customer data here.

## Live status (2026-09-22)

Controlled Early Access is **LIVE** (real-user journey verified). Invited term **10 days**. Outreach posts that include `https://merge-proof.ohcaygo.com/early-access` require Ryan’s green. Pack 63 / cold spray / Ads remain HOLD. Level 3 stays uncertified.

## Tester roster (safe metadata only)

| Tester | GitHub ID | Allowlist (`invitedTesterAccountIds`) | Source-review access | Term | Onboarding |
| --- | --- | --- | --- | --- | --- |
| `thatguyrw-boop` | `249527096` | Present (verified 2026-09-22) | n/a | 10-day invited | Journey verified 2026-09-22 |
| `nevqdev` (trusted technical tester/advisor) | `202348963` (verified via GitHub API 2026-09-22; not `neqdev`) | **Present** — added 2026-09-22 19:56 UTC; verified on host against live `b36a1bd` code/config: resolves to 10 days (non-allowlisted ID still 7); service restarted after write | `ohcaygo/merge-proof` **Read** invitation sent 2026-09-22 (invite `334272916`), **INVITATION PENDING** acceptance | 10-day invited; trial not started (starts at first qualifying receipt) | Allowlist live; onboarding message ready for Ryan to send |

Customer testing and source review are separate: `nevqdev` installs Merge-Proof on his own/synthetic repository, never on `ohcaygo/merge-proof`. Installing on an organization requires the organization's ID on the allowlist, not the person's.

### Extending a tester beyond 10 days

The product has no supported per-account extension or longer-term override. Per `github/TRIAL.md`, a trial deadline is persisted at first qualifying receipt; removing and re-adding an allowlisted ID cannot restart or extend it. Supported options: (1) delay — the clock starts only at the first qualifying receipt; (2) the tester continues on Pro ($29/month); (3) a bounded, reviewed product change adding an account-specific term override. Hand-editing the production store's `trial.endsAt` is not a supported procedure.
