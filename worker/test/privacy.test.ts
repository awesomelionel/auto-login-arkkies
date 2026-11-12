import { afterEach, describe, expect, it } from "vitest";
import { API_BASE } from "../src/arkkies";
import { messageFromArkkiesBody } from "../src/errors";
import { resetGymCaches } from "../src/gyms";
import { renderPage } from "../src/html";
import worker from "../src/index";
import { redactSensitive } from "../src/redact";

const PASSWORD = "s3cret-password-value";
const EMAIL = "member@example.com";
const COOKIE = "session-cookie-value";
const CSRF = "csrf-secret-value";
const FLOW = "flow-secret-value";
const SENTINELS = [PASSWORD, EMAIL, COOKIE, CSRF, FLOW];

function assertClean(text: string): void {
  for (const secret of SENTINELS) {
    expect(text).not.toContain(secret);
  }
}

function spyConsole(): { text: () => string; restore: () => void } {
  const chunks: string[] = [];
  const methods = ["log", "debug", "info", "warn", "error", "trace"] as const;
  const originals = methods.map((method) => console[method].bind(console));
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      chunks.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    };
  }
  return {
    text: () => chunks.join("\n"),
    restore() {
      methods.forEach((method, index) => {
        console[method] = originals[index];
      });
    },
  };
}

function jsonResponse(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(extra)) },
  });
}

/** Login that fails and echoes the submitted secrets in the Arkkies body and Set-Cookie. */
function echoingLoginFailure(): typeof fetch {
  return (async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/self-service/login/browser")) {
      return jsonResponse(
        {
          ui: {
            action: `${API_BASE}/auth/provider/public/self-service/login?flow=${FLOW}`,
            nodes: [{ attributes: { name: "csrf_token", value: CSRF } }],
          },
        },
        200,
        { "Set-Cookie": `ory_csrf=${CSRF}; Path=/` },
      );
    }
    if (method === "POST" && url.includes("/self-service/login")) {
      return jsonResponse(
        {
          password: PASSWORD,
          cookie: COOKIE,
          ui: {
            messages: [{ text: `Invalid password ${PASSWORD} for ${EMAIL}` }],
            nodes: [
              {
                attributes: { name: "password", value: PASSWORD },
                messages: [{ text: `session ${COOKIE} csrf ${CSRF} flow ${FLOW}` }],
              },
            ],
          },
        },
        400,
        { "Set-Cookie": `ark_session=${COOKIE}; Path=/` },
      );
    }
    return jsonResponse({ error: `unexpected ${PASSWORD}` }, 500);
  }) as typeof fetch;
}

async function postAction(path: string, body: unknown, headers?: HeadersInit): Promise<Response> {
  const init: RequestInit = { method: "POST", headers };
  if (typeof body === "string") init.body = body;
  else init.body = JSON.stringify(body);
  return worker.fetch(new Request(`https://gym.example${path}`, init));
}

describe("redaction", () => {
  it("keeps an ordinary invalid-credentials sentence and drops secret values", () => {
    const benign = "The provided credentials are invalid, check for spelling mistakes in your password or username.";
    expect(redactSensitive(benign, [PASSWORD])).toBe(benign);

    const leaked = messageFromArkkiesBody(
      400,
      JSON.stringify({
        ui: { messages: [{ text: `Invalid password ${PASSWORD} for ${EMAIL}` }] },
        debug: `cookie=${COOKIE}`,
      }),
      [PASSWORD, EMAIL, COOKIE],
    );
    expect(leaked).toContain("Invalid password");
    expect(leaked).toContain("password");
    assertClean(leaked);
    expect(leaked).not.toContain("cookie=");
  });

  it("does not copy a non-JSON Arkkies body into the message", () => {
    const message = messageFromArkkiesBody(401, `password=${PASSWORD}&cookie=${COOKIE}`, [PASSWORD, COOKIE]);
    expect(message).toBe("Arkkies returned 401.");
    assertClean(message);
  });
});

describe("page", () => {
  it("posts credentials and remembers only username, gym, and home gym", () => {
    const html = renderPage();
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/book-and-open"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain("arkkies.username");
    expect(html).toContain("arkkies.destination");
    expect(html).toContain("arkkies.home");
    expect(html).not.toContain("?key=");
    expect(html).not.toContain("ACCESS_KEY");
    expect(html).not.toContain("localStorage.setItem(STORE.password");
    expect(html).not.toMatch(/localStorage\.setItem\(\s*["']arkkies\.password/);
  });
});

describe("credential responses", () => {
  const previousFetch = globalThis.fetch;
  let logs: ReturnType<typeof spyConsole> | undefined;
  const puts: Array<{ url: string; body: string }> = [];

  afterEach(() => {
    logs?.restore();
    logs = undefined;
    globalThis.fetch = previousFetch;
    resetGymCaches();
    puts.length = 0;
    Reflect.deleteProperty(globalThis, "caches");
  });

  function installCache(): void {
    const cache = {
      async match() {
        return undefined;
      },
      async put(request: Request, response: Response) {
        puts.push({ url: request.url, body: await response.clone().text() });
      },
    };
    (globalThis as { caches?: CacheStorage }).caches = {
      default: cache,
    } as unknown as CacheStorage;
  }

  async function expectPrivate(response: Response): Promise<string> {
    const text = await response.text();
    assertClean(text);
    assertClean(logs?.text() ?? "");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const location = response.headers.get("location");
    if (location) assertClean(location);
    return text;
  }

  it("does not echo an upstream body that repeats the password, cookie, or token", async () => {
    logs = spyConsole();
    installCache();
    globalThis.fetch = echoingLoginFailure();
    const response = await postAction("/api/book-and-open", {
      email: EMAIL,
      password: PASSWORD,
      destination: "AGRBSN01",
    });
    expect(response.status).toBe(400);
    const text = await expectPrivate(response);
    expect(text).toContain("Invalid password");
    expect(puts).toEqual([]);
  });

  it("does not echo a raw upstream body or a thrown fetch error", async () => {
    logs = spyConsole();
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/login/browser")) {
        return new Response(`password=${PASSWORD} cookie=${COOKIE}`, { status: 401 });
      }
      throw new Error(`network down ${PASSWORD} ${COOKIE} ${FLOW}`);
    }) as typeof fetch;

    const raw = await postAction("/api/open-door", {
      email: EMAIL,
      password: PASSWORD,
      destination: "AGRBSN01",
    });
    expect(raw.status).toBe(401);
    const rawText = await expectPrivate(raw);
    expect(rawText).toContain("Arkkies returned 401.");

    globalThis.fetch = (async () => {
      throw new Error(`network down ${PASSWORD}`);
    }) as typeof fetch;
    const thrown = await postAction("/api/status", { email: EMAIL, password: PASSWORD });
    expect(thrown.status).toBe(502);
    const thrownText = await expectPrivate(thrown);
    expect(thrownText).toContain("Could not reach Arkkies.");
  });

  it("rejects credentials in the URL and cleartext posts without repeating them", async () => {
    logs = spyConsole();
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error(`should not run ${PASSWORD}`);
    }) as typeof fetch;

    const query = await worker.fetch(
      new Request(`https://gym.example/api/status?password=${encodeURIComponent(PASSWORD)}&email=${encodeURIComponent(EMAIL)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );
    expect(query.status).toBe(400);
    await expectPrivate(query);
    expect(called).toBe(false);

    const page = await worker.fetch(new Request(`https://gym.example/?password=${encodeURIComponent(PASSWORD)}`));
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("https://gym.example/");
    await expectPrivate(page);

    const insecure = await worker.fetch(
      new Request("http://gym.example/api/book-and-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, destination: "AGRBSN01" }),
      }),
    );
    expect(insecure.status).toBe(400);
    await expectPrivate(insecure);
    expect(called).toBe(false);

    const getAction = await worker.fetch(
      new Request(`https://gym.example/api/open-door?password=${encodeURIComponent(PASSWORD)}`),
    );
    expect(getAction.status).toBe(400);
    await expectPrivate(getAction);
  });

  it("accepts a form POST and an invalid JSON body without returning the password", async () => {
    logs = spyConsole();
    globalThis.fetch = echoingLoginFailure();
    const form = await worker.fetch(
      new Request("https://gym.example/api/book-and-open", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: EMAIL,
          password: PASSWORD,
          destination: "AGRBSN01",
        }),
      }),
    );
    expect(form.status).toBe(400);
    const formText = await expectPrivate(form);
    expect(formText).toContain("Invalid password");

    const invalid = await postAction("/api/status", `password=${PASSWORD}`, {
      "Content-Type": "application/json",
    });
    expect(invalid.status).toBe(400);
    const invalidText = await expectPrivate(invalid);
    expect(invalidText).toContain("Invalid JSON");
  });

  it("allows loopback HTTP for local dev and still omits the password from errors", async () => {
    logs = spyConsole();
    const response = await worker.fetch(
      new Request("http://127.0.0.1:8787/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      }),
    );
    expect(response.status).toBe(400);
    const text = await expectPrivate(response);
    expect(text).toContain("Missing email.");
  });

  it("caches only the public gym catalog", async () => {
    logs = spyConsole();
    resetGymCaches();
    installCache();
    globalThis.fetch = (async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/brand/outlet")) {
        return jsonResponse({ outlets: [{ id: "AGRBSN01", name: "Ark Grit @ Bishan North" }] });
      }
      if (url.includes("app.bundle.js")) {
        return new Response(
          `{label:"Bishan North",longLabel:"Ark Grit • Bishan North",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBSN01"}`,
          { status: 200 },
        );
      }
      return jsonResponse({ error: PASSWORD }, 500);
    }) as typeof fetch;

    const response = await worker.fetch(new Request("https://gym.example/api/gyms"));
    expect(response.status).toBe(200);
    await expectPrivate(response);
    expect(puts.length).toBeGreaterThan(0);
    for (const put of puts) {
      expect(put.url === "https://api.arkkies.com/v2/brand/outlet" || put.url === "https://arkkies.com/app.bundle.js").toBe(true);
      assertClean(put.url);
      assertClean(put.body);
    }
  });
});
