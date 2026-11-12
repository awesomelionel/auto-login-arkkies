import { bookAndOpen, getStatus, openDoor } from "./arkkies";
import { listPublicGyms } from "./gyms";
import { ArkkiesError } from "./errors";
import { renderPage, renderTermsPage } from "./html";
import { clipPublicMessage, redactSensitive } from "./redact";
import { termsAcceptanceError } from "./terms";

type JsonBody = Record<string, unknown>;

const CREDENTIAL_PATHS = new Set(["/api/status", "/api/book-and-open", "/api/open-door"]);
const SENSITIVE_QUERY_KEYS = new Set([
  "password",
  "passwd",
  "pass",
  "email",
  "username",
  "user",
  "cookie",
  "set-cookie",
  "token",
  "csrf",
  "csrf_token",
  "key",
  "access_key",
  "authorization",
  "session",
]);
const MAX_BODY_BYTES = 16_384;

function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("Set-Cookie");
  return new Response(JSON.stringify(data), { status, headers });
}

function page(html: string, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("Set-Cookie");
  return new Response(html, { status, headers });
}

function sanitizeDetails(
  details: Record<string, unknown> | undefined,
  secrets: readonly string[],
): Record<string, unknown> | undefined {
  if (!details || typeof details.home !== "object" || details.home == null) return undefined;
  const home = details.home as Record<string, unknown>;
  const safe: Record<string, string> = {};
  for (const key of ["id", "label", "longLabel", "name"] as const) {
    const value = home[key];
    if (typeof value !== "string" || value.length > 120) continue;
    safe[key] = redactSensitive(value, secrets);
  }
  return Object.keys(safe).length ? { home: safe } : undefined;
}

function errorResponse(error: unknown, secrets: readonly string[] = []): Response {
  if (error instanceof ArkkiesError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    if (!error.expose) {
      return json({ error: "The request could not be completed.", status }, status);
    }
    const body: Record<string, unknown> = {
      error: clipPublicMessage(redactSensitive(error.message, secrets)),
      status,
    };
    const details = sanitizeDetails(error.details, secrets);
    if (details) Object.assign(body, details);
    return json(body, status);
  }
  const message = error instanceof Error ? redactSensitive(error.message, secrets) : "Unexpected error.";
  return json({ error: clipPublicMessage(message) || "Unexpected error.", status: 500 }, 500);
}

/** Public gym catalog only. Authenticated Arkkies responses are never stored here. */
function maybeCache(): Cache | undefined {
  try {
    const storage = (globalThis as { caches?: CacheStorage }).caches;
    return storage?.default;
  } catch {
    return undefined;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function queryHasSecrets(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function pathOnly(url: URL, protocol = url.protocol): string {
  return new URL(url.pathname || "/", `${protocol}//${url.host}`).toString();
}

async function readPayload(request: Request): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ArkkiesError(413, "Request body is too large.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ArkkiesError(413, "Request body is too large.");
  if (!text.trim()) return {};

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body: JsonBody = {};
    for (const [key, value] of new URLSearchParams(text)) body[key] = value;
    if (typeof body.username === "string" && typeof body.email !== "string") body.email = body.username;
    return body;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ArkkiesError(400, "Expected a JSON object.");
    }
    return parsed as JsonBody;
  } catch (error) {
    if (error instanceof ArkkiesError) throw error;
    throw new ArkkiesError(400, "Invalid JSON body.");
  }
}

function requiredString(body: JsonBody, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ArkkiesError(400, `Missing ${key}.`);
  }
  return key === "password" ? value : value.trim();
}

function optionalString(body: JsonBody, key: string): string | undefined {
  const value = body[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export default {
  async fetch(request: Request, _env: Env = {} as Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const secrets: string[] = [];

    try {
      if (!isLoopback(url.hostname) && url.protocol !== "https:") {
        if (request.method === "GET" || request.method === "HEAD") {
          return page("", 302, { Location: pathOnly(url, "https:") });
        }
        return json({ error: "Use HTTPS.", status: 400 }, 400);
      }

      if (queryHasSecrets(url)) {
        if ((request.method === "GET" || request.method === "HEAD") && path === "/") {
          return page("", 302, { Location: pathOnly(url) });
        }
        return json({ error: "Send credentials in the POST body, not the URL.", status: 400 }, 400);
      }

      if (request.method === "GET" && path === "/") {
        return page(renderPage());
      }

      if (request.method === "GET" && path === "/terms") {
        return page(renderTermsPage());
      }

      if (request.method === "GET" && path === "/api/gyms") {
        const gyms = await listPublicGyms((input, init) => fetch(input, init), maybeCache());
        return json({ gyms });
      }

      if (CREDENTIAL_PATHS.has(path)) {
        if (request.method !== "POST") {
          return json({ error: "Use POST.", status: 405 }, 405, { Allow: "POST" });
        }
        const body = await readPayload(request);
        const termsError = termsAcceptanceError(body.acceptedTerms);
        if (termsError) throw new ArkkiesError(400, termsError);
        const email = requiredString(body, "email");
        secrets.push(email);
        const password = requiredString(body, "password");
        secrets.push(password);
        const credentials = { email, password };

        if (path === "/api/status") {
          const result = await getStatus(credentials, optionalString(body, "destination"), {
            home: optionalString(body, "home"),
            cache: maybeCache(),
          });
          return json(result);
        }

        const action = {
          ...credentials,
          home: optionalString(body, "home"),
          destination: requiredString(body, "destination"),
        };
        const result = path === "/api/book-and-open" ? await bookAndOpen(action) : await openDoor(action);
        return json(result);
      }

      return json({ error: "Not found.", status: 404 }, 404);
    } catch (error) {
      return errorResponse(error, secrets);
    }
  },
} satisfies ExportedHandler<Env>;
