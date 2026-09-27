# Merge Truth record contract

**Status:** P0 product contract. It is a projection over existing authoritative evidence, not a new proof subsystem or trust claim.

## Question answered

For one receipt and, when observed, one completed merge:

> What exact candidate did Merge Proof evaluate, what evidence and authority were bound to it, what was known about currentness, what content actually landed, and is the evaluated-to-landed relationship proven?

## Inputs

The record is deterministically derived from:

1. the immutable receipt (or the identical receipt snapshot in the merge ledger);
2. the immutable merge-ledger row, when a matching merge event exists;
3. the retained landed-content observation, when GitHub content resolution completed;
4. current delivery-reconciliation health, reported separately from merge truth.

## Provider-history coverage (P3)

The buyer projection reports App delivery-history coverage beneath the replay
action. It is supporting evidence, never a second merge verdict:

- `RECONCILED` means the existing bounded delivery traversal reached its
  completion condition through the recorded time and is bound to the same
  repository, pull request, and evaluated candidate.
- `IN_PROGRESS` means a resumable traversal still has provider pages left.
- `STALE` means the retained completion predates the proof point it would need
  to cover.
- `UNAVAILABLE` means completion or proof binding cannot be established from
  retained provider state.
- `RECOVERED` additionally requires a confirmed redelivery requested by the
  existing reconciler and a subsequently accepted event bound to the exact
  repository, pull request, and evaluated candidate.

A stored label, active cursor, unconfirmed redelivery, malformed subject, or
cross-proof subject cannot project `RECONCILED` or `RECOVERED`. None of these
states changes `relationship.verdict`; in particular, reconciled history cannot
turn missing evidence or an unresolved landing into `VERIFIED`.

It collects no new evidence and grants no authority.

## Relationship verdict

| Relationship | Meaning |
| --- | --- |
| `VERIFIED` | Existing landing comparison returned `LANDED_VERIFIED`: the resolved landed tree equals the proven evaluated tree inside the supported merge-path envelope. |
| `FAIL` | Existing landing comparison returned `LANDED_MISMATCH`: the resolved landed tree demonstrably differs. |
| `NOT_PROVEN` | The merge or landing is missing, the receipt did not verify the merged head, parentage/path is ambiguous, or required content evidence is unavailable. |

No tree equality, merge method, currentness, authority, or delivery completeness is inferred from absence.

## Currentness

The record keeps three states distinct:

- currentness at the original proof observation;
- currentness held when the merge event arrived;
- currentness at the merge decision, which remains `UNAVAILABLE` unless independently established.

Claim-level state is shown where it was recorded. Missing claim-level currentness remains unavailable rather than inheriting a favorable value.

## Replay and trust boundary

The record references the existing receipt bundle, receipt/observation identifiers, policy digest, merge-ledger row, and landed observation. Receipt replay and landing comparison are deterministic over those inputs. The record digest detects projection edits.

The buyer relationship is derived from a fresh landing comparison. A retained landing state is never trusted by label alone: the receipt snapshot, repository/PR/head binding, landed tree/parentage, reason, method, and receipt digest must agree with replay. Any disagreement is `NOT_PROVEN / LANDING_OBSERVATION_INCONSISTENT`.

This does not independently authenticate GitHub, create an L3 or Proof-of-Control claim, or establish present currentness. Production trust publication remains outside P0.

## Compact buyer evidence chain

The buyer page projects this record in five ordered stages: `Evaluated`, `Evidence`, `Currentness`, `Landed`, and `Conclusion`. The projection favors short explanations and only the commit/tree identifiers needed to establish identity; claim-level states, complete identifiers, replay references, and the authoritative reason remain available in an expandable detail.

The chain has no verdict logic. Its conclusion is the Merge Truth relationship verdict, and its reason is a buyer-readable rendering of that relationship reason. Missing, stale, unavailable, or replay-inconsistent evidence stays visible and cannot be promoted by presentation state.

## Downloadable deterministic replay

An authorized proof page exposes the unsigned replay packet defined in [REPLAY-PACKET.md](./REPLAY-PACKET.md). The packet embeds the authoritative P0 inputs and reuses the existing receipt, landing, and Merge Truth replay logic. It does not add a verdict source or a trust claim.
