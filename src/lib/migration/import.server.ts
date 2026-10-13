import { joinPhone, normCountry, normGender, normUniversity } from "@/lib/reference-data";
import { MIGRATED, initialLines, migratedNote, migratedRentTerms, r2 } from "@/lib/migration/import-plan";
import type { MigrationPreviewRow } from "@/lib/migration/sheet3";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Migration 1: bring an existing resident into the system (Dani, 12 Oct 2026).
 *
 * The same records a paid booking makes (residentFromBooking in
 * booking-lifecycle.ts), so an imported resident and a new one look and act the
 * same on every screen:
 *
 *   1 the resident            residents (with the payor)
 *   1b the agreement          the old TA as their first agreement, Signed,
 *                             TA-<Resident ID>-01, opening the Drive copy - in
 *                             the Tenancy tab, so a renewal attaches to it
 *   2 the tenancy             tenancies
 *   3 the initial payment     an "initial" invoice with its lines, paid, under
 *                             its QuickBooks number (INV:IP_00894), its eye on
 *                             the original copy; its payment and receipt dated
 *                             the day it was paid. All tagged "Migrated".
 *   4 the rent from now on    rental_schedules - starting at the next period
 *                             after today: they are paid up to the current one
 *   5 the bed                 place_stay (a "Single" in a twin room takes the
 *                             room whole), then checked in when they live there
 *
 * One resident at a time. If a step fails, everything made for that resident
 * is removed again, so nobody is left half-imported. A QuickBooks ID already in
 * the system is skipped, never written over - the import is safe to run twice.
 * Server only: handed the service-role client.
 */

export type ImportOutcome =
  | { sourceRow: number; quickbooksId: string; name: string; result: "imported"; residentId: string }
  | { sourceRow: number; quickbooksId: string; name: string; result: "skipped" | "failed"; reason: string };

async function must<T>(p: PromiseLike<{ data: T; error: any }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export async function importResident(sb: any, row: MigrationPreviewRow, today: string): Promise<ImportOutcome> {
  const base = { sourceRow: row.sourceRow, quickbooksId: row.quickbooksId, name: row.residentName };
  if (row.status === "blocked") return { ...base, result: "skipped", reason: "Blocked in the check" };

  const { data: already } = await sb.from("residents").select("id").eq("quickbooks_id", row.quickbooksId).maybeSingle();
  if (already) return { ...base, result: "skipped", reason: "Already in the system (same QuickBooks ID)" };

  const rec = row.record;
  let residentId = "";
  try {
    /* ---- 1. the resident ---- */
    const now = new Date().toISOString();
    const made = await must<{ id: string }>(
      sb
        .from("residents")
        .insert({
          quickbooks_id: row.quickbooksId,
          full_name: row.residentName,
          email: row.email,
          mobile: joinPhone(rec.dial, rec.mobile),
          nationality: normCountry(rec.nationality).value,
          gender: normGender(rec.gender).value,
          id_number: rec.nric || rec.passport,
          university: normUniversity(rec.university).value,
          current_status: rec.residentType,
          occupancy: rec.occupancy,
          move_in: row.tenancyStart,
          pay_schedule: rec.schedule,
          // who pays: the payor block of the profile, as the booking form fills it
          payer_relationship: rec.paidBy,
          payer_name: rec.paidBy === "Self" ? "" : rec.payorName,
          status: row.tenancyStart <= today ? "Active" : "Booked",
        })
        .select("id")
        .single(),
      "Resident",
    );
    residentId = made.id;

    /* ---- 2. the tenancy ---- */
    const tenancy = await must<{ id: string }>(
      sb
        .from("tenancies")
        .insert({
          resident_id: residentId,
          enquiry_id: null,
          bed_id: null,
          start_date: row.tenancyStart,
          end_date: row.tenancyEnd,
          monthly_rent: rec.monthlyRent,
          payment_frequency: rec.schedule,
        })
        .select("id")
        .single(),
      "Tenancy",
    );

    /* ---- 1b. the old TA, as their first agreement ---- */
    if (rec.taUrl) {
      const { nextAgreementNo } = await import("@/lib/agreement-no");
      const agreement = await must<{ id: string }>(
        sb
          .from("tenancy_agreements")
          .insert({ resident_id: residentId, tenancy_id: tenancy.id, agreement_no: await nextAgreementNo(sb, residentId), kind: "initial" })
          .select("id")
          .single(),
        "Agreement",
      );
      await must(
        sb.from("agreement_documents").insert({
          agreement_id: agreement.id,
          doc_type: "agreement",
          version: 1,
          status: "signed",
          effective_date: row.tenancyStart,
          period_start: row.tenancyStart,
          period_end: row.tenancyEnd,
          // read by the Tenancy tab: a "Migrated" agreement opens its original
          merge_values: { source: "migrated", original_url: rec.taUrl },
        }),
        "Agreement copy",
      );
    }

    /* ---- 3. the initial payment: invoice, lines, payment, receipt ---- */
    const lines = initialLines(row);
    const total = r2(lines.reduce((n, l) => n + l.amount, 0));
    const deposits = r2(lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0));
    const invoice = await must<{ id: string }>(
      sb
        .from("invoices")
        .insert({
          resident_id: residentId,
          tenancy_id: tenancy.id,
          invoice_type: "initial",
          status: "paid",
          full_name: row.residentName,
          email: row.email,
          phone: joinPhone(rec.dial, rec.mobile),
          university: rec.university,
          nationality: rec.nationality,
          residence_name: row.place.split(" · ")[0] ?? "",
          room_name: `${rec.unitNo} · Room ${rec.room}`,
          occupancy: rec.occupancy,
          tenancy_start: row.tenancyStart,
          tenancy_end: row.tenancyEnd,
          monthly_rent: rec.monthlyRent,
          payment_frequency: rec.schedule,
          total,
          deposits_total: deposits,
          invoice_date: row.tenancyStart,
          // issued and paid before the system: dated then, not today
          issued_at: `${row.tenancyStart}T00:00:00+08:00`,
          notes: migratedNote(rec.invoiceUrl),
        })
        .select("id")
        .single(),
      "Initial invoice",
    );
    // its own QuickBooks number - the database gives every new invoice one of
    // ours first, so it is set straight after
    if (rec.invoiceNo) {
      await must(sb.from("invoices").update({ number: rec.invoiceNo }).eq("id", invoice.id), "Invoice number");
    }
    if (lines.length) {
      await must(
        sb.from("invoice_items").insert(lines.map((l, i) => ({ invoice_id: invoice.id, label: l.label, kind: l.kind, amount: l.amount, quantity: 1, sort_order: i }))),
        "Invoice lines",
      );
    }
    const paid = r2(Math.min(rec.totalPaid || total, total));
    if (paid > 0) {
      const payment = await must<{ id: string }>(
        sb
          .from("payments")
          .insert({
            invoice_id: invoice.id,
            enquiry_id: null,
            resident_id: residentId,
            amount: paid,
            paid_on: row.tenancyStart,
            method: "",
            reference: row.quickbooksId,
            description: `${MIGRATED} · initial payment from before the system`,
          })
          .select("id")
          .single(),
        "Payment",
      );
      await must(
        sb.from("receipts").insert({
          payment_id: payment.id,
          invoice_id: invoice.id,
          enquiry_id: null,
          resident_id: residentId,
          amount: paid,
          balance_after: r2(total - paid),
          paid_to_date: paid,
          // the day it was paid, not the day it was imported
          issued_at: `${row.tenancyStart}T00:00:00+08:00`,
        }),
        "Receipt",
      );
    }

    /* ---- 4. rent from the next period on ---- */
    const terms = migratedRentTerms(row, today);
    if (terms) {
      await must(sb.from("rental_schedules").insert({ tenancy_id: tenancy.id, ...terms }), "Rent terms");
      const { syncScheduledRent } = await import("@/lib/rent-schedule.server");
      await syncScheduledRent(sb, tenancy.id);
    }

    /* ---- 5. the bed ---- */
    const placed = await must<any>(
      sb.rpc("place_stay", { p_enquiry: null, p_resident: residentId, p_bed: rec.bedId, p_whole: !!row.wholeRoom, p_hold_until: null }),
      "Bed",
    );
    if (!placed?.ok) throw new Error(`Bed: ${placed?.detail || placed?.error || "could not be placed"}`);
    if (row.tenancyStart <= today) {
      const live = await must<any>(sb.rpc("activate_at_checkin", { p_resident: residentId }), "Check-in");
      if (live && live.ok === false) throw new Error(`Check-in: ${live.error}`);
    }

    return { ...base, result: "imported", residentId };
  } catch (err) {
    if (residentId) await undoResident(sb, residentId);
    return { ...base, result: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove everything one import made, so a failed resident can simply be imported again. */
export async function undoResident(sb: any, residentId: string) {
  const { data: invs } = await sb.from("invoices").select("id").eq("resident_id", residentId);
  const ids = ((invs ?? []) as any[]).map((i) => i.id);
  if (ids.length) {
    await sb.from("receipts").delete().in("invoice_id", ids);
    await sb.from("payments").delete().in("invoice_id", ids);
    await sb.from("invoice_items").delete().in("invoice_id", ids);
    await sb.from("invoices").delete().in("id", ids);
  }
  const { data: beds } = await sb.from("beds").select("id").eq("resident_id", residentId);
  for (const b of (beds ?? []) as any[]) await sb.rpc("empty_bed", { p_bed: b.id });
  const { data: ags } = await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId);
  const agIds = ((ags ?? []) as any[]).map((a) => a.id);
  if (agIds.length) {
    await sb.from("agreement_documents").delete().in("agreement_id", agIds);
    await sb.from("tenancy_agreements").delete().in("id", agIds);
  }
  await sb.from("tenancies").delete().eq("resident_id", residentId);
  await sb.from("residents").delete().eq("id", residentId);
}
