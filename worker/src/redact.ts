const ASSIGNED_SECRET =
  /("(?:password|passwd|csrf_token|session_token|access_token|refresh_token|id_token|token|cookie|authorization)"\s*:\s*")[^"]*(")/gi;

const LABELED_SECRET =
  /\b(password|passwd|csrf_token|session_token|access_token|refresh_token|id_token|authorization|cookie)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi;

const BEARER = /\b(?:bearer|token)\s+[A-Za-z0-9\-._~+/]+=*/gi;

/** Remove credential material from text that might be returned to a browser or written to a log. */
export function redactSensitive(text: string, secrets: readonly string[] = []): string {
  let out = text;
  const values = [...new Set(secrets.filter((secret) => secret.length >= 4))].sort((a, b) => b.length - a.length);
  for (const secret of values) {
    if (out.includes(secret)) out = out.split(secret).join("[redacted]");
  }
  out = out.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return "[redacted-url]";
    }
  });
  out = out.replace(ASSIGNED_SECRET, "$1[redacted]$2");
  out = out.replace(LABELED_SECRET, "$1$2[redacted]");
  out = out.replace(BEARER, "[redacted]");
  return out;
}

export function clipPublicMessage(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 300) return trimmed;
  return `${trimmed.slice(0, 299)}…`;
}
