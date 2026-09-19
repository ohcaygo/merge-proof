# E. "Merge-Proof" naming collision and competitive radar

Researched 2026-09-19 from a sandbox whose egress proxy blocks most non-GitHub/npm/PyPI hosts. Every "reachable" claim below is about this sandbox; Ryan's laptop will reach more. Nothing was registered and nobody was contacted.

## 0. Headline findings

1. The name is already three-way contested, and we are the youngest of the three by both GitHub date and registry date.
   - **GenLayer "MergeProof – Staked PR Review Protocol"** (Feb 2026): owns `mergeproof.com`, npm `@mergeproof/cli`, Docker Hub `yeagerai/mergeproof-relay`, `genlayerlabs/mergeproof-e2e`, and — most likely — the private GitHub App at `github.com/apps/mergeproof` (page says only "MergeProof is a private GitHub App"; owner not shown, attribution to GenLayer is an inference from the Feb 2026 timeline).
   - **Aryamanz29/mergeproof** (created 2026-09-12): PyPI `mergeproof` 0.2.0→1.0.2 in four days, GitHub Marketplace *Action* "mergeproof" (Code Quality, Utilities) v1.0.2, `ghcr.io/aryamanz29/mergeproof`, docs site, a required commit status literally named `mergeproof`, and a `mergeproof-receipts` branch. Its README uses our vocabulary: "Sign-off is a human approval bound to the commit; a new push …", "receipt", "evidence". **Correction to the brief:** it is *not* a hosted App. PR #16 "run mergeproof as a hosted GitHub App" was closed unmerged on 2026-09-12 ("hosted mode is not needed for now"). It is a Marketplace Action plus a CLI.
   - **ohcaygo/merge-proof** (created 2026-08-31): npm `merge-proof` 0.1.0 (2026-09-01), Marketplace Action "merge-proof" (Continuous Integration, Code Review) v0.1.0, `merge-proof.ohcaygo.com` (Cloudflare). `github.com/apps/merge-proof` returns 404, so our hosted App does not use that slug.
2. Search engines already conflate the two OSS projects: the exact query `"mergeproof"` returns only Aryaman's project in the top 9; `"merge proof" github` returns ours #1, Aryaman's #3 and his PyPI page #4; a query that excludes both names still returned both.
3. `npm i mergeproof` (no hyphen) is **unclaimed** (404) and `pip install merge-proof` is **unclaimed** (404). Each typo currently fails loudly rather than installing the wrong thing. That is the cheapest thing to protect and it is a registration, so it is Ryan's call.
4. The category is crowded and converging on the same words. GitHub Marketplace search for "merge evidence" returns six Actions: Merge-Evidence Gate, merge-proof, mergeproof, MaintainerGuard, BootProof, Source Review Coverage ("one in-toto attestation per merge"). "merge proof" adds Receipt Gate, Signetry Admission, MergeWhy, QWED Security. On GitHub, `ci-evidence-gate` (korovin-aa97, Aug 29 2026, "Exact-SHA, changed-surface CI evidence for GitHub pull requests", topic `attestation`) is the closest wording to our "exact-state" pitch.
5. `mergeproof` looks like a recurring hackathon/challenge prompt: `streetquant/micro1-mergeproof` is tagged "micro1 Frontier Engineering Challenge 2026 — Evidence-grounded release gate for agent-authored code changes", and four other June–August 2026 repos named mergeproof-* carry near-identical "evidence-backed merge decisions" descriptions. Expect more of them.

## 1. Collision table

| # | Name / owner | Where | Created | Last activity | Stars | Lang | What it is | App / Action / Marketplace | Relation to us |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **MergeProof (GenLayer / YeagerAI)** | mergeproof.com (live; DNS 216.150.1.1); npm `@mergeproof/cli` 0.1.0/0.2.0; Docker `yeagerai/mergeproof-relay`; `genlayerlabs/mergeproof-e2e`; `MuncleUscles/mergeproof-test` | 2026-02-04/05 | Docker 2026-02-09; X post 2026; GenLayer ecosystem map lists it; main repo `genlayerlabs/mergeproof` is private (404) | n/a | TS | "Staked PR review protocol on GenLayer + Base": bounties on issues, devs stake 10%, reviewers paid to break PRs | `github.com/apps/mergeproof` exists as a **private GitHub App named MergeProof** (owner not displayed) | Same surface (GitHub PRs), different mechanism (crypto staking). Senior user of the exact mark and the .com |
| 2 | **Aryamanz29/mergeproof** (Aryaman Bhushan) | github.com/Aryamanz29/mergeproof; PyPI `mergeproof`; ghcr.io/aryamanz29/mergeproof; aryamanz29.github.io/mergeproof | 2026-09-12 | pushed 2026-09-15; releases v0.2.0–v0.6.0 on 09-12, v1.0.0 09-14, v1.0.1/1.0.2 09-15 | 1 | Python, MIT | Policy file `mergeproof.yaml`; checks `tests.changed`, `ci.job_passed`, `evidence.links`, `review.human_verified` ("approval bound to the commit"); posts a scorecard; commit status `mergeproof`; receipts branch `mergeproof-receipts`; `replay`, `doctor` | **Marketplace Action "mergeproof"** (Code Quality, Utilities) v1.0.2; `actions-marketplace-validations/Aryamanz29_mergeproof` fork dated 2026-09-15. Hosted App PR #16 closed unmerged 2026-09-12 | Direct functional and vocabulary overlap; highest confusion risk |
| 3 | bukacdan/MergeProof | github | 2026-09-02 | 2026-09-02 | 3 | Shell, MIT | Agent Skill that records a browser demo and attaches it to the PR as evidence | none | PR-evidence adjacent; most-starred "MergeProof" repo |
| 4 | nonggde/mergeproof | github; homepage mergeproof.a13553776411.workers.dev | 2026-07-14 | 2026-07-15 | 0 | TS, Apache-2.0 | "Evidence-backed release risk analysis for public GitHub PRs using GPT-5.6" | none | Category adjacent, dormant |
| 5 | Adityabaskati-weeb/mergeproof-ai | github | 2026-07-16 | 2026-07-17 | 0 | TS, MIT | "Evidence-backed merge decisions for AI-assisted engineering teams" | none | Same phrasing; dormant |
| 6 | eyunipiqed45-afk/mergeproof-agent | github | 2026-07-28 | 2026-07-28 | 0 | TS, MIT | "Deterministic … PR evidence review with an explicit human approval gate" | none | Same phrasing; dormant |
| 7 | streetquant/micro1-mergeproof | github | 2026-08-29 | 2026-08-31 | 0 | Python | "Evidence-grounded release gate for agent-authored code changes — micro1 Frontier Engineering Challenge 2026" | none | Evidence that "mergeproof" is a challenge prompt name |
| 8 | s4piens/mergeproof | github | 2026-06-02 | 2026-07-19 | 0 | TS | "Human Layer — la revue humaine avant le merge" | none | Adjacent, dormant |
| 9 | Umais-Adeed/MergeProof; IACONTABLEWEB/MERGEPROOF; OrenAshkenazy/mergeproof-demo-* | github | Apr–Jul 2026 | ≤ Jul 2026 | 0 | TS/JS/HCL | empty or demo infra | none | Noise |
| 10 | jasonmirza1/genlayer-mergeproof | github | 2026-08-11 | 2026-08-29 | 0 | TS, MIT | "Validator-verifiable GitHub bounty escrow on GenLayer" | none | GenLayer ecosystem clone |
| 11 | sarathdr/merge-proof | github | 2019-07-22 | 2019-07-22 | 1 | HTML | unrelated | none | Only pre-2026 exact hyphenated name; dead |
| 12 | kitcox-dev/scratch-f12-seam9-merge-proof; ssweens/grits ("makes things merge-proof") | github | 2026 | 2026 | 0 | – | "merge-proof" used as an adjective | none | Generic-usage evidence |
| 13 | **ohcaygo/merge-proof (us)** | github; npm `merge-proof` 0.1.0 (2026-09-01); merge-proof.ohcaygo.com | 2026-08-31 | pushed 2026-09-19 | 0 | JS, MIT | Exact-state merge evidence: CURRENT / STALE / NOT_PROVEN; local CLI + Action; hosted Merge Proof Pro | Marketplace Action "merge-proof" (CI, Code Review) v0.1.0; `actions-marketplace-validations/ohcaygo_merge-proof` 2026-09-02; `github.com/apps/merge-proof` = 404 | — |

Registry and domain status (checked 2026-09-19):

| Namespace | mergeproof | merge-proof | merge_proof | Notes |
|---|---|---|---|---|
| npm | 404 (free) | **ours** 0.1.0 | 404 | `@mergeproof/cli` = GenLayer (0.2.0, 2026-02-05, maintainer edgars.nemse). npm search "mergeproof" returns only `@mergeproof/cli`; it does not surface `merge-proof` |
| PyPI | **Aryaman** 1.0.2 | 404 (free) | 404 (free) | PyPI treats `merge-proof`/`merge_proof` as one name, distinct from `mergeproof`. Full simple index (894,370 projects) contains exactly one match: `mergeproof` |
| crates.io | 404 | 404 | 404 | free |
| Go proxy | `github.com/aryamanz29/mergeproof` resolves v0.2.0–v1.0.2 (module path, not a Go package) | – | – | |
| Docker Hub | `yeagerai/mergeproof-relay` (1,554 pulls) | none | – | ghcr.io needs auth; Aryaman's README advertises `ghcr.io/aryamanz29/mergeproof` |
| Homebrew | blocked from sandbox | | | check https://formulae.brew.sh/api/formula/mergeproof.json |
| RubyGems | 404 | – | – | |
| GitHub user/org | `github.com/mergeproof` 403 from sandbox; user search "mergeproof" = 0 users | `github.com/merge-proof` 403 | – | 403 is the sandbox proxy, not GitHub; verify with `gh api users/mergeproof` |
| GitHub App slug | **taken (private App "MergeProof")** | 404 (free) | – | |
| Marketplace Action | **Aryaman** v1.0.2 | **ours** v0.1.0 | – | both listed, adjacent in results |

Domains (DNS only; whois/RDAP hosts were blocked, so "registered" is inferred from a resolving record and "free" is inferred from NXDOMAIN — confirm with `rdap.org/domain/<name>` before acting):

| Domain | DNS | Inference |
|---|---|---|
| mergeproof.com | A 216.150.1.1 | registered, live: GenLayer "MergeProof – Staked PR Review Protocol" (title from web search; HTTP blocked here) |
| mergeproof.org | A 216.239.32/34/36/38.21 (Google) | registered; content unknown (blocked) — likely Google Sites/parked |
| mergeproof.dev / .io / .ai / .app | NXDOMAIN | probably unregistered (or registered with no DNS) |
| merge-proof.com / .dev / .io / .ai | NXDOMAIN | probably unregistered |
| merge-proof.ohcaygo.com | Cloudflare AAAA | ours, live |
| ohcaygo.com apex | NXDOMAIN | note: the apex has no A/AAAA record; only the subdomain resolves. Worth a look, unrelated to naming |

Trademarks: USPTO TSDR/TESS, EUIPO eSearch, UK IPO, WIPO Global Brand Database and TMview were all blocked from the sandbox (HTTP 403 at the proxy). Web search found no "MergeProof" filing reported anywhere; it did surface registered MERGE word marks (Merge Labs, Inc., Reg. 5115636; Merge IP, LLC; MERGE DESIGN; MERGE FAMILY). Check manually:
- https://tmsearch.uspto.gov/ (search "mergeproof", "merge proof", and "merge" in classes 009/042)
- https://euipo.europa.eu/eSearch/
- https://www.gov.uk/search-for-trademark
- https://branddb.wipo.int/
- https://www.tmdn.org/tmview/

## 2. Search-result ranking and category ambiguity

| Query | Top results (classified) |
|---|---|
| `"mergeproof"` | 1 PyPI mergeproof (OSS-A), 2 Aryaman repo (OSS-A), 3–9 Aryaman PRs/issues (OSS-A). **0 ours, 0 GenLayer** |
| `"merge-proof" github app` | 1 ohcaygo/merge-proof (ours), 2–4 our PRs #4/#5/#13, then merge-me, merge-freeze, mergease (unrelated) |
| `"merge proof" github` | 1 ours, 2 ernius/mergesort (formal proof, unrelated), 3 Aryaman, 4 PyPI mergeproof, 5+ GitHub docs on merging (unrelated) |
| `"merge-proof" -ohcaygo -mergeproof` | still returns ours and Aryaman's; plus Software Foundations "Merge sort proof of correctness", Proof.com "Merge Documents", CMU TPS "MERGE-PROOFS" |
| `"MergeProof" trademark` | PyPI, mergeproof.com (GenLayer), MERGE marks on Justia; no MergeProof filing |
| `Aryamanz29 mergeproof` | PR #16 "run mergeproof as a hosted GitHub App", repo, issues |
| `mergeproof GenLayer` | mergeproof.com (GenLayer), X post by @QueenMapa, GenLayer ecosystem map, Aryaman releases |
| HN / Reddit / lobste.rs / dev.to | no posts for either name (via web search; direct endpoints blocked) |

Category confusion outside PR tooling ("merge proof" as a phrase): (a) formal methods — merge sort correctness proofs (Agda `ernius/mergesort`, Coq VFA, McGill lecture notes), CMU TPS "MERGE-PROOFS" command; (b) cryptography/ZK — "table-merge proofs" in `willow-network/eip-8304-prover` (Sept 2026), rollup "proof merging" (`rpanic/zkapp-multisig-wallet`), Quanta "combine two proof methods"; (c) Ethereum "The Merge" + proof-of-stake (`JoeRichardsonJR/Ethereum-Proof-of-Stack-Merger-fork-Tool`, 10 stars/50 forks), merge-mining PoC (`8144225309/obscurity`); (d) CRDT "mathematically guaranteed to converge" merges (`mgillr/crdt-merge`, Automerge); (e) "merge-proof" as an adjective (grits). "merge-mined" does not collide with us directly.

Quantified: of 160 GitHub repos matching `"merge proof" in:description`, roughly 10 are PR-gate tools and the rest are formal-methods, crypto, CRDT or unrelated. Of the 15 repos with `mergeproof` in the name, 11 are PR-evidence tools (Aryaman, GenLayer ecosystem, five challenge-style clones, bukacdan) and 4 are empty. In web search, the one-word form is 100% Aryaman; the two-word form is ~40% us/Aryaman and ~60% generic. Ambiguity is high for the two-word form and moderate for the hyphenated form; the one-word form is effectively owned by Aryaman on PyPI/Google and by GenLayer on .com/App slug.

## 3. Confusion risk and cost, keep vs rename

| Scenario | Probability (next 12 months) | Cost if it happens | Notes |
|---|---|---|---|
| (a) Developer on GitHub Marketplace conflates "merge-proof" (ours) with "mergeproof" (Aryaman) | High that they see both (they co-rank for "merge evidence" and "merge proof"); ~30–50% that a skimming reader attributes one's description/verdicts to the other | Moderate: support tickets in the wrong repo, reviews on the wrong listing, "why does your check say 4 of 5 requirements" style confusion; both post PR comments and commit statuses with near-identical names (`merge-proof` vs `mergeproof`) so a repo could require the wrong one | Aryaman's listing already says "evidence gate", "receipt", "approval bound to the commit". A future hosted App from him (PR #16 is parked, not abandoned) would raise this further |
| (b) `npm i mergeproof` typo | Common typo pattern (hyphen dropped); today it yields 404, not a wrong install | Low today; becomes moderate the day anyone publishes `mergeproof` on npm (GenLayer already holds the `@mergeproof` scope and could publish an unscoped package at any time) | Claiming `mergeproof` on npm as a redirect/deprecation shim is cheap insurance. It is a registration → Ryan decides |
| (c) `pip install mergeproof` | ~10–20% of people who see our name and are Python-first, plus LLM assistants that guess a pip name | Moderate: they get Aryaman's tool, which also prints a status named `mergeproof` and writes receipts; they may believe it *is* ours | `pip install merge-proof` is free; publishing a PyPI placeholder that prints "you probably want npx merge-proof" would close it. Also a registration → Ryan decides |
| (d) Trademark dispute | Low (<10%) near term: no party has a registration on record, all are tiny. Rises if we or GenLayer file, or if either raises funding | If GenLayer (senior user since Feb 2026, owns the .com, sells a "protocol") objected, we could not credibly claim priority on the one-word mark; a descriptive "merge proof" is weak for everyone. Registered MERGE marks in software classes mean any "Merge*" brand carries some diluted risk | Not a reason to rename today; a reason not to invest in the mark |

Cost of renaming now vs later:

| Asset | Now (0 stars, 0 forks, 0.1.0, no paying customers visible) | Later (after Pro customers, backlinks, required checks in customer rulesets) |
|---|---|---|
| GitHub repo `ohcaygo/merge-proof` | rename; GitHub redirects old URL; 1 hour | same mechanics, but every customer workflow `uses: ohcaygo/merge-proof@v1` keeps working via redirect; Marketplace listing must be recreated |
| npm `merge-proof` | publish new name, `npm deprecate` old with pointer; names cannot be reused; 1 hour | plus semver/major bump communications, download stats reset |
| Marketplace Action listing | delist/relist under new name; slug in URL changes; 1–2 hours | loses whatever ranking/installs it has; customers' saved links break |
| Hosted GitHub App name/slug | rename in App settings; installations persist; 30 min | same, but customers see a renamed App in their org settings and may re-authorize |
| **Required check / status context name** | change in code; nobody has it in a ruleset yet; 30 min | **highest later cost**: every customer with "require status merge-proof" must edit branch protection/rulesets or merges block; needs a dual-emit transition period |
| Receipts | schema field `tool` versioned; old receipts remain verifiable; 1 hour | old receipts reference the old name forever; verification docs must explain both |
| Docs / site `merge-proof.ohcaygo.com` | new subdomain + redirects; 2 hours | SEO history lost, backlinks need redirects kept indefinitely |
| Backlinks / mentions | near zero today | grows with every post, review, Marketplace reference |
| Total | ~1–2 focused days | 1–2 weeks of engineering plus a customer migration window, multiplied by customer count |

Honest framing: nothing found today forces a rename. The strongest argument for renaming is that the one-word form is *already* not ours in any namespace that matters (PyPI, .com, App slug, Google), Aryaman's project is converging on our vocabulary at a pace of a release a day, and the cost curve is at its minimum right now. The strongest argument for keeping is that the hyphenated form is ours on npm, Marketplace and GitHub, search engines rank us #1 for "merge-proof", the descriptive phrase communicates the product instantly, and a rename spends a day we would otherwise spend on the product. A middle path (keep the name, defensively claim `mergeproof` on npm and `merge-proof` on PyPI as pointer packages, and never invest in a trademark) is also viable. Decision belongs to Ryan.

## 4. Candidate names (availability checked 2026-09-19)

| Candidate | npm | PyPI | crates | GitHub repos with name | .com | .dev | .io | Notes |
|---|---|---|---|---|---|---|---|---|
| **ExactState** (`exact-state`) | free | free | free | 0 | registered (199.230.104.71) | NXDOMAIN | NXDOMAIN | Matches our own tagline "exact-state merge evidence"; escapes "merge*" entirely; two unrelated npm hits for the search term, none exact |
| **ProvenMerge** (`proven-merge`) | free | free | free | 0 | NXDOMAIN | NXDOMAIN | NXDOMAIN | Cleanest availability of the set; still says "merge"; reads as a verdict word (PROVEN) which our verdicts do not use |
| **StaleProof** (`stale-proof`) | free | free | free | 0 | registered (Cloudflare) | NXDOMAIN | NXDOMAIN | Names the failure mode we detect (STALE); could be misread as "proof against staleness" in caching contexts |
| **MergeWitness** (`merge-witness`) | free | free | free | 0 | registered (parked-style A records) | NXDOMAIN | NXDOMAIN | "Witness" is honest about what we are (an observer, not a reviewer); "witness" also has a crypto meaning |
| **MergeAttest** (`merge-attest`) | free | free | free | 0 | NXDOMAIN | NXDOMAIN | NXDOMAIN | Clean, but "attest" signals SLSA/in-toto/Sigstore attestations, which Source Review Coverage already sells; likely to be assumed cryptographic |
| ~~MergeReceipt~~ | **taken** (`mergereceipt`, 2026-08) | free | free | `rfedosov/mergereceipt` (Aug 2026, "reproducible verification signals for PRs") | NXDOMAIN | NXDOMAIN | NXDOMAIN | Rejected |

GitHub org/user availability for these could not be confirmed (org/user endpoints 403 through the sandbox proxy; user search returned zero users for all six). Verify with `gh api users/<name>` and `gh api orgs/<name>`. All ".com registered" rows are DNS inferences.

## 5. Why Aryamanz29/mergeproof was missed

- Timing: the repo was created 2026-09-12 and reached v1.0.2 on 2026-09-15; the Marketplace validation fork is dated 2026-09-15. Any research done before 12 September could not have found it, and research done 12–15 September would have found a 0-star, days-old Python repo that looked like the other five dormant `mergeproof-*` clones.
- Namespace blindness: a check of npm alone reports `mergeproof` as free (it still is). PyPI, `github.com/apps/<slug>`, `.com` DNS and the Marketplace were the namespaces that were actually taken, and none of them share a search API with npm.
- Query shape: hyphenated searches (`merge-proof`) rank ours; one-word searches rank Aryaman; GitHub's `in:name` search ranks by "best match", so a 2019 dead repo and empty clones sit above a three-day-old active one unless sorted by `updated`.
- Search-engine lag: web indexes picked up Aryaman's PRs/issues within days because he opened ~65 PRs and issues in a week; a project with a quieter history would still be invisible today.
- Private prior art: GenLayer's main repo is private; only the `-e2e` fixtures, the npm scope, the Docker image and the .com are public signals, and none of them surface in a GitHub repository search.

## 6. Competitive radar: sources, reachability, queries, cadence, filters

Reachability is from this sandbox on 2026-09-19. "Blocked (proxy)" means the sandbox's egress policy, not the site.

| Source | URL / command | Reachable here | Query | Expected noise | Cadence | Flag only if |
|---|---|---|---|---|---|---|
| GitHub repo search (REST) | `gh api -X GET search/repositories -f q='mergeproof in:name' -f sort=updated`; raw `https://api.github.com/search/repositories?q=...` | REST blocked (session bound to repos); the GitHub MCP search worked, so the API itself is fine from a normal machine. Limits: 10 req/min unauthenticated, 30/min with a token | Name set: `mergeproof in:name`, `merge-proof in:name`, `"merge proof" in:description`. Phrase set: `"evidence" "pull request" in:description created:>{7d} stars:>=5` (3 hits today), `"receipt" "pull request" in:description,readme created:>{30d} stars:>=3`, `"approval" "bound" "commit" in:readme`, `"merge integrity"`, `"evidence gate"` (12,413 hits unfiltered — do not use without stars/date) | Name set: low (≤20 repos, mostly dormant). Phrase set: very high without `created:` + `stars:` | Daily (names), weekly (phrases) | new repo AND (stars ≥ 20 OR homepage set OR topic `github-app` OR a Marketplace validation fork `actions-marketplace-validations/<owner>_<repo>` exists) |
| GitHub topics | `search/repositories?q=topic:merge-queue+created:>{7d}`; also `topic:pull-requests topic:verification`, `topic:provenance`, `topic:attestation`, `topic:evidence-gates` | via MCP yes | `topic:merge-queue pushed:>2026-08-01` → 30 repos (Uber submitqueue 225★, korthout/backport-action 118★, a dozen agent merge-train tools); `topic:pull-requests topic:verification created:>2026-08-01` → 3 (no_human 317★, mergereceipt, PRTruth) | Moderate | Weekly | stars ≥ 20 OR description contains approval/bypass/attestation/receipt/stale |
| GitHub Marketplace | `https://github.com/marketplace?type=actions&query=merge+evidence`, `...?type=apps&category=code-review`, `category=continuous-integration`, `category=security`, `category=code-quality`, `category=agent-apps` (UI has "Recently added" sort; no public API) | HTML 403 via curl, readable via a browser-style fetch | queries: `merge evidence`, `merge proof`, `pull request evidence`, `receipt`, `attestation`, `approval` | Low (6–8 results per query) | Weekly, diff the result list | any new listing in the result set; any App (not Action) in the set |
| GitHub App slug probe | `curl -o /dev/null -w '%{http_code}' https://github.com/apps/<slug>` | 200/404 via fetch | slugs: mergeproof, merge-proof, mergereceipt, merge-evidence, evidence-gate, receipt-gate | none | Weekly | 404 → 200 transition |
| GitHub repo feeds for the two known rivals | `https://github.com/Aryamanz29/mergeproof/releases.atom`, `/commits/main.atom`; `https://pypi.org/rss/project/mergeproof/releases.xml` | GitHub atom 403 here (public normally); PyPI RSS 200 | – | none | Daily | any release; any commit mentioning app/hosted/webhook/status/ruleset |
| npm registry search | `https://registry.npmjs.org/-/v1/search?text=<q>&size=20` and exact `https://registry.npmjs.org/<name>` | yes | exact: `mergeproof`, `merge-proof`, `merge_proof`, candidate names; keyword: `keywords:pull-request,verification` (12 results, newest prtruth, leerness-gate, @didwork/inspect) | phrase search is useless (`merge evidence` 46,185; `evidence gate` 24,636; `merge queue` 56,142) | Daily (exact names), weekly (keywords) | exact name transitions 404→200; keyword search returns a package with `date` in the last 7 days and description containing merge/PR/evidence/approval |
| PyPI | exact `https://pypi.org/pypi/<name>/json`; new-package feed `https://pypi.org/rss/packages.xml`; updates `https://pypi.org/rss/updates.xml`; full index `https://pypi.org/simple/` with `Accept: application/vnd.pypi.simple.v1+json` (894,370 names) | all 200 | grep feeds for `merge|proof|receipt|gate|evidence|attest`; weekly diff of the simple index for `merge`/`proof` substrings | RSS: ~100 items/hour, regex keeps it to a few/week | RSS hourly if scripted, otherwise weekly index diff | new name containing merge+proof/receipt/evidence/gate |
| crates.io / Go proxy / Docker Hub / RubyGems | `https://crates.io/api/v1/crates/<name>` (send a User-Agent); `https://proxy.golang.org/github.com/<owner>/<repo>/@v/list`; `https://hub.docker.com/v2/search/repositories/?query=mergeproof`; `https://rubygems.org/api/v1/gems/<name>.json` | all reachable | exact names | none | Weekly | 404→200 |
| Homebrew | `https://formulae.brew.sh/api/formula/<name>.json` | blocked (proxy) | exact | none | Monthly | 404→200 |
| MCP registries | `https://registry.modelcontextprotocol.io/v0/servers?search=merge` (curl timed out; fetch worked: 16 servers, none PR-related); Smithery `https://smithery.ai/?q=pull+request`; Glama `https://glama.ai/mcp/servers?query=pull+request`; `https://mcp.so/?q=merge` | official registry yes (slow); others blocked (proxy) | `merge`, `pull request`, `approval`, `evidence` | Low–moderate | Weekly | server whose description mentions PR/merge/approval and has a publisher domain |
| Hackathons | `https://devpost.com/software/search?query=mergeproof` (and `merge+evidence`, `pull+request+gate`); micro1 challenge pages; GitHub search `"challenge" "merge" "evidence" in:description created:>{30d}` | Devpost blocked (proxy); GitHub search works | as shown | Low | Monthly | any entry with a demo URL or > 0 team members |
| Product Hunt | `https://www.producthunt.com/search?q=merge+proof` | blocked (proxy) | – | Low | Weekly | any launch in dev-tools with merge/PR/evidence |
| Vendor changelogs | GitHub `https://github.blog/changelog/feed/` (and label pages for "pull requests", "rulesets", "merge queue"); GitLab `https://about.gitlab.com/atom.xml` and `https://about.gitlab.com/releases/`; OpenAI `https://openai.com/blog/rss.xml` / Codex changelog; Anthropic `https://docs.anthropic.com/en/release-notes/overview` | all blocked (proxy); `gitlab.com/gitlab-org/gitlab/-/releases.atom` returned 404 (use `/-/tags?format=atom`) | grep items for: merge queue, required check, ruleset, bypass, approval, stale, attestation, artifact attestations, stacked PRs, agent PRs | GitHub changelog ~5–10 items/day; regex keeps ~1–3/week | Daily | item matches regex `merge queue|required (status|check)|ruleset|bypass|approv|stale|attest|stacked` |
| arXiv | `https://export.arxiv.org/api/query?search_query=cat:cs.SE+AND+(abs:%22merge+queue%22+OR+(abs:%22pull+request%22+AND+abs:evidence))&sortBy=submittedDate&max_results=20` | blocked (proxy) | as shown | Low (a few/month) | Weekly | title/abstract mentions merge queue, PR approval, agent-authored PRs, provenance |
| Hacker News | `https://hn.algolia.com/api/v1/search?query=mergeproof&tags=story`; `...query="merge queue"&tags=story&numericFilters=created_at_i>{ts}` | blocked (proxy) | exact names + "merge queue" + "PR evidence" | Exact names: zero today. Topic: ~2–5 stories/week | Daily | points ≥ 20 or matches exact name |
| Reddit | `https://www.reddit.com/search.json?q=mergeproof&sort=new` (needs a User-Agent; often rate-limited) | blocked (proxy) | exact names; `r/devops`, `r/github`, `r/ExperiencedDevs` for "merge queue" | Moderate | Weekly | exact-name match or ≥ 50 upvotes |
| Web alerts | Google Alerts `https://www.google.com/alerts` (blocked here); Bing/Brave/Kagi alerts; or a scripted WebSearch of `"mergeproof"`, `"merge-proof"`, `"merge proof" github`, `"merge-proof" ohcaygo` | search worked from the sandbox via the WebSearch tool | exact phrases, quoted | Low | Daily (alerts) / weekly (scripted) | any new domain in the top 20 |
| X / Bluesky / Mastodon | `https://x.com/search?q=mergeproof` (login-walled); `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=mergeproof` | blocked (proxy) | exact names | Low | Weekly | any post from an account with ≥ 1k followers or a vendor account |

Two repeat findings from today's queries worth keeping in the radar's seed list, because they are the nearest neighbours by wording rather than by name: `korovin-aa97/ci-evidence-gate` ("Exact-SHA, changed-surface CI evidence", attestation topic, 6★, 2026-08-29), `pascalkienast/understandproof` (37★, hosted, required check renamed to "UnderstandProof"), `rfedosov/mergereceipt`, `eissasoubhi/PRTruth`, `pasar6987/quiz-gate`, `gr8monk3ys/merge-gate` ("merged at the judged head"), Marketplace "Source Review Coverage" (in-toto attestation per merge) and "Receipt Gate".

## 7. Minimal script design (not built)

One Python file, `radar.py`, no framework, run weekly by a GitHub Actions cron (or `launchd` on the laptop), ~300 lines.

- `sources.yaml`: a list of `{id, kind, url_or_query, cadence, flag_rule}` entries. Kinds: `github_search`, `github_topic`, `marketplace_html`, `app_slug`, `npm_exact`, `npm_search`, `pypi_exact`, `pypi_rss`, `pypi_index_diff`, `crates_exact`, `dockerhub_search`, `rss` (changelogs, arXiv Atom, HN Algolia JSON treated as RSS-like), `web_search` (optional, via whichever search API Ryan has), `url_status` (App slugs, domains).
- `state.json`: for every source, the set of item IDs already seen (repo `id`, package name+version, feed GUID, HTTP status) and the last-run timestamp. First run seeds without alerting.
- Fetch layer: `requests` with a User-Agent, 15 s timeout, 1 retry, per-host politeness (GitHub search ≤ 1 req/6 s; PyPI simple index fetched at most weekly and cached with `ETag`). Every failure is recorded as "unreachable" in the digest rather than thrown, so a blocked host never hides the rest.
- Filter layer (the point of the script): an item is *material* if any of: new repo with stars ≥ 20; any repo whose owner is on the watchlist (Aryamanz29, genlayerlabs, yeagerai, korovin-aa97, pascalkienast); any new Marketplace listing in the watched result sets; any App slug or exact package name that flips 404→200; any changelog item matching `merge queue|required (status|check)|ruleset|bypass|approv|stale|attest|stacked`; any HN story ≥ 20 points or exact-name match; any PyPI/npm package whose name matches `merge.*(proof|receipt|evidence|gate|witness|attest)`.
- Output: `radar/YYYY-WW.md` with three sections — **Material** (passed a rule), **Unreachable** (sources that failed), **Seen but suppressed** (count only, expandable) — committed to a private repo, and optionally opened as a GitHub issue titled "Radar week NN" so it lands in notifications. No LLM in the loop; the rules are deterministic and inspectable, and the digest carries the URL and the rule that fired for every line.
- Cost: ~40 HTTP requests/week to GitHub search (well inside the authenticated 30/min), one 30 MB PyPI index download per week, everything else is single small requests. Zero paid services.

## 8. Weekly 15-minute review ritual

Monday, before product work, timer on:

1. (3 min) Open the digest. Read **Material** only. For each line decide: *ignore* / *watch* (add owner to watchlist) / *act* (open a task with the "why now" in one sentence).
2. (2 min) Read **Unreachable**. If a source has been unreachable two weeks running, fix or drop it; do not let the radar silently narrow.
3. (3 min) Manually open the two live neighbours: Aryaman's releases page and the Marketplace query `merge evidence`. Note any change to their check name, App status or pricing in one line.
4. (3 min) Run the four exact-name probes by hand once a week even though the script does them (`npm view mergeproof`, `pip index versions merge-proof`, `curl -I https://github.com/apps/merge-proof`, `dig +short mergeproof.dev`). Seeing a 404 with your own eyes is the point.
5. (2 min) Append one line to `docs/radar/LOG.md`: date, count of material items, one decision. If the decision is "rename", that line is where the cost table in section 3 gets re-estimated with real customer counts.
6. (2 min) Close the tab. Anything not acted on within the 15 minutes goes to the next week; the radar exists to prevent surprises, not to run the roadmap.

Monthly, add a 10-minute pass on the monthly-cadence sources (Devpost, Homebrew, trademark offices with the URLs in section 1) and re-run the candidate-name availability checks from section 4 so that a fallback name stays available if the decision ever flips.

## Sources (URL, date checked, reachable from sandbox)

| URL | Date | Reachable |
|---|---|---|
| https://api.github.com/repos/ohcaygo/merge-proof | 2026-09-19 | yes |
| https://api.github.com/search/repositories?q=mergeproof+in:name | 2026-09-19 | no (session-bound proxy); equivalent GitHub MCP search: yes |
| https://github.com/Aryamanz29/mergeproof and /releases and /pull/16 | 2026-09-19 | yes (fetch), 403 (curl) |
| https://raw.githubusercontent.com/Aryamanz29/mergeproof/main/README.md and CHANGELOG.md | 2026-09-19 | yes |
| https://github.com/marketplace/actions/mergeproof | 2026-09-19 | yes |
| https://github.com/marketplace/actions/merge-proof | 2026-09-19 | yes |
| https://github.com/marketplace?query=merge+proof ; ?type=actions&query=merge+evidence ; ?type=apps&category=code-review | 2026-09-19 | yes (fetch) |
| https://github.com/apps/mergeproof | 2026-09-19 | yes (private App "MergeProof") |
| https://github.com/apps/merge-proof | 2026-09-19 | 404 |
| https://raw.githubusercontent.com/bukacdan/MergeProof/main/README.md | 2026-09-19 | yes |
| https://registry.npmjs.org/merge-proof ; /mergeproof ; /@mergeproof/cli ; /-/v1/search?text=... | 2026-09-19 | yes |
| https://pypi.org/pypi/mergeproof/json ; /pypi/merge-proof/json ; /simple/ ; /rss/updates.xml ; /rss/packages.xml ; /rss/project/mergeproof/releases.xml | 2026-09-19 | yes |
| https://crates.io/api/v1/crates/mergeproof | 2026-09-19 | yes (404) |
| https://proxy.golang.org/github.com/aryamanz29/mergeproof/@v/list | 2026-09-19 | yes |
| https://hub.docker.com/v2/search/repositories/?query=mergeproof ; /v2/repositories/yeagerai/mergeproof-relay/ | 2026-09-19 | yes |
| https://rubygems.org/api/v1/gems/mergeproof.json | 2026-09-19 | yes (404) |
| https://formulae.brew.sh/api/formula/mergeproof.json | 2026-09-19 | no (proxy) |
| https://www.mergeproof.com/ ; https://mergeproof.org/ ; https://merge-proof.ohcaygo.com/ | 2026-09-19 | DNS yes; HTTP no (proxy); titles via web search |
| https://registry.modelcontextprotocol.io/v0/servers?search=merge | 2026-09-19 | yes via fetch; curl timed out |
| https://smithery.ai/ ; https://glama.ai/mcp/servers ; https://mcp.so/ | 2026-09-19 | no (proxy) |
| https://tsdr.uspto.gov/ ; https://tmsearch.uspto.gov/ ; https://euipo.europa.eu/eSearch/ ; https://www.ipo.gov.uk/tmcase/ ; https://branddb.wipo.int/ ; https://www.tmdn.org/tmview/ | 2026-09-19 | no (proxy) |
| https://github.blog/changelog/feed/ ; https://about.gitlab.com/atom.xml ; https://about.gitlab.com/releases/ ; https://openai.com/blog/rss.xml ; https://docs.anthropic.com/en/release-notes/overview | 2026-09-19 | no (proxy) |
| https://gitlab.com/gitlab-org/gitlab/-/releases.atom | 2026-09-19 | reachable, 404 (wrong path) |
| https://export.arxiv.org/api/query?... ; https://rss.arxiv.org/rss/cs.SE | 2026-09-19 | no (proxy) |
| https://hn.algolia.com/api/v1/search?query=mergeproof ; https://news.ycombinator.com/ | 2026-09-19 | no (proxy) |
| https://www.reddit.com/search.json?q=mergeproof ; https://old.reddit.com/r/devops/.json | 2026-09-19 | no (proxy) |
| https://devpost.com/software/search?query=mergeproof ; https://www.producthunt.com/search?q=mergeproof ; https://lobste.rs ; https://dev.to ; https://stackoverflow.com ; https://api.stackexchange.com ; https://x.com ; https://bsky.app ; https://public.api.bsky.app ; https://libraries.io/api/search ; https://www.google.com/alerts ; https://duckduckgo.com ; https://www.bing.com | 2026-09-19 | no (proxy) |
| https://docs.github.com/en/rest/search/search | 2026-09-19 | no (proxy); rate limits quoted from memory (10/min unauth, 30/min auth) |
| Web search results (WebSearch tool): "mergeproof"; "merge-proof" github app; "merge proof" github; "merge-proof" -ohcaygo -mergeproof; "MergeProof" trademark; Aryamanz29 mergeproof; mergeproof GenLayer; understandproof; HN/Reddit site: queries | 2026-09-19 | yes |
| https://www.mergeproof.com/ (title "MergeProof - Staked PR Review Protocol"), https://x.com/QueenMapa/status/2031089144760287614, https://github.com/acastellana/genlayer-ecosystem, https://trademarks.justia.com/867/82/merge-86782209.html | 2026-09-19 | seen only as web-search result snippets |
