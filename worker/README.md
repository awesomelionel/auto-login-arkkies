# Arkkies Auto Login (Cloudflare Worker)

A small Cloudflare Worker that replaces the Selenium / Cloud Run "docker-chrome" app. It talks to the Arkkies API directly: log in, list gyms, book the current gym-access slot if needed, and unlock the door.

Credentials are sent with each request and are not stored on the server. The Worker logs in again every time. The page remembers your username, last destination, and detected home gym in `localStorage`. It never stores your password. Nothing in this folder should ever contain your password, cookies, or a HAR file.

## What the page does

One screen, no separate login step:

1. Open the Worker URL. The **Gym to go to** dropdown is filled from Arkkies' public gym list (`GET /api/gyms`). Product-only entries such as Ark+ are omitted.
2. Enter your Arkkies username and password (the browser password manager can fill these) and pick the gym you want to go to. Your home gym is detected automatically and is not shown.
3. **Book & Open Door** books the slot that contains the current time (SGT) at that gym, then unlocks the door. If you already have a booking covering now, it skips booking and just unlocks.
4. **Open Door** reopens the door for an existing booking at that gym. If you don't have a booking right now, it says so instead of inventing a success.

If the gym you picked is not on your pass, the Worker returns a clear error. The button you pressed shows a progress state, and the result or error includes the slot time in SGT when one was found.

## Local development

```bash
cd worker
npm install
npx wrangler dev
```

Then open the printed local URL (usually `http://127.0.0.1:8787/`).

Useful checks:

```bash
npm test
npm run typecheck
```

`GET /api/gyms` is unauthenticated (except the optional `ACCESS_KEY`) and only reads the public outlet catalog. `POST /api/status` is read-only: it logs in and returns your home gym plus the current slot and booking for the chosen destination. It never books or unlocks.

## Deploy

From this `worker/` folder, after reviewing the code:

```bash
npx wrangler deploy
```

Do not deploy until you have tried it locally, including one real **Book & Open Door** / **Open Door** press you are happy with. The old Cloud Run service at `docker-chrome-486268287842.asia-southeast1.run.app` can be deleted after this Worker is proven in production.

## ACCESS_KEY

Optional but recommended. If the `ACCESS_KEY` Worker secret is set, every request (including the page and `/api/gyms`) must include `?key=...`. The page reads that query parameter and passes it through to the API calls.

Set it in production with:

```bash
npx wrangler secret put ACCESS_KEY
```

Wrangler will prompt for the value; do not put it in `wrangler.jsonc` or commit it. For local dev only, you can add `ACCESS_KEY=...` to a gitignored `.dev.vars` file (see `.dev.vars.example`). If the secret is unset, the Worker is open and does not require a key.

## API notes

- All Arkkies calls go to `https://api.arkkies.com/v2` with browser `Origin` / `Referer` headers.
- The public gym dropdown is filled without an Arkkies login. `GET /brand/outlet` actually requires a session today (it returns 401 when logged out), so `/api/gyms` uses the public `app.bundle.js` catalog, with a bundled snapshot as fallback. If the outlet API starts working without auth, the Worker will prefer it.
- `x-ark-outlet` is your **home** gym and is required on the subscription, slots, and booking endpoints. A missing header returns an error; sending a different gym can return an empty subscription list, so the Worker discovers the home gym by probing the public outlet list when the page has not yet remembered it. After the first successful request, the page sends the remembered home gym so discovery can be skipped.
- The destination gym is in the slots URL path. Booking records use `booking.outlet_id` for the home gym and `booking_slot.outlet_id` for the destination.
- The booking body uses `booking_slot_id` = `selections[].slot.id`, not `selections[].id`.
- Door unlock is `PUT /brand/outlet/door/unlock` with `{ "door_id": "AGRBSN01-D01" }` and no `x-ark-outlet` header, matching the captured site traffic.
