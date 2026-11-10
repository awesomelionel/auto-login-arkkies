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

export function messageFromArkkiesBody(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return `Arkkies returned ${status} with an empty body.`;
  try {
    const body = JSON.parse(trimmed) as unknown;
    const messages = collectUiMessages(body);
    if (messages.length) return messages.join(" ");
  } catch {
    // fall through and use a short raw snippet
  }
  const snippet = trimmed.replace(/\s+/g, " ").slice(0, 200);
  return `Arkkies returned ${status}: ${snippet}`;
}
