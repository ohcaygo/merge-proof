# H — Distributed currentness, event sourcing and adversarial testing for Merge-Proof

Level 3 · 2026-09-19 · grounded in the repository at `github/service.js`, `github/collect.js`, `github/proof.js`, `github/ledger.js`, `github/client.js`, `factory/store.js` (read-only; line numbers below refer to those files as read today).

**Status line.** The current design is *safe but not convergent*: every signed repository event stales every receipt in the repository and re-queues every tracked PR (`service.js:501-552`), each re-proof costs two full observations (`collect.js:525-538`, ~38 requests in the minimal fixture per Level 2 G4), and there is no reconciliation, so a missed or dropped delivery is never discovered. This document replaces the repository-wide revision counter with a per-claim binding model, an epoch/delivery-set rule for out-of-order and duplicate deliveries, an append-only observation ledger with a minimal migration, and a model-based test harness whose oracle is the same binding model. Everything that touches GitHub's documented behaviour cites a primary source in the Sources section; anything that is inference is marked.

---

## Part 1 — GitHub delivery semantics and the race windows they create

### 1.1 What GitHub actually guarantees (primary sources)

| Property | Documented behaviour | Source |
|---|---|---|
| Ordering | "GitHub may deliver webhooks in a different order than the order in which the events took place. If you need to know when the event occurred relative to another event, you should use the timestamps that are included in the delivery payload." | Troubleshooting webhooks §"Webhooks deliveries are out of order" |
| Duplicates | Not promised absent, and redeliveries reuse the same GUID: "If you request a redelivery, the `X-GitHub-Delivery` header will be the same as in the original delivery." Best practice is to dedupe on `X-GitHub-Delivery`. | Best practices for using webhooks §"Use the X-GitHub-Delivery header" |
| Response deadline | 2XX within **10 seconds** on GitHub.com (30 s on GHES); otherwise the connection is terminated and the delivery counts as failed. GitHub recommends queueing and processing asynchronously. | Best practices §"Respond within 10 seconds" |
| Automatic retry | **None.** "GitHub does not automatically redeliver failed deliveries." | Redelivering webhooks |
| Manual/API redelivery | `POST /repos/{o}/{r}/hooks/{hook_id}/deliveries/{delivery_id}/attempts` (repo hook), `POST /app/hook/deliveries/{delivery_id}/attempts` and `GET /app/hook/deliveries` (App hook, JWT auth, cursor pagination, `status` filter). Delivery items carry `id, guid, delivered_at, redelivery, duration, status, status_code, event, action, installation_id, repository_id, throttled_at`. | REST OpenAPI (fpt, 2022-11-28) `x-webhooks` / `paths` |
| Retention of deliveries | `{% data variables.webhooks.retention %}` resolves to **3 days on GitHub.com/GHEC, 7 on GHES** (`data/variables/webhooks.yml`). The commonly repeated "7 days" is wrong for the hosted product Merge-Proof runs against. | `data/variables/webhooks.yml` |
| Payload cap | 25 MB; larger payloads are **not delivered at all** (documented example: a push with many commits). | `data/reusables/webhooks/payload_cap.md` |
| Headers | `X-GitHub-Hook-ID`, `X-GitHub-Event`, `X-GitHub-Delivery`, `X-GitHub-Hook-Installation-Target-ID`, `X-GitHub-Hook-Installation-Target-Type`, `X-Hub-Signature-256`. | Webhook events and payloads §"Delivery headers" |
| Test-merge / `mergeable` | `mergeable` is `true`/`false`/`null`; `null` means "GitHub has started a background job to compute the mergeability … resubmit the request." The `refs/pull/N/merge` ref is regenerated only when a PR is *viewed* or fetched via GET/POST/PATCH pulls; "this content becomes outdated without warning." | OpenAPI GET pulls description; Git DB guide §"Checking mergeability" |
| Check-run visibility | `GET /repos/{o}/{r}/commits/{ref}/check-runs` limits to the 1,000 most recent check suites; checks created for pushes in forks are not detected (`pull_requests` empty). No latency bound is documented (inference: check_run webhooks and REST reads are eventually consistent, usually sub-second, occasionally seconds). | OpenAPI GET check-runs description |
| Active rules | `GET /repos/{o}/{r}/rules/branches/{branch}` returns all *active* rules from any level (repo or org); evaluate/disabled rulesets are excluded. | OpenAPI description |
| Primary rate limit | Installation tokens: 5,000 req/h minimum, +50/h per repo above 20 and per user above 20, cap 12,500; 15,000 on GHEC. GraphQL: same numbers in points. | `primary-rate-limit-github-app-installations.md`; GraphQL rate limits |
| Secondary limits | ≤100 concurrent requests (REST+GraphQL shared); ≤900 REST points/min per endpoint (GET=1, mutating=5); ≤2,000 GraphQL points/min; ≤90 s CPU per 60 s; content-creation ≤80/min, ≤500/h (check-run POST/PATCH count here); "subject to change without notice"; no way to query secondary status. | `secondary-rate-limit-rest-graphql.md` |
| Conditional requests | Authenticated `If-None-Match`/`If-Modified-Since` returning 304 **does not count against the primary limit**; not supported for unsafe methods. Make requests serially to avoid secondary limits. | Best practices for the REST API |
| GraphQL vs REST | Separate primary budgets (points vs requests) for the same installation; secondary CPU budget is shared. No documented consistency guarantee between them; both read the same backing stores (inference). Merge-Proof already uses GraphQL only for `mergeQueueEntry` and `branchProtectionRule` absence (`collect.js:66-89, 264-297`). | GraphQL rate limits |

Two consequences that Level 2 did not state: (1) because retention is 3 days, the "App-hook-deliveries scan to detect missed deliveries" must run at least daily, ideally every few hours, or it detects nothing; (2) `repository_ruleset` payloads are **not required to carry `repository`** (`required: [action, repository_ruleset, sender]`, supported types repository/organization/app), so an org-level ruleset edit delivered to the App today hits `assert(repoName(repo) …, "INVALID_WEBHOOK_SCOPE")` at `service.js:441-447`, throws, returns non-2XX, and stales nothing. That is a live currentness hole, not a race.

### 1.2 Race-window table

"Window" is the interval during which Merge-Proof can hold or publish a state that no longer matches GitHub. "Today" describes `service.js` as read; "Design" is the Part 2 behaviour.

| # | Race | Window | Today | Failure mode today | Design (Part 2) |
|---|---|---|---|---|---|
| R1 | Approval racing push: reviewer approves head H1; author pushes H2 seconds later; `pull_request_review.submitted` and `pull_request.synchronize` arrive in either order | From push to second delivery | Both events stale the whole repo; the two observations hash-compare so a collection straddling the push is `CHANGED_DURING_COLLECTION` | Safe (approval is bound to `review.commit_id == headSha`, `proof.js:176-183`); liveness: two full re-proofs | `APPROVAL_CURRENT` binding = (headSha, set of latest review ids with commit_id==headSha); `synchronize` moves `TARGET` → all dependents stale, one targeted recheck |
| R2 | Check completion racing policy update: admin adds required check "lint" while "test" completes | Between `check_run.completed` and `repository_ruleset.edited` | Full re-proof either way | Safe; if the ruleset event lacks `repository` (org-level) → **no invalidation at all** (§1.1) | `RULES_SNAPSHOT` binding rechecked by `GET /rules/branches/{base}` (1 request, ETag-eligible); org-level events map to every tracked repo in the org |
| R3 | Queue entry/exit racing group events: `pull_request.enqueued` → `merge_group.checks_requested` → `merge_group.destroyed` (`reason` dequeued/merged/invalidated) | Seconds to minutes | `merge_group` attaches the *latest* group to every subscription in the repo (`service.js:537-559`), `enqueued/dequeued` are treated as generic PR events | Wrong group can be bound to the wrong PR's job; collection then fails `CANDIDATE_NOT_IN_GROUP` (safe) but burns a full proof | Group binding keyed by PR via GraphQL `mergeQueueEntry` (already collected) not by broadcast; `destroyed` stales only `TARGET(MERGE_GROUP)` of PRs whose entry headCommit == destroyed head_sha |
| R4 | Merge racing receipt publication: `run()` finishes, `check.publish` POSTs, PR merges between them | ≤ seconds | `publishedAt` recorded after POST; `recordMerge` picks the latest receipt issued before `merged_at` (`service.js:566-598`) | Ledger says `currentnessAtMerge: UNAVAILABLE` (honest); the published check may say success for a merged PR | Unchanged semantics; ledger row now references observation ids (Part 3) so the "what was known" question is answerable |
| R5 | Post-merge push arriving before `pull_request.closed`: `push` to base (the merge itself) delivered before `pull_request.closed(merged)` | Unbounded by docs; typically < 1 s | `push` stales all, queues re-proof; `closed` then deletes the subscription but the queued job may still run against a merged PR → `LIVE_PR_NOT_OPEN` NOT_PROVEN receipt | Wasted proof, a confusing NOT_PROVEN receipt after a VERIFIED one | State machine: `push` to base marks `TARGET.baseSha` possibly-changed; the targeted recheck reads `GET pulls/{n}` first and transitions to CLOSED without a proof |
| R6 | Base advancing twice during a collection | Duration of collection (two observations, ~40 requests, tens of seconds) | Detected by hash mismatch or revision bump → STALE/`EVIDENCE_CHANGED_DURING_COLLECTION` | Safe; livelock on busy bases (Level 2) | Observation records `baseSha` at start; `push` events with `before/after` chain are applied as binding moves; convergence argument in §2.6 |
| R7 | Ruleset edit during collection | Same | Same | Same | Same, plus rules ETag check at end of observation |
| R8 | Duplicate/replayed delivery after state moved on (redelivery reuses GUID) | Any time within 3-day retention | `events.includes(id)` dedupes (`service.js:373`) but the array is capped at 10,000 and never pruned by age | Correct until capacity; then `DELIVERY_CAPACITY` assert → all webhooks rejected | Dedup set keyed by GUID with 4-day TTL (> retention), and a *late unseen* delivery is a targeted recheck, never a blind stale |
| R9 | Reviewer loses write permission (`member.removed`, `team.removed_from_repository`, `organization.member_removed`) | Until next event | Not subscribed; permission is observed only during collection (`collect.js:467-482`) | Published success check persists after the approver lost authority | Subscribe; map to `APPROVAL_CURRENT.writePermission[login]` (§2.2) |
| R10 | Installation permissions narrowed (`installation.new_permissions_accepted` only fires on *accept*; removal of a repo is `installation_repositories`) | — | Handled for repo removal; permission loss surfaces as `GITHUB_HTTP_403` → UNAVAILABLE | Safe | Unchanged; UNAVAILABLE is the correct fail-closed state |
| R11 | Check `rerequested` on an already-VERIFIED target: `check_run.rerequested` → run goes `in_progress` on the same SHA | Until completion | Stales all | Safe | `CI_EXECUTED[name]` marked possibly-changed; recheck via `GET commits/{sha}/check-runs?check_name=` (1 request) |
| R12 | `mergeable == null` window after a base push: PR fetched before the background job finishes | Seconds | `githubMergeable: "UNKNOWN"` lands in identity; hash mismatch across observations → `CHANGED_DURING_COLLECTION` | Spurious STALE (Level 2 G3) | `githubMergeable/githubMergeState` are excluded from binding hashes (they are GitHub's *opinion*, not evidence Merge-Proof proves) |
| R13 | Payload > 25 MB (huge push) never delivered | Permanent | Nothing stales | Receipt stays CURRENT after base moved | Periodic reconciliation (§2.7) reads `GET branches/{base}` (ETag) and catches it |
| R14 | Server down > 3 days | Permanent | Deliveries expire; no scan | Silent staleness | Reconciliation on boot: full re-observe of every tracked PR, then delivery scan |

---

## Part 2 — Per-claim currentness model

### 2.1 Claims, bindings, values

A **claim** is one proposition the receipt asserts. A **binding** is the content-addressed value the claim was evaluated against: `bindingId = sha256(canonicalJSON(value))`. A claim is CURRENT while every binding it depends on still has the same `bindingId` on GitHub; it is STALE when a binding's id changed; it is UNAVAILABLE when a binding could not be re-read. Currentness of the *receipt* is the conjunction over its claims, but the customer surface shows which claim moved.

| Claim | Meaning (already in receipt) | Bindings it depends on |
|---|---|---|
| `TARGET` | the exact tree GitHub would merge (`HEAD_CONTAINS_CURRENT_BASE` / `PR_TEST_MERGE` / `MERGE_GROUP`) | `B.head` (headSha, headRef, headRepositoryId), `B.base` (baseRef, baseSha), `B.mergeref` (test-merge sha + parents) or `B.group` (queue head_sha, base_sha, entry id/state) |
| `CI_EXECUTED[name,appId]` | one per required check: completed success on target sha, one job, all steps success | `B.rules` (for the name list), `B.check[name]` (latest check-run id/status/conclusion on target sha), `B.run[checkId]` (workflow run id/attempt/status/jobs/steps) |
| `APPROVAL_CURRENT` | ≥ N latest approvals bound to headSha by non-author users with write permission, no CHANGES_REQUESTED | `B.head`, `B.rules` (count, dismiss-stale, last-push, code-owners), `B.reviews` (set of latest review id/state/commit_id per user), `B.perm[login]` per approver |
| `RULES_SNAPSHOT` | the requirement set the proof was evaluated under | `B.rules` = hash(classic projection ∪ active rules projection) (`collect.js:24-101`) |
| `REMOTE_DURABLE` | head ref in head repo still points at headSha | `B.remoteRef` (head repo id, ref, sha) |
| `LANDED_BOUND` (ledger, post-merge) | merge commit's second parent == receipt headSha and first parent == baseSha at proof | `B.landed` (merge_commit_sha, parents) — immutable once observed |

Deliberately *not* bindings: `mergeable`, `mergeable_state`, review bodies, check output, `updated_at` timestamps, our own check run. These are the fields that produced Level 2's false STALEs (G1–G3).

### 2.2 Binding → event map

Column "scope" says which PRs an event can touch, which is what stops the repository-wide broadcast.

| Webhook event · action | Bindings possibly changed | Scope | Notes |
|---|---|---|---|
| `push` (ref == base branch) | `B.base`, `B.mergeref`, `B.group` (queue rebuilds), and `B.check[*]`/`B.run[*]` only if `strict` | every tracked PR with that base | `before/after` chain lets the recheck confirm whether `after` is what we last observed |
| `push` (ref == a tracked PR's head ref, same repo) | `B.head`, `B.remoteRef` | that PR | `pull_request.synchronize` normally follows; either one suffices |
| `push` (ref == `gh-readonly-queue/*`) | `B.group` | PRs whose entry head matches | ignore otherwise |
| `push` (any other ref) | none | none | **today this stales the repo** |
| `push` to `.github/workflows/*` on base | `B.rules` no; `B.run[*]` policy: mark `CI_EXECUTED[*]` possibly-changed only if `strict` | base PRs | Workflow identity is a Level 2 gap; recorded here as rechecked-not-inferred |
| `pull_request.opened/reopened/ready_for_review` | creates subscription | that PR | |
| `pull_request.synchronize` | `B.head`, `B.mergeref`, `B.remoteRef`, `B.reviews` (dismiss-stale) , `B.check[*]`, `B.run[*]` | that PR | new head ⇒ every dependent claim re-proves; this is the one case where "re-proof of dependents only" equals a full re-proof |
| `pull_request.edited` with `changes.base` | `B.base`, `B.rules` (different branch ⇒ different rules), `B.mergeref` | that PR | `changes.base.ref.from` documented in payload |
| `pull_request.edited` without `changes.base` | none | — | title/body edits are noise |
| `pull_request.closed` (merged) | `B.landed` created; subscription ends | that PR | ledger record |
| `pull_request.closed` (not merged) / `converted_to_draft` | subscription ends / claim `LIVE_PR_NOT_OPEN` | that PR | |
| `pull_request.enqueued` / `dequeued(reason)` | `B.group` | that PR | today generic; use `reason` (`MERGE_CONFLICT`, checks failed, etc.) for the customer sentence |
| `pull_request.labeled/assigned/…` | none | — | noise today |
| `pull_request_review.submitted/dismissed/edited` | `B.reviews` | that PR | `edited` changes body only; only `state` transitions matter — recheck confirms unchanged and notes it |
| `pull_request_review.requested/request_removed` | none | — | |
| `check_run.created/completed/rerequested` | `B.check[name]` iff `check_run.name` ∈ required names **and** `check_run.head_sha` ∈ {headSha, targetSha} of a tracked PR | matching PRs | app id == ours ⇒ ignored (kept) |
| `check_run.requested_action` | none | — | |
| `check_suite.*` | `B.check[*]` for that `head_sha` only if a required check has no check_run yet | matching PRs | mostly redundant with check_run |
| `workflow_run.completed` | `B.run[checkId]` for runs whose `head_sha` is a target sha | matching PRs | `requested/in_progress` are noise unless the run is already *accepted* (then mark `B.run` possibly-changed — a rerun on an accepted run) |
| `status` | `B.check[name]` when a required context is a commit status on a target sha | matching PRs | |
| `merge_group.checks_requested` | `B.group` for the PRs in the group (GraphQL entry lookup; do not broadcast) | those PRs | |
| `merge_group.destroyed` | `B.group` for PRs whose entry head == destroyed head | those PRs | |
| `repository_ruleset.created/edited/deleted` (repo **or org** level; payload may lack `repository`) | `B.rules` | every tracked PR in the repo, or in every tracked repo of the org when `repository` is absent | fix `service.js:441-447` |
| `branch_protection_rule.*` | `B.rules` | tracked PRs whose base == rule pattern (or all in repo when pattern is a glob) | |
| `repository.edited/renamed/privatized/publicized/transferred/archived` | identity (`repositoryId` is stable; `full_name` may change) | all in repo | recheck `GET /repos/{id}` |
| `member.removed/edited`, `team.removed_from_repository/edited`, `membership.removed`, `organization.member_removed` | `B.perm[login]` for approvers | PRs whose current approvals include that user or a team member | **not subscribed today; subscribe.** Team membership expansion is 1 request per team (`GET /orgs/{org}/teams/{slug}/members`) — or simply recheck every approver's permission (1 request each) on any of these events |
| `installation.*`, `installation_repositories.*` | authority, not bindings | — | keep today's handling |

### 2.3 Invalidation algorithm

```
onDelivery(guid, event, action, payload):
  if guid ∈ seen (TTL 4 d): return DUPLICATE          # R8
  seen.add(guid, deliveredAt=now)
  touched = MAP[event,action](payload)                  # {prKey → set(bindingName)}
  for (prKey, names) in touched:
     pr = tracked[prKey]; if !pr: continue
     for b in names: pr.pending[b] = max(pr.pending[b], eventSeq(payload))
     pr.dirtyAt ||= now
  schedule(recheck, debounce = 2 s per PR)              # coalesce bursts (check_run storms)

recheck(pr):                                            # runs under the single-writer lock
  obsSeq = ++pr.observationSeq
  results = {}
  for b in pr.pending (ordered: rules, head, base, group/mergeref, check, run, reviews, perm, remoteRef):
     value = READ[b](pr)                                # targeted read, ETag-conditional where possible
     results[b] = { id: hash(value), value, obsSeq, deliveries: pr.pendingDeliveries[b] }
  changed = { b | results[b].id != pr.bindings[b].id }
  if changed = ∅:
     pr.bindings[*].recheckedAt = now; claims stay CURRENT, receipt.current += {rechecked: [...], asOf}
  else:
     staleClaims = dependents(changed)                  # from the table in 2.1
     if TARGET ∈ staleClaims: full re-proof (all claims depend on TARGET)
     else: re-observe only the bindings of staleClaims (twice, hash-equal), re-run prove() on the merged capture,
           issue a NEW receipt whose unchanged bindings cite the prior observation ids (Part 3)
  pr.pending = ∅ (except entries with eventSeq > obsSeq start, which stay pending)
```

Rules that make this sound:
* A binding is never *assumed* unchanged because an event was "noise"; the map only decides *what to re-read*, and reading is what confirms. If the map is wrong (a new GitHub action we did not anticipate), reconciliation (§2.7) is the backstop.
* Rechecks read bindings in dependency order; if `B.head` changed, the remaining pending reads are abandoned and a full re-proof is scheduled, so we never mix bindings from two heads in one receipt.
* The two-observation rule survives, but only over the bindings being re-observed. `TARGET` re-observation is always two full reads of `git`+`target` (`collect.js:175-333`) because that is where the merge-base races live.
* The existing `revisions[repo]` counter is deleted. Its replacement is per-binding `eventSeq` vs `obsSeq` (§2.5), which detects "event during collection" per PR and per binding.

### 2.4 Recheck cost and request budget

Per-binding cost (requests; **C** = ETag-conditional, i.e. 304 is free against the primary limit):

| Binding | Read | Cost |
|---|---|---|
| `B.rules` | `GET branches/{base}/protection` (C) + `GET rules/branches/{base}` (C); plus the GraphQL absence probe only on a 404 with `protected==true` | 2 (0 if unchanged) |
| `B.base` | `GET branches/{base}` (C) | 1 (0) |
| `B.head`, `B.remoteRef` | `GET pulls/{n}` (C) + `GET /repos/{headRepo}/git/ref/heads/{ref}` (C) | 2 (0) |
| `B.mergeref` | `GET pulls/{n}` (forces test-merge regeneration) + `GET git/ref/pull/{n}/merge` + `GET commits/{merge_sha}` | 3 (the merge ref cannot be trusted without a fresh pulls GET, per the Git DB guide) |
| `B.group` | GraphQL `mergeQueueEntry` (1 point) + `GET git/ref/heads/gh-readonly-queue/...` | 2 |
| `B.check[name]` | `GET commits/{sha}/check-runs?check_name={name}&filter=latest` (C) | 1 per required check (0) |
| `B.run[checkId]` | `GET actions/runs/{runId}/attempts/{n}/jobs` (C) | 1 per accepted run (0) |
| `B.reviews` | `GET pulls/{n}/reviews` (C, paginated) | 1–2 (0) |
| `B.perm[login]` | `GET collaborators/{login}/permission` (C) | 1 per approver (0) |
| Full proof (today) | two complete observations | ~38 minimum; 19 + reviewers + runs per observation |

Budget for an *active* repository — 30 tracked PRs, 3 required checks, 2 approvers each, 200 events/hour (a busy monorepo: pushes, check_run storms, reviews):

| Design | Requests/hour | Fits 5,000/h? |
|---|---|---|
| Today (each event stales all 30 PRs; queue serialises; effectively every PR re-proved once per event that lands while idle) | 200 × 30 × 38 = 228,000 demanded; throughput caps at 5,000/38 ≈ 131 proofs/h → receipts sit STALE almost permanently (Level 2's liveness failure) | No |
| Per-claim: assume 60 % of events touch no tracked binding (label, comment, unrelated ref pushes, own checks), 30 % touch one binding on 1–3 PRs, 10 % are base pushes touching all 30 PRs' `B.base` (+ `B.mergeref` where target was a test merge) | 0 + 60 × 2 × 1.5 + 20 × 30 × (1 + 3·0.3) ≈ 180 + 1,140 = 1,320 requests, of which ≥ 50 % are 304s (free) ⇒ **≈ 700 counted**, plus full re-proofs only on genuine head changes (say 20/h × 38 = 760) | Yes, ~1,500/h, leaving > 3,000/h for reconciliation and manual proofs |

Two further savings that need no design change: serialise requests (secondary limit) and make `Client` remember ETags per URL per installation (a `Map` in memory is enough; on restart the first read is a normal 200).

### 2.5 Per-PR state machine with sequence numbers

Sequence numbers, per tracked PR:
* `observationSeq` — incremented at the *start* of each observation; every binding recorded by that observation carries it.
* `eventSeq` — monotonic per PR, assigned on *arrival*; deliveries also carry GitHub's own timestamps (`pull_request.updated_at`, `check_run.completed_at`, `review.submitted_at`, `push` has none — use `head_commit.timestamp`), which are recorded but **never used for ordering decisions** because GitHub documents that arrival order is not event order and payload timestamps come from different clocks.
* `deliveries` — the set of GUIDs whose effects are covered by the current bindings (the "epoch").

Rule for a delivery whose payload timestamp predates the last observation: **recheck, do not ignore.** The timestamp tells you the event is old; it does not tell you that the observation saw its effect (REST reads are not linearisable with webhook emission). The recheck is cheap (§2.4) and usually returns 304/unchanged, which is then recorded as `rechecked` — the receipt shows "an old approval-dismissed event arrived at 12:03 and was confirmed already reflected". The only deliveries ignored outright are duplicates by GUID and events whose map row is `none`.

States (per PR subscription):

```
UNTRACKED ──pull_request.opened/reopened/ready_for_review, discovery──▶ TRACKED_UNPROVEN
TRACKED_UNPROVEN ──observation complete, prove()──▶ PROVEN(receipt r, claims CURRENT)
PROVEN ──delivery touches bindings──▶ RECHECK_PENDING(pending bindings, dirtyAt)
RECHECK_PENDING ──debounce elapsed, lock acquired──▶ RECHECKING(obsSeq)
RECHECKING ──all pending unchanged──▶ PROVEN (same receipt, current.rechecked += …)
RECHECKING ──some binding changed, TARGET unaffected──▶ REPROVING_PARTIAL(stale claims)
RECHECKING ──B.head/B.base/B.group changed──▶ REPROVING_FULL
RECHECKING ──read failed (403/5xx/timeout)──▶ UNAVAILABLE(reason, retryAt = backoff)
REPROVING_* ──new receipt r'──▶ PROVEN(r'); r marked SUPERSEDED_BY r'
REPROVING_* ──delivery with eventSeq > obsSeq arrives──▶ stays REPROVING, but result is marked; on completion goes straight to RECHECK_PENDING with only the late bindings (not STALE for the whole receipt)
any ──pull_request.closed(merged)──▶ LANDED (ledger row; bindings frozen; LANDED_BOUND evaluated once)
any ──pull_request.closed(unmerged)/converted_to_draft──▶ CLOSED (no more rechecks; receipt shows LIVE_PR_NOT_OPEN)
UNAVAILABLE ──retryAt elapsed──▶ RECHECKING (attempts++; after 5 attempts with exponential backoff 30 s→16 min stays UNAVAILABLE until reconciliation or next delivery)
UNAVAILABLE/CLOSED/LANDED ──installation removed──▶ UNTRACKED
```

Monotonicity invariants (checked by the test harness, Part 4): `observationSeq` strictly increases; a receipt's `current` never moves from STALE back to CURRENT without a new observation id; a superseded receipt is never re-published; `LANDED` is terminal for bindings.

The `EVENT_DURING_COLLECTION` rule (`service.js:193-198`) becomes per-binding: an observation that began at `obsSeq = k` is invalidated only by deliveries that touch a binding *it read* and arrived after that binding's read began. This is what turns the livelock into bounded convergence.

### 2.6 Liveness argument

Assume an event rate λ per PR (events touching that PR's bindings), recheck cost c seconds (serial reads, ≈ 0.3 s each, 1–4 reads ⇒ c ≤ 2 s), full re-proof cost F (≈ 40 reads ≈ 15–20 s), and the single-writer lock. A PR reaches a stable PROVEN state after an event burst as soon as a recheck completes with no newer touching delivery, i.e. when the inter-event gap exceeds c. With debounce d = 2 s and c ≈ 2 s, any PR whose touching-event rate is below one per ~4 s converges within one recheck; a PR under continuous push (rate > 1/4 s) is genuinely changing and *should* stay unproven — the receipt says `RE-PROOF PENDING: N events in the last minute`. Under the repository-wide design the condition was "no event of any kind in the whole repository for F × (tracked PRs) seconds", i.e. tens of minutes, which busy repositories never satisfy. Rate-limit backoff: on 403/429 honour `retry-after`/`x-ratelimit-reset` (documented), pause the whole drain, keep the pending sets — they are idempotent and coalesce.

### 2.7 Reconciliation plan

1. **Scheduled full re-observe.** Every tracked PR in PROVEN state gets one full two-observation proof every 6 hours (at 30 tracked PRs × 38 = 1,140 requests per 6 h ≈ 190/h). It is the backstop for map errors, undelivered > 25 MB payloads (R13) and the non-subscribed permission events until they are subscribed. Its result is recorded as an observation with `trigger: RECONCILE`, so a receipt that changed verdict on reconciliation is visibly different from one that changed on an event.
2. **Delivery scan.** Every 4 hours (retention is 3 days; a scan cadence of ≤ 24 h is the hard requirement, 4 h keeps the gap small): `GET /app/hook/deliveries?per_page=100` with the cursor, walking back to the last scanned `delivered_at`; for every item whose `guid ∉ seen` and `status_code` not 2xx (or missing entirely — which happens when our HTTPS endpoint was unreachable and GitHub recorded a failure), request `POST /app/hook/deliveries/{id}/attempts` — GitHub redelivers with the same GUID (documented), so the normal path handles it. Rate: one JWT-authenticated read per page; redelivery POSTs are mutating (5 secondary points each), cap at 50 per scan. Items with `guid ∈ seen` but `redelivery: true` are logged only.
3. **Boot reconciliation.** On start after a gap > 1 h: run the delivery scan first, then the full re-observe for every PR whose last observation predates the gap.
4. **What reconciliation must not do:** it must not flip a receipt to CURRENT silently. A reconciliation observation that differs from the stored bindings produces a new receipt and marks the old one SUPERSEDED with `reason: RECONCILED`, and the customer surface says "evidence changed while no event was received" — that sentence is the detector for missed deliveries and for GitHub behaviour changes (Part 4.5).

---

## Part 3 — Event sourcing: evaluation and the minimal change

| Criterion | (a) Mutable rows + STALE flags (today) | (b) Append-only observation ledger |
|---|---|---|
| Auditability | `row.current` is overwritten in place (`service.js:243-249, 328, 505-511`); the history of why a receipt went STALE is lost after the next event | Every observation is immutable and addressable; a receipt cites the observation ids per binding; currentness is a derived view |
| Race handling | Repository revision counter; cannot say *which* binding moved | Per-binding `obsSeq`/`eventSeq` fall out naturally |
| Reproducibility of a verdict | `receipt.evidence` embeds the full capture, so `prove(receipt.evidence)` is already replayable — good | Same, but a partial re-proof cites older observations for unchanged bindings; replay must resolve those ids |
| Debugging | "STALE: GITHUB_EVENT:check_run" with no delivery id | `deliveries` set on each observation; "unchanged on recheck" is recorded rather than lost |
| Storage | One JSON file rewritten with fsync on every `save()` (`factory/store.js:24-38`); receipts capped at 1,000 (`service.js:174`), ledger 5,000 rows (`ledger.js:14`), each receipt embeds its capture (tens of KB) ⇒ the file is already tens of MB at cap and every webhook triggers a full rewrite | Naively worse (every recheck appends); acceptable only with retention: keep observations referenced by a live receipt or a ledger row, prune others, cap at 3 observations per receipt |
| Migration cost | — | Small if receipts keep embedding evidence and only *add* observation ids; large if evidence moves out of receipts (breaks `receipt.schema.json`, CLI `--previous`, HTML rendering) |
| Over-engineering risk | — | High if a generic event store/CQRS projection layer is introduced for a single-process, single-file service |

**Recommendation: (b-minimal).** Keep the store, keep receipts self-contained, and make observations first-class and immutable:

1. `collect.js`: `collectOnce` returns, alongside the capture, `bindings: { name → { id, value, readAt, etag } }` computed by the same projection functions already used (`collectRules`, `identity`, the `git`/`target`/`remote`/`checks`/`execution`/`reviews` observers). Add `collectBindings(client, pr, names)` for targeted rechecks that reuses those observers individually. `collect()` records `observationId = hash({bindings, startedAt})` and `deliveries`.
2. `proof.js`: `prove()` unchanged in logic; the receipt gains `observation: { id, bindings: {name → id} }` and `supersedes: receiptId|null`. `freshness()` becomes `currentness(receipt, bindingsNow)` — compare binding ids, not `hash(receipt.evidence[k])` (`proof.js:343-345`), and exclude `githubMergeable/githubMergeState`.
3. `service.js`: replace `data.revisions` and the two broadcast loops (`service.js:501-511, 537-559`) with `data.observations` (immutable, id-keyed, pruned by reference), `data.tracked[prKey] = { state, bindings, pending, observationSeq, deliveries }`, the `MAP` of §2.2, and `recheck()` of §2.3. `data.events` becomes `data.seen = { guid → deliveredAt }` with TTL pruning instead of the 10,000 hard cap (`service.js:374`). `read()` keeps "saved CURRENT is never presented as live" (`service.js:339-347`) — it now shows `current.asOfObservation` and the recheck timestamp.
4. `ledger.js`: `proofSnapshot` adds `observationId` and the `LANDED_BOUND` result (three-way match, Part 5); rows stay immutable.
5. `store.js`: no schema change; add `saveSoon()` (coalesce saves within 250 ms) because rechecks would otherwise multiply fsyncs — the atomic-rename path is kept.

Effort: 3–5 days including tests, plus a one-time migration that stamps existing receipts with `observation.id = hash(receipt.evidence)` so replay works for old rows.

---

## Part 4 — Model-based and differential testing

### 4.1 Reference model and oracle

The reference model *is* the binding model: a ~300-line pure module `github/test/model/world.js` holding a simulated repository (refs, commits with parents and trees as opaque ids, PRs, reviews, check runs, workflow runs, rulesets at repo and org level, queue entries, collaborators/teams, installation permissions) and a function `expected(world, prKey) → { verdict, claims: {name → CURRENT|STALE|UNAVAILABLE}, ledgerRow? }`. Because `prove()` is already pure over a capture, the oracle can call the *real* `prove()` on a capture rendered from the world and compare verdicts; what the model adds is the expected *currentness* after each action and the expected ledger row.

### 4.2 Generator

Actions (all from the brief): `PR_OPEN, COMMIT_PUSH, FORCE_PUSH, BASE_ADVANCE, WORKFLOW_CHANGE, POLICY_CHANGE(repo|org), REVIEW, REVIEW_DISMISS, CI_START, CI_SUCCESS, CI_FAIL, CI_RERUN, CI_WRONG_EVENT, CI_SAME_NAME_OTHER_WORKFLOW, QUEUE_ENTER, QUEUE_REBUILD, QUEUE_EXIT, BYPASS, MERGE(merge|squash|rebase), DIRECT_PUSH, POST_MERGE_PUSH, WEBHOOK_DELAY, WEBHOOK_DUPLICATE, WEBHOOK_REORDER, API_TRANSIENT_ERROR, PERMISSION_LOSS`. The generator is a seeded PRNG (xorshift128+, 40 lines) producing sequences of 5–60 actions with preconditions (no `REVIEW` before `PR_OPEN`), weighted toward the race pairs of §1.2 (R1 = `REVIEW` then `COMMIT_PUSH` with `WEBHOOK_REORDER`; R5 = `MERGE` with `WEBHOOK_DELAY` on `pull_request.closed`). Each world action emits the webhook deliveries GitHub would emit (from the OpenAPI `x-webhooks` shapes) into a delivery channel that the fault actions permute, duplicate or delay.

### 4.3 Harness

`github/test/model/harness.js` wires the real `ProofService` with `clientFactory` → a `fetchImpl` that answers REST/GraphQL routes **from the current world**, including ETag/304 behaviour, `mergeable: null` for one read after a base advance (R12), `API_TRANSIENT_ERROR` as 502/403-secondary with `retry-after`, and `PERMISSION_LOSS` as 403 on `/collaborators/{u}/permission`. The service's `webhook()` and `drain()` are driven deterministically (no timers: `drain()` is called until the queue is idle). This is the same shape as the existing `service.test.js` fixtures (`fetchImpl`, line 178) so it needs no new seams in production code. A run records the action sequence, the deliveries actually presented, every receipt and ledger row.

### 4.4 Invariants (checked after every action and at quiescence)

1. **Subject binding** — every receipt's `identity.headSha/baseSha/target.sha` equal the world's values at its `observation.readAt`; never a mix of two heads.
2. **Currentness locality** — a receipt goes STALE only if a binding it cites changed; an action that touched no cited binding leaves it CURRENT (this is the anti-broadcast property, failing today by construction).
3. **No inferred success** — `CI_EXECUTED[name]` is PROVEN only if the world has a completed-success run on the exact target sha under the required name and, in the world, `CI_WRONG_EVENT`/`CI_SAME_NAME_OTHER_WORKFLOW` runs never satisfy it.
4. **Authorization scope** — after `PERMISSION_LOSS` for an approver, no CURRENT receipt still counts that approval (requires the §2.2 subscriptions; fails today).
5. **Producer integrity** — the App's own check run never appears in `checks` evidence.
6. **Event integrity** — duplicate GUIDs are no-ops; reordered deliveries yield the same quiescent state as ordered ones (commutativity of rechecks).
7. **Landing equality** — on `MERGE`, the ledger row's `LANDED_BOUND` is `BOUND` iff the world's landed tree equals the receipt target's tree (squash/rebase change shas, not trees).
8. **Monotonic history** — `observationSeq` strictly increases per PR; a superseded receipt is never later marked CURRENT; ledger rows never change.
9. **Receipt integrity** — `prove(observationsById(receipt))` reproduces `receipt.verdict` and `fingerprint`.
10. **Liveness** — at quiescence (no pending deliveries, no world change for one recheck cycle) every tracked open PR is PROVEN or UNAVAILABLE-with-reason, never RECHECK_PENDING; and the number of GitHub requests issued is ≤ the §2.4 bound for the sequence.

### 4.5 Frameworks, honestly

| Option | Fit | Cost |
|---|---|---|
| fast-check 4.x | Best-in-class shrinking, `fc.commands` model-based API maps directly onto actions/invariants | Adds a dev dependency (`pure-rand` transitively); the published CLI stays zero-dependency because devDependencies are not shipped — acceptable, but the repository's stated posture is "zero dependencies" and the test tree currently uses only `node:test` |
| Hand-rolled generator + seeded PRNG + delta-debugging shrinker | Fits the codebase; ~150 lines; shrinking by removing actions/fault injections until the failure disappears is adequate because sequences are short | Weaker shrinking on parameters; must be maintained |
| Quint (Informal Systems) / Apalache / TLA+ | Model-checks the *reference model* (§2.5 state machine + §2.3 rechecks) for invariants 2, 6, 8, 10 over all interleavings, which random testing cannot exhaust; catches design errors before code | ~1–2 weeks to write the spec; no coverage of the JS code; two artefacts to keep in sync. Quint's syntax is closer to JS and its simulator can emit traces that the harness replays |
| Alloy | Good for structural invariants (binding graph well-formedness), poor for the delivery/recheck temporal behaviour | Rejected |

**Recommendation:** hand-rolled generator and harness under `node:test` now (no dependency; ~2 weeks including the world model and the fetch simulator), with fast-check as an explicit, documented option if shrinking proves inadequate. Add a Quint spec of §2.5 as a second phase (~1 week) once the JS model is stable; use its trace output as additional seeds for the harness. Total: ~3–4 engineer-weeks for phase 1 + 2.

### 4.6 Differential lab against real GitHub

* **What to create:** one organisation (`merge-proof-lab`), a development App installed on it, and repositories: `classic` (branch protection, strict on/off), `ruleset-repo` (repository ruleset), `ruleset-org` (org-level ruleset with no repo-level rules), `queue-headgreen`, `queue-allgreen`, `forks` (PR from a fork, fork-owned head), `monorepo` (path-filtered workflows, > 20 runs per sha), `bypass` (bypass actor configured). Scripted scenarios run from a runner with `gh` and the REST API: each scenario is one action sequence from §4.2 executed for real.
* **What to observe and store as fixtures:** every delivery (`GET /app/hook/deliveries` gives event/action/guid/status even when our endpoint was down), the `merge_group` payloads and `mergeQueueEntry` states, landed commit parents and trees per merge method (compared with `git merge-tree --write-tree`, git ≥ 2.45, from Level 2 B), `GET /repos/{o}/{r}/rulesets/rule-suites` after each merge (GitHub's own record of which rules evaluated and whether a bypass was used), rate-limit headers, ETag behaviour, and the observed `mergeable: null` durations.
* **How to compare:** the recorded deliveries and REST bodies become a fixture pack replayed through the §4.3 harness; the model's expected outcome is compared with the real outcome (verdict, currentness, ledger `LANDED_BOUND`, rule-suite result). A difference is either a model bug or a GitHub behaviour change; the rule-suite comparison is the independent channel (Part 5).
* **Cadence and cost:** weekly, plus on every entry in the GitHub changelog mentioning rulesets, merge queue, checks or webhooks. Cost: Actions minutes for the lab workflows and < 500 API requests per run; the content-creation secondary limit (80/min, 500/h) bounds how fast scenarios can create PRs/reviews, so a full run takes ~1 h.
* **Never:** production repositories, customer installations, the production App, or any write to a repository the lab does not own; lab tokens never enter the production store.
* **Conformance suite and drift detection:** yes — the fixture pack is versioned by GitHub API version (`X-GitHub-Api-Version: 2022-11-28`) and payload-shape hash. Silent GitHub changes show up as (i) fixture-pack diffs on the weekly run, (ii) the production metric "receipt superseded on reconciliation with no touching delivery" rising above its baseline, and (iii) rule-suite results disagreeing with Merge-Proof's verdict. Each is alertable without contacting customer repositories.

---

## Part 5 — Adjacent-field concepts that change a decision

| Field | Concept | Adopt / reject | Decision it changes |
|---|---|---|---|
| Certificate transparency | Append-only log, inclusion proofs | **Adopt (minimal):** receipts for one PR form a hash chain (`supersedes`, `observation.id`), receipt id becomes content-derived | Part 3 §2 field set; makes "which receipt was current when the check was published" tamper-evident without a signing key. Gossip/SCTs rejected — no second log to gossip with |
| Reproducible builds | buildinfo / bit-for-bit | **Adopt:** a `verdict-info` block (tool version, `rules.js`/`proof.js` content hashes, observation ids) and `merge-proof replay <receipt>` that recomputes the verdict | Invariant 9 becomes a shipped command, not only a test; prevents "the verdict changed because the code changed" being confused with "because GitHub changed" |
| Database transactions | Write skew under snapshot isolation | **Adopt:** bindings that participate in one predicate (`head`, `base`, `mergeref`/`group`) must be read in one observation, twice, never patched individually | §2.3 rule "TARGET re-observation is always full"; read `pulls/{n}` before `git/ref/pull/{n}/merge` (read-your-writes on the test merge, per the Git DB guide) |
| Consensus / linearizability | No atomic snapshot ⇒ "current" is a bound on staleness, not a guarantee | **Adopt as wording:** `current.asOfObservation` + "no contradicting observation since"; keep `currentnessAtMerge: UNAVAILABLE` | Rejects any design that claims merge-time currentness from webhooks alone |
| Event sourcing / CQRS | Immutable facts, derived views | **Adopt partially** (Part 3); reject a generic projection framework | Store layout |
| Financial audit | Three-way match | **Adopt:** expected (receipt TARGET tree) · candidate (published check on sha) · landed (merge commit tree, from `git merge-tree` or the commit's tree id) | `LANDED_BOUND` compares **trees**, so squash and rebase merges can bind; ledger row states which leg failed |
| Safety-critical | Independent verification channels | **Adopt:** reconciliation (REST polling) and rule-suites are channels independent of webhooks; **reject** N-version recomputation as over-engineering | §2.7 and §4.6 justified as independence, not redundancy |
| Package managers / TUF | Lockfile of content hashes; key rotation | **Adopt:** the binding-id set is the receipt's lockfile (`B.rules` already hashes the policy snapshot); **reject** TUF roles/rotation until receipts are signed (Level 2 F) | Naming: `observation.bindings` is presented to customers as "what this receipt locked" |
| Release engineering | bors "not rocket science rule": main only ever contains a tested tree | **Adopt as the customer sentence for queue repos:** `LANDED_BOUND` + `MERGE_GROUP` target = the tested tree landed; for non-queue, non-strict repos the receipt must say the landed tree may differ from the tested one | Existing `BASE_DRIFT_UNVERIFIED` wording stays; queue repos get a stronger, distinct sentence |

---

## Sources

| Source | URL | Fetched | Status | Confidence |
|---|---|---|---|---|
| Best practices for using webhooks (10 s, X-GitHub-Delivery reuse on redelivery, redeliver missed) | https://raw.githubusercontent.com/github/docs/main/content/webhooks/using-webhooks/best-practices-for-using-webhooks.md | 2026-09-19 | fetched | high |
| Troubleshooting webhooks §"deliveries are out of order" | https://raw.githubusercontent.com/github/docs/main/content/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks.md | 2026-09-19 | fetched | high |
| Redelivering webhooks (no automatic redelivery; retention variable) | https://raw.githubusercontent.com/github/docs/main/content/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks.md | 2026-09-19 | fetched | high |
| Webhook retention variable (3 days fpt/ghec, 7 GHES) | https://raw.githubusercontent.com/github/docs/main/data/variables/webhooks.yml | 2026-09-19 | fetched | high |
| Payload cap 25 MB | https://raw.githubusercontent.com/github/docs/main/data/reusables/webhooks/payload_cap.md | 2026-09-19 | fetched | high |
| Webhook events and payloads (delivery headers) | L2 copy `scratchpad/l2/docs-webhooks.md` of content/webhooks/webhook-events-and-payloads.md | 2026-09-19 (L2) | fetched | high |
| REST OpenAPI fpt 2022-11-28 (`x-webhooks` actions and required fields; pulls `mergeable` text; check-runs 1,000-suite limit; rules/branches; hook deliveries) | L2 copy `scratchpad/l2/rest-fpt.json` (github/rest-api-description) | 2026-09-19 (L2) | fetched | high |
| Git database guide §Checking mergeability | https://raw.githubusercontent.com/github/docs/main/content/rest/guides/using-the-rest-api-to-interact-with-your-git-database.md | 2026-09-19 | fetched | high |
| Rate limits for the REST API + installation reusable | https://raw.githubusercontent.com/github/docs/main/content/rest/using-the-rest-api/rate-limits-for-the-rest-api.md ; data/reusables/rest-api/primary-rate-limit-github-app-installations.md | 2026-09-19 | fetched | high |
| Secondary rate limits reusable | https://raw.githubusercontent.com/github/docs/main/data/reusables/rest-api/secondary-rate-limit-rest-graphql.md | 2026-09-19 | fetched | high |
| Best practices for the REST API (conditional requests, serial requests) | https://raw.githubusercontent.com/github/docs/main/content/rest/using-the-rest-api/best-practices-for-using-the-rest-api.md | 2026-09-19 | fetched | high |
| GraphQL rate and query limits | https://raw.githubusercontent.com/github/docs/main/content/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api.md | 2026-09-19 | fetched | high |
| Merge queue docs (merge_group, gh-readonly-queue) | L2 copy `scratchpad/l2/docs-mq.md` | 2026-09-19 (L2) | fetched | high |
| fast-check package.json (v4.10.1, dependency `pure-rand`) | https://raw.githubusercontent.com/dubzzz/fast-check/main/packages/fast-check/package.json | 2026-09-19 | fetched | high |
| Quint (Informal Systems) | https://github.com/informalsystems/quint | 2026-09-19 | README fetch returned only a title; capabilities from prior knowledge | medium |
| Check-run/REST read latency after webhook; GraphQL–REST consistency | — | — | inference (no documented bound) | low |
| Level 2 request count (38 per proof) | `scratchpad/l2/C-false-green.md` G4 | 2026-09-19 | fetched | high |
| Merge-Proof code anchors | `./github/{service,collect,proof,ledger,client}.js`, `factory/store.js` | 2026-09-19 | read | high |
