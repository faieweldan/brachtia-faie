import { roomName } from "@/lib/room-name";
import { joinPhone, normCountry, normGender, normUniversity } from "@/lib/reference-data";
import { MIGRATED, initialLines, initialPaymentOf, migratedNote, migratedRentTerms, r2 } from "@/lib/migration/import-plan";
import type { MigrationPreviewRow } from "@/lib/migration/sheet3";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Migration 1: bring an existing resident into the system (Dani, 12 Oct 2026).
 *
 * The same records a paid booking makes (residentFromBooking in
 * booking-lifecycle.ts), so an imported resident and a new one look and act the
 * same on every screen:
 *
 *   1 the resident            residents (with the payor, the application form's
 *                             answers and its document links)
 *   1b the agreement          the old TA as their first agreement, Signed,
 *                             under its own number (TA2025_A-18-05_00724; else
 *                             TA-<Resident ID>-01), opening the Drive copy - in
 *                             the Tenancy tab, so a renewal attaches to it
 *   2 the tenancy             tenancies
 *   3 the initial payment     an "initial" invoice with its lines, paid, under
 *                             its QuickBooks number (INV:IP_00894), its eye on
 *                             the original copy; its payment dated the day it
 *                             was paid, with no receipt of ours. All tagged "Migrated".
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
  | { sourceRow: number; quickbooksId: string; name: string; result: "skipped" | "failed" | "updated"; reason: string };

async function must<T>(p: PromiseLike<{ data: T; error: any }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export async function importResident(sb: any, row: MigrationPreviewRow, today: string): Promise<ImportOutcome> {
  const base = { sourceRow: row.sourceRow, quickbooksId: row.quickbooksId, name: row.residentName };
  if (row.status === "blocked") return { ...base, result: "skipped", reason: "Blocked in the check" };

  const { data: already } = await sb.from("residents").select("id").eq("quickbooks_id", row.quickbooksId).maybeSingle();
  if (already) {
    // already in: only the names Brachtia renamed follow the master (refreshMigratedNames)
    const changed = await refreshMigratedNames(sb, already.id, row);
    return changed.length
      ? { ...base, result: "updated", reason: `Already in - ${changed.join(" and ")} updated` }
      : { ...base, result: "skipped", reason: "Already in the system (same QuickBooks ID)" };
  }

  const rec = row.record;
  let residentId = "";
  try {
    /* ---- 1. the resident ---- */
    const now = new Date().toISOString();
    const migratedDocs = rec.documents
      .filter((document) => document.url)
      .map((document) => ({
        key: document.key,
        label: document.label,
        fileName: `${document.label} (migrated link)`,
        path: document.url,
        uploadedAt: now,
      }));
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
          referral_source: rec.referralSource,
          marital_status: rec.maritalStatus,
          race: rec.race,
          religion: rec.religion,
          address: rec.address,
          postcode: rec.postcode,
          state: rec.state,
          country: normCountry(rec.country).value,
          medical_condition: rec.medicalCondition,
          medical_detail: rec.medicalDetail,
          docs: migratedDocs,
          occupancy: rec.occupancy,
          move_in: row.tenancyStart,
          pay_schedule: rec.schedule,
          // who pays: the payor block of the profile, as the booking form fills it
          payer_relationship: rec.paidBy,
          payer_name: rec.paidBy === "Self" ? "" : rec.payorName,
          status: row.tenancyStart <= today ? "Active" : "Booked",
          // Sheet3 "Internal Notes": the team's note and the master's remarks - admin only
          ...(rec.internalNotes ? { admin_notes: rec.internalNotes } : {}),
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
          // rent and frequency live on rental_schedules only (15 Sep 2026); the
          // tenancy columns were dropped - test-bratchia still had them, live did not
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
          .insert({ resident_id: residentId, tenancy_id: tenancy.id, agreement_no: rec.agreementNo || (await nextAgreementNo(sb, residentId)), kind: "initial" })
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
    // what is owed and what was paid - the same rule the preview showed (import-plan)
    const { total, paid, status } = initialPaymentOf(row);
    const deposits = r2(lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0));
    const invoice = await must<{ id: string }>(
      sb
        .from("invoices")
        .insert({
          resident_id: residentId,
          tenancy_id: tenancy.id,
          invoice_type: "initial",
          // "issued" while some is still owed - the Payments tab then shows
          // Partially paid and the rest is recorded the normal way
          status,
          full_name: row.residentName,
          email: row.email,
          phone: joinPhone(rec.dial, rec.mobile),
          university: rec.university,
          nationality: rec.nationality,
          residence_name: row.place.split(" · ")[0] ?? "",
          room_name: `${rec.unitNo} · ${roomName(rec.room)}`,
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
    if (paid > 0) {
      /*
       * No receipt (Dani, 13 Oct 2026). A receipt made today would carry today's
       * date and number, not the day they paid. The original invoice link -
       * the eye on the Payments tab - already shows what was paid.
       */
      await must(
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
          }),
        "Payment",
      );
    }

    /*
     * ---- 3b. the rent period running now, owed and only recorded (Petronas B1-B3,
     * Dani 20 Oct 2026). Brachtia billed it before the system, so it is a Migrated
     * rent bill - no invoice of ours to send; the admin attaches Brachtia's copy
     * and records the payment, and Collections counts it as owed. The schedule
     * below starts after it.
     */
    if (row.currentPeriod) {
      const cur = row.currentPeriod;
      const bill = await must<{ id: string }>(
        sb
          .from("invoices")
          .insert({
            resident_id: residentId,
            tenancy_id: tenancy.id,
            invoice_type: "rental",
            status: "issued",
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
            period_start: cur.start,
            period_end: cur.end,
            total: cur.amount,
            invoice_date: cur.start,
            issued_at: `${cur.start}T00:00:00+08:00`,
            auto_scheduled: false,
            notes: migratedNote(""),
          })
          .select("id")
          .single(),
        "Current rent period",
      );
      await must(
        sb.from("invoice_items").insert({ invoice_id: bill.id, label: `Rent ${cur.start} – ${cur.end}`, kind: "rent", amount: cur.amount, quantity: 1, sort_order: 0 }),
        "Current rent period line",
      );
    }

    /* ---- 4. rent from the next period on ---- */
    const terms = migratedRentTerms(row, today);
    if (terms) {
      await must(sb.from("rental_schedules").insert({ tenancy_id: tenancy.id, ...terms }), "Rent terms");
      const { syncScheduledRent } = await import("@/lib/rent-schedule.server");
      await syncScheduledRent(sb, tenancy.id);
      await applyAdminNextRent(sb, tenancy.id, row.nextPaymentDue, row.nextPaymentAmount, terms.first_period_start);
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

/**
 * Brachtia admin's next payment wins (Dani, 15 Oct 2026). The first scheduled
 * rent invoice is set to the due date and amount in Sheet3; the difference is
 * its own line, so the bill shows what the system worked out and what admin
 * added. It is marked edited (auto_scheduled false), so a later schedule
 * rebuild keeps it as admin left it - the same as editing it on the screen.
 */
export async function applyAdminNextRent(sb: any, tenancyId: string, due: string, amount: number | null, periodStart: string) {
  if (!due && amount === null) return;
  // only the bill for Brachtia's next period. If its bill date has passed it was
  // issued as it was made - from the same Sheet3 period and due date - so it is
  // left alone, never moved onto the bill after it (Dani, 19 Oct 2026: Dec due 05 Nov)
  const { data: first } = await sb
    .from("invoices")
    .select("id, total, invoice_date, payment_terms, status")
    .eq("tenancy_id", tenancyId)
    .eq("invoice_type", "rental")
    .eq("period_start", periodStart)
    .neq("status", "void")
    .limit(1)
    .maybeSingle();
  if (!first || first.status !== "scheduled") return;
  const total = Number(first.total) || 0;
  const target = amount === null ? total : r2(amount);
  let billOn = String(first.invoice_date ?? "").slice(0, 10);
  // the due date is the invoice date plus its NET days (dueDateOf reads it the same way)
  const net = Number(/NET\s*(\d+)/i.exec(String(first.payment_terms ?? ""))?.[1] ?? 0);
  const currentDue = new Date(Date.parse(`${billOn}T00:00:00Z`) + net * 86_400_000).toISOString().slice(0, 10);
  const dueOn = due || currentDue;
  if (Math.abs(target - total) < 0.005 && dueOn === currentDue) return;
  if (dueOn && dueOn < billOn) billOn = dueOn;
  const days = dueOn !== currentDue ? Math.max(0, Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${billOn}T00:00:00Z`)) / 86_400_000)) : null;
  await must(
    sb
      .from("invoices")
      .update({
        auto_scheduled: false,
        bill_on: billOn,
        invoice_date: billOn,
        issued_at: `${billOn}T00:00:00Z`,
        ...(days !== null ? { payment_terms: `NET${days}` } : {}),
        total: target,
        updated_at: new Date().toISOString(),
      })
      .eq("id", first.id),
    "Next payment",
  );
  const diff = r2(target - total);
  if (Math.abs(diff) >= 0.005) {
    await must(
      sb.from("invoice_items").insert({ invoice_id: first.id, label: "Adjustment agreed by Brachtia", kind: "rent", amount: diff, quantity: 1, sort_order: 99 }),
      "Next payment line",
    );
  }
}

/**
 * A resident already imported, uploaded again (Dani, 22 Oct 2026: Brachtia is
 * renaming every TA and invoice copy). Delete and re-import would lose what was
 * recorded since and give a new Resident ID, so only these follow the master:
 *   - the TA copy: a new link is a new version of the same agreement, Signed,
 *     superseding the old one (kept as history in the Tenancy tab); its number
 *     follows the Agreement No.
 *   - the initial invoice's number and original copy.
 * Only on a migrated record: an agreement or invoice the system made is never touched.
 * Dates, room and money are not changed here - those need a re-import.
 */
export async function refreshMigratedNames(sb: any, residentId: string, row: MigrationPreviewRow): Promise<string[]> {
  const rec = row.record;
  const changed: string[] = [];

  const { data: ag } = await sb
    .from("tenancy_agreements")
    .select("id, agreement_no")
    .eq("resident_id", residentId)
    .eq("kind", "initial")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ag) {
    const { data: docs } = await sb
      .from("agreement_documents")
      .select("id, version, status, effective_date, period_start, period_end, merge_values")
      .eq("agreement_id", ag.id)
      .eq("doc_type", "agreement")
      .order("version", { ascending: false });
    const latest = (docs ?? [])[0];
    if (latest?.merge_values?.source === "migrated") {
      if (rec.taUrl && latest.merge_values.original_url !== rec.taUrl) {
        await must(
          sb.from("agreement_documents").insert({
            agreement_id: ag.id,
            doc_type: "agreement",
            version: Number(latest.version ?? 1) + 1,
            status: "signed",
            effective_date: latest.effective_date,
            period_start: latest.period_start,
            period_end: latest.period_end,
            merge_values: { source: "migrated", original_url: rec.taUrl },
            supersedes: latest.id,
          }),
          "New TA copy",
        );
        changed.push("TA copy");
      }
      if (rec.agreementNo && ag.agreement_no !== rec.agreementNo) {
        await must(sb.from("tenancy_agreements").update({ agreement_no: rec.agreementNo }).eq("id", ag.id), "Agreement No.");
        changed.push("TA number");
      }
    }
  }

  const { migratedOriginal } = await import("@/lib/migration/import-plan");
  const { data: invs } = await sb
    .from("invoices")
    .select("id, number, notes")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .neq("status", "void")
    .order("created_at", { ascending: true })
    .limit(1);
  const inv = (invs ?? [])[0];
  const original = inv && migratedOriginal(inv.notes);
  if (inv && original) {
    if (rec.invoiceNo && inv.number !== rec.invoiceNo) {
      await must(sb.from("invoices").update({ number: rec.invoiceNo }).eq("id", inv.id), "Invoice number");
      changed.push("invoice number");
    }
    if (rec.invoiceUrl && original.url !== rec.invoiceUrl) {
      await must(sb.from("invoices").update({ notes: migratedNote(rec.invoiceUrl) }).eq("id", inv.id), "Invoice copy");
      changed.push("invoice copy");
    }
  }
  return changed;
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
