# Signed queue owner resume — 2026-09-20

**Historical preflight.** The later owner-authorized temporary permission elevation and [final-candidate signed queue acceptance](signed-queue-final.md) supersede the pending live gate below. Read was restored; the production permission decision remains open.

Product candidate remains **`7953ecdbd849c8afe0379bfec1b4a61133292c62`**. All tracked runtime files were compared with that commit. This resume changes documentation only; the prior complete candidate regression/factory/model/reconstruction evidence remains applicable and is not substituted for live acceptance.

**Result: repository-selection gate closed; required policy-read preflight is NOT_PROVEN. Positive signed merge_group queue-to-landed acceptance did not start.**

The owner's open installation form contained exactly the approved two repositories, but a fresh settings page showed only the previously saved product repository. The pending form was saved without changing either selected name or any permission. GitHub confirmed the update, displayed exactly two selected repositories, and disabled Save. The temporary read-only comparison tab was closed.

Saved selection: `ohcaygo/merge-proof` and `ohcaygo/merge-proof-l3-lab-queue-headgreen`. There was no access expansion beyond this approved pair. No production repository endpoint or production content was accessed or mutated; the installation settings necessarily name the existing product selection.

## Actual development-App observations

| Observation | Live result |
| --- | --- |
| App and installation identity | App `4899448`, installation `160648161`; unchanged grants; merge_group subscribed |
| Fixture installation lookup | HTTP 200 for repository ID `1377343185`, replacing the earlier 404 |
| Installation token | HTTP 201; explicitly restricted to repository ID `1377343185`, Administration read and existing grants |
| Fixture identity using that token | HTTP 200; expected public repository and ID |
| Applicable Actions execution-policy discovery | **HTTP 403**, `Resource not accessible by integration` |
| GitHub accepted-permissions response header | **`administration=write`** |
| Product collector observation | `UNAVAILABLE / GITHUB_HTTP_403` |

The policy request was `GET /repos/ohcaygo/merge-proof-l3-lab-queue-headgreen/actions/policies?has_parents=true&per_page=100&page=1`, observed at `2026-09-20T17:01:44Z`. GitHub request ID: `DDE0:C55E:8DC6E93:1DDEFBAF:6AB01177`. [Sanitized machine evidence](signed-queue-owner-resume.json). GitHub's [Actions policies endpoint documentation](https://docs.github.com/rest/actions/policies#list-repository-actions-policies) is the provider reference returned with the denial.

The separate owner-token repository-list route also returned 403. That route was not used to infer the selection or substitute for App authorization: saved UI state established the exact pair, and the App's successful installation lookup/token/identity requests established actual access to the fixture. Earlier 422/404 failures occurred before saving the pending selection and do not describe the final repository-access state.

## Preserved acceptance boundary

The existing evidence-producer and policy-snapshot model requires observable applicable execution protections. Missing policy discovery cannot establish a positive execution claim. The unchanged v7 engine keeps those claims UNKNOWN and the required proof NOT_PROVEN. This is unavailable evidence, not a demonstrated failed policy condition; it is not a product FAIL verdict. The observed result is an access preflight, not a newly issued proof receipt.

No full queue runner was started. No new fixture branch, PR, ruleset, check, enqueue/dequeue, merge, receipt or signed delivery assertion was created by this resume. No owner/PAT policy snapshot was substituted for App-observed evidence. No rule was disabled, bypass introduced, permission increased, product semantics changed, or synthetic evidence supplied to obtain VERIFIED.

The isolated live runner remains pinned to `7953ecd`. It can proceed only when the required policy facts are readable under an authorized credential boundary. Ryan's current instruction keeps App permissions and scope fixed; the denial is therefore an explicit provider/permission validation gate, not authorization to request Administration write or skip policy discovery. No repeated repository-selection action is needed.

Organization-wide ruleset enforcement, positive coverage collection and production signing/publication/runtime gates retain their existing statuses in [the capability addendum](capability-addendum.md). No Level 3 scope was reduced and no full Level 3 completion is claimed.
