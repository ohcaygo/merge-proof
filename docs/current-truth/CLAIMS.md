# Merge-Proof — Claims guardrails

**Authority:** What agents may and may not say. Ryan handoff 2026-09-22 + repo ops.

## Allowed framing

- Narrow merge-integrity job (evidence ↔ exact candidate ↔ current under authority/policy ↔ landed content).
- Deterministic verdicts: `VERIFIED` / `NOT_PROVEN` / `FAIL` / `STALE`.
- AI does not decide `VERIFIED`.
- Public offer: 7-day no-card trial from first successful proof; then $29/mo per observed active developer. **Confirmed live 2026-09-22** (see [STATUS.md](./STATUS.md)) — the soft-close is no longer required.
- Early Access is live: `https://merge-proof.ohcaygo.com/early-access`, 10-day invited term, gated per-person by allowlist (see [CAMPAIGN.md](./CAMPAIGN.md)).

## Do NOT claim

- “Level 3 certified” / “Level 3 complete” / “production Level 3 complete”
- “Mathematically proves everything”
- “Independent of GitHub for every fact”
- “Zero possibility of false VERIFIED”
- “Full coverage-policy proof”
- “Production AWS migration complete”
- Fake urgency, invented customers, invented ROI
- That `NOT_PROVEN` means bad code
- That Merge-Proof is an AI reviewer / scanner / CI replacement / dashboard

## Engineering depth (context, not public certification)

Level-3 research/direction may include exact-candidate binding, expected-tree reconstruction in a defined envelope, merge-queue reconstruction, evidence binding, authority provenance, per-claim currentness, landed-tree verification, durable/portable receipts, etc. **Understanding ≠ claiming certified complete.**

Live lab acceptance observations (queue VERIFIED → destroy/requeue → fresh VERIFIED → land → receipt) are engineering evidence, not a public “Level 3 done” claim.

## Related

- [PRODUCT.md](./PRODUCT.md)
- [STATUS.md](./STATUS.md)
