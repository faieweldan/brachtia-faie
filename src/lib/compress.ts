/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Students photograph passports and offer letters on their phones, which
 * produces 4-8MB files where 300KB is plenty to read. Compressing here saves
 * their data, the upload wait, storage, and every later page load.
 *
 * PDFs and anything that is not an image are passed through untouched - there is
 * nothing safe to do to them client-side.
 */

const MAX_EDGE = 2000; // long edge in pixels: still sharp enough to read an IC
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // already small enough to leave alone
  if (file.size <= 400 * 1024) return file;
  // animated or vector images do not survive a canvas round-trip
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file; // no gain, keep the original

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // any failure means upload what the student actually chose
    return file;
  }
}

export const readableSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
