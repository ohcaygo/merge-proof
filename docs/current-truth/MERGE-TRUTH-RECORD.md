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

This does not independently authenticate GitHub, create an L3 or Proof-of-Control claim, or establish present currentness. Production trust publication remains outside P0.
