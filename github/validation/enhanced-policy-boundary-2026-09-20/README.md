# Enhanced Policy Proof credential boundary

Date: 2026-09-20. New local product candidate **`5fd27e130a1bd098f89ba3f30d07bf27d1fd5b3b`**. Last accepted live signed queue candidate remains **`7953ecdbd849c8afe0379bfec1b4a61133292c62`**. New code is not relabeled as the older accepted candidate. No App registration, repository selection, permission change, production call, purchase, deployment, public publication or recurring schedule was performed.

## Implemented and locally validated

`github/policy-reader.js` provides a dedicated companion credential capability. The collector accepts this optional policy reader while its default still uses the ordinary Administration Read client. No service config automatically enables the companion.

- Verify the companion's exact App, installation, account, selected-repository mode and only Administration Write/Metadata Read permissions. Require bound server-supplied consent before issuing a token and before each policy request.
- Mint an exact one-repository token and verify the returned immutable repository ID/name, permission set and expiry. Keep the token/client in a closure and revoke the token in `finally`, including error exits.
- Permit only GETs on the bound repository's Actions execution-policy list/detail paths. Reject repository-administration mutation methods, unrelated paths, bodies, alternate hosts, redirects, encoded paths, cross-repository and parent-scope expansion before any corresponding network I/O.
- Reuse the existing bounded list/observation and policy-normalization logic. Missing consent/access/parent detail, malformed grants, or revocation failure yields unavailable evidence. Coverage aggregation remains unavailable; the injection does not provide a coverage adapter.

Ten focused tests cover the frozen/no-token interface, 56 mutation-method/path combinations, path/host/query refusal, disabled and mismatched consent, wrong/suspended/broadened installations, invalid issued tokens, revoked consent, inherited-policy refusal, cleanup failure, two-pass collector integration and default Read token issuance. The positive collector case uses explicitly synthetic complete-empty policy fixtures and is **not live GitHub acceptance**.

| Executed verification | Result | Retained output |
| --- | --- | --- |
| `npm run test:github` | **341/341 PASS**, including the 10 new tests, 1,000-seed service model with 17 invariants, existing reconstruction/currentness/portable tests | [github-tests.txt](github-tests.txt) |
| `npm test` | **26/26 CLI and 10/10 report PASS** | [cli-tests.txt](cli-tests.txt) |
| `npm run test:factory` — clean, no diagnostic preload | **37/37 PASS**, 12.426 seconds; complete HTTP/Git/PDF delivery and reassessment | [factory-tests.txt](factory-tests.txt) |
| Prior failed/instrumented attempts | Preserved, not counted as clean passes | Files below |

Initial GitHub suite: six HTTP tests could not listen under the sandbox (`EPERM`); the other 335 passed. The authorized localhost rerun passed all 341. See [sandbox-denied output](github-tests-sandbox-denied.txt).

Initial factory suite: 36/37; the full journey's reassessment returned RETRY instead of DELIVERED. The first run overlapped other suites, but concurrency is **not established as its cause**. An isolated full rerun with a temporary PDF-error logger passed 37/37 and produced no PDF diagnostic error. The final ordinary command then passed 37/37 without instrumentation or product/assertion changes. The failure was not reproducible in those two runs; no root-cause fix is claimed. Retain [first failure](factory-first-failure.txt) and [diagnostic rerun](factory-diagnostic.txt). The clean final run is the acceptance result, with the earlier intermittent failure visible.

No new static Linux Git build or Linux factory run is claimed. The accepted static binary/HTTPS helper and reconstruction implementation are unchanged; their prior artifact-specific evidence remains valid for those bytes. Current local reconstruction tests ran in the complete GitHub suite. No independent candidate review or fresh signed provider delivery has been performed for `5fd27e1`.

## Architectural guarantee and remaining integration

The component exposes no repository mutation capability, and tests prove the request boundary refuses those calls before I/O. Fixed App installation-read, token-issuance and token-revocation operations are allowed for authentication only. GitHub itself still gives Administration Write to the raw credential. Compromise of the credential issuer/host is not made harmless by a JavaScript interface; do not market this as a provider-enforced read-only permission.

Still unimplemented: authenticated customer enrollment/opt-in UI, persisted consent, companion installation lifecycle, production process/credential isolation and narrow IPC, service routing and targeted revocation/currentness invalidation, and their end-to-end acceptance. The `authorize` callback is an internal integration obligation, never a client-provided consent boolean. Its implementation must recheck the existing customer/primary installation/repository authorization. Partial refresh routing must reobserve dependent claims when consent or installation access changes. No complete Enhanced mode is claimed by this component commit.

No organization Write is requested. Unreadable inherited policy stays NOT_PROVEN. No positive provider coverage adapter is implemented; normalized coverage evaluation/FAIL semantics and the documented source contract remain intact. Org-wide active enforcement is still an explicit Team-plan live validation gate, not a removed requirement.

## Production decisions

The [recommended production configuration](../../operations/LEVEL3-RECOMMENDED-PRODUCTION.md) provides one selected option, cost, trust implications, operation, rejected alternatives and exact authorization for each outstanding production decision. The [release packet](../../operations/LEVEL3-RELEASE-PACKET.md) retains the executable acceptance sequence. Current documentation commits do not supersede this product SHA. Level 3 remains open.
