import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { company } from "@/data/properties";

/*
 * The credit note's look, in one place (Dani, 14 Oct 2026).
 *
 * The checkout statement was the only credit note, and its design lived inside
 * statementPdf. A room change to a cheaper room needs a credit note too, and a
 * second copy of the design would drift the first time either was restyled. So
 * the frame - green band, peach panel of facts, sections of rows, the result on
 * its own band, the footer on every page - is drawn here, and both the checkout
 * statement (checkout.server.ts) and the room-change credit note use it.
 *
 * pdf-lib only, nothing from the server, so the review box can build the draft
 * in the browser from the figures it was handed.
 */

export const A4 = { w: 595.28, h: 841.89 };
export const M = 40;
// the invoice's colours (invoice-pdf.ts)
export const GREEN = rgb(26 / 255, 71 / 255, 52 / 255);
export const PEACH = rgb(250 / 255, 240 / 255, 231 / 255);
export const INK = rgb(0.12, 0.12, 0.12);
export const MUTED = rgb(110 / 255, 110 / 255, 105 / 255);
export const RULE = rgb(230 / 255, 226 / 255, 220 / 255);
export const RED = rgb(0.68, 0.18, 0.12);
const FOOT = 40;

export const safe = (s: string) =>
  String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•·]/g, "?");
export const rm = (n: number) => `RM ${Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const day = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
};

export type FrameHeader = {
  /** "CREDIT NOTE", top right */
  kind: string;
  /** under it: "CHECKOUT STATEMENT · END OF TENANCY", "ROOM CHANGE" */
  subtitle: string;
  /** "CS/00016 · Version 2 · 14 Oct 2026", or "DRAFT · 14 Oct 2026" */
  numberLine: string;
  /** the peach panel, two to a row */
  facts: [string, string][];
};

/**
 * A new document with the band and panel drawn, and the pieces to fill it.
 * `f.page` and `f.y` move as it is filled - read them, do not keep copies.
 */
export async function creditNoteFrame(h: FrameHeader) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4.w - 2 * M;
  const f = {
    pdf,
    font,
    bold,
    W,
    page: pdf.addPage([A4.w, A4.h]) as PDFPage,
    y: 0,
    text(s: string, x: number, y: number, size: number, ft: PDFFont = font, color = INK) {
      f.page.drawText(safe(s), { x, y, size, font: ft, color });
    },
    right(s: string, x: number, y: number, size: number, ft: PDFFont = font, color = INK) {
      f.page.drawText(safe(s), { x: x - ft.widthOfTextAtSize(safe(s), size), y, size, font: ft, color });
    },
    /** a new page when what comes next would run into the footer */
    room(need: number) {
      if (f.y - need < M + FOOT) {
        f.page = pdf.addPage([A4.w, A4.h]);
        f.y = A4.h - M;
      }
    },
    section(title: string) {
      f.room(30);
      f.text(title, M, f.y, 9, bold, GREEN);
      f.y -= 6;
      f.page.drawLine({ start: { x: M, y: f.y }, end: { x: M + W, y: f.y }, thickness: 0.6, color: RULE });
      f.y -= 13;
    },
    row(label: string, amount: string, opts: { f?: PDFFont; color?: typeof INK; sub?: string | undefined } = {}) {
      const lines = wrap(label, opts.f ?? font, 9, W - 110);
      f.room(lines.length * 12 + (opts.sub ? 11 : 0) + 4);
      lines.forEach((l, i) => f.text(l, M, f.y - i * 12, 9, opts.f ?? font, opts.color ?? INK));
      f.right(amount, M + W, f.y, 9, opts.f ?? font, opts.color ?? INK);
      f.y -= lines.length * 12;
      if (opts.sub) {
        f.text(opts.sub, M + 10, f.y, 7.5, font, MUTED);
        f.y -= 11;
      }
      f.y -= 3;
    },
    /** the result, on its own band - peach and green when owed to the resident, red when owed by them */
    result(label: string, amount: number, toResident: boolean) {
      f.room(40);
      f.page.drawRectangle({ x: M, y: f.y - 14, width: W, height: 30, color: toResident ? PEACH : rgb(0.99, 0.93, 0.92) });
      f.text(label, M + 10, f.y - 3, 10, bold, toResident ? GREEN : RED);
      f.right(rm(amount), M + W - 10, f.y - 3, 12, bold, toResident ? GREEN : RED);
      f.y -= 34;
    },
    notes(body: string) {
      if (!body.trim()) return;
      f.section("NOTES");
      for (const l of wrap(body, font, 8.5, W)) {
        f.room(12);
        f.text(l, M, f.y, 8.5);
        f.y -= 12;
      }
      f.y -= 4;
    },
    /** the footer on every page, then the bytes */
    async finish(ref: string) {
      const pages = pdf.getPages();
      pages.forEach((p, i) => {
        p.drawLine({ start: { x: M, y: FOOT }, end: { x: A4.w - M, y: FOOT }, thickness: 0.5, color: RULE });
        p.drawText(safe(`${company.legalName} · ${company.registration}`), { x: M, y: FOOT - 11, size: 6.5, font, color: MUTED });
        p.drawText(safe(company.address), { x: M, y: FOOT - 20, size: 6.5, font, color: MUTED });
        const n = `${ref} · Page ${i + 1} of ${pages.length}`;
        p.drawText(n, { x: A4.w - M - font.widthOfTextAtSize(n, 6.5), y: FOOT - 11, size: 6.5, font, color: MUTED });
      });
      return pdf.save();
    },
  };

  const band = 66;
  f.page.drawRectangle({ x: 0, y: A4.h - band, width: A4.w, height: band, color: GREEN });
  const white = rgb(1, 1, 1);
  f.text(company.name, M, A4.h - 28, 14, bold, white);
  f.text(company.tagline, M, A4.h - 41, 8, font, white);
  f.text(`${company.email}  ·  WhatsApp ${company.phones[0]}`, M, A4.h - 52, 7.5, font, white);
  f.right(h.kind.toUpperCase(), A4.w - M, A4.h - 25, 12, bold, white);
  f.right(h.subtitle.toUpperCase(), A4.w - M, A4.h - 38, 8, font, white);
  f.right(h.numberLine, A4.w - M, A4.h - 50, 8, bold, white);

  f.y = A4.h - band - 14;
  const panel = 50;
  f.page.drawRectangle({ x: M, y: f.y - panel, width: W, height: panel, color: PEACH });
  const fw = (W - 20) / 2;
  h.facts.forEach(([k, val], i) => {
    const x = M + 10 + (i % 2) * fw;
    const yy = f.y - 14 - Math.floor(i / 2) * 20;
    f.text(k.toUpperCase(), x, yy, 6.5, bold, MUTED);
    f.text(val || "—", x + 62, yy, 8.5, bold);
  });
  f.y -= panel + 22;
  return f;
}

/**
 * A credit note that is not a checkout: what Brachtia owes back because the
 * stay got cheaper (a room change to a cheaper room, a shorter stay). Same
 * frame as the checkout statement; the lines are what came off, the result is
 * where the money goes.
 */
export type CreditNoteDoc = {
  /** "CN/…" once issued, or "DRAFT" in the review before anything is saved */
  number: string;
  subtitle: string;
  date: string;
  resident: { name: string; code?: string | undefined; residence: string; room: string; tenancyStart: string; tenancyEnd: string };
  heading: string;
  lines: { label: string; amount: number }[];
  totalLabel: string;
  resultLabel: string;
  notes?: string | undefined;
};

export async function creditNotePdf(doc: CreditNoteDoc): Promise<Uint8Array> {
  const r = doc.resident;
  const f = await creditNoteFrame({
    kind: "Credit note",
    subtitle: doc.subtitle,
    numberLine: `${doc.number} · ${day(doc.date)}`,
    facts: [
      ["Resident", `${r.name}${r.code ? ` (${r.code})` : ""}`],
      ["Residence", r.residence],
      ["Room", r.room],
      ["Tenancy", r.tenancyStart && r.tenancyEnd ? `${day(r.tenancyStart)} – ${day(r.tenancyEnd)}` : "—"],
    ],
  });
  const total = Math.round(doc.lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
  f.section(doc.heading);
  for (const l of doc.lines) f.row(l.label, rm(l.amount));
  f.row(doc.totalLabel, rm(total), { f: f.bold });
  f.y -= 8;
  f.result(doc.resultLabel, total, true);
  f.notes(doc.notes ?? "");
  return f.finish(doc.number);
}

export async function creditNotePdfUrl(doc: CreditNoteDoc) {
  const bytes = await creditNotePdf(doc);
  return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
}
