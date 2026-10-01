import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Brachtia's side of Schedule C (Dani, 1 Oct 2026): read what the resident
 * sent in, then confirm and sign - only then is the PDF made and the check
 * Signed. Once the move-in is signed, the move-out check can be opened on the
 * same signing link.
 */

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function residentOf(sb: any, docId: string): Promise<string> {
  const { data: doc } = await sb.from("agreement_documents").select("agreement_id, doc_type").eq("id", docId).maybeSingle();
  if (!doc || doc.doc_type !== "sched_c") throw new Error("This is not a Schedule C.");
  const { data: ag } = await sb.from("tenancy_agreements").select("resident_id").eq("id", doc.agreement_id).maybeSingle();
  if (!ag) throw new Error("Agreement not found.");
  return String(ag.resident_id);
}

/** Both checks, as they stand, with the resident's signature to look at. */
export const getInventoryReview = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ docId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = await residentOf(sb, data.docId);
    const { getFile, readInventory } = await import("@/lib/inventory.server");
    const out: Record<"in" | "out", null | { file: any; signature: string }> = { in: null, out: null };
    for (const mode of ["in", "out"] as const) {
      const file = await readInventory(sb, residentId, data.docId, mode);
      if (!file) continue;
      const sig = file.submitted ? await getFile(sb, file.submitted.signaturePath) : null;
      out[mode] = { file, signature: sig ? `data:image/png;base64,${toBase64(sig)}` : "" };
    }
    return out;
  });

/** Confirm a check the resident sent in, and sign it for Brachtia. */
export const confirmInventory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ docId: z.string().uuid(), mode: z.enum(["in", "out"]) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = await residentOf(sb, data.docId);
    const { buildInventoryPdf, inventoryBase, putFile, readInventory, sha256, writeInventory } = await import("@/lib/inventory.server");
    const file = await readInventory(sb, residentId, data.docId, data.mode);
    if (!file || file.status !== "submitted") throw new Error("There is nothing waiting to be confirmed.");
    const { loadSignatory } = await import("@/lib/signatory.server");
    if (!(await loadSignatory(sb))?.token) throw new Error("Save the signatory's signature in Settings → Signatory first.");
    const { bytes, signatory, at } = await buildInventoryPdf(sb, residentId, data.docId, file);
    const pdfPath = `${inventoryBase(residentId, data.docId, data.mode)}.pdf`;
    await putFile(sb, pdfPath, bytes, "application/pdf");
    await writeInventory(sb, residentId, data.docId, {
      ...file,
      status: "signed",
      signed: { at, by: signatory, pdfPath, pdfSha256: await sha256(bytes) },
    });
    // the move-in check is Schedule C itself; the move-out one sits beside it
    if (data.mode === "in") {
      const { error } = await sb.from("agreement_documents").update({ status: "signed", generated_pdf_path: pdfPath }).eq("id", data.docId);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Put the move-out check on the resident's signing link. */
export const openMoveOutCheck = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ docId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = await residentOf(sb, data.docId);
    const { readInventory, writeInventory } = await import("@/lib/inventory.server");
    if ((await readInventory(sb, residentId, data.docId, "in"))?.status !== "signed") {
      throw new Error("The move-in check has to be signed first - the move-out one is checked against it.");
    }
    if (await readInventory(sb, residentId, data.docId, "out")) throw new Error("The move-out check is already open.");
    await writeInventory(sb, residentId, data.docId, { mode: "out", status: "open", openedAt: new Date().toISOString() });
    return { ok: true as const };
  });

/** A signed check's PDF, for the preview window. */
export const inventoryPdfUrl = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ docId: z.string().uuid(), mode: z.enum(["in", "out"]) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = await residentOf(sb, data.docId);
    const { getFile, readInventory } = await import("@/lib/inventory.server");
    const f = await readInventory(sb, residentId, data.docId, data.mode);
    const bytes = f?.signed ? await getFile(sb, f.signed.pdfPath) : null;
    if (!bytes) throw new Error("Not signed yet.");
    return { base64: toBase64(bytes) };
  });
