/**
 * The signed Schedule C, drawn from the resident's answers (1 Oct 2026).
 *
 * There is no Word file behind it: the checklist was answered on the signing
 * page, so the record is laid out here - the form's own headings, table and
 * acknowledgement - and both signatures placed at the end. This file is what
 * is kept, fingerprinted and shown afterwards.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { INVENTORY, MODE_LABEL, STATUS_LABEL, type InventoryMode, type InventoryRecord } from "@/lib/inventory";

export type InventoryPdfInput = {
  mode: InventoryMode;
  record: InventoryRecord;
  header: {
    agreementNo: string;
    agreementDate: string;
    effectiveDate: string;
    residence: string;
    unitNo: string;
    room: string;
    bed: string;
  };
  resident: { name: string; date: string; signature: Uint8Array };
  brachtia: { name: string; date: string; signature: Uint8Array | null };
};

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // margin
const INK = rgb(0.1, 0.12, 0.14);
const HEAD = rgb(0.09, 0.22, 0.3); // the form's dark blue headings
const MUTED = rgb(0.42, 0.45, 0.48);
const RULE = rgb(0.82, 0.84, 0.86);
const DEFECT = rgb(0.62, 0.25, 0.08);

/** Helvetica speaks WinAnsi only: anything else becomes a plain stand-in. */
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•]/g, "?");

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

export async function inventoryPdf(input: InventoryPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const room = (need: number) => {
    if (y - need < M + 20) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };
  const text = (s: string, x: number, size = 10, f = font, color = INK) => page.drawText(safe(s), { x, y, size, font: f, color });
  const para = (s: string, size = 10, f = font, color = INK, width = A4.w - 2 * M) => {
    for (const line of wrap(s, f, size, width)) {
      room(size + 4);
      text(line, M, size, f, color);
      y -= size + 4;
    }
  };

  // title and the record's particulars
  para("SCHEDULE C – INVENTORY & CONDITION RECORD", 16, bold, HEAD);
  para(MODE_LABEL[input.mode].toUpperCase(), 10, bold, MUTED);
  y -= 6;
  const h = input.header;
  para(`This Schedule C forms part of the Tenancy Agreement bearing Agreement No. ${h.agreementNo || "—"}, dated ${h.agreementDate || "—"}.`);
  y -= 4;
  for (const [k, v] of [
    ["Effective Date", h.effectiveDate],
    ["Residence", h.residence],
    ["Unit No.", h.unitNo],
    ["Room", [h.room, h.bed].filter(Boolean).join(", ")],
  ] as const) {
    room(14);
    text(`${k}:`, M, 10, bold);
    text(v || "—", M + 90, 10);
    y -= 14;
  }
  y -= 6;
  para("Present – Item is provided. Defect – Item is provided with an existing defect, described under Remarks. Not Provided – Item is not provided as part of the premises.", 9, font, MUTED);
  y -= 8;

  // the table: item, quantity, status, remarks
  const col = { item: M, qty: M + 200, status: M + 250, remark: M + 330 };
  const remarkW = A4.w - M - col.remark;
  const tableHead = () => {
    room(30);
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.6, color: RULE });
    y -= 8;
    text("Item", col.item, 8.5, bold, MUTED);
    text("Qty", col.qty, 8.5, bold, MUTED);
    text("Status", col.status, 8.5, bold, MUTED);
    text("Remarks", col.remark, 8.5, bold, MUTED);
    y -= 14;
  };
  const row = (name: string, qty: string, status: string, remark: string) => {
    const nameLines = wrap(name, font, 9.5, col.qty - col.item - 8);
    const remarkLines = remark ? wrap(remark, font, 9, remarkW) : [];
    const lines = Math.max(nameLines.length, remarkLines.length, 1);
    room(lines * 12 + 6);
    const top = y;
    nameLines.forEach((l, i) => page.drawText(l, { x: col.item, y: top - i * 12, size: 9.5, font, color: INK }));
    page.drawText(safe(qty || "—"), { x: col.qty, y: top, size: 9.5, font, color: INK });
    const isDefect = status === STATUS_LABEL.defect;
    page.drawText(safe(status || "—"), { x: col.status, y: top, size: 9.5, font: isDefect ? bold : font, color: isDefect ? DEFECT : INK });
    remarkLines.forEach((l, i) => page.drawText(l, { x: col.remark, y: top - i * 12, size: 9, font, color: INK }));
    // the rule sits below the last line's descenders, the next row clear of it
    const rule = top - (lines - 1) * 12 - 5;
    page.drawLine({ start: { x: M, y: rule }, end: { x: A4.w - M, y: rule }, thickness: 0.3, color: RULE });
    y = rule - 12;
  };

  const r = input.record;
  for (const area of INVENTORY) {
    room(50);
    y -= 6;
    text(area.name.toUpperCase(), M, 11, bold, HEAD);
    y -= 12;
    tableHead();
    for (const it of area.items) {
      const a = r.answers[it.id];
      // what the resident counted, when it differs from the list
      // the brand or model written in, after the name - the form's own column
      const named = a?.detail?.trim() ? `${it.name} - ${a.detail.trim()}` : it.name;
      row(named, a?.qty?.trim() || it.qty, a?.status ? STATUS_LABEL[a.status] : "", a?.remark ?? "");
    }
    for (const e of r.extras.filter((e) => e.areaId === area.id && e.name.trim())) {
      row(`${e.name.trim()} (added)`, e.qty, e.status ? STATUS_LABEL[e.status] : "", e.remark);
    }
  }

  y -= 10;
  room(60);
  text("METER READINGS", M, 11, bold, HEAD);
  y -= 16;
  for (const [k, v] of [
    ["Water meter reading", r.meters.water],
    ["Electric meter reading", r.meters.electric],
  ] as const) {
    room(14);
    text(`${k}:`, M, 10, bold);
    text(v.trim() || "—", M + 140, 10);
    y -= 14;
  }

  y -= 10;
  room(40);
  text("GENERAL REMARKS", M, 11, bold, HEAD);
  y -= 16;
  para(r.generalRemarks.trim() || "None.", 10);

  y -= 10;
  room(40);
  text("ACKNOWLEDGEMENT", M, 11, bold, HEAD);
  y -= 16;
  for (const p of [
    "The Resident acknowledges that the items marked Present were provided with the premises as at the Effective Date stated above. Items marked Not Provided are not included as part of the inventory provided to the Resident.",
    "Any existing defect must be marked Defect, described under Remarks and submitted to Brachtia Homes for review within 48 hours of the Effective Date together with supporting image(s).",
    "Any defect not reported within this 48-hour period may not be recognised as an existing defect at the commencement of the Resident's occupancy.",
    "The Resident agrees to take reasonable care of the items provided and shall be responsible for any loss or damage beyond reasonable wear and tear, subject to the terms of the Tenancy Agreement.",
  ]) {
    para(p, 9.5);
    y -= 4;
  }

  // the two signatures, side by side
  room(130);
  y -= 10;
  const blocks = [
    { title: "Resident", x: M, ...input.resident },
    { title: "Brachtia Homes", x: A4.w / 2 + 10, ...input.brachtia },
  ];
  const top = y;
  for (const b of blocks) {
    y = top;
    text(b.title, b.x, 10.5, bold);
    y -= 52;
    if (b.signature) {
      const img = await pdf.embedPng(b.signature);
      const k = Math.min(160 / img.width, 40 / img.height);
      page.drawImage(img, { x: b.x, y: y + 2, width: img.width * k, height: img.height * k });
    }
    page.drawLine({ start: { x: b.x, y }, end: { x: b.x + 190, y }, thickness: 0.6, color: INK });
    y -= 14;
    text(`Name: ${b.name || "—"}`, b.x, 9.5);
    y -= 13;
    text(`Date: ${b.date || "—"}`, b.x, 9.5);
  }
  return pdf.save();
}
