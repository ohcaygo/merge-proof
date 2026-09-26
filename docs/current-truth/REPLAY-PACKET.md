# Deterministic replay packet

## Scope

`urn:merge-proof:replay-packet:1` is the buyer-downloadable, self-contained input to the existing Merge Proof deterministic verifier. It answers one bounded question:

> Given these exact supplied and bound inputs, does the verifier reproduce this Merge Truth conclusion?

The packet is **unsigned**. Its digest detects alteration without a matching digest update; it is not a signature, trust root, public anchor, or independent authentication of packet provenance. A successfully replayed packet does not establish GitHub provider truth, present currentness, L3 completion, or Proof-of-Control Tier 3.

## Contents

The packet embeds the existing portable evidence bundle, the retained currentness input, the applicable merge-ledger record and landing observation when they exist, reconciliation state, and the expected P0 Merge Truth record. The portable bundle already binds repository/PR identity, evaluated candidate, receipt evidence, policy/authority inputs, and landed observations. No separate verdict engine is introduced.

The packet-level SHA-256 digest covers every field except the digest container itself and detects alteration that is not accompanied by a replacement digest. Because the packet is unsigned, a newly forged packet and digest do not acquire trusted provenance. Existing bundle and landing integrity checks run before Merge Truth is rebuilt. Replay then compares the rebuilt record to the embedded expected record. Stored or UI verdict labels cannot override the rebuilt relationship.

## Replay

Download the JSON packet from an authorized proof page, then run:

```sh
npx merge-proof verify --replay-packet ./merge-proof-RECEIPT-replay.json
```

A valid packet returns `REPLAY_CONSISTENT`, the reproduced P0 verdict and reason, the evaluated and landed identities, `trust: UNSIGNED`, and exit code `0`. A missing, altered, mismatched, or malformed required input returns `PACKET_INCONSISTENT`, `verdict: NOT_PROVEN`, and exit code `3`. An unsupported schema/version returns `UNSUPPORTED` and exit code `4`.

`VERIFIED`, `FAIL`, and `NOT_PROVEN` are all valid replayed conclusions. Exit code `0` means the replay was consistent; it does not mean the conclusion was `VERIFIED`.
