# Enhanced Policy Proof and Level 3 production preparation

Current product candidate: **838ed8f422605bc814c0a7d9d0140dabbe78fedb**. Last accepted real signed queue candidate: **7953ecdbd849c8afe0379bfec1b4a61133292c62**. These identities are distinct. Later documentation commits do not replace the product candidate. Frozen proof/verifier digest remains `b770fe7f5dac86730095e768e4c3c4b4e1856eae909b3757acfc756069e47b76`.

**Level 3 remains open.** This record distinguishes source implementation, local/Linux tests, actual GitHub observations and unexecuted owner/environment acceptance. No positive coverage adapter is manufactured, and no old live result is transferred to the new candidate.

## Implemented in the current candidate

- Explicit customer/admin opt-in in the existing Account UI, authenticated repository authority, one-use session-bound installation state, immutable App/account/installation/repository binding and server-side installation discovery. Capability availability never means VERIFIED.
- A separate UID/process owns the companion key. Bounded Unix IPC exposes only fixed discovery, execution-policy observation and signed lifecycle-event handling. Arbitrary methods, URLs, scopes and repository-administration mutations are rejected before provider I/O. Fixed token issuance/revocation are credential lifecycle operations. Standard issuance remains Administration Read.
- Consent, removal, suspension, uninstall, policy change and observed access failure feed existing per-claim currentness, retraction and recollection. Independent claims remain independent and historical receipts remain immutable. Relevant policy provenance is GitHub-observed.
- Root-owned credential refresh directories and exclusive no-follow staging; separate short-lived signer and backup roles; prepared systemd isolation and IMDS restrictions. Actual EC2 enforcement is still required.
- Retained exact Git input refs; immutable archive and factory-report closure; checksummed/version-bound cross-account recovery, segmented large objects, original Git-runtime reconstruction and independently supplied signature trust. Empty historical Git directories survive both local and remote recovery. Restores do not assert currentness.
- Approved AWS preparation templates, signer acceptance, disposable Compliance retention lifecycle acceptance, backups/snapshots/restore drills, signing/storage/recovery health, exact-ID validation-org support and inactive private scheduled-lab template.

The [approved operational sequence](../../operations/LEVEL3-PREPARATION.md) contains the concrete configuration and reserved gates. No production deployment, public trust publication, production retention or production companion registration is implied.

## Independent review

One [complete candidate review](independent-review-62c2f97.md) found four defects: scheduled installation GET rejection, companion retry durability, privileged credential staging and missed signing-outage alarms. All four were fixed in [4f14f77](independent-recheck-4f14f77.md), which received APPROVE FOR INTEGRATION. A subsequent genuine historical archive restore discovered missing empty Git directories; 838ed8f fixes that concrete recovery defect and received [focused approval for integration](independent-recheck-838ed8f.md). No broader repeated review was used.

## Exact-candidate verification

Local final-candidate checks passed: [367/367 GitHub tests](local-github-tests.txt), [26/26 CLI and 10/10 report tests](local-cli-report-tests.txt), [37/37 complete factory](local-factory-tests.txt). The [model](local-model.json) retained 1,000 sequences, 28,578 actions and all 17 invariant obligations. The [affected-event budget](local-budget.json) passed. These are executed checks, not source-presence claims.

The [genuine historical restore](real-historical-restore.json) recovered 48 files/490,684 bytes, verified 5 signed archived receipts, independently recomputed 4 reconstruction claims and verified the associated landed observation. Source state stayed unchanged. It correctly reports currentness NOT_PROVEN. Both CloudFormation drafts also passed cfn-lint (exit 0, no diagnostics); that is local structural validation, not AWS acceptance.

The final [owned Linux workflow](https://github.com/ohcaygo/merge-proof-l3-lab-classic/actions/runs/35534226831) completed successfully on the [exact source archive](linux-fixture.json): **367/367 GitHub, 37/37 factory, 26/26 CLI, 10/10 report, 20/20 retained-static-Git reconstruction**. The [actual separate-UID acceptance](linux-uid-isolation.json) passed credential cross-read denial, privileged staging refusal and mutation rejection through IPC. This is real Linux OS acceptance, separate from EC2/systemd/IMDS and real companion-provider acceptance. The synthetic repository main remained `d8a5e85dbcb8a3d6691ca0da19252a1488ae3268`; only isolated acceptance branches were created.

The [provider run record](linux-run.json), complete logs and model metrics preserve the result. Linux uses an immutable source archive, Node 24.12.0, real Git/Chrome, and the retained static Git 2.50.1 artifact. A full factory pass includes the actual Git/PDF journey; no assertion was loosened.

Intermediate failures remain disclosed: the `62c2f97` Linux harness omitted samples/ and its factory requests stalled; complete source packaging fixed this. The `4f14f77` UID harness initially loaded public source from the runner's `0750` home; the broker UID correctly lacked access. Staging the unchanged source in root-owned `/opt` fixed the layout. An extra sudo diagnostic rejected a numeric UID without a passwd entry; the actual script uses OS setuid and needs no account creation. The original historical restore correctly returned RESTORED_RECONSTRUCTION_NOT_PROVEN until empty directories were retained. None of these failures was reported as a passing acceptance.

## Actual live observations and limits

[Standard Read preflight](standard-read-live-preflight.json) confirms Administration Read at both App and installation and a real 403 for execution-policy discovery. [Authenticated UI readback](standard-app-ui-observation.json) confirms exactly the approved two selected repositories. No App scope or permission changed.

The new companion/provider signed queue journey remains **NOT_PROVEN**. Its prepared driver requires the actual separately owned broker socket and real customer OAuth/consent, then genuine signed GitHub deliveries and provider evidence. It contains no injected Write-client helper and no fixture policy substitution. The previously accepted `7953ecd` chain remains historical evidence only.

The real historical restore acceptance uses actual retained `7953ecd` provider receipts, independent retained lab public trust and the recorded Git binary. It tests the current recovery tooling; it does not establish a new queue event, AWS recovery, production signing, production RPO or cold-host RTO.

## Plan/API gates and unimplemented accounting

- Organization-wide enforcement still requires the approved minimum Team validation organization. Repository-level validation is distinct. `thatguyrw-boop` may supply second-account functional authority validation; that is not independent-human validation. No extra human is required absent an actual provider/criterion need.
- Enterprise-only and unreadable inherited-policy paths retain their explicit environment/API gates. Administration Write in the companion does not imply organization-administration authority.
- **Positive provider coverage collection remains unimplemented and provider-blocked.** Existing rule ingestion, bound arithmetic, failure semantics and per-claim currentness are implemented/tested. Until qualifying aggregate/provenance exists, the live result remains NOT_PROVEN. This is not removed from the frontier.
- No other required source implementation gap was established by the complete independent review. Optional log INFER, the alternative OIDC branch and later Quint work remain absent as previously accounted for in the [22-item charter](../final-frontier-l3-2026-09-19/charter-coverage.md), without being claimed as shipped.

## Authorized prerequisites and remaining account inputs

Architecture and the $110 ceiling are already approved and are not being resubmitted.

Ryan explicitly authorized all three preparation actions: AWS preparation after authentication; applicable GitHub Terms and the monthly Team organization; and an **ohcaygo-owned private development companion App** with Administration Write and Metadata Read only, installed only on `ohcaygo/merge-proof-l3-lab-queue-headgreen`. No further permission approval is needed for those actions. The personally owned “Any account” draft is abandoned.

The [2026-09-20 prerequisite record](owner-prerequisites.json) distinguishes authorization from execution:

1. AWS primary/recovery account sign-in remains necessary. No account IDs or administrator roles are inferred. Official signed AWS CLI 2.36.49 is prepared in a task-only temporary directory; no account profiles, static keys or cloud resources were created.
2. GitHub Terms were accepted and Team checkout advanced with monthly billing and two functional seats ($8/month before any tax). The owner must complete the billing email/payment fields directly in GitHub. No successful purchase or organization creation is claimed.
3. Superseding the earlier prerequisite snapshot, Ryan created **OHCAYGO Enhanced Policy Dev** (App `5015754`). The [saved installation readback](companion-installation-observation.json) confirms installation `163368931`, exactly one selected repository (`ohcaygo/merge-proof-l3-lab-queue-headgreen`, ID `1377343185`), and only Administration Write plus Metadata Read. The App remains private to ohcaygo. The local setup callback was unavailable; GitHub installation succeeded, but product enrollment, broker credential/runtime setup, policy API preflight and fresh signed queue acceptance remain unproven.

The [fresh standard Read API preflight](standard-read-preflight-2320.json) confirms unchanged Administration Read at App and installation, selected-repository mode, and execution-policy HTTP 403. The prior exact two-repository UI readback remains dated evidence; the refreshed installation UI now also requires authentication. The preflight checkout HEAD is documentation-only above the pinned product candidate. Fresh companion-backed signed queue acceptance remains NOT_PROVEN.

After these inputs: provision and validate approved non-production AWS preparation; observe the disposable Object Lock lifecycle through actual expiration; complete Team/ruleset and companion lifecycle acceptance; rerun the full real signed queue→exact bindings/currentness→landed-content→portable replay journey on the current candidate; measure independent recovery and alert delivery; accept the private recurring lab. Continue directly along the approved sequence.

Reserved later owner gates remain: exact production deployment/traffic cutover; production companion registration; public JWKS/mirror and root/checkpoint publication; irreversible 30-day production Compliance retention **after** disposable lifecycle acceptance. The110-dollar ceiling is enforced operationally through forecast/review and alarms, not claimed as an AWS hard spending cap.
