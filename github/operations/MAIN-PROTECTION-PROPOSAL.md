# `main` protection proposal

Status: **proposal only; not applied**.

## Current provider truth

Fresh GitHub read on 2026-10-05:

- Classic branch protection for `main`: absent (`GET /branches/main/protection` returned 404 `Branch not protected`).
- Active ruleset `23000277`, `Merge assurance temporary acceptance`, applies only to `codex/merge-assurance-acceptance-base` and `codex/ruleset-only-acceptance-base`.
- Disabled ruleset `23717603`, `L3 isolated signed queue fixture`, applies only to `l3-signed-queue-fixture-20260920`.
- Therefore no current protection or ruleset applies to `main`.

## Minimal proposed policy

The exact proposed payload is [`proposals/main-ruleset.json`](proposals/main-ruleset.json). It would:

1. target only the default branch (`main`);
2. require changes to arrive through a pull request;
3. require all nine exact-main GitHub Actions jobs observed passing in run [`36636089735`](https://github.com/ohcaygo/merge-proof/actions/runs/36636089735);
4. require the PR branch to be current with `main` before merge;
5. block force-pushes/non-fast-forward updates;
6. block deletion of `main`;
7. require review conversations to be resolved.

The minimal proposal requires **zero approving reviews**. This enforces a reviewable PR and exact CI without inventing a second-human gate for a solo-maintainer Early Access repository. Independent-review requirements remain candidate/task-specific and are not silently converted into GitHub reviewer policy.

## Admin bypass decision

Recommendation: **no standing admin bypass** (`bypass_actors: []`). Admins should be subject to the same PR, CI, force-push, and deletion rules. An owner with repository administration can still deliberately edit or disable the ruleset for an emergency, producing a provider-visible policy change; that is preferable to an invisible permanent bypass.

## Exact command — not run

```sh
gh api \
  --method POST \
  repos/ohcaygo/merge-proof/rulesets \
  --input github/operations/proposals/main-ruleset.json
```

After separate Ryan approval, read back the returned ruleset, verify `main` matching, and exercise one disposable PR before treating protection as operationally accepted. This task did not create, update, enable, or disable any GitHub policy.
