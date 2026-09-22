# Merge-Proof — Product truth

**Authority:** Shared product truth for all agents. Updated from Ryan handoff 2026-09-22.
**Not for:** inventing capabilities, architecture changes, or marketing stretch.

## What it is

Merge-Proof is **not** an AI code reviewer, vulnerability scanner, CI replacement, agent manager, or dashboard product.

Its narrow job is **merge integrity**:

> Does the evidence actually belong to the exact software candidate being allowed through the merge boundary, is that evidence still current under the relevant authority/policy state, and is the proven content what ultimately landed?

The product is deliberately **deterministic**. AI does **not** decide `VERIFIED`.

Philosophy: **maximum rigor underneath, minimum surface area above.** Huge integrity engine; tiny GitHub-native experience.

## Core proof chain

```
EXPECTED CONTENT
→ PROVIDER CANDIDATE
→ BOUND EVIDENCE
→ BOUND AUTHORITY/POLICY
→ CURRENTNESS
→ LANDED CONTENT
→ PORTABLE VERIFIABLE RECEIPT
```

Merge-Proof establishes relationships across that chain rather than merely saying CI once showed green.

## Verdict semantics

| Verdict | Meaning |
| --- | --- |
| `VERIFIED` | Sufficient current positive evidence supports the claim. |
| `NOT_PROVEN` | Evidence is missing, unavailable, ambiguous, or insufficient. |
| `FAIL` | A required condition is demonstrably unsatisfied. |
| `STALE` | Previously valid evidence no longer supports the current candidate when a relevant dependency changes. |

Never turn unknown into green for convenience. `NOT_PROVEN` is not “bad code.”

## Product experience

Not dashboard-first. Desired loop:

GitHub PR → Merge-Proof status/check → quiet when current/proven → explain exactly what moved or is missing when not → receipt available for deeper inspection.

Agents/machines should consume a deterministic decision contract. UI stays small relative to the engine.

## Differentiation

Do **not** position as “better AI review.”

Testing/review says something about a change. Merge-Proof asks whether that evidence still belongs to the exact currently authorized candidate being merged—and whether the proven content is what landed.

## Related files

- [OFFER.md](./OFFER.md) — commercial terms and soft-close
- [CLAIMS.md](./CLAIMS.md) — allowed / forbidden claims
- [STATUS.md](./STATUS.md) — verified engineering/deploy facts only
- [TESTERS.md](./TESTERS.md) — Early Access cohort rules
- [MARKET.md](./MARKET.md) — external fact vs hypothesis
