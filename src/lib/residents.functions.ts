import { createServerFn } from "@tanstack/react-start";

import type { Resident, ResidentDoc } from "@/lib/ops-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Residents.
 *
 * Same shape as homes.functions.ts: snake_case in Postgres, camelCase in
 * TypeScript, translated here and nowhere else.
 *
 * legacy_id ("00256") is what a re-upload matches on, so editing one student in
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
    legacyId: str(row.legacy_id),
    enquiryId: row.enquiry_id ?? undefined,
    fullName: str(row.full_name),
    email: str(row.email),
    mobile: str(row.mobile),
    dob: str(row.dob),
    nationality: str(row.nationality),
    idNumber: str(row.id_number),
    gender: str(row.gender),
    maritalStatus: str(row.marital_status),
    race: str(row.race),
    religion: str(row.religion),
    university: str(row.university),
    levelOfStudy: str(row.level_of_study),
    course: str(row.course),
    studentId: str(row.student_id),
    graduationYear: str(row.graduation_year),
    sponsor: str(row.sponsor),
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
    status: str(row.status),
    portalInvited: !!row.portal_invited,
    docs: Array.isArray(row.docs) ? (row.docs as ResidentDoc[]) : [],
  };
}

function toRow(r: Resident) {
  return {
    legacy_id: r.legacyId ? r.legacyId : null,
    enquiry_id: isUuid(r.enquiryId) ? r.enquiryId : null,
    full_name: r.fullName ?? "",
    email: r.email ?? "",
    mobile: r.mobile ?? "",
    dob: r.dob ?? "",
    nationality: r.nationality ?? "",
    id_number: r.idNumber ?? "",
    gender: r.gender ?? "",
    marital_status: r.maritalStatus ?? "",
    race: r.race ?? "",
    religion: r.religion ?? "",
    university: r.university ?? "",
    level_of_study: r.levelOfStudy ?? "",
    course: r.course ?? "",
    student_id: r.studentId ?? "",
    graduation_year: r.graduationYear ?? "",
    sponsor: r.sponsor ?? "",
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

    // an existing uuid wins; otherwise legacy_id decides insert vs update
    if (isUuid(resident.id)) row["id"] = resident.id;

    const query = resident.legacyId
      ? supabase.from("residents").upsert(row as any, { onConflict: "legacy_id" })
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

/* ---------------- master-list import ---------------- */

export type ImportRow = Record<string, string>;

export type ImportReport = {
  batchId?: string;
  residents: number;
  placed: number;
  cleared: number;
  duplicates: number;
  problems: { row: number; legacyId: string; reason: string }[];
};

const pick = (row: ImportRow, ...keys: string[]) => {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/** "1-Jan-24", "2024-01-01" and Excel serials all become "YYYY-MM-DD" or "". */
function toDate(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d+(\.\d+)?$/.test(v)) {
    // Excel serial: day 1 is 1900-01-01, with the well-known 1900 leap-year bug
    const d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const num = (raw: string) => {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

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
    const { data: beds } = await supabase.from("beds").select("id, room_id, label");
    const bedKey = (unitNo: string, letter: string, label: string) =>
      `${unitNo}|${letter}|${label}`.toLowerCase().replace(/\s+/g, " ").trim();
    const bedIdByKey = new Map<string, string>();
    for (const b of beds ?? []) {
      const room = roomById.get((b as any).room_id);
      if (!room) continue;
      bedIdByKey.set(bedKey(room.unitNo, room.letter, String((b as any).label)), (b as any).id);
    }

    // A repeated StudentID is a room move, not a typo, so one row has to win.
    // Status decides it - an Active row beats an Inactive one however they are
    // ordered - and the later row only wins when the two rank the same.
    const rank = (row: ImportRow) => {
      const s = pick(row, "status").toLowerCase();
      if (s === "active") return 2;
      if (s === "inactive") return 0;
      return 1; // blank or anything else sits between the two
    };
    const winnerFor = new Map<string, number>();
    data.rows.forEach((row, i) => {
      const id = pick(row, "studentid", "student id", "resident id", "legacy_id");
      if (!id) return;
      const held = winnerFor.get(id);
      if (held === undefined || rank(row) >= rank(data.rows[held]!)) winnerFor.set(id, i);
    });

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

    for (let i = 0; i < data.rows.length; i += 1) {
      const row = data.rows[i]!;
      const legacyId = pick(row, "studentid", "student id", "resident id", "legacy_id");
      const name = pick(row, "studentname", "student name", "full name", "name");
      const unitNo = pick(row, "unit", "unit_no", "unitno");
      const letter = pick(row, "room", "room_letter");
      const label = pick(row, "bed", "bed_label");
      const bedId = bedIdByKey.get(bedKey(unitNo, letter, label));

      const status = pick(row, "status");

      // A vacant marker, or a tenancy that has ended: the bed is free. An
      // Inactive row is history - the student moved out - so it must never
      // leave the bed looking occupied.
      if (!legacyId || /^vacant$/i.test(name) || /^inactive$/i.test(status)) {
        if (bedId) bedsToClear.push(bedId);
        if (!legacyId || /^vacant$/i.test(name)) continue;
        // still save the person; only the placement is dropped
      }

      if (winnerFor.get(legacyId) !== i) {
        report.duplicates += 1;
        report.problems.push({
          row: i + 2,
          legacyId,
          reason: `repeated StudentID - row ${(winnerFor.get(legacyId) ?? 0) + 2} was used instead`,
        });
        continue;
      }

      const tenancyStart = toDate(pick(row, "tenancy start", "tenancy_start", "move in"));
      const tenancyEnd = toDate(pick(row, "tenancy end", "tenancy_end"));
      const rent = num(pick(row, "monthly rent", "rent"));

      const residentRow: Record<string, unknown> = {
        legacy_id: legacyId,
        full_name: name,
        email: pick(row, "email"),
        mobile: pick(row, "mobilenumber", "mobile number", "mobile", "phone"),
        nationality: pick(row, "nationality"),
        id_number: pick(row, "idnumber", "id number", "passport", "nric"),
        gender: pick(row, "gender"),
        university: pick(row, "university"),
        sponsor: pick(row, "sponsor"),
        status,
        move_in: tenancyStart,
        ...(batchId ? { import_batch_id: batchId } : {}),
      };

      const { error } = await supabase
        .from("residents")
        .upsert(residentRow as any, { onConflict: "legacy_id" });
      if (error) {
        report.problems.push({ row: i + 2, legacyId, reason: error.message });
        continue;
      }
      report.residents += 1;

      // an ended tenancy leaves no one in the bed
      if (/^inactive$/i.test(status)) continue;

      if (!bedId) {
        if (unitNo || letter || label) {
          report.problems.push({
            row: i + 2,
            legacyId,
            reason: `no such bed: ${unitNo} / ${letter} / ${label} - resident saved, placement skipped`,
          });
        }
        continue;
      }

      const { error: bedErr } = await supabase
        .from("beds")
        .update({
          status: "active",
          resident_id: legacyId,
          resident_name: name,
          university: pick(row, "university") || null,
          nationality: pick(row, "nationality") || null,
          gender: pick(row, "gender") || null,
          tenancy_start: tenancyStart || null,
          tenancy_end: tenancyEnd || null,
          rent,
          import_batch_id: batchId ?? null,
        } as any)
        .eq("id", bedId);
      if (bedErr) {
        report.problems.push({ row: i + 2, legacyId, reason: bedErr.message });
        continue;
      }
      report.placed += 1;
    }

    if (bedsToClear.length) {
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
        .in("id", bedsToClear);
      if (!error) report.cleared = bedsToClear.length;
    }

    return report;
  });
