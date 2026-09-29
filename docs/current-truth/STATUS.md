# Merge-Proof current status

**Updated:** 2026-09-28T13:20:37-05:00
**Source main commit:** `3eb6977d3f18722eebc131dcee670c7a89e6b306`
**Authority:** Canonical compact repository/lifecycle state and task router. Fresh Git, GitHub, runtime, and provider evidence overrides this snapshot when they differ.

## Repository and lifecycle

- Authoritative repository: `https://github.com/ohcaygo/merge-proof`; default branch `main`.
- Refreshed remote `main`: `3eb6977d3f18722eebc131dcee670c7a89e6b306`; tree `2e9ff9cf224247f33892753753e2107c9c391e2e`.
- Current `main` implements P0-P3: Merge Truth, Evidence Chain, unsigned Replay Packet, Provider History, and downstream Independent Git Verification. Provider facts remain provider-trusted; packet provenance remains unsigned.
- Production runs `/opt/merge-proof/releases/main-3eb6977d`; `DEPLOYED_COMMIT` is the exact source SHA above. Production acceptance for this release is complete. Public `/` and `/early-access` return HTTP 200; anonymous private receipt and replay access return HTTP 403.
- The service was active with zero restarts, no failed units or warning-level service logs, empty processing queues, `RECONCILED` delivery health, and 7% disk use on this update. This is a point-in-time health observation, not continuous monitoring.

| State | Current `main` | Production / acceptance truth |
| --- | --- | --- |
| Implemented | Yes, exact landed tree | Exact source is live |
| Tested | Core 27/27; pilot 10/10; factory 37/37; GitHub 419/419; Chromium PDF 11/11 at deployment | Nine current-main GitHub checks succeeded |
| Independently reviewed | Candidate-specific reviews completed | Historical reviews do not approve later candidates |
| Merged | Yes, through `3eb6977d` | Merge is not deployment authority |
| Deployed | Yes, exact source marker above | Production acceptance complete |
| Accepted | Current buyer journey accepted | L3 remains incomplete |

## GitHub policy truth

Fresh read on 2026-09-28:

- `main` reports no classic branch protection.
- Active repository ruleset `23000277`, `Merge assurance temporary acceptance`, applies only to `codex/merge-assurance-acceptance-base` and `codex/ruleset-only-acceptance-base`; it requires two named checks and a merge queue.
- Ruleset `23717603`, `L3 isolated signed queue fixture`, is disabled and targets only its fixture branch.
- `main` has nine successful check runs at the source SHA. These facts do not establish a protected `main` policy.

Re-read GitHub before any PR, policy, approval, currentness, or landed-tree claim; rules and checks can change without a repository commit.

## Active objective and finish line

The current objective is a bounded Early Access cohort testing installation, first-proof value, comprehension, landing, return use, and price acceptance. Do not add P4/P5 depth without customer or provider evidence.

## Level 3 and external gates

L3 is **not complete or certified**.

- Requirement #1, Differential Lab, is **CLOSED** by scheduled run `36340809936` against exact candidate `f0a4f353`: 389/389 tests, isolation and baseline comparison passed with zero alarms; retained evidence was verified and the completed watcher was deleted.
- Requirement #3, Positive Coverage, is **EXTERNALLY BLOCKED** under the frozen provider-evidence trust contract. Do not reinvestigate it without materially changed provider capability.
- Requirement #5, Public Trust, remains **PREPARE ONLY**. No production signing, public JWKS/history, trust root, or anchoring is active.
- Requirement #6, L3 Production Acceptance, remains **PREPARE ONLY**. The current production deployment is Early Access product acceptance, not an L3 cutover.

Do not alter AWS, KMS, JWKS, anchoring, retention, GitHub policy/App permissions, authentication, or production without the separate authority named in the operational records.

## Verification commands

Run from a full-history checkout with a supported Node version:

```sh
npm test
npm run test:factory
npm run test:github
node test/pilot-report.js --pdf
npm run report:sample
```

For release work, also run the exact live/provider/preflight checks required by the selected release packet. Unit fixtures, retained captures, browser rendering, signed replay, recovery, and live provider acceptance are not interchangeable.

## Controlled Early Access operating gate

Run one manual check daily using the existing SSH identity and production state:

1. Confirm `/opt/merge-proof/current`, `DEPLOYED_COMMIT`, `systemctl is-active merge-proof`, restart count, failed units, and warning-or-higher service logs.
2. Report only aggregates: the five queues; subscription refresh states; landing retries; scan states; `deliveryHealth` and age; `billingHealth`; receipt/archive counts. Never print customer identifiers or evidence.
3. Confirm disk use below 70%, available memory, public `/` and `/early-access` HTTP 200, and anonymous known-private receipt/replay HTTP 403.
4. Fence the writer; archive both state roots; restart immediately; copy through the existing private SSH path to the off-host workspace; and match SHA-256 at both ends. Extract into a new mode-0700 destination. Require parseable state, expected roots, matching aggregates, and explicit replay classification. Never open it as a writer or replace newer state. Restored facts are historical; currentness is `NOT_PROVEN`.

Stop invitations and investigate if the service is inactive, a failed unit appears, restart count rises unexpectedly, warning logs are unexplained, any queue/retry remains stuck, a subscription is `UNAVAILABLE`, delivery is not `RECONCILED` or older than five hours, `billingHealth` reports `RECONCILIATION_UNAVAILABLE`, disk reaches 70%, access-control probes change, or the latest off-host restore fails.

**Current invitation gate: GO for the first 5-10 invited developers under this manual procedure.** On 2026-09-28 a fenced full-state snapshot crossed the existing off-host path with matching SHA-256 and restored cleanly in isolation. It preserved 907 active and 1,008 archived receipts, 3 accounts, 3 installations, and 11 trial proofs. All archive rows parsed: 8 current-policy receipts replayed `CONSISTENT_OFFLINE`; 1,000 legacy rows remain `UNSUPPORTED`. The shipped exporter still fails closed on those rows with `BACKUP_REPLAY_FAILED`; its failed candidate is named accordingly. This is an automation/legacy-compatibility limitation, not new replay evidence. Continue the manual daily check until resolved without deleting history or weakening semantics.

## Task routing

- Product/verdict/claims: `PRODUCT.md`, `CLAIMS.md`, `MERGE-TRUTH-RECORD.md`.
- Unsigned replay: `REPLAY-PACKET.md`, `github/replay-packet.js`, `github/test/replay-packet.test.js`.
- GitHub proof/currentness/policy/landing: `github/README.md`, `github/PRODUCTION.md`, implementation, and `github/test/`.
- L3 and release: `github/FINAL-FRONTIER.md`, `github/operations/LEVEL3-PREPARATION.md`, `LEVEL3-RELEASE-PACKET.md`, and the exact linked validation bundle.
- Factory/hosted/billing: `factory/README.md`, `ACCEPTANCE.md`, `PUBLIC-LAUNCH.md`, and `factory/test/`.
- Historical proof/research: route to the named record under `github/validation/`, `factory/review/`, `docs/research/`, or `research/`; never bulk-load or rewrite it as current state.
- Independent review: `INDEPENDENT-REVIEW.md` is the authoritative pinned-candidate procedure. Existing reviewer files are candidate-specific records, not reusable procedure authority; the OHCAYGO reviewer is not a substitute.

## Maintenance and live verification

Keep this file under 1,000 words. Update its timestamp and source commit whenever lifecycle truth changes. Before operational claims, verify live repository/ref/commit, checks/workflows/statuses, rulesets/protection, deployed identity, public rendering, and the relevant provider or infrastructure state. If access is missing or evidence conflicts, report `UNKNOWN` or `NOT_PROVEN` and route to the deeper record; do not make this file a historical ledger.
