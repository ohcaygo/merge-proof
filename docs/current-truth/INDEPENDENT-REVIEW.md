# Merge-Proof — Independent review procedure

**Authority:** Canonical Merge-Proof procedure for independently reviewing a pinned engineering candidate.
**Procedure version:** 1
**Source main commit:** `de457622d13c2aec03b4cef13328b83072de8aa3`
**Scope:** Candidate review only. This procedure does not authorize integration, deployment, production changes, policy changes, infrastructure changes, credential access, billing changes, or owner acceptance.

## 1. Purpose and independence

Independent review answers one bounded question: does direct reviewer evidence support integrating the exact pinned candidate under the stated acceptance authority?

The reviewer must be separate from the implementation context, must not modify the candidate, and must treat the candidate, repository, GitHub, provider, infrastructure, and production surfaces as read-only. The reviewer reports findings and a verdict; the implementer repairs findings in a separate change. Historical review records are evidence about their exact candidates, not reusable approval or procedure authority.

Do not substitute a reviewer procedure from another product. In particular, the OHCAYGO reviewer procedure is not Merge-Proof authority.

## 2. Pin the review subject

Before reading the change, record:

- repository and verified remote URL;
- default branch and freshly fetched base commit;
- full candidate commit SHA and candidate tree SHA;
- branch or pull request, if one exists, while treating the commit as authoritative;
- merge base and exact reviewed diff range;
- clean or dirty checkout state, including untracked files;
- whether the candidate commit is durably available from the stated remote; and
- requested acceptance criteria, lifecycle state, and the authority that permits review.

Stop with `NOT_PROVEN` if the candidate cannot be resolved exactly or the working tree would make the reviewed content ambiguous. Never review a moving branch name as if it were an immutable candidate.

## 3. Establish current repository and lifecycle truth

Fetch before making current-state claims. Read the current product truth, status, task or lifecycle record, proof and replay contracts, release packet, and any path-specific instructions relevant to the diff. Inspect live GitHub branch, pull request, checks, workflow, status, ruleset, approval, and merge-queue state when the acceptance criteria depend on them.

Distinguish `implemented`, `tested`, `reviewed`, `merged`, `deployed`, and `accepted`. One state never implies the next. Record base or policy drift observed during review and re-check it before issuing the verdict.

## 4. Review passes

Review the complete diff and its affected behavior. Run the smallest complete verification that can support the requested acceptance criteria; do not replace an end-to-end gate with an isolated passing test.

Unless the candidate's documented scope proves a suite irrelevant, the normal Merge-Proof software baseline is:

```sh
npm test
npm run test:github
npm run test:factory
```

Also inspect and exercise, when touched or claimed:

- deterministic proof and verdict behavior, including negative, replay, and tamper cases;
- frozen-verifier integrity and compatibility boundaries;
- evidence binding to repository, pull request, commit, tree, authority, and policy;
- currentness dependencies and immutable receipts;
- expected-tree, provider-candidate, merge-event, and landed-tree reconstruction;
- signatures, trust roots, provenance, retention, and portable verification;
- GitHub checks, statuses, workflows, approvals, rulesets, branch protection, and merge queue;
- browser/public receipt rendering and HTML/PDF evidence paths;
- authentication, authorization, tenant isolation, billing, security, or data handling;
- AWS, KMS, JWKS, anchoring, storage, recovery, backup, release, and deployment preflight; and
- documentation or claims that could overstate lifecycle, provider, customer, or production truth.

Do not exercise production mutations, administrative writes, deployments, billing, credential changes, ruleset changes, or infrastructure changes unless a separately authorized task explicitly requires them. Missing required live evidence remains `NOT_PROVEN`.

## 5. Evidence and proof semantics

Label material evidence:

- `[ran]` — the reviewer executed the exact command or interaction and retained its result;
- `[observed]` — the reviewer directly inspected immutable or live state;
- `[claimed]` — supplied by another actor or document and not independently reproduced; and
- `[not run]` — omitted, unavailable, unsafe, or outside authority, with the reason stated.

Only `[ran]` and `[observed]` evidence may establish the review verdict. `[claimed]` evidence can route investigation but cannot close a gate.

Preserve the product verdict meanings: `VERIFIED` requires sufficient current positive evidence; `NOT_PROVEN` covers missing, unavailable, ambiguous, unsupported, or insufficient evidence; `FAIL` requires a demonstrated unmet condition; and `STALE` means a relevant dependency changed after evidence was valid. Never turn absence or ambiguity into green.

Currentness must be evaluated separately at three boundaries: currentness at the original proof observation, currentness held when the merge event arrived, and currentness at the merge decision. Evidence for one boundary does not prove another.

## 6. Findings and reviewer verdict

Each finding must include priority, exact evidence, affected file or behavior, reproduction when applicable, consequence, and the condition required to close it:

- `P0` — unsafe or integrity-breaking; blocks integration;
- `P1` — required behavior or acceptance criterion is wrong or unproven; blocks integration;
- `P2` — material defect with bounded impact; blocks only when required by the candidate's acceptance contract; and
- `P3` — non-blocking improvement.

Use exactly one reviewer verdict:

- `APPROVE_FOR_INTEGRATION` — the exact pinned candidate satisfies the stated review contract with sufficient direct evidence and no blocking finding;
- `NEEDS_FIXES` — a demonstrated defect or blocking acceptance failure requires a new candidate; or
- `NOT_PROVEN` — required review evidence could not be obtained or the review subject/current state is ambiguous.

Approval is for integration consideration only. It is not merge authority, `LANDED_VERIFIED`, deployment approval, production readiness, owner acceptance, or commercial acceptance. There is no “approved with missing required evidence.”

## 7. Required review record

Write an append-only review record, normally at `github/validation/<task>/independent-review-<short-sha>.md`, containing:

1. reviewer identity or isolated review context, time, and relevant tool versions;
2. repository, remote, default branch, fetched base, merge base, candidate commit and tree, diff range, and checkout state;
3. lifecycle state, requested acceptance criteria, authority, and explicit exclusions;
4. changed surface and risk assessment;
5. an evidence table with `[ran]`, `[observed]`, `[claimed]`, and `[not run]` classifications;
6. proof, currentness, tree/landed-truth, provenance, policy, and lifecycle assessments as applicable;
7. findings ordered by priority;
8. remote, base, policy, or candidate drift checked at verdict time;
9. the exact reviewer verdict and its evidence boundary; and
10. remaining integration, live-environment, release, owner, or acceptance gates.

Do not overwrite an earlier review record or silently broaden its scope.

## 8. Repairs, drift, and recheck

Any candidate commit or tree change invalidates approval for the old candidate. A repaired candidate is new and must be pinned explicitly. A focused independent recheck may reuse unaffected evidence only when the original review record remains available, the repair diff is bounded, relevant conditions have not changed, and the recheck identifies exactly what was reused and rerun. Repeat broader review only for a concrete broader risk or an explicit gate.

If the base branch, required policy, approval, provider observation, trust root, or other relevant dependency changes, classify the affected evidence as `STALE` or `NOT_PROVEN` and reconcile it before approval. Do not transfer approval by ancestry or by similar content alone.

## 9. Integration and landed truth

Integration is a later lifecycle action under separate authority. Before integration, re-resolve the reviewed candidate, verify its tree is unchanged, re-check required approvals/checks/policy/currentness, and record the exact integration input.

After integration, establish landed truth independently: resolve the actual landed commit and tree from the provider, reconstruct the expected landed tree from the reviewed candidate and integration method, and compare them. Matching evidence may support `LANDED_VERIFIED`; a demonstrated tree mismatch is `LANDED_MISMATCH`/`FAIL`; missing or ambiguous provider, event, commit, or tree evidence is `NOT_PROVEN`. Candidate review alone never proves what landed.

Retain review, proof, replay, signature, provenance, currentness, merge-event, and landed-tree evidence according to the existing records and release contracts. Never rewrite historical evidence to fit a later state.

## 10. Secret and authority boundary

Report mechanisms and non-secret locations only. Do not expose GitHub tokens, AWS credentials, KMS or signing material, Stripe credentials, authentication files, tenant data, or other secrets. A reviewer may verify that a capability and safe read path exist without exercising an unauthorized mutation.
