import { clipPublicMessage, redactSensitive } from "./redact";

export class ArkkiesError extends Error {
  readonly status: number;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, expose = true, details?: Record<string, unknown>) {
    super(message);
    this.name = "ArkkiesError";
    this.status = status;
    this.expose = expose;
    this.details = details;
  }
}

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of ["text", "message", "reason", "error", "description"]) {
      const found = firstText(rec[key]);
      if (found) return found;
    }
  }
  return null;
}

function collectUiMessages(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  const out: string[] = [];
  const ui = rec.ui as Record<string, unknown> | undefined;
  const messages = [
    ...(Array.isArray(rec.messages) ? rec.messages : []),
    ...(Array.isArray(rec.errors) ? rec.errors : []),
    ...(ui && Array.isArray(ui.messages) ? ui.messages : []),
  ];
  if (ui && Array.isArray(ui.nodes)) {
    for (const node of ui.nodes) {
      if (node && typeof node === "object" && Array.isArray((node as { messages?: unknown }).messages)) {
        messages.push(...((node as { messages: unknown[] }).messages));
      }
    }
  }
  for (const message of messages) {
    const text = firstText(message);
    if (text) out.push(text);
  }
  const top = firstText(rec.error) || firstText(rec.message);
  if (top) out.unshift(top);
  return [...new Set(out)];
}

/**
 * Turn an Arkkies response into a short message for the browser.
 * The raw body is never copied through: it can echo the password, a cookie, or a token.
 */
export function messageFromArkkiesBody(status: number, text: string, secrets: readonly string[] = []): string {
  const trimmed = text.trim();
  if (!trimmed) return `Arkkies returned ${status} with an empty body.`;
  try {
    const body = JSON.parse(trimmed) as unknown;
    const messages = collectUiMessages(body)
      .map((message) => redactSensitive(message, secrets))
      .map((message) => message.trim())
      .filter((message) => message.length > 0 && message !== "[redacted]");
    if (messages.length) return clipPublicMessage(messages.join(" "));
  } catch {
    // Non-JSON bodies are not shown. They are the most likely place for an echoed request.
  }
  return `Arkkies returned ${status}.`;
}
