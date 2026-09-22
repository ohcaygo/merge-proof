# Merge-Proof — Verified status only

**Rule:** Only facts confirmable from git/repo/files, live host inspection, or explicit Ryan verification. If unknown, say UNKNOWN/UNVERIFIED. Do not invent production SHA, Level-3 completion, or live EA deploy.

**As of:** 2026-09-22 (Early Access cutover + first real tester acceptance journey, verified live).

## Canonical product repository

| Field | Value | Confidence |
| --- | --- | --- |
| GitHub | `https://github.com/ohcaygo/merge-proof` | VERIFIED |
| Remote URL | `https://github.com/ohcaygo/merge-proof.git` | VERIFIED |
| Default branch | `main` | VERIFIED |
| Local Mac clone | `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof` | VERIFIED via Mac FS 2026-09-22 |
| Homepage metadata | `https://merge-proof.ohcaygo.com` | VERIFIED as repo homepage metadata |

## Current production backend (authoritative)

| Field | Value | Confidence |
| --- | --- | --- |
| Deployed backend commit | `b36a1bd` (`b36a1bd867f194e727e031bab9da630e899afcb4`) | VERIFIED directly from DigitalOcean droplet `DEPLOYED_COMMIT`, 2026-09-22 |
| Deployed release directory | `/opt/merge-proof/releases/earlyaccess-b36a1bd` | VERIFIED via `readlink -f /opt/merge-proof/current` |
| Base commit | `d1ba274a613896d6afeebb6a7dd146d89c21528d` | VERIFIED ancestor of `b36a1bd` (`git merge-base --is-ancestor`) |
| What `b36a1bd` contains | `d1ba274`'s billing-evidence-collapse and account-reload-timing fixes, **plus** transplanted Early Access invited-tester entitlement (not a wholesale merge of `main`) | VERIFIED — diff reviewed file-by-file against `d1ba274`, only 9 files touched |
| Cloudflare Pages production deployment | `72248ed4-841e-49d1-8ba2-d2c6c3c9d6d0` | VERIFIED via `wrangler pages deployment list` and live fetch of `merge-proof.ohcaygo.com/early-access` |

### Do not treat as current production backend

These are **not** the currently deployed backend:

- `origin/main` tip `288e0df` — **not deployed**; diverges from the production lineage; contains unrelated Level-3/AWS/ops-monitoring work not brought into `b36a1bd`
- `c5df66c` — Level-3 / acceptance candidate material; **not** production
- `9a35a7a` — **not** current production backend
- Any other Level-3 candidate SHA

## Early Access release — LIVE, first real tester journey verified

| Claim | State |
| --- | --- |
| Controlled EA release | **LIVE** at `https://merge-proof.ohcaygo.com/early-access`, backend `b36a1bd`, Pages `72248ed4` |
| Rollback points | Backend: release `billing-d1ba274` (untouched, present). Pages: deployment `e2f35281-6991-4691-98d4-cbb4c47911c1` (untouched, present) |
| First invited tester | `thatguyrw-boop`, GitHub user ID `249527096` (resolved from GitHub's public API), configured in `/etc/merge-proof/pro.json` `invitedTesterAccountIds` |
| First real tester journey | **VERIFIED**, 2026-09-22, real GitHub OAuth + real App install, scoped to a dedicated synthetic repo `thatguyrw-boop/merge-proof-ea-acceptance`, PR #1 (head `6e85dd609ef48cbe309a1968e262fd57dc9db464`). Real GitHub Check posted (`neutral`/report-only, as designed) and real receipt `6d9097fa-08f9-436b-be3e-72b5067f3459` issued, verdict `NOT_PROVEN` (correct — no required check configured on that throwaway repo, so nothing to prove; fail-closed behavior, not a defect) |
| Invited 10-day term | **VERIFIED live**, not just unit-tested: receipt and account dashboard both read "Your 10-day report-only trial expires at 2026-10-02T18:46:52.651Z" — exactly 10 days from the real first-proof timestamp |
| Public 7-day/$29 term | **VERIFIED unaffected**: `configuredTrialDays` exercised directly against the live deployed code and live config on the host (throwaway store, no real account touched) — non-allowlisted ID returns 7, unchanged copy/pricing elsewhere on the site |
| Outreach CTA status | Safe to say Early Access is live and the first tester journey passed. Do not yet claim Level 3 or make availability/signing guarantees — see below |

## Level 3 / AWS

| Claim | State |
| --- | --- |
| Level 3 certified / complete | **NOT certified complete** — remains separate from the Early Access release; do not claim |
| Production AWS migration complete | **Do not claim** |
| L3 / AWS evidence location | Protected outside this scoreboard at `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-l3-live-lab-2026-09-19/` (and sibling L3 dirs). Do not relocate/rewrite until deliberate archive/reconcile. |

## Shared-truth layout

| Path | Role |
| --- | --- |
| `docs/current-truth/*` | Established shared product/market/ops truth — overrides stale conversation assumptions |
| `research/grok-inbox/` | Grok INPUT only — does **not** automatically become truth |

## Local Mac pointers

| Path | Class / note |
| --- | --- |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof` | Class A canonical clone |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-archive-desktop-2026-09-22/` | Archived former Desktop working material |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/_private-do-not-commit/` | Class G secrets diverted here — never commit |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-l3-live-lab-2026-09-19/` | Class B PROTECTED L3 evidence |
| Sibling L3 dirs under OHCAYGO Foundry (`merge-proof-final-frontier-l3`, `merge-proof-l3-acceptance-c5df66c`) | Class B evidence — leave alone |

## Known limitations (state on the live tester page itself)

Not Level 3 certified; hosted receipts unsigned (no production KMS key in service, no published JWKS); no availability/recovery/retention commitment (single host, single writer, RPO/RTO unmet and unmeasured in production); coverage evidence bounded (no aggregate coverage claims; several policy shapes unsupported). None of this changed by the EA cutover.

## Immediate product job (ops reminder)

Early Access is live and the first real tester journey passed. Next: invite the remaining ~19 testers by resolving each one's real GitHub user/installation-owner ID and appending to `invitedTesterAccountIds` in `/etc/merge-proof/pro.json`, then restart the service to load it. Do not redefine production as `main` / L3 candidates.
