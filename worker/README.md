# Arkkies Auto Login (Cloudflare Worker)

A small Cloudflare Worker that replaces the Selenium / Cloud Run "docker-chrome" app. It talks to the Arkkies API directly: log in, list gyms from your pass, book the current gym-access slot if needed, and unlock the door.

Credentials are sent with each request and are not stored. The Worker logs in again every time. Nothing in this folder should ever contain your password, cookies, or a HAR file.

## What the page does

1. Open the Worker URL and enter your Arkkies username and password.
2. After login, **Home gym** is preselected from your pass (for example Ark Grit • Bishan). **Gym to go to** lists every gym your pass allows, with names from Arkkies' own site catalog.
3. **Book & Open Door** books the slot that contains the current time (SGT) at the gym you picked, then unlocks that gym's door. If you already have a booking covering now, it skips booking and just unlocks.
4. **Open Door** reopens the door for an existing booking at that gym. If you don't have a booking right now, it says so instead of inventing a success.

Errors from Arkkies are shown with the HTTP status and a short message.

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

`POST /api/status` is read-only: it logs in and returns your gyms plus the current slot and booking for the chosen destination. It never books or unlocks.

## Deploy

From this `worker/` folder, after reviewing the code:

```bash
npx wrangler deploy
```

Do not deploy until you have tried it locally, including one real **Book & Open Door** / **Open Door** press you are happy with. The old Cloud Run service at `docker-chrome-486268287842.asia-southeast1.run.app` can be deleted after this Worker is proven in production.

## ACCESS_KEY

Optional but recommended. If the `ACCESS_KEY` Worker secret is set, every request (including the page) must include `?key=...`. The page reads that query parameter and passes it through to the API calls.

Set it in production with:

```bash
npx wrangler secret put ACCESS_KEY
```

Wrangler will prompt for the value; do not put it in `wrangler.jsonc` or commit it. For local dev only, you can add `ACCESS_KEY=...` to a gitignored `.dev.vars` file (see `.dev.vars.example`). If the secret is unset, the Worker is open and does not require a key.

## API notes

- All Arkkies calls go to `https://api.arkkies.com/v2` with browser `Origin` / `Referer` headers.
- `x-ark-outlet` is your **home** gym and is required on the subscription, slots, and booking endpoints. A missing header returns an error; sending a different gym can return an empty subscription list, so the Worker discovers the home gym by probing the public outlet list when it is not already known.
- The destination gym is in the slots URL path. Booking records use `booking.outlet_id` for the home gym and `booking_slot.outlet_id` for the destination.
- The booking body uses `booking_slot_id` = `selections[].slot.id`, not `selections[].id`.
- Door unlock is `PUT /brand/outlet/door/unlock` with `{ "door_id": "AGRBSN01-D01" }` and no `x-ark-outlet` header, matching the captured site traffic.
