/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pipeline, SLA and next-action rules for the Bookings module. */

export type StageKey =
  | "open"
  | "room_reserved"
  | "viewing_scheduled"
  | "awaiting_fee"
  | "booked"
  | "closed";

export const STAGES: { value: StageKey; label: string }[] = [
  { value: "open", label: "New" },
  { value: "room_reserved", label: "Room reserved" },
  { value: "viewing_scheduled", label: "Viewing" },
  { value: "awaiting_fee", label: "Awaiting payment" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
];

export const STAGE_ORDER: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s.value, i]),
);

export const stageLabel = (v: string) =>
  STAGES.find((s) => s.value === v)?.label ?? v;

export const STAGE_PILL: Record<string, string> = {
  open: "border-sky-200 bg-sky-50 text-sky-900",
  room_reserved: "border-violet-200 bg-violet-50 text-violet-900",
  viewing_scheduled: "border-amber-200 bg-amber-50 text-amber-900",
  awaiting_fee: "border-orange-200 bg-orange-50 text-orange-900",
  booked: "border-emerald-200 bg-emerald-50 text-emerald-900",
  closed: "border-border bg-muted text-muted-foreground",
};

export type ActionKey =
  | "check_availability"
  | "schedule_viewing"
  | "complete_viewing"
  | "generate_invoice"
  | "confirm_payment"
  | "create_resident"
  | "view_resident"
  | "none";

export const ACTIONS: { value: ActionKey; label: string }[] = [
  { value: "check_availability", label: "Check availability" },
  { value: "schedule_viewing", label: "Schedule viewing" },
  { value: "complete_viewing", label: "Complete viewing" },
  { value: "generate_invoice", label: "Generate invoice" },
  { value: "confirm_payment", label: "Verify booking fee" },
  { value: "create_resident", label: "Create resident" },
  { value: "view_resident", label: "View resident" },
  { value: "none", label: "—" },
];

export const actionLabel = (v: ActionKey) =>
  ACTIONS.find((a) => a.value === v)?.label ?? "—";

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
 * Works out the single next action for an enquiry plus its SLA deadline.
 * `viewingAt` is the start time of the linked upcoming appointment, if any.
 */
export function nextActionFor(row: any, viewingAt?: string | undefined): NextAction {
  const stageAt = ts(row.stage_changed_at) ?? ts(row.updated_at) ?? ts(row.created_at);

  switch (row.status as StageKey) {
    case "open": {
      const from = ts(row.created_at);
      return {
        action: "check_availability",
        label: "Check availability",
        due: from ? from + 24 * HOUR : undefined,
        window: 24 * HOUR,
      };
    }
    case "room_reserved":
      return {
        action: "schedule_viewing",
        label: "Schedule viewing",
        due: stageAt ? stageAt + 2 * DAY : undefined,
        window: 2 * DAY,
      };
    case "viewing_scheduled": {
      const done = ts(row.viewing_completed_at);
      if (!done) {
        const at = ts(viewingAt);
        return {
          action: "complete_viewing",
          label: "Complete viewing",
          due: at,
          window: at && stageAt ? Math.max(HOUR, at - stageAt) : undefined,
        };
      }
      return {
        action: "generate_invoice",
        label: "Generate invoice",
        due: done + 2 * DAY,
        window: 2 * DAY,
      };
    }
    case "awaiting_fee": {
      const from = ts(row.invoice_issued_at) ?? stageAt;
      return {
        action: "confirm_payment",
        label: "Verify booking fee",
        due: from ? from + 5 * DAY : undefined,
        window: 5 * DAY,
      };
    }
    case "booked": {
      if (row.resident_id) return { action: "view_resident", label: "View resident" };
      const from = ts(row.fee_received_at) ?? stageAt;
      return {
        action: "create_resident",
        label: "Create resident",
        due: from ? from + 3 * DAY : undefined,
        window: 3 * DAY,
      };
    }
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
    tone: remaining < 0 ? ("over" as const) : remaining < 6 * HOUR ? ("soon" as const) : ("ok" as const),
  };
}

export const SLA_TONE: Record<string, string> = {
  ok: "text-foreground",
  soon: "text-amber-600",
  over: "text-rose-600",
  muted: "text-muted-foreground",
};
