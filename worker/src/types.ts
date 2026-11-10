export type GymInfo = {
  id: string;
  label: string;
  longLabel: string;
  name: string;
};

export type SlotSelection = {
  id: string;
  selection_date_time_start: string;
  selection_date_time_end: string;
  slot?: {
    id?: string;
    doors?: unknown;
    outlet_id?: string;
  } | null;
};

export type Booking = {
  id?: string;
  outlet_id?: string;
  time_start: string;
  time_end: string;
  deleted_on?: string | null;
  booking_slot?: {
    id?: string;
    outlet_id?: string;
    doors?: unknown;
  } | null;
};

export type Credentials = {
  email: string;
  password: string;
};

export type ActionRequest = Credentials & {
  home?: string;
  destination: string;
};

export type CurrentWindow = {
  start: string;
  end: string;
  label: string;
  doorId: string | null;
  destinationId: string;
};

export type StatusResult = {
  home: GymInfo;
  destination: GymInfo;
  gyms: GymInfo[];
  currentSlot: CurrentWindow | null;
  currentBooking: CurrentWindow | null;
};

export type ActionResult = {
  booked: boolean;
  unlocked: boolean;
  skippedBooking: boolean;
  window: CurrentWindow;
  message: string;
};

export type BookingBody = {
  time_start: string;
  time_end: string;
  purpose_type: "gym-time";
  booking_slot_id: string;
  corresponding_item_ids: string[];
};
