import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Internal notes on the resident profile - admin only (Dani, 19 Oct 2026).
 * One note per resident (residents.admin_notes), and the message the resident
 * wrote on the enquiry they came from, read-only. Both are admin-side only:
 * no resident-facing server function selects either column
 * (tests/resident-notes-private.test.ts).
 */
async function admin(): Promise<any> {
  const { adminDb } = await import("@/lib/admin-session.server");
  return adminDb();
}

function check(error: any) {
  if (!error) return;
  if (/admin_notes/.test(String(error.message)))
    throw new Error("Internal notes are not set up on this database yet - run 20261025100000_resident_admin_notes.sql.");
  throw new Error(error.message);
}

export const getResidentNote = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: r, error } = await db.from("residents").select("admin_notes, enquiry_id").eq("id", data.residentId).maybeSingle();
    // not set up yet: no note, so the profile still opens
    if (error) return { ready: false, note: "", message: "" };
    let message = "";
    if (r?.enquiry_id) {
      const { data: e } = await db.from("enquiries").select("message").eq("id", r.enquiry_id).maybeSingle();
      message = String(e?.message ?? "").trim();
    }
    return { ready: true, note: String(r?.admin_notes ?? ""), message };
  });

export const setResidentNote = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid(), note: z.string().max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("residents").update({ admin_notes: data.note }).eq("id", data.residentId);
    check(error);
    return { ok: true };
  });
