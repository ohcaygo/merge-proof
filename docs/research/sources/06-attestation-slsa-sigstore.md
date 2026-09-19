# 06 — Attestation standards (SLSA / in-toto / Sigstore / GitHub) and what they mean for the Merge-Proof receipt

Research date: 2026-09-19. Method: primary sources read directly from the SLSA spec repo (`spec/` on `main`, which is the v1.2 text), the in-toto attestation repo, `slsa-framework/source-tool` design docs, gittuf docs and releases, Sigstore Fulcio/rekor-tiles repos, and the `github/docs` source repo. Several vendor and blog domains (slsa.dev, docs.github.com, docs.sigstore.dev, github.blog, kosli.com, chainloop.dev, openssf.org) were blocked by the egress proxy in this session; where a claim rests on a search-engine snippet rather than a read page it is marked **[snippet]**. The web-search budget also ran out mid-task, so a few items (Kyverno/Argo/Flux verification specifics, Kosli pricing detail) rely on prior knowledge and are flagged.

## 0. One-paragraph answer

The closest formal standard to Merge-Proof's job is the **SLSA v1.2 Source Track** (approved late 2025 **[snippet]**; the spec text on `main` is labelled "Version 1.2" and adds the Source Track, Verified Properties, and a revised threat model). It defines exactly two artifacts: a **Source Verification Summary Attestation (Source VSA)** — an in-toto Statement whose subject is a `gitCommit` digest, predicate type `https://slsa.dev/verification_summary/v1`, `verifiedLevels: ["SLSA_SOURCE_LEVEL_N", "ORG_SOURCE_..."]` — and **source provenance attestations**, which SLSA deliberately leaves *undefined* and implementation-specific. A Merge-Proof receipt is, almost field for field, a source provenance attestation for a single branch update, and its VERIFIED/NOT_PROVEN/FAIL verdict is a VSA-shaped verification result. Nobody at GitHub ships this natively today: GitHub's Artifact Attestations attest *build* provenance for files/OCI images, not commits or merges; the only implementations are the SLSA `source-tool` proof-of-concept (a reusable Actions workflow that writes VSAs into git notes) and the OpenSSF **gittuf** GitHub App (writes PR-approval attestations into `refs/gittuf/attestations`). The **smallest hardening step with real trust value** is: wrap the existing receipt JSON in an in-toto Statement (subject = merge commit + head/base SHAs), sign it as a DSSE envelope with a Merge-Proof service key (later: Sigstore keyless if/when a suitable identity exists), and publish the DSSE digest to an append-only log (Rekor v2 accepts self-managed-key `hashedrekord` entries). That adds integrity and non-repudiation of *what the App observed*; it does not — and should not claim to — add independence from GitHub. Everything past that (source-level VSAs for consumers, policy engines, evidence vaults, deployment gating, SBOM/VEX) is a different product.

---

## 1. SLSA v1.x: Build track and the Source Track

### 1.1 Status and versions
- SLSA v1.0 (2023) and v1.1 (2024/2025) define the Build track only (Build L0–L3).
- SLSA **v1.2** adds the **Source Track (L1–L4)**, **Verified Properties**, and an updated threat model. The working-draft page on `main` says "This is Version 1.2 of the SLSA specification, which defines the SLSA Build and Source tracks", and `spec/whats-new.md` lists the Source Track as the headline change. Third-party write-ups state v1.2 was approved in November 2025 with the Source Track graduating from experimental to approved **[snippet]**. The published spec lives at `https://slsa.dev/spec/v1.2/source-requirements` (blocked here, but present in search results).
- Additional draft tracks exist on `main` (Build Environment, Dependency) — not relevant.

### 1.2 Source Track levels (from `spec/source-requirements.md`)
| Level | Summary | Key requirements |
|---|---|---|
| Source L1 | Version controlled | Repos uniquely identifiable; revisions immutable and uniquely identified; human-readable diffs; SCS **MUST** issue a Source VSA for any revision at L1+. |
| Source L2 | History & Provenance | Access controls via SCS identity management; **History**: all changes to named refs recorded (when, who, new revision ID) and branches only move to descendants (no force-push); **Continuity** tracked per technical control from a start revision; tags protected from move/delete; **Source Provenance MUST be created contemporaneously with the branch update**; safe expunging process documented. |
| Source L3 | Continuous technical controls | Org **MUST** provide evidence of continuous enforcement for every claim in provenance/VSAs and document what each control means; SCS records technical controls on protected refs in contemporaneous attestations; org-specified properties allowed in the VSA, prefixed `ORG_SOURCE_`. |
| Source L4 | Two-party review | Two trusted persons agree to every change on protected branches; **final revision approved** (later pushes must be re-reviewed); context-specific approvals; informed review (clear diff); trusted-robot exceptions allowed. |

The onboarding rule matters: "organizations are making claims about how the branch is managed from that revision forward... No claims are made for prior revisions." Continuity is per-control, dated, and resets on any lapse.

### 1.3 The two attestation kinds
1. **Source VSA** — the interoperable artifact. Uses the standard VSA predicate (`https://slsa.dev/verification_summary/v1`):
   - `subject.digest` MUST include the revision ID (`gitCommit`), MAY add `gitTree` etc.; `subject.uri` SHOULD be a human URL (the commit page); `subject.annotations.sourceRefs` SHOULD list fully-qualified refs pointing at the revision (`refs/heads/main`).
   - `resourceUri` = repo URI (`git+https://github.com/foo/hello-world`), `verifier.id`, `timeVerified`, `policy.uri/digest`, `inputAttestations[]`, `verificationResult: PASSED|FAILED`, `verifiedLevels` containing exactly one `SLSA_SOURCE_LEVEL_{0..4}` plus optional `ORG_SOURCE_*` / `ORG_SOURCE_INTERNAL_*` properties.
   - v1.2 also adds cross-track **Verified Properties**, notably `SLSA_SOURCE_TWO_PARTY_REVIEWED`, which "MAY be added at any source level in which an SCS can make this claim."
   - Suggested issuance cadence in the spec: "Issue a new VSA for each merged Pull Request and add the destination branch to `sourceRefs`" — i.e., literally Merge-Proof's trigger.
2. **Source provenance attestations** — "SLSA leaves source provenance attestations undefined and up to the SCSs." Examples the spec lists: a TBD attestation describing parents and actors, a **"code review" attestation**, an "authentication" attestation, plus test-result / vuln / SPDX / SCAI predicates. The SCS MUST document the format and how each provenance feeds the VSA. The VSA issuer "MUST understand which entity should issue each provenance attestation type."

### 1.4 Who consumes it (from `spec/verifying-source.md`)
Consumers configure a root of trust mapping `(signer identity, verifier.id) -> max trusted source level`, including a Sigstore-style entry (`subjectAlternativeNamePattern` for a reusable workflow). They check `verifier.id`, `subject.digest`, `verificationResult`, `resourceUri`, `sourceRefs`, `verifiedLevels` against expectations (trust-on-first-use or producer-defined), and optionally inspect the source provenance directly. Verification points: build system at source fetch, package ecosystem at upload, consumer at download, or a continuous monitor. `slsa-verifier` v2.7.x has a `verify-vsa` command (DSSE envelopes only, not Sigstore bundles yet).

### 1.5 Existing implementations
- **`slsa-framework/source-tool`** (formerly `slsa-source-poc`; status "in development", ~300 commits, 31 open issues). Design: a reusable GitHub Actions workflow runs on push to a protected branch, reads GitHub rulesets via API, computes the level, and writes two signed attestations into **git notes** on the commit (one DSSE per line = in-toto bundle): a VSA and a bespoke **source provenance** with `predicateType: https://github.com/slsa-framework/slsa-source-poc/source-provenance/v1-draft` containing `activity_type` (e.g. `pr_merge`), `actor`, `branch`, `controls[{name, since}]` (`CONTINUITY_ENFORCED`, `REVIEW_ENFORCED`, `TAG_HYGIENE`, `GH_REQUIRED_CHECK_<name>`, `PROVENANCE_AVAILABLE`), `created_on`, `prev_commit`, `repo_uri`. Continuity is computed recursively from the prior commit's provenance. Policies live in a public repo (`slsa-framework/source-policies`) "outside of user control" so backsliding is detectable. The signing identity is the reusable workflow (Sigstore keyless via Actions OIDC). Declared trust assumptions: the reusable workflow only runs for fresh pushes; **"trust in GitHub APIs to return trustworthy information"**; the ruleset bypass list is restrictive. Declared limitations: any ruleset edit resets "since" timestamps; only Actions-based checks are reported; no Byzantine resilience against GitHub itself.
- **gittuf GitHub App** (OpenSSF-hosted public instance) records `https://gittuf.dev/github-pull-request-approval/v0.1` attestations (subject `gitTree`, `targetRef`, `fromID`, `targetID`, `approvers[]` with immutable numeric GitHub IDs) into `refs/gittuf/attestations`, explicitly positioned as usable "to meet the upcoming SLSA source track."
- **GitHub native**: nothing. `actions/attest` / `attest-build-provenance` READMEs contain no VSA, `sourceLevels`, or source-track functionality; the claim in one blog that GitHub's action "emits VSAs with a `sourceLevels` field when required reviews are configured" **[snippet]** could not be confirmed in the action's README and should be treated as unverified. GitHub's Jan 2026 changelog on "code-to-cloud traceability and SLSA Build Level 3" **[snippet]** is about artifact views and build provenance, not commit-level attestations.
- Open in-toto issues #47 (predicate for SCS security settings, 2021), #77 (human-review predicate, 2021), #124 (source attestation, 2023) are all still open: there is **no vetted "code review" or "source" predicate** yet.

### 1.6 Relevance to Merge-Proof
Mapping the receipt onto the spec is nearly mechanical:
- Identity block (repo id, PR, head/base/merge SHAs) → Statement `subject` (`gitCommit` = merge/landed commit; head and test-merge SHAs as additional subjects or predicate fields), `resourceUri`, `sourceRefs`.
- Required checks vs actual runs/jobs/steps → `GH_REQUIRED_CHECK_*`-style controls and Source L3 "continuous technical controls" evidence.
- Approvals on current head → L4 "final revision approved", i.e. `SLSA_SOURCE_TWO_PARTY_REVIEWED` when ≥2 trusted persons (note: SLSA L4 needs two *persons*, uploader+reviewer counts).
- Rulesets + classic protection snapshot → the "technical controls enforced on Named References" record; `CONTINUITY_ENFORCED`-type facts (deletion + non-fast-forward rules).
- Remote ref durability at observation → History/Continuity evidence.
- Actors human/app/bot → Trusted person / Trusted robot roles.
- Gaps / notChecked / limitations → exactly the "SCS MUST document the meaning of controls" and "it is possible that an SCS can make no claims" language.
- VERIFIED / NOT_PROVEN / FAIL → `verificationResult` PASSED/FAILED plus `verifiedLevels` (NOT_PROVEN maps naturally to `FAILED` with an explanatory `ORG_SOURCE_INTERNAL_*` property, or simply to no VSA; the spec has no tri-state).

What Merge-Proof does that the spec does not: a *per-merge* receipt focused on the exact candidate (test-merge SHA, merge-group SHA), execution-level detail (job/step), and a separate **currentness** signal. What the spec has that Merge-Proof does not: **continuity over history** (a per-commit chain of "controls active since X") and a consumer-facing level claim. Continuity is the one Source-Track concept worth borrowing: a receipt that says "the ruleset requiring review has been continuously enforced since <date>/<commit>" is materially stronger than a point-in-time snapshot, and it is derivable from the sequence of Merge-Proof's own receipts plus ruleset audit history.

---

## 2. in-toto attestation framework

- Layers: **Envelope** (DSSE v1.0 recommended; `payloadType` `application/vnd.in-toto+json`; multiple signatures allowed; Sigstore Bundle is not ITE-5 compliant because it holds a single signature), **Statement** (`_type: https://in-toto.io/Statement/v1`, `subject[{name, digest{alg: hex}}]`, `predicateType`, `predicate`), **Predicate**, and **Bundle** (JSON Lines of envelopes, `.intoto.jsonl`, not authenticated as a whole).
- Subjects are matched purely by digest; non-cryptographic immutable digests such as `gitCommit` are explicitly supported (digest_set.md).
- Vetted predicates (spec/predicates/README.md, Sept 2026): CycloneDX, Link, Reference, Release, Runtime Traces, **SCAI** (`https://in-toto.io/attestation/scai/v0.3`: `attributes[{attribute, evidence, conditions, target}]`, `producer`), **SLSA Provenance**, **SLSA VSA** (`https://slsa.dev/verification_summary/v1`), SPDX2/3, **Simple Verification Result / SVR** (`https://in-toto.io/attestation/svr/v0.2`: `verifier.id`, `verifier.policies[]`, `timeCreated`, `properties[]` — the outcome of issue #277, closed Jan 2026), **Test Result**, VULNS.
- No vetted "code review", "merge", "source" or "change management" predicate. Related proposals (#47, #77, #124, #297) are open and stale.

**Which predicate should a merge-evidence receipt use?** Two-tier answer:
1. **The verdict** → **VSA** (if you want to speak SLSA-source language: `verifiedLevels` with `SLSA_SOURCE_LEVEL_x` is a claim the *SCS* is supposed to make; a third-party App should instead use `ORG_SOURCE_*`-style properties or the **SVR** predicate, whose `properties[]` are free-form and explicitly "framework-specific prefixes" like `COMPANY_RELEASE_APPROVED`). SVR is the honest fit for a non-SCS verifier: `verifier.id = https://merge-proof.dev/verifier/v2`, `policies = [receipt schema / rule set digest]`, `properties = ["MERGEPROOF_VERIFIED", "MERGEPROOF_REQUIRED_CHECKS_RAN_ON_HEAD", "MERGEPROOF_APPROVED_ON_HEAD", ...]`.
2. **The evidence body** → a **custom predicate type** owned by Merge-Proof (`https://merge-proof.dev/receipt/v2`), which is exactly what SLSA expects for "source provenance attestations" and what source-tool and gittuf both did. Do not contort the receipt into SCAI; SCAI is for attribute/evidence assertions about artifacts and would just wrap the receipt in an extra layer. If a standard "code review" predicate ever lands upstream, emit it *in addition*.

Practical detail: put the receipt's existing canonical-evidence fingerprint into the Statement (`predicate.evidenceFingerprint`) and also as a second subject entry so external systems can reference the receipt by its own digest.

---

## 3. Sigstore

- **Keyless**: Fulcio issues ~10-minute certificates binding an ephemeral key to an OIDC identity; the signature and cert (or public key) are recorded in **Rekor**. Supported issuers on the public-good instance (`fulcio/config/identity/config.yaml`): Dex email (GitHub/Google/Microsoft logins), Google accounts, GitHub Actions, GitLab (several instances), Buildkite, CircleCI, Codefresh, Buddy, Chainguard, Kubernetes (EKS/GKE/AKS), SPIFFE, IBM, Eclipse, Kaggle. **There is no "GitHub App" identity type.** A GitHub App authenticates to GitHub with its own JWT, but that JWT is not an OIDC token issued by a Fulcio-trusted issuer. Options for a hosted App: (a) sign inside a GitHub Actions job (identity = the workflow, the source-tool model) — but Merge-Proof runs as an App, not in the customer's Actions; (b) run the signer on a Kubernetes cluster with a Fulcio-recognized OIDC issuer (EKS/GKE/AKS), so the identity is the service account; (c) SPIFFE via SPIRE; (d) a **self-managed key** (`cosign sign --key`, KMS-backed), with entries still uploaded to Rekor. Adding a new issuer to the public-good Fulcio requires a PR and community acceptance (`docs/oidc.md`).
- **Rekor v2 (rekor-tiles)**: production instance `https://log2025-1.rekor.sigstore.dev` valid from 2025-10-06, 99.5% SLO, sharded roughly every 6 months (URL changes; discover via TUF SigningConfig), witnessing built in. The v2 write API `POST /api/v2/log/entries` accepts `hashedRekordRequestV002` with either an x509 Fulcio certificate **or a raw self-managed public key** (`PKIX_ECDSA_P256_SHA_256`), and DSSE entries. So "publish the receipt hash to a public append-only log" is possible today with a plain service key, no Fulcio involved. Third-party monitors (OpenSSF's Rekor monitoring blog, Dec 2025 **[snippet]**) already watch the log for unexpected signing identities, which is the real value: a customer can subscribe to "any entry signed by Merge-Proof's key for my repo."
- **Verification tooling**: `cosign verify-attestation --type <predicateType> --certificate-identity ... --certificate-oidc-issuer ...` (or `--key`), `sigstore-policy-controller` (Kubernetes admission on container images only), Kyverno `verifyImages` with `attestations[].predicateType` and CEL/Rego conditions, Gatekeeper via external data. All of these verify attestations *on OCI images*, not on commits; to use them you'd attach the receipt to an image (see §7).
- **Cost/complexity**: Sigstore keyless from a hosted App = an identity problem, not a signing problem; the main overhead is choosing/operating an issuer and rotating cert-identity policies. Service-key DSSE + Rekor upload is ~a day of work with `sigstore-go`/`sigstore-python` or plain `cosign attest --key` semantics, plus key custody (KMS, key rotation, publish the public key + TUF-like key history at a well-known URL). Public GitHub repos: Rekor public entries are fine; private repos: entry bodies contain only hashes, but repo identity leaks unless you log a salted hash — a design choice to make explicit.

---

## 4. GitHub artifact attestations

- What they are (github/docs `artifact-attestations.md`): a signed in-toto statement binding a **file or OCI image digest** to a SLSA build provenance predicate (`https://slsa.dev/provenance/v1`) or an SBOM (SPDX/CycloneDX) or a **custom predicate** (`actions/attest` with `predicate-type` + `predicate`/`predicate-path`, ≤1024 subjects, ≤16 MB predicate). Signed with Sigstore public good for public repos (Rekor entry) and GitHub's private Sigstore (no transparency log, only federates with Actions) for private repos; private/internal requires GHEC. Verified with `gh attestation verify <file|oci://image> --owner/--repo`, `--predicate-type`, `--signer-workflow`, `--source-ref`, `--deny-self-hosted-runners`, `--cert-identity` **[snippet for flag list; cli.github.com blocked]**.
- GitHub itself advises: "You should **not** sign… individual files like source code" — attestations are for release artifacts.
- **Can an attestation be attached to a commit/PR?** Not natively. Subjects are digests of files/images; the attestations API and UI are per-repository and per-artifact digest. You *can* craft a custom-predicate attestation with `subject-digest: sha256:<...>` where the digest is over some canonical document about a commit, but the subject would be that document, not a `gitCommit` digest, and GitHub's storage/query is keyed on sha256. The only GitHub-native "attestation about a tag" is **Immutable Releases** (GA 2025-10-28 per changelog **[snippet]**; roadmap issue #1138 shows shipped/GA across Free/Team/Enterprise and GHES 3.20): tags and assets are locked and a release attestation (Sigstore bundle) is produced — release-level, not merge-level.
- **2025–2026 movement toward source/merge attestations**: none from GitHub that could be verified. The activity is in SLSA (`source-tool`, `source-actions`, `source-policies`) and gittuf. Rulesets remain GitHub's control surface; there is no signed "branch protection attestation" product. This is the gap Merge-Proof occupies.

---

## 5. gittuf

- OpenSSF **incubating** (promoted from sandbox June 2025 **[snippet]** — the gittuf repo confirms "incubating project… Supply Chain Integrity WG", "currently in beta"). Active: v0.14.0 (2026-05-01), v0.14.1 (2026-05-06), v0.15.0 (2026-06-30), v0.16.0 (2026-09-04, SHA-256 repo support).
- Model: TUF-style root/rule-file metadata and a **Reference State Log (RSL)** stored in the repo's own refs; every ref update is a signed RSL entry; policy verification is done client-side "using only locally available metadata", removing the forge as the single point of trust. Reviews are recorded either as developer-signed "reference authorization" attestations or, via the GitHub App, as tool-signed `github-pull-request-approval/v0.1` attestations (GAP-6, last modified March 2025, "Implemented: No" in the GAP doc but the App exists and is hosted).
- **Partner vs competitor**: gittuf is the *independent-of-GitHub* answer to the same question Merge-Proof answers *from* GitHub. It requires signed commits, key management, developer client adoption, and a policy repo — heavy for most teams. Merge-Proof could (a) treat a gittuf-verified RSL as extra evidence in the receipt ("gittuf policy verification: PASS"), or (b) emit its own receipt in a shape gittuf can consume as a code-review-tool attestation (the App would need to be trusted in gittuf root metadata). As a competitor it only bites at the very top of the market (regulated/high-assurance OSS maintainers). Classify: **partner concept; adjacent, not amplifying**; do not build gittuf features.

---

## 6. Evidence vaults: Kosli, Chainloop, Witness/Archivista, Grafeas

| Product | What it records about PRs/CI | Positioning / buyer | Real or theater? |
|---|---|---|---|
| **Kosli** (CLI README, Sept 2026) | `kosli attest pullrequest github/gitlab/...` binds PR approvals, Jira issues, test results, Snyk/Sonar scans to *flows* and *trails*; fingerprints artifacts by sha256; snapshots running environments (K8s, ECS, Lambda, S3, Cloud Run…); `kosli assert` gates; `kosli evaluate` runs Rego over compliance data; environment policies require provenance + specific attestations. Now branded "Governance Infrastructure for AI SDLC" with an "AI compliance assistant". | Regulated enterprise (SOC 2 / ISO / DORA change management); sales-led annual contract, "pricing defined during a call", volume-discounted **[snippet]**. | Real data model (artifact-centric provenance-to-runtime), but audience is audit/compliance; strong overlap only if Merge-Proof ever adds environments. |
| **Chainloop** (repo README) | Open-source "evidence store and policy engine": workflow *contracts* define required materials (50+ types: images, SBOMs, SARIF, VEX, QA reports, custom); attestations are in-toto, signed with Sigstore, stored as OCI; Rego policies evaluated and embedded before signing; commercial platform adds UI, curated policy library, CRA/SSDF/SLSA/NIS2/DORA frameworks (contact sales) **[snippet for pricing]**. | Security/compliance teams; developers "follow instructions without learning supply-chain terminology." | Real engineering, but framework-mapping is its product. No PR-approval evidence primitive comparable to a merge receipt. |
| **Witness / Archivista** (in-toto, donated by TestifySec) | Witness runs a command and collects attestors (git, github, gitlab, aws, gcp, material/product hashes); GitHub attestor records workflow/pipeline/runner metadata — **not PR approvals**. Archivista: GraphQL graph store for DSSE attestations, MySQL/Postgres + S3; public test instance, no SLA. | Platform teams building their own chain; TestifySec sells "Judge" on top. | Real, low-level building blocks; a plausible *storage backend* for receipts if a customer already runs Archivista. |
| **Grafeas** | Google's metadata API (notes/occurrences: build, vulnerability, attestation, deployment). Standalone client repos archived 2023; lives on as GCP Artifact Analysis / Binary Authorization. | GCP users only. | Legacy/vendor-specific; ignore. |

Verdict: these are not theater — they store real hashes and signed statements — but their *center of gravity* is "map evidence to a compliance framework and produce audit exports." That is precisely the "different company" trap: a Merge-Proof that grows Rego policies, framework catalogs, environment snapshots and CSV audit exports becomes Kosli with fewer features. The receipt's differentiation is its narrowness: one merge, exact candidate, exhaustive execution evidence, honest gaps.

---

## 7. Post-merge / deployment linkage

Mechanisms that exist today:
- **Build provenance** (SLSA/GitHub attestations) records the source commit (`buildDefinition.resolvedDependencies[].digest.gitCommit` or GitHub's `workflow.repository/ref/sha` internal params). So a deployed artifact → commit link already exists wherever provenance is generated. `gh attestation verify --source-ref` checks it.
- **Kubernetes admission** (sigstore policy-controller, Kyverno `verifyImages` attestations with `predicateType`, Gatekeeper external data) verifies attestations *attached to the image digest in the registry*. Argo CD/Flux do not verify attestations natively; Flux verifies image/OCI artifact *signatures* (cosign/notation) and both delegate policy to admission controllers.
- **GitHub custom deployment protection rules** (github/docs): a GitHub App subscribed to the `deployment_protection_rule` event receives a POST when a job targeting a protected environment starts, and approves/rejects via `POST /repos/{o}/{r}/actions/runs/{run_id}/deployment_protection_rule` (with up to 10 markdown status reports). Still marked beta in docs.
- **Kosli environments** and Chainloop are the commercial "prove what is running was properly changed" products.

Minimal-work linkage options for Merge-Proof, cheapest first:
1. **Verify-by-SHA (zero new artifacts)**: expose `GET /receipts?repo=<id>&commit=<sha>` returning the receipt for the landed candidate (merge commit and, for squash/rebase, the resulting SHA — the receipt already records target/merge SHAs). Any deploy pipeline or admission hook can check "deployed commit == a landed candidate with a VERIFIED, CURRENT receipt." No signing, no registry work.
2. **Deployment protection rule (one webhook)**: register Merge-Proof as a custom deployment protection rule; on `deployment_protection_rule`, look up the run's `head_sha`, post a status report ("Merge-Proof: VERIFIED receipt #… for <sha>") and optionally reject. This turns the receipt into a gate with about a day of work, no cryptography, and it is where platform teams would actually feel it.
3. **Embed receipt id/digest in build provenance**: a tiny action (`merge-proof/attach`) that writes `{receiptId, receiptDigest, verdict}` into `actions/attest`'s custom predicate, or as `ORG_SOURCE_MERGEPROOF_VERIFIED` in a VSA, so `gh attestation verify --predicate-type https://merge-proof.dev/receipt-ref/v1` works at deploy time. Moderate work; couples you to the customer's Actions.
4. **Attach the receipt to the OCI image** (`cosign attest --predicate receipt.json --type https://merge-proof.dev/receipt/v2`) so policy-controller/Kyverno can gate on it. This is the "different company" edge: you now need registries, per-cluster policy, and support burden.

Recommendation: 1 now, 2 as the first "amplifier" feature, 3 opportunistically, 4 never unless a paying customer demands it.

---

## 8. Honest independence: what signing actually buys

A receipt derived from GitHub API reads by a GitHub App has three distinct trust properties, and it pays to keep them separate in the product language:

1. **Observation fidelity** — did the App faithfully record what GitHub said at time T? Not improvable by cryptography; improvable by publishing the exact API calls/fields used, the canonicalization rules, and the `notChecked`/`limitations` (already done), plus **cross-observation**: repeat critical reads (remote ref durability, ruleset snapshot) after a delay and record both.
2. **Integrity + non-repudiation of the record** — can anyone (customer, auditor, future you) prove the receipt hasn't been altered since issuance and that Merge-Proof issued it? This is what a DSSE signature and a transparency-log entry add. A bare fingerprint hash proves nothing unless the hash is anchored somewhere you don't control.
3. **Independence from GitHub** — could the receipt be trusted if GitHub (or a GitHub admin with bypass) lied? **No**, and neither can source-tool ("trust in GitHub APIs to return trustworthy information", "no Byzantine resilience"). Only gittuf-style signed-commit/RSL systems claim this, at high adoption cost. Merge-Proof should say plainly: "a receipt is a signed, time-anchored record of what GitHub reported about this merge, collected by an App with read-only permissions; it is not independent of GitHub."

Minimal credible design (in order, each step independently shippable):
- **Step A — Signed receipt.** Wrap the canonical receipt JSON as an in-toto Statement (`subject`: `{name: "<owner>/<repo>@<merge sha>", digest: {gitCommit: ...}}` plus head/base SHAs as further subjects; `predicateType: https://merge-proof.dev/receipt/v2`; predicate = the existing schema v2 body). Sign as DSSE with an ECDSA P-256 service key held in KMS; publish the public key(s) and rotation history at `https://merge-proof.dev/.well-known/keys.json`. Ship a one-file verifier (`merge-proof verify receipt.dsse.json`) and a `cosign verify-blob-attestation --key` recipe.
- **Step B — Public append-only anchor.** Upload the DSSE (or its `hashedrekord`) to Rekor v2 with the self-managed key; store the returned `TransparencyLogEntry` (inclusion proof + checkpoint) inside the HTML receipt. Note the shard URL changes ~6-monthly; persist the log ID/shard in the receipt. For private repos, log a salted digest and keep the salt in the receipt so only holders of the receipt can correlate. Self-hosted alternative: a tiny tile-based log (`rekor-server-posix`) or even a signed Merkle tree in a public GitHub repo — but using the public-good log gives free third-party monitoring.
- **Step C — Receipt permalink with verification embedded.** The HTML page already exists; add the DSSE envelope, the Rekor entry UUID/index, and a client-side verify button (WebCrypto) so a reviewer can verify without installing anything. Keep **currentness** as a *separate, unsigned, live* signal — signing it would be misleading, since currentness is by definition a fresh observation.
- **Step D (optional) — Sigstore keyless.** Only once the signer runs somewhere with a Fulcio-recognized identity (GKE/EKS/AKS service account, or SPIRE). It removes long-lived key custody, but buyers get almost nothing extra beyond Step A+B; do not block on it.
- **Step E (optional) — Source-VSA/SVR summary.** Emit an SVR (`https://in-toto.io/attestation/svr/v0.2`) alongside the receipt with `properties: ["MERGEPROOF_VERIFIED", ...]`, and, if a customer runs SLSA source tooling, an `ORG_SOURCE_MERGEPROOF_VERIFIED` property they can add to their VSAs. Cheap, interoperable, not a new product.

What platform/security buyers will actually check (in practice): (1) can I fetch the receipt for a given commit SHA in one call; (2) is it signed by a key I can pin, and does verification fail loudly if the JSON is edited; (3) is there a third-party log entry with a timestamp so the receipt could not have been backdated; (4) does the receipt show *which checks ran on which SHA* and *who approved which SHA*, with the gaps listed; (5) can I gate a deployment on it without writing Rego. Nobody will read `verifiedLevels` unless they already run SLSA tooling.

---

## 9. Recommendations: amplify core vs different company

**Amplify core (do):**
- Signed DSSE receipt with a custom Merge-Proof predicate inside an in-toto Statement (Step A). Real trust value, small surface, standards-shaped.
- Rekor v2 anchoring with a self-managed key (Step B). Adds non-backdatability and third-party monitorability; ~days of work.
- Verification embedded in the permalink + a single-binary verifier (Step C).
- Verify-by-SHA lookup and a **custom deployment protection rule** integration (§7 options 1–2): the receipt becomes a gate, still without policy engines.
- Borrow **continuity** from the Source Track: record "required-review / non-fast-forward / deletion rules continuously enforced since <date or commit>" using ruleset history and prior receipts. This is the single biggest *content* upgrade the spec suggests.
- Language alignment: adopt SLSA terms ("final revision approved", "trusted robot", "technical controls", "continuity") in receipt text and docs; emit an SVR summary for interop.

**Different company (do not, or only as opt-in adapters):**
- Becoming the *issuer of SLSA Source VSAs* with `SLSA_SOURCE_LEVEL_N` claims — that is the SCS's role; a third party issuing levels invites disputes and turns you into a compliance authority.
- Policy engines (Rego/OPA), framework mappings (SOC 2 / SSDF / CRA / DORA), audit CSV exports, evidence vaults for SBOM/VEX/SARIF, environment snapshots, artifact fingerprinting — that is Kosli/Chainloop territory.
- Kubernetes admission integration (attach receipts to images, policy-controller/Kyverno rules) — heavy support burden; wait for demand.
- gittuf-style independence (signed commits, RSL, client-side verification) — a different trust model and adoption curve; partner, don't compete.
- Sigstore keyless as a prerequisite — an identity-plumbing project with little buyer-visible gain over a well-published service key.

**Smallest hardening step with real trust value:** DSSE-sign the existing receipt inside an in-toto Statement with a published service key, and record its digest in Rekor v2 (self-managed key `hashedrekord`), embedding the log entry in the receipt. It converts "a JSON with a hash we computed" into "a statement Merge-Proof cannot deny issuing and nobody can alter or backdate" — the exact three properties a security reviewer asks about — while leaving the product, schema, and honest "not independent of GitHub" framing untouched.

---

## Sources

Primary (read directly)
- SLSA Source Track requirements (v1.2 text on `main`): https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/source-requirements.md — accessed 2026-09-19 — spec v1.2 (published at https://slsa.dev/spec/v1.2/source-requirements).
- SLSA Verifying Source: https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/verifying-source.md — 2026-09-19 — v1.2.
- SLSA Tracks / What's new / Verified Properties / VSA spec: https://raw.githubusercontent.com/slsa-framework/slsa/main/spec/tracks.md, .../whats-new.md, .../verified-properties.md, .../verification_summary.md, .../source-example-controls.md — 2026-09-19 — v1.2.
- SLSA source-tool design and requirements mapping: https://raw.githubusercontent.com/slsa-framework/source-tool/main/docs/DESIGN.md and .../docs/REQUIREMENTS_MAPPING.md; repo https://github.com/slsa-framework/source-tool — 2026-09-19 — status "in development" (PoC).
- in-toto attestation framework: https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/statement.md, .../envelope.md, .../bundle.md, .../predicates/README.md, .../predicates/vsa.md, .../predicates/svr.md, .../predicates/scai.md — 2026-09-19 — Statement v1; SVR v0.2; SCAI v0.3; VSA v1.
- in-toto open issues #47 (2021), #77 (2021), #124 (2023), #297 (2023) open; #277 closed Jan 2026 via PR #470: https://github.com/in-toto/attestation/issues/47 etc.
- gittuf: https://github.com/gittuf/gittuf (incubating, beta), releases https://github.com/gittuf/gittuf/releases (v0.16.0 2026-09-04; v0.15.0 2026-06-30; v0.14.x May 2026), design doc https://raw.githubusercontent.com/gittuf/gittuf/main/docs/design-document.md, roadmap (2025-04-22) https://raw.githubusercontent.com/gittuf/gittuf/main/docs/roadmap.md, GAP-6 code review tool attestations (2025-03-25) https://raw.githubusercontent.com/gittuf/gittuf/main/docs/gaps/6/README.md, GitHub App https://github.com/gittuf/github-app.
- Sigstore Fulcio OIDC issuers: https://raw.githubusercontent.com/sigstore/fulcio/main/docs/oidc.md and https://raw.githubusercontent.com/sigstore/fulcio/main/config/identity/config.yaml — 2026-09-19.
- Rekor v2 (rekor-tiles) README and CLIENTS.md: https://github.com/sigstore/rekor-tiles — production instance log2025-1 valid from 2025-10-06; self-managed-key entries supported.
- Sigstore policy-controller: https://github.com/sigstore/policy-controller — image signatures/attestations only.
- GitHub docs source: artifact attestations concept https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/security/artifact-attestations.md; using attestations (actions/attest@v4, SBOM) .../use-artifact-attestations.md; custom deployment protection rules .../create-custom-protection-rules.md — 2026-09-19.
- GitHub `actions/attest` and `actions/attest-build-provenance` READMEs: https://github.com/actions/attest, https://github.com/actions/attest-build-provenance — custom predicates, ≤1024 subjects, 16 MB predicate; no source-track features.
- GitHub roadmap, Immutable Releases GA: https://github.com/github/roadmap/issues/1138 — shipped/GA.
- slsa-verifier `verify-vsa`: https://github.com/slsa-framework/slsa-verifier — v2.7.1; DSSE only.
- Witness: https://github.com/in-toto/witness; GitHub attestor https://raw.githubusercontent.com/in-toto/witness/main/docs/attestors/github.md; Archivista https://github.com/in-toto/archivista.
- Chainloop: https://github.com/chainloop-dev/chainloop — Apache-2.0 OSS + enterprise edition.
- Kosli CLI: https://github.com/kosli-dev/cli — Sept 2026 README.

Secondary / snippet-only (domain blocked in this session; treat as reported, not verified)
- SLSA v1.2 approved Nov 2025 with Source Track: safeguard.sh "SLSA v1.2 Source Track Explained" (2025) and https://slsa.dev/spec/v1.2/ search listing.
- SLSA Source Track sprint recap: https://slsa.dev/blog/2025/04/slsa-source-sprint (April 2025).
- OpenSSF TAC funding request for SLSA Source final spec implementation: https://github.com/ossf/tac/issues/538.
- gittuf sandbox→incubating: https://openssf.org/blog/2025/06/06/from-sandbox-to-incubating-gittufs-next-step-in-open-source-security/ (2025-06-06).
- Rekor v2 GA: https://blog.sigstore.dev/rekor-v2-ga/ (late 2025).
- GitHub changelog, immutable releases GA: https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/ (2025-10-28); code-to-cloud traceability / SLSA Build L3: https://github.blog/changelog/2026-01-20-strengthen-your-supply-chain-with-code-to-cloud-traceability-and-slsa-build-level-3-security/ (2026-01-20).
- `gh attestation verify` manual: https://cli.github.com/manual/gh_attestation_verify.
- Kosli pricing (sales-led, annual, volume-based): https://www.kosli.com/pricing/; Kosli evaluate (Rego): https://www.kosli.com/blog/introducing_kosli_evaluate/.
- Chainloop pricing (OSS free; platform contact sales): https://chainloop.dev/pricing/; Help Net Security 2026-08-10 coverage.
- OpenSSF Rekor log monitoring: https://openssf.org/blog/2025/12/19/catching-malicious-package-releases-using-a-transparency-log/ (2025-12-19).
- Grafeas client repos archived 2023: https://github.com/googleapis/nodejs-grafeas.
