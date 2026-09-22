# Merge-Proof — Early Access campaign (live tracker)

**Authority:** Operational tracker for the ~20-tester Early Access cohort. Updated as prospects move through stages. Not a claims document — see [CLAIMS.md](./CLAIMS.md) for what may be said publicly, [OFFER.md](./OFFER.md) for the commercial offer, [STATUS.md](./STATUS.md) for verified production state.

**Ownership split:** Grok owns X/Twitter radar, prospect discovery, and drafting/posting replies. This file is where prospects get qualified, prioritized, allowlisted, and tracked through the 10-day feedback cycle. Do not post to X from this file's contents without Grok/Ryan's outreach lane — this is tracking and process, not a reply queue.

## Qualification bar (recap)

Prioritize: agent-heavy developers (Claude Code/Codex/Cursor/Copilot or multi-agent workflows), AI-native founders/CTOs, small agent-heavy teams, high-PR-volume teams, release/platform/DevOps engineers, skeptical senior engineers fluent in Git/GitHub internals. Not a vanity-signup funnel — every invite should be someone likely to give a real, checkable answer to the ten questions below.

## Invitation batch — prioritized

Status values: `IDENTIFIED` (warm signal, not yet contacted with real link) → `INVITED` (real EA link sent/posted) → `INSTALLED` (App installed, GitHub ID known) → `ALLOWLISTED` (10-day term active, verified live) → `IN_FEEDBACK_WINDOW` → `COMPLETE`.

| # | Handle/name | Source | Technical signal (verified from thread, not invented) | Status | Real GitHub ID | Next action |
|---|---|---|---|---|---|---|
| 1 | `@sam26880` (Saumil Shah) | X reply, `research/grok-inbox/README.md` | Described a real production bug: a settings screen kept a saved green "validated" state after what it validated against changed underneath it — the check never re-ran. This is close to exactly Merge-Proof's stale-evidence thesis, in his own words, unprompted. | **INVITED** — `@OHCAYGO` already publicly replied with the real `merge-proof.ohcaygo.com/early-access` link (~2 min old at time of writing, 2026-09-22) | Not yet known — do not guess | Watch for his install (App install event / support inbox / a reply). Once he installs, resolve his real GitHub installation-owner ID from the actual installation record (see process below) — never from his X handle. |
| 2 | `@anrayama` (Anra) | X reply, `research/grok-inbox/README.md` | Made a precise technical distinction: "git says equivalent, runtime says otherwise" — argued for asserting on observable behavior (exit codes, side effects, emitted events) over textual diff equivalence. Exactly the skeptical-senior-engineer profile this cohort wants. Thread also includes `@melissapan` as a third participant worth reading before reaching out to her separately — not yet qualified, do not invite yet. | **IDENTIFIED** — no real invite posted yet on this thread as of 2026-09-22 | Not yet known | Next real action: reply/DM with the real `https://merge-proof.ohcaygo.com/early-access` link (Grok's lane) or have Ryan send it directly. Keep the reply technical, not a pitch — she engaged on the *how*, not the *buy*. |
| 3+ | *(open slots, ~18 remaining)* | Grok's ongoing X radar per `research/grok-inbox/` | — | — | — | As Grok surfaces new warm technical engagement, add a row here with the same qualification bar before sending a real invite. Do not batch-invite a list of handles without a verified technical signal each. |

**Rule for adding rows:** only add a prospect here with a real, checkable signal — a quote, a thread link, a specific technical claim they made. Do not invent engagement or reply content. If Grok's inbox only has a handle and no substance, it's not ready for this table yet.

## Allowlisting process (low-friction, per confirmed tester)

1. Tester installs the App via `https://merge-proof.ohcaygo.com/early-access` → `/proof/` → GitHub OAuth → install, scoped to whichever repositories they choose.
2. Get their **real GitHub installation-owner account ID** — never guess it. Two reliable sources, in order of preference:
   - If they reply/DM with their GitHub username, resolve it via `https://api.github.com/users/<login>` → `id` field (works for personal-account installs; this is what was done for `thatguyrw-boop` → `249527096`).
   - For an organization install, the owner ID is the **organization's** ID, not the installer's — verify via the installation record, not the person's own user ID.
3. SSH to the production host and add the ID to `invitedTesterAccountIds` in `/etc/merge-proof/pro.json`, then restart the `merge-proof` service to load it (exact commands are in `STATUS.md`'s verified process — this is a real production config change and should go through the same care as the first cutover, not be treated as routine once cohort size grows).
4. Confirm live: their account view or a fresh receipt should read "Your 10-day report-only trial expires at …", not "seven-day"/"7-day". That's the same live confirmation used for tester #1.
5. Update this file's row to `ALLOWLISTED` with the real ID and the date.

Do not widen the allowlist to "all installs" to save steps — that defeats the point of a controlled, learnable cohort.

## 10-day tester feedback process

**Day 0 (install/allowlist):** confirm the 10-day term is showing correctly (step 4 above). Send a short, human, non-salesy welcome: what Merge-Proof is *not* (not a reviewer/scanner/CI replacement), what it *is* (does the evidence still belong to the exact candidate landing, and is it current), and that honest "didn't catch anything" or "this got in my way" feedback is exactly what's wanted.

**Day 3 check-in (async, one message):** "Did it install cleanly? Have you gotten a first proof yet? Anything confusing about VERIFIED/NOT_PROVEN/STALE so far?" — this is where onboarding friction shows up before it's too late to fix for the rest of the cohort.

**Day 8–9 survey (the real instrument):**

1. Did you install it, and did it stay installed?
2. Did you reach a first proof without asking for help?
3. Do you understand what VERIFIED / NOT_PROVEN / STALE each mean, in your own words?
4. Did the exact-candidate / currentness distinction solve a problem you actually recognized — or was it academic?
5. Did Merge-Proof catch or explain something you found valuable? Be specific — what state, what evidence gap.
6. Would you leave it installed after today, if nothing else changed?
7. Would you pay $29/month for this, for your own repos?
8. If not $29 — what price, or what would need to be true, for this to be worth paying for?
9. What would make removing Merge-Proof feel irresponsible — i.e., what's the thing it would need to be catching/guaranteeing for you to miss it?
10. What got in your way — onboarding, permissions, UI, trust, something else?

**Day 10:** allowlisted term ends. Record final state (still installed? uninstalled? converted to paid interest?) and close out the row in the batch table above as `COMPLETE`, with a one-line summary of the answers to 6–9 (the ones that actually predict retention/willingness-to-pay).

## Distinguishing useful feedback from out-of-lane requests

Useful, in-lane: anything about onboarding friction, verdict clarity, whether the exact-candidate/currentness idea lands, missing evidence they expected covered, false confidence they caught, pricing/value mismatch, trust signals.

Out-of-lane (log it, don't build it): requests to make Merge-Proof review code quality, scan for vulnerabilities, replace CI, become a dashboard, auto-fix things, or manage/orchestrate their coding agents. The product's whole positioning is that it deliberately does *not* do those jobs — see `PRODUCT.md`/`CLAIMS.md`. A tester asking for one of these is itself a useful data point (where do people *want* to stretch the product) but is not something to promise or build mid-cohort.

## Positioning reminder for any reply in this campaign

> Testing/review tells you something about a change. Merge-Proof establishes whether the evidence still belongs to the exact currently authorized candidate being merged — and whether the proven content is what ultimately landed.

Not "better AI review." Not Level 3 certified (do not say this). Keep it narrow — that's the pitch, not a hedge.
