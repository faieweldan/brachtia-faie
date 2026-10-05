import { createServerFn } from "@tanstack/react-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Agreement files Brachtia uploads, rather than ones made here (Dani, 1 Oct
 * 2026):
 *   - an existing resident's tenancy, signed on paper before the website: the
 *     pack is recorded from the scans, already signed
 *   - the stamp page of a signed document, from LHDN's stamping: one extra page
 *     put in front of that document
 * And, once every document is signed, the whole agreement as one PDF - each
 * document after its stamp page, the pages numbered - the same way the
 * booking's invoice, receipts and proofs open as one file.
 */

const BUCKET = "resident-documents";
const ORDER = ["agreement", "sched_a", "sched_b", "sched_c"] as const;
const DONE = new Set(["signed", "pending_stamping", "stamped"]);
const MAX_BYTES = 8 * 1024 * 1024;

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** where a document's stamp page is kept */
export const stampPath = (residentId: string, docId: string) => `stamped/${residentId}/${docId}.pdf`;

/** A scan as a PDF: a PDF stays as it is; a photo gets an A4 page of its own. */
async function asPdf(file: File): Promise<Uint8Array> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 8MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  if (bytes[0] === 0x25 && bytes[1] === 0x50) {
    await PDFDocument.load(bytes); // refuse a PDF that cannot be read
    return bytes;
  }
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  if (!jpg && !png) throw new Error(`${file.name}: upload a PDF, JPG or PNG`);
  const pdf = await PDFDocument.create();
  const img = jpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  const page = pdf.addPage([595.28, 841.89]);
  const k = Math.min((595.28 - 48) / img.width, (841.89 - 48) / img.height);
  page.drawImage(img, { x: (595.28 - img.width * k) / 2, y: (841.89 - img.height * k) / 2, width: img.width * k, height: img.height * k });
  return pdf.save();
}

async function put(db: any, path: string, bytes: Uint8Array) {
  const { error } = await db.storage.from(BUCKET).upload(path, new Blob([bytes as any], { type: "application/pdf" }), {
    upsert: true,
    contentType: "application/pdf",
  });
  if (error) throw new Error(`Could not save the file: ${error.message}`);
}

/**
 * An existing resident's tenancy, signed before the website: the Tenancy
 * Agreement scan, and the schedules that were part of it. Recorded as a pack
 * that is already signed - nothing to generate or send.
 */
export const uploadExistingAgreement = createServerFn({ method: "POST" })
  .inputValidator((d: FormData) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const residentId = String(data.get("residentId") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(residentId)) throw new Error("No resident");
    const { data: existing } = await db.from("tenancy_agreements").select("id").eq("resident_id", residentId).limit(1);
    if (existing?.length) throw new Error("This resident already has a tenancy agreement");
    const files: Partial<Record<(typeof ORDER)[number], File>> = {};
    for (const t of ORDER) {
      const f = data.get(t);
      if (f instanceof File && f.size) files[t] = f;
    }
    if (!files.agreement) throw new Error("Attach the signed Tenancy Agreement");
    const pdfs: [string, Uint8Array][] = [];
    for (const t of ORDER) if (files[t]) pdfs.push([t, await asPdf(files[t]!)]);

    const { data: seqRow, error: seqErr } = await db.rpc("next_agreement_no" as never);
    if (seqErr) throw new Error(seqErr.message ?? "Could not number the agreement");
    const agreementNo = `TA-${String(seqRow).padStart(4, "0")}`;
    const { data: agreement, error: aErr } = await db
      .from("tenancy_agreements")
      .insert({ resident_id: residentId, agreement_no: agreementNo, kind: "initial" })
      .select()
      .single();
    if (aErr) throw new Error(aErr.message);

    const stamp = Date.now().toString(36);
    const periodStart = String(data.get("periodStart") ?? "") || null;
    const periodEnd = String(data.get("periodEnd") ?? "") || null;
    const rows = [];
    for (const [t, bytes] of pdfs) {
      const path = `signed/${residentId}/uploaded-${t}-${stamp}.pdf`;
      await put(db, path, bytes);
      rows.push({
        agreement_id: agreement.id,
        doc_type: t,
        version: 1,
        status: "signed",
        effective_date: new Date().toISOString().slice(0, 10),
        period_start: periodStart,
        period_end: periodEnd,
        // marks it as a scan uploaded, not made from a template
        merge_values: { source: "uploaded" },
        template_version_id: null,
        generated_pdf_path: path,
      });
    }
    const { error: dErr } = await db.from("agreement_documents").insert(rows);
    if (dErr) throw new Error(dErr.message);
    return { ok: true as const, agreementNo };
  });

/** A signed document's stamp page - put in front of it; uploading again replaces it. */
export const uploadStampPage = createServerFn({ method: "POST" })
  .inputValidator((d: FormData) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const docId = String(data.get("documentId") ?? "");
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Attach the stamp page");
    const { data: doc } = await db.from("agreement_documents").select("id, agreement_id, status").eq("id", docId).maybeSingle();
    if (!doc) throw new Error("Document not found");
    if (!DONE.has(doc.status)) throw new Error("Only a signed document can be stamped");
    const { data: ag } = await db.from("tenancy_agreements").select("resident_id").eq("id", doc.agreement_id).maybeSingle();
    await put(db, stampPath(String(ag?.resident_id), docId), await asPdf(file));
    const { error } = await db.from("agreement_documents").update({ status: "stamped" }).eq("id", docId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * The whole agreement as one PDF: the Tenancy Agreement, then Schedules A, B
 * and C - each after its stamp page, when it has one - with "Page x of y" at
 * the foot of every page.
 */
export const fullAgreementPdf = createServerFn({ method: "POST" })
  .inputValidator((d: { agreementId: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: ag } = await db.from("tenancy_agreements").select("id, resident_id").eq("id", data.agreementId).maybeSingle();
    if (!ag) throw new Error("Agreement not found");
    const { data: rows } = await db.from("agreement_documents").select("id, doc_type, version, status, generated_pdf_path").eq("agreement_id", ag.id);
    const latest = new Map<string, any>();
    for (const r of (rows ?? []) as any[]) if (!latest.has(r.doc_type) || latest.get(r.doc_type).version < r.version) latest.set(r.doc_type, r);
    const docs = ORDER.map((t) => latest.get(t)).filter(Boolean);
    if (!docs.length || docs.some((d) => !DONE.has(d.status) || !d.generated_pdf_path)) throw new Error("Every document has to be signed first");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const out = await PDFDocument.create();
    const add = async (path: string) => {
      const { data: file } = await db.storage.from(BUCKET).download(path);
      if (!file) return;
      const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    };
    for (const d of docs) {
      if (d.status === "stamped") await add(stampPath(String(ag.resident_id), d.id));
      await add(d.generated_pdf_path);
    }
    const font = await out.embedFont(StandardFonts.Helvetica);
    const pages = out.getPages();
    pages.forEach((p, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, { x: p.getWidth() / 2 - font.widthOfTextAtSize(label, 8) / 2, y: 14, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    });
    const bytes = await out.save();
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin) };
  });
