# Merge-Proof ops-hardening evidence — 2026-10-05

Scope: existing Early Access production backup/recovery, current-status reconciliation, daily-health procedure/proposal, and proposal-only `main` protection. No product feature, offer, pricing, customer data, production policy, L3 authority, or merge behavior changed.

## Backup and isolated restore

- Production source/release: `b31215adadfb29718069155ad0954aebde8b2c70` / `main-b31215ad`.
- Writer fence: 1.574 seconds; service restarted immediately, active, zero automatic restarts.
- Snapshot timestamp: 2026-10-05T22:50:14Z / 2026-10-05T17:50:14-05:00.
- Archive bytes: 5,120,325.
- Archive SHA-256, equal on production and off-host storage: `f010b1c244401e792e421354897297e041dd5654589f537518f9b1b8b9dc669a`.
- Off-host location and receipt-level lists remain private and outside this repository.
- Production has no configured customer `mirrorRoot` and no persisted bare customer repository. A fresh off-host bare mirror of the authoritative product repository passed `git fsck --full`; `main` is `b31215adadfb29718069155ad0954aebde8b2c70`, tree `fb65a74958defc88f8db239781670901a2614036`.
- Restore destination was a new mode-0700 scratch directory; production was never used as a restore target or opened from restored state.
- Both restored state files parsed.
- Restored state: 969 active receipts, 1,373 archived receipts, 3 accounts, 3 installations, 11 trial proof debits.
- Archive replay classification: 373 `CONSISTENT_OFFLINE`, 1,000 legacy `UNSUPPORTED`, 0 replay failures, 0 parse failures.
- Ten current-policy receipts were sampled from the all-row replay pass; all were `CONSISTENT_OFFLINE`.
- The full 1,000-ID legacy list is retained privately beside the backup, not committed or printed.
- The shipped strict exporter was exercised against the scratch restore and failed closed as expected with `BACKUP_REPLAY_FAILED`; proof semantics were not weakened.

Result: **RESTORE_VERIFIED_WITH_LEGACY_UNSUPPORTED**. Restored currentness remains `NOT_PROVEN`.

## September Healthchecks cause

Retained authority: `acceptance-evidence/l3-closure-2026-09-26/monitor-live-acceptance.json`.

- The checks were exercised by nonproduction AWS host `i-05a6101c6b4fc9346`, not the DigitalOcean Early Access production service.
- A deliberately stale recovery backup emitted the backup failure at 13:16 CT on September 26. A new independently confirmed recovery manifest produced down-to-up recovery at 13:19.
- Successful service/backup pings followed at 13:21 and from the one-minute timer at 13:22.
- The bounded timer was then intentionally stopped and left disabled. The provider subsequently saw missed heartbeats; the roughly nine-day reported service-down duration does not establish production service downtime.

Cause: bounded nonproduction acceptance followed by an intentionally disabled timer, plus the deliberately induced first backup failure. Continuous production Healthchecks coverage is `NOT_PROVEN` until separately authorized.

## Post-backup health snapshot

- Service active; zero automatic restarts; zero failed units.
- Warning-or-higher service logs: zero over 24 hours and seven days.
- Proof, landing, group, retraction, and push queues: all zero.
- Delivery: `RECONCILED`; latest scan was within five hours.
- Subscription refresh: 6 `CURRENT`, 2 `TRIAL_EXPIRED`, 0 `UNAVAILABLE`.
- Eighteen retained landing retry records are all at the bounded three-attempt limit; active landing queue is zero.
- Disk: 7%; available memory approximately 1.46 GiB at observation.
- Active/archive receipt counts matched the isolated restore.

## Documentation and proposals

- `docs/current-truth/STATUS.md` now identifies `b31215ad`, tree `fb65a749`, release `main-b31215ad`, exact-main CI run `36636089735`, fresh recovery evidence, and exact L3 Requirement #2 `NOT_PROVEN` boundary.
- `github/operations/EARLY-ACCESS-DAILY-HEALTH.md` establishes the manual daily procedure and stop conditions.
- `github/operations/proposals/` contains an inactive, reviewable systemd health script/service/timer proposal. Nothing was installed or enabled and no production Healthchecks endpoint was pinged.
- `github/operations/MAIN-PROTECTION-PROPOSAL.md` and `proposals/main-ruleset.json` record current provider state and the exact unapplied policy payload.

## Focused verification

- `node --check github/operations/proposals/early-access-health.js`: pass.
- Proposed ruleset JSON parse: pass.
- `docs/current-truth/STATUS.md`: contract pass at 914 words, within its 1,000-word limit.
- `node --test github/test/operations-backup.test.js github/test/operations-healthcheck.test.js`: 17/17 pass.
- `npm test`: core 27/27 and pilot report 10/10 pass.
- `npm run test:github`: 428/428 pass when run independently with localhost binding available. The sandboxed attempt produced 18 `listen EPERM` environment failures; the identical suite was rerun outside that restriction and passed cleanly.
- `npm run test:factory`: 37/37 pass when run independently.
