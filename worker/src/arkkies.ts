import { CookieJar } from "./cookies";
import { ArkkiesError, messageFromArkkiesBody } from "./errors";
import {
  buildBookingBody,
  findCurrentBooking,
  findCurrentSlot,
  parseDoors,
  windowFromBooking,
  windowFromSelection,
} from "./logic";
import { FALLBACK_GYMS, catalogFromOutletList, loadGymCatalog, parseAllowedOutletIds, resolveGym, resolveGyms } from "./gyms";
import type {
  ActionRequest,
  ActionResult,
  Booking,
  BookingBody,
  Credentials,
  SlotSelection,
  StatusResult,
} from "./types";

export const API_BASE = "https://api.arkkies.com/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ArkkiesClientOptions = {
  fetch?: FetchLike;
  allowWrites?: boolean;
  cache?: Cache;
  now?: Date;
};

type SubscriptionInfo = {
  homeId: string;
  subscriptionId: string;
  allowedIds: string[];
};

function csrfFromLoginFlow(body: unknown): { action: string; csrfToken: string } {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const ui = rec?.ui as Record<string, unknown> | undefined;
  const action = typeof ui?.action === "string" ? ui.action : "";
  const nodes = Array.isArray(ui?.nodes) ? ui.nodes : [];
  let csrfToken = "";
  for (const node of nodes) {
    const attrs = node && typeof node === "object" ? (node as { attributes?: Record<string, unknown> }).attributes : undefined;
    if (attrs?.name === "csrf_token" && typeof attrs.value === "string") {
      csrfToken = attrs.value;
      break;
    }
  }
  if (!action) throw new ArkkiesError(502, "Arkkies login flow did not include an action URL.");
  if (!csrfToken) throw new ArkkiesError(502, "Arkkies login flow did not include a csrf_token.");
  return { action, csrfToken };
}

export class ArkkiesClient {
  private readonly fetchFn: FetchLike;
  private readonly allowWrites: boolean;
  private readonly cache?: Cache;
  private readonly jar = new CookieJar();
  private readonly secretSet = new Set<string>();

  private outletCache: Array<{ id: string; name: string }> | null = null;

  private noteSecret(value: string | null | undefined): void {
    if (value && value.length >= 4) this.secretSet.add(value);
  }

  /** Query values such as the Ory login `flow` id can show up in an error page. */
  private noteUrlSecrets(url: string): void {
    try {
      const parsed = new URL(url);
      for (const [key, value] of parsed.searchParams) {
        if (key.toLowerCase() === "flow" || value.length >= 16) this.noteSecret(value);
      }
    } catch {
      // Ignore URLs we cannot parse.
    }
  }

  private secretList(): string[] {
    for (const value of this.jar.secretValues()) this.noteSecret(value);
    return [...this.secretSet];
  }

  constructor(options: ArkkiesClientOptions = {}) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.allowWrites = options.allowWrites ?? false;
    this.cache = options.cache;
  }

  private async request(
    url: string,
    init: RequestInit & { homeOutlet?: string; json?: unknown } = {},
  ): Promise<Response> {
    this.noteUrlSecrets(url);
    const headers = new Headers(init.headers);
    headers.set("User-Agent", UA);
    headers.set("Origin", "https://arkkies.com");
    headers.set("Referer", "https://arkkies.com/");
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    if (init.homeOutlet) headers.set("x-ark-outlet", init.homeOutlet);
    const cookie = this.jar.header();
    if (cookie) headers.set("Cookie", cookie);
    const { json, homeOutlet: _home, headers: _h, ...rest } = init;
    const body = json !== undefined ? JSON.stringify(json) : init.body;
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      if (typeof record.password === "string") this.noteSecret(record.password);
      if (typeof record.password_identifier === "string") this.noteSecret(record.password_identifier);
      if (typeof record.csrf_token === "string") this.noteSecret(record.csrf_token);
    }
    let response: Response;
    try {
      response = await this.fetchFn(url, { ...rest, headers, body });
    } catch {
      throw new ArkkiesError(502, "Could not reach Arkkies.");
    }
    this.jar.store(response.headers);
    return response;
  }

  private async readBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  private async requireOk(response: Response, fallback: string): Promise<string> {
    const text = await this.readBody(response);
    if (!response.ok) {
      throw new ArkkiesError(
        response.status,
        messageFromArkkiesBody(response.status, text, this.secretList()) || fallback,
      );
    }
    return text;
  }

  private async requireJson<T>(response: Response, fallback: string): Promise<T> {
    const text = await this.requireOk(response, fallback);
    if (!text.trim()) {
      throw new ArkkiesError(response.status || 502, `${fallback} Arkkies returned an empty body.`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ArkkiesError(502, `${fallback} Arkkies returned non-JSON.`);
    }
  }

  async login(credentials: Credentials): Promise<void> {
    this.noteSecret(credentials.password);
    this.noteSecret(credentials.email);
    const browser = await this.request(
      `${API_BASE}/auth/provider/public/self-service/login/browser?refresh=true`,
    );
    const flow = await this.requireJson<unknown>(browser, "Could not start the Arkkies login.");
    const { action, csrfToken } = csrfFromLoginFlow(flow);
    this.noteSecret(csrfToken);
    const posted = await this.request(action, {
      method: "POST",
      json: {
        csrf_token: csrfToken,
        method: "password",
        password_identifier: credentials.email,
        password: credentials.password,
      },
    });
    if (posted.ok) {
      await this.readBody(posted);
      return;
    }

    const apiFlowRes = await this.request(`${API_BASE}/auth/provider/public/self-service/login/api`);
    if (apiFlowRes.ok) {
      const apiFlow = await this.requireJson<unknown>(apiFlowRes, "Could not start the Arkkies API login.");
      const rec = apiFlow as { ui?: { action?: string } };
      const apiAction = rec.ui?.action;
      if (apiAction) {
        const apiPosted = await this.request(apiAction, {
          method: "POST",
          json: {
            method: "password",
            password_identifier: credentials.email,
            password: credentials.password,
          },
        });
        if (apiPosted.ok) {
          await this.readBody(apiPosted);
          return;
        }
        const text = await this.readBody(apiPosted);
        throw new ArkkiesError(apiPosted.status, messageFromArkkiesBody(apiPosted.status, text, this.secretList()));
      }
    }

    const text = await this.readBody(posted);
    throw new ArkkiesError(posted.status, messageFromArkkiesBody(posted.status, text, this.secretList()));
  }

  async getOutlets(): Promise<Array<{ id: string; name: string }>> {
    if (this.outletCache) return this.outletCache;
    const response = await this.request(`${API_BASE}/brand/outlet`);
    const body = await this.requireJson<{ outlets?: Array<{ id?: string; name?: string }> }>(
      response,
      "Could not load the gym list.",
    );
    this.outletCache = (body.outlets ?? []).filter((o): o is { id: string; name: string } => Boolean(o.id && o.name));
    return this.outletCache;
  }

  private parseSubscription(text: string): SubscriptionInfo | null {
    let body: { active_subscriptions?: Array<Record<string, unknown>> };
    try {
      body = JSON.parse(text) as { active_subscriptions?: Array<Record<string, unknown>> };
    } catch {
      return null;
    }
    const active = body.active_subscriptions?.[0];
    if (!active) return null;
    const homeId = String(active.outlet_id ?? (active.subscription as { outlet_id?: string } | undefined)?.outlet_id ?? "");
    const subscriptionId = String((active.subscription as { id?: string } | undefined)?.id ?? "");
    const pass = active.pass as { allowed_bookings_at?: string } | undefined;
    if (!homeId || !subscriptionId) return null;
    return {
      homeId,
      subscriptionId,
      allowedIds: parseAllowedOutletIds(pass?.allowed_bookings_at, homeId),
    };
  }

  private async readSubscription(homeOutlet: string): Promise<SubscriptionInfo | null> {
    const response = await this.request(`${API_BASE}/customer/subscription/active`, {
      homeOutlet,
    });
    const text = await this.readBody(response);
    if (!response.ok) return null;
    return this.parseSubscription(text);
  }

  /** The subscription endpoint requires x-ark-outlet set to the home gym. */
  private async discoverSubscription(hint?: string): Promise<SubscriptionInfo> {
    if (hint) {
      const exact = await this.readSubscription(hint);
      if (exact) return exact;
    }
    let liveIds: string[] = [];
    try {
      liveIds = (await this.getOutlets()).map((outlet) => outlet.id);
    } catch {
      liveIds = [];
    }
    const ids = [...new Set([hint, ...liveIds, ...Object.keys(FALLBACK_GYMS)].filter((id): id is string => Boolean(id)))];
    const remaining = hint ? ids.filter((id) => id !== hint) : ids;
    const batchSize = 8;
    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize);
      const found = (
        await Promise.all(batch.map(async (id) => this.readSubscription(id)))
      ).find((info): info is SubscriptionInfo => Boolean(info));
      if (found) return found;
    }
    throw new ArkkiesError(404, "No active Arkkies subscription was found.");
  }

  async getSubscription(homeOutlet?: string): Promise<SubscriptionInfo> {
    return this.discoverSubscription(homeOutlet);
  }

  async getSlots(homeId: string, destinationId: string): Promise<SlotSelection[]> {
    const path =
      `${API_BASE}/brand/outlet/booking/slot/destination/${encodeURIComponent(destinationId)}` +
      `/filter/access-type/type/gym-access/days/7/topic/*`;
    const response = await this.request(path, { homeOutlet: homeId });
    const body = await this.requireJson<{ selections?: SlotSelection[] }>(
      response,
      "Could not load booking slots.",
    );
    return body.selections ?? [];
  }

  async getBookings(homeId: string): Promise<Booking[]> {
    const response = await this.request(`${API_BASE}/brand/outlet/booking`, { homeOutlet: homeId });
    const body = await this.requireJson<{ bookings?: Booking[] }>(response, "Could not load bookings.");
    return body.bookings ?? [];
  }

  async createBooking(homeId: string, body: BookingBody): Promise<void> {
    if (!this.allowWrites) {
      throw new ArkkiesError(500, "Booking is disabled on this client.", false);
    }
    const response = await this.request(`${API_BASE}/brand/outlet/booking`, {
      method: "POST",
      homeOutlet: homeId,
      json: body,
    });
    await this.requireOk(response, "Could not create the booking.");
  }

  async unlockDoor(doorId: string): Promise<void> {
    if (!this.allowWrites) {
      throw new ArkkiesError(500, "Door unlock is disabled on this client.", false);
    }
    const response = await this.request(`${API_BASE}/brand/outlet/door/unlock`, {
      method: "PUT",
      json: { door_id: doorId },
    });
    await this.requireOk(response, "Could not unlock the door.");
  }

  async gymCatalog(): Promise<Record<string, { label: string; longLabel: string }>> {
    const [bundle, outlets] = await Promise.all([
      loadGymCatalog(this.fetchFn, this.cache),
      this.getOutlets().catch(() => [] as Array<{ id: string; name: string }>),
    ]);
    return { ...FALLBACK_GYMS, ...bundle, ...catalogFromOutletList(outlets) };
  }
}

function denyDestination(
  destination: string,
  homeId: string,
  allowedIds: string[],
  catalog: Record<string, { label: string; longLabel: string }>,
): void {
  if (allowedIds.includes(destination)) return;
  const dest = resolveGym(destination, catalog);
  throw new ArkkiesError(403, `Your pass does not allow bookings at ${dest.name}.`, true, {
    home: resolveGym(homeId, catalog),
  });
}

export async function getStatus(
  credentials: Credentials,
  destinationId: string | undefined,
  options: ArkkiesClientOptions & { home?: string } = {},
): Promise<StatusResult> {
  const client = new ArkkiesClient({ ...options, allowWrites: false });
  await client.login(credentials);
  const sub = await client.getSubscription(options.home);
  const catalog = await client.gymCatalog();
  const gyms = resolveGyms(sub.allowedIds, catalog);
  if (destinationId) denyDestination(destinationId, sub.homeId, sub.allowedIds, catalog);
  const destination = destinationId || sub.homeId;
  const [slots, bookings] = await Promise.all([
    client.getSlots(sub.homeId, destination),
    client.getBookings(sub.homeId),
  ]);
  const now = options.now ?? new Date();
  const currentSlot = findCurrentSlot(slots, now);
  const currentBooking = findCurrentBooking(bookings, destination, now);
  return {
    home: resolveGym(sub.homeId, catalog),
    destination: resolveGym(destination, catalog),
    gyms,
    currentSlot: currentSlot ? windowFromSelection(currentSlot, destination) : null,
    currentBooking: currentBooking ? windowFromBooking(currentBooking, destination) : null,
  };
}

async function sessionForAction(
  request: ActionRequest,
  options: ArkkiesClientOptions,
  allowWrites: boolean,
): Promise<{
  client: ArkkiesClient;
  sub: SubscriptionInfo;
  catalog: Record<string, { label: string; longLabel: string }>;
  now: Date;
}> {
  const client = new ArkkiesClient({ ...options, allowWrites });
  await client.login(request);
  const sub = await client.getSubscription(request.home);
  const catalog = await client.gymCatalog();
  denyDestination(request.destination, sub.homeId, sub.allowedIds, catalog);
  return { client, sub, catalog, now: options.now ?? new Date() };
}

function requireDoor(doorId: string | null, where: string): string {
  if (!doorId) throw new ArkkiesError(502, `No door id was listed on ${where}.`);
  return doorId;
}

export async function bookAndOpen(
  request: ActionRequest,
  options: ArkkiesClientOptions = {},
): Promise<ActionResult> {
  const { client, sub, catalog, now } = await sessionForAction(request, options, true);
  const dest = request.destination;
  let bookings = await client.getBookings(sub.homeId);
  let current = findCurrentBooking(bookings, dest, now);
  let booked = false;
  let skippedBooking = false;

  if (current) {
    skippedBooking = true;
  } else {
    const slots = await client.getSlots(sub.homeId, dest);
    const slot = findCurrentSlot(slots, now);
    if (!slot) {
      throw new ArkkiesError(404, "No gym-access slot is open at that gym right now.");
    }
    await client.createBooking(sub.homeId, buildBookingBody(slot, sub.subscriptionId));
    booked = true;
    bookings = await client.getBookings(sub.homeId);
    current = findCurrentBooking(bookings, dest, now);
    if (!current) {
      throw new ArkkiesError(
        502,
        "The booking was sent but could not be confirmed, so the door was not unlocked.",
      );
    }
  }

  const window = windowFromBooking(current, dest);
  const doorId = requireDoor(window.doorId ?? parseDoors(current.booking_slot?.doors), "the confirmed booking");
  window.doorId = doorId;
  await client.unlockDoor(doorId);
  return {
    booked,
    unlocked: true,
    skippedBooking,
    window,
    home: resolveGym(sub.homeId, catalog),
    message: skippedBooking
      ? `Existing booking confirmed. Unlocked the door for ${window.label}.`
      : `Booked and unlocked the door for ${window.label}.`,
  };
}

export async function openDoor(
  request: ActionRequest,
  options: ArkkiesClientOptions = {},
): Promise<ActionResult> {
  const { client, sub, catalog, now } = await sessionForAction(request, options, true);
  const dest = request.destination;
  const bookings = await client.getBookings(sub.homeId);
  const current = findCurrentBooking(bookings, dest, now);
  if (!current) {
    throw new ArkkiesError(404, "You don't have a booking at that gym right now.");
  }
  const window = windowFromBooking(current, dest);
  const doorId = requireDoor(window.doorId, "your current booking");
  window.doorId = doorId;
  await client.unlockDoor(doorId);
  return {
    booked: false,
    unlocked: true,
    skippedBooking: true,
    window,
    home: resolveGym(sub.homeId, catalog),
    message: `Unlocked the door for ${window.label}.`,
  };
}
