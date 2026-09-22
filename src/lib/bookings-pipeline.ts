/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pipeline, SLA and next-action rules for the Bookings module.
 *
 * A booking moves through seven stages, in order, each set by the thing that
 * actually happened - never by a button that only says it did:
 *
 *   New               the enquiry arrives
 *   Room reserved     a room is reserved for it
 *   Viewing           a viewing is booked - optional
 *   Awaiting payment  the invoice is issued; the booking fee is not in yet
 *   Booked            the booking fee is in and the room confirmed - the invoice
 *                     may still have a balance
 *   Closed            admin closes it
 *
 * "Awaiting balance" is kept for bookings from before the fee made them Booked.
 */

export type StageKey =
  | "open"
  | "room_reserved"
  | "viewing_scheduled"
  | "awaiting_fee"
  | "awaiting_payment"
  | "booked"
  | "closed";

export const STAGES: { value: StageKey; label: string }[] = [
  { value: "open", label: "New" },
  { value: "room_reserved", label: "Room reserved" },
  { value: "viewing_scheduled", label: "Viewing" },
  { value: "awaiting_fee", label: "Awaiting payment" },
  { value: "awaiting_payment", label: "Awaiting balance" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
];

export const STAGE_ORDER: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s.value, i]),
);

export const stageLabel = (v: string) => STAGES.find((s) => s.value === v)?.label ?? v;

export const STAGE_PILL: Record<string, string> = {
  open: "border-sky-200 bg-sky-50 text-sky-900",
  room_reserved: "border-violet-200 bg-violet-50 text-violet-900",
  viewing_scheduled: "border-amber-200 bg-amber-50 text-amber-900",
  awaiting_fee: "border-orange-200 bg-orange-50 text-orange-900",
  awaiting_payment: "border-rose-200 bg-rose-50 text-rose-900",
  booked: "border-emerald-200 bg-emerald-50 text-emerald-900",
  closed: "border-border bg-muted text-muted-foreground",
};

export type ActionKey =
  | "reserve_room"
  | "schedule_viewing"
  | "assign_viewing_staff"
  | "generate_invoice"
  | "upload_booking_fee"
  | "record_payment"
  | "create_resident"
  | "view_resident"
  | "none";

export const ACTIONS: { value: ActionKey; label: string }[] = [
  { value: "reserve_room", label: "Reserve room" },
  { value: "schedule_viewing", label: "Schedule viewing" },
  { value: "assign_viewing_staff", label: "Assign staff" },
  { value: "generate_invoice", label: "Generate invoice" },
  { value: "upload_booking_fee", label: "Upload booking fee" },
  { value: "record_payment", label: "Record payment" },
  { value: "create_resident", label: "Create resident" },
  { value: "view_resident", label: "View resident" },
  { value: "none", label: "—" },
];

export const actionLabel = (v: ActionKey) => ACTIONS.find((a) => a.value === v)?.label ?? "—";

/**
 * The words the bookings list uses for each next action. The list is the team's
 * to-do view, so it says what to do in their words; the booking page keeps the
 * button names above.
 */
const LIST_WORDS: Partial<Record<ActionKey, string>> = {
  reserve_room: "Check availability",
  upload_booking_fee: "Upload payment",
};

export const listActionLabel = (v: ActionKey) => LIST_WORDS[v] ?? actionLabel(v);

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export type NextAction = {
  action: ActionKey;
  label: string;
  /** deadline in ms epoch, undefined when there is no clock */
  due?: number | undefined;
  /** total window in ms, used to shade the SLA */
  window?: number | undefined;
};

const ts = (v?: string | null) => (v ? new Date(v).getTime() : undefined);

/**
 * The one next action for a booking, and when it is due. Each stage has a
 * single action, so the button always matches the stage beside it.
 * `viewingAt` is the start time of the linked upcoming appointment, if any, and
 * `viewingStaff` who is taking it - a student books their own viewing through
 * their link, which names nobody, so somebody has to before it goes ahead.
 */
export function nextActionFor(
  row: any,
  viewingAt?: string | undefined,
  viewingStaff?: string | undefined,
): NextAction {
  const stageAt = ts(row.stage_changed_at) ?? ts(row.updated_at) ?? ts(row.created_at);

  switch (row.status as StageKey) {
    case "open": {
      const from = ts(row.created_at);
      return {
        action: "reserve_room",
        label: "Reserve room",
        due: from ? from + DAY : undefined,
        window: DAY,
      };
    }
    case "room_reserved":
      // a viewing comes first; it is optional, so the invoice is offered beside it
      return {
        action: "schedule_viewing",
        label: "Schedule viewing",
        due: stageAt ? stageAt + 2 * DAY : undefined,
        window: 2 * DAY,
      };
    case "viewing_scheduled": {
      // a viewing is optional: with an appointment the invoice is due five days
      // after it, without one it is due a day after the booking reached this stage
      const appointment = ts(viewingAt);
      // booked, but nobody is taking it - that comes before the invoice
      if (appointment && !String(viewingStaff ?? "").trim()) {
        return {
          action: "assign_viewing_staff",
          label: "Assign staff for the viewing",
          due: stageAt ? stageAt + DAY : undefined,
          window: DAY,
        };
      }
      if (appointment) {
        return {
          action: "generate_invoice",
          label: "Generate invoice",
          due: appointment + 5 * DAY,
          window: 5 * DAY,
        };
      }
      const from = ts(row.viewing_completed_at) ?? stageAt;
      return {
        action: "generate_invoice",
        label: "Issue invoice",
        due: from ? from + DAY : undefined,
        window: DAY,
      };
    }
    case "awaiting_fee": {
      const from = ts(row.invoice_issued_at) ?? stageAt;
      return {
        action: "upload_booking_fee",
        label: "Upload booking fee",
        due: from ? from + 14 * DAY : undefined,
        window: 14 * DAY,
      };
    }
    case "awaiting_payment":
      // a booking fee paid before residents were created automatically
      if (!row.resident_id) return { action: "create_resident", label: "Create resident" };
      // the fee is in and they are a resident: the balance is money on their
      // Payments tab, not on the booking, so the step is to go there
      return { action: "view_resident", label: "View resident" };
    case "booked":
      if (!row.resident_id) return { action: "create_resident", label: "Create resident" };
      return { action: "view_resident", label: "View resident" };
    default:
      return { action: "none", label: "—" };
  }
}

export function slaText(due?: number | undefined, now = Date.now()) {
  if (!due) return { text: "—", tone: "muted" as const, remaining: Number.MAX_SAFE_INTEGER };
  const remaining = due - now;
  const abs = Math.abs(remaining);
  const unit =
    abs >= DAY
      ? `${Math.round(abs / DAY)}d`
      : abs >= HOUR
        ? `${Math.round(abs / HOUR)}h`
        : `${Math.max(1, Math.round(abs / 60000))}m`;
  return {
    remaining,
    text: remaining >= 0 ? `${unit} left` : `${unit} overdue`,
    tone:
      remaining < 0
        ? ("over" as const)
        : remaining < 6 * HOUR
          ? ("soon" as const)
          : ("ok" as const),
  };
}

export const SLA_TONE: Record<string, string> = {
  ok: "text-foreground",
  soon: "text-amber-600",
  over: "text-rose-600",
  muted: "text-muted-foreground",
};
