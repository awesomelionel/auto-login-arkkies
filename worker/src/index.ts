import { bookAndOpen, getStatus, openDoor } from "./arkkies";
import { listPublicGyms } from "./gyms";
import { ArkkiesError } from "./errors";
import { renderPage } from "./html";
import { timingSafeEqual } from "./logic";

type JsonBody = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ArkkiesError) {
    const body: Record<string, unknown> = { error: error.message, status: error.status };
    if (error.details) Object.assign(body, error.details);
    return json(body, error.status >= 400 && error.status < 600 ? error.status : 502);
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return json({ error: message, status: 500 }, 500);
}

function maybeCache(): Cache | undefined {
  try {
    return caches.default;
  } catch {
    return undefined;
  }
}

async function authorized(request: Request, env: Env): Promise<Response | null> {
  const required = env.ACCESS_KEY;
  if (!required) return null;
  const provided = new URL(request.url).searchParams.get("key") ?? "";
  const ok = await timingSafeEqual(provided, required);
  if (ok) return null;
  return json({ error: "Missing or invalid key. Add ?key= to the URL." }, 401);
}

async function readJson(request: Request): Promise<JsonBody> {
  const text = await request.text();
  if (!text.trim()) return {};
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await authorized(request, env);
    if (denied) return denied;

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "GET" && path === "/") {
        return new Response(renderPage(), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      if (request.method === "GET" && path === "/api/gyms") {
        const gyms = await listPublicGyms((input, init) => fetch(input, init), maybeCache());
        return new Response(JSON.stringify({ gyms }), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      }

      if (request.method === "POST" && path === "/api/status") {
        const body = await readJson(request);
        const result = await getStatus(
          { email: requiredString(body, "email"), password: requiredString(body, "password") },
          optionalString(body, "destination"),
          {
            home: optionalString(body, "home"),
            cache: maybeCache(),
          },
        );
        return json(result);
      }

      if (request.method === "POST" && path === "/api/book-and-open") {
        const body = await readJson(request);
        const result = await bookAndOpen({
          email: requiredString(body, "email"),
          password: requiredString(body, "password"),
          home: optionalString(body, "home"),
          destination: requiredString(body, "destination"),
        });
        return json(result);
      }

      if (request.method === "POST" && path === "/api/open-door") {
        const body = await readJson(request);
        const result = await openDoor({
          email: requiredString(body, "email"),
          password: requiredString(body, "password"),
          home: optionalString(body, "home"),
          destination: requiredString(body, "destination"),
        });
        return json(result);
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
