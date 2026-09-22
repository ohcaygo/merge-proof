# Merge-Proof — Verified status only

**Rule:** Only facts confirmable from git/repo/files or explicit Ryan/parent verification. If unknown, say UNKNOWN/UNVERIFIED. Do not invent production SHA, Level-3 completion, or live EA deploy.

**As of:** 2026-09-22 (GitHub API + Ryan/parent path steering; Mac land executed by parent Organic agent 2026-09-22).

## Canonical product repository

| Field | Value | Confidence |
| --- | --- | --- |
| GitHub | `https://github.com/ohcaygo/merge-proof` | VERIFIED (GitHub API) |
| Remote URL | `https://github.com/ohcaygo/merge-proof.git` | VERIFIED |
| Default branch | `main` | VERIFIED |
| Latest `main` SHA observed | `288e0df648ae5c7c43071f35cbcd53ff28f14df7` | VERIFIED via GitHub API 2026-09-22 (~08:44 CT / 13:44Z) |
| Parent / EA integrate note | Ops doc records `main` fast-forwarded through Early Access lineage; tip commit references integrate at `c8eccb2` then docs cutover sequence | VERIFIED from commit + `github/operations/EARLY-ACCESS.md` |
| Homepage | `https://merge-proof.ohcaygo.com` | VERIFIED as repo homepage metadata |
| Local Mac clone path | `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof` | VERIFIED via Mac FS 2026-09-22 (parent Organic) |
| Local Mac branch at handoff | `codex/account-reload-closure` (product work) | Per Ryan/parent — **do not commit shared-truth onto this branch** |
| Shared-truth target branch | `docs/current-truth-2026-09-22` from `origin/main` | LANDED 2026-09-22 on branch `docs/current-truth-2026-09-22` |

## Early Access / deploy

| Claim | State |
| --- | --- |
| EA product lineage integrated to `main` (code/docs for allowlist 10-day path, `/early-access` page) | Recorded in `github/operations/EARLY-ACCESS.md` (2026-09-22) |
| Production cutover to live host completed | **UNKNOWN/UNVERIFIED** — ops doc: Cloudflare/DO credentials absent in recording session; owner cutover still required |
| Live `/early-access` returns 200 | **UNKNOWN/UNVERIFIED** from this session |
| Public trial / EA install path “live” for outreach CTAs | **UNCONFIRMED** until Ryan says live — **Do not claim** |
| Deployed backend release named in ops doc | `/opt/merge-proof/releases/trial-0a635a7` (source `0a635a7…`) — repository-recorded; **not re-verified live here** |

## Level 3 / AWS

| Claim | State |
| --- | --- |
| Level 3 certified / complete | **NOT certified complete** — explicitly open; do not claim |
| Production AWS migration complete | **Do not claim** |
| AWS production resources | Ops doc 2026-09-22: project prerequisite record shows `resourcesCreated: false` / null account IDs; live AWS identity **UNVERIFIED-FROM-HERE**. Prefer NOT_PROVEN over marketing AWS as done. |

## Shared-truth layout (this initiative)

| Path | Role |
| --- | --- |
| `docs/current-truth/*` | Established shared product/market truth |
| `research/grok-inbox/` | Grok INPUT only — not established truth |

## Local Mac pointers

| Path | Class / note |
| --- | --- |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof` | Class A canonical clone (Ryan/parent) |
| `/Users/ryanwilliams/Desktop/Merge-Proof-Review/` | Class D working folder — archive target |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-archive-desktop-2026-09-22/` | Archive destination (create on Mac) |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/_private-do-not-commit/` | Divert Class G secrets (never commit) |
| `/Users/ryanwilliams/Documents/ChatGPT/OHCAYGO Foundry/merge-proof-l3-live-lab-2026-09-19/` | Class B PROTECTED — do not move/delete/rename/rewrite |
| Sibling L3 dirs under OHCAYGO Foundry (`merge-proof-final-frontier-l3`, `merge-proof-l3-acceptance-c5df66c`) | Class B evidence — leave alone |

Stale box scratch clone `/workspace/scratch/merge-proof` (if present) is **not** canonical — do not treat as the Mac worktree.
