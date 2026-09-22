import { createServerFn } from "@tanstack/react-start";

import { normCountry, normGender, normUniversity } from "@/lib/reference-data";
import {
  BED_LABELS,
  COL,
  bedKey,
  expandSharedRows,
  num,
  pick,
  roomKey,
  normUnit,
  roomPlan,
  splitBatch,
  studentIdOf,
  isResidentCode,
  toDate,
  toPayor,
  toSchedule,
  winnersById,
  type ImportRow,
} from "@/lib/master-list";

import type { Resident, ResidentDoc } from "@/lib/ops-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Residents.
 *
 * Same shape as homes.functions.ts: snake_case in Postgres, camelCase in
 * TypeScript, translated here and nowhere else.
 *
 * quickbooks_id ("00256") is what a re-upload matches on, so editing one student in
 * the master list and uploading it again updates that student instead of
 * creating a second copy.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v?: string) => !!v && UUID.test(v);
const str = (v: unknown) => (v == null ? "" : String(v));

/* ---------------- row <-> type ---------------- */

function toResident(row: any): Resident {
  return {
    id: row.id,
    createdAt: row.created_at ?? "",
    quickbooksId: str(row.quickbooks_id),
    // given by the database - read here, never written back
    residentCode: str(row.resident_code),
    enquiryId: row.enquiry_id ?? undefined,
    fullName: str(row.full_name),
    email: str(row.email),
    mobile: str(row.mobile),
    dob: str(row.dob),
    nationality: str(row.nationality),
    idNumber: str(row.id_number),
    gender: str(row.gender),
    address: str(row.address),
    postcode: str(row.postcode),
    state: str(row.state),
    country: str(row.country),
    maritalStatus: str(row.marital_status),
    race: str(row.race),
    religion: str(row.religion),
    currentStatus: str(row.current_status),
    university: str(row.university),
    levelOfStudy: str(row.level_of_study),
    course: str(row.course),
    studentId: str(row.student_id),
    graduationYear: str(row.graduation_year),
    sponsor: str(row.sponsor),
    company: str(row.company),
    occupation: str(row.occupation),
    industry: str(row.industry),
    employmentType: str(row.employment_type),
    occupancy: str(row.occupancy),
    moveIn: str(row.move_in),
    leaseMonths: str(row.lease_months),
    medicalCondition: str(row.medical_condition),
    medicalDetail: str(row.medical_detail),
    ecName: str(row.ec_name),
    ecRelationship: str(row.ec_relationship),
    ecMobile: str(row.ec_mobile),
    ecEmail: str(row.ec_email),
    ecAddress: str(row.ec_address),
    ecPostcode: str(row.ec_postcode),
    ecState: str(row.ec_state),
    ecCountry: str(row.ec_country),
    payMethod: str(row.pay_method),
    paySchedule: str(row.pay_schedule),
    payerName: str(row.payer_name),
    payerRelationship: str(row.payer_relationship),
    payerMobile: str(row.payer_mobile),
    payerEmail: str(row.payer_email),
    payerAddress: str(row.payer_address),
    payerPostcode: str(row.payer_postcode),
    payerState: str(row.payer_state),
    payerCountry: str(row.payer_country),
    status: str(row.status),
    portalInvited: !!row.portal_invited,
    docs: Array.isArray(row.docs) ? (row.docs as ResidentDoc[]) : [],
  };
}

function toRow(r: Resident) {
  return {
    quickbooks_id: r.quickbooksId ? r.quickbooksId : null,
    enquiry_id: isUuid(r.enquiryId) ? r.enquiryId : null,
    full_name: r.fullName ?? "",
    email: r.email ?? "",
    mobile: r.mobile ?? "",
    dob: r.dob ?? "",
    nationality: r.nationality ?? "",
    id_number: r.idNumber ?? "",
    gender: r.gender ?? "",
    address: r.address ?? "",
    postcode: r.postcode ?? "",
    state: r.state ?? "",
    country: r.country ?? "",
    marital_status: r.maritalStatus ?? "",
    race: r.race ?? "",
    religion: r.religion ?? "",
    current_status: r.currentStatus ?? "",
    university: r.university ?? "",
    level_of_study: r.levelOfStudy ?? "",
    course: r.course ?? "",
    student_id: r.studentId ?? "",
    graduation_year: r.graduationYear ?? "",
    sponsor: r.sponsor ?? "",
    company: r.company ?? "",
    occupation: r.occupation ?? "",
    industry: r.industry ?? "",
    employment_type: r.employmentType ?? "",
    occupancy: r.occupancy ?? "",
    move_in: r.moveIn ?? "",
    lease_months: r.leaseMonths ?? "",
    medical_condition: r.medicalCondition ?? "",
    medical_detail: r.medicalDetail ?? "",
    ec_name: r.ecName ?? "",
    ec_relationship: r.ecRelationship ?? "",
    ec_mobile: r.ecMobile ?? "",
    ec_email: r.ecEmail ?? "",
    ec_address: r.ecAddress ?? "",
    ec_postcode: r.ecPostcode ?? "",
    ec_state: r.ecState ?? "",
    ec_country: r.ecCountry ?? "",
    pay_method: r.payMethod ?? "",
    pay_schedule: r.paySchedule ?? "",
    payer_name: r.payerName ?? "",
    payer_relationship: r.payerRelationship ?? "",
    payer_mobile: r.payerMobile ?? "",
    payer_email: r.payerEmail ?? "",
    payer_address: r.payerAddress ?? "",
    payer_postcode: r.payerPostcode ?? "",
    payer_state: r.payerState ?? "",
    payer_country: r.payerCountry ?? "",
    status: r.status ?? "",
    portal_invited: !!r.portalInvited,
    docs: r.docs ?? [],
  };
}

/* ---------------- read ---------------- */

export const listResidents = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resident[]> => {
    const supabase = await admin();
    const { data, error } = await supabase
      .from("residents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toResident);
  },
);

/* ---------------- write ---------------- */

export const saveResidentRow = createServerFn({ method: "POST" })
  .inputValidator((data: { resident: Resident; importBatchId?: string }) => data)
  .handler(async ({ data }): Promise<Resident> => {
    const supabase = await admin();
    const { resident, importBatchId } = data;
    const row: Record<string, unknown> = {
      ...toRow(resident),
      ...(importBatchId ? { import_batch_id: importBatchId } : {}),
    };

    // an existing uuid wins; otherwise quickbooks_id decides insert vs update
    if (isUuid(resident.id)) row["id"] = resident.id;

    const query = resident.quickbooksId
      ? supabase.from("residents").upsert(row as any, { onConflict: "quickbooks_id" })
      : supabase.from("residents").upsert(row as any);

    const { data: saved, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return toResident(saved);
  });

export const deleteResidentRow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    if (!isUuid(data.id)) return { ok: true };
    const supabase = await admin();
    const { error } = await supabase.from("residents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Delete a former resident for good, with everything their money left behind.
 *
 * Not for real residents: an invoice or receipt once issued is a financial
 * record, and former residents are kept. This clears test data, so it refuses
 * anyone still current, anyone with a QuickBooks id (every real resident from
 * the master list has one), and any name not typed back exactly. The checks run
 * here, on the server, not only on the page.
 */
export const deleteFormerResident = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; confirmName: string }) => data)
  .handler(async ({ data }) => {
    if (!isUuid(data.id)) throw new Error("Resident not found");
    const supabase = await admin();
    const { data: row } = await supabase
      .from("residents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Resident not found");
    if (str(row.status).toLowerCase() !== "inactive") {
      throw new Error("Only a former resident can be deleted. Deactivate them first.");
    }
    // quickbooks_id is still legacy_id on a database that has not had its rename
    if (str(row.quickbooks_id ?? row.legacy_id).trim()) {
      throw new Error(
        "This resident has a QuickBooks ID - a real record, so it cannot be deleted.",
      );
    }
    if (data.confirmName.trim().toLowerCase() !== str(row.full_name).trim().toLowerCase()) {
      throw new Error("The name typed does not match.");
    }

    // their money: filed under them, or under the booking they came from
    const [byResident, byBooking] = await Promise.all([
      supabase.from("invoices").select("id").eq("resident_id", row.id),
      row.enquiry_id
        ? supabase.from("invoices").select("id").eq("enquiry_id", row.enquiry_id)
        : Promise.resolve({ data: [] }),
    ]);
    const invoiceIds = [
      ...new Set([...(byResident.data ?? []), ...(byBooking.data ?? [])].map((i: any) => i.id)),
    ];

    const { data: payments } = invoiceIds.length
      ? await supabase.from("payments").select("proof_path").in("invoice_id", invoiceIds)
      : { data: [] };
    const paths = [
      ...(payments ?? []).map((p: any) => str(p.proof_path)),
      ...(Array.isArray(row.docs) ? row.docs.map((d: any) => str(d?.path)) : []),
    ].filter(Boolean);
    // uploads now go to the private documents bucket; proofs attached on a
    // booking before that were saved as residence photos and served from
    // /api/public/photo/ - both are removed
    const PHOTO_URL = "/api/public/photo/";
    const docFiles = paths.filter((p) => !p.startsWith("/") && !/^https?:/i.test(p));
    const photoFiles = paths
      .filter((p) => p.startsWith(PHOTO_URL))
      .map((p) => p.slice(PHOTO_URL.length));

    // children before parents: a receipt points at a payment, a payment at an invoice
    if (invoiceIds.length) {
      for (const table of ["receipts", "payments", "invoice_items"] as const) {
        const { error } = await supabase.from(table).delete().in("invoice_id", invoiceIds);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.from("invoices").delete().in("id", invoiceIds);
      if (error) throw new Error(error.message);
    }

    // a missing file or bucket must not leave the resident half-deleted, so
    // storage errors are not thrown
    const { DOC_BUCKET } = await import("@/lib/resident-documents");
    await Promise.all([
      docFiles.length ? supabase.storage.from(DOC_BUCKET).remove(docFiles) : null,
      photoFiles.length ? supabase.storage.from("residence-photos").remove(photoFiles) : null,
    ]);

    // the booking stays - it is the enquiry - but no longer points at them
    await supabase.from("enquiries").update({ resident_id: "" }).eq("resident_id", row.id);

    // a bed they still hold is emptied properly, university and all - left to
    // the database, it would only lose the link and keep their details
    const { error: bedErr } = await supabase
      .from("beds")
      .update({
        status: "vacant",
        resident_id: null,
        resident_name: null,
        student_id: null,
        university: null,
        nationality: null,
        gender: null,
        hold_for: null,
        hold_until: null,
        enquiry_id: null,
        tenancy_start: null,
        tenancy_end: null,
        rent: null,
      })
      .eq("resident_id", row.id);
    if (bedErr) throw new Error(bedErr.message);

    // their profile link and signature go with them
    const { error } = await supabase.from("residents").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true, invoices: invoiceIds.length };
  });

/* ---------------- master-list import ---------------- */

export type ImportReport = {
  batchId?: string;
  residents: number;
  placed: number;
  cleared: number;
  duplicates: number;
  problems: { row: number; quickbooksId: string; reason: string }[];
};

/** The sheet writes M / F; the app stores the words the dropdown offers.
 *  Shared with the student form and the admin page so all three agree. */
function toGender(raw: string) {
  return normGender(raw).value;
}

/**
 * Import the Brachtia master list.
 *
 * One row = one bed. The row's StudentID is the resident, and Unit / Room / Bed
 * say which bed they are in, so a room move and a rent change travel together in
 * the same row.
 *
 * Rules, chosen so dirty data fails loudly instead of quietly:
 *   - no StudentID, or a name of "Vacant"  -> that bed is emptied
 *   - Status "Inactive"                    -> the student is saved but the bed
 *     is emptied; they have moved out
 *   - the same StudentID twice             -> the Active row wins (a repeat is a
 *     room move); ties fall back to the later row, and the loser is reported
 *   - a unit / room / bed that does not exist -> the resident is still saved,
 *     the placement is skipped and reported. Never guess at a bed.
 *   - rooms are set up from the lettings in force; a unit nobody lives in follows
 *     its latest letting, and a unit is let whole or by room - never both
 *   - a current resident is never emptied out by an older row for the same bed
 */
export const importResidents = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: ImportRow[]; filename?: string }) => data)
  .handler(async ({ data }): Promise<ImportReport> => {
    const supabase = await admin();
    const report: ImportReport = {
      residents: 0,
      placed: 0,
      cleared: 0,
      duplicates: 0,
      problems: [],
    };

    // the bed map: "unitno|letter|label" -> bed id
    const { data: units } = await supabase.from("units").select("id, unit_no");
    const unitById = new Map<string, string>(
      (units ?? []).map((u: any) => [u.id, String(u.unit_no)]),
    );
    const { data: rooms } = await supabase.from("rooms").select("id, unit_id, letter");
    const roomById = new Map<string, { unitNo: string; letter: string }>(
      (rooms ?? []).map((r: any) => [
        r.id,
        { unitNo: unitById.get(r.unit_id) ?? "", letter: String(r.letter) },
      ]),
    );
    const { data: beds } = await supabase
      .from("beds")
      .select("id, room_id, label, resident_id, enquiry_id");
    const bedIdByKey = new Map<string, string>();
    for (const b of beds ?? []) {
      const room = roomById.get((b as any).room_id);
      if (!room) continue;
      bedIdByKey.set(bedKey(room.unitNo, room.letter, String((b as any).label)), (b as any).id);
    }

    // rooms indexed the way the sheet addresses them, so a row can find its room
    // even when the room is configured the wrong way round
    const roomIdByKey = new Map<string, string>();
    for (const r of rooms ?? []) {
      const unitNo = unitById.get((r as any).unit_id) ?? "";
      roomIdByKey.set(roomKey(unitNo, String((r as any).letter)), (r as any).id);
    }
    const bedsByRoom = new Map<string, { id: string; label: string; taken: boolean }[]>();
    for (const b of beds ?? []) {
      const list = bedsByRoom.get((b as any).room_id) ?? [];
      list.push({
        id: (b as any).id,
        label: String((b as any).label),
        // someone living there, or a booking holding it
        taken: !!(b as any).resident_id || !!(b as any).enquiry_id,
      });
      bedsByRoom.set((b as any).room_id, list);
    }

    const unitIdByKey = new Map<string, string>(
      (units ?? []).map((u: any) => [normUnit(String(u.unit_no)).toLowerCase(), u.id as string]),
    );
    let roomsList = ((rooms ?? []) as any[]).map((r) => ({
      id: r.id as string,
      unit_id: r.unit_id as string,
      letter: String(r.letter),
    }));
    const isSlotLetter = (letter: string) => letter.toLowerCase() === "unit";

    /**
     * Every room is set up BEFORE anyone is placed, from roomPlan: the lettings in
     * force first, and a unit nobody lives in now follows its latest letting -
     * never a mix, because the sheet is a history of people coming and going.
     *
     * Whatever that history says, a unit is let whole (one Unit bed) or by room,
     * never both. Rooms of the other kind are removed - unless someone who stays
     * after this upload is in one, when the unit is left as it is and reported.
     */
    async function applyRoomConfigs(rows: ImportRow[]) {
      const { units: kinds, shapes, conflicts, clashes } = roomPlan(rows);
      for (const c of conflicts) {
        report.problems.push({
          row: c.index + 2,
          quickbooksId: studentIdOf(rows[c.index]!),
          reason: `${c.unitNo} / ${c.letter}: current lettings as both ${c.was} and ${c.used} — ${c.used} was used`,
        });
      }
      for (const c of clashes) {
        report.problems.push({
          row: c.index + 2,
          quickbooksId: studentIdOf(rows[c.index]!),
          reason: `${c.unitNo} is let by room, so it cannot also be let whole — this whole-unit letting was not placed`,
        });
      }

      // beds this upload empties anyway: someone in one of them is not in the way
      const emptied = new Set<string>();
      for (const row of rows) {
        const gone =
          !studentIdOf(row) ||
          /^vacant$/i.test(pick(row, ...COL.name)) ||
          /^(inactive|vacant)$/i.test(pick(row, ...COL.status));
        if (gone)
          emptied.add(
            bedKey(pick(row, ...COL.unit), pick(row, ...COL.room), pick(row, ...COL.bed)),
          );
      }

      for (const [key, kind] of kinds) {
        const unitId = unitIdByKey.get(key);
        if (!unitId) continue;
        const unitNo = unitById.get(unitId) ?? "";
        const unitRooms = roomsList.filter((r) => r.unit_id === unitId);
        const drop = unitRooms.filter((r) =>
          kind === "whole" ? !isSlotLetter(r.letter) : isSlotLetter(r.letter),
        );
        const inTheWay = drop.some((r) =>
          (bedsByRoom.get(r.id) ?? []).some(
            (b) => b.taken && !emptied.has(bedKey(unitNo, r.letter, b.label)),
          ),
        );
        if (inTheWay) {
          report.problems.push({
            row: 0,
            quickbooksId: "",
            reason: `${unitNo}: the sheet lets it ${kind === "whole" ? "whole" : "by room"}, but someone who stays is in a bed that would go — the unit was left as it is`,
          });
          continue;
        }

        if (drop.length) {
          const ids = drop.map((r) => r.id);
          await supabase.from("beds").delete().in("room_id", ids);
          await supabase.from("rooms").delete().in("id", ids);
          for (const r of drop) {
            roomIdByKey.delete(roomKey(unitNo, r.letter));
            for (const b of bedsByRoom.get(r.id) ?? []) {
              bedIdByKey.delete(bedKey(unitNo, r.letter, b.label));
            }
            bedsByRoom.delete(r.id);
          }
          roomsList = roomsList.filter((r) => !ids.includes(r.id));
        }

        if (kind === "whole" && !unitRooms.some((r) => isSlotLetter(r.letter))) {
          const { data: made } = await supabase
            .from("rooms")
            .insert({
              unit_id: unitId,
              letter: "Unit",
              occupancy: "unit",
              room_type_code: "",
              rent: 0,
              sort_order: 0,
            } as any)
            .select("id")
            .single();
          if (made) {
            const { data: bed } = await supabase
              .from("beds")
              .insert({ room_id: made.id, label: "Unit", status: "vacant", sort_order: 0 } as any)
              .select("id")
              .single();
            roomsList.push({ id: made.id, unit_id: unitId, letter: "Unit" });
            roomIdByKey.set(roomKey(unitNo, "Unit"), made.id);
            bedsByRoom.set(made.id, bed ? [{ id: bed.id, label: "Unit", taken: false }] : []);
            if (bed) bedIdByKey.set(bedKey(unitNo, "Unit", "Unit"), bed.id);
          }
        }

        await supabase
          .from("units")
          .update({ whole_unit: kind === "whole" } as any)
          .eq("id", unitId);
      }

      for (const [key, shape] of shapes) {
        const roomId = roomIdByKey.get(key);
        if (!roomId) continue;
        const labels = BED_LABELS[shape];

        const existing = bedsByRoom.get(roomId) ?? [];
        const same =
          existing.length === labels.length &&
          labels.every((l) => existing.some((b) => b.label.toLowerCase() === l.toLowerCase()));
        if (same) continue;

        await supabase
          .from("rooms")
          .update({ occupancy: shape } as any)
          .eq("id", roomId);
        const stale = existing.filter(
          (b) => !labels.some((l) => l.toLowerCase() === b.label.toLowerCase()),
        );
        if (stale.length) {
          await supabase
            .from("beds")
            .delete()
            .in(
              "id",
              stale.map((b) => b.id),
            );
        }
        const missing = labels.filter(
          (l) => !existing.some((b) => b.label.toLowerCase() === l.toLowerCase()),
        );
        let made: { id: string; label: string; taken: boolean }[] = [];
        if (missing.length) {
          const { data: rowsMade } = await supabase
            .from("beds")
            .insert(
              missing.map((l, i) => ({
                room_id: roomId,
                label: l,
                status: "vacant",
                sort_order: i,
              })) as any,
            )
            .select("id, label");
          made = (rowsMade ?? []).map((b: any) => ({
            id: b.id as string,
            label: String(b.label),
            taken: false,
          }));
        }

        const kept = existing.filter((b) =>
          labels.some((l) => l.toLowerCase() === b.label.toLowerCase()),
        );
        const fresh = [...kept, ...made];
        bedsByRoom.set(roomId, fresh);

        const [unitNo, letter] = key.split("|");
        for (const b of stale) bedIdByKey.delete(bedKey(unitNo!, letter!, b.label));
        for (const b of fresh) bedIdByKey.set(bedKey(unitNo!, letter!, b.label), b.id);
      }
    }

    const expanded = expandSharedRows(data.rows);
    const rows = expanded.map((e) => e.row);

    await applyRoomConfigs(rows);

    // a repeated StudentID is a room move, so one row has to win
    const winnerFor = winnersById(rows);

    const batch = await supabase
      .from("import_batches")
      .insert({
        kind: "residents",
        filename: data.filename ?? "",
        row_count: data.rows.length,
      } as any)
      .select("id")
      .single();
    const batchId = (batch.data as any)?.id as string | undefined;
    if (batchId) report.batchId = batchId;

    const bedsToClear: string[] = [];
    /**
     * A bed holds one person. If two rows both claim it, the later write would
     * quietly overwrite the earlier one and leave a student with no room and no
     * explanation - so the first claim keeps the bed and the second is reported.
     */
    const claimedBy = new Map<string, { quickbooksId: string; row: number }>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const sharesWith = expanded[i]?.sharesWith;
      const quickbooksId = studentIdOf(row);
      const name = pick(row, ...COL.name);
      const unitNo = pick(row, ...COL.unit);
      const letter = pick(row, ...COL.room);
      const label = pick(row, ...COL.bed);
      const bedId = bedIdByKey.get(bedKey(unitNo, letter, label));

      const rawStatus = pick(row, ...COL.status);
      /**
       * "Vacant" describes the bed, not the person. Someone whose bed is vacant
       * is not a current resident, so they are recorded as Inactive - otherwise
       * they would sit in the Current list with nowhere to live.
       */
      const status = /^vacant$/i.test(rawStatus) ? "Inactive" : rawStatus;

      // A row whose STATUS says Vacant records who a bed is earmarked for, not
      // who is living in it. Together with Inactive - a student who has moved
      // out - neither may leave the bed looking occupied.
      const freesTheBed = /^(inactive|vacant)$/i.test(rawStatus);

      if (!quickbooksId || /^vacant$/i.test(name) || freesTheBed) {
        if (bedId) bedsToClear.push(bedId);
        if (!quickbooksId || /^vacant$/i.test(name)) continue;
        // still save the person; only the placement is dropped
      }

      if (winnerFor.get(quickbooksId) !== i) {
        report.duplicates += 1;
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: `repeated StudentID - row ${(winnerFor.get(quickbooksId) ?? 0) + 2} was used instead`,
        });
        continue;
      }

      const tenancyStart = toDate(pick(row, ...COL.start));
      const tenancyEnd = toDate(pick(row, ...COL.end));
      const rent = num(pick(row, ...COL.rent));
      for (const [label, keys, date] of [
        ["tenancy start", COL.start, tenancyStart],
        ["tenancy end", COL.end, tenancyEnd],
      ] as const) {
        const raw = pick(row, ...keys);
        if (raw && !date) {
          report.problems.push({
            row: i + 2,
            quickbooksId,
            reason: `${label} "${raw}" cannot be read - saved empty, worth checking`,
          });
        }
      }

      const sponsor = pick(row, "sponsor");
      const { name: cleanName, batch } = splitBatch(name);
      const payor = toPayor(sponsor, batch);

      // The sheet is the biggest writer of these fields - 382 rows in one
      // click - so it maps to the same codes the form offers. An unrecognised
      // spelling is kept as written and reported, never dropped: a real
      // university nobody has listed yet is data, not an error.
      const university = normUniversity(pick(row, "university"));
      const nationality = normCountry(pick(row, "nationality"));
      if (!university.matched) {
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: `university "${university.value}" is not one of the known codes - saved as written, worth checking`,
        });
      }
      if (!nationality.matched) {
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: `nationality "${nationality.value}" is not a known country code - saved as written, worth checking`,
        });
      }

      // a resident ID (26IF0042) names a resident already in the system; it is not a Brachtia ID
      const byCode = isResidentCode(quickbooksId);
      const residentRow: Record<string, unknown> = {
        ...(byCode ? {} : { quickbooks_id: quickbooksId }),
        full_name: cleanName,
        email: pick(row, "email"),
        mobile: pick(row, "mobilenumber", "mobile number", "mobile", "phone"),
        nationality: nationality.value,
        id_number: pick(row, "idnumber", "id number", "passport", "nric"),
        gender: toGender(pick(row, "gender")),
        university: university.value,
        sponsor,
        payer_name: payor.name,
        payer_relationship: payor.relationship,
        // what the sheet says they pay on - without it the tenancy has no cycle
        // and no rent invoice can be scheduled for it
        pay_schedule: toSchedule(pick(row, ...COL.frequency)),
        status,
        move_in: tenancyStart,
        ...(batchId ? { import_batch_id: batchId } : {}),
      };

      // the uuid comes back from the write, and it is what the bed link stores
      let existingByCode: { id: string } | null = null;
      if (byCode) {
        const { data: found } = await supabase
          .from("residents")
          .select("id")
          .eq("resident_code", quickbooksId.toUpperCase())
          .maybeSingle();
        existingByCode = found ?? null;
        if (!existingByCode) {
          report.problems.push({
            row: i + 2,
            quickbooksId,
            reason: `resident ID ${quickbooksId} is not in the system - a resident ID is given when a resident is created, so this row was skipped`,
          });
          continue;
        }
      }
      const { data: saved, error } = await (existingByCode
        ? supabase
            .from("residents")
            .update(residentRow as any)
            .eq("id", existingByCode.id)
            .select("id")
            .single()
        : supabase
            .from("residents")
            .upsert(residentRow as any, { onConflict: "quickbooks_id" })
            .select("id")
            .single());
      if (error || !saved) {
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: error?.message ?? "resident not saved",
        });
        continue;
      }
      report.residents += 1;

      // an ended or not-yet-started letting leaves no one in the bed
      if (freesTheBed) continue;

      // a shared whole-unit letting: the bed records one occupant, so the others
      // are saved as residents and reported rather than silently dropped
      if (sharesWith) {
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: `shares the whole-unit letting at ${unitNo} with ${sharesWith} — saved, but only one occupant can be recorded on a bed until tenancies exist`,
        });
        continue;
      }

      if (!bedId) {
        if (unitNo || letter || label) {
          report.problems.push({
            row: i + 2,
            quickbooksId,
            reason: `no such bed: ${unitNo} / ${letter} / ${label} - resident saved, placement skipped`,
          });
        }
        continue;
      }

      const heldBy = claimedBy.get(bedId);
      if (heldBy && heldBy.quickbooksId !== quickbooksId) {
        report.problems.push({
          row: i + 2,
          quickbooksId,
          reason: `${unitNo} / ${letter} / ${label} is already taken by ${heldBy.quickbooksId} on row ${heldBy.row} — resident saved, placement skipped`,
        });
        continue;
      }
      claimedBy.set(bedId, { quickbooksId, row: i + 2 });

      const { error: bedErr } = await supabase
        .from("beds")
        .update({
          // "Booked" is a letting agreed but not moved into
          status: /^booked$/i.test(rawStatus) ? "booked" : "active",
          resident_id: (saved as { id: string }).id,
          resident_name: name,
          university: university.value || null,
          nationality: nationality.value || null,
          gender: toGender(pick(row, "gender")) || null,
          tenancy_start: tenancyStart || null,
          tenancy_end: tenancyEnd || null,
          rent,
          import_batch_id: batchId ?? null,
        } as any)
        .eq("id", bedId);
      if (bedErr) {
        report.problems.push({ row: i + 2, quickbooksId, reason: bedErr.message });
        continue;
      }
      report.placed += 1;
    }

    // the sheet lists the student who left a bed before the one who came after -
    // so a bed a current resident took in this upload is never emptied by the
    // older row for it
    const toClear = [...new Set(bedsToClear)].filter((id) => !claimedBy.has(id));
    if (toClear.length) {
      const { error } = await supabase
        .from("beds")
        .update({
          status: "vacant",
          resident_id: null,
          resident_name: null,
          student_id: null,
          university: null,
          nationality: null,
          gender: null,
          tenancy_start: null,
          tenancy_end: null,
          rent: null,
        } as any)
        .in("id", toClear);
      if (!error) report.cleared = toClear.length;
    }

    return report;
  });
