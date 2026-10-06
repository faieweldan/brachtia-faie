/**
 * The signed Schedule C, drawn from the resident's answers (1 Oct 2026).
 *
 * There is no Word file behind it: the checklist was answered on the signing
 * page, so the record is laid out here. Since 2 Oct 2026 (Dani's sketch) it is
 * one page in the invoice's and quote's look - the green band, then every
 * item in three columns with a mark for its status, then only what needs
 * reading in full: the defects with Brachtia's answers, and any remarks. Then
 * the acknowledgement and both signatures. A record with many remarks runs
 * onto a second page rather than lose any.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { company } from "@/data/properties";
import {
  ACKNOWLEDGEMENT,
  INVENTORY,
  MODE_LABEL,
  VERDICT_LABEL,
  type DefectDecision,
  type InventoryMode,
  type InventoryRecord,
} from "@/lib/inventory";

export type InventoryPdfInput = {
  mode: InventoryMode;
  record: InventoryRecord;
  /** Brachtia's answer to each defect */
  decisions?: Record<string, DefectDecision>;
  /** how many photos each defect has - the photos stay in storage, beside the PDF */
  photoCount?: Record<string, number>;
  /** the resident agreed to each of Brachtia's answers before signing */
  residentAgreed?: boolean;
  header: {
    agreementNo: string;
    agreementDate: string;
    effectiveDate: string;
    residence: string;
    unitNo: string;
    room: string;
    bed: string;
  };
  /** no signature yet: the copy the resident reads before signing */
  resident: { name: string; date: string; signature: Uint8Array | null };
  brachtia: { name: string; date: string; signature: Uint8Array | null };
};

const A4 = { w: 595.28, h: 841.89 };
const M = 36; // margin
// the invoice's colours (invoice-pdf.ts)
const GREEN = rgb(26 / 255, 71 / 255, 52 / 255);
const PEACH = rgb(250 / 255, 240 / 255, 231 / 255);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(110 / 255, 110 / 255, 105 / 255);
const RULE = rgb(230 / 255, 226 / 255, 220 / 255);
const AMBER = rgb(0.72, 0.4, 0.05);
const PRESENT = rgb(0.13, 0.5, 0.3);

/** Helvetica speaks WinAnsi only: anything else becomes a plain stand-in. */
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•·]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
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

/** cut to fit, with an ellipsis */
function fit(text: string, font: PDFFont, size: number, width: number) {
  let s = safe(text);
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/*
 * The final mark, after Brachtia's answer (Dani and Lav, 5 Oct 2026) - no cross:
 *   ✓ present, or a defect / missing item Brachtia resolved
 *   ○ a defect Brachtia accepted - there, but as it is
 *   — not provided, and both agree it stays so
 * Drawn, since Helvetica has no tick or circle.
 */
export function finalMark(status: string, verdict?: "resolved" | "accepted"): "tick" | "circle" | "dash" | "" {
  if (status === "present") return "tick";
  if (status === "defect") return verdict === "resolved" ? "tick" : "circle";
  if (status === "not_provided") return verdict === "resolved" ? "tick" : "dash";
  return "";
}

function mark(page: PDFPage, m: string, x: number, y: number) {
  if (m === "tick") {
    page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 2.5, y: y + 0.5 }, thickness: 1.1, color: PRESENT });
    page.drawLine({ start: { x: x + 2.5, y: y + 0.5 }, end: { x: x + 7, y: y + 6 }, thickness: 1.1, color: PRESENT });
  } else if (m === "circle") {
    page.drawCircle({ x: x + 3.2, y: y + 3, size: 2.9, borderWidth: 1.1, borderColor: AMBER });
  } else if (m === "dash") {
    page.drawLine({ start: { x: x + 0.5, y: y + 3 }, end: { x: x + 6, y: y + 3 }, thickness: 1, color: MUTED });
  }
}

export async function inventoryPdf(input: InventoryPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  const FOOT = 40;
  const r = input.record;
  const h = input.header;

  const text = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(safe(s), { x: x - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color });

  // the green band, as on the invoice and the quote
  const band = 62;
  page.drawRectangle({ x: 0, y: A4.h - band, width: A4.w, height: band, color: GREEN });
  text(company.name, M, A4.h - 28, 14, bold, rgb(1, 1, 1));
  text(company.tagline, M, A4.h - 41, 8, font, rgb(1, 1, 1));
  text(`${company.email}  ·  WhatsApp ${company.phones[0]}`, M, A4.h - 52, 7.5, font, rgb(1, 1, 1));
  right("SCHEDULE C", A4.w - M, A4.h - 25, 12, bold, rgb(1, 1, 1));
  right("INVENTORY & CONDITION RECORD", A4.w - M, A4.h - 38, 8, font, rgb(1, 1, 1));
  right(MODE_LABEL[input.mode].toUpperCase(), A4.w - M, A4.h - 50, 8, bold, rgb(1, 1, 1));

  // the particulars, on the peach panel
  let y = A4.h - band - 12;
  const panel = 44;
  page.drawRectangle({ x: M, y: y - panel, width: A4.w - 2 * M, height: panel, color: PEACH });
  text(
    `Part of Tenancy Agreement ${h.agreementNo || "—"}, dated ${h.agreementDate || "—"}.`,
    M + 10,
    y - 13,
    8,
    font,
    MUTED,
  );
  const facts: [string, string][] = [
    ["Effective", h.effectiveDate],
    ["Residence", h.residence],
    ["Unit", h.unitNo],
    ["Room", [h.room, h.bed].filter(Boolean).join(", ")],
  ];
  const fw = (A4.w - 2 * M - 20) / facts.length;
  facts.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + 10 + i * fw, y - 26, 6.5, bold, MUTED);
    text(fit(v || "—", bold, 8.5, fw - 8), M + 10 + i * fw, y - 37, 8.5, bold, INK);
  });
  y -= panel + 14;

  // every item, in three columns: an area's heading, then name, count, mark
  type Line = { kind: "area"; name: string } | { kind: "item"; name: string; detail: string; qty: string; status: string };
  const verdictOf = (key: string) => input.decisions?.[key]?.verdict;
  const lines: Line[] = [];
  for (const area of INVENTORY) {
    lines.push({ kind: "area", name: area.name });
    for (const it of area.items) {
      const a = r.answers[it.id];
      lines.push({ kind: "item", name: it.name, detail: it.details ? (a?.detail ?? "") : "", qty: a?.qty?.trim() || String(it.qty), status: finalMark(a?.status ?? "", verdictOf(it.id)) });
    }
    for (const e of r.extras.filter((x) => x.areaId === area.id && x.name.trim()))
      lines.push({ kind: "item", name: `${e.name.trim()} (added)`, detail: "", qty: e.qty, status: finalMark(e.status, verdictOf(e.id)) });
  }
  const LH = 10.2;
  const gap = 14;
  const cw = (A4.w - 2 * M - 2 * gap) / 3;
  const perCol = Math.ceil(lines.length / 3);
  const cols: Line[][] = [[], [], []];
  // fill column by column; a column never starts on a bare item - its area is repeated, "(cont.)"
  let c = 0;
  let lastArea = "";
  for (const l of lines) {
    if (cols[c]!.length >= perCol && c < 2) {
      c++;
      if (l.kind === "item") cols[c]!.push({ kind: "area", name: `${lastArea} (cont.)` });
    }
    if (l.kind === "area") {
      // a heading never ends a column
      if (cols[c]!.length >= perCol - 1 && c < 2) c++;
      lastArea = l.name;
    }
    cols[c]!.push(l);
  }
  const gridTop = y;
  cols.forEach((col, i) => {
    const x = M + i * (cw + gap);
    let yy = gridTop;
    for (const l of col) {
      if (l.kind === "area") {
        if (yy !== gridTop) yy -= 3;
        text(fit(l.name.toUpperCase(), bold, 7, cw), x, yy - 7, 7, bold, GREEN);
        yy -= LH;
        continue;
      }
      const qtyX = x + cw - 22;
      const nameW = qtyX - x - 4;
      const name = fit(l.name, font, 7.5, nameW);
      text(name, x, yy - 7, 7.5);
      // the brand or serial number, after the name when there is room
      if (l.detail) {
        const used = font.widthOfTextAtSize(name, 7.5) + 4;
        if (used < nameW - 18) text(fit(l.detail, font, 6.5, nameW - used), x + used, yy - 7, 6.5, font, MUTED);
      }
      right(l.qty, qtyX + 8, yy - 7, 7.5, font, MUTED);
      mark(page, l.status, x + cw - 8, yy - 7.5);
      page.drawLine({ start: { x, y: yy - 9.6 }, end: { x: x + cw, y: yy - 9.6 }, thickness: 0.3, color: RULE });
      yy -= LH;
    }
  });
  y = gridTop - Math.max(...cols.map((col) => col.reduce((n, l, i) => n + LH + (l.kind === "area" && i ? 3 : 0), 0))) - 8;

  // the key to the marks
  const keys: [string, string][] = [
    ["tick", "Present or resolved"],
    ["circle", "Present with defect"],
    ["dash", "Not provided"],
  ];
  let kx = M;
  for (const [s, label] of keys) {
    mark(page, s, kx, y - 7.5);
    text(label, kx + 11, y - 7, 7.5, font, MUTED);
    kx += 22 + font.widthOfTextAtSize(label, 7.5) + 10;
  }
  y -= 16;

  // what needs reading in full: defects with Brachtia's answers, then remarks
  const room = (need: number) => {
    if (y - need < M + FOOT) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };
  const heading = (s: string) => {
    room(24);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: A4.w - M, y: y - 2 }, thickness: 0.6, color: RULE });
    y -= 13;
    text(s, M, y, 8.5, bold, GREEN);
    y -= 11;
  };
  const para = (s: string, size: number, f = font, color = INK, indent = 0) => {
    for (const ln of wrap(s, f, size, A4.w - 2 * M - indent)) {
      room(size + 3);
      text(ln, M + indent, y, size, f, color);
      y -= size + 3;
    }
  };

  // a paragraph with **bold** words: wrapped word by word, the bold ones darker
  const richPara = (s: string, size: number) => {
    // glue: no space before it - the comma straight after a bold word
    const words: { w: string; strong: boolean; glue: boolean }[] = [];
    let gap = true;
    for (const part of s.split(/(\*\*[^*]+\*\*)/)) {
      if (!part) continue;
      const strong = part.startsWith("**");
      const body = part.replace(/\*\*/g, "");
      body.split(/\s+/).forEach((w, i) => {
        if (w) words.push({ w, strong, glue: i === 0 && !gap && !/^\s/.test(body) });
      });
      gap = /\s$/.test(body);
    }
    const width = A4.w - 2 * M;
    const space = font.widthOfTextAtSize(" ", size);
    let line: typeof words = [];
    let used = 0;
    const flush = () => {
      room(size + 3);
      let x = M;
      line.forEach(({ w, strong, glue }, i) => {
        const f = strong ? bold : font;
        if (i && !glue) x += space;
        text(w, x, y, size, f, strong ? INK : MUTED);
        x += f.widthOfTextAtSize(w, size);
      });
      y -= size + 3;
      line = [];
      used = 0;
    };
    for (const word of words) {
      const w = (word.strong ? bold : font).widthOfTextAtSize(word.w, size);
      const gapW = line.length && !word.glue ? space : 0;
      if (line.length && used + gapW + w > width) flush();
      used += (line.length && !word.glue ? space : 0) + w;
      line.push(word);
    }
    if (line.length) flush();
  };

  heading("REMARKS");
  let any = false;
  for (const area of INVENTORY) {
    const rows = [
      ...area.items.map((it) => ({ key: it.id, name: it.name, a: r.answers[it.id] })),
      ...r.extras
        .filter((e) => e.areaId === area.id && e.name.trim())
        .map((e) => ({ key: e.id, name: e.name.trim(), a: { status: e.status, remark: e.remark } })),
    ];
    for (const { key, name, a } of rows) {
      const answer = input.decisions?.[key];
      if (!a || (a.status !== "defect" && !a.remark?.trim() && !(a.status === "not_provided" && answer))) continue;
      any = true;
      // the photo count is left off the page (Dani, 6 Oct 2026). One line each, Brachtia's
      // answer at its end - on two lines, a few remarks pushed the signatures to a 2nd page
      const verdict = answer
        ? ` · Brachtia: ${VERDICT_LABEL[answer.verdict]}${input.residentAgreed && answer.verdict === "resolved" ? " (agreed by the resident)" : ""}`
        : "";
      if (a.status === "defect") {
        para(`${area.name} · ${name} — ${a.remark.trim() || "—"}${verdict}`, 7.5, bold, AMBER);
      } else if (a.status === "not_provided") {
        // a missing item: Resolved is Brachtia providing it, Accepted is it staying missing
        para(`${area.name} · ${name} — Not provided${a.remark?.trim() ? `: ${a.remark.trim()}` : ""}${verdict}`, 7.5, bold, MUTED);
      } else {
        para(`${area.name} · ${name} — ${a.remark.trim()}`, 7.5);
      }
      y -= 1;
    }
  }
  if (!any) para("No defects reported.", 8, font, MUTED);
  para(`General: ${r.generalRemarks.trim() || "none."}`, 8, font, r.generalRemarks.trim() ? INK : MUTED);

  heading("ACKNOWLEDGEMENT");
  for (const p of ACKNOWLEDGEMENT) {
    richPara(p, 6.8);
    y -= 1;
  }

  // the two signatures, side by side
  room(92);
  y -= 6;
  const blocks = [
    // Brachtia on the left, the resident on the right - as on the checkout statement (Dani, 6 Oct 2026)
    { title: "Brachtia Homes", x: M, ...input.brachtia },
    { title: "Resident", x: A4.w / 2 + 10, ...input.resident },
  ];
  const top = y;
  for (const b of blocks) {
    let yy = top;
    text(b.title, b.x, yy - 8, 8.5, bold, GREEN);
    yy -= 46;
    if (b.signature) {
      const img = await pdf.embedPng(b.signature);
      const k = Math.min(150 / img.width, 34 / img.height);
      page.drawImage(img, { x: b.x, y: yy + 2, width: img.width * k, height: img.height * k });
    }
    page.drawLine({ start: { x: b.x, y: yy }, end: { x: b.x + 190, y: yy }, thickness: 0.6, color: INK });
    text(`Name: ${b.name || "—"}`, b.x, yy - 11, 8);
    text(`Date: ${b.date || "—"}`, b.x, yy - 22, 8);
  }

  // the invoice's footer, on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: FOOT }, end: { x: A4.w - M, y: FOOT }, thickness: 0.5, color: RULE });
    p.drawText(safe(`${company.legalName} · ${company.registration}`), { x: M, y: FOOT - 11, size: 6.5, font, color: MUTED });
    p.drawText(safe(company.address), { x: M, y: FOOT - 20, size: 6.5, font, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: A4.w - M - font.widthOfTextAtSize(n, 6.5), y: FOOT - 11, size: 6.5, font, color: MUTED });
  });
  return pdf.save();
}
