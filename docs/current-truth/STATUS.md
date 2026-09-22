# Merge-Proof — Verified status only

**Rule:** Only facts confirmable from git/repo/files, live host inspection, or explicit Ryan verification. If unknown, say UNKNOWN/UNVERIFIED. Do not invent production SHA, Level-3 completion, or live EA deploy.

**As of:** 2026-09-22 (clean Early Access cutover session + Ryan verification).

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
| Deployed backend commit | `d1ba274` (`d1ba274a613896d6afeebb6a7dd146d89c21528d`) | VERIFIED directly from DigitalOcean droplet `DEPLOYED_COMMIT` (clean EA cutover session 2026-09-22) |
| Production lineage branch | `codex/account-reload-closure` | VERIFIED |
| What that production tip contains | Live billing-evidence-collapse and account-reload-timing fixes | VERIFIED (present on `d1ba274`; absent from the divergent `main` lineage noted below) |

### Do not treat as current production backend

These are **not** the currently deployed backend:

- `origin/main` tip `288e0df` — **not deployed**; diverges from the production lineage
- `c5df66c` — Level-3 / acceptance candidate material; **not** production
- `9a35a7a` — **not** current production backend
- Any other Level-3 candidate SHA

## Early Access release (in progress — not live)

| Claim | State |
| --- | --- |
| Controlled EA release base | Being constructed from production `d1ba274` **plus only** the minimum invited-tester functionality |
| EA release live on host | **Not live yet** |
| Public trial / EA install path “live” for outreach CTAs | **UNCONFIRMED** until the live smoke journey passes — **Do not claim** |
| Soft-close until smoke passes | Use: “We’re finishing the new tester build now. Happy to send it over when it’s live.” |

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

## Immediate product job (ops reminder)

Finish the **minimal Early Access release on top of `d1ba274`**, smoke-test it, and get the first tester through. Do not redefine production as `main` / L3 candidates while that work is in flight.
