import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The access card form (Dani, 2 Oct 2026). Brachtia fills it and hands it to
 * the building's management (ARC); the resident does not sign it.
 *
 *   made in the draft - ticks set, IC copy and photo attached - Pending Approval
 *   ARC's receipt uploaded and the card's serial number typed in   - Active
 *
 * A replacement - a lost or damaged card (Dani, 2 Oct 2026):
 *   1. admin picks Lost or Damaged - the card in use is ended (Lost/Damaged)
 *      at once, so the building can block it
 *   2. the additional-charge invoice opens, filled at Schedule B's price
 *      (damaged RM30, lost RM60) - admin checks it and generates it
 *   3. once that invoice is paid in full, the new form is made, Pending
 *      Approval, with the old form's attachments - the payment is the trigger
 * The request waits beside the forms until then: access-card/_request-<resident>.json
 * A unit change gets its form from Update Tenancy, not from here.
 *
 * What each form says and what is attached to it is kept beside it, so nothing
 * has to be run on either database:
 *   access-card/<form>.json         values and attachments
 *   access-card/<form>-receipt.<x>  ARC's receipt
 */
const BUCKET = "resident-documents";

export type CardExtras = {
  /** the form's own values - a replacement's; the pack's form uses the pack's */
  values?: Record<string, string>;
  /** the resident's files merged after the form: IC copy, photo */
  attachments: string[];
  receiptPath?: string;
};

/**
 * What the resident pays for a replacement - Brachtia's own price, Schedule B
 * clause 11 (Dani, 2 Oct 2026), not ARC's fee on its form.
 */
export const REPLACEMENT_FEE: Record<string, { amount: number; label: string }> = {
  "Damaged Card": { amount: 30, label: "Residence access card (damaged)" },
  "Lost Card": { amount: 60, label: "Residence access card (lost)" },
  "Unit Change": { amount: 20, label: "Additional access card following room/unit change" },
};

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const extrasPath = (cardId: string) => `access-card/${cardId}.json`;

/** what a replacement can be asked for from the Access Card panel */
export const REPLACEMENT_REASONS = ["Lost Card", "Damaged Card"] as const;

/** the statuses of a card no longer in use - nothing to end again */
const ENDED = ["lost", "damaged", "returned"];

export type ReplacementRequest = {
  reason: string;
  at: string;
  /** the cards ended when it was asked for */
  ended: string[];
  /** the invoice raised for it, once generated */
  invoiceId?: string;
  invoiceNumber?: string;
};

const requestPath = (residentId: string) => `access-card/_request-${residentId}.json`;

export async function readReplacement(sb: any, residentId: string): Promise<ReplacementRequest | null> {
  const { data } = await sb.storage.from(BUCKET).download(requestPath(residentId));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as ReplacementRequest;
  } catch {
    return null;
  }
}

async function writeReplacement(sb: any, residentId: string, r: ReplacementRequest | null) {
  if (!r) {
    await sb.storage.from(BUCKET).remove([requestPath(residentId)]);
    return;
  }
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(requestPath(residentId), new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Could not save the replacement: ${error.message}`);
}

export async function readCardExtras(sb: any, cardId: string): Promise<CardExtras | null> {
  const { data } = await sb.storage.from(BUCKET).download(extrasPath(cardId));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as CardExtras;
  } catch {
    return null;
  }
}

export async function writeCardExtras(sb: any, cardId: string, extras: CardExtras) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(extrasPath(cardId), new Blob([JSON.stringify(extras, null, 2)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Could not save the access card form: ${error.message}`);
}

/** Only the resident's own files can be attached. */
export const ownFiles = (residentId: string, paths: string[]) => paths.filter((p) => p.startsWith(`${residentId}/`) && !p.includes(".."));

/**
 * The form's PDF with the chosen files after it: a PDF goes in whole, a photo
 * gets a page of its own.
 */
export async function withAttachments(sb: any, form: Uint8Array, attachments: string[]): Promise<Uint8Array> {
  if (!attachments.length) return form;
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.load(form);
  for (const path of attachments) {
    const { data } = await sb.storage.from(BUCKET).download(path);
    if (!data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    try {
      if (bytes[0] === 0x25 && bytes[1] === 0x50) {
        const src = await PDFDocument.load(bytes);
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        continue;
      }
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      if (!jpg && !png) continue; // a format the PDF cannot hold (HEIC) is left out
      const img = jpg ? await out.embedJpg(bytes) : await out.embedPng(bytes);
      const page = out.addPage([595.28, 841.89]);
      const k = Math.min((595.28 - 72) / img.width, (841.89 - 72) / img.height);
      page.drawImage(img, { x: (595.28 - img.width * k) / 2, y: (841.89 - img.height * k) / 2, width: img.width * k, height: img.height * k });
    } catch {
      /* one unreadable file must not cost the form */
    }
  }
  return out.save();
}

/**
 * Step 1: Lost or Damaged picked. The card in use is ended now, and the
 * request waits for its invoice. Returns the invoice line to fill in.
 */
export const startReplacementCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid(), reason: z.enum(REPLACEMENT_REASONS) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const waiting = await readReplacement(sb, data.residentId);
    if (waiting?.invoiceId) throw new Error(`A replacement is already waiting for payment of ${waiting.invoiceNumber || "its invoice"}.`);
    const { data: cards, error } = await sb.from("access_card_forms").select("id, status").eq("resident_id", data.residentId);
    if (error) throw new Error(error.message);
    const live = ((cards ?? []) as { id: string; status: string }[]).filter((c) => !ENDED.includes(c.status)).map((c) => c.id);
    if (live.length) {
      const { error: uErr } = await sb
        .from("access_card_forms")
        .update({ status: data.reason === "Lost Card" ? "lost" : "damaged" })
        .in("id", live);
      if (uErr) throw new Error(uErr.message);
    }
    await writeReplacement(sb, data.residentId, {
      reason: data.reason,
      at: new Date().toISOString(),
      ended: [...new Set([...(waiting?.ended ?? []), ...live])],
    });
    const fee = REPLACEMENT_FEE[data.reason]!;
    return { label: fee.label, amount: fee.amount };
  });

/** Step 1 undone before an invoice is raised - the ended card stays ended. */
export const cancelReplacementCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const r = await readReplacement(sb, data.residentId);
    if (r?.invoiceId) throw new Error(`The invoice ${r.invoiceNumber || ""} is raised - cancel the invoice first.`.replace("  ", " "));
    await writeReplacement(sb, data.residentId, null);
    return { ok: true as const };
  });

export const getReplacementCard = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    return { request: await readReplacement(sb, data.residentId) };
  });

/** Step 2: the invoice generated from the access card - it is the one to wait for. */
export async function linkReplacementInvoice(sb: any, residentId: string, invoiceId: string, invoiceNumber: string) {
  const r = await readReplacement(sb, residentId);
  if (!r) return;
  await writeReplacement(sb, residentId, { ...r, invoiceId, invoiceNumber });
}

/**
 * Step 3, from Record payment: the replacement's invoice is paid in full, so
 * the new form is made - Pending Approval, with the attachments of the form it
 * replaces. Any other invoice is left alone.
 */
export async function replacementAfterPayment(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("resident_id").eq("id", invoiceId).maybeSingle();
  const residentId = String(inv?.resident_id ?? "");
  if (!residentId) return;
  const r = await readReplacement(sb, residentId);
  if (!r || r.invoiceId !== invoiceId) return;
  await makeCardForm(sb, residentId, r.reason, r.ended);
  await writeReplacement(sb, residentId, null);
}

/**
 * A new form, Pending Approval, with the attachments of the form it replaces.
 * From a replacement (its ended cards given), or a unit change from Update
 * Tenancy - there the card in use is handed back, so it is ended as Returned.
 */
export async function makeCardForm(sb: any, residentId: string, reason: string, ended?: string[]) {
  const { data: cards } = await sb.from("access_card_forms").select("id, status").eq("resident_id", residentId).order("created_at");
  const all = (cards ?? []) as { id: string; status: string }[];
  let before = ended ?? [];
  if (!ended) {
    before = all.filter((c) => !ENDED.includes(c.status)).map((c) => c.id);
    if (before.length) await sb.from("access_card_forms").update({ status: "returned" }).in("id", before);
  }
  const { templateVersionsFor } = await import("@/lib/tenancy-docs.functions");
  const tv = await templateVersionsFor(sb, residentId);
  const { data: card, error } = await sb
    .from("access_card_forms")
    .insert({ resident_id: residentId, reason, status: "pending_approval", template_version_id: tv["access_card"] || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // the IC copy and photo go with the new form, as on the one it replaces
  let attachments: string[] = [];
  for (const id of before.length ? before : all.map((c) => c.id)) {
    const extras = await readCardExtras(sb, id);
    if (extras?.attachments.length) attachments = extras.attachments;
  }
  await writeCardExtras(sb, card.id, { attachments: ownFiles(residentId, attachments) });
}

/**
 * A form made in the draft on its own (?card=<reason>) - its values and ticks as
 * admin left them, and its attachments. No invoice: a lost or damaged card's
 * is raised before its form (above); a unit change's comes with Update Tenancy.
 */
export const createCardFromDraft = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        residentId: z.string().uuid(),
        reason: z.string().min(1).max(40),
        values: z.record(z.string().max(80), z.string().max(2000)),
        attachments: z.array(z.string().max(300)).max(6),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { templateVersionsFor } = await import("@/lib/tenancy-docs.functions");
    const tv = await templateVersionsFor(sb, data.residentId);
    const { data: card, error } = await sb
      .from("access_card_forms")
      .insert({ resident_id: data.residentId, reason: data.reason, status: "pending_approval", template_version_id: tv["access_card"] || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeCardExtras(sb, card.id, { values: data.values, attachments: ownFiles(data.residentId, data.attachments) });
    return { ok: true as const };
  });

/** ARC's receipt and the card's serial number: the card is Active. */
export const activateAccessCard = createServerFn({ method: "POST" })
  .inputValidator((d: FormData) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const cardId = String(data.get("cardId") ?? "");
    const serial = String(data.get("serial") ?? "").trim();
    const file = data.get("file");
    if (!/^[0-9a-f-]{36}$/.test(cardId)) throw new Error("No access card form");
    if (!serial) throw new Error("Type the card's serial number");
    if (!(file instanceof File) || !file.size) throw new Error("Upload ARC's receipt");
    if (file.size > 8 * 1024 * 1024) throw new Error("The receipt is larger than 8MB");
    const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toLowerCase() ?? "pdf";
    const path = `access-card/${cardId}-receipt.${ext}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(await file.arrayBuffer()), { upsert: true, contentType: file.type || "application/octet-stream" });
    if (upErr) throw new Error(upErr.message);
    const extras = (await readCardExtras(sb, cardId)) ?? { attachments: [] };
    await writeCardExtras(sb, cardId, { ...extras, receiptPath: path });
    const { error } = await sb.from("access_card_forms").update({ card_no: serial, status: "active" }).eq("id", cardId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const accessCardReceiptUrl = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const extras = await readCardExtras(sb, data.cardId);
    if (!extras?.receiptPath) throw new Error("No receipt uploaded");
    const { data: url } = await sb.storage.from(BUCKET).createSignedUrl(extras.receiptPath, 600);
    return { url: String(url?.signedUrl ?? "") };
  });
