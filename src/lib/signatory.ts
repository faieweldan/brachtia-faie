/**
 * The company's signatory - who signs every agreement for Brachtia, and their
 * signature (30 Sep 2026).
 *
 * A signature travels through the mapping as a short token, not a picture:
 * "@signature:3f9a1c0d2b7e4a51". The token names one saved image that is never
 * changed or deleted, so a document generated today still shows today's
 * signature after a new one is saved in Settings.
 */
export const SIGNATURE_PREFIX = "@signature:";

export const isSignatureToken = (v: string | null | undefined) =>
  typeof v === "string" && /^@signature:[a-f0-9]{16}$/.test(v.trim());

export const signaturePath = (token: string) => `signatory/${token.trim().slice(SIGNATURE_PREFIX.length)}.png`;

/** A PNG's size in pixels, read from its header. */
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

export type Signatory = { name: string; title: string; token: string };

/** A value as a person reads it: a signature token is named, not printed. */
export const readableValue = (v: string | null | undefined) => (isSignatureToken(v) ? "✍ Signatory's signature" : (v ?? ""));
