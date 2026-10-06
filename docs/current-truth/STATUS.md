# Merge-Proof current status

**Updated:** 2026-10-05T17:54:08-05:00
**Source main commit:** `b31215adadfb29718069155ad0954aebde8b2c70`
**Authority:** Canonical compact repository/lifecycle state and task router. Fresh Git, GitHub, runtime, and provider evidence overrides this snapshot when they differ.

## Repository and lifecycle

- Authoritative repository: `https://github.com/ohcaygo/merge-proof`; default branch `main`.
- Refreshed remote `main`: `b31215adadfb29718069155ad0954aebde8b2c70`; tree `fb65a74958defc88f8db239781670901a2614036`.
- Current `main` implements P0-P3: Merge Truth, Evidence Chain, unsigned Replay Packet, Provider History, and downstream Independent Git Verification. Provider facts remain provider-trusted; packet provenance remains unsigned.
- Production runs `/opt/merge-proof/releases/main-b31215ad`; `DEPLOYED_COMMIT` matches the source SHA above. Public `/`, `/proof/examples/verified`, `/proof/examples/fail`, and `/proof/examples/not-proven` returned HTTP 200.
- Exact-main GitHub Actions run [`36636089735`](https://github.com/ohcaygo/merge-proof/actions/runs/36636089735) completed successfully with all nine jobs passing.

| State | Current `main` | Production / acceptance truth |
|---|---|---|
| Implemented | Yes, exact landed tree | Exact source is live |
| Tested | Exact-main CI 9/9 | Current source checks succeeded |
| Independently reviewed | Candidate-specific reviews completed | Historical reviews do not approve later candidates |
| Merged | Yes, through `b31215ad` | Merge is not deployment authority |
| Deployed | Yes, exact source marker above | Early Access production is live |
| Accepted | Current buyer journey accepted | L3 remains incomplete |

## GitHub policy truth

Fresh read on 2026-10-05:

- `main` has no classic branch protection and no applicable ruleset.
- Active ruleset `23000277`, `Merge assurance temporary acceptance`, targets only two fixture branches.
- Disabled ruleset `23717603`, `L3 isolated signed queue fixture`, targets only its fixture branch.
- A minimal `main` ruleset is proposed in [`../../github/operations/MAIN-PROTECTION-PROPOSAL.md`](../../github/operations/MAIN-PROTECTION-PROPOSAL.md). It has not been applied.

## Active objective and finish line

Complete bounded Early Access operations, then invite 5-10 developers to test installation, first-proof value, comprehension, landing, return use, and price acceptance. Do not add P4/P5 depth without customer or provider evidence.

## Level 3 and external gates

L3 is **NOT COMPLETE**. Authoritative retained evidence is `acceptance-evidence/l3-closure-2026-09-26/FINAL-CURRENT-TRUTH.md`.

- Requirement #1, Differential Lab, is **CLOSED** by scheduled run `36340809936` against exact candidate `f0a4f353`: 389/389 tests, isolation, baseline comparison, retained provider report, and zero alarms passed.
- Requirement #2, Operational Acceptance, is **NOT_PROVEN**. The exact remaining evidence is: **Reserved production schedule and 30-day COMPLIANCE retention activation.** RPO, cold-host RTO, lifecycle, restore integrity, isolation, external failure/recovery signaling, a real monitor-timer firing, encrypted EBS snapshot acceptance, and the completed full delivery-history traversal passed.
- Requirement #3, Positive Coverage, is **EXTERNALLY_BLOCKED / NOT_PROVEN** under the frozen GitHub Code Quality `ALL_REPORTS` contract. Do not reinvestigate it without materially changed provider capability.
- Requirement #4 is closed. Requirements #5 and #6 remain prepared / `NOT_PROVEN`; no L3 trust publication, irreversible retention, cutover, or claim is authorized.

## Verification commands

Run from a full-history checkout with a supported Node version:

```sh
npm test
npm run test:factory
npm run test:github
node test/pilot-report.js --pdf
npm run report:sample
```

For release work, also run the exact live/provider/preflight checks required by the selected release packet. Tests, retained captures, browser rendering, recovery, and live provider acceptance are distinct evidence.

## Current operational evidence

On 2026-10-05 a consistent production snapshot was taken with the writer fenced for 1.574 seconds and restarted immediately. The 5,120,325-byte archive crossed the private SSH path with matching SHA-256 `f010b1c244401e792e421354897297e041dd5654589f537518f9b1b8b9dc669a`. An off-host bare source mirror passed `git fsck --full` and resolves `main` to the exact source/tree above.

The archive restored into a new mode-0700 scratch destination without touching production. Both state roots parsed. It preserved 969 active and 1,373 archived receipts, 3 accounts, 3 installations, and 11 trial proof debits. All archive rows parsed: 373 current-policy receipts replayed `CONSISTENT_OFFLINE`; 1,000 legacy receipts remain `UNSUPPORTED`; replay failures and parse failures were zero. The full legacy receipt list is retained privately beside the backup. The strict exporter still fails closed with `BACKUP_REPLAY_FAILED` on those legacy rows; semantics were not weakened.

Post-backup health was: service active, zero automatic restarts, zero failed units, zero warning-or-higher service logs over 24 hours and seven days, all five processing queues empty, delivery `RECONCILED`, disk 7%, and no subscription refresh state `UNAVAILABLE`. Eighteen retained landing-retry records are bounded historical max-attempt records; the active landing queue is empty.

The September Healthchecks incidents were generated by the bounded **nonproduction** L3 monitor, not by continuous production monitoring. A stale backup deliberately emitted the first backup failure at 13:16 CT on September 26 and recovered at 13:19. The one-minute monitor timer emitted successful service/backup pings at 13:21/13:22, then was intentionally stopped and left disabled. Later “down” time, including the roughly 9-day service interval, is missed-heartbeat time after disabling the timer; it does not prove a production outage. Continuous production Healthchecks coverage remains `NOT_PROVEN` until Ryan authorizes the proposed timer and production-scoped endpoints.

## Controlled Early Access operating gate

Run [`../../github/operations/EARLY-ACCESS-DAILY-HEALTH.md`](../../github/operations/EARLY-ACCESS-DAILY-HEALTH.md) once daily. Stop invitations if service, logs, queues, delivery, backup/restore, access, capacity, or production-scoped heartbeat checks cross the documented fail-closed thresholds. Restored facts are historical; their present currentness remains `NOT_PROVEN`.

## Task routing

- Product/verdict/claims: `PRODUCT.md`, `CLAIMS.md`, `MERGE-TRUTH-RECORD.md`.
- Replay/provenance: `REPLAY-PACKET.md`, `github/replay-packet.js`, `github/verifier/`, and relevant tests.
- GitHub proof/policy/currentness/landing: `github/README.md`, `github/PRODUCTION.md`, implementation, and `github/test/`.
- L3/recovery/release: `github/FINAL-FRONTIER.md`, `github/operations/`, and the exact retained validation record.
- Factory/hosted/billing: `factory/README.md`, `factory/ACCEPTANCE.md`, `factory/PUBLIC-LAUNCH.md`, source, and `factory/test/`.
- Independent review: `INDEPENDENT-REVIEW.md` is the authoritative pinned-candidate procedure. Prior reviews remain candidate-specific.

## Maintenance and live verification

Keep this file under 1,000 words. Update its timestamp and source commit whenever lifecycle truth changes. Before operational claims, verify live repository/ref/commit, checks, rulesets/protection, deployed identity, public rendering, and relevant provider or infrastructure state. If access is missing or evidence conflicts, report `UNKNOWN` or `NOT_PROVEN` and route to the deeper record; do not use this file as a historical ledger.
