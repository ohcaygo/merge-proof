# Merge-Proof repository instructions

Start with `docs/current-truth/STATUS.md`. It is the compact lifecycle entry point and task router, not a substitute for fresh Git, GitHub, runtime, or provider evidence. Read only the deeper documents routed there for the task; history is not standing context.

## Proof and authority kernel

- Merge-Proof is a deterministic merge-integrity product: expected content → provider candidate → evidence → authority/policy → currentness → landed content → portable receipt. It is not an AI reviewer, security scanner, CI replacement, agent manager, or general dashboard.
- `VERIFIED` requires sufficient current positive evidence. Missing, unavailable, ambiguous, unsupported, or insufficient evidence is `NOT_PROVEN`. `FAIL` requires a demonstrated unmet condition. `STALE` means a relevant dependency changed after support was established. Never turn unknown into green.
- Keep local Git analysis, provider observations, replay consistency, issuer authenticity, landed-tree verification, and present currentness separate. Unsigned replay proves consistency over supplied inputs, not provenance or provider truth.
- Treat exact repository, PR, commit/tree, run, producer, approval, policy, receipt, merge, and landing identities as proof inputs. Preserve frozen verifiers, proof semantics, signed evidence, provenance, immutable history, negative/tamper cases, and fail-closed boundaries.

## Lifecycle and change authority

Implemented, locally tested, CI-tested, independently reviewed, merged, deployed, and accepted are distinct states. None implicitly authorizes deployment, policy or credential changes, public trust publication, production retention, billing changes, or an L3 claim.

Before operational work or claims, refresh the remote default branch/SHA, working tree, PR/check/workflow/status state, applicable rulesets/protection, and relevant live runtime/provider state. Report `UNKNOWN` or `NOT_PROVEN` when evidence is absent.

Use the smallest coherent change and existing architecture. Historical reviewer reports apply only to their named candidate/scope. Do not substitute an old report, an ad hoc procedure, or the OHCAYGO reviewer skill for a current Merge-Proof reviewer procedure.

Never expose or commit GitHub tokens, App keys, AWS credentials, KMS/signing material, Stripe credentials, auth files, webhook secrets, or customer data.

## Task routing

- Product/verdict/claims: `docs/current-truth/PRODUCT.md`, `CLAIMS.md`, `MERGE-TRUTH-RECORD.md`.
- Independent review: `docs/current-truth/INDEPENDENT-REVIEW.md` is the authoritative pinned-candidate procedure.
- Replay/provenance: `docs/current-truth/REPLAY-PACKET.md`, `github/verifier/`, and relevant tests.
- GitHub proof/policy/currentness/landing: `github/README.md`, `github/PRODUCTION.md`, source, and `github/test/`.
- L3, AWS/KMS/JWKS, anchoring, recovery, and release: `github/FINAL-FRONTIER.md`, `github/operations/`, and the exact linked validation record.
- Factory/hosted/billing: `factory/README.md`, `factory/ACCEPTANCE.md`, `factory/PUBLIC-LAUNCH.md`, source, and `factory/test/`.
- Historical proof/research: open only the named record under `github/validation/`, `factory/review/`, `docs/research/`, or `research/`; preserve it unchanged.

Run the complete verification routed by `STATUS.md` for material changes. If a live or independent gate cannot be exercised, report the bounded gap; do not manufacture a pass.
