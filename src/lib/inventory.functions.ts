import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Brachtia's side of Schedule C (Dani, 1 Oct 2026). Two turns:
 *   1. the resident sends the check in, unsigned: answer each defect -
 *      Resolved or Accepted - and send it back to them
 *   2. once they agree and sign: confirm and sign - only then is the PDF made
 *      and the check Signed
 * Once the move-in is signed, the move-out check can be opened on the same
 * signing link.
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

type InventoryFileT = import("@/lib/inventory.server").InventoryFile;

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
    const out: Record<"in" | "out", null | { file: InventoryFileT; signature: string }> = { in: null, out: null };
    for (const mode of ["in", "out"] as const) {
      const file = await readInventory(sb, residentId, data.docId, mode);
      if (!file) continue;
      const sig = file.submitted ? await getFile(sb, file.submitted.signaturePath) : null;
      out[mode] = { file, signature: sig ? `data:image/png;base64,${toBase64(sig)}` : "" };
    }
    // the defects' photos, to look at
    const { recordPhotos } = await import("@/lib/inventory");
    const { photoUrls } = await import("@/lib/inventory.server");
    const paths = [out.in, out.out].flatMap((e) => (e?.file.record ? recordPhotos(e.file.record) : []));
    // who to send the link back to, once the check is answered
    const { data: res } = await sb.from("residents").select("full_name, mobile").eq("id", residentId).maybeSingle();
    return {
      ...out,
      photos: await photoUrls(sb, paths),
      resident: { id: residentId, name: String(res?.full_name ?? ""), mobile: String(res?.mobile ?? "") },
    };
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
    // the resident's signature as they drew it on the copy they read, and Brachtia's now
    const png = file.submitted ? await (await import("@/lib/inventory.server")).getFile(sb, file.submitted.signaturePath) : null;
    if (!file.submitted || !png) throw new Error("The resident's signature could not be found.");
    const { bytes, signatory, at } = await buildInventoryPdf(sb, residentId, data.docId, file, {
      resident: { png, at: file.submitted.at, typedName: file.submitted.typedName },
      brachtia: true,
    });
    const pdfPath = `${inventoryBase(residentId, data.docId, data.mode)}.pdf`;
    await putFile(sb, pdfPath, bytes, "application/pdf");
    await writeInventory(sb, residentId, data.docId, {
      ...file,
      status: "signed",
      history: [...(file.history ?? []), { at, step: "signed by Brachtia" }],
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

/**
 * Answer every defect - Resolved or Accepted - and send the check back to the
 * resident to read. With no defects, it goes back as it came (Dani, 1 Oct
 * 2026): the resident still waits for Brachtia before signing.
 */
export const returnInventory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        docId: z.string().uuid(),
        mode: z.enum(["in", "out"]),
        verdicts: z.record(z.string().max(60), z.enum(["resolved", "accepted"])),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = await residentOf(sb, data.docId);
    const { readInventory, writeInventory } = await import("@/lib/inventory.server");
    const { inventoryAnswerables } = await import("@/lib/inventory");
    const file = await readInventory(sb, residentId, data.docId, data.mode);
    // "returned": already with the resident, answers changed before they sign (Dani, 2 Oct 2026)
    if ((file?.status !== "review" && file?.status !== "returned") || !file.record)
      throw new Error("Only a check waiting for review, or not signed yet, can be answered.");
    const at = new Date().toISOString();
    const decisions: NonNullable<typeof file.decisions> = {};
    for (const d of inventoryAnswerables(file.record)) {
      const verdict = data.verdicts[d.key];
      if (!verdict) throw new Error(`Answer every item first - ${d.name} has no answer.`);
      // an answer already given to the same defect keeps its time
      const was = file.decisions?.[d.key];
      decisions[d.key] = was && was.verdict === verdict && was.remark === d.remark ? was : { verdict, remark: d.remark, at };
    }
    await writeInventory(sb, residentId, data.docId, {
      ...file,
      status: "returned",
      decisions,
      returnedAt: at,
      history: [...(file.history ?? []), { at, step: "answered" }],
    });
    if (data.mode === "in") {
      const { error } = await sb.from("agreement_documents").update({ status: "pending_signature" }).eq("id", data.docId);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });
