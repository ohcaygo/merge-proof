# Independent review and resolution

Reviewed candidate: `134f9bb59901012a62c61a8229184c2c7ef4150b`, against research base `41ce845ed61b1a442ad548d91e9ca75d414496d3`.

One independent read-only review returned **CHANGES REQUIRED** with five findings. The reviewer reproduced the first three in local fixtures and made no repository or external edits. The following fixes were then implemented by the primary agent and tested; no second broad review or independent approval of the resolution commit is claimed.

| Finding | Resolution | Regression evidence |
| --- | --- | --- |
| P1: bare-mirror `info/attributes` could turn a conflict into a falsely uncaveated tree | Reject nonempty mirror attributes, disable system attributes and override user/local attribute files | Conflicting merge with `merge=union` in mirror attributes refuses a tree; external attribute file cannot alter it |
| P1: unchanged six-hour reconciliation creates duplicate receipts and exhausts capacity | Fully collect and compare existing bindings even for ALL claims; retain unchanged receipts and update reconciliation time | Three unchanged full reconciliations retain one immutable receipt; changed reviews still produce a RECONCILED successor |
| P1: CLI/MCP trusted truthy proceed despite contradictory/missing fields | Validate the complete response, exact caller request, subject/tree/authorization bindings, SHA guard, and outcome/verdict/currentness agreement | Contradictory HOLD/PROCEED, stale state, wrong subject/request/guard and missing fields fail closed |
| P2: engine digest omitted common.js | Include common.js and reconstruction code; regenerate this unpublished archive | Packaged verifier selects frozen logic after a simulated future common.js change |
| P2: optional supplied-object Git verification missing | Add --git-dir/--git-binary, pinned offline tree/relationship/expected-tree checks, no lazy fetch, explicit incomplete/mismatch states | Real local Git objects recompute; false expected tree diverges; missing candidate/group objects and wrong binary pin remain unavailable |

Validation was run with Node `v24.12.0` and Git `2.50.1 (Apple Git-155)`. The Git executable is SHA-256 pinned in each reconstruction fixture. Linux/static production equivalence and hosted/provider-backed acceptance were not run.

- Full GitHub suite: 266/266, including 20 recorded synthetic captures and 1,000 seeded sequences.
- Affected chain suite after the final missing-ancestry-object refinement: 19/19.
- Existing factory suite: 37/37.
- Local CLI: 26/26; report suite: 9/9.
- Packaged CLI: unsigned rejection, explicit unsigned consistency, frozen-engine compatibility after a common dependency change, single-tool MCP and gh shim all passed.
- `git diff --check` passed before the resolution commit.

All evidence is local. Synthetic bypass and landing tests do not claim a real GitHub bypass or production landing. No production signing key, external anchor, deployment or new lab account was created. Production signing/public anchoring and live lab/provider acceptance retain the owner gates in `github/FINAL-FRONTIER.md`.
