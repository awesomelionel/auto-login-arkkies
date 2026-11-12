import type { Booking, BookingBody, CurrentWindow, SlotSelection } from "./types";

const SGT = "Asia/Singapore";

export function parseDoors(doors: unknown): string | null {
  if (doors == null || doors === "") return null;
  if (typeof doors === "string") {
    const first = doors
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    return first ?? null;
  }
  if (Array.isArray(doors)) {
    for (const item of doors) {
      if (typeof item === "string" && item.trim()) {
        const parsed = parseDoors(item);
        if (parsed) return parsed;
      } else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const id = rec.door_id ?? rec.id;
        if (typeof id === "string" && id.trim()) return id.trim();
      }
    }
    return null;
  }
  if (typeof doors === "object") {
    const rec = doors as Record<string, unknown>;
    const id = rec.door_id ?? rec.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

export function parseInstant(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${iso}`);
  }
  return date;
}

/** Inclusive start, exclusive end. A 23:59 end is treated as the end of that minute. */
export function coversNow(startIso: string, endIso: string, now: Date): boolean {
  const start = parseInstant(startIso).getTime();
  const endDate = parseInstant(endIso);
  let end = endDate.getTime();
  if (endDate.getUTCMinutes() === 59 && endDate.getUTCSeconds() === 0) {
    end += 60_000;
  }
  const t = now.getTime();
  return t >= start && t < end;
}

export function findCurrentSlot(selections: SlotSelection[], now: Date): SlotSelection | null {
  const matches = selections.filter((sel) =>
    coversNow(sel.selection_date_time_start, sel.selection_date_time_end, now),
  );
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) =>
      parseInstant(b.selection_date_time_start).getTime() -
      parseInstant(a.selection_date_time_start).getTime(),
  );
  return matches[0];
}

export function findCurrentBooking(
  bookings: Booking[],
  destinationId: string,
  now: Date,
): Booking | null {
  const matches = bookings.filter((booking) => {
    if (booking.deleted_on) return false;
    const dest = booking.booking_slot?.outlet_id;
    if (dest !== destinationId) return false;
    return coversNow(booking.time_start, booking.time_end, now);
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => parseInstant(b.time_start).getTime() - parseInstant(a.time_start).getTime());
  return matches[0];
}

export function buildBookingBody(selection: SlotSelection, subscriptionId: string): BookingBody {
  const slotId = selection.slot?.id;
  if (!slotId) {
    throw new Error("Selection is missing slot.id; refusing to book with the selection id.");
  }
  return {
    time_start: selection.selection_date_time_start,
    time_end: selection.selection_date_time_end,
    purpose_type: "gym-time",
    booking_slot_id: slotId,
    corresponding_item_ids: [subscriptionId],
  };
}

function formatSgtPart(iso: string, withDate: boolean): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SGT,
    ...(withDate
      ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
      : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parseInstant(iso));
}

function sgtDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parseInstant(iso));
}

export function formatRangeSgt(startIso: string, endIso: string): string {
  const start = formatSgtPart(startIso, true);
  const sameDay = sgtDateKey(startIso) === sgtDateKey(endIso);
  const end = formatSgtPart(endIso, !sameDay);
  return `${start} – ${end} SGT`;
}

export function windowFromSelection(selection: SlotSelection, destinationId: string): CurrentWindow {
  return {
    start: selection.selection_date_time_start,
    end: selection.selection_date_time_end,
    label: formatRangeSgt(selection.selection_date_time_start, selection.selection_date_time_end),
    doorId: parseDoors(selection.slot?.doors),
    destinationId: selection.slot?.outlet_id || destinationId,
  };
}

export function windowFromBooking(booking: Booking, destinationId: string): CurrentWindow {
  const dest = booking.booking_slot?.outlet_id || destinationId;
  return {
    start: booking.time_start,
    end: booking.time_end,
    label: formatRangeSgt(booking.time_start, booking.time_end),
    doorId: parseDoors(booking.booking_slot?.doors),
    destinationId: dest,
  };
}
