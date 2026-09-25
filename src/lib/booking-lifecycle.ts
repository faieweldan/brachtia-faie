import { logBookingEvent } from "@/lib/booking-events";
import { STAGE_ORDER, stageLabel } from "@/lib/bookings-pipeline";
import { BOOKING_FEE, liveInvoices } from "@/lib/invoices";
import { SCHEDULES, normCountry, normGender, normUniversity } from "@/lib/reference-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a booking's money does to the booking.
 *
 * "Paid" is one moment, and both rules here hang on it:
 *   - once paid, the booking becomes a resident (residentFromBooking)
 *   - until paid, its room can be released, and the invoice goes with the room
 *     (releaseBooking); after, the student is moved instead
 *
 * Server only - each is handed the service-role client by a server function.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function monthsBetween(start: string, end: string) {
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / (30.44 * 86400000)) : 0;
}

async function findResident(supabase: any, enquiry: any): Promise<string | null> {
  if (UUID.test(String(enquiry.resident_id ?? ""))) {
    const { data } = await supabase
      .from("residents")
      .select("id")
      .eq("id", enquiry.resident_id)
      .maybeSingle();
    if (data) return data.id as string;
  }
  const { data } = await supabase
    .from("residents")
    .select("id")
    .eq("enquiry_id", enquiry.id)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Turning a paid booking into a resident.
 *
 * The booking fee is the moment a student stops being an enquiry: before it the
 * booking can still fall through, after it they are coming. So the payment
 * creates the resident - automatically, because a step an admin has to remember
 * gets forgotten, and when it was done by hand the bed, the dates and the rent
 * were left behind on the booking.
 *
 * Everything the booking already knows is carried across, once, here:
 *   the person   name, email, phone, nationality, gender, university
 *   the stay     move-in, room type, lease length, payment plan
 *   the bed      the bed held for the booking now names the resident, with the
 *                tenancy dates and the rent the student agreed to
 *   the money    the booking's invoices, payments and receipts
 *
 * Safe to run again: a booking that already has its resident keeps that
 * resident, and the money is simply linked to them again. `changed` says
 * whether a resident was created or a bed filled, so the page reloads only then.
 */
export async function residentFromBooking(supabase: any, enquiryId: string) {
  const [enquiryRes, invoiceRes, bedsRes] = await Promise.all([
    supabase.from("enquiries").select("*").eq("id", enquiryId).maybeSingle(),
    // the invoice is what the student agreed to - the price list may have moved since
    liveInvoices(supabase, "monthly_rent, payment_frequency, tenancy_start, tenancy_end")
      .eq("enquiry_id", enquiryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("beds").select("id, resident_id").eq("enquiry_id", enquiryId),
  ]);
  if (enquiryRes.error) throw new Error(enquiryRes.error.message);
  const enquiry = enquiryRes.data;
  if (!enquiry) throw new Error("Booking not found");
  const invoice = invoiceRes.data;

  const moveIn = String(invoice?.tenancy_start || enquiry.move_in || "");
  const moveOut = String(invoice?.tenancy_end || enquiry.move_out || "");
  const agreedRent = Number(invoice?.monthly_rent || enquiry.monthly_rent || 0);
  const schedule = String(invoice?.payment_frequency || enquiry.payment_term || "");

  /* ---- 1. the person ---- */
  let residentId = await findResident(supabase, enquiry);
  const created = !residentId;
  if (!residentId) {
    const months = moveIn && moveOut ? monthsBetween(moveIn, moveOut) : 0;
    const { data: made, error: makeErr } = await supabase
      .from("residents")
      .insert({
        enquiry_id: enquiry.id,
        full_name: enquiry.full_name ?? "",
        email: enquiry.email ?? "",
        mobile: enquiry.phone ?? "",
        // the same spellings the form and the master list use
        nationality: normCountry(String(enquiry.nationality ?? "")).value,
        gender: normGender(String(enquiry.gender ?? "")).value,
        university: normUniversity(String(enquiry.university ?? "")).value,
        occupancy: enquiry.occupancy ?? "",
        move_in: moveIn,
        lease_months: months ? String(months) : "",
        // a plan the resident page does not offer is left for the admin to pick
        pay_schedule: SCHEDULES.some((s) => s.value === schedule) ? schedule : "",
      })
      .select("id")
      .single();
    if (makeErr) throw new Error(makeErr.message);
    residentId = made.id as string;
  }

  /* ---- 2. the bed, the booking and the money, together ---- */
  const beds = (bedsRes.data ?? []) as { id: string; resident_id: string | null }[];
  // a bed already theirs is left alone - a later payment must not turn a
  // checked-in bed back into "booked" - and a bed someone else is in is never taken
  const bed = beds.some((b) => b.resident_id === residentId)
    ? null
    : beds.find((b) => !b.resident_id);

  const writes = await Promise.all([
    bed
      ? supabase
          .from("beds")
          .update({
            resident_id: residentId,
            resident_name: enquiry.full_name ?? null,
            status: "booked",
            hold_for: null,
            hold_until: null,
            tenancy_start: moveIn || null,
            tenancy_end: moveOut || null,
            // an agreed rent stays with the bed while they live in it
            ...(agreedRent > 0 ? { rent: agreedRent } : {}),
          })
          .eq("id", bed.id)
      : { error: null },
    supabase
      .from("enquiries")
      .update({ resident_id: residentId, updated_at: new Date().toISOString() })
      .eq("id", enquiryId),
    ...(["invoices", "payments", "receipts"] as const).map((table) =>
      supabase.from(table).update({ resident_id: residentId }).eq("enquiry_id", enquiryId),
    ),
  ]);
  const failed = writes.find((w: any) => w.error);
  if (failed) throw new Error(failed.error.message);

  /* ---- 3. the tenancy: the stay's own record - its rent schedule belongs to it ---- */
  const { data: hasTenancy, error: tenancyReadErr } = await supabase
    .from("tenancies")
    .select("id")
    .eq("enquiry_id", enquiryId)
    .maybeSingle();
  if (tenancyReadErr) throw new Error(tenancyReadErr.message);
  if (!hasTenancy) {
    const { data: tenancy, error: tenancyErr } = await supabase
      .from("tenancies")
      .insert({
        resident_id: residentId,
        enquiry_id: enquiryId,
        bed_id: bed?.id ?? beds.find((b) => b.resident_id === residentId)?.id ?? null,
        start_date: moveIn || null,
        end_date: moveOut || null,
      })
      .select("id")
      .single();
    if (tenancyErr) throw new Error(tenancyErr.message);

    /* ---- 4. their rent, invoiced ahead to the end of the tenancy ---- */
    // the resident exists either way: rent that cannot be set up yet waits on the Payments tab
    try {
      const { prepareTenancyRent } = await import("@/lib/rent-schedule.server");
      await prepareTenancyRent(supabase, String(tenancy.id));
    } catch (err) {
      console.warn(`rent schedule: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // given by the database as the resident is saved - blank until gender and nationality are known
  const { data: ids } = await supabase
    .from("residents")
    .select("resident_code, quickbooks_id")
    .eq("id", residentId)
    .maybeSingle();
  return {
    residentId,
    residentCode: String(ids?.resident_code || ids?.quickbooks_id || ""),
    changed: created || !!bed,
  };
}

/**
 * Before a booking's bed is released: say whether it may be, and undo what was
 * built on that room.
 *
 * Paid - the student is a resident with money on record. The bed is not
 * released; they are moved to another bed, and their payment stays with them.
 *
 * Not paid - the invoice priced a room they no longer have, so it is cancelled:
 * kept and marked void, never deleted, because an invoice number once issued
 * is a record. The bed held for it is freed here too, so the stage that follows
 * (syncBookingStage) sees the room is gone.
 */
export async function releaseBooking(supabase: any, enquiryId: string) {
  const now = new Date().toISOString();

  const paymentsRes = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("enquiry_id", enquiryId);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if ((paymentsRes.count ?? 0) > 0) return { ok: false as const, voided: [] as string[] };

  const [voidRes, enquiryRes, bedRes] = await Promise.all([
    supabase
      .from("invoices")
      .update({ status: "void", updated_at: now })
      .eq("enquiry_id", enquiryId)
      .neq("status", "void")
      .select("number"),
    supabase
      .from("enquiries")
      .update({ invoice_issued_at: null, updated_at: now })
      .eq("id", enquiryId),
    // a held bed only - a booked or lived-in bed belongs to a paying resident
    supabase
      .from("beds")
      .update({
        status: "vacant",
        enquiry_id: null,
        hold_for: null,
        hold_until: null,
        resident_name: null,
        student_id: null,
        university: null,
        nationality: null,
        gender: null,
        tenancy_start: null,
        tenancy_end: null,
      })
      .eq("enquiry_id", enquiryId)
      .eq("status", "held"),
  ]);
  if (voidRes.error) throw new Error(voidRes.error.message);
  if (enquiryRes.error) throw new Error(enquiryRes.error.message);
  if (bedRes.error) throw new Error(bedRes.error.message);

  return {
    ok: true as const,
    voided: ((voidRes.data ?? []) as any[]).map((v) => String(v.number)),
  };
}

/**
 * The stage a booking is really at, worked out from what is true of it now - so
 * it goes back as well as forward. Each step used to move the stage by itself,
 * and only some could move it back: a released room left a booking at Viewing
 * with no room, and a cancelled viewing never moved it at all.
 *
 *   the booking fee paid in full       Booked
 *   part of the booking fee paid       Awaiting balance
 *   a live invoice, nothing paid yet   Awaiting payment
 *   the student asked for an invoice   Invoice requested
 *   a viewing booked, or one completed Viewing
 *   a bed held for it                  Room reserved
 *   none of these                      New
 *
 * A closed booking is left alone. A real change is logged with the booking's
 * staff member, so Recent activity shows a step back too.
 */
export async function syncBookingStage(supabase: any, enquiryId: string) {
  const { data: enquiry, error } = await supabase
    .from("enquiries")
    .select("status, viewing_completed_at, viewing_skipped_at, assigned_staff")
    .eq("id", enquiryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enquiry || enquiry.status === "closed") return;

  const [invoiceRes, viewingRes, bedRes] = await Promise.all([
    liveInvoices(supabase, "id").eq("enquiry_id", enquiryId),
    supabase
      .from("appointments")
      .select("id")
      .eq("enquiry_id", enquiryId)
      .neq("status", "cancelled"),
    supabase.from("beds").select("id").eq("enquiry_id", enquiryId),
  ]);
  const invoiceIds = ((invoiceRes.data ?? []) as any[]).map((i) => i.id);
  /*
   * How much is in, not how many payments there are. A student who pays RM250
   * of the RM500 today and the rest on Friday has made one payment and still
   * owes half the fee - counting rows called that Booked on the first one, and
   * the room was confirmed for money that had not arrived.
   */
  const paidTotal = invoiceIds.length
    ? (
        ((await supabase.from("payments").select("amount").in("invoice_id", invoiceIds)).data ??
          []) as any[]
      ).reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
    : 0;
  // the same test admin.functions makes before it creates the resident,
  // tolerance and all, so the stage and the resident cannot disagree
  const feeIn = paidTotal + 0.005 >= BOOKING_FEE;

  /*
   * Asking for the invoice comes above any viewing on purpose. It is the last
   * thing the student said - they pressed "Request booking invoice" on their
   * own link - and a viewing booked earlier does not take that back. Without
   * this, every recompute quietly put them back to Viewing and the request
   * disappeared.
   */
  const next = feeIn
    ? "booked"
    : paidTotal > 0
      ? "awaiting_payment"
      : invoiceIds.length
        ? "awaiting_fee"
        : enquiry.viewing_skipped_at
          ? "invoice_requested"
          : (viewingRes.data ?? []).length || enquiry.viewing_completed_at
            ? "viewing_scheduled"
            : (bedRes.data ?? []).length
              ? "room_reserved"
              : "open";
  if (next === enquiry.status) return;

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("enquiries")
    .update({ status: next, stage_changed_at: now, updated_at: now })
    .eq("id", enquiryId);
  if (upErr) throw new Error(upErr.message);

  const staff = String(enquiry.assigned_staff ?? "").trim();
  if (staff) {
    const back = (STAGE_ORDER[next] ?? 0) < (STAGE_ORDER[enquiry.status] ?? 0);
    await logBookingEvent(supabase, {
      enquiryId,
      staff,
      kind: "stage_changed",
      summary: `Stage ${back ? "back to" : "moved to"} ${stageLabel(next)}`,
    });
  }
}
