/**
 * Writing values onto a PDF form without touching the form (30 Sep 2026).
 *
 * A scanned form is a picture of a page - there is no text in it to find or
 * replace. So nothing about the page is read or rebuilt: admin draws a box
 * where each value goes, and the value is written on top of the page inside
 * that box, the way a person would write on the line. A tick box gets a drawn
 * tick; a signature box is left for a pen.
 *
 * Boxes are kept as fractions of the page (0 to 1) from its top-left corner,
 * so a box drawn on a small preview lands in the same place on the real page.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type BoxKind = "text" | "tick" | "signature";

export type PdfBox = {
  id: string;
  /** the name the mapping panel maps, like a Word placeholder: "Name", "Tick_IC_copy" */
  key: string;
  kind: BoxKind;
  /** 0-based page number */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * A typed document rather than a form filled by hand (8 Oct 2026): the
   * agreement's own text size and black, so a value reads as part of the
   * page. Without it, the pen look of a scanned form.
   */
  size?: number;
  typed?: boolean;
  /** a value on a centred line - the cover page's name - is centred in its place */
  align?: "center";
};

/** A value that means "tick it". */
export const ticked = (v: string | null | undefined) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s !== "" && s !== "no" && s !== "false" && s !== "0";
};

/**
 * The form with values written into its boxes. A box with no value is left
 * empty; with `outline`, every box is drawn with its name, for the template
 * page, so admin can see where each one sits.
 */
export async function fillPdf(
  bytes: Uint8Array,
  boxes: PdfBox[],
  values: Record<string, string | null>,
  opts: { outline?: boolean; images?: Record<string, Uint8Array> } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const typedFont = boxes.some((b) => b.typed) ? await pdf.embedFont(StandardFonts.Helvetica) : font;
  const pages = pdf.getPages();
  const ink = rgb(0.05, 0.1, 0.35); // dark blue, like a pen

  for (const box of boxes) {
    const page = pages[box.page];
    if (!page) continue;
    const { width, height } = page.getSize();
    // pdf-lib measures from the bottom-left; boxes are kept from the top-left
    const left = box.x * width;
    const bottom = height - (box.y + box.h) * height;
    const bw = box.w * width;
    const bh = box.h * height;

    if (opts.outline) {
      page.drawRectangle({ x: left, y: bottom, width: bw, height: bh, borderColor: rgb(0.1, 0.45, 0.3), borderWidth: 0.8, opacity: 0, borderOpacity: 0.9 });
      page.drawText(box.key, { x: left + 2, y: bottom + bh + 1.5, size: 5.5, font, color: rgb(0.1, 0.45, 0.3) });
    }

    const value = values[box.key];
    if (box.kind === "signature") {
      // the signatory's saved signature, fitted inside the box; otherwise left for a pen
      const png = value ? opts.images?.[value.trim()] : undefined;
      if (!png) continue;
      const img = await pdf.embedPng(png);
      const k = Math.min(bw / img.width, bh / img.height);
      const w = img.width * k;
      const h = img.height * k;
      page.drawImage(img, { x: left + (bw - w) / 2, y: bottom + (bh - h) / 2, width: w, height: h });
      continue;
    }
    if (box.kind === "tick") {
      if (!ticked(value)) continue;
      // a drawn tick, sized to the box
      const s = Math.min(bw, bh) * 0.8;
      const cx = left + bw / 2;
      const cy = bottom + bh / 2;
      const t = Math.max(1, s / 8);
      page.drawLine({ start: { x: cx - s * 0.4, y: cy }, end: { x: cx - s * 0.1, y: cy - s * 0.35 }, thickness: t, color: ink });
      page.drawLine({ start: { x: cx - s * 0.1, y: cy - s * 0.35 }, end: { x: cx + s * 0.45, y: cy + s * 0.4 }, thickness: t, color: ink });
      continue;
    }

    const text = String(value ?? "").trim();
    if (!text) continue;
    if (box.typed) {
      // the document's own size, shrunk only when the value is wider than its place
      let size = box.size ?? 10;
      while (size > 5 && typedFont.widthOfTextAtSize(text, size) > bw) size -= 0.25;
      const tw = typedFont.widthOfTextAtSize(text, size);
      page.drawText(text, { x: box.align === "center" ? left + (bw - tw) / 2 : left, y: bottom + bh * 0.22, size, font: typedFont, color: rgb(0, 0, 0) });
      continue;
    }
    // as large as the box allows, 7-11pt, shrunk to fit its width
    let size = Math.max(7, Math.min(11, bh * 0.7));
    while (size > 6 && font.widthOfTextAtSize(text, size) > bw - 2) size -= 0.5;
    // sits just above the bottom of the box - on the line
    page.drawText(text, { x: left + 1, y: bottom + Math.max(1.5, bh * 0.2), size, font, color: ink, maxWidth: bw - 1 });
  }
  return pdf.save();
}
