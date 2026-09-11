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
  "university",
  "level_of_study",
  "course",
  "student_id",
  "graduation_year",
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
      .select(`id, quickbooks_id, docs, ${EDITABLE.join(", ")}`)
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
    const docs = Array.isArray(row.docs)
      ? (row.docs as any[]).map((d) => ({
          key: String(d?.key ?? ""),
          fileName: String(d?.fileName ?? ""),
        }))
      : [];
    return { ok: true as const, values, docs, residentId: row.id as string };
  });

export const submitProfileByToken = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; values: ProfileLinkFields }) => data)
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
    if (!Object.keys(row).length) return { ok: true as const };

    const { error } = await supabase
      .from("residents")
      .update(row as any)
      .eq("id", found.link.resident_id);
    if (error) throw new Error(error.message);

    await supabase
      .from("profile_links")
      .update({ submitted_at: new Date().toISOString() } as any)
      .eq("id", found.link.id);
    return { ok: true as const };
  });

/* ---------------- documents ---------------- */

const DOC_BUCKET = "resident-documents";
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/**
 * The documents a student may upload. Anything else is refused.
 *
 * The test is who actually holds the file, not which screen it was listed under.
 * A student has their own photo, offer letter, passport and payment receipts.
 * They do NOT hold the tenancy agreement or the stamped copy - Brachtia produces
 * those - so those stay out of this list.
 */
/**
 * Only what a student can supply on their own.
 *
 * The declaration form and the tenancy agreement are issued by Brachtia and
 * signed later, and the balance is paid after the room is confirmed - asking
 * for them here made the list look unfinished for everybody. They come back
 * when there is a document to sign and a balance to pay.
 */
export const STUDENT_DOCS = [
  { key: "photo", label: "Passport size photo" },
  { key: "offer", label: "University offer letter" },
  { key: "id", label: "Passport / NRIC copy" },
  { key: "booking_proof", label: "Booking fee payment proof" },
  // A parent or guardian is a second person, and a student typing their name
  // proves nothing. Until they get a link of their own, the paper route is the
  // honest one: print it, have it signed, photograph it back.
  {
    key: "guardian_declaration",
    label: "Declaration signed by parent / guardian (only if Brachtia asked for it)",
  },
] as const;

function safeExt(name: string, type: string) {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return type === "application/pdf" ? "pdf" : "jpg";
}

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

    const found = await residentForToken(supabase, token);
    if ("error" in found) return { ok: false as const, error: found.error };
    if (!STUDENT_DOCS.some((d) => d.key === key))
      return { ok: false as const, error: "Unknown document." };
    if (!(file instanceof File)) return { ok: false as const, error: "No file provided." };
    if (file.size > MAX_DOC_BYTES)
      return { ok: false as const, error: "That file is larger than 8MB." };
    if (file.type && !DOC_TYPES.includes(file.type))
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
      .select("docs")
      .eq("id", residentId)
      .single();
    const docs = Array.isArray(row?.docs) ? (row!.docs as any[]) : [];
    const label = STUDENT_DOCS.find((d) => d.key === key)!.label;
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
