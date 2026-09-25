import { createServerFn } from "@tanstack/react-start";

import type { Resident } from "@/lib/ops-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The student-facing profile link.
 *
 * There is no login, so the token is the credential. Everything here runs on the
 * server with the service role and never trusts the browser with more than the
 * one resident's own profile:
 *
 *   - the token is 32 random bytes, unguessable
 *   - it expires, and can be revoked
 *   - only the fields in EDITABLE can be written, so a student can correct their
 *     passport number but can never touch rent, a tenancy or another resident
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Exactly the profile fields a student may see and change. Nothing else. */
const EDITABLE = [
  "full_name",
  "email",
  "mobile",
  "dob",
  "nationality",
  "id_number",
  "gender",
  "address",
  "postcode",
  "state",
  "country",
  "marital_status",
  "race",
  "religion",
  "medical_condition",
  "medical_detail",
  // what they are doing now - it decides whether the academic or the
  // employment answers below are asked for at all
  "current_status",
  "university",
  "level_of_study",
  "course",
  "student_id",
  "graduation_year",
  "company",
  "occupation",
  "industry",
  "employment_type",
  "ec_name",
  "ec_relationship",
  "ec_mobile",
  "ec_email",
  "ec_address",
  "ec_postcode",
  "ec_state",
  "ec_country",
  "pay_method",
  "pay_schedule",
  "payer_name",
  "payer_relationship",
  "payer_mobile",
  "payer_email",
  "payer_address",
  "payer_postcode",
  "payer_state",
  "payer_country",
] as const;

export type ProfileLinkFields = Partial<Record<(typeof EDITABLE)[number], string>>;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- admin side ---------------- */

/**
 * Get the resident's live link, creating one if they have none. Reusing a link
 * means a student who lost the message can be sent the same one again.
 */
export const getOrCreateProfileLink = createServerFn({ method: "POST" })
  .inputValidator((data: { residentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: live } = await supabase
      .from("profile_links")
      .select("token, expires_at")
      .eq("resident_id", data.residentId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (live?.token) return { token: live.token as string, expiresAt: live.expires_at as string };

    const token = randomToken();
    const { data: made, error } = await supabase
      .from("profile_links")
      .insert({ resident_id: data.residentId, token } as any)
      .select("token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { token: made.token as string, expiresAt: made.expires_at as string };
  });

export const revokeProfileLink = createServerFn({ method: "POST" })
  .inputValidator((data: { residentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase
      .from("profile_links")
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("resident_id", data.residentId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- student side ---------------- */

async function residentForToken(supabase: any, token: string) {
  const { data: link } = await supabase
    .from("profile_links")
    .select("id, resident_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "This link is not valid." as const };
  if (link.revoked_at) return { error: "This link has been turned off." as const };
  if (new Date(link.expires_at).getTime() < Date.now())
    return { error: "This link has expired. Ask Brachtia for a new one." as const };
  return { link };
}

export const getProfileByToken = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const found = await residentForToken(supabase, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };

    const { data: row, error } = await supabase
      .from("residents")
      .select(
        `id, quickbooks_id, resident_code, enquiry_id, docs, checkin_on, checkin_slot, checkin_remind, ${EDITABLE.join(", ")}`,
      )
      .eq("id", found.link.resident_id)
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("profile_links")
      .update({ opened_at: new Date().toISOString() } as any)
      .eq("id", found.link.id)
      .is("opened_at", null);

    const values: ProfileLinkFields = {};
    for (const key of EDITABLE) values[key] = row[key] == null ? "" : String(row[key]);

    /*
     * What they told us when they enquired, used only where the profile has no
     * answer of its own. The application is the final word - anything already
     * saved wins, and everything pre-filled here stays editable.
     */
    if (!values.current_status && row.enquiry_id) {
      const { data: enquiry } = await supabase
        .from("enquiries")
        .select("current_status, university, company, occupation")
        .eq("id", row.enquiry_id)
        .maybeSingle();
      if (enquiry) {
        values.current_status = String(enquiry.current_status ?? "");
        // their intake is not their graduation year, so only the institution
        // comes across - the two say different things
        if (!values.university) values.university = String(enquiry.university ?? "");
        /*
         * And where somebody working works. Only the student half was carried
         * across, so an employed applicant typed their employer on the enquiry
         * and was asked for it again here - which is the asking-twice this was
         * meant to stop.
         */
        if (!values.company) values.company = String(enquiry.company ?? "");
        if (!values.occupation) values.occupation = String(enquiry.occupation ?? "");
      }
    }
    const docs = Array.isArray(row.docs)
      ? (row.docs as any[]).map((d) => ({
          key: String(d?.key ?? ""),
          fileName: String(d?.fileName ?? ""),
        }))
      : [];
    /*
     * The day their tenancy starts, so the check-in step can offer that day and
     * the week after it and nothing else. The tenancy is the agreed date; the
     * enquiry only says what they asked for, so it is the fallback.
     */
    let moveIn = "";
    const { data: tenancy } = await supabase
      .from("tenancies")
      .select("start_date")
      .eq("resident_id", row.id)
      .order("start_date", { ascending: false })
      .limit(1);
    moveIn = String(((tenancy ?? []) as any[])[0]?.start_date ?? "");
    if (!moveIn && row.enquiry_id) {
      const { data: enq } = await supabase
        .from("enquiries")
        .select("move_in")
        .eq("id", row.enquiry_id)
        .maybeSingle();
      moveIn = String((enq as any)?.move_in ?? "");
    }

    return {
      ok: true as const,
      values,
      docs,
      residentId: row.id as string,
      // the ID they go by - not their university student ID, which is one of the fields
      residentCode: String(row.resident_code || row.quickbooks_id || ""),
      moveIn,
      checkIn: {
        on: String((row as any).checkin_on ?? ""),
        slot: String((row as any).checkin_slot ?? ""),
        remind: Boolean((row as any).checkin_remind),
      },
    };
  });

import { CHECKIN_TYPE } from "@/lib/checkin";

/**
 * The student's arrival, put where staff already look for appointments.
 *
 * Pending, not confirmed - exactly as a viewing booked from the website is. A
 * student naming a time is asking for it; somebody has to have a key and an
 * hour free before it is a fact, and the Appointment manager is where that
 * decision already gets made.
 *
 * One appointment per resident, moved rather than repeated: the form can be
 * submitted as often as they like, and each save must not leave another arrival
 * behind on the calendar. Choosing the reminder instead withdraws the one they
 * had, because an arrival nobody intends to make is worse on a calendar than no
 * arrival at all.
 *
 * Never throws. A student's application must not fail over a calendar entry.
 */
async function recordCheckInAppointment(
  supabase: any,
  residentId: string,
  choice: { on?: string; slot?: string; remind?: boolean },
) {
  try {
    const { data: resident } = await supabase
      .from("residents")
      .select("full_name, email, mobile, university, enquiry_id")
      .eq("id", residentId)
      .maybeSingle();
    if (!resident) return;

    // the one they already asked for, if any - found before anything is written
    const { data: mine } = await supabase
      .from("appointments")
      .select("id")
      .eq("type_slug", CHECKIN_TYPE)
      .eq("resident_id", residentId)
      .neq("status", "cancelled")
      .limit(1);
    const existing = ((mine ?? []) as any[])[0] ?? null;

    if (choice.remind || !choice.on || !choice.slot) {
      // withdrawn: the slot goes back, and the record of it having been asked
      // for stays as a cancellation rather than vanishing
      if (existing) {
        await supabase
          .from("appointments")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
      return;
    }

    const { data: enquiry } = resident.enquiry_id
      ? await supabase
          .from("enquiries")
          .select("residence_slug, residence_name")
          .eq("id", resident.enquiry_id)
          .maybeSingle()
      : { data: null };
    const { data: type } = await supabase
      .from("appointment_types")
      .select("duration_minutes")
      .eq("slug", CHECKIN_TYPE)
      .maybeSingle();

    // the time as Malaysia reads it; stored as the instant it names
    const startsAt = new Date(`${choice.on}T${choice.slot}:00+08:00`).toISOString();
    const row = {
      type_slug: CHECKIN_TYPE,
      mode: "in_person",
      starts_at: startsAt,
      duration_minutes: Number((type as any)?.duration_minutes ?? 60),
      status: "pending",
      resident_id: residentId,
      enquiry_id: (resident as any).enquiry_id ?? null,
      residence_slug: String((enquiry as any)?.residence_slug ?? ""),
      residence_name: String((enquiry as any)?.residence_name ?? ""),
      full_name: String((resident as any).full_name ?? ""),
      email: String((resident as any).email ?? ""),
      phone: String((resident as any).mobile ?? ""),
      university: String((resident as any).university ?? ""),
      source: "resident-form",
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("appointments").update(row).eq("id", existing.id);
    } else {
      await supabase.from("appointments").insert(row);
    }
  } catch (err) {
    console.warn("check-in appointment not recorded", err);
  }
}

export const submitProfileByToken = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      values: ProfileLinkFields;
      /** what they said about arriving - a day and a time, or ask me later */
      checkIn?: { on?: string; slot?: string; remind?: boolean };
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const found = await residentForToken(supabase, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };

    // whitelist: anything the browser sends that is not a profile field is dropped
    const row: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      const v = data.values[key];
      if (typeof v === "string") row[key] = v.trim();
    }

    /*
     * When they said they would arrive. A request, not a booking - nothing is
     * held for them until admin has a key and a person ready. "Remind me" is an
     * answer too, and is kept as one so the booking can show it rather than
     * looking like a form nobody finished.
     */
    if (data.checkIn) {
      const remind = Boolean(data.checkIn.remind);
      row["checkin_remind"] = remind;
      row["checkin_on"] = remind ? null : data.checkIn.on || null;
      row["checkin_slot"] = remind ? "" : (data.checkIn.slot ?? "");
      row["checkin_asked_at"] = new Date().toISOString();
    }

    if (!Object.keys(row).length) return { ok: true as const };

    const { error } = await supabase
      .from("residents")
      .update(row as any)
      .eq("id", found.link.resident_id);
    if (error) throw new Error(error.message);

    // the arrival goes on the calendar staff actually work from
    if (data.checkIn) {
      await recordCheckInAppointment(supabase, found.link.resident_id, data.checkIn);
    }

    await supabase
      .from("profile_links")
      .update({ submitted_at: new Date().toISOString() } as any)
      .eq("id", found.link.id);
    return { ok: true as const };
  });

/* ---------------- documents ---------------- */

// which documents a student is asked for, what may be uploaded and where it is
// kept all live in resident-documents.ts, shared with the form and the admin page

/**
 * Upload one document against a profile link.
 *
 * The token decides which resident the file belongs to, so a student can never
 * write into someone else's folder. The file itself is already compressed in the
 * browser; this is the size guard of last resort.
 */
export const uploadDocumentByToken = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const token = String(data.get("token") ?? "");
    const key = String(data.get("key") ?? "");
    const file = data.get("file");
    const { DOC_BUCKET, DOC_MIME_TYPES, MAX_DOC_BYTES, STUDENT_DOCS, safeExt, studentDocLabel } =
      await import("@/lib/resident-documents");

    const found = await residentForToken(supabase, token);
    if ("error" in found) return { ok: false as const, error: found.error };
    if (!STUDENT_DOCS.some((d) => d.key === key))
      return { ok: false as const, error: "Unknown document." };
    if (!(file instanceof File)) return { ok: false as const, error: "No file provided." };
    if (file.size > MAX_DOC_BYTES)
      return { ok: false as const, error: "That file is larger than 8MB." };
    if (file.type && !DOC_MIME_TYPES.includes(file.type))
      return { ok: false as const, error: "Please upload a photo or a PDF." };

    const residentId = found.link.resident_id as string;
    const path = `${residentId}/${key}-${Date.now().toString(36)}.${safeExt(file.name, file.type)}`;
    const { error: upErr } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: true });
    if (upErr) return { ok: false as const, error: upErr.message };

    // record it on the resident, replacing any earlier file of the same kind
    const { data: row } = await supabase
      .from("residents")
      .select("docs, nationality")
      .eq("id", residentId)
      .single();
    const docs = Array.isArray(row?.docs) ? (row!.docs as any[]) : [];
    // the ID copy is recorded as what it is - an IC copy or a passport copy
    const label = studentDocLabel(key, String(row?.nationality ?? ""));
    const next = [
      ...docs.filter((d) => d?.key !== key),
      { key, label, fileName: file.name, path, uploadedAt: new Date().toISOString() },
    ];
    const { error } = await supabase
      .from("residents")
      .update({ docs: next } as any)
      .eq("id", residentId);
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, fileName: file.name };
  });

export type ResidentProfileKeys = keyof ProfileLinkFields;
export type { Resident };
