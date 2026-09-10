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
    address: str(row.address),
    postcode: str(row.postcode),
    state: str(row.state),
    country: str(row.country),
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
    legacy_id: r.legacyId ? r.legacyId : null,
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

/**
 * Excel stores an id like 00949 as the number 949, which arrives as "949" or
 * "949.0" once its leading zeros are gone. Brachtia's ids are five digits, so a
 * bare number is padded back.
 */
function toLegacyId(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  const m = /^(\d+)(?:\.0+)?$/.exec(v);
  return m ? m[1]!.padStart(5, "0") : v;
}

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

/** The sheet writes M / F; the app stores the words the dropdown offers. */
function toGender(raw: string) {
  const v = raw.trim().toLowerCase();
  if (v === "m" || v === "male") return "Male";
  if (v === "f" || v === "female") return "Female";
  return raw.trim();
}

/**
 * "(B1)" / "(B2)" / "(B3)" in a student's name is a sponsor intake batch - in
 * this data, always PETRONAS. It describes the sponsorship, not the person, so
 * it is lifted off the name and carried on the payor instead.
 */
function splitBatch(fullName: string) {
  const m = /\((B\d+)\)/i.exec(fullName);
  if (!m) return { name: fullName.trim(), batch: "" };
  return {
    name: fullName
      .replace(m[0], "")
      .replace(/\s{2,}/g, " ")
      .trim(),
    batch: m[1]!.toUpperCase(),
  };
}

/**
 * Sponsor is who pays. Anything other than "SELF" (MARA, PETRONAS, a university)
 * is a third party.
 *
 * "SELF" only tells us there is no sponsor - it does not say who transfers the
 * money, which is often a parent. Leaving the payor blank there keeps the field
 * honest until someone fills it in; a wrong name would end up on an invoice.
 */
function toPayor(sponsor: string, batch: string) {
  const v = sponsor.trim();
  if (!v || v.toUpperCase() === "SELF") return { name: "", relationship: "" };
  return { name: batch ? `${v} (${batch})` : v, relationship: "Sponsor" };
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
/**
 * A whole-unit letting is one tenancy shared by several students, and the sheet
 * packs them into a single row: ids separated by spaces, everything else by line
 * breaks.
 *
 *   StudentID   "00357   00358   00359   00360"
 *   StudentName "Liew Jie Sheng\nNg Jun Wei\n…"
 *
 * Each is a real person with their own passport and phone, so the row is split
 * into one row per student. Only the first is placed on the bed - a bed records
 * one occupant - and the rest are reported, because sharing a letting needs the
 * tenancies table to be modelled properly.
 */
function expandSharedRows(rows: ImportRow[]): { row: ImportRow; sharesWith?: string }[] {
  const out: { row: ImportRow; sharesWith?: string }[] = [];
  const perLine = [
    "studentname",
    "student name",
    "email",
    "mobilenumber",
    "mobile number",
    "idnumber",
    "id number",
  ];

  for (const row of rows) {
    const rawIds = pick(row, "studentid", "student id", "resident id", "legacy_id");
    const ids = rawIds.split(/[\s,]+/).filter(Boolean);
    if (ids.length < 2) {
      out.push({ row });
      continue;
    }

    const lines: Record<string, string[]> = {};
    for (const key of perLine) {
      const v = row[key];
      if (v)
        lines[key] = String(v)
          .split("\n")
          .map((x) => x.trim());
    }

    const names = lines["studentname"] ?? lines["student name"] ?? [];
    ids.forEach((id, i) => {
      const copy: ImportRow = { ...row };
      copy["studentid"] = id;
      for (const key of perLine) {
        const parts = lines[key];
        if (parts) copy[key] = parts[i] ?? "";
      }
      const others = names.filter((_, j) => j !== i).filter(Boolean);
      out.push({
        row: copy,
        ...(i > 0 || others.length ? { sharesWith: others.join(", ") } : {}),
      });
    });
  }
  return out;
}

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

    /**
     * The sheet writes A-23A-3A where the inventory holds A-23A-03A - the same
     * unit, padded differently. Every numeric-leading part is padded to two
     * digits so both spellings land on the same key.
     */
    const normUnit = (raw: string) =>
      raw
        .trim()
        .toUpperCase()
        .split("-")
        .map((part) => {
          const m = /^(\d+)([A-Z]*)$/.exec(part);
          return m ? `${m[1]!.padStart(2, "0")}${m[2]}` : part;
        })
        .join("-");

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
    const { data: beds } = await supabase.from("beds").select("id, room_id, label, resident_id");
    const bedKey = (unitNo: string, letter: string, label: string) =>
      `${normUnit(unitNo)}|${letter}|${label}`.toLowerCase().replace(/\s+/g, " ").trim();
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
      roomIdByKey.set(
        `${normUnit(unitNo)}|${String((r as any).letter)}`.toLowerCase().trim(),
        (r as any).id,
      );
    }
    const bedsByRoom = new Map<string, { id: string; label: string; taken: boolean }[]>();
    for (const b of beds ?? []) {
      const list = bedsByRoom.get((b as any).room_id) ?? [];
      list.push({
        id: (b as any).id,
        label: String((b as any).label),
        taken: !!(b as any).resident_id,
      });
      bedsByRoom.set((b as any).room_id, list);
    }

    /**
     * Nobody has touched the website yet, so every room's configuration comes
     * from this sheet too - including the configuration of a room that already
     * has someone in it. The sheet decides, and the app follows.
     *
     * So the rooms are settled BEFORE anyone is placed. An Active row wins,
     * because that is the letting in force; otherwise whichever shape the sheet
     * uses most often for that room.
     */
    function wantedFor(label: string) {
      if (/^single$/i.test(label)) return { occupancy: "single", labels: ["Single"] };
      if (/^unit$/i.test(label)) return { occupancy: "unit", labels: ["Unit"] };
      return { occupancy: "twin", labels: ["Twin 1", "Twin 2"] };
    }

    async function applyRoomConfigs(rows: ImportRow[]) {
      type Vote = { active: string | null; counts: Record<string, number> };
      const votes = new Map<string, Vote>();

      for (const row of rows) {
        const unitNo = pick(row, "unit", "unit_no", "unitno");
        const letter = pick(row, "room", "room_letter");
        const label = pick(row, "bed", "bed_label");
        if (!unitNo || !letter || !label) continue;
        const shape = wantedFor(label).occupancy;
        const key = `${normUnit(unitNo)}|${letter}`.toLowerCase().trim();
        const v = votes.get(key) ?? { active: null, counts: {} };
        v.counts[shape] = (v.counts[shape] ?? 0) + 1;
        if (/^active$/i.test(pick(row, "status"))) {
          if (v.active && v.active !== shape) {
            report.problems.push({
              row: 0,
              legacyId: "",
              reason: `${unitNo} / ${letter}: the sheet has active lettings as both ${v.active} and ${shape} — ${shape} was used`,
            });
          }
          v.active = shape;
        }
        votes.set(key, v);
      }

      for (const [key, v] of votes) {
        const roomId = roomIdByKey.get(key);
        if (!roomId) continue;
        const shape =
          v.active ?? Object.entries(v.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "twin";
        const labels = wantedFor(
          shape === "single" ? "Single" : shape === "unit" ? "Unit" : "Twin 1",
        ).labels;

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
    rows.forEach((row, i) => {
      const id = toLegacyId(pick(row, "studentid", "student id", "resident id", "legacy_id"));
      if (!id) return;
      const held = winnerFor.get(id);
      if (held === undefined || rank(row) >= rank(rows[held]!)) winnerFor.set(id, i);
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
    /**
     * A bed holds one person. If two rows both claim it, the later write would
     * quietly overwrite the earlier one and leave a student with no room and no
     * explanation - so the first claim keeps the bed and the second is reported.
     */
    const claimedBy = new Map<string, { legacyId: string; row: number }>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const sharesWith = expanded[i]?.sharesWith;
      const legacyId = toLegacyId(pick(row, "studentid", "student id", "resident id", "legacy_id"));
      const name = pick(row, "studentname", "student name", "full name", "name");
      const unitNo = pick(row, "unit", "unit_no", "unitno");
      const letter = pick(row, "room", "room_letter");
      const label = pick(row, "bed", "bed_label");
      const bedId = bedIdByKey.get(bedKey(unitNo, letter, label));

      const rawStatus = pick(row, "status");
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

      if (!legacyId || /^vacant$/i.test(name) || freesTheBed) {
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

      const sponsor = pick(row, "sponsor");
      const { name: cleanName, batch } = splitBatch(name);
      const payor = toPayor(sponsor, batch);

      const residentRow: Record<string, unknown> = {
        legacy_id: legacyId,
        full_name: cleanName,
        email: pick(row, "email"),
        mobile: pick(row, "mobilenumber", "mobile number", "mobile", "phone"),
        nationality: pick(row, "nationality"),
        id_number: pick(row, "idnumber", "id number", "passport", "nric"),
        gender: toGender(pick(row, "gender")),
        university: pick(row, "university"),
        sponsor,
        payer_name: payor.name,
        payer_relationship: payor.relationship,
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

      // an ended or not-yet-started letting leaves no one in the bed
      if (freesTheBed) continue;

      // a shared whole-unit letting: the bed records one occupant, so the others
      // are saved as residents and reported rather than silently dropped
      if (sharesWith) {
        report.problems.push({
          row: i + 2,
          legacyId,
          reason: `shares the whole-unit letting at ${unitNo} with ${sharesWith} — saved, but only one occupant can be recorded on a bed until tenancies exist`,
        });
        continue;
      }

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

      const heldBy = claimedBy.get(bedId);
      if (heldBy && heldBy.legacyId !== legacyId) {
        report.problems.push({
          row: i + 2,
          legacyId,
          reason: `${unitNo} / ${letter} / ${label} is already taken by ${heldBy.legacyId} on row ${heldBy.row} — resident saved, placement skipped`,
        });
        continue;
      }
      claimedBy.set(bedId, { legacyId, row: i + 2 });

      const { error: bedErr } = await supabase
        .from("beds")
        .update({
          // "Booked" is a letting agreed but not moved into
          status: /^booked$/i.test(rawStatus) ? "booked" : "active",
          resident_id: legacyId,
          resident_name: name,
          university: pick(row, "university") || null,
          nationality: pick(row, "nationality") || null,
          gender: toGender(pick(row, "gender")) || null,
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
