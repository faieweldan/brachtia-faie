/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Who did what on a booking.
 *
 * Every step on a booking - reserving its room, booking or cancelling a viewing,
 * issuing, editing or cancelling an invoice, recording money, releasing the bed,
 * closing it - is done by the booking's assigned staff member. There is no step
 * without one: it is refused until someone is assigned, and the audit row it
 * leaves carries their name.
 */

export const NEED_STAFF = "Assign a staff member to this booking first";

export type BookingEventKind =
  | "staff_assigned"
  | "room_reserved"
  | "room_released"
  | "viewing_booked"
  | "viewing_moved"
  | "viewing_cancelled"
  | "viewing_completed"
  | "invoice_issued"
  | "invoice_edited"
  | "invoice_cancelled"
  | "payment_recorded"
  | "welcome_sent"
  | "stage_changed"
  | "stay_updated"
  | "booking_closed";

/** The booking's assigned staff member. Refused when nobody is assigned. */
export async function staffFor(supabase: any, enquiryId: string): Promise<string> {
  const { data, error } = await supabase
    .from("enquiries")
    .select("assigned_staff")
    .eq("id", enquiryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const staff = String((data as any)?.assigned_staff ?? "").trim();
  if (!staff) throw new Error(NEED_STAFF);
  return staff;
}

/**
 * Saves one audit row. The step it describes has already happened, so a failed
 * write goes to the server log rather than undoing the step.
 */
export async function logBookingEvent(
  supabase: any,
  event: {
    enquiryId: string;
    staff: string;
    kind: BookingEventKind;
    ref?: string | undefined;
    summary: string;
  },
) {
  const { error } = await supabase.from("booking_events").insert({
    enquiry_id: event.enquiryId,
    staff: event.staff,
    kind: event.kind,
    ref: event.ref ?? "",
    summary: event.summary,
  });
  if (error) console.warn(`booking_events: ${error.message}`);
}

export const rm = (n: unknown) =>
  `RM${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const when = (d: string) =>
  new Date(d).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });

export const words = (s: string) => s.replace(/_/g, " ");
