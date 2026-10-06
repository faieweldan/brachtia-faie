/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSignatureToken, signaturePath, type Signatory } from "@/lib/signatory";

/*
 * Kept in the private template bucket, not a table, so nothing has to be run
 * on either database first: signatory/current.json names the signatory and
 * their current signature; signatory/<hash>.png is each signature ever saved,
 * never overwritten (30 Sep 2026).
 */
const BUCKET = "document-templates";
const CURRENT = "signatory/current.json";

export async function loadSignatory(db: any): Promise<Signatory | null> {
  const { data: file } = await db.storage.from(BUCKET).download(CURRENT, { cacheNonce: Date.now() });
  if (!file) return null;
  try {
    const j = JSON.parse(await file.text());
    return { name: String(j.name ?? ""), title: String(j.title ?? ""), token: String(j.token ?? "") };
  } catch {
    return null;
  }
}

export async function saveSignatoryFile(db: any, s: Signatory) {
  const body = new Blob([JSON.stringify({ ...s, savedAt: new Date().toISOString() })], { type: "application/json" });
  const { error } = await db.storage.from(BUCKET).upload(CURRENT, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Could not save the signatory: ${error.message}`);
}

export async function saveSignatureImage(db: any, png: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", png as Uint8Array<ArrayBuffer>));
  const token = `@signature:${[...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const { error } = await db.storage.from(BUCKET).upload(signaturePath(token), new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), { upsert: true, contentType: "image/png" });
  if (error) throw new Error(`Could not save the signature: ${error.message}`);
  return token;
}

export async function loadSignatureImage(db: any, token: string): Promise<Uint8Array | null> {
  if (!isSignatureToken(token)) return null;
  const { data } = await db.storage.from(BUCKET).download(signaturePath(token));
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/**
 * The pictures a set of values needs. A token whose picture cannot be found
 * is blanked, so it is never printed on an agreement as text.
 */
export async function signatureImages(db: any, values: Record<string, string | null>) {
  const images: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!isSignatureToken(v)) continue;
    const t = v!.trim();
    const png = images[t] ?? (await loadSignatureImage(db, t));
    if (png) images[t] = png;
    else values[k] = "";
  }
  return images;
}
