import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "../src/terms";

const EMAIL = "member@example.com";
const PASSWORD = "s3cret-password-value";

function credentialRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://gym.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("terms page", () => {
  it("serves /terms in the same page style and links it from the form", async () => {
    const terms = await worker.fetch(new Request("https://gym.example/terms"));
    expect(terms.status).toBe(200);
    expect(terms.headers.get("content-type")).toContain("text/html");
    const html = await terms.text();
    expect(html).toContain("Terms of Use");
    expect(html).toContain(`Version ${TERMS_VERSION}`);
    expect(html).toContain(TERMS_EFFECTIVE_DATE);
    expect(html).toContain("not affiliated");
    expect(html).toContain("as is");
    expect(html).toContain("as available");
    expect(html).toContain("no warranty");
    expect(html).toContain("laws of Singapore");
    expect(html).toContain("Lionel Tan");
    expect(html).toContain("indemnify and hold harmless");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("[add an email address here]");
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(html).toContain('href="/"');

    const home = await worker.fetch(new Request("https://gym.example/"));
    expect(home.status).toBe(200);
    const page = await home.text();
    expect(page).toContain('href="/terms"');
    expect(page).toContain("I agree to the Terms of Use");
    expect(page).toContain(`value="${TERMS_VERSION}"`);
    expect(page).toContain('type="checkbox"');
    expect(page).toContain("required");
    expect(page).toContain("arkkies.terms");
    expect(page).toContain("saved.terms === TERMS_VERSION");
    expect(page).toContain("if (!termsOk()) return;");
    const script = page.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";
    expect(script.length).toBeGreaterThan(0);
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("acceptedTerms", () => {
  const previousFetch = globalThis.fetch;
  let called = false;

  afterEach(() => {
    globalThis.fetch = previousFetch;
    called = false;
  });

  function installFetch(): void {
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not run");
    }) as typeof fetch;
  }

  it("rejects a missing or outdated acceptedTerms version and does not call Arkkies", async () => {
    installFetch();
    for (const path of ["/api/status", "/api/book-and-open", "/api/open-door"]) {
      const missing = await worker.fetch(
        credentialRequest(path, { email: EMAIL, password: PASSWORD, destination: "AGRBSN01" }),
      );
      expect(missing.status).toBe(400);
      const missingBody = (await missing.json()) as { error: string };
      expect(missingBody.error).toContain(`version ${TERMS_VERSION}`);
      expect(missingBody.error).toContain("acceptedTerms");
      expect(called).toBe(false);
    }

    const stale = await worker.fetch(
      credentialRequest("/api/open-door", {
        email: EMAIL,
        password: PASSWORD,
        destination: "AGRBSN01",
        acceptedTerms: "2000-01-01",
      }),
    );
    expect(stale.status).toBe(400);
    const staleBody = (await stale.json()) as { error: string };
    expect(staleBody.error).toContain(`version ${TERMS_VERSION}`);
    expect(staleBody.error).not.toContain(PASSWORD);
    expect(called).toBe(false);
  });

  it("accepts the current terms version and continues the request", async () => {
    installFetch();
    const response = await worker.fetch(
      credentialRequest("/api/status", {
        email: EMAIL,
        password: PASSWORD,
        acceptedTerms: TERMS_VERSION,
      }),
    );
    expect(called).toBe(true);
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Could not reach Arkkies.");
    expect(body.error).not.toContain("Terms of Use");
  });

  it("still rejects GET on a credential route before checking terms", async () => {
    installFetch();
    const response = await worker.fetch(new Request("https://gym.example/api/open-door"));
    expect(response.status).toBe(405);
    expect(called).toBe(false);
  });
});
