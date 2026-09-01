# The G1 study

**We analyzed 2037 merged, agent-authored pull requests across 32 public repositories. 24.1% triggered one or more evidence-gap conditions under the checks merge-proof implements.**

Read that sentence precisely. It is a statement about **missing evidence**, not about defects.

## What this does and does not show

**This study does NOT claim** that 24.1% of agent-authored PRs contained bugs, were broken, were unsafe, or should not have merged. It makes no claim about the correctness of any pull request in the corpus. Many — likely most — of the flagged merges were completely fine.

**What it does show** is that for 24.1% of these merges, the repository does not contain evidence that the candidate was validated against the state it was merged into. That is a gap in verification, not a defect. The two are easy to confuse, and this study is only evidence of the first.

Two further limits belong in the same breath:

1. **Only 2 of 6 conceptual checks were run.** `CI_RAN_ON_FINAL_HEAD`, `HUMAN_APPROVAL_PRESENT`, `CANDIDATE_DURABLE_ON_REMOTE` and `SCOPE_CREEP_VS_DECLARED_SCOPE` were **not** implemented and **not** measured. A PR counted clean here may have gaps those checks would have found.
2. **This is a purposive sample, not a random one.** Repositories were selected because they were expected to merge agent-authored PRs. Rates measured here should not be read as rates for GitHub as a whole.

## Method

Everything is deterministic git. There are no model calls anywhere in collection or analysis: an "agent-authored" PR is identified by commit trailers, not by judgement.

For each repository:

1. Blobless clone (`--filter=blob:none`), which carries commits and trees — enough for `--name-only` diffs — without blob contents.
2. Walk the default branch's first-parent history for **squash merges** (single-parent commits) whose message carries an AI-agent co-author trailer and a PR number, e.g. `Fix the thing (#123)`.
3. `base-at-merge` = the squash commit's **first parent**: the exact base state the PR was merged into.
   `candidate head` = `refs/pull/N/head`: the PR's own last commit, fetched directly.
4. Run the shipped merge-proof verifier with that base and that head.

Step 4 matters. The study does not use a separate research implementation: it runs the same `src/analyze.js` that ships in this package, so the published rate is the rate the tool actually produces.

Agents counted: Copilot, Claude, Cursor, Devin, Codex, Aider, Sweep, OpenHands, Cody, Jules. Dependency bots (Dependabot, Renovate) are deliberately **excluded** — they are automation, not code agents, and counting their version bumps would inflate the corpus.

Reproduce it:

```bash
node study/collect.js --repos study/repos.txt --out study-data.json --max-prs 80 --prune true
node study/summarize.js study-data.json
```

Every figure below is emitted by `summarize.js`. Nothing is hand-tallied.

## Results

| | |
|---|---|
| PRs analyzed | **2037** |
| Repositories contributing | **32** (of 34 attempted) |
| `VERIFIED` | 1547 (75.9%) |
| `NOT_PROVEN` | **490 (24.1%)** |
| `FAIL` | 0 |
| Unresolvable (excluded from all rates) | 42 |

### Which condition fired

| Condition | PRs | Rate |
|---|---|---|
| `BASE_DRIFT_UNVERIFIED` | 410 | 20.1% |
| `PROTECTED_BOUNDARY` | 109 | 5.4% |

A PR can trigger both, so these do not sum to the `NOT_PROVEN` total.

Base drift dominates. The most common evidence gap is not exotic: the base branch moved, in the same files the PR touched, and nothing ever tested the combination.

### Protected boundaries

| Category | PRs | Rate |
|---|---|---|
| `auth` | 50 | 2.5% |
| `schema` | 30 | 1.5% |
| `migration` | 17 | 0.8% |
| `policy` | 7 | 0.3% |
| `secrets` | 4 | 0.2% |
| `billing` | 1 | 0.0% |

### Stratification

Repositories were split by distinct non-bot commit authors, computed from git rather than assigned by hand (threshold: 25).

**The split failed to separate anything.** All 32 contributing repositories landed in the team stratum (2037 PRs, 24.1%); the small/solo stratum is **empty**. This is a limitation of the sample, not a finding: the repositories that visibly merge agent-authored PRs at volume are large-team repositories, so this corpus says nothing about small or solo projects.

### Repositories that produced zero flags

3 of 32 contributing repositories returned no `NOT_PROVEN` verdicts: `Azure/communication-ui-library`, `github/docs`, `microsoft/terminal`.

Repositories attempted but contributing nothing:

- `microsoft/markitdown`: no agent-authored squash merges found in the scanned window
- `github/codeql`: no agent-authored squash merges found in the scanned window

### Per repository

| Repository | PRs | NOT_PROVEN | Rate | Distinct authors |
|---|---|---|---|---|
| `github/gh-aw` | 80 | 19 | 23.8% | 42 |
| `Azure/azureml-assets` | 80 | 2 | 2.5% | 303 |
| `Azure/typespec-azure` | 80 | 15 | 18.8% | 79 |
| `microsoft/semantic-kernel` | 80 | 10 | 12.5% | 439 |
| `microsoft/playwright` | 80 | 16 | 20.0% | 812 |
| `microsoft/PowerToys` | 80 | 33 | 41.3% | 726 |
| `microsoft/fluentui` | 80 | 12 | 15.0% | 1048 |
| `microsoft/onnxruntime` | 80 | 22 | 27.5% | 1053 |
| `microsoft/WSL` | 80 | 26 | 32.5% | 139 |
| `microsoft/vcpkg` | 80 | 73 | 91.3% | 2997 |
| `microsoft/FluidFramework` | 80 | 24 | 30.0% | 336 |
| `Azure/azure-dev` | 80 | 21 | 26.3% | 150 |
| `Azure/azure-sdk-for-python` | 80 | 6 | 7.5% | 1023 |
| `Azure/azure-sdk-for-js` | 80 | 15 | 18.8% | 698 |
| `Azure/azure-sdk-for-net` | 80 | 17 | 21.3% | 2154 |
| `Azure/azure-powershell` | 80 | 12 | 15.0% | 2295 |
| `dotnet/docs` | 80 | 19 | 23.8% | 3330 |
| `dotnet/efcore` | 80 | 27 | 33.8% | 535 |
| `dotnet/aspnetcore` | 80 | 18 | 22.5% | 1735 |
| `dotnet/runtime` | 80 | 19 | 23.8% | 3533 |
| `microsoft/vscode` | 80 | 29 | 36.3% | 3299 |
| `microsoft/kiota` | 77 | 2 | 2.6% | 196 |
| `Azure/azure-cli` | 59 | 20 | 33.9% | 1464 |
| `Azure/bicep` | 57 | 18 | 31.6% | 216 |
| `github/docs` | 38 | 0 | 0.0% | 3281 |
| `microsoft/autogen` | 33 | 2 | 6.1% | 576 |
| `dotnet/machinelearning` | 28 | 3 | 10.7% | 260 |
| `microsoft/TypeScript` | 27 | 5 | 18.5% | 1147 |
| `Azure/azure-functions-host` | 24 | 4 | 16.7% | 193 |
| `microsoft/graphrag` | 10 | 1 | 10.0% | 52 |
| `Azure/communication-ui-library` | 3 | 0 | 0.0% | 41 |
| `microsoft/terminal` | 1 | 0 | 0.0% | 534 |

## False-positive controls

Two exclusions are applied, both aimed at undercounting rather than inflating:

1. **Generated and vendored artifacts** — lockfiles, `dist/`, `build/`, `vendor/`, `node_modules/`, minified and generated output — are excluded from drift overlap. Two sides editing a lockfile is a mechanical collision, not evidence that untested behaviour was combined.
2. **`ci-deploy` is advisory only.** CI and deployment configuration changes constantly in many repositories and is well covered by CI itself. Counting it as blocking would have raised the headline rate; it is deliberately excluded from the verdict.

Where a judgement call existed, it was made in the direction that lowers the reported rate.

## Known limitations

- **Rebase-merged PRs are missed entirely.** They leave no single squash commit to anchor on, so the corpus is biased toward repositories that squash-merge.
- **42 PRs were unresolvable** because their head ref had been deleted and garbage-collected. They are excluded from all rates and are never counted as `VERIFIED`.
- **Agent detection depends on trailers.** A PR authored by an agent that leaves no trailer is invisible to this method, so the corpus undercounts agent activity.
- **Per-repository cap of 80 PRs** (most recent first) stops any single large repository from dominating, but weights the corpus toward recent activity.
- **Only the default branch's first-parent history** is walked, to a bounded depth.
- **A purposive sample.** See the limits section above.

## Raw data

[`study-data.json`](study-data.json) holds one row per PR: repository, PR number, detected agent, squash commit, base and head SHAs, verdict, findings, drift and overlap counts, and protected categories. Every row is public git data and independently checkable — pick any row and re-run the tool against those two SHAs.
