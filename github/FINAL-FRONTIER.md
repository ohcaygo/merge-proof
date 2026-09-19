# Exact-candidate implementation — 2026-09-19

Implementation source: research commit `41ce845ed61b1a442ad548d91e9ca75d414496d3` on `claude/merge-proof-deep-research-czjemw`; charter §43, with Ryan's canonical verdict decision and September 19 GitHub-policy addendum. The implementation branch is `codex/final-frontier-l3`. This document describes a local candidate, not a production release.

## What the candidate does

The existing GitHub collector and deterministic engine now bind the candidate's repository, commit, tree, base and group to check App/workflow identity, workflow blob, qualifying event, PR context, run attempt, job and steps. Same-name workflow substitution and wrong-event substitution cannot establish execution. Changed producer workflows, unsupported producers and missing metadata remain explicit gaps. Workflow `uses:` pinning observations are advisory; no workflow source or logs are retained.

`VERIFIED` requires sufficient current positive evidence. `FAIL` requires a demonstrated unmet required condition with the necessary bindings. Missing, ambiguous, stale, unsupported or unavailable evidence yields `NOT_PROVEN`. The local CLI uses `collectionComplete: false` for collection failures; historical records keep their recorded verdict. Factory fulfillment still rejects incomplete collection.

Currentness compares dependencies for TARGET, CI_EXECUTED, APPROVAL_CURRENT, RULES_SNAPSHOT and REMOTE_DURABLE. Unrelated checks, comments, mergeability rollups and push-time rules do not invalidate them. Signed relevant events trigger targeted re-observation with conditional reads; they do not pretend the dependency has already changed. Six-hour complete reconciliation and four-hour App-delivery scans recover missed events. Receipt bodies and observation identifiers remain immutable; new receipts link to predecessors. Unchanged full reconciliations retain the receipt and refresh currentness; they do not consume receipt capacity. Existing report-only defaults, tenant boundaries, pricing and metering authority remain intact.

Approval evidence records opinionated writer reviews, permission at observation, account class, dismissal history and head-push activity. Bot reviews never count as human approvals. Bot authors add one approval; the initiating human must be established before the authorization claim can pass. A push actor is not assumed to be an agent initiator. CODEOWNERS, last-push satisfaction and unattributable initiators remain named limitations.

Merge events append landed observations joined to immutable pre-merge receipts. A different squash commit can match by tree and parent; different content is a mismatch, and unsupported parentage is unresolved. Rule-suite results record observed bypasses without claiming visibility into exempt actors. Push ranges record commits without proof. The existing merge-history list shows the landed state; lookup by commit returns the same evidence.

Independent reconstruction runs in an isolated worker against an operator-owned bare blobless mirror, with Git version and binary SHA-256 pins, fixed merge options, empty attribute source, no replace refs, no hooks and no configured custom merge drivers. Nonempty mirror `info/attributes` is rejected; system/user/local attribute-file overrides are disabled. Clean merge/squash, confirmed ordered queue entries and first-parent rebase are supported. Conflicts, both-sided gitlink changes and rebase merge commits refuse a tree. Attribute, multiple-base, rename, case, empty-commit and duplicate-patch caveats are retained; caveated divergence never becomes a definitive mismatch.

Portable bundles contain the immutable receipt, normalized/raw policy snapshot, explicit claims and observation references, verdict-info, in-toto statement and DSSE envelope. Verification checks digests, exact subjects and deterministic replay, with frozen versioned logic. Signatures require an independently supplied trusted P-256 key; a bundled key does not authenticate itself. Unsigned output is labeled and rejected unless the verifier caller explicitly accepts unsigned consistency checking. With `--git-dir`, the verifier uses caller-supplied bare Git objects and the recorded binary pin to independently check trees, merge-base/parent/ancestry relationships and the expected tree. Missing objects remain unavailable; lazy fetching is disabled and no refs are updated. Reconstruction may add synthetic objects to that local mirror. Online checks distinguish immutable-record divergence, mutable-state changes and missing records. Provider assertions remain provider-trusted. The local operator log is a hash chain with a daily-root preparation function; it is not an externally witnessed transparency log.

## GitHub September addendum

Readable repository Actions policies, including inherited policies, are retained in the existing policy snapshot. Active actor/event/workflow conditions constrain bound runs; evaluate mode is recorded without enforcing it. Only relevant workflow policies participate in CI/policy currentness. Exact User/Bot identities can satisfy actor allowlists; unobservable Team/role/App membership remains unknown. Unsupported glob syntax is possibly applicable rather than silently excluded. No policy or permission is written.

GitHub documents Administration **write** for policy reads. The installation token retains Administration read; a denial records `EXECUTION_PROTECTIONS_UNAVAILABLE`, listed as not checked. This does not claim the protections were satisfied or absent. Bearer credentials that already permit the reads can supply the observations. Broadening App permissions is not part of this candidate. Policy webhook events are used where delivered; periodic observation remains necessary when GitHub emits none.

`code_coverage` is recognized and its `minimum_coverage` and `max_coverage_drop` thresholds retained. It is not a generic unsupported-rule cliff. A normal CI success does not establish GitHub Code Quality's aggregated branch/default-branch coverage: without exact bound evaluation evidence the required coverage claim remains `UNKNOWN` with `CODE_COVERAGE_EVIDENCE_UNAVAILABLE`. Malformed thresholds get a distinct reason. No undocumented metrics endpoint, comment parsing or inferred coverage is substituted.

Sources: [Actions policies API](https://docs.github.com/en/rest/actions/policies), [execution protections GA](https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/), [coverage REST announcement](https://github.blog/changelog/2026-09-18-manage-the-code-coverage-ruleset-condition-with-the-rest-api/), [rules API](https://docs.github.com/en/rest/repos/rules).

## Using the candidate

The machine contract is `urn:merge-proof:decision:1`. `POST /proof/v1/decision` requires a GitHub bearer token and exact repository ID, PR, expected head/base/target SHAs. Hosted use additionally requires access to the App installation and its repository. CLI/MCP validate the full response, caller bindings and consistent outcome/verdict/currentness before consuming it. Output is PROCEED, HOLD, REFUSE or UNAVAILABLE, with the unchanged three-verdict vocabulary, currentness, bindings, reasons, next action and receipt. PROCEED is a point-in-time observation. A caller must still use GitHub's head-SHA guard and required checks; the base is not reserved. Queue admission alone cannot authorize merging.

```sh
merge-proof verify --repo OWNER/REPO --repository-id ID --pr NUMBER \
  --head HEAD_SHA --base BASE_SHA --target TARGET_SHA --json
# MP_GITHUB_TOKEN supplies the existing token. MP_ORIGIN selects the service.
# --wait SECONDS permits bounded polling; neither command merges.
gh merge-proof verify --help
merge-proof verify --bundle DIRECTORY --trusted-keys trusted-jwks.json
merge-proof verify --bundle DIRECTORY --allow-unsigned
merge-proof verify --bundle DIRECTORY --trusted-keys trusted-jwks.json --git-dir BARE_REPO
merge-proof mcp
```

The bundle endpoint is `GET /proof/receipts/RECEIPT_ID/bundle`; authorization is rechecked. It returns a JSON bundle. Save it as `bundle.json` in the offline directory, or use `bundle.write` to write the component files. `GET /proof/v1/receipts?repository_id=ID&commit=SHA` joins artifact commit identity to recorded landing evidence. Missing/retention-expired records do not invalidate an otherwise internally consistent historical statement.

Agent instruction example: “Call merge_proof_decision with the exact repository and expected SHAs. Only PROCEED permits continuing the existing merge procedure. Preserve the returned head-SHA guard and required checks. HOLD, REFUSE, UNAVAILABLE, malformed responses and tool errors require stopping the merge step. The tool does not merge.”

`github/verifier/freeze.js` is a release-time generator for this unpublished policy archive. After publishing an archive, preserve it permanently and mint a new directory/table entry for changed logic. Do not regenerate a published version. Old v1 receipts remain readable but are explicitly unsupported by the new portable replay protocol; they are not silently reissued as v2.

## Operational settings and limits

The optional App configuration `reconstruction` takes `root`, absolute `binary`, exact `version` output and `sha256`. Use a dedicated operator-controlled directory. The token is supplied only to the worker's Git environment and is not persisted. Missing configuration produces `MIRROR_NOT_CONFIGURED`. The candidate does not provision or deploy a Git binary. Local tests pin the installed Git executable; production Linux/static-binary equivalence still requires the release-environment check before deployment.

Actual GitHub queue membership/order beyond the observed PR entry remains unobservable to this collector. The reconstruction engine supports an explicitly confirmed ordered group; hosted groups without that input remain `QUEUE_MEMBERSHIP_ORDER_UNAVAILABLE`. Complex rebase/indirect landings remain unresolved. GitHub's private merge configuration, CI checkout behavior, permission at approval time, exempt bypasses and atomic merge-time authorization cannot be established.

Existing receipt and ledger capacity limits still apply. Observation retention follows receipt/ledger references; downloads are the portable retention path. Delivery scans and reconciliation are bounded and retry on provider failure; they are not a guarantee of recovering permanently unavailable evidence.

## Release gates requiring Ryan

An authorized owned-repository live lab ran on 2026-09-19. No production deployment, App permission change, new credentials, production signing identity, external signature publication or public anchoring occurred. See [live validation](validation/final-frontier-l3-2026-09-19/live-lab.md).

1. Choose/authorize the KMS P-256 signing key and published trusted JWKS identity. The signer callback and verifier are implemented and tested with ephemeral local fixture keys. No production signing identity exists in this candidate.
2. Authorize the public daily-root destination and publication mechanism. Local hash-chain/root preparation is implemented; external anchoring is absent.
3. Complete the remaining live gates: legitimate second-human approval/revocation, signed merge_group delivery with an eligible queued fixture inside the unchanged installation scope, and organization-only ruleset enforcement. Development-App delivery and scoped reconciliation now passed using the existing installation; see [App resume](validation/final-frontier-l3-2026-09-19/app-resume.md). Human cases remain blocked until the owner provides a reviewer username.
4. Approve the candidate for a separate release only after the remaining acceptance gates, including the production Git binary pin and provider-backed smoke tests. Local and partial live acceptance do not establish deployment readiness.

No rename, pricing change or broader product is proposed.

## Validation and review

Local acceptance: GitHub 266/266 (including 20 recorded synthetic cases and 1,000 seeded sequences), factory 37/37, CLI 26/26 and report 9/9. The affected Git/receipt/consumer chain passed 19/19 after the final review fix. The npm artifact passed CLI, frozen-verifier, MCP and gh-shim smoke checks. Tests used Node 24.12.0 and SHA-256-pinned Apple Git 2.50.1; no Linux or live-provider acceptance is implied.

The single independent review of `134f9bb` returned five actionable findings. All five were fixed and regression-tested: ambient Git attributes, duplicate reconciliation receipts, malformed machine responses, incomplete engine digest and missing optional offline Git recomputation. The reviewer did not re-approve the resolution commit. See [review and evidence](validation/final-frontier-l3-2026-09-19/review.md) for the exact boundary and captured test outputs.

The live lab found that REST 2026-03-10 omits `merge_commit_sha`. The collector now reads the exact PR test-merge ref and verifies its ordered parents; landed identity resolves through GraphQL with repository, PR, head, base ref and merged-state checks. Resolution is recorded beside the immutable merge ledger. Live retests passed for queue landing, refreshed test-merge tree comparison and historical merged identity. The affected service path and negative bindings are regression-tested; the GitHub suite passes 281/281. The published frozen verdict implementation is unchanged.

The resumed development-App lab exposed unsafe-integer delivery IDs being silently skipped while reconciliation reported success. Exact decimal IDs are now preserved, malformed identities fail closed, and a real missed signed delivery recovered through GitHub redelivery. App scope and permissions were unchanged. The complete GitHub suite passes 291/291; 11 live App assertions and four captured receipt replays passed.
