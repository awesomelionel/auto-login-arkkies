function setCookieTuples(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function isExpired(attrs: string[]): boolean {
  const joined = attrs.join(";").toLowerCase();
  if (joined.includes("max-age=0")) return true;
  const expires = attrs.find((attr) => attr.trim().toLowerCase().startsWith("expires="));
  if (!expires) return false;
  const when = Date.parse(expires.split("=").slice(1).join("="));
  return Number.isFinite(when) && when <= Date.now();
}

/** In-memory cookie jar. Cookie values must never be logged. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(headers: Headers): void {
    for (const raw of setCookieTuples(headers)) {
      const [pair, ...attrs] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      if (!value || isExpired(attrs)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string | null {
    if (this.cookies.size === 0) return null;
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get names(): string[] {
    return [...this.cookies.keys()];
  }

  /** Cookie values, so callers can redact them from errors. Never log the result. */
  secretValues(): string[] {
    return [...this.cookies.values()];
  }
}
