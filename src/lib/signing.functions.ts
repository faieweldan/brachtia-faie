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
  /** Schedule C: the move-in check, or the move-out check */
  mode?: "in" | "out";
  /** Schedule C: sent in, waiting for Brachtia to review and sign */
  submitted?: boolean;
  /** Schedule C: until when it can still be filled in (ISO), while open */
  closes?: string;
  /** unique on the page - Schedule C's move-in and move-out share a document */
  key: string;
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
        const { readInventory } = await import("@/lib/inventory.server");
        const signed = SIGNED.has(r.status);
        const submitted = r.status === "submitted";
        out.push({
          kind: "agreement",
          id: r.id,
          key: `${r.id}:in`,
          label: "Schedule C – Move-in check",
          signed,
          submitted,
          form: "inventory",
          mode: "in",
          // set below, once the documents to sign before it are known
          locked: "",
        });
        // the move-out check, once Brachtia has opened it
        const outFile = signed ? await readInventory(sb, residentId, r.id, "out") : null;
        if (outFile) {
          out.push({
            kind: "agreement",
            id: r.id,
            key: `${r.id}:out`,
            label: "Schedule C – Move-out check",
            signed: outFile.status === "signed",
            submitted: outFile.status === "submitted",
            form: "inventory",
            mode: "out",
            locked: "",
          });
        }
        continue;
      }
      // already signed stays listed; otherwise only if it asks for their signature
      if (!SIGNED.has(r.status) && !(await asksResidentSignature(sb, r.template_version_id))) continue;
      out.push({ kind: "agreement", id: r.id, key: r.id, label: LABEL[t] ?? t, signed: SIGNED.has(r.status), locked: "" });
    }
  }
  const { data: cards } = await sb
    .from("access_card_forms")
    .select("id, status, generated_pdf_path, template_version_id")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (cards?.length && (cards[0].generated_pdf_path || (await asksResidentSignature(sb, cards[0].template_version_id)))) out.push({ kind: "card", id: cards[0].id, key: cards[0].id, label: "Access Card Form", signed: !!cards[0].generated_pdf_path, locked: "" });
  /*
   * The move-in check opens once the documents before it are signed - its own
   * page, straight after them (Dani, 1 Oct 2026). Not tied to the check-in
   * date: the resident goes on to it as soon as they have signed.
   */
  const { INVENTORY_AFTER_DOCUMENTS } = await import("@/lib/inventory");
  const unsigned = INVENTORY_AFTER_DOCUMENTS ? out.filter((d) => d.form !== "inventory" && !d.signed).length : 0;
  for (const d of out) {
    if (d.form === "inventory" && d.mode === "in" && !d.signed && !d.submitted && unsigned) {
      d.locked = `Sign your ${unsigned === 1 ? "last document" : `${unsigned} documents`} first - the inventory check comes after them.`;
    }
  }
  return out;
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
  .inputValidator((d) => docInput.extend({ mode: z.enum(["in", "out"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const own = await ownDoc(sb, data.token, data.kind, data.id);
    if ("error" in own) return { ok: false as const, error: own.error! };
    // the signed move-out check is its own PDF, kept beside the move-in one
    if (data.mode === "out") {
      const { getFile, readInventory } = await import("@/lib/inventory.server");
      const f = await readInventory(sb, own.resident.id, data.id, "out");
      const bytes = f?.signed ? await getFile(sb, f.signed.pdfPath) : null;
      return bytes ? { ok: true as const, base64: toBase64(bytes), gaps: [] as string[] } : { ok: false as const, error: "Not signed yet." };
    }
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
const recordSchema = z.object({
  answers: z.record(z.string().max(60), z.object({ status: statusSchema, remark: z.string().max(500), qty: z.string().max(12).optional() })),
  extras: z
    .array(
      z.object({
        id: z.string().max(20),
        areaId: z.string().max(20),
        name: z.string().max(80),
        qty: z.string().max(12),
        status: z.union([statusSchema, z.literal("")]),
        remark: z.string().max(500),
      }),
    )
    .max(60),
  meters: z.object({ keys: z.string().max(30), water: z.string().max(30), electric: z.string().max(30) }),
  generalRemarks: z.string().max(2000),
});

/**
 * Send in a Schedule C check - move-in or move-out - with the resident's
 * signature. It waits for Brachtia to review it and sign; only then is the PDF
 * made and the document Signed (Dani, 1 Oct 2026).
 */
export const submitInventory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    docInput
      .extend({
        mode: z.enum(["in", "out"]),
        typedName: z.string().trim().min(1).max(200),
        agreed: z.literal(true),
        png: z.string().min(100).max(600_000),
        record: recordSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await db();
    const found = await residentFor(sb, data.token);
    if ("error" in found) return { ok: false as const, error: found.error };
    const doc = (await documentsOf(sb, found.resident.id)).find((d) => d.key === `${data.id}:${data.mode}`);
    if (!doc) return { ok: false as const, error: "This check is not part of your documents." };
    if (doc.signed) return { ok: false as const, error: "This check is already signed." };
    if (doc.submitted) return { ok: false as const, error: "This check has already been sent in." };
    if (doc.locked) return { ok: false as const, error: doc.locked };
    if (norm(data.typedName) !== norm(String(found.resident.full_name ?? ""))) {
      return { ok: false as const, error: "Type your full name exactly as it appears on your documents." };
    }
    const { inventoryProblems } = await import("@/lib/inventory");
    // the schema's optional qty reads as "string | undefined"; the record type means the same
    const record = data.record as import("@/lib/inventory").InventoryRecord;
    const problems = inventoryProblems(record);
    if (problems.length) return { ok: false as const, error: `Not finished yet: ${problems.join(", ")}.` };
    // TODO(OTP): when email codes arrive, check a fresh code for this link here

    const png = Uint8Array.from(atob(data.png), (c) => c.charCodeAt(0));
    if (png[0] !== 0x89 || png[1] !== 0x50) return { ok: false as const, error: "The signature could not be read. Please sign again." };
    const { inventoryBase, putFile, readInventory, sha256, writeInventory } = await import("@/lib/inventory.server");
    const base = inventoryBase(found.resident.id, data.id, data.mode);
    try {
      await putFile(sb, `${base}-signature.png`, png, "image/png");
      const h = getRequest()?.headers;
      const before = data.mode === "out" ? await readInventory(sb, found.resident.id, data.id, "out") : null;
      await writeInventory(sb, found.resident.id, data.id, {
        ...(before ?? {}),
        mode: data.mode,
        status: "submitted",
        record,
        submitted: {
          at: new Date().toISOString(),
          typedName: data.typedName.trim(),
          ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? "",
          userAgent: h?.get("user-agent") ?? "",
          profileLinkId: found.linkId,
          signaturePath: `${base}-signature.png`,
          signatureSha256: await sha256(png),
        },
      });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not send it in." };
    }
    if (data.mode === "in") {
      const { error } = await sb.from("agreement_documents").update({ status: "submitted" }).eq("id", data.id);
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

/** At move-out: the move-in record, shown beside each item. */
export const getInventoryBaseline = createServerFn({ method: "POST" })
  .inputValidator((d) => docInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const found = await residentFor(sb, data.token);
    if ("error" in found) return null;
    if (!(await documentsOf(sb, found.resident.id)).some((d) => d.key === `${data.id}:out`)) return null;
    const { readInventory } = await import("@/lib/inventory.server");
    return (await readInventory(sb, found.resident.id, data.id, "in"))?.record ?? null;
  });
