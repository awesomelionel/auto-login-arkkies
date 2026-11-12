#!/usr/bin/env node
/**
 * Live read-only check against a local wrangler dev server.
 * Usage: node scripts/readonly-check.mjs <har-path> [base-url]
 * Reads credentials only in memory. Never prints secrets or writes them to disk.
 */
import { readFile } from "node:fs/promises";

const harPath = process.argv[2];
const base = (process.argv[3] || "http://127.0.0.1:8787").replace(/\/$/, "");
if (!harPath) {
  console.error("Usage: node scripts/readonly-check.mjs <har-path> [base-url]");
  process.exit(2);
}

const har = JSON.parse(await readFile(harPath, "utf8"));
const entry = har.log.entries[3];
const creds = JSON.parse(entry.request.postData.text);
const email = creds.password_identifier;
const password = creds.password;
if (typeof email !== "string" || typeof password !== "string") {
  console.error("HAR entry 3 did not contain login fields.");
  process.exit(1);
}

function scrub(value) {
  let json = JSON.stringify(value);
  for (const secret of [password, email]) {
    if (typeof secret !== "string" || secret.length === 0) continue;
    const escaped = JSON.stringify(secret).slice(1, -1);
    json = json.split(secret).join("[redacted]").split(escaped).join("[redacted]");
  }
  return JSON.parse(json);
}

function log(value) {
  console.log(JSON.stringify(scrub(value), null, 2));
}

const page = await fetch(`${base}/`);
const pageText = await page.text();
const pageOk =
  page.status === 200 &&
  page.headers.get("content-type")?.includes("text/html") &&
  pageText.includes("Arkkies Auto Login") &&
  pageText.includes("Book &amp; Open Door") &&
  pageText.includes('id="email"') &&
  pageText.includes('id="password"') &&
  pageText.includes('id="destination"') &&
  pageText.includes('autocomplete="username"') &&
  pageText.includes('autocomplete="current-password"') &&
  !pageText.includes("Log in") &&
  !pageText.includes("Home gym");
log({ check: "GET /", status: page.status, ok: pageOk, bytes: pageText.length });

const gymsRes = await fetch(`${base}/api/gyms`);
const gymsText = await gymsRes.text();
let gymsBody;
try {
  gymsBody = JSON.parse(gymsText);
} catch {
  gymsBody = null;
}
const gyms = Array.isArray(gymsBody?.gyms) ? gymsBody.gyms : [];
const bishanNorth = gyms.find((g) => g.id === "AGRBSN01");
const gymsOk =
  gymsRes.status === 200 &&
  gyms.length > 0 &&
  Boolean(bishanNorth);
log({
  check: "GET /api/gyms",
  status: gymsRes.status,
  ok: gymsOk,
  count: gyms.length,
  bishanNorth: bishanNorth ? `${bishanNorth.id} ${bishanNorth.name}` : null,
  sample: gyms.slice(0, 5).map((g) => `${g.id} ${g.name}`),
});

const statusRes = await fetch(`${base}/api/status`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ email, password, destination: "AGRBSN01" }),
});
const raw = await statusRes.text();
let data;
try {
  data = JSON.parse(raw);
} catch {
  log({ check: "POST /api/status", status: statusRes.status, ok: false, error: "non-JSON response" });
  process.exit(1);
}

const summary = {
  check: "POST /api/status",
  status: statusRes.status,
  ok: statusRes.ok && Boolean(data.home?.id) && Array.isArray(data.gyms),
  home: data.home ?? null,
  destination: data.destination ?? null,
  gymCount: Array.isArray(data.gyms) ? data.gyms.length : 0,
  currentSlot: data.currentSlot ?? null,
  currentBooking: data.currentBooking ?? null,
  error: data.error ?? null,
};
log(summary);
process.exit(pageOk && gymsOk && summary.ok ? 0 : 1);
