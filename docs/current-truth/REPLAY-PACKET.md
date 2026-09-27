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

## Independent Git-object verification

For a standard public-repository merge, obtain the repository objects directly from a repository location you trust independently of the packet. A bare mirror is the supported input; the packet does not carry or fetch Git objects.

```sh
git clone --mirror https://github.com/OWNER/REPOSITORY.git ./repository.git
git -C ./repository.git fsck --full
```

The packet's repository and pull-request labels are supplied provider records, not an authenticated clone location. Select or confirm the clone URL out of band. If the required candidate or landing is only advertised by a pull-request ref, fetch that advertised ref into the bare repository before it disappears. Verification never fetches a missing object or updates a ref.

Run one verification command after the independent acquisition:

```sh
npx merge-proof verify \
  --replay-packet ./merge-proof-RECEIPT-replay.json \
  --git-dir ./repository.git \
  --git-binary "$(command -v git)"
```

The Git binary must match the version and SHA-256 pin recorded when the expected tree was reconstructed. A different binary, version, missing object, non-bare repository, local merge driver, or unsupported reconstruction returns `INDEPENDENT_VERIFICATION_NOT_PROVEN`; it is never treated as a match.

The JSON result deliberately has three separate sections:

1. `replayConsistency` is the existing unsigned packet replay. It proves deterministic consistency of the supplied and bound packet inputs. It does not establish packet provenance.
2. `independentlyRecomputedGitFacts` reads only the caller's bare object store with network protocols disabled. It verifies the packet-bound base, head, candidate and landed commit objects; recorded commit trees; test-merge or landed parents; recorded merge-base relationship; and the expected tree within the existing reconstruction envelope.
3. `providerRecordTrustedFacts` remains `NOT_INDEPENDENTLY_AUTHENTICATED`. Repository/PR association, checks, workflow runs, reviews/approvals, policy/rules, permissions, currentness, webhook delivery and provider history remain supplied GitHub/provider records even when replay and Git recomputation pass.

Exit code `0` and `INDEPENDENT_VERIFICATION_COMPLETE` mean both replay consistency and every applicable Git-derived row matched. Exit code `2` means required claims, objects, reconstruction, or the pinned Git runtime were unavailable (`NOT_PROVEN`). Exit code `3` is packet/bundle inconsistency, exit code `4` is an unsupported schema or verifier, and exit code `5` is a demonstrated Git-derived mismatch. Stored or UI labels never override these recomputations.

This does not add signing, provenance, roots, anchoring, L3, or Proof-of-Control Tier 3. It does not broaden the recorded merge-method envelope.
