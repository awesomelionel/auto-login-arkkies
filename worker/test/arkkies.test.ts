import { afterEach, describe, expect, it } from "vitest";
import { ArkkiesError } from "../src/errors";
import { API_BASE, bookAndOpen, getStatus, openDoor } from "../src/arkkies";
import type { FetchLike } from "../src/arkkies";
import { listPublicGyms, resetGymCatalogCache, resetPublicGymsCache } from "../src/gyms";
import worker from "../src/index";

const HOME = "AGRBIS01";
const DEST = "AGRBSN01";
const SLOT_ID = "effed7aa-slot";
const SELECTION_ID = "fdd7cd67-selection";
const SUB_ID = "sub_example_membership";
const DOOR = "AGRBSN01-D01";
const NOW = new Date("2026-11-10T02:30:00Z"); // 10:30 SGT, inside 09:00-12:00

type Call = { method: string; url: string; body: unknown; homeHeader: string | null };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: init.status ?? 200, headers });
}

function makeFetch(options?: { existingBooking?: boolean; confirmAfterBook?: boolean }): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let booked = Boolean(options?.existingBooking);
  const confirm = options?.confirmAfterBook ?? true;
  const fetchFn: FetchLike = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    let body: unknown = undefined;
    if (typeof init?.body === "string" && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: Call = { method, url, body, homeHeader: headers.get("x-ark-outlet") };
    calls.push(call);

    if (url.includes("/self-service/login/browser")) {
      return jsonResponse({
        ui: {
          action: `${API_BASE}/auth/provider/public/self-service/login?flow=test-flow`,
          nodes: [{ attributes: { name: "csrf_token", value: "csrf-test" } }],
        },
      }, { headers: { "Set-Cookie": "csrf_token_test=csrf-cookie; Path=/" } });
    }
    if (url.includes("/self-service/login?") && method === "POST") {
      return jsonResponse({ session: { id: "sess", active: true } }, { headers: { "Set-Cookie": "ark_session=session-cookie; Path=/" } });
    }
    if (url.includes("/brand/outlet") && !url.includes("/booking") && !url.includes("/door")) {
      return jsonResponse({
        outlets: [
          { id: DEST, name: "Ark Grit @ Bishan North" },
          { id: HOME, name: "Ark Grit @ Bishan" },
          { id: "AGRHUG01", name: "Ark Grit @ Hougang 423" },
          { id: "AMOWLH01", name: "Ark Move @ Woodleigh" },
          { id: "ARKPLS01", name: "Ark+", brand: { name: "Ark Premium Access" } },
          { id: "ARKCRP01", name: "Corp+", brand: { name: "Ark Corporate" } },
        ],
      });
    }
    if (url.includes("/customer/subscription/active")) {
      if (headers.get("x-ark-outlet") !== HOME) {
        return jsonResponse({ active_subscriptions: [] });
      }
      return jsonResponse({
        active_subscriptions: [
          {
            outlet_id: HOME,
            subscription: { id: SUB_ID, outlet_id: HOME },
            pass: { allowed_bookings_at: `${HOME},${DEST},AGRHUG01` },
          },
        ],
      });
    }
    if (url.includes("/booking/slot/destination/")) {
      return jsonResponse({
        selections: [
          {
            id: SELECTION_ID,
            selection_date_time_start: "2026-11-10T09:00:00+08:00",
            selection_date_time_end: "2026-11-10T12:00:00+08:00",
            slot: { id: SLOT_ID, doors: DOOR, outlet_id: DEST },
          },
        ],
      });
    }
    if (url.endsWith("/brand/outlet/booking") && method === "GET") {
      const include = booked && (confirm || options?.existingBooking);
      return jsonResponse({
        bookings: include
          ? [
              {
                id: "booking-1",
                outlet_id: HOME,
                time_start: "2026-11-10T01:00:00Z",
                time_end: "2026-11-10T04:00:00Z",
                booking_slot: { id: SLOT_ID, outlet_id: DEST, doors: DOOR },
              },
            ]
          : [],
      });
    }
    if (url.endsWith("/brand/outlet/booking") && method === "POST") {
      booked = true;
      return new Response("", { status: 200 });
    }
    if (url.endsWith("/brand/outlet/door/unlock") && method === "PUT") {
      return new Response("", { status: 200 });
    }
    if (url.includes("app.bundle.js")) {
      return new Response(
        `{label:"Bishan",longLabel:"Ark Grit • Bishan",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBIS01"},{label:"Bishan North",longLabel:"Ark Grit • Bishan North",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBSN01"}`,
        { status: 200, headers: { "Content-Type": "text/javascript" } },
      );
    }
    return jsonResponse({ error: { message: `unexpected ${method} ${url}` } }, { status: 500 });
  };
  return { fetch: fetchFn, calls };
}

const creds = { email: "user@example.com", password: "test-password" };

describe("home vs destination header logic", () => {
  it("sends x-ark-outlet as the home gym and puts the destination in the slots URL", async () => {
    const { fetch, calls } = makeFetch();
    await getStatus(creds, DEST, { fetch, now: NOW, home: HOME });

    const slots = calls.find((c) => c.url.includes("/booking/slot/destination/"));
    expect(slots).toBeTruthy();
    expect(slots?.url).toContain(`/destination/${DEST}/`);
    expect(slots?.homeHeader).toBe(HOME);

    const subscription = calls.find((c) => c.url.includes("/customer/subscription/active"));
    expect(subscription?.homeHeader).toBe(HOME);

    const bookings = calls.find((c) => c.url.endsWith("/brand/outlet/booking") && c.method === "GET");
    expect(bookings?.homeHeader).toBe(HOME);

    expect(calls.some((c) => c.url.includes("/door/unlock") || (c.method === "POST" && c.url.endsWith("/booking")))).toBe(false);
  });

  it("discovers the home gym when the header is required and no hint is given", async () => {
    const { fetch, calls } = makeFetch();
    const status = await getStatus(creds, DEST, { fetch, now: NOW });
    expect(status.home.id).toBe(HOME);
    const probes = calls.filter((c) => c.url.includes("/customer/subscription/active"));
    expect(probes.some((c) => c.homeHeader === DEST)).toBe(true);
    expect(probes.some((c) => c.homeHeader === HOME)).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/brand/outlet") && c.method === "GET")).toBe(true);
    expect(status.destination.name).toContain("Bishan North");
  });
});

describe("bookAndOpen", () => {
  it("books with slot.id and unlocks the slot's door", async () => {
    const { fetch, calls } = makeFetch();
    const result = await bookAndOpen({ ...creds, destination: DEST }, { fetch, now: NOW });

    const booked = calls.find((c) => c.method === "POST" && c.url.endsWith("/brand/outlet/booking"));
    expect(booked?.body).toEqual({
      time_start: "2026-11-10T09:00:00+08:00",
      time_end: "2026-11-10T12:00:00+08:00",
      purpose_type: "gym-time",
      booking_slot_id: SLOT_ID,
      corresponding_item_ids: [SUB_ID],
    });
    expect((booked?.body as { booking_slot_id: string }).booking_slot_id).not.toBe(SELECTION_ID);
    expect(booked?.homeHeader).toBe(HOME);

    const unlock = calls.find((c) => c.method === "PUT" && c.url.endsWith("/door/unlock"));
    expect(unlock?.body).toEqual({ door_id: DOOR });
    expect(unlock?.homeHeader).toBeNull();

    expect(result.booked).toBe(true);
    expect(result.unlocked).toBe(true);
    expect(result.window.doorId).toBe(DOOR);
    expect(result.window.label).toContain("SGT");
  });

  it("skips booking when one already covers now, then unlocks that door", async () => {
    const { fetch, calls } = makeFetch({ existingBooking: true });
    const result = await bookAndOpen({ ...creds, destination: DEST }, { fetch, now: NOW });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/booking"))).toBe(false);
    const unlock = calls.find((c) => c.method === "PUT" && c.url.endsWith("/door/unlock"));
    expect(unlock?.body).toEqual({ door_id: DOOR });
    expect(result.skippedBooking).toBe(true);
    expect(result.booked).toBe(false);
  });
});

describe("openDoor", () => {
  it("unlocks the current booking's door", async () => {
    const { fetch, calls } = makeFetch({ existingBooking: true });
    const result = await openDoor({ ...creds, destination: DEST }, { fetch, now: NOW });
    expect(result.unlocked).toBe(true);
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ door_id: DOOR });
  });

  it("returns a clear error and does not unlock when there is no booking", async () => {
    const { fetch, calls } = makeFetch({ existingBooking: false });
    await expect(openDoor({ ...creds, destination: DEST }, { fetch, now: NOW })).rejects.toMatchObject({
      status: 404,
      message: "You don't have a booking at that gym right now.",
    } satisfies Partial<ArkkiesError>);
    expect(calls.some((c) => c.url.includes("/door/unlock"))).toBe(false);
  });
});

describe("write guard", () => {
  it("does not allow booking or unlock on the status client", async () => {
    const { fetch } = makeFetch();
    const status = await getStatus(creds, DEST, { fetch, now: NOW });
    expect(status.home.id).toBe(HOME);
    expect(status.destination.id).toBe(DEST);
    expect(status.currentSlot?.doorId).toBe(DOOR);
  });
});

describe("disallowed destination", () => {
  it("returns a clear error and does not unlock when the pass does not cover that gym", async () => {
    const { fetch, calls } = makeFetch();
    await expect(openDoor({ ...creds, destination: "AMOWLH01" }, { fetch, now: NOW })).rejects.toMatchObject({
      status: 403,
      message: "Your pass does not allow bookings at Ark Move @ Woodleigh.",
      details: { home: expect.objectContaining({ id: HOME }) },
    } satisfies Partial<ArkkiesError>);
    expect(calls.some((c) => c.url.includes("/door/unlock"))).toBe(false);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/booking"))).toBe(false);
  });

  it("rejects a disallowed destination on the read-only status path too", async () => {
    const { fetch, calls } = makeFetch();
    await expect(getStatus(creds, "AMOWLH01", { fetch, now: NOW, home: HOME })).rejects.toMatchObject({
      status: 403,
      message: "Your pass does not allow bookings at Ark Move @ Woodleigh.",
    } satisfies Partial<ArkkiesError>);
    expect(calls.some((c) => c.url.includes("/door/unlock"))).toBe(false);
  });
});

describe("public gyms list", () => {
  afterEach(() => {
    resetPublicGymsCache();
    resetGymCatalogCache();
  });

  it("lists gym-type outlets from the public catalog and hides product-only entries", async () => {
    const { fetch, calls } = makeFetch();
    const gyms = await listPublicGyms(fetch);
    const ids = gyms.map((g) => g.id);
    expect(ids).toContain(DEST);
    expect(ids).toContain(HOME);
    expect(ids).not.toContain("ARKPLS01");
    expect(ids).not.toContain("ARKCRP01");
    expect(gyms.find((g) => g.id === DEST)?.name).toContain("Bishan North");
    expect(calls.every((c) => !c.url.includes("/self-service/login") && !c.homeHeader)).toBe(true);
  });

  it("falls back to the public site catalog when the outlet API requires login", async () => {
    const fetchFn: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/brand/outlet") && !url.includes("/booking") && !url.includes("/door")) {
        return new Response(JSON.stringify({ error: "Failed to validate token" }), { status: 401 });
      }
      if (url.includes("app.bundle.js")) {
        return new Response(
          `{label:"Bishan North",longLabel:"Ark Grit • Bishan North",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBSN01"},{label:"Bishan",longLabel:"Ark Grit • Bishan",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBIS01"}`,
          { status: 200 },
        );
      }
      return new Response("unexpected", { status: 500 });
    };
    const gyms = await listPublicGyms(fetchFn);
    expect(gyms.some((g) => g.id === "AGRBSN01")).toBe(true);
    expect(gyms.find((g) => g.id === "AGRBSN01")?.name).toContain("Bishan North");
  });

  it("GET /api/gyms returns the filtered catalog", async () => {
    const { fetch } = makeFetch();
    const previous = globalThis.fetch;
    globalThis.fetch = fetch as typeof fetch;
    try {
      const response = await worker.fetch(new Request("http://localhost/api/gyms"), {} as Env);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { gyms: Array<{ id: string; name: string }> };
      const ids = body.gyms.map((g) => g.id);
      expect(ids).toContain("AGRBSN01");
      expect(ids).not.toContain("ARKPLS01");
      expect(body.gyms.find((g) => g.id === "AGRBSN01")?.name).toContain("Bishan North");
    } finally {
      globalThis.fetch = previous;
    }
  });
});
