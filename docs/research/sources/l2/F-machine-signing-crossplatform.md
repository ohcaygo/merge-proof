# F — Machine-first contract, signed receipts, cross-platform feasibility

Prepared 2026-09-19 for Merge-Proof. Read-only against the repository (`github/cli.js`, `github/http.js`, `github/receipt.schema.json`, `github/remediation.schema.json`, `github/check.js`, `github/policy.js`, `github/examples/receipt.json`, `bin/merge-proof.js`, `README.md`). External facts were taken from source repositories and OpenAPI descriptions where vendor docs sites were blocked by the proxy; items marked **[excerpt]** rest on search excerpts only.

---

## 0. What we have today (baseline)

| Surface | Current state |
|---|---|
| Local CLI `bin/merge-proof.js` | Offline, schema v1, `--json`, exit `0` always unless `--fail-on`; `1` usage/internal, `2` NOT_PROVEN, `3` FAIL. Result has `verdict`, `refs.{base,head,forkPoint}.sha`, `findings[].{id,severity,whatHappened,whyItMatters,missingEvidence,doNext}`, `notChecked[]`. |
| GitHub CLI `github/cli.js` | `OWNER/REPO PR [--out] [--previous]`; exit `0` VERIFIED, `2` NOT_PROVEN, `3` FAIL or collection failure (no separate "error" code); writes `receipt.json`, `receipt.html`, `previous-currentness.json`. |
| Receipt schema v2 (`urn:merge-proof:github-receipt:2`) | Immutable evidence: `verdict`, `identity.{repositoryId,pr,headSha,baseSha,…}`, `fingerprint` (sha256 of canonical JSON), `summary.{ci,approval,remote,rules,target,actors,gate}`, `evidence.*` observations with `AVAILABLE/UNAVAILABLE`, `evidence.observedAt`, `consistency`, `gaps[]`, `notChecked[]`, `limitations[]`. Freshness is a separate object (`freshness.state` CURRENT/…). |
| Remediation schema (`urn:merge-proof:remediation:1`) | Derived, not proof: `items[].{reasonCode,summary,whatHappened,whyItMatters,nextAction,automaticRecheck{state,events},mergeConsequence{state}}`. |
| Policy (`github/policy.js`) | Presets ADVISORY / REPOSITORY_REQUIREMENTS / …_AND_BOUNDARIES; `evaluate()` yields `conclusion` success/failure, `enforced`, `blocking[]`, `mergeConsequence`. |
| GitHub Check (`github/check.js`) | Name fixed (`Merge Proof exact-state receipt`); `details_url` = receipt permalink; `output.summary` is human Markdown; published on PR head and, when a merge group exists, on the group SHA. No `external_id`, no `output.text`, no machine line. |
| Hosted routes (`github/http.js`) | `GET /proof/receipts/:id[?format=json]`, `POST /proof/receipts/:id/refresh`, `POST /proof/webhook` (HMAC-verified), `GET/POST /proof/gate`, `GET /proof/merges`. Auth: GitHub OAuth session cookie; no bearer/API path; anonymous denied in production. |

Everything an agent needs already exists as data; what is missing is a **single, stable, small answer object**, a **request that carries the SHAs the agent holds**, and **machine-reachable transports** (bearer/OIDC REST, MCP, check-run machine line, Action outputs).

---

## PART 1 — Machine-first contract

### 1.1 Semantics first: what "proceed" means

`proceed = true` if and only if all of the following hold at observation time `observedAt`:

1. **Subject match.** The agent supplied `expectedHeadSha` (and optionally `expectedBaseSha`, `expectedTargetSha`). The live PR head equals `expectedHeadSha`; if a base was supplied it equals the live base tip; if the repository uses a merge queue and the agent supplied a target, it equals the current group SHA. Any mismatch is a **refusal**, never a silent re-targeting.
2. **Evidence verdict** for that exact subject is `VERIFIED` (receipt `verdict`).
3. **Currentness** is `CURRENT`: the receipt fingerprint was recomputed from a fresh observation and no invalidating event (push, base advance, review dismissal/new commit, ruleset change, check re-run, queue regroup) has occurred since `issuedAt`.
4. **Policy satisfied**: the repository's configured preset evaluates to `conclusion: success` (advisory preset counts as satisfied only when `--require policy` is not requested; see CLI).
5. **Collection was complete and stable** (`evidence.consistency = STABLE_OBSERVATION`, no `UNAVAILABLE` observation the policy depends on).

A decision is a **statement about a tuple** `(repositoryId, candidate, headSha, baseSha, targetSha, observedAt)`. It is not a statement about the PR "in general".

**TOCTOU between decision and merge.** GitHub's merge endpoint takes the guard we need: `PUT /repos/{o}/{r}/pulls/{n}/merge` has body field `sha` — "SHA that pull request head must match to allow merge" — and returns **409** "Head branch was modified. Review and try the merge again." on mismatch, **405** "Pull Request is not mergeable" otherwise (github/rest-api-description, `api.github.com.json`, 2026-09-19). The same guard exists in GraphQL `mergePullRequest.expectedHeadOid`, in `gh pr merge --match-head-commit <SHA>` (cli/cli `pkg/cmd/pr/merge/merge.go`), and in the GitHub MCP server as `merge_pull_request.expectedHeadSha` and `update_pull_request_branch.expectedHeadSha` (github/github-mcp-server README). The contract therefore is:

```
decision := merge_proof.decision(repo, pr, expectedHeadSha=H, expectedBaseSha=B)
if decision.proceed:
    merge(pr, sha=decision.subject.headSha)      # == H by construction
    on 409/405 -> discard decision, re-ask
```

Two residual gaps must be stated honestly: (a) GitHub's `sha` guard binds only the **head**; a base advance between decision and merge is not rejected by GitHub (it may surface as "Base branch was modified" only when the merge commit cannot be computed, cli/cli#8092). Merge-Proof closes this only probabilistically: the decision re-observes base immediately before answering, and for `strict` (require-branches-up-to-date) rules a base advance flips GitHub's own mergeability. (b) With a merge queue the agent does not perform the merge; the decision for `targetKind=MERGE_GROUP` is consumed by GitHub through the required check on the group SHA, and the agent's job is only to *enqueue* with the head guard.

**Idempotency.** A decision request is a pure read plus a re-observation; repeated calls with identical inputs against unchanged upstream state return the same `proceed`, `verdict`, reason codes and `receiptId` (a new `decisionId`/`observedAt` is minted per call). Merge-Proof never mutates GitHub in a decision call (no check publication, no branch update). Webhook deliveries carry `decisionId` for de-duplication.

### 1.2 The `decision` object (draft schema)

Distinct from the receipt: the receipt is immutable evidence about one observation; the decision is a small, derived, request-scoped answer that references the receipt by id and digest.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:merge-proof:decision:1",
  "title": "Merge Proof decision (derived, request-scoped; not the evidence receipt)",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion","decisionId","observedAt","outcome","proceed","verdict",
               "currentness","policy","subject","request","reasons","missingEvidence",
               "nextAction","receipt"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "decisionId":    { "type": "string", "format": "uuid" },
    "observedAt":    { "type": "string", "format": "date-time" },
    "outcome":       { "enum": ["PROCEED","HOLD","REFUSE","UNAVAILABLE"] },
    "proceed":       { "type": "boolean" },
    "verdict":       { "enum": ["VERIFIED","NOT_PROVEN","FAIL","UNAVAILABLE"] },
    "currentness":   { "enum": ["CURRENT","STALE","UNAVAILABLE"] },
    "policy": {
      "type": "object", "required": ["preset","enforced","conclusion"],
      "properties": {
        "preset":     { "type": "string" },
        "enforced":   { "type": "boolean" },
        "conclusion": { "enum": ["success","failure","not_evaluated"] }
      }
    },
    "subject": {
      "type": "object",
      "required": ["platform","repositoryId","repository","candidate","headSha","baseSha","targetSha","targetKind"],
      "properties": {
        "platform":     { "enum": ["github"] },
        "repositoryId": { "type": "integer" },
        "repository":   { "type": "string" },
        "candidate":    { "type": "object", "required": ["kind","number"],
                          "properties": { "kind": { "enum": ["pull_request"] }, "number": { "type": "integer" } } },
        "headSha":      { "$ref": "#/$defs/sha" },
        "baseSha":      { "$ref": "#/$defs/sha" },
        "baseRef":      { "type": "string" },
        "targetSha":    { "$ref": "#/$defs/sha" },
        "targetKind":   { "enum": ["PULL_REQUEST_HEAD","HEAD_CONTAINS_CURRENT_BASE","MERGE_GROUP","LANDED_COMMIT"] },
        "mergeMethod":  { "enum": ["merge","squash","rebase","queue","unknown"] }
      }
    },
    "request": {
      "type": "object", "required": ["matched"],
      "properties": {
        "expectedHeadSha":   { "$ref": "#/$defs/sha" },
        "expectedBaseSha":   { "$ref": "#/$defs/sha" },
        "expectedTargetSha": { "$ref": "#/$defs/sha" },
        "matched":           { "type": "boolean" },
        "mismatch":          { "type": "array", "items": { "enum": ["HEAD","BASE","TARGET"] } }
      }
    },
    "reasons": {
      "type": "array",
      "items": { "type": "object", "required": ["code","blocking","summary"],
        "properties": {
          "code":      { "type": "string", "pattern": "^[A-Z][A-Z0-9_]+$" },
          "blocking":  { "type": "boolean" },
          "summary":   { "type": "string", "maxLength": 300 },
          "evidence":  { "type": "array", "items": { "type": "string", "description": "JSON pointer into the receipt, e.g. /summary/ci/required/0" } }
        } }
    },
    "missingEvidence": {
      "type": "array",
      "items": { "type": "object", "required": ["code","description","satisfiedBy"],
        "properties": {
          "code": { "type": "string" }, "description": { "type": "string" },
          "satisfiedBy": { "type": "array", "items": { "type": "string" },
                           "description": "GitHub events that would let Merge Proof re-prove automatically" }
        } }
    },
    "nextAction": {
      "type": "object", "required": ["kind","text"],
      "properties": {
        "kind": { "enum": ["MERGE_WITH_SHA","ENQUEUE_WITH_SHA","WAIT_FOR_EVENTS","UPDATE_BRANCH",
                           "RERUN_REQUIRED_CHECKS","REQUEST_HUMAN_APPROVAL","FIX_REPOSITORY_RULES",
                           "REFRESH_AND_RETRY","MANUAL_REVIEW","NONE"] },
        "text": { "type": "string", "maxLength": 500 },
        "retryAfterSeconds": { "type": "integer", "minimum": 0 },
        "mergeArguments": { "type": "object",
          "properties": { "sha": { "$ref": "#/$defs/sha" }, "mergeMethod": { "type": "string" } } }
      }
    },
    "receipt": {
      "type": "object", "required": ["receiptId","fingerprint","url"],
      "properties": {
        "receiptId":   { "type": "string", "format": "uuid" },
        "fingerprint": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "url":         { "type": "string", "format": "uri" },
        "jsonUrl":     { "type": "string", "format": "uri" },
        "checkRunId":  { "type": ["integer","null"] },
        "attestation": { "type": ["object","null"],
          "properties": { "dsseUrl": { "type": "string" }, "rekorLogIndex": { "type": "integer" }, "rekorLogId": { "type": "string" } } }
      }
    },
    "collection": {
      "type": "object",
      "properties": { "consistency": { "enum": ["STABLE_OBSERVATION","CHANGED_DURING_COLLECTION"] },
                      "unavailable": { "type": "array", "items": { "type": "string" } } }
    }
  },
  "$defs": { "sha": { "type": "string", "pattern": "^[a-f0-9]{40}$" } }
}
```

Design notes:

- `outcome` is the tri-state agents branch on; `proceed` is the redundant one-bit form so a shell `jq -e .proceed` works. `HOLD` = evidence not yet present but an automatic re-proof is expected (`missingEvidence[].satisfiedBy` non-empty); `REFUSE` = FAIL, policy failure, subject mismatch, or no known trigger; `UNAVAILABLE` = Merge-Proof could not observe (auth, GitHub outage, capacity) — an agent must treat it as "do not merge", not as "no opinion".
- `verdict` and `currentness` are kept separate from `outcome` so the agent can explain *why* without parsing text (the receipt already separates them; the decision keeps that discipline).
- `reasons[].code` reuses the existing vocabulary (`CURRENT_STATE_EXECUTION_NOT_PROVEN`, `INSUFFICIENT_CURRENT_HUMAN_APPROVAL`, `REMOTE_CANDIDATE_NOT_CONFIRMED`, `MERGE_QUEUE_GROUP_NOT_YET_PROVEN`, `TARGET_BINDING_MISMATCH`, `RULES_UNAVAILABLE`, `BASE_DRIFT_UNVERIFIED`, `PROTECTED_BOUNDARY`, …) plus three new ones: `SUBJECT_MISMATCH_HEAD`, `SUBJECT_MISMATCH_BASE`, `SUBJECT_MISMATCH_TARGET`. Codes are append-only; removal is a major version.
- Size target < 4 KB so it fits a check-run comment line, a step output, and an MCP `structuredContent` block without truncation.
- No prose fields beyond `summary`/`text`; the agent that wants the story fetches `receipt.url`.

### 1.3 CLI specification

Two packagings, one contract: `merge-proof status` in the npm CLI (talks to the hosted API; the existing offline analyzer remains untouched and offline) and a thin `gh` extension `gh merge-proof` (a repository named `gh-merge-proof`; `gh` extensions inherit `gh auth token`).

```
merge-proof status <OWNER/REPO> <PR> [options]
gh merge-proof status <PR|URL> [options]          # repo inferred from cwd like gh

  --expect-head <sha>      Refuse unless live PR head == sha (RECOMMENDED; agents pass the SHA they reviewed)
  --expect-base <sha>      Refuse unless live base tip == sha
  --expect-target <sha>    Refuse unless current merge-group SHA == sha (queue repos)
  --require <set>          Comma list of: current (default), verified (default), policy, stable
                           'policy' additionally requires an enforcing preset with conclusion=success
  --wait                   Poll until outcome != HOLD or --timeout elapses
  --timeout <dur>          Default 20m; only with --wait
  --json [fields]          Emit the decision object (whole object if no fields); --jq <expr> as in gh
  --receipt                Also print receipt permalink on stderr (human)
  --cached                 Serve the last stored decision instead of re-observing (never satisfies --require current)
  --fail-on <level>        none|hold|refuse   Default: refuse (see exit codes)
```

**Exit codes (recommended, superset of today's local codes):**

| Code | Meaning | Precedent |
|---|---|---|
| `0` | `PROCEED` | universal |
| `1` | Usage or internal error (never a verdict) | `gh` "fails for any reason → 1"; cobra tools (gittuf, slsa-verifier `os.Exit(1)`) |
| `2` | `HOLD` — evidence not yet established; automatic re-proof expected | our local `2 NOT_PROVEN`; conftest `--fail-on-warn` 1/2 split ("warn" vs "deny") |
| `3` | `REFUSE` — FAIL, policy failure, subject mismatch, no trigger | our local `3 FAIL`; Nagios `3 UNKNOWN` is the closest well-known "cannot proceed" |
| `4` | Authentication required / not authorized for repo | `gh` exit 4 |
| `8` | `--wait` timed out while still `HOLD` | `gh pr checks` exit 8 "pending" (plain mode only) |
| `9` | `UNAVAILABLE` — Merge-Proof or GitHub could not be observed | new; distinct from 1 so agents can retry with backoff |

Rationale versus alternatives surveyed: `cosign verify*`, `slsa-verifier`, `gittuf verify-ref` are boolean (0/1) because they verify a signature, not a tri-state evidence question; `git merge-tree` is 0 clean / 1 conflict / other error (git `Documentation/git-merge-tree.adoc`), the same shape as ours if you read 1→2 and "other"→1; conftest defaults to 0/1 and only splits 0/1/2 under `--fail-on-warn`; Nagios 0/1/2/3 uses 3 for "unknown", which for us must never be confused with "verified". The core principle: **exit 0 means exactly one thing (proceed), and errors are never confusable with verdicts**. `--fail-on none` keeps the diagnostic mode our README promises (always 0 with the object on stdout).

**`--wait` semantics.** Polling never converts a `HOLD` into `PROCEED` by time; each poll is a fresh decision request. Backoff 5s → 60s capped; the server may hint `nextAction.retryAfterSeconds`. On the hosted side the cheap implementation is long-polling `GET /proof/v1/decision?…&wait=60` that returns early when a GitHub webhook (push, `check_run.completed`, `pull_request_review`, `merge_group`) touches the candidate. `--wait` returns 3 immediately on `REFUSE` (no point waiting) unless `--fail-on hold`.

**`--require current`** (default on) means the server must re-observe now; `--cached` cannot satisfy it. `--require policy` is for gate wrappers that must not merge under an advisory preset; without it an advisory repository yields `PROCEED` when VERIFIED+CURRENT (policy `conclusion: not_evaluated`).

**Human vs machine output.** stdout is the decision (JSON with `--json`, one-line `PROCEED · VERIFIED · CURRENT · head 1a2b3c…` otherwise); stderr carries the explanation and permalink. Never print tokens or GitHub response bodies (keeps the existing rule in `github/README.md`).

### 1.4 MCP tool specification

Studied spec versions: `2025-06-18` (introduced `outputSchema` + `structuredContent`; result `isError` for tool-level failures) and the current `2026-07-28` (adds `resultType: complete | input_required`, icons; structured tools SHOULD still return the serialized JSON in a `TextContent` block for backward compatibility). Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are defined in the schema since 2025-03-26.

```json
{
  "name": "merge_proof_decision",
  "title": "May this pull request candidate proceed?",
  "description": "Returns a Merge Proof decision for an exact candidate (repository, PR, head/base/target SHAs). PROCEED only when the evidence receipt is VERIFIED, CURRENT at observation, the repository policy is satisfied, and the SHAs you pass match the live candidate. Read-only; never merges.",
  "inputSchema": {
    "type": "object",
    "required": ["repository", "pullNumber", "expectedHeadSha"],
    "properties": {
      "repository":        { "type": "string", "description": "owner/name" },
      "pullNumber":        { "type": "integer" },
      "expectedHeadSha":   { "type": "string", "pattern": "^[a-f0-9]{40}$" },
      "expectedBaseSha":   { "type": "string", "pattern": "^[a-f0-9]{40}$" },
      "expectedTargetSha": { "type": "string", "pattern": "^[a-f0-9]{40}$" },
      "require":           { "type": "array", "items": { "enum": ["current","verified","policy","stable"] } },
      "waitSeconds":       { "type": "integer", "minimum": 0, "maximum": 600 }
    }
  },
  "outputSchema": { "$ref": "urn:merge-proof:decision:1" },
  "annotations": { "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true }
}
```

- Tool name uses underscores: MCP names are free-form, but several clients (and the GitHub server's own `merge_pull_request`, `pull_request_read`) use `snake_case`; a dotted `merge_proof.decision` is legal but gets mangled by some hosts' function-calling layers. Keep `merge_proof.decision` as the *documented concept name*, `merge_proof_decision` as the wire name.
- Result: `structuredContent` = decision; `content[0].text` = the same JSON; `isError: true` only for `UNAVAILABLE`/auth failures (the model should retry or stop), never for `HOLD`/`REFUSE` (those are successful answers).
- Resource: `merge-proof://receipt/{receiptId}` (`mimeType: application/json`) served via a resource template, plus `merge-proof://receipt/{receiptId}/html`; optional `resources/subscribe` so a client gets `notifications/resources/updated` when the receipt's currentness changes. The decision's `receipt.url` remains the canonical permalink.
- Second tool, deliberately narrow: `merge_proof_wait` is unnecessary — pass `waitSeconds`. Do **not** expose a merge tool; the GitHub server already has one and the whole point is separation of "may I" from "do it".
- **Transport.** Local developer agents (Claude Code, Codex CLI, Copilot CLI): **stdio** wrapper that obtains a GitHub token from the environment (`GH_TOKEN` or `gh auth token`) — the authorization spec says stdio implementations "SHOULD NOT follow this specification, and instead retrieve credentials from the environment". Cloud agents (Copilot coding agent, Devin, Claude Code on the web, Codex cloud): **Streamable HTTP** at `https://merge-proof.ohcaygo.com/mcp` with OAuth 2.1 + PKCE, Protected Resource Metadata (RFC 9728), resource indicators (RFC 8707), dynamic client registration — exactly the shape GitHub's remote server uses (`https://api.githubcopilot.com/mcp/`, OAuth preferred, PAT bearer accepted). Validate `Origin`; bind localhost only for a local HTTP mode.
- **Agent instruction snippet** (for AGENTS.md / CLAUDE.md / Copilot instructions):

```
Before merging or enabling auto-merge on a pull request:
1. Call merge_proof_decision with repository, pullNumber and expectedHeadSha = the head commit you reviewed.
2. Only if the result has proceed == true, call GitHub merge_pull_request with expectedHeadSha = decision.subject.headSha
   (or `gh pr merge --match-head-commit <sha>`). If GitHub answers 405/409, call merge_proof_decision again.
3. If outcome == HOLD, follow nextAction (e.g. update_pull_request_branch with expectedHeadSha, wait for the listed events) and re-ask.
4. If outcome == REFUSE or UNAVAILABLE, do not merge; report reasons[].code and the receipt URL to a human.
Never bypass with admin merge, force-push, or by dismissing reviews.
```

### 1.5 REST API

```
GET  /proof/v1/decision?repository_id=…&pr=…&expected_head=…[&expected_base=…][&expected_target=…][&require=current,policy][&wait=60]
POST /proof/v1/decision        (same fields as JSON body; preferred for agents)
GET  /proof/v1/receipts/{receiptId}          -> receipt JSON (existing ?format=json alias kept)
GET  /proof/v1/receipts/{receiptId}/attestation -> DSSE envelope + Rekor entry (Part 2)
```

Responses: `200` with decision for PROCEED/HOLD/REFUSE (HTTP status must not encode the verdict, or proxies and SDKs will retry/alarm on 4xx); `401/403` auth; `404` unknown repo/PR for this principal; `409` only when `expected_*` is malformed vs live state? — no: mismatch is a `200 REFUSE` with `request.matched=false`, because it is an answer, not a transport error; `503` with `Retry-After` for UNAVAILABLE.

Authentication models, in order of recommendation:

1. **GitHub user token pass-through (CLI, local MCP).** Client sends `Authorization: Bearer <gh token>`; the server proves repository read access by calling GitHub (`GET /repositories/{id}` with that token) and intersects with the App installation exactly as the existing session code does ("recheck the user's and App's installation/repository intersection"). No token storage; token lives only for the request. Installation-scoped tokens are *ours* (JWT → `POST /app/installations/{id}/access_tokens`, 1-hour lifetime, scoped to repos/permissions) and must never be handed to callers.
2. **GitHub Actions OIDC (CI wrappers).** Job sets `permissions: id-token: write`, requests a token with `aud=https://merge-proof.ohcaygo.com`, sends it as bearer. The server validates against `token.actions.githubusercontent.com` JWKS and binds the request to the claims: `repository_id` must equal the requested repo; for `pull_request` events `head_ref`/`base_ref` are present and `sha` is the synthetic merge commit of `refs/pull/N/merge`, so the *agent must still pass the PR head* explicitly (do not derive it from `github.sha`; that is the merge ref, and it is exactly the confusion the receipt's `HEAD_CONTAINS_CURRENT_BASE` target kind exists to avoid). Tokens are single-job and short-lived — ideal, no secret to store.
3. **Merge-Proof API keys (server integrations, e.g. an internal merge bot).** Installation-bound keys minted from the account page, prefix `mp_`, hashed at rest, repository allow-list, revocable; used when neither a user nor an Actions job is present. Keep it optional and behind Pro.

Rate limiting per principal; every decision request that triggers a live re-observation is one GitHub REST fan-out (already what refresh does), so `wait` should coalesce concurrent requests for the same candidate.

### 1.6 Webhook / callback

Event `decision.changed` posted to customer-registered URLs (per repository, configured on `/proof/gate`), body = decision object, headers `X-MergeProof-Event`, `X-MergeProof-Delivery` (UUID), `X-MergeProof-Signature-256: sha256=<hmac hex of raw body>` — the same construction GitHub uses (`X-Hub-Signature-256`, "HMAC hex digest of the request body… using the secret as the HMAC key") and Bitbucket uses (`X-Hub-Signature`). Emitted on: new receipt, currentness flip (CURRENT→STALE), policy change, and on every `HOLD→PROCEED` transition. Retries with exponential backoff up to 24h; consumers de-duplicate on `decisionId`. Note that for most GitHub-native agents the **check run itself is the callback**: GitHub delivers `check_run` (`completed`) webhooks for our App's check and Actions can trigger on `check_run` events, so a customer can react without our webhook at all.

### 1.7 GitHub Check as machine-readable output

Adopt the convention Anthropic's Code Review uses: the check run's `output.text` ends with an HTML comment whose payload is JSON, parsed with `gh api … --jq '.output.text | split("bughunter-severity: ")[1] | split(" -->")[0] | fromjson'` (Claude Code docs, "Check run output", 2026-09). For us:

```
<!-- merge-proof-decision: {"schemaVersion":1,"outcome":"HOLD","proceed":false,"verdict":"NOT_PROVEN","currentness":"CURRENT","subject":{"headSha":"…","baseSha":"…","targetSha":"…","targetKind":"PULL_REQUEST_HEAD"},"reasons":[{"code":"CURRENT_STATE_EXECUTION_NOT_PROVEN","blocking":true}],"nextAction":{"kind":"RERUN_REQUIRED_CHECKS"},"receipt":{"receiptId":"…","fingerprint":"…","url":"…"}} -->
```

- Put it as the **last line of `output.text`** (not `summary`, which we already fill with human Markdown). Both fields allow 65,535 characters; the compact decision is < 4 KB. Trim `reasons[].summary` and `missingEvidence` in the check copy; the full object is one `GET` away.
- Set `external_id` = `decisionId` (OpenAPI: "A reference for the run on the integrator's system") so `GET /repos/{o}/{r}/commits/{sha}/check-runs` gives an agent the decision id without parsing text, and `details_url` = receipt permalink (already done).
- Conclusion mapping stays: enforcing preset → `success`/`failure`; advisory → `neutral` (GitHub treats `neutral`/`skipped` as passing for required checks, which is why an advisory check must never be `success`). GitHub's `stale` conclusion is set only by GitHub.
- The check is published on both the PR head and the merge-group SHA (`check.js subjects()`); the machine line on the group check carries `targetKind: MERGE_GROUP` so an agent reading `merge_group.head_sha` (webhook `merge_group` object: `head_sha`, `base_sha`, `head_ref` = `refs/heads/gh-readonly-queue/…`, `base_ref`) can correlate.
- One caution: the check run is bound to a commit, so a check-run machine line can never say "CURRENT now"; it says CURRENT-at-`observedAt`. Agents that need "now" use the REST/MCP decision.

### 1.8 GitHub Actions step output and job summary

A small wrapper action (`ohcaygo/merge-proof-status`) that calls the decision endpoint with the job's OIDC token and writes:

```bash
{
  echo "proceed=$(jq -r .proceed d.json)"
  echo "outcome=$(jq -r .outcome d.json)"
  echo "verdict=$(jq -r .verdict d.json)"
  echo "head-sha=$(jq -r .subject.headSha d.json)"
  echo "receipt-url=$(jq -r .receipt.url d.json)"
  echo 'decision<<MP_EOF'; cat d.json; echo 'MP_EOF'     # multiline delimiter form
} >> "$GITHUB_OUTPUT"
```

and a `$GITHUB_STEP_SUMMARY` block (limit 1 MiB per step) with the human summary plus the same fenced JSON so the run page is self-explaining. Failure mode follows the CLI exit codes; `fail-on: none|hold|refuse` input mirrors `--fail-on`. This is the piece that lets a `gh pr merge --auto` wrapper in a workflow do `if: steps.mp.outputs.proceed == 'true'` and then `gh pr merge --match-head-commit ${{ steps.mp.outputs.head-sha }}`.

### 1.9 Comparison table

| Tool | Subject precision | Verdict tri-state | Reason codes | Next action | Freshness | Exit codes | JSON | MCP | Wait/poll | Auth model |
|---|---|---|---|---|---|---|---|---|---|---|
| **Merge-Proof (proposed)** | repo id + PR + head/base/target SHA + target kind; caller-supplied expected SHAs | PROCEED / HOLD / REFUSE (+UNAVAILABLE) with separate `verdict` & `currentness` | stable codes, append-only, JSON pointers to receipt | `nextAction.kind` + merge arguments | `observedAt`, event-invalidated, re-observed per request | 0/1/2/3/4/8/9 | decision v1 + receipt v2 | tool + resource, structured output | `--wait`, long-poll, webhook | gh token pass-through, Actions OIDC, API key |
| Aryamanz29/mergeproof (v1.0.1) | head commit for CI/review checks; policy per path/label | pass / warn / pending / fail (Action `verdict`) | check names (`ci.job_passed`…), scorecard | "what is still missing" prose (`explain`) | evaluated on run; `pending-ok` toggle | not documented in README | `mergeproof-report.json`, JUnit, rdjson, receipt branch | none (agent reads AGENTS.md/`agent-prompt`) | none; CI re-runs on events | `${{ github.token }}` / App |
| anur4ag/pr-completion | "head identity" rechecked at land time by `pr_land.py` | verified merged vs concrete blocker | prose blockers | embedded in skill loop | rechecks before merge | n/a (skill) | none | none (Claude Code / Codex skill) | loop until landed | user's `gh auth` |
| github/github-mcp-server | `expectedHeadSha` on merge & branch update; `pull_request_read(get_status/get_check_runs)` | GitHub mergeability (`mergeable_state`), check conclusions | GitHub's | none | live at call | n/a | tool results | yes (stdio Docker, remote HTTP OAuth/PAT) | none | OAuth (remote) / PAT |
| GitLab external status checks | MR IID + `sha` of source HEAD (409 on stale) | passed / failed / pending | none (free text name) | none | pending on new push; 409 for stale sha | n/a | webhook payload + REST | none | retry endpoint | project token / bot |
| gittuf `verify-ref` | ref name → RSL entry chain | pass / error | error text | none | verifies latest RSL entry | 0 / 1 (cobra) | none | none | none | local repo |
| slsa-verifier | artifact digest + source URI/tag/branch + builder id | PASSED / error | error text | none | n/a (static provenance) | 0 / 1 | `--print-provenance` | none | none | none (Sigstore trust root) |
| cosign `verify-blob-attestation` | blob digest ∈ statement subject (`--check-claims`), predicate type, identity | pass / fail | error text | none | tlog inclusion (or `--insecure-ignore-tlog`) | 0 / 1 | verified payload to stdout | none | none | key / keyless identity |
| conftest | input document | pass / warn / fail | Rego message strings | none | n/a | 0/1 default; 0/1/2 with `--fail-on-warn` | `--output json` | none | none | none |
| Mergify Merge Protections | PR (queue: temporary PR/branch) | check success / failure / pending ("under evaluation") | rule names & condition list in check summary **[excerpt]** | prose in check | re-evaluated on events | n/a | none public for evaluation **[excerpt]** | none | none | App |
| Aviator MergeQueue | PR; validates against latest target inside queue | open / queued / blocked / merged (+ blocked reasons) **[excerpt]** | blocked reasons (conflict, failed checks, approvals removed, head modified) | custom messages | queue re-validation | n/a | GraphQL API (token) | none | queue | API token |

Reading the table: no adjacent tool combines caller-supplied subject SHAs, a tri-state that distinguishes "not yet" from "no", stable reason codes, a typed next action, and an explicit observation time. The GitHub MCP server supplies the *merge-side* half (`expectedHeadSha`); Merge-Proof should supply the *decision-side* half and make the two SHAs the same value by construction.

---

## PART 2 — Cryptographic receipt: reality check and minimal design

### 2.1 What a signature on a receipt does and does not guarantee

| Property | Signed DSSE receipt + Rekor v2 entry | Notes |
|---|---|---|
| **Receipt integrity** | **Yes.** Bytes cannot be altered after signing without detection; the Rekor entry makes the *existence* of that exact receipt at ≤ inclusion time publicly witnessable and non-backdatable. | This is the only property signing adds that the current `fingerprint` cannot: today the hash is computed by the same party that could rewrite the receipt. |
| **Issuer authenticity** | **Yes**, to the extent the verifier trusts the published key/JWKS and the log. | Says "Merge-Proof's key signed this", nothing more. |
| **Evidence authenticity** | **No.** GitHub does not sign REST responses, check runs, reviews or ruleset state. The only authenticity we ever had is API TLS to `api.github.com` (channel, not data) and the webhook HMAC (`X-Hub-Signature-256`), which authenticates *delivery* of an event, not the truth of the PR state. The receipt is Merge-Proof's *attestation of what it observed*, not GitHub's assertion. | Say this on the receipt page. The honest sentence: "Merge Proof attests that at `observedAt` it observed these GitHub responses; GitHub does not countersign." |
| **Evidence freshness / currentness** | **No — and must stay unsigned.** Currentness is a live property re-derived on every view; signing it would freeze a claim that is false a minute later. | The decision object is *not* signed for the same reason; it references the signed receipt digest. |
| **Correctness of code** | **Never.** | Already the README's position. |
| **Platform independence** | **None.** The predicate is GitHub-shaped; a Statement with `gitCommit` subjects is portable only as an envelope. | See Part 3. |

GitHub's own artifact attestations show the boundary: public repositories sign to the Sigstore Public Good instance; private repositories use "GitHub's Sigstore instance… does not have a transparency log and only federates with GitHub Actions" (github/docs, `artifact-attestations.md`). They attest **build provenance of a file/OCI digest**; nothing GitHub ships attests review or merge state.

### 2.2 Minimal useful signed receipt

**Statement (in-toto v1).**

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    { "name": "head",    "digest": { "gitCommit": "<40-hex head sha>" } },
    { "name": "base",    "digest": { "gitCommit": "<40-hex base sha>" } },
    { "name": "target",  "digest": { "gitCommit": "<40-hex target sha>" } },
    { "name": "receipt", "digest": { "sha256": "<canonical receipt fingerprint>" } }
  ],
  "predicateType": "https://merge-proof.ohcaygo.com/attestation/receipt/v2",
  "predicate": { …the receipt v2 body, canonical form… }
}
```

- `gitCommit` is a registered DigestSet algorithm ("lowercase hex SHA-1 (40) or SHA-256 (64) of a git commit"); subjects "are matched purely by digest", so `name` is informational and `_` is allowed. Include `target` even when equal to `head` (verifiers should not have to know target kinds).
- `receipt` subject = the existing `fingerprint` (sha256 over `canonical(receipt)` in `github/common.js`). This is what lets a verifier check "the JSON I downloaded is the JSON that was signed" without re-implementing canonicalization: `sha256(canonical(json)) == subject.receipt.sha256`, and the predicate is the same JSON.
- `predicateType` is versioned with the receipt schema; the URI should resolve to the JSON schema.
- Optionally add a **companion SVR** (`https://in-toto.io/attestation/svr/v0.2`, fields `verifier.id`, `verifier.policies[]`, `timeCreated`, `properties[]`) with `properties: ["MERGE_PROOF_VERIFIED", "MERGE_PROOF_CURRENT_AT_ISSUE"]` for consumers that want a two-line summary. Do **not** issue SLSA VSAs with `SLSA_SOURCE_LEVEL_n` — VSA `verifiedLevels` is *required* and is the source-control system's claim to make; a third-party App asserting levels invites disputes (VSA spec: `verifier.id`, `resourceUri`, `policy`, `verificationResult`, `verifiedLevels` required; `timeVerified` optional).

**Envelope.** DSSE v1.0, `payloadType: "application/vnd.in-toto+json"`, PAE `"DSSEv1" SP LEN(type) SP type SP LEN(body) SP body`, one signature `{ "keyid": "<kid>", "sig": "<b64 ECDSA P-256/SHA-256, DER or IEEE-P1363 — pick DER for cosign compatibility>" }`. `keyid` is "an unauthenticated hint… MUST NOT be used for security decisions" — verifiers select the JWK by `kid` and then verify; they never trust `kid` alone. One signature only is fine (in-toto notes Sigstore bundles carry a single signature).

**Key management.**

- One asymmetric signing key in a cloud KMS (AWS KMS `ECC_NIST_P256` or GCP KMS `EC_SIGN_P256_SHA256`); private key never exportable; the hosted service holds only an IAM role that can `Sign`. `cosign attest-blob --key awskms://…` / `gcpkms://…` works directly, or ~30 lines with the SDK.
- Publish `https://merge-proof.ohcaygo.com/.well-known/merge-proof-keys.json` as a JWKS: `{ keys: [{ kty:"EC", crv:"P-256", x, y, kid, alg:"ES256", use:"sig", "mp:nbf": "...", "mp:exp": "..." }] }`. `kid` = base64url(SHA-256(DER SPKI)) (matches Sigstore's key-id convention). Rotate yearly with a 90-day overlap; **never delete** old public keys from the JWKS (receipts must verify for years); mirror the JWKS in the public repo and in each receipt HTML so a verifier has three independent copies.
- Do not use Fulcio keyless for a long-lived service: the Fulcio issuers list is OIDC-identity based (email via Dex, GitHub Actions `job_workflow_ref`, SPIFFE, Kubernetes, Buildkite/GitLab); a hosted Node process on a VPS has no Fulcio-recognized identity, and `--issue-certificate` for a self-managed key adds nothing a buyer can check.

**Transparency log.** Rekor v2 (rekor-tiles), GA October 2025, public instance `https://log2025-1.rekor.sigstore.dev` at the time of writing (sharded roughly yearly; discover the current URL via the Sigstore TUF signing config rather than hard-coding). Entry type: **`hashedrekord`** built from the DSSE PAE — per `CLIENTS.md`, clients "extract the DSSE Pre-Authentication Encoding (PAE) and signature from the DSSE envelope" and submit `sha256(PAE)` + signature + verifier; the verifier is a `publicKey` with DER bytes and `keyDetails: PKIX_ECDSA_P256_SHA_256` (self-managed keys are explicitly supported alongside Fulcio certificates). Persist the returned `TransparencyLogEntry`: `logIndex`, `logId`, `kindVersion`, `inclusionProof{logIndex, rootHash, treeSize, hashes[], checkpoint}`, `canonicalizedBody` (`integratedTime` is always 0 in v2; ignore it). Privacy consequence that matters for private repositories: the log stores **only** `sha256(PAE)`, the signature and our public key — not the payload, not the commit SHAs, not the repository name. No salting of subject names is needed; the Statement itself is served only through the auth-gated receipt route. (If the `dsse` entry kind is ever used instead, it records the payload hash and signatures, still not the payload.)

**What to embed in the HTML receipt.**

```html
<script type="application/json" id="mp-attestation">
{ "envelope": { …DSSE… },
  "tlog": { …TransparencyLogEntry… },
  "verifier": { "jwksUrl": "…/.well-known/merge-proof-keys.json", "kid": "…" },
  "sigstoreBundle": "receipt.sigstore.json" }
</script>
```

plus download links `receipt.intoto.jsonl` (the envelope) and `receipt.sigstore.json` (Sigstore bundle v0.3 wrapping the same envelope + tlog entry, which is what `cosign verify-blob-attestation --bundle` consumes). Keep the existing "Inspect full receipt JSON" block; the signed predicate must be byte-identical to `?format=json` under canonicalization. The currentness banner stays outside the signed block and says so.

**Buyer verification procedure.**

With cosign ≥ 2.6 (Rekor v2 support landed in v2.6.0):

```bash
curl -sO https://merge-proof.ohcaygo.com/.well-known/merge-proof-p256-<kid>.pem
cosign verify-blob-attestation \
  --key merge-proof-p256-<kid>.pem \
  --bundle receipt.sigstore.json --new-bundle-format \
  --type https://merge-proof.ohcaygo.com/attestation/receipt/v2 \
  --check-claims receipt.json            # checks receipt.json's sha256 is a statement subject
# then, outside cosign:
jq -r '.subject[] | "\(.name) \(.digest.gitCommit // .digest.sha256)"' statement.json   # compare head/base/target with the PR you care about
```

(`--check-claims` matches the blob digest against `subject[].digest.sha256`; that is why the canonical receipt is a subject.) Or a ~100-line dependency-free Node/Python script: (1) parse envelope, rebuild PAE, verify ES256 with the JWK selected by `kid`; (2) parse the Statement, assert `predicateType`; (3) assert `sha256(canonical(receipt))` equals the `receipt` subject and equals `sha256(predicate)`; (4) assert `head/base/target` gitCommit digests equal the PR the buyer is auditing; (5) recompute the RFC 6962 leaf hash from `canonicalizedBody`, fold `inclusionProof.hashes` up to `rootHash`, compare with the root inside `checkpoint`, and verify the checkpoint signature with the Rekor log key from the Sigstore trusted root. Ship this script in the repo under `verify/` with a fixture receipt so the buyer never needs cosign.

**Cost.** KMS: ~US$1/key/month + ~US$0.03 per 10k signatures; Rekor public good: free, 99.5 % SLO, expect the shard URL to change yearly; storage: ~6 KB per receipt; engineering: 3–5 days for signing + log upload + JSON exposure, 2–3 days for HTML embedding and the verify script, 1 day for JWKS and rotation runbook. Roughly two weeks of one engineer, no new vendors.

### 2.3 Security theater to avoid

1. Signing the **decision** or the currentness banner — it freezes a claim that is designed to expire.
2. Calling the receipt "GitHub-verified" or "tamper-proof evidence"; it is Merge-Proof-signed observation of unsigned GitHub data.
3. Timestamps without a log (a signed `issuedAt` is only as honest as our clock); Rekor inclusion is the non-backdating proof, and even it bounds only "before inclusion".
4. Issuing SLSA `SLSA_SOURCE_LEVEL_n` VSAs — the SCS's role, and a compliance-authority posture the product does not want.
5. Keyless signing via a Dex email identity ("signed by a Google account") — identity without an operational meaning.
6. Trusting `keyid` to pick "the" key without a published, pinned JWKS; or serving the JWKS only from the same origin as the receipt (mirror it in the repo).
7. A self-hosted Rekor: it converts a public, witnessed log into a private database with extra steps.
8. Signing the HTML page, screenshots, or PDF; sign the canonical JSON and make the HTML carry it.
9. Blockchain anchoring, "immutable ledger" wording, or NFT-style badges.
10. A `verified` green padlock UI that implies correctness; the badge must say "signature valid · receipt integrity only".

---

## PART 3 — Cross-platform normalization feasibility

### 3.1 Normalization table

Legend: **Y** first-class field; **~** derivable or partial; **N** absent. GitLab facts from the `gitlabhq/gitlabhq` doc tree (master, 2026-09); Bitbucket Cloud facts partly **[excerpt]**.

| Concept | GitHub | GitLab | Bitbucket Cloud | Exists everywhere? |
|---|---|---|---|---|
| Repository identity | `repository.id` (int), `full_name` | `project.id`, `path_with_namespace` | `repository.uuid`, `full_name` | Y |
| Candidate identity | PR `number`, `node_id` | MR `iid` (+ global `id`) | PR `id` | Y |
| Head SHA | `pull.head.sha` | `sha` = "SHA of the head commit in the source branch"; `diff_refs.head_sha` | `source.commit.hash` | Y |
| Base tip SHA (live) | `pull.base.sha` (may lag; confirm via `GET /branches`) | `diff_refs.start_sha` ("SHA of the target branch commit"); live via branches API | `destination.commit.hash` (may lag) | Y (~ staleness caveats on all three) |
| Merge base | `GET /compare` `merge_base_commit` | `diff_refs.base_sha` ("merge base… where the branches diverged") | compute via commits API | Y/~ |
| Merged-result / candidate commit | `refs/pull/N/merge` (synthetic, not exposed as a field); merge-queue group `merge_group.head_sha` | merged results pipeline on `refs/merge-requests/N/merge`; merge train ref `refs/merge-requests/N/train` (train pipeline = previous cars + this MR + target) | N (no merged-result ref; builds run on source head) | ~ (GitHub, GitLab) / N (Bitbucket) |
| CI result bound to a SHA | check runs (`head_sha`, app id, conclusion) and commit statuses | `head_pipeline` on source HEAD; pipeline `sha`; external status check responses bound to `sha` (409 if not current HEAD) | build statuses per commit (`commit/{sha}/statuses/build`, `key`, `state` SUCCESSFUL/FAILED/INPROGRESS) | Y |
| CI execution record (jobs/steps) | Actions runs/jobs/steps API | pipelines/jobs API | Pipelines API (only for Bitbucket Pipelines) | Y/~ |
| Approval bound to a SHA | review `commit_id` | approval not stored with SHA; `approve` accepts `sha` (409 mismatch) as a *precondition*; `approved_by[]` has timestamps only | `participants[].{approved, participated_on, state}`; no commit hash on the approval | **Y (GitHub only, natively)**; GitLab/Bitbucket ~ via timestamps + push events |
| Approval reset policy | dismiss-stale-reviews rule | default "remove all approvals when commits are added" (patch-id based; rebases may keep approvals), selective Code Owner removal | branch restriction `reset_pullrequest_approvals_on_change`; "Keep approvals if no changes to the diff" | Y as *policy*; semantics differ |
| Changes-requested state | review `CHANGES_REQUESTED` | none native (MR "reviewer" states / "request changes" in newer versions) **[excerpt]** | `participants[].state = changes_requested` | ~ |
| Protection snapshot | branch protection + rulesets API (incl. bypass actors) | `protected_branches` (push/merge access levels, `allow_force_push`, `code_owner_approval_required`), approval rules API, "status checks must succeed" setting | branch restrictions API (`kind`, `pattern`) | Y (depth varies) |
| Bypass record | ruleset bypass audit / `merged_by` with rule evaluation | audit events (Premium/Ultimate) | Atlassian Guard audit log (paid, partial) | ~ |
| Landed commit | `merge_commit_sha`, `merged_by`, `merged_at` | `merge_commit_sha`, `squash_commit_sha`, `merge_user`, `merged_at` | `merge_commit.hash`, `closed_by`, `updated_on` | Y |
| Merge with SHA precondition | REST `sha` (409), GraphQL `expectedHeadOid`, `gh --match-head-commit`, MCP `expectedHeadSha` | `PUT …/merge` `sha` (409 "SHA does not match HEAD of source branch"); instance setting to *require* `sha` (GitLab 19.2); merge-train add `sha` | N (merge body: `merge_strategy`, `close_source_branch`, `message`; no hash precondition) | Y/Y/**N** |
| Webhook authenticity | `X-Hub-Signature-256` HMAC | secret token header (`X-Gitlab-Token`, static compare) | `X-Hub-Signature` HMAC-SHA256 | Y (mechanism differs) |
| External gate hook | Check run (required by ruleset) | External status check (webhook out, `status_check_responses` in, `sha`-bound, blocks when "Status checks must succeed") | Forge `bitbucket:mergeCheck` (`on-code-pushed`, `on-reviewer-status-changed`, `on-merge`; payload has source/destination commit hashes; Premium to enforce) | Y (GitLab's is cleanest; Bitbucket's is sandbox-hosted) |
| Queue / train | merge queue (`merge_group`, `gh-readonly-queue/*`, ALLGREEN/HEADGREEN) | merge trains (`/train` ref, car status idle/fresh/stale) | N | ~ |

### 3.2 Platform-neutral versus GitHub-specific concepts

**Neutral (safe to model in a shared schema):** repository id, candidate id/number, head SHA, base tip SHA, merge base, "candidate/merged-result commit" (nullable), check/build result on a SHA, approval event with actor + time (+ SHA when the platform records it), approval-reset policy snapshot, protection snapshot (opaque per platform, hashed), landed commit, merge-with-SHA guard availability, observation time and consistency.

**GitHub-specific (keep behind `platform: github` extensions):** merge groups with HEADGREEN vs ALLGREEN semantics and the two-subject check publication; ruleset *bypass modes/actors* and the distinction between classic protection and rulesets; the *expected source App* binding of a required check (`app_id` on required status checks) and the self-reference guard; `stale`/`neutral`/`skipped` check-conclusion semantics; `refs/pull/N/merge` invisibility (the `HEAD_CONTAINS_CURRENT_BASE` target kind); Actions run/job/step execution evidence and OIDC claims.

**GitLab-specific:** patch-id based approval retention, selective Code Owner removal, `detailed_merge_status`, train car states, "require sha on merge API" instance setting, external status check 409-on-stale semantics.

**Bitbucket-specific:** no merged-result ref and no SHA precondition on merge (the decision could be honoured only by re-checking `source.commit.hash` immediately before calling merge — a race we cannot close), Forge sandbox hosting for gates, Premium-only enforcement, Guard-only audit.

### 3.3 Is a platform-neutral receipt schema realistic?

Yes for the **decision** and the **identity/subject core**; no for the **evidence body**, and it should not be attempted now.

- The decision object above is already neutral by construction: `subject.platform`, `candidate.kind/number`, three SHAs, `targetKind`, stable reason codes. Adding GitLab later means adding `platform: gitlab`, `candidate.kind: merge_request`, and a `targetKind` value for `MERGED_RESULT_REF`/`TRAIN_REF`. Nothing in the agent-facing contract has to change.
- The receipt evidence body is inherently per-platform (`policy: github-exact-state-v1` already scopes it). A GitLab receipt would be `gitlab-exact-state-v1` with its own `summary.ci` (pipelines, external status checks), `summary.approval` (approved_by + push timeline, no SHA), `summary.rules` (protected branches, approval rules, "status checks must succeed"). Pretending these are one schema would either lose GitHub precision (approval-on-SHA) or invent GitLab facts that do not exist.
- The signed Statement is neutral at the envelope level (gitCommit subjects, per-platform `predicateType`), which is exactly the right seam.

**Cost of staying GitHub-only for 12 months:** near zero *if* three rules are followed now: (1) the decision schema and CLI never use GitHub-only nouns (`candidate.number` not `pr`, `platform` present, reason codes without "GitHub" in the name), (2) receipt `policy` ids stay platform-prefixed, (3) `targetKind` is an open enum. Under those rules a GitLab port later is ~4–6 engineer-weeks (collector, receipt policy, external status check publisher, OAuth app) with no migration of existing receipts or agent integrations. Bitbucket Cloud should stay "later/no": without a merge-SHA guard the core TOCTOU promise cannot be kept, and enforcement is Premium-gated; Bitbucket Data Center is out of scope entirely. The market reasoning in the earlier vendor research (win on GitHub where agent-authored PR volume is) stands; the only thing to buy today is the naming discipline.

---

## Recommendations (ordered)

1. Ship `urn:merge-proof:decision:1` + `POST /proof/v1/decision` with gh-token pass-through and Actions OIDC auth; add `external_id` and the `<!-- merge-proof-decision: … -->` last line to the check run. (~1 week)
2. Ship `merge-proof status` / `gh merge-proof status` with exit codes 0/1/2/3/4/8/9 and `--expect-head`; document the `--match-head-commit` / `expectedHeadSha` pairing in the README's agent section. (~3 days)
3. Ship the MCP server as a stdio wrapper first (same code as the CLI), Streamable HTTP + OAuth 2.1 second. (~1 week, then ~1 week)
4. Sign receipts (KMS P-256 DSSE, Rekor v2 hashedrekord, JWKS, embedded bundle, `verify/` script). (~2 weeks)
5. Do not build GitLab/Bitbucket now; enforce the three naming rules in code review.

---

## Sources (URL — accessed 2026-09-19 unless noted)

- GitHub REST OpenAPI description (`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` `sha`, 405/409; check-run `external_id`, `output.summary/text` maxLength 65535, conclusion enum; `merge-group` schema) — https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
- GitHub CLI `gh pr merge` `--match-head-commit` → `expectedHeadOid` — https://raw.githubusercontent.com/cli/cli/trunk/pkg/cmd/pr/merge/merge.go ; exit codes 0/1/2/4 — https://raw.githubusercontent.com/cli/cli/trunk/pkg/cmd/root/help_topic.go ; `gh pr checks` exit 8 pending — https://cli.github.com/manual/gh_pr_checks **[excerpt]**
- GitHub MCP server (`merge_pull_request.expectedHeadSha`, `update_pull_request_branch.expectedHeadSha`, `pull_request_read`, remote URL, OAuth/PAT, stdio Docker) — https://raw.githubusercontent.com/github/github-mcp-server/main/README.md
- MCP specification: tools (`outputSchema`, `structuredContent`, `isError`) 2025-06-18 — https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2025-06-18/server/tools.mdx ; 2026-07-28 (`resultType`, text fallback) — …/2026-07-28/server/tools.mdx ; authorization (OAuth 2.1, RFC 9728/8707, stdio uses environment) — …/2025-06-18/basic/authorization.mdx ; transports — …/2025-06-18/basic/transports.mdx ; resources — …/2025-06-18/server/resources.mdx ; version list — https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification
- Claude Code Review check-run machine line (`bughunter-severity`, jq recipe, neutral conclusion) — https://code.claude.com/docs/en/code-review
- GitHub Actions workflow commands (`GITHUB_OUTPUT` delimiter form, `GITHUB_STEP_SUMMARY` 1 MiB) — https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/workflow-commands.md
- GitHub Actions OIDC claims and token request — https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/security/openid-connect.md
- GitHub App installation tokens — https://raw.githubusercontent.com/github/docs/main/content/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app.md
- GitHub webhooks `X-Hub-Signature-256` — https://raw.githubusercontent.com/github/docs/main/content/webhooks/webhook-events-and-payloads.md
- GitHub merge queue (`merge_group`, `gh-readonly-queue`, "only merge non-failing PRs") — https://raw.githubusercontent.com/github/docs/main/content/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue.md
- GitHub artifact attestations (public good vs GitHub Sigstore instance without tlog) — https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/security/artifact-attestations.md
- Aryamanz29/mergeproof README, action.yml (outputs `verdict` pass/warn/pending/fail, `report`, `receipt`), v1.0.1 (2026-09-15) — https://github.com/Aryamanz29/mergeproof ; https://raw.githubusercontent.com/Aryamanz29/mergeproof/main/action.yml
- anur4ag/pr-completion README — https://raw.githubusercontent.com/anur4ag/pr-completion/main/README.md
- gittuf `verify-ref` — https://raw.githubusercontent.com/gittuf/gittuf/main/docs/cli/gittuf_verify-ref.md ; https://raw.githubusercontent.com/gittuf/gittuf/main/internal/cmd/verifyref/verifyref.go
- slsa-verifier README and `main.go` (`os.Exit(1)`) — https://raw.githubusercontent.com/slsa-framework/slsa-verifier/main/README.md ; …/cli/slsa-verifier/main.go
- cosign `verify-blob-attestation`, `attest-blob`, `sign-blob`, `verify-blob` docs — https://raw.githubusercontent.com/sigstore/cosign/main/doc/cosign_verify-blob-attestation.md (and siblings)
- conftest exit codes (0/1 default; 0/1/2 with `--fail-on-warn`) — https://www.conftest.dev/options/ **[excerpt]**; issue #387 — https://github.com/open-policy-agent/conftest/issues/387
- git merge-tree exit status — https://raw.githubusercontent.com/git/git/master/Documentation/git-merge-tree.adoc
- Mergify Merge Protections (check named "Mergify Merge Protections") — https://docs.mergify.com/merge-protections/setup/ **[excerpt]**; Aviator blocked reasons — https://docs.aviator.co/mergequeue/concepts/pull-request-lifecycle **[excerpt]**
- in-toto Statement v1, DigestSet (`gitCommit`), envelope (`application/vnd.in-toto+json`, DSSE v1.0, single-signature bundle caveat), SVR v0.2, VSA — https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/statement.md ; …/digest_set.md ; …/envelope.md ; …/spec/predicates/svr.md ; …/spec/predicates/vsa.md
- DSSE envelope and protocol (PAE, keyid MUST NOT be used for security decisions) — https://raw.githubusercontent.com/secure-systems-lab/dsse/master/envelope.md ; …/protocol.md
- SLSA VSA v1 (required fields) — https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/verification_summary.md
- Rekor v2 / rekor-tiles: README (log2025-1 URL, 99.5 % SLO), CLIENTS.md (hashedrekord from DSSE PAE, self-managed `publicKey` + `keyDetails`, TransparencyLogEntry) — https://raw.githubusercontent.com/sigstore/rekor-tiles/main/README.md ; …/CLIENTS.md ; Rekor v2 GA Oct 2025, cosign v2.6.0 support — https://blog.sigstore.dev/rekor-v2-ga/ **[excerpt]**
- Sigstore protobuf `TransparencyLogEntry` — https://raw.githubusercontent.com/sigstore/protobuf-specs/main/protos/sigstore_rekor.proto
- Fulcio OIDC issuers — https://raw.githubusercontent.com/sigstore/fulcio/main/docs/oidc.md
- GitLab MR API (`sha`, `diff_refs`, `merge_commit_sha`, `squash_commit_sha`, `head_pipeline`, `detailed_merge_status`; merge `sha` 409; require-sha setting GitLab 19.2) — https://raw.githubusercontent.com/gitlabhq/gitlabhq/master/doc/api/merge_requests.md ; https://docs.gitlab.com/api/merge_requests/ **[excerpt]**
- GitLab approvals API (`approve` `sha` → 409; `approved_by`; reset on new commit) — https://raw.githubusercontent.com/gitlabhq/gitlabhq/master/doc/api/merge_request_approvals.md ; approval settings (patch-id, selective Code Owner removal) — …/doc/user/project/merge_requests/approvals/settings.md
- GitLab external status checks (payload `object_attributes.last_commit.id`; `status_check_responses` `sha`/`status`; 409 on stale; "Status checks must succeed"; retry) — …/doc/api/status_checks.md ; …/doc/user/project/merge_requests/status_checks.md
- GitLab merged results pipelines, merge trains (`refs/merge-requests/N/train`, car status), merge trains API (`sha`), protected branches API, audit events — …/doc/ci/pipelines/merged_results_pipelines.md ; …/doc/ci/pipelines/merge_trains.md ; …/doc/api/merge_trains.md ; …/doc/api/protected_branches.md ; …/doc/api/audit_events.md
- Bitbucket Cloud: PR fields and merge parameters via atlassian-python-api client — https://raw.githubusercontent.com/atlassian-api/atlassian-python-api/master/atlassian/bitbucket/cloud/repositories/pullRequests.py ; participants/approved/merge_commit **[excerpt]** — https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/ ; build statuses **[excerpt]** — https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commit-statuses/ ; reset approvals / keep approvals **[excerpt]** — https://www.atlassian.com/blog/bitbucket/preserving-pull-request-approvals ; Forge `bitbucket:mergeCheck` **[excerpt]** — https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/ ; webhook `X-Hub-Signature` **[excerpt]** — https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-python-sample-code-to-verify-webhook-signature/
- Internal prior research reused: `docs/research/sources/04-gitlab-atlassian.md`, `05-adjacent-vendors.md`, `06-attestation-slsa-sigstore.md` (2026-09-19).
