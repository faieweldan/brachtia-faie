import { createServerFn } from "@tanstack/react-start";

import { logBookingEvent, rm, staffFor, when, words } from "@/lib/booking-events";
import { stageLabel } from "@/lib/bookings-pipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What happened on a booking, newest first, and who did it.
 *
 * Steps taken since the audit trail began are read from booking_events, each
 * with its staff member. Older bookings have no rows there, so their steps are
 * read back from what they left behind - the enquiry, its viewings, invoices
 * (a cancelled one is kept as void), payments and receipts, and the resident.
 * A step that is in both is shown once, from the audit trail.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** `staff` is empty only for steps from before the audit trail. */
export type ActivityEvent = { at: string; text: string; staff: string };

/** One audited step, oldest first - Booking Progress reads who did each stage from it. */
export type TrailStep = { kind: string; at: string; staff: string };

export type BookingActivity = { events: ActivityEvent[]; trail: TrailStep[] };

/**
 * A step done in the browser - reserving a bed, sending the welcome message -
 * logged by its staff member.
 */
export const recordBookingEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      enquiryId: string;
      kind: "room_reserved" | "welcome_sent" | "stay_updated";
      ref?: string;
      summary: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const staff = await staffFor(supabase, data.enquiryId);
    await logBookingEvent(supabase, { ...data, staff });
    // the booking's last step: once sent, its Next Action moves on
    if (data.kind === "welcome_sent") {
      await supabase
        .from("enquiries")
        .update({ welcome_sent_at: new Date().toISOString() })
        .eq("id", data.enquiryId)
        .is("welcome_sent_at", null);
    }
    return { ok: true };
  });

export const getBookingActivity = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }): Promise<BookingActivity> => {
    const supabase = await admin();
    const id = data.enquiryId;

    const [enquiry, logs, viewings, invoices] = await Promise.all([
      supabase
        .from("enquiries")
        .select("created_at, status, stage_changed_at, viewing_completed_at, resident_id")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("booking_events")
        .select("created_at, kind, ref, summary, staff")
        .eq("enquiry_id", id),
      supabase
        .from("appointments")
        .select("id, created_at, updated_at, starts_at, status, history")
        .eq("enquiry_id", id),
      supabase
        .from("invoices")
        .select("id, number, invoice_type, total, status, created_at, updated_at")
        .eq("enquiry_id", id),
    ]);
    const row = enquiry.data as any;
    if (!row) return { events: [], trail: [] };

    // money is found through the booking's invoices: a payment recorded later on
    // the resident's Payments tab carries the invoice, not always the enquiry
    const invoiceIds = ((invoices.data ?? []) as any[]).map((i) => i.id);
    const [payments, receipts] = invoiceIds.length
      ? await Promise.all([
          supabase
            .from("payments")
            .select("id, invoice_id, amount, method, created_at")
            .in("invoice_id", invoiceIds),
          supabase.from("receipts").select("payment_id, number").in("invoice_id", invoiceIds),
        ])
      : [{ data: [] }, { data: [] }];

    // until the booking_events migration is run, this is simply empty
    const logged = (logs.data ?? []) as any[];
    const loggedKeys = new Set(logged.map((l) => `${l.kind}:${l.ref}`));
    const events: ActivityEvent[] = logged.map((l) => ({
      at: l.created_at,
      text: l.summary,
      staff: l.staff,
    }));
    /** A step read back from the records - skipped when the audit trail has it. */
    const push = (at: string | null | undefined, text: string, key = "") => {
      if (at && !(key && loggedKeys.has(key))) events.push({ at, text, staff: "" });
    };

    push(row.created_at, "Enquiry submitted");
    if (row.status !== "open")
      // only for bookings from before stage changes were logged - the log has each one
      push(row.stage_changed_at, `Stage changed to ${stageLabel(row.status)}`, "stage_changed:");

    for (const v of (viewings.data ?? []) as any[]) {
      push(v.created_at, `Viewing booked for ${when(v.starts_at)}`, `viewing_booked:${v.id}`);
      const history = Array.isArray(v.history) ? (v.history as any[]) : [];
      for (const h of history) {
        if (h.kind === "rescheduled" && h.to) push(h.at, `Viewing moved to ${when(h.to)}`);
        if (h.kind === "status" && h.to) {
          const key = h.to === "cancelled" ? `viewing_cancelled:${v.id}` : "";
          push(h.at, `Viewing ${words(String(h.to))}`, key);
        }
      }
      // a cancel from the booking page does not write history, only the status
      const inHistory = history.some((h) => h.kind === "status" && h.to === "cancelled");
      if (v.status === "cancelled" && !inHistory)
        push(v.updated_at, "Viewing cancelled", `viewing_cancelled:${v.id}`);
    }
    push(row.viewing_completed_at, "Viewing completed", "viewing_completed:");

    const invoiceById = new Map<string, any>();
    for (const inv of (invoices.data ?? []) as any[]) {
      invoiceById.set(inv.id, inv);
      push(
        inv.created_at,
        `Invoice ${inv.number} issued · ${rm(inv.total)}`,
        `invoice_issued:${inv.number}`,
      );
      if (inv.status === "void")
        push(inv.updated_at, `Invoice ${inv.number} cancelled`, `invoice_cancelled:${inv.number}`);
    }

    const receiptByPayment = new Map<string, string>(
      ((receipts.data ?? []) as any[]).map((r) => [String(r.payment_id), String(r.number)]),
    );
    for (const p of (payments.data ?? []) as any[]) {
      const inv = invoiceById.get(p.invoice_id);
      const receipt = receiptByPayment.get(String(p.id));
      const parts = [
        `${rm(p.amount)} received`,
        inv ? `for ${inv.number}` : "",
        p.method ? `by ${words(p.method)}` : "",
      ].filter(Boolean);
      push(
        p.created_at,
        `${parts.join(" ")}${receipt ? ` · Receipt ${receipt}` : ""}`,
        `payment_recorded:${p.id}`,
      );
    }

    if (row.resident_id) {
      const { data: resident } = await supabase
        .from("residents")
        .select("created_at")
        .eq("id", row.resident_id)
        .maybeSingle();
      push((resident as any)?.created_at, "Resident created");
    }

    const time = (d: string) => new Date(d).getTime();
    return {
      events: events.sort((a, b) => time(b.at) - time(a.at)),
      trail: logged
        .map((l) => ({ kind: String(l.kind), at: String(l.created_at), staff: String(l.staff) }))
        .sort((a, b) => time(a.at) - time(b.at)),
    };
  });
