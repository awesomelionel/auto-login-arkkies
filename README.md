# Arkkies Auto Login

A small Cloudflare Worker that books the current Arkkies gym-access slot and unlocks the door. Each person types their own Arkkies username and password. The Worker uses those credentials, for that request only, to call `https://api.arkkies.com/v2` (cookie login), then discards them.

The page remembers your username, last gym, home gym, and the version of the Terms of Use you accepted, in the browser. It does not remember the password. Booking or opening a door requires that acceptance, and the page asks again when the terms version changes.

There is no shared access key. Nothing in this repository has to be set as a Worker secret or variable before the Worker will run. Deploying from GitHub Actions uses two GitHub secrets, described under [Deploy from GitHub](#deploy-from-github). The Worker does not read them.

The supported app is the Worker in [`worker/`](worker/). The Ruby / Chrome files at the repository root are an older version; see [Legacy app](#legacy-app).

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up). The free Workers plan is enough to try this.
- [Node.js 20](https://nodejs.org/) or newer (Wrangler 4 does not support older Node).
- An Arkkies account only when you actually book or unlock. The public gym list does not need one.

You do not need an Arkkies API key, a Cloudflare API token in the repo, or a shared password.

## Install and log in to Cloudflare

```bash
git clone https://github.com/awesomelionel/auto-login-arkkies.git
cd auto-login-arkkies/worker
npm install
npx wrangler login
```

`wrangler login` opens a browser and stores a credential on your machine, under your Wrangler config. It is not written into this repository. Confirm the account with:

```bash
npx wrangler whoami
```

If the browser on this machine cannot reach Cloudflare, use `npx wrangler login --callback-host 127.0.0.1` or create an API token in the dashboard and set `CLOUDFLARE_API_TOKEN` in your shell. Do not commit that token.

## Test

From `worker/`:

```bash
npm test
npm run typecheck
```

`npm test` does not call Arkkies. It uses fake HTTP responses, including ones that echo a password, and checks that the password, session cookie, and tokens do not appear in the Worker response or in `console.*` output.

## Run it locally

```bash
npx wrangler dev
```

Open the URL Wrangler prints, usually `http://127.0.0.1:8787/`. Loopback HTTP is allowed so local dev works. Any other host must use HTTPS; a credential POST over cleartext is rejected.

No `.dev.vars` file is required. If you create `worker/.dev.vars`, it is gitignored. Do not put an Arkkies password in it. See `worker/.dev.vars.example`.

## Deploy

From `worker/`, after you have read the code:

```bash
npx wrangler deploy --dry-run
npx wrangler deploy
```

`--dry-run` builds the Worker and prints what would be uploaded. It does not publish. `npx wrangler deploy` publishes to your Cloudflare account as a Worker named `arkkies-auto-login` (see [`worker/wrangler.jsonc`](worker/wrangler.jsonc)). That name is only unique inside your account. Deploying from your account does not replace someone else's Worker.

Wrangler may ask which account to use the first time. The config does not pin an account id or a zone id.

### Custom domain (optional)

Workers.dev hostnames are already HTTPS. To use your own hostname, put the DNS zone on the same Cloudflare account, then either:

- Dashboard: Workers & Pages → `arkkies-auto-login` → Settings → Domains & Routes → Add → Custom domain, or
- add a route to `worker/wrangler.jsonc` and deploy again:

```jsonc
"routes": [
  { "pattern": "gym.example.com", "custom_domain": true }
]
```

Use a hostname you control. Do not copy someone else's domain into your config. One running deployment of this project is `https://gymtime.linotan.com` on the Worker `arkkies-auto-login`; that is the maintainer's hostname, not part of the app you have to reuse.

## Deploy from GitHub

Pull requests run install, typecheck, `npm test`, and `npx wrangler deploy --dry-run` in `worker/`. That job uses no secrets, so it can run on a fork. A push to `main` (a merge) runs the same checks, then deploys, then smoke-tests the live URL. The deploy job is skipped unless the checks passed. You can also run the workflow by hand from the Actions tab (`workflow_dispatch`); choose the `main` branch, or it only runs the checks.

The smoke test is `GET /` (200 and the page), `GET /api/gyms` (200 and JSON), and `GET /api/status` (405). It does not log in to Arkkies. The URL is the repository variable `WORKER_PUBLIC_URL`, or `https://gymtime.linotan.com` when that variable is empty. If the smoke test fails, the job runs `wrangler rollback` to the previous stable version and fails. Deploys use the GitHub Environment `production` and a concurrency group so two deploys do not run at once.

Cloudflare Workers Builds can deploy this repository on every push to `main`, but that would publish even when tests fail. GitHub Actions is used so the tests gate the deploy.

### One-time setup

Do this once, before the first merge you want deployed. Do not commit the token or the account id, and do not paste them into a log.

1. In the Cloudflare dashboard, open [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → the **Edit Cloudflare Workers** template → **Use template**. The template's permissions are listed in [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/).
2. Under **Account Resources**, include only the account that owns the Worker `arkkies-auto-login`. Do not leave this on all accounts.
3. The template also grants **Zone** → **Workers Routes** → **Write**, which starts out on all zones. This Worker's [`worker/wrangler.jsonc`](worker/wrangler.jsonc) does not set `routes` or a custom domain. `gymtime.linotan.com` is already attached in the dashboard, and a script deploy does not change that route. Remove the zone permission. Add it back, limited to the `linotan.com` zone only, if you later put a `routes` or `custom_domain` entry in `wrangler.jsonc`. That permission is what lets Wrangler add or change a route. [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/) say that after a route or custom domain exists, deploying a new version needs Worker edit access only, as long as the deploy does not add, update, or remove that connection.
4. The template also includes Workers KV, R2, and Tail. This Worker uses none of them. You can remove **Workers KV Storage Write**, **Workers R2 Storage Write**, and **Workers Tail Read**. Keep **Workers Scripts Write**, **Account Settings Read**, **User Details Read**, and **User Memberships Read** so Wrangler can deploy and see the account.
5. Create the token and copy the secret once. It is shown only once.
6. On GitHub: **Settings** → **Environments** → **New environment**. Name it `production`. Do not add required reviewers if a merge should deploy by itself. Reviewers make each deploy wait for a person.
7. On that environment, add two **environment** secrets (not repository secrets, so pull request jobs never receive them):
   - `CLOUDFLARE_API_TOKEN`: the token from step 5.
   - `CLOUDFLARE_ACCOUNT_ID`: the account id. It is in the dashboard URL (`https://dash.cloudflare.com/<account-id>`) and in `npx wrangler whoami`. The workflow reads this secret. It is not written in `wrangler.jsonc`.
8. Optional: **Settings** → **Secrets and variables** → **Actions** → **Variables** → `WORKER_PUBLIC_URL`. Set it only if the smoke test should use a hostname other than `https://gymtime.linotan.com`.
9. Turn on Actions for the repository if it is off. Add a branch protection rule or ruleset for `main` that requires a pull request and requires the status check named `test` to pass. That check shows up in the list after this workflow has run on a pull request once. Do not require the `deploy` check. It does not run on pull requests, and a skipped required check can block merges.

If the first deploy fails because the secrets were missing, the previous Worker stays in place. Add the secrets and re-run the **Worker** workflow from the Actions tab on `main`.

## Terms of Use

`/terms` is the agreement for people using the running site. The checkbox on the form must be ticked before **Book & Open Door** or **Open Door**. The browser stores the accepted version in `localStorage` (`arkkies.terms`). Credential requests must send `acceptedTerms` set to the current version, or the Worker returns 400.

The text is a template, not legal advice. Have a lawyer review it before you rely on it. To publish a new version, edit `TERMS_VERSION` and `TERMS_EFFECTIVE_DATE` at the top of [`worker/src/terms.ts`](worker/src/terms.ts). The contact line is a placeholder (`[add an email address here]`). Replace it with a real address.

The repository [LICENSE](LICENSE) is the MIT License, copyright Lionel Tan. Its warranty disclaimer covers the code. The terms cover use of the website.

## Variables and secrets

None are required for the Worker to run, and this Worker does not read any. The GitHub secrets in [Deploy from GitHub](#deploy-from-github) are only for the deploy job.

`worker/wrangler.jsonc` has no `vars` and no KV, D1, R2, Durable Object, or service bindings. You do not run `wrangler secret put`.

An older revision of this Worker optionally checked an `ACCESS_KEY` query parameter. This version does not. If you previously set that secret, it is now unused. You can delete it with:

```bash
npx wrangler secret delete ACCESS_KEY
```

Leaving the old secret in place has no effect, because the code never reads `env`.

## What the page does

1. The gym dropdown is filled from Arkkies' public gym list. Product-only entries such as Ark+ are omitted.
2. You enter your Arkkies username and password, pick a gym, and tick **I agree to the Terms of Use**. The browser password manager can fill the username and password. Your home gym is detected from your subscription and is not shown as a destination.
3. **Book & Open Door** books the gym-access slot that contains the current time in Singapore, then unlocks the door. If a booking already covers now, it only unlocks. The form does not submit until the terms box is ticked.
4. **Open Door** unlocks the door for an existing booking at that gym. It uses the same terms check.

The form uses `method="post"`. JavaScript sends a JSON body. If JavaScript does not run, the browser still POSTs the form to `/api/book-and-open` instead of putting the password in the URL.

## Security and privacy

### How credentials are handled

- The password stays in the password field. `localStorage` stores four keys only: `arkkies.username`, `arkkies.destination`, `arkkies.home`, and `arkkies.terms` (the terms version you accepted). It does not store the password. When `TERMS_VERSION` changes, the stored version no longer matches and the box starts unticked.
- The browser sends the username and password in a POST body to `/api/status`, `/api/book-and-open`, or `/api/open-door`. Those routes reject any other method. If the URL contains a password, email, token, cookie, or similar parameter, the Worker refuses the request and, for the HTML page, redirects to the path with the query string removed. Do not put a password in a URL anyway: the address you requested can be retained by the platform before this code runs (see below).
- For that one request, the Worker keeps the password and the Arkkies session cookie in memory. It logs in to `https://api.arkkies.com/v2`, books or unlocks, and then drops both. The cookie jar is not shared across requests.
- The Worker does not write the password, session cookie, or login token to Workers KV, D1, R2, Durable Objects, or the Cache API. There are no such bindings. The Cache API is used only for the public gym catalog (`https://arkkies.com/app.bundle.js` and `https://api.arkkies.com/v2/brand/outlet`).
- Responses are built by this Worker. Arkkies `Set-Cookie` headers are not copied onto your browser.
- The page and every API response send `Cache-Control: no-store`.
- The Worker does not call `console.log` (or the other console methods) with request data. Upstream error bodies are not copied into the JSON we return. Messages are limited to short text from Arkkies, with the submitted password, email, cookie values, and login `flow` id removed when they appear. A non-JSON upstream body is replaced with `Arkkies returned <status>.`
- Credential routes refuse the request unless the URL is `https:`, or the host is loopback for `wrangler dev`.

### What Cloudflare can see

Be precise about this. "The Worker does not store your password" is not the same sentence as "Cloudflare cannot see your password."

- Cloudflare terminates TLS for `*.workers.dev` and for custom domains on Cloudflare. The Worker runs on Cloudflare's machines and handles the plaintext request in memory for the duration of that request. That is how every Worker works. Cloudflare, as the platform operator, is not limited to the log fields documented below.
- Whoever deploys the Worker can change the code so that it logs or stores passwords. If you use a deployment you did not build, you are trusting that person. Deploy it yourself if you want the code you have read to be the code that runs.
- Arkkies receives your username, password, and session, the same as if you had used the Arkkies website.
- This config turns on [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and [Workers Traces](https://developers.cloudflare.com/workers/observability/traces/) for every request (`head_sampling_rate` 1). Logs are kept for 3 days on the free plan and 7 days on the paid plan, per [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

What those products document capturing:

- **Invocation logs** include the HTTP method and the full URL, plus status and timing. A password in a query string would be in that URL. This page avoids putting credentials there, but the platform records the URL the client actually requested.
- **Traces** record span attributes listed in [Spans and attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/). For the incoming request and for outbound `fetch`, that includes `url.full` and, on outbound fetch, `url.query`, status, and body **size**. The documented fetch attributes include a few headers (`content-type`, `accept`, `accept-encoding`), not `Cookie` and not `Authorization`. They do not include the request or response body. The outbound login URL contains a short-lived Ory `flow` id in the query string, so that id can appear in traces. The password is in the POST body, which is not one of those attributes.
- **`console.*` and uncaught exception messages** are stored in Workers Logs. This Worker does not log bodies, and it catches errors and returns a redacted JSON message instead of letting the raw upstream body become an uncaught exception. If you later add `console.log` of the request, that output will be stored. Do not do that.
- **`wrangler tail` and Tail Workers** receive the triggering request's method, URL, and headers, plus console output and uncaught exceptions. They do not receive the request body. Cookie and authorization-style headers are redacted by default; a Tail Worker can call `getUnredacted()` and then see them ([Tail Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/)). This Worker does not attach a Tail Worker (`tail_consumers` is unset). The incoming request does not carry the Arkkies session cookie; that cookie is only on the outbound call to Arkkies.
- **Workers Trace Events Logpush** is a separate job you would create in the dashboard. It is not configured here. If you enable it, it exports the same trace events (metadata, console lines, exceptions), not a copy of POST bodies.
- **Zone HTTP request logs** (Logpush dataset `http_requests`), if you turn them on for a custom domain, are also separate. That dataset does not include POST bodies. Some optional fields include cookies; leave those off.

Your browser's password manager may store the password on your device. That storage is outside this Worker.

## Legacy app

The repository root still contains the previous Selenium + Ruby app: `app.rb`, `views/`, `Dockerfile`, `Gemfile`, and `Gemfile.lock`. Pull request #1 replaced an earlier script with that Cloud Run / "docker-chrome" version. It drives a headless Chrome against arkkies.com. It is not what `wrangler deploy` publishes, and it is not maintained alongside the Worker.

The git branch `gcp` (not contained in `main`) has an earlier Cloud Run layout (`arkkies.rb`, `deploy.sh`, `check.rb`). Historical revisions read `EMAIL` and `PASSWORD` from the process environment at runtime. They are not the supported path. Do not build the root `Dockerfile` for this project.

## Project layout

```
worker/                 Cloudflare Worker (use this)
  wrangler.jsonc        Worker config. No bindings, no secrets.
  src/                  Request handler, Arkkies client, page, terms
  test/                 Unit tests, including credential redaction and terms
.github/workflows/worker.yml
                        Pull request checks, and deploy from main
LICENSE                 MIT License
app.rb, views/, Dockerfile, Gemfile
                        Legacy Chrome automation. Do not deploy.
```
