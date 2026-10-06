/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DefectDecision, InventoryMode, InventoryRecord } from "@/lib/inventory";

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
  /*
   * open:      the resident is filling it in
   * review:    sent in, unsigned - Brachtia answers each defect
   * returned:  answered and back with the resident - they send it back again, or sign
   * submitted: signed by the resident - Brachtia confirms and signs
   * signed:    done, the PDF is made
   */
  status: "open" | "review" | "returned" | "submitted" | "signed";
  openedAt?: string;
  record?: InventoryRecord;
  /** Brachtia's answer to each defect, by item */
  decisions?: Record<string, DefectDecision>;
  /** when it was last sent in for review - Brachtia answers within 48 hours */
  reviewAt?: string;
  returnedAt?: string;
  /** the defects whose answers the resident agreed to, before signing */
  residentAgreed?: { at: string; keys: string[] };
  /** each send and answer, in order - who did what, when */
  history?: { at: string; step: "sent for review" | "answered" | "signed by resident" | "signed by Brachtia" }[];
  submitted?: {
    at: string;
    typedName: string;
    ip: string;
    userAgent: string;
    profileLinkId: string;
    signaturePath: string;
    signatureSha256: string;
    /** the PDF they read and signed, with their signature on it */
    pdfPath?: string;
    pdfSha256?: string;
  };
  signed?: { at: string; by: string; pdfPath: string; pdfSha256: string };
};

export const inventoryBase = (residentId: string, docId: string, mode: InventoryMode) => `inventory/${residentId}/${docId}-${mode}`;
/** a defect's photos: inventory/<resident>/<document>-in-photos/<item>-<random>.jpg */
export const photoFolder = (residentId: string, docId: string, mode: InventoryMode) => `${inventoryBase(residentId, docId, mode)}-photos`;

/** Short-lived links to show photos - the bucket is private. */
export async function photoUrls(sb: any, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const x of (data ?? []) as { path: string | null; signedUrl: string }[]) if (x.path && x.signedUrl) out[x.path] = x.signedUrl;
  return out;
}

/** Remove a check's photos - on Reset. */
export async function removePhotos(sb: any, residentId: string, docId: string) {
  for (const m of ["in", "out"] as const) {
    const folder = photoFolder(residentId, docId, m);
    const { data } = await sb.storage.from(BUCKET).list(folder, { limit: 1000 });
    const names = ((data ?? []) as { name: string }[]).map((f) => `${folder}/${f.name}`);
    if (names.length) await sb.storage.from(BUCKET).remove(names);
  }
}

export async function readInventory(sb: any, residentId: string, docId: string, mode: InventoryMode): Promise<InventoryFile | null> {
  const { data } = await sb.storage.from(BUCKET).download(`${inventoryBase(residentId, docId, mode)}.json`, { cacheNonce: Date.now() });
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
    .upload(
      `${inventoryBase(residentId, docId, file.mode)}.json`,
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
      {
        upsert: true,
        contentType: "application/json",
      },
    );
  if (error) throw new Error(`Could not save the inventory: ${error.message}`);
}

export async function putFile(sb: any, path: string, body: Uint8Array, type: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([body as any], { type }), { upsert: true, contentType: type });
  if (error) throw new Error(`Could not save ${path.split("/").pop()}: ${error.message}`);
}

export async function getFile(sb: any, path: string): Promise<Uint8Array | null> {
  const { data } = await sb.storage.from(BUCKET).download(path, { cacheNonce: Date.now() });
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
export async function buildInventoryPdf(
  sb: any,
  residentId: string,
  docId: string,
  file: InventoryFile,
  /*
   * Which signatures go on it (Dani, 2 Oct 2026): none, for the resident to
   * read before signing; theirs, the moment they sign; and Brachtia's too, when
   * admin approves. A signature is only ever drawn onto the page that person
   * read and signed - never kept aside and put on another one later.
   */
  sign: { resident?: { png: Uint8Array; at: string; typedName: string } | null; brachtia: boolean } = { brachtia: false },
) {
  if (!file.record) throw new Error("Nothing has been sent in yet.");
  const { data: res } = await sb.from("residents").select("full_name").eq("id", residentId).maybeSingle();
  const { data: row } = await sb.from("agreement_documents").select("agreement_id").eq("id", docId).maybeSingle();
  const { data: ag } = row ? await sb.from("tenancy_agreements").select("agreement_no, created_at").eq("id", row.agreement_id).maybeSingle() : { data: null };
  const { data: bed } = await sb.from("beds").select("label, room_id").eq("resident_id", residentId).limit(1).maybeSingle();
  const { data: rm } = bed ? await sb.from("rooms").select("letter, unit_id").eq("id", bed.room_id).maybeSingle() : { data: null };
  const { data: un } = rm ? await sb.from("units").select("unit_no, residence_id").eq("id", rm.unit_id).maybeSingle() : { data: null };
  const { data: rs } = un ? await sb.from("residences").select("name").eq("id", un.residence_id).maybeSingle() : { data: null };

  const { loadSignatory, loadSignatureImage } = await import("@/lib/signatory.server");
  const signatory = sign.brachtia ? await loadSignatory(sb) : null;
  const now = new Date();
  const effective = file.reviewAt ?? file.submitted?.at ?? now.toISOString();
  const { inventoryPdf } = await import("@/lib/inventory-pdf");
  const bytes = await inventoryPdf({
    mode: file.mode,
    record: file.record,
    ...(file.decisions ? { decisions: file.decisions } : {}),
    residentAgreed: !!sign.resident,
    photoCount: Object.fromEntries((await import("@/lib/inventory")).inventoryDefects(file.record).map((d) => [d.key, d.photos.length])),
    header: {
      agreementNo: ag?.agreement_no ?? "",
      agreementDate: ag?.created_at ? dmy(ag.created_at) : "",
      effectiveDate: dmy(effective),
      residence: String(rs?.name ?? ""),
      unitNo: String(un?.unit_no ?? ""),
      room: rm?.letter ? `Room ${rm.letter}` : "",
      bed: String(bed?.label ?? ""),
    },
    resident: {
      name: String(res?.full_name ?? sign.resident?.typedName ?? ""),
      date: sign.resident ? dmy(sign.resident.at) : "",
      signature: sign.resident?.png ?? null,
    },
    brachtia: {
      name: signatory?.name ?? "",
      date: sign.brachtia ? dmy(now) : "",
      signature: signatory?.token ? await loadSignatureImage(sb, signatory.token) : null,
    },
  });
  return { bytes, signatory: signatory?.name ?? "", at: now.toISOString() };
}
