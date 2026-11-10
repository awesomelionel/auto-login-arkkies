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

const page = await fetch(`${base}/`);
const pageText = await page.text();
const pageOk =
  page.status === 200 &&
  page.headers.get("content-type")?.includes("text/html") &&
  pageText.includes("Arkkies Auto Login") &&
  pageText.includes("Book &amp; Open Door") &&
  pageText.includes('id="email"') &&
  pageText.includes('id="password"');
console.log(JSON.stringify({ check: "GET /", status: page.status, ok: pageOk, bytes: pageText.length }));

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
  console.log(JSON.stringify({ check: "POST /api/status", status: statusRes.status, ok: false, error: "non-JSON response" }));
  process.exit(1);
}

const summary = {
  check: "POST /api/status",
  status: statusRes.status,
  ok: statusRes.ok && Boolean(data.home?.id) && Array.isArray(data.gyms),
  home: data.home ?? null,
  destination: data.destination ?? null,
  gymCount: Array.isArray(data.gyms) ? data.gyms.length : 0,
  gyms: Array.isArray(data.gyms) ? data.gyms.map((g) => `${g.id} ${g.name}`) : [],
  currentSlot: data.currentSlot ?? null,
  currentBooking: data.currentBooking ?? null,
  error: data.error ?? null,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
