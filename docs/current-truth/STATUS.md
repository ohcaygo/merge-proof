# Merge-Proof current status

**Updated:** 2026-09-27T12:51:01-05:00
**Source main commit:** `01a38366be4e51bc69ba04644f3247c70d19b950`
**Authority:** Canonical compact repository/lifecycle state and task router. Fresh Git, GitHub, runtime, and provider evidence overrides this snapshot when they differ.

## Repository and lifecycle

- Authoritative repository: `https://github.com/ohcaygo/merge-proof`; default branch `main`.
- Refreshed remote `main`: `01a38366be4e51bc69ba04644f3247c70d19b950` (`Merge approved P3 provider history candidate`). Working from another branch or clone does not change that authority.
- Current `main` implements P0-P3: the Merge Truth record, buyer evidence chain, unsigned deterministic replay packet, authoritative pinned-candidate review procedure, compact context routing, and provider-history reconciliation coverage beneath Merge Truth. The last recorded nine-job GitHub self-check applies to predecessor `c51c47c8fe6ca478f8b51cb95d613a69c0310a8f`; it is not promoted to the newer main SHA.
- Last directly verified production backend is `/opt/merge-proof/releases/earlyaccess-b36a1bd`, marker `b36a1bd867f194e727e031bab9da630e899afcb4`. Public `/`, `/proof/`, and the sample PDF returned HTTP 200 on this update. The public service does not expose a source SHA, so current `main` is **not proven deployed**.
- Controlled Early Access was accepted on 2026-09-22 for its bounded real-user journey. That acceptance does not prove continuous health, current-main deployment, or L3 completion.

| State | Current `main` | Production / acceptance truth |
| --- | --- | --- |
| Implemented | Yes, in the landed tree | EA subset is live; L3 code is not proven live |
| Tested | Current-main provider checks are **NOT_PROVEN** in this snapshot; candidate suites must be run directly | Prior bounded live/lab evidence remains scoped to its named candidate |
| Independently reviewed | Procedure candidate was reviewed before merge; later candidates require their own review | Historical reviews do not approve later candidates |
| Merged | Yes, through `01a38366` | Merge is not deployment authority |
| Deployed | **NOT_PROVEN** | Last direct backend identity is `b36a1bd` |
| Accepted | **NOT_PROVEN** for current main and L3 | Controlled EA journey only |

## GitHub policy truth

Fresh read on 2026-09-27:

- `main` reports no classic branch protection.
- Active repository ruleset `23000277`, `Merge assurance temporary acceptance`, applies only to `codex/merge-assurance-acceptance-base` and `codex/ruleset-only-acceptance-base`; it requires two named checks and a merge queue.
- Ruleset `23717603`, `L3 isolated signed queue fixture`, is disabled and targets only its fixture branch.
- `main` has nine successful check runs at the source SHA and no commit-status contexts. These facts do not establish a protected `main` policy.
- PR `#11` remains open on the old production-lineage branch. Do not treat it as current deployment or integration authority.

Re-read GitHub before any PR, policy, approval, currentness, or landed-tree claim; rules and checks can change without a repository commit.

## Active objective and finish line

The active product objective is one truthful buyer path from evaluated candidate through bound evidence/authority/currentness to landed content and reproducible replay. P0-P3 are present on `main`; release completion still requires an exact candidate, full regression and adversarial verification, an applicable independent review, deliberate integration/deployment authority, and controlled hosted acceptance. A documentation or context change must not move any product lifecycle state.

## Level 3 and external gates

L3 is **not complete or certified**. The reviewed L3 closure tree landed through `2e6bf02`, but current `main` is newer. Retained evidence now supports cold-host recovery and delivery reconciliation within their recorded bounds. Remaining established gates include:

- one successful actual scheduled differential-lab event;
- owner-gated production schedule and 30-day COMPLIANCE retention activation;
- positive qualifying coverage, externally blocked under the frozen contract;
- exact-final-candidate review and production-lineage reconciliation;
- owner-authorized public JWKS/trust-root/checkpoint publication and independent verification;
- owner-authorized production L3 cutover, rollback readiness, and controlled L3 journey.

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
