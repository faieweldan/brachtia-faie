/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InventoryMode, InventoryRecord } from "@/lib/inventory";

/*
 * Schedule C, kept as files beside the signed documents (1 Oct 2026):
 *   inventory/<resident>/<document>-in.json   the move-in check
 *   inventory/<resident>/<document>-out.json  the move-out check, once opened
 * Each holds the answers, who submitted them and when, and - once Brachtia
 * has reviewed it - the signed PDF's path and fingerprint. Kept as files so
 * nothing has to be run on either database first.
 */
const BUCKET = "resident-documents";

export type InventoryFile = {
  mode: InventoryMode;
  /** open: waiting for the resident; submitted: waiting for Brachtia; signed: done */
  status: "open" | "submitted" | "signed";
  openedAt?: string;
  record?: InventoryRecord;
  submitted?: {
    at: string;
    typedName: string;
    ip: string;
    userAgent: string;
    profileLinkId: string;
    signaturePath: string;
    signatureSha256: string;
  };
  signed?: { at: string; by: string; pdfPath: string; pdfSha256: string };
};

export const inventoryBase = (residentId: string, docId: string, mode: InventoryMode) => `inventory/${residentId}/${docId}-${mode}`;

export async function readInventory(sb: any, residentId: string, docId: string, mode: InventoryMode): Promise<InventoryFile | null> {
  const { data } = await sb.storage.from(BUCKET).download(`${inventoryBase(residentId, docId, mode)}.json`);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as InventoryFile;
  } catch {
    return null;
  }
}

export async function writeInventory(sb: any, residentId: string, docId: string, file: InventoryFile) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${inventoryBase(residentId, docId, file.mode)}.json`, new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (error) throw new Error(`Could not save the inventory: ${error.message}`);
}

export async function putFile(sb: any, path: string, body: Uint8Array, type: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([body as any], { type }), { upsert: true, contentType: type });
  if (error) throw new Error(`Could not save ${path.split("/").pop()}: ${error.message}`);
}

export async function getFile(sb: any, path: string): Promise<Uint8Array | null> {
  const { data } = await sb.storage.from(BUCKET).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

export const sha256 = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, "0")).join("");

const dmy = (v: string | Date) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
};

/**
 * The signed Schedule C: the answers, the resident's signature from when they
 * submitted, and Brachtia's signatory signing now, on review. The room is
 * read from the resident's bed as it is today - a value saved when the pack
 * was made can be stale, or from a wrong mapping.
 */
export async function buildInventoryPdf(sb: any, residentId: string, docId: string, file: InventoryFile) {
  if (!file.record || !file.submitted) throw new Error("Nothing has been submitted yet.");
  const { data: res } = await sb.from("residents").select("full_name").eq("id", residentId).maybeSingle();
  const { data: row } = await sb.from("agreement_documents").select("agreement_id").eq("id", docId).maybeSingle();
  const { data: ag } = row ? await sb.from("tenancy_agreements").select("agreement_no, created_at").eq("id", row.agreement_id).maybeSingle() : { data: null };
  const { data: bed } = await sb.from("beds").select("label, room_id").eq("resident_id", residentId).limit(1).maybeSingle();
  const { data: rm } = bed ? await sb.from("rooms").select("letter, unit_id").eq("id", bed.room_id).maybeSingle() : { data: null };
  const { data: un } = rm ? await sb.from("units").select("unit_no, residence_id").eq("id", rm.unit_id).maybeSingle() : { data: null };
  const { data: rs } = un ? await sb.from("residences").select("name").eq("id", un.residence_id).maybeSingle() : { data: null };

  const { loadSignatory, loadSignatureImage } = await import("@/lib/signatory.server");
  const signatory = await loadSignatory(sb);
  const residentSig = await getFile(sb, file.submitted.signaturePath);
  if (!residentSig) throw new Error("The resident's signature could not be found.");
  const now = new Date();
  const { inventoryPdf } = await import("@/lib/inventory-pdf");
  const bytes = await inventoryPdf({
    mode: file.mode,
    record: file.record,
    header: {
      agreementNo: ag?.agreement_no ?? "",
      agreementDate: ag?.created_at ? dmy(ag.created_at) : "",
      effectiveDate: dmy(file.submitted.at),
      residence: String(rs?.name ?? ""),
      unitNo: String(un?.unit_no ?? ""),
      room: rm?.letter ? `Room ${rm.letter}` : "",
      bed: String(bed?.label ?? ""),
    },
    resident: { name: String(res?.full_name ?? file.submitted.typedName), date: dmy(file.submitted.at), signature: residentSig },
    brachtia: {
      name: signatory?.name ?? "",
      date: dmy(now),
      signature: signatory?.token ? await loadSignatureImage(sb, signatory.token) : null,
    },
  });
  return { bytes, signatory: signatory?.name ?? "", at: now.toISOString() };
}
