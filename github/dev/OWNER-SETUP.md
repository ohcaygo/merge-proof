# Development App setup and single live acceptance

This is development only. No production endpoint, pricing, Stripe, repository
rules, required-check setting or main-branch merge is part of this procedure.
Use one **public, owner-controlled development PR in `ohcaygo/merge-proof`**.
Install only on that repository, never all repositories. This uses the existing
repository without introducing another repository provisioning gate. Only use
public test text; no customer data. The locally running candidate supplies the
App implementation; the PR does not need to contain the implementation.

## 1. Local configuration (terminal, from the candidate checkout)

Node 18 or newer is required. Keep the private configuration outside the checkout.
These are the actual environment names consumed by the implementation:

```sh
export MP_GITHUB_APP_CONFIG="$HOME/.config/merge-proof-dev/app.json"
export FACTORY_STATE_DIR="$HOME/.config/merge-proof-dev/state"
export FACTORY_ORIGIN=http://127.0.0.1:4318
export FACTORY_HOST=127.0.0.1
export PORT=4318
node - <<'JS'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
fs.mkdirSync(path.dirname(process.env.MP_GITHUB_APP_CONFIG), {recursive:true, mode:0o700});
fs.writeFileSync(process.env.MP_GITHUB_APP_CONFIG, JSON.stringify({
  appId: null, privateKey: null,
  webhookSecret: crypto.randomBytes(32).toString('hex'), publishChecks: true
}, null, 2), {flag:'wx', mode:0o600});
JS
```

The creation command deliberately refuses to overwrite existing credentials.
Open this local file in an editor and copy only `webhookSecret` into GitHub's
secret field below. Do not paste configuration, keys or tokens into chat or Git.
The secret is mandatory (at least 32 characters); this generates 64 random hex
characters. The App private key and webhook secret are different secrets.

## 2. Development webhook ingress

Use GitHub's documented Smee development relay: open <https://smee.io>, click
**Start a new channel**, and retain that exact channel URL. This relay is for
public development payloads only: channels are not authenticated/private. Do
not send private repository events through it. The local receiver still verifies
the GitHub signature; never disable that check.

Run the Smee CLI command shown on the channel page, setting its target to:

```sh
npx --yes --package=smee-client smee --url 'YOUR_EXACT_SMEE_CHANNEL_URL' --target http://127.0.0.1:4318/proof/webhook
```

This temporary developer utility is not a verifier dependency. Keep the relay
running only during acceptance. Webhook URL in GitHub is the exact Smee channel
URL, **not** the localhost target. Keep SSL verification enabled. Smee does not
host receipts; the receipt server remains local. Optional GitHub check links to
localhost are usable on Ryan's development machine only.

Source: [GitHub development webhook guidance](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps).

## 3. Register the App (Ryan's GitHub owner session)

Open `ohcaygo` organization Settings → Developer settings → GitHub Apps → New
GitHub App (organization registration allows an account-only installation on
`ohcaygo/merge-proof`). Fill in:

| Field | Value |
|---|---|
| App name | `OHCAYGO Merge Proof Dev` (append a short unique suffix only if taken) |
| Homepage URL | `https://github.com/ohcaygo/merge-proof` |
| Callback URL | Leave blank; no user OAuth flow is implemented |
| Request user authorization (OAuth) during installation | Unchecked |
| Enable Device Flow | Unchecked |
| Expire user authorization tokens | Leave default enabled; unused |
| Setup URL / Redirect on update | Blank / unchecked |
| Webhook Active | Checked |
| Webhook URL | Exact Smee channel URL from step 2 |
| Webhook secret | Generated `webhookSecret` from the private local file |
| SSL verification | Enabled |
| Where can this App be installed? | Only on this account |

Repository permissions (exact token exchange names in parentheses):

| Permission | Setting | Reason |
|---|---|---|
| Metadata | Read-only, implicit | Repository identity |
| Contents (`contents`) | Read-only | Commit/ref/compare metadata |
| Pull requests (`pull_requests`) | Read-only | PR/review state |
| Commit statuses (`statuses`) | Read-only | Status evidence |
| Actions (`actions`) | Read-only | Run/job/step evidence |
| Administration (`administration`) | Read-only | Branch protection and rules |
| Checks (`checks`) | Read & write with `publishChecks: true`; otherwise Read-only | Optional receipt check delivery |

No organization or account/user permissions. Leave every other repository
permission at No access. Do not enable Contents write, Administration write,
Workflows write, secrets access, user OAuth or device flow. Do not make Merge
Proof a required check or change any repository rule for this test.

Subscribe to these event names (GitHub UI may display words with spaces):
`pull_request`, `pull_request_review`, `check_run`, `check_suite`, `status`,
`workflow_run`, `push`, `merge_group`, `repository_ruleset`,
`branch_protection_rule`, `branch_protection_configuration`, `member`, `team`, `membership`, `organization`, `delete`, `repository`. Ping needs no subscription.

Create the App. On its General page copy **App ID** (not Client ID) into `appId`.
Generate/download one private key. Import the PEM into the same config without
printing it (replace only the downloaded file path argument):

```sh
node - '/absolute/path/to/downloaded-private-key.pem' <<'JS'
const fs = require('node:fs');
const file = process.env.MP_GITHUB_APP_CONFIG;
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!/^[1-9][0-9]*$/.test(String(c.appId))) throw Error('Set appId first');
c.privateKey = fs.readFileSync(process.argv[2], 'utf8');
require('node:crypto').createPrivateKey(c.privateKey);
fs.writeFileSync(file, JSON.stringify(c, null, 2), {mode:0o600});
fs.chmodSync(file, 0o600);
JS
```

App ID becomes the JWT issuer in `github/app.js`; the private key signs that
short-lived authentication JWT. Client ID and client secret are not consumed.
No `GITHUB_APP_ID`/`GITHUB_PRIVATE_KEY` environment variables exist in this code.
**`MP_GITHUB_APP_CONFIG` is a file path**, not JSON or a key.

Start the existing server with no payment credentials or existing live config:

```sh
env -u FACTORY_CONFIG -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET \
  -u STRIPE_PAYMENT_LINK_ID -u STRIPE_PRICE_ID node factory/server.js
```

Keep this terminal running. Default factory mode is test; state goes only to the
new `FACTORY_STATE_DIR`. No Stripe configuration is needed. Server and relay must
be running before opening the test PR. Check `http://127.0.0.1:4318/proof/` loads.

Install App → choose `ohcaygo` → **Only select repositories** → `merge-proof`.
Installation ID appears in GitHub's installation configuration URL and in signed
events as `installation.id`. **Do not configure a separate Installation ID env
variable**: `github/service.js` consumes that event field, stores it with the PR
subscription, and requests a token scoped to that one repository ID. Tokens are
kept in memory, not written to receipts or logs.

Source: [GitHub registration fields](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).

## 4. One live PR, then one legitimate head change

1. From GitHub's normal UI, create branch `dev/merge-proof-app-acceptance` **from
   main**, add `merge-proof-dev-acceptance.txt` containing `Development acceptance
   state 1`, commit to that branch, and open one draft PR into main. Do not merge.
   This is separate from the product candidate PR. Do not use a customer branch.
2. In App Settings → Advanced → Recent deliveries, find the `pull_request`
   **opened** event. Confirm its repository/PR/head and `installation.id`, a
   `X-Hub-Signature-256` header, and successful relay delivery. Retain its
   `X-GitHub-Delivery` ID. Relay success alone is not application acceptance.
3. The queue runs every 5 seconds; a collection is bounded to 120 seconds and
   failed jobs get at most three attempts. Wait until the App receipt exists.
   From a second terminal export the same environment values from step 1. Run:

   ```sh
   node github/dev/acceptance.js before ohcaygo/merge-proof PR_NUMBER OPENED_DELIVERY_ID "$HOME/.config/merge-proof-dev/acceptance-1"
   ```

   Replace PR number and delivery ID with the real values. If collection is still
   pending, wait and retry; do not fabricate a receipt. The observer obtains a
   scoped installation token itself, tests authorized HTML/JSON retrieval and
   anonymous denial, checks unsigned webhook rejection, and saves the original
   receipt plus both saved and delivered currentness. Optional check publication
   must exist on the exact receipt head if enabled. It prints no credentials.
4. Edit the same test file on the same development branch to `Development
   acceptance state 2` and commit through GitHub. This deliberately changes head.
   A documentation-only commit exercises head-change invalidation without changing verifier behavior.
   In Recent deliveries retain the new `pull_request` **synchronize** delivery ID
   and new head. Wait for automatic re-proof, then run:

   ```sh
   node github/dev/acceptance.js after ohcaygo/merge-proof PR_NUMBER SYNCHRONIZE_DELIVERY_ID "$HOME/.config/merge-proof-dev/acceptance-1"
   ```

5. The observer must establish: both actual delivery IDs were accepted by the
   signature-verifying handler; the original receipt is byte-equivalent as JSON
   and its verdict unchanged; original currentness is STALE; a new receipt has a
   different head and fingerprint for the same repo/PR; authorized HTML/JSON
   still match; the new optional check belongs to this App and current head.
   It saves `before.json/html` and `after.json/html` privately. Match these IDs and
   heads to the GitHub delivery UI. An observer success is not independent proof
   of GitHub origin without this actual delivery evidence.
6. Inspect receipt gaps. NOT_PROVEN may correctly report missing approvals,
   unavailable rules, protected boundaries or no required checks. Do not weaken
   rules to obtain VERIFIED. A saved receipt view deliberately reports currentness
   UNAVAILABLE until refresh; that is separate from the saved historical verdict.
   A changing or incomplete collection is not a completed strongest-proof test.
7. Record live verdict and gaps honestly. Close the development PR without merging,
   stop the server and relay. Keep evidence; do not delete prior receipts. No
   production or customer data should have entered this run.

Public sharing is opt-in via `/proof/`; App-produced receipts are intentionally
unpublished, even for public repositories. Private browser OAuth is absent.
The observer supplies a transient authorized bearer internally. Its HTML exports
are local inspection artifacts, not anonymous public permalinks. Existing tests
cover private repository denial and public-to-private visibility changes; this
single live run does not claim private-customer or merge-queue acceptance.

## What is not already proven

This packet and observer are prepared engineering artifacts. Registration,
installation, real signed delivery, live token exchange, optional live check
publication and the two-state acceptance are **not yet performed**. Unit tests
of observer assertions are not live acceptance. PDF/Chrome is unrelated to this
HTML/JSON path and remains a separately recorded baseline limitation.
