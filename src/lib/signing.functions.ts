import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The resident signing their documents (30 Sep 2026).
 *
 * The page is reached with the same link as their profile - the token is the
 * credential, as it is there. Email one-time codes come later; the gap is
 * marked below where they will go.
 *
 * What makes a signature here more than a drawn line, the way e-signature
 * services work everywhere:
 *   - intent: they read the document, tick that they agree, type their name
 *     and draw their signature, for each document on its own
 *   - what they signed: the exact PDF, whose SHA-256 fingerprint is recorded;
 *     that file is kept and is the document from then on
 *   - who and when: the time, their IP address and browser, and the link used
 * Each document is signed on its own, so they can stop and come back.
 */

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const BUCKET = "resident-documents";
const SIGNED = new Set(["signed", "pending_stamping", "stamped"]);
const LABEL: Record<string, string> = {
  agreement: "Tenancy Agreement",
  sched_a: "Schedule A – Particulars",
  sched_b: "Schedule B – House Rules & Additional Charges",
  sched_c: "Schedule C – Inventory & Condition Record",
};
const ORDER = ["agreement", "sched_a", "sched_b", "sched_c"];

export type SigningDoc = {
  kind: "agreement" | "card";
  id: string;
  label: string;
  signed: boolean;
  /** why it cannot be signed yet, when it cannot */
  locked: string;
  /** Schedule C: a checklist answered on the page, not a document to read */
  form?: "inventory";
  /** Schedule C: until when it can still be filled in (ISO), while open */
  closes?: string;
};

async function residentFor(sb: any, token: string) {
  const { residentForToken } = await import("@/lib/profile-link.functions");
  const found = await residentForToken(sb, token);
  if ("error" in found) return { error: found.error as string };
  const { data: resident } = await sb.from("residents").select("id, full_name").eq("id", found.link.resident_id).maybeSingle();
  if (!resident) return { error: "This link is not valid." };
  return { resident, linkId: found.link.id as string };
}

/**
 * The documents this resident has to sign: from the latest pack and its access
 * card form, only those whose template has a place for their signature
 * ({{Resident_signature}}). A form Brachtia fills and hands in - the access
 * card form, as it is now - is not theirs to sign (Dani, 30 Sep 2026).
 */
async function documentsOf(sb: any, residentId: string): Promise<SigningDoc[]> {
  const { asksResidentSignature } = await import("@/lib/templates.functions");
  const out: SigningDoc[] = [];
  const { data: ag } = await sb
    .from("tenancy_agreements")
    .select("id")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ag?.length) {
    const { data: rows } = await sb.from("agreement_documents").select("id, doc_type, version, status, template_version_id").eq("agreement_id", ag[0].id);
    // the latest version of each document
    const latest = new Map<string, any>();
    for (const r of (rows ?? []) as any[]) if (!latest.has(r.doc_type) || latest.get(r.doc_type).version < r.version) latest.set(r.doc_type, r);
    for (const t of ORDER) {
      const r = latest.get(t);
      if (!r) continue;
      /*
       * Schedule C is a checklist answered here - no template, nothing to
       * upload (Dani, 1 Oct 2026). Open from the check-in day until 48 hours
       * after the check-in time; the room has to be seen to be checked.
       */
      if (t === "sched_c") {
        const signed = SIGNED.has(r.status);
        const w = signed ? null : await inventoryWindowFor(sb, residentId);
        const now = Date.now();
        const fmt = (d: Date) =>
          d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
        out.push({
          kind: "agreement",
          id: r.id,
          label: LABEL[t] ?? t,
          signed,
          form: "inventory",
          locked: signed
            ? ""
            : !w
              ? "Opens on your check-in day, so you can check the room first."
              : now < w.opens.getTime()
                ? `Opens on your check-in day, ${fmt(w.opens)}, so you can check the room first.`
                : now > w.closes.getTime()
                  ? "The 48 hours after check-in have passed. Please contact Brachtia."
                  : "",
          ...(w && now >= w.opens.getTime() && now <= w.closes.getTime() ? { closes: w.closes.toISOString() } : {}),
        });
        continue;
      }
      // already signed stays listed; otherwise only if it asks for their signature
      if (!SIGNED.has(r.status) && !(await asksResidentSignature(sb, r.template_version_id))) continue;
      out.push({ kind: "agreement", id: r.id, label: LABEL[t] ?? t, signed: SIGNED.has(r.status), locked: "" });
    }
  }
  const { data: cards } = await sb
    .from("access_card_forms")
    .select("id, status, generated_pdf_path, template_version_id")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (cards?.length && (cards[0].generated_pdf_path || (await asksResidentSignature(sb, cards[0].template_version_id)))) out.push({ kind: "card", id: cards[0].id, label: "Access Card Form", signed: !!cards[0].generated_pdf_path, locked: "" });
  return out;
}

/** The check-in the resident chose; their tenancy start when they chose none. */
async function inventoryWindowFor(sb: any, residentId: string) {
  const { inventoryWindow } = await import("@/lib/inventory");
  const { data: res } = await sb.from("residents").select("checkin_on, checkin_slot").eq("id", residentId).maybeSingle();
  if (res?.checkin_on) return inventoryWindow(String(res.checkin_on).slice(0, 10), String(res.checkin_slot ?? ""));
  const { data: ten } = await sb.from("tenancies").select("start_date").eq("resident_id", residentId).order("start_date", { ascending: false }).limit(1);
  const start = String((ten ?? [])[0]?.start_date ?? "");
  return start ? inventoryWindow(start.slice(0, 10), "") : null;
}

const tokenOnly = z.object({ token: z.string().min(16).max(128) });

export const getSigningPack = createServerFn({ method: "GET" })
  .inputValidator((d) => tokenOnly.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const found = await residentFor(sb, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };
    return { ok: true as const, name: String(found.resident.full_name ?? ""), documents: await documentsOf(sb, found.resident.id) };
  });

const docInput = tokenOnly.extend({ kind: z.enum(["agreement", "card"]), id: z.string().uuid() });

async function ownDoc(sb: any, token: string, kind: "agreement" | "card", id: string) {
  const found = await residentFor(sb, token);
  if ("error" in found) return { error: found.error };
  // only a document of this resident's, from the list they are shown
  const doc = (await documentsOf(sb, found.resident.id)).find((d) => d.kind === kind && d.id === id);
  if (!doc) return { error: "This document is not part of your pack." };
  return { ...found, doc };
}

const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** One document as the PDF it is - signed, the signed file; otherwise as it will be signed. */
export const getSigningPdf = createServerFn({ method: "POST" })
  .inputValidator((d) => docInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const own = await ownDoc(sb, data.token, data.kind, data.id);
    if ("error" in own) return { ok: false as const, error: own.error! };
    const { renderGeneratedPdf } = await import("@/lib/templates.functions");
    const r = await renderGeneratedPdf(sb, data.kind, data.id);
    return r.ok ? { ok: true as const, base64: toBase64(r.bytes), gaps: r.gaps } : r;
  });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const signDocument = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    docInput
      .extend({
        typedName: z.string().trim().min(1).max(200),
        agreed: z.literal(true),
        // the drawn signature, a PNG as base64, under ~400 KB
        png: z.string().min(100).max(600_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await db();
    const own = await ownDoc(sb, data.token, data.kind, data.id);
    if ("error" in own) return { ok: false as const, error: own.error! };
    if (own.doc.signed) return { ok: false as const, error: "This document is already signed." };
    if (own.doc.locked) return { ok: false as const, error: own.doc.locked };
    if (norm(data.typedName) !== norm(String(own.resident.full_name ?? ""))) {
      return { ok: false as const, error: "Type your full name exactly as it appears on the document." };
    }
    // TODO(OTP): when email codes arrive, check a fresh code for this link here

    const png = Uint8Array.from(atob(data.png), (c) => c.charCodeAt(0));
    if (png[0] !== 0x89 || png[1] !== 0x50) return { ok: false as const, error: "The signature could not be read. Please sign again." };
    const sigHash = hex(await crypto.subtle.digest("SHA-256", png as Uint8Array<ArrayBuffer>));
    const sigToken = `@signature:${sigHash.slice(0, 16)}`;
    const signedAt = new Date();
    const date = signedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });

    const { renderGeneratedPdf } = await import("@/lib/templates.functions");
    const r = await renderGeneratedPdf(sb, data.kind, data.id, { Resident_signature: sigToken, Resident_signature_date: date }, { [sigToken]: png });
    if (!r.ok) return { ok: false as const, error: `The document could not be prepared for signing: ${r.error}` };
    // a document with gaps in it is not the agreement - nobody signs a blank
    if (r.gaps.length) return { ok: false as const, error: "This document is not complete yet. Please contact Brachtia before signing." };
    const pdfHash = hex(await crypto.subtle.digest("SHA-256", r.bytes as Uint8Array<ArrayBuffer>));

    const base = `signed/${own.resident.id}/${data.kind}-${data.id}`;
    const req = getRequest();
    const h = req?.headers;
    const evidence = {
      document: { kind: data.kind, id: data.id, label: own.doc.label },
      resident: { id: own.resident.id, name: own.resident.full_name, typedName: data.typedName.trim() },
      agreedToDocument: true,
      signedAt: signedAt.toISOString(),
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? "",
      userAgent: h?.get("user-agent") ?? "",
      profileLinkId: own.linkId,
      pdfSha256: pdfHash,
      signatureSha256: sigHash,
      verification: "link", // "link+email-otp" once codes are sent
    };
    // written once: a signed document is refused above, so these are never
    // replaced - upsert only lets a sign that failed half-way be tried again
    const put = (path: string, body: Uint8Array | string, type: string) =>
      sb.storage.from(BUCKET).upload(path, new Blob([body as any], { type }), { contentType: type, upsert: true });
    for (const [path, body, type] of [
      [`${base}.pdf`, r.bytes, "application/pdf"],
      [`${base}-signature.png`, png, "image/png"],
      [`${base}.json`, JSON.stringify(evidence, null, 2), "application/json"],
    ] as const) {
      const { error } = await put(path, body, type);
      if (error) return { ok: false as const, error: `Could not save your signature: ${error.message}` };
    }

    const table = data.kind === "agreement" ? "agreement_documents" : "access_card_forms";
    const { error } = await sb.from(table).update({ status: "signed", generated_pdf_path: `${base}.pdf` }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

const statusSchema = z.enum(["present", "defect", "not_provided"]);

/**
 * Sign Schedule C: the checklist as answered, drawn into a PDF with both
 * signatures, kept and fingerprinted like every other signed document.
 */
export const signInventory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    docInput
      .extend({
        typedName: z.string().trim().min(1).max(200),
        agreed: z.literal(true),
        png: z.string().min(100).max(600_000),
        record: z.object({
          answers: z.record(z.string().max(60), z.object({ status: statusSchema, remark: z.string().max(500) })),
          others: z.array(z.object({ name: z.string().max(80), status: z.union([statusSchema, z.literal("")]), remark: z.string().max(500) })).max(5),
          generalRemarks: z.string().max(2000),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await db();
    const own = await ownDoc(sb, data.token, data.kind, data.id);
    if ("error" in own) return { ok: false as const, error: own.error! };
    if (own.doc.form !== "inventory") return { ok: false as const, error: "This document is not the inventory." };
    if (own.doc.signed) return { ok: false as const, error: "This document is already signed." };
    if (own.doc.locked) return { ok: false as const, error: own.doc.locked };
    if (norm(data.typedName) !== norm(String(own.resident.full_name ?? ""))) {
      return { ok: false as const, error: "Type your full name exactly as it appears on the document." };
    }
    const { inventoryProblems } = await import("@/lib/inventory");
    const problems = inventoryProblems(data.record);
    if (problems.length) return { ok: false as const, error: `Not finished yet: ${problems.join(", ")}.` };
    // TODO(OTP): when email codes arrive, check a fresh code for this link here

    const png = Uint8Array.from(atob(data.png), (c) => c.charCodeAt(0));
    if (png[0] !== 0x89 || png[1] !== 0x50) return { ok: false as const, error: "The signature could not be read. Please sign again." };
    const sigHash = hex(await crypto.subtle.digest("SHA-256", png as Uint8Array<ArrayBuffer>));
    const signedAt = new Date();
    const date = signedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });

    // the record's particulars, as saved when the pack was generated
    const { data: row } = await sb.from("agreement_documents").select("agreement_id, merge_values").eq("id", data.id).maybeSingle();
    const mv = (row?.merge_values ?? {}) as Record<string, string>;
    const { data: ag } = await sb.from("tenancy_agreements").select("agreement_no, created_at").eq("id", row?.agreement_id).maybeSingle();
    const pick = (...keys: string[]) => keys.map((k) => mv[k]).find((v) => v && String(v).trim()) ?? "";
    /*
     * The room as it is today, from the resident's bed: Schedule C records the
     * unit "as at the Effective Date" - the day it is signed - and a value
     * saved when the pack was made can be stale, or from a wrong mapping (a
     * Residence_name mapped to the resident's name printed their name as the
     * residence, 1 Oct 2026). The saved values are only the fallback.
     */
    const live = { residence: "", unitNo: "", room: "", bed: "" };
    {
      const { data: bed } = await sb.from("beds").select("label, room_id").eq("resident_id", own.resident.id).limit(1).maybeSingle();
      const { data: rm } = bed ? await sb.from("rooms").select("letter, unit_id").eq("id", bed.room_id).maybeSingle() : { data: null };
      const { data: un } = rm ? await sb.from("units").select("unit_no, residence_id").eq("id", rm.unit_id).maybeSingle() : { data: null };
      const { data: rs } = un ? await sb.from("residences").select("name").eq("id", un.residence_id).maybeSingle() : { data: null };
      live.bed = String(bed?.label ?? "");
      live.room = rm?.letter ? `Room ${rm.letter}` : "";
      live.unitNo = String(un?.unit_no ?? "");
      live.residence = String(rs?.name ?? "");
    }
    const dmy = (v: string) => {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };
    const { loadSignatory, loadSignatureImage } = await import("@/lib/signatory.server");
    const signatory = await loadSignatory(sb);
    const { inventoryPdf } = await import("@/lib/inventory-pdf");
    const bytes = await inventoryPdf({
      record: data.record,
      header: {
        agreementNo: ag?.agreement_no ?? "",
        agreementDate: ag?.created_at ? dmy(ag.created_at) : dmy(pick("agreement_date", "Agreement_date")),
        effectiveDate: date,
        residence: live.residence || pick("residence"),
        unitNo: live.unitNo || pick("unit_no", "Unit_no"),
        room: live.room || pick("room", "Room_no"),
        bed: live.bed || pick("bed", "Bed"),
      },
      resident: { name: String(own.resident.full_name ?? ""), date, signature: png },
      brachtia: {
        name: signatory?.name ?? "",
        date,
        signature: signatory?.token ? await loadSignatureImage(sb, signatory.token) : null,
      },
    });
    const pdfHash = hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));

    const base = `signed/${own.resident.id}/${data.kind}-${data.id}`;
    const h = getRequest()?.headers;
    const evidence = {
      document: { kind: data.kind, id: data.id, label: own.doc.label },
      resident: { id: own.resident.id, name: own.resident.full_name, typedName: data.typedName.trim() },
      agreedToDocument: true,
      signedAt: signedAt.toISOString(),
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? "",
      userAgent: h?.get("user-agent") ?? "",
      profileLinkId: own.linkId,
      pdfSha256: pdfHash,
      signatureSha256: sigHash,
      verification: "link",
      // the answers themselves, so the record can be read without the PDF
      inventory: data.record,
    };
    const put = (path: string, body: Uint8Array | string, type: string) =>
      sb.storage.from(BUCKET).upload(path, new Blob([body as any], { type }), { contentType: type, upsert: true });
    for (const [path, body, type] of [
      [`${base}.pdf`, bytes, "application/pdf"],
      [`${base}-signature.png`, png, "image/png"],
      [`${base}.json`, JSON.stringify(evidence, null, 2), "application/json"],
    ] as const) {
      const { error } = await put(path, body, type);
      if (error) return { ok: false as const, error: `Could not save your record: ${error.message}` };
    }
    const { error } = await sb.from("agreement_documents").update({ status: "signed", generated_pdf_path: `${base}.pdf` }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
