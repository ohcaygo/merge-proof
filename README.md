# merge-proof

This README describes the free local CLI and GitHub Action. They inspect local Git evidence and do not collect hosted CI execution, approvals or remote-ref evidence. Flags the local Git evidence gaps described below; does not establish CI execution or approvals.

For automatic hosted proofs, try the [seven-day, no-card, report-only trial](https://merge-proof.ohcaygo.com/proof/). It starts exactly once with the first CURRENT, collection-complete VERIFIED or NOT_PROVEN hosted receipt. Continue afterward for US$29/month per observed active developer. No automatic charge at expiry. Hosted collection pauses without paid entitlement; authorized receipts remain accessible within retention and capacity limits. New enforcing gates require paid Pro and separate repository-admin/GitHub setup.

The former [Standard Evidence Pack](factory/README.md) is retired for new sales; existing orders retain their original [private fulfillment path](https://merge-proof.ohcaygo.com/legacy).

**Inspect local Git evidence before merging.** A clean diff does not establish validation of the combined state. The local analyzer reports overlapping base drift and protected-boundary findings; it does not determine whether CI tested the state or whether reviewers approved it.

```
$ npx merge-proof --base origin/main

NOT_PROVEN - this merge may be fine, but the available evidence does not prove it

  [BASE_DRIFT_UNVERIFIED] Base moved under this candidate, in the same files it changes
    What happened:    The base advanced by 12 commit(s) since this candidate diverged, and 3 file(s)
                      changed by the candidate were also changed on the base in that interval.
    Why it matters:   Git may merge this cleanly even though the combined state was never built or
                      tested. The local analysis does not establish which state CI validated.
    Missing evidence: A validation run of the candidate combined with the current base.
    Do next:          Merge or rebase the current base into the candidate, re-run CI on the combined
                      state, then re-run merge-proof.
```

- **Zero dependencies.** Nothing is installed but merge-proof itself.
- **No network calls, no model or API calls, no telemetry.** It reads local git state and prints a result.
- **Fails closed.** If the history it needs is missing, it says `NOT_PROVEN` — it never reports `VERIFIED` from evidence it could not see.

## What this is not

merge-proof is a merge-evidence verifier. It is **not** an AI code reviewer, a bug detector, a correctness proof, a security scanner, or a replacement for CI. It cannot tell you whether your code is right. It tells you whether the thing you are about to merge was ever actually checked against what you are merging it into.

## Verdicts

| Verdict | Meaning |
|---|---|
| `VERIFIED` | The checks merge-proof implements found the evidence they look for. **This is not a proof of correctness** — it is the absence of the specific evidence gaps below. |
| `NOT_PROVEN` | The merge may well be fine, but the available evidence does not establish it. This is a prompt to look, not an accusation. |
| `FAIL` | Current bound evidence demonstrates an unmet required condition. Missing history or other uncertainty yields NOT_PROVEN. |

## Install and run

No install required:

```bash
npx merge-proof --base origin/main
```

Common invocations:

```bash
npx merge-proof                              # infer base from GITHUB_BASE_REF or origin/HEAD
npx merge-proof --base origin/main --json    # machine-readable result
npx merge-proof --base origin/main --fail-on not-proven   # gate a CI job
```

merge-proof needs full history. In a shallow clone it fails closed and tells you the fix.

## GitHub Action

```yaml
permissions:
  contents: read          # always required
  pull-requests: write    # ONLY if comment: 'true'

jobs:
  merge-proof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # required: merge-proof reasons about history
      - uses: ohcaygo/merge-proof@v0.1.0
        with:
          comment: 'true'       # sticky PR comment with the result
          fail-on: 'none'       # 'not-proven' to block the job instead
```

Inputs: `base`, `head`, `fail-on`, `comment`, `ignore-file`, `working-directory`.
Outputs: `verdict`, `drift-count`, `overlap-count`, `json`.

The action writes a job summary on every run. Its only third-party dependency is `actions/github-script@v7`, a GitHub-owned action, used solely to post the optional PR comment. It never requests `contents: write` and never needs organization-wide scopes.

## What it checks

**`BASE_DRIFT_UNVERIFIED`** — *blocking, produces `NOT_PROVEN`*
The base branch advanced while this candidate was open, and files the candidate changes were **also** changed on the base during that interval. Git may still merge this cleanly. A clean textual merge is not evidence that the combined state was ever validated; whatever CI ran, ran against the older base.

**`PROTECTED_BOUNDARY`** — *blocking, produces `NOT_PROVEN`*
The candidate modifies a category of file where an unverified merge is disproportionately expensive to undo: `migration`, `schema`, `auth`, `secrets`, `billing`, `policy`. Changes to CI and deployment configuration are reported in the `ci-deploy` category as **advisory only** — for many repositories that configuration changes constantly and is well covered by CI already.

**`STALE_BASE`** — *advisory, never changes the verdict*
The candidate diverged from the base a long time or many commits ago. Distance raises the chance of untested interaction, but on its own it is not evidence that this candidate is unproven, so it never produces `NOT_PROVEN` by itself.

## What it does **not** check

These conceptual checks are **not implemented** in this release. They are listed in every run's output so a `VERIFIED` verdict is never mistaken for broader coverage than the tool has:

| Not checked | Why |
|---|---|
| `CI_RAN_ON_FINAL_HEAD` | merge-proof does not read CI results; it cannot tell which commit was tested. |
| `HUMAN_APPROVAL_PRESENT` | merge-proof does not read reviews or approvals. |
| `CANDIDATE_DURABLE_ON_REMOTE` | merge-proof inspects local git state only; it does not query a remote for durability. |
| `SCOPE_CREEP_VS_DECLARED_SCOPE` | merge-proof has no declared-scope input to compare the diff against. |

## Exit codes

Default behaviour is diagnostic: merge-proof reports and exits `0`, so adding it to CI cannot break your build. Opt into gating with `--fail-on`.

| Code | Meaning |
|---|---|
| `0` | Verdict reported (always, unless `--fail-on` says otherwise) |
| `1` | Usage or internal error |
| `2` | `NOT_PROVEN`, with `--fail-on not-proven` |
| `3` | `FAIL`, with `--fail-on not-proven` or `--fail-on fail` |

## Exclusions

Generated and vendored output is excluded by default — lockfiles, `dist/`, `build/`, `vendor/`, `node_modules/`, `*.min.js`, `*.generated.*`, protobuf output. Two sides editing a lockfile is a mechanical collision, not evidence that untested behaviour was combined.

Add repository-specific exclusions in a `.mergeproofignore` file, gitignore-style. See [`.mergeproofignore.example`](.mergeproofignore.example). Excluding a path means giving up evidence about it, so keep the list short.

## Privacy

merge-proof makes no network requests, no model or API calls, and no telemetry calls of any kind. It has no cloud backend and no dependencies. Everything it reports is derived from `git` commands run against your local repository. You can verify this: the whole tool is about 700 lines across four files in [`src/`](src/).

## Generate a pilot report in 5 minutes

From a clone of this repository, use **Node 18+** and a locally installed **Google Chrome or Chromium**. No npm install is needed. The verifier and HTML renderer remain dependency-free; PDF export launches the browser in headless mode with a temporary profile. On Linux, install Chrome/Chromium using your distribution's supported installation path. If it is not detected, set `CHROME_BIN` to its executable or pass `--chrome /path/to/chrome`.

Run the committed public sample offline:

```bash
npm run report:sample
# output/kiota.html and output/kiota.pdf
```

The sample selects `microsoft/kiota` from `study-data.json`: **75 VERIFIED, 2 NOT_PROVEN, 0 FAIL**, with no unresolvable records. It is a historical methodology demonstration, not a fresh assessment. **Microsoft is not a customer.** Inspect the committed [sample HTML](samples/kiota.html) and [sample PDF](samples/kiota.pdf), or download the `kiota-pilot-report` artifact from a self-check run.

For one real candidate, collect JSON and render it (replace the repository, refs and scope with the agreed pilot):

```bash
node bin/merge-proof.js --repo /path/to/full-clone --base origin/main --head HEAD --json > pilot.json
node bin/merge-proof-report.js --input pilot.json \
  --scope "One candidate against origin/main; refs captured in JSON; no CI evidence inspected" \
  --out output/pilot
```

For a retrospective pilot, use the existing collector with an explicit repository list. **Collection uses the network** to read GitHub; rendering does not recollect evidence. Set the selection bounds deliberately:

```bash
printf '%s\n' 'owner/repository' > pilot-repos.txt
node study/collect.js --repos pilot-repos.txt --out pilot.json --max-prs 20 --max-commits 4000
node bin/merge-proof-report.js --input pilot.json --repo owner/repository \
  --scope "Up to 20 detected agent-authored squash merges in 4000 scanned commits; no date-window guarantee" \
  --out output/pilot
```

Collection can take longer than five minutes. Once JSON exists, the same rendering command creates both files without hand assembly. `--scope` is required. No timestamps are invented: existing formats omit capture/merge dates. A local CLI result is not evidence that its candidate landed on its base. The collector records base-at-merge but still does not inspect final-state CI.

Reports include scope, all three verdict counts, every NOT_PROVEN/FAIL record in plain English, a recommendation including **do nothing**, coverage limits, an evidence register, and the source file's SHA-256. Unresolvable collector records remain visible outside verdict counts; they are never silently counted as VERIFIED or changed into FAIL. **NOT_PROVEN means missing evidence under implemented checks, not bad code.** The renderer preserves the source verdicts; it does not authenticate JSON, verify CI, or execute recommendations.

Invalid/empty input or a PDF export error exits `1`. Successful export exits `0` regardless of evidence verdicts; retain the verifier's `--fail-on` option if you need an evidence gate. A failed browser export leaves HTML and removes the previous PDF so stale output is not mistaken for a new report. For an explicit HTML-only run use `--html-only` (also removes an older PDF at that prefix). Keep the input JSON alongside the report for audit and review scope/paths before sharing private data.

Validation: `npm test` runs verifier and HTML/report contract tests on Node 18/20/22 in CI. `node test/pilot-report.js --pdf` additionally exercises real browser export. Self-check parses workflow YAML with a full parser and publishes the Kiota HTML/PDF artifact. Browser and YAML-parser tooling are CI/export prerequisites, not npm package dependencies.

## The study

merge-proof exists because of a measurement, not a hunch.

**We analyzed 2,037 merged, agent-authored pull requests across 32 public repositories. 24.1% triggered one or more evidence-gap conditions under the checks merge-proof implements.**

That is a statement about **missing evidence, not about defects**. It does not claim those PRs contained bugs, were broken, or were unsafe — most were probably fine. It says that for roughly a quarter of them, the repository holds no evidence that the change was validated against the state it merged into. Only 2 of 6 conceptual checks were run, and the sample is purposive rather than random.

See **[STUDY.md](STUDY.md)** for the full methodology, the limitations stated plainly, and the raw dataset in [`study-data.json`](study-data.json). Every published figure is recomputable from the data with `node study/summarize.js study-data.json`.

## Provenance

Derived from verification rules developed for an internal multi-agent engineering control plane, extracted and rebuilt here as a standalone, dependency-free tool.

## License

[MIT](LICENSE)

## Standard Evidence Pack factory

The [legacy factory](factory/README.md) preserves existing orders from the retired
single-PR offer, eligibility, Stripe Payment Link fulfillment, isolated Git runs,
SHA-bound GitHub CI/review evidence, secure report delivery and one reassessment.
Run `npm run factory:start` locally. It is separate from the published local-only
CLI/Action coverage described above; those interfaces retain their current checks.
Stripe test payment acceptance and release status are recorded in the factory's
acceptance report. The factory explicitly leaves remote durability and declared
scope comparison unimplemented.
# Hosted GitHub exact-state receipts

An additive [GitHub receipt layer](github/README.md) now lives beside the existing
factory. It collects remote evidence, produces versioned receipts and tracks
freshness. The hosted App is live at https://merge-proof.ohcaygo.com/proof/.
The CLI and existing Action documented below remain offline and compatible.
