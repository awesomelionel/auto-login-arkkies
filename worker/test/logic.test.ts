import { describe, expect, it } from "vitest";
import {
  buildBookingBody,
  coversNow,
  findCurrentBooking,
  findCurrentSlot,
  formatRangeSgt,
  parseDoors,
  windowFromBooking,
  windowFromSelection,
} from "../src/logic";
import { FALLBACK_GYMS, catalogFromOutletList, filterGymOutlets, isGymOutlet, parseAllowedOutletIds, parseGymCatalog, resolveGym, resolveGyms } from "../src/gyms";
import type { Booking, SlotSelection } from "../src/types";

const home = "AGRBIS01";
const dest = "AGRBSN01";

function selection(overrides: Partial<SlotSelection> & Pick<SlotSelection, "selection_date_time_start" | "selection_date_time_end">): SlotSelection {
  return {
    id: overrides.id ?? "selection-id",
    selection_date_time_start: overrides.selection_date_time_start,
    selection_date_time_end: overrides.selection_date_time_end,
    slot: overrides.slot ?? { id: "slot-id", doors: "AGRBSN01-D01", outlet_id: dest },
  };
}

describe("parseDoors", () => {
  it("returns a single door string", () => {
    expect(parseDoors("AGRBSN01-D01")).toBe("AGRBSN01-D01");
  });

  it("takes the first id from a comma-separated list", () => {
    expect(parseDoors("AGRBSN01-D01, AGRBSN01-D02")).toBe("AGRBSN01-D01");
  });

  it("reads door objects from an array", () => {
    expect(parseDoors([{ id: "AGRBSN01-D01", name: "Main Door" }])).toBe("AGRBSN01-D01");
    expect(parseDoors([{ door_id: "AGRBSN01-D02" }])).toBe("AGRBSN01-D02");
  });

  it("returns null for empty values", () => {
    expect(parseDoors(null)).toBeNull();
    expect(parseDoors("")).toBeNull();
    expect(parseDoors([])).toBeNull();
  });
});

describe("slot selection by time", () => {
  const slots: SlotSelection[] = [
    selection({
      id: "sel-morning",
      slot: { id: "slot-morning", doors: "AGRBSN01-D01", outlet_id: dest },
      selection_date_time_start: "2026-11-10T09:00:00+08:00",
      selection_date_time_end: "2026-11-10T12:00:00+08:00",
    }),
    selection({
      id: "sel-afternoon",
      slot: { id: "slot-afternoon", doors: "AGRBSN01-D01", outlet_id: dest },
      selection_date_time_start: "2026-11-10T12:00:00+08:00",
      selection_date_time_end: "2026-11-10T15:00:00+08:00",
    }),
    selection({
      id: "sel-late",
      slot: { id: "slot-late", doors: "AGRBSN01-D01", outlet_id: dest },
      selection_date_time_start: "2026-11-10T21:00:00+08:00",
      selection_date_time_end: "2026-11-10T23:59:00+08:00",
    }),
  ];

  it("picks the slot whose window contains now in SGT", () => {
    const now = new Date("2026-11-10T02:30:00Z"); // 10:30 SGT
    const current = findCurrentSlot(slots, now);
    expect(current?.slot?.id).toBe("slot-morning");
  });

  it("at a shared boundary, uses the slot that is starting", () => {
    const now = new Date("2026-11-10T04:00:00Z"); // 12:00 SGT
    const current = findCurrentSlot(slots, now);
    expect(current?.slot?.id).toBe("slot-afternoon");
  });

  it("includes a 23:59 closing time through the end of that minute", () => {
    expect(coversNow("2026-11-10T21:00:00+08:00", "2026-11-10T23:59:00+08:00", new Date("2026-11-10T15:59:30Z"))).toBe(true);
    expect(findCurrentSlot(slots, new Date("2026-11-10T15:59:30Z"))?.slot?.id).toBe("slot-late");
  });

  it("returns null outside all windows", () => {
    expect(findCurrentSlot(slots, new Date("2026-11-10T00:30:00Z"))).toBeNull();
  });
});

describe("existing booking detection", () => {
  const bookings: Booking[] = [
    {
      id: "b1",
      outlet_id: home, // home gym, not the destination
      time_start: "2026-11-10T01:00:00Z",
      time_end: "2026-11-10T04:00:00Z",
      booking_slot: { id: "slot-morning", outlet_id: dest, doors: "AGRBSN01-D01" },
    },
  ];

  it("matches the destination from booking_slot.outlet_id, not booking.outlet_id", () => {
    const now = new Date("2026-11-10T02:30:00Z");
    expect(findCurrentBooking(bookings, dest, now)?.id).toBe("b1");
    expect(findCurrentBooking(bookings, home, now)).toBeNull();
  });

  it("ignores deleted bookings and bookings outside the window", () => {
    const deleted: Booking[] = [{ ...bookings[0], deleted_on: "2026-11-10T02:00:00Z" }];
    expect(findCurrentBooking(deleted, dest, new Date("2026-11-10T02:30:00Z"))).toBeNull();
    expect(findCurrentBooking(bookings, dest, new Date("2026-11-10T05:00:00Z"))).toBeNull();
  });
});

describe("booking body shape", () => {
  it("uses slot.id as booking_slot_id, not the selection id", () => {
    const sel = selection({
      id: "fdd7cd67-selection",
      slot: { id: "effed7aa-slot", doors: "AGRBSN01-D01", outlet_id: dest },
      selection_date_time_start: "2026-11-10T09:00:00+08:00",
      selection_date_time_end: "2026-11-10T12:00:00+08:00",
    });
    const body = buildBookingBody(sel, "sub_example");
    expect(body).toEqual({
      time_start: "2026-11-10T09:00:00+08:00",
      time_end: "2026-11-10T12:00:00+08:00",
      purpose_type: "gym-time",
      booking_slot_id: "effed7aa-slot",
      corresponding_item_ids: ["sub_example"],
    });
    expect(body.booking_slot_id).not.toBe(sel.id);
  });

  it("refuses to book with a missing slot id", () => {
    const sel = selection({
      selection_date_time_start: "2026-11-10T09:00:00+08:00",
      selection_date_time_end: "2026-11-10T12:00:00+08:00",
      slot: { doors: "AGRBSN01-D01" },
    });
    expect(() => buildBookingBody(sel, "sub_example")).toThrow(/slot.id/);
  });
});

describe("gym name parsing", () => {
  const snippet = `{label:"Woodlands",longLabel:"Ark Grit • Woodlands",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRWDL01",isComingSoon:!1},{label:"Bishan North",longLabel:"Ark Grit • Bishan North",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBSN01",isComingSoon:!1},{label:"Bishan",longLabel:"Ark Grit • Bishan",type:"navigate",navigateTo:"/portal/outlet?outlet-id=AGRBIS01"}`;

  it("derives labels from the /brand/outlet catalog", () => {
    const catalog = catalogFromOutletList([
      { id: "AGRBIS01", name: "Ark Grit @ Bishan" },
      { id: "AGRBSN01", name: "Ark Grit @ Bishan North" },
    ]);
    expect(catalog.AGRBSN01).toEqual({ label: "Bishan North", longLabel: "Ark Grit @ Bishan North" });
  });

  it("extracts label, longLabel and outlet id from the site bundle", () => {
    const catalog = parseGymCatalog(snippet);
    expect(catalog.AGRBSN01).toEqual({ label: "Bishan North", longLabel: "Ark Grit • Bishan North" });
    expect(catalog.AGRBIS01.label).toBe("Bishan");
    expect(Object.keys(catalog)).toHaveLength(3);
  });

  it("falls back to the bundled snapshot, then the raw id", () => {
    expect(resolveGym("AGRBSN01").name).toBe("Ark Grit • Bishan North");
    expect(FALLBACK_GYMS.AGRBIS01.label).toBe("Bishan");
    expect(resolveGym("UNKNOWN99").name).toBe("UNKNOWN99");
  });

  it("includes the home gym and sorts allowed gyms by name", () => {
    const ids = parseAllowedOutletIds("AGRBSN01,AGRHUG01", "AGRBIS01");
    expect(ids[0]).toBe("AGRBIS01");
    const gyms = resolveGyms(ids);
    expect(gyms.map((g) => g.id)).toEqual(["AGRBIS01", "AGRBSN01", "AGRHUG01"]);
  });
});

describe("window labels", () => {
  it("formats UTC booking times in SGT", () => {
    const label = formatRangeSgt("2026-11-10T01:00:00Z", "2026-11-10T04:00:00Z");
    expect(label).toContain("9:00");
    expect(label).toContain("12:00");
    expect(label).toContain("SGT");
    const booking: Booking = {
      time_start: "2026-11-10T01:00:00Z",
      time_end: "2026-11-10T04:00:00Z",
      outlet_id: home,
      booking_slot: { outlet_id: dest, doors: "AGRBSN01-D01" },
    };
    expect(windowFromBooking(booking, dest).doorId).toBe("AGRBSN01-D01");
    expect(windowFromSelection(
      selection({
        selection_date_time_start: "2026-11-10T09:00:00+08:00",
        selection_date_time_end: "2026-11-10T12:00:00+08:00",
      }),
      dest,
    ).label).toContain("SGT");
  });
});

describe("gym outlet filtering", () => {
  it("keeps physical gyms and drops product-only outlets", () => {
    expect(isGymOutlet({ id: "AGRBSN01", name: "Ark Grit @ Bishan North" })).toBe(true);
    expect(isGymOutlet({ id: "AMOWLH01", name: "Ark Move @ Woodleigh" })).toBe(true);
    expect(isGymOutlet({ id: "ARKPLS01", name: "Ark+", brand: { name: "Ark Premium Access" } })).toBe(false);
    expect(isGymOutlet({ id: "ARKCRP01", name: "Corp+", brand: { name: "Ark Corporate" } })).toBe(false);
  });

  it("falls back to every named outlet if nothing looks like a gym", () => {
    const odd = [{ id: "ZZZ001", name: "Mystery Venue" }];
    expect(filterGymOutlets(odd)).toEqual(odd);
  });
});
