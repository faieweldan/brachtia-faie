/* eslint-disable @typescript-eslint/no-explicit-any */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { company } from "@/data/properties";
import { CHECKOUT_TYPE_LABEL, type CheckoutType } from "@/lib/checkout-types";

export * from "@/lib/checkout-types";

/*
 * The checkout statement (Dani, 2 Oct 2026): a credit note, not an invoice -
 * it is what Brachtia owes back. It has its own number, CN/00001, shows every
 * deposit held, takes off what is still owed and each deduction (with its
 * photos), and states the refund. The resident reviews and signs it on their
 * signing link; Brachtia then pays and records the proof.
 *
 * Changed after it was issued, it is issued again as the next version; every
 * version keeps its own PDF, and only the latest one is signed.
 *
 * Kept as files beside the resident's documents, like Schedule C, so nothing
 * has to be run on either database:
 *   checkout/<resident>/statement.json         the record
 *   checkout/<resident>/v<n>.pdf               each version as issued
 *   checkout/<resident>/v<n>-signed.pdf        signed by the resident
 *   checkout/<resident>/v<n>-signature.png
 *   checkout/<resident>/photos/<id>.jpg        a deduction's photos
 *   checkout/<resident>/refund-proof.<ext>
 *   checkout/_counter.json                     the next CN number
 */
const BUCKET = "resident-documents";

export type CheckoutLine = {
  id: string;
  label: string;
  amount: number;
  /**
   * outstanding: an unpaid invoice, put in by itself; forfeit: what the kind of
   * checkout keeps, put in by itself; deduction: added by admin
   */
  source: "outstanding" | "forfeit" | "deduction";
  invoiceNumber?: string;
  photos: string[];
};
export type CheckoutDeposit = { label: string; amount: number; invoiceNumber: string };

export type CheckoutVersion = {
  v: number;
  issuedAt: string;
  /** missing on versions issued before 2 Oct 2026 - those were end of tenancy */
  type?: CheckoutType;
  deposits: CheckoutDeposit[];
  lines: CheckoutLine[];
  notes: string;
  held: number;
  deducted: number;
  /** held - deducted: above 0 is refunded, below 0 is still owed by the resident */
  net: number;
  pdfPath: string;
  pdfSha256: string;
  signed?: {
    at: string;
    typedName: string;
    ip: string;
    userAgent: string;
    profileLinkId: string;
    signaturePath: string;
    signatureSha256: string;
    pdfPath: string;
    pdfSha256: string;
  };
};

export type CheckoutStatement = {
  number: string;
  createdAt: string;
  draft: { lines: CheckoutLine[]; notes: string; type?: CheckoutType };
  /** admin made the resident inactive after it was settled */
  inactiveAt?: string;
  versions: CheckoutVersion[];
  refund?: { amount: number; paidOn: string; method: string; reference: string; proofPath: string; recordedAt: string };
  /*
   * Done once the resident signs (Dani, 2 Oct 2026): the deposit is applied to
   * each unpaid invoice first, as a "Deposit applied" payment with its own
   * receipt; what is left of it pays the deductions. Left over: a credit note
   * Brachtia pays (Payables). Short: a Checkout settlement invoice for the rest
   * (Collections). Nothing changes on the statement after this.
   */
  settled?: {
    at: string;
    applied: { invoiceNumber: string; amount: number }[];
    /** paid back to the resident - the credit note in Payables */
    refund: number;
    /** still owed by the resident - the CS invoice in Collections */
    owed: number;
    csInvoiceNumber?: string;
  };
};

export const base = (residentId: string) => `checkout/${residentId}`;

export async function readStatement(sb: any, residentId: string): Promise<CheckoutStatement | null> {
  const { data } = await sb.storage.from(BUCKET).download(`${base(residentId)}/statement.json`);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as CheckoutStatement;
  } catch {
    return null;
  }
}

export async function putFile(sb: any, path: string, body: Uint8Array | string, type: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([body as any], { type }), { upsert: true, contentType: type });
  if (error) throw new Error(`Could not save ${path.split("/").pop()}: ${error.message}`);
}

export const writeStatement = (sb: any, residentId: string, s: CheckoutStatement) =>
  putFile(sb, `${base(residentId)}/statement.json`, JSON.stringify(s, null, 2), "application/json");

export async function getFile(sb: any, path: string): Promise<Uint8Array | null> {
  const { data } = await sb.storage.from(BUCKET).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** The next credit note number - its own series, CN/00001. */
export async function nextNumber(sb: any): Promise<string> {
  const path = "checkout/_counter.json";
  const raw = await getFile(sb, path);
  let next = 1;
  try {
    next = raw ? Number(JSON.parse(new TextDecoder().decode(raw)).next) || 1 : 1;
  } catch {
    /* start again at 1 */
  }
  await putFile(sb, path, JSON.stringify({ next: next + 1 }), "application/json");
  // CS - checkout settlement, one code for every part of checkout (Dani, 6 Oct 2026): this
  // statement CS/00016, and the invoice made when the student owes, INV/CS/00051. Neutral,
  // because the statement ends as a credit note or an invoice. CN/ and CO/ numbers given
  // before keep theirs.
  return `CS/${String(next).padStart(5, "0")}`;
}

export const sha256 = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, "0")).join("");

export const totals = (deposits: CheckoutDeposit[], lines: CheckoutLine[]) => {
  const held = round(deposits.reduce((n, d) => n + d.amount, 0));
  const deducted = round(lines.reduce((n, l) => n + (Number(l.amount) || 0), 0));
  return { held, deducted, net: round(held - deducted) };
};
const round = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- the PDF */

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
// the invoice's colours (invoice-pdf.ts)
const GREEN = rgb(26 / 255, 71 / 255, 52 / 255);
const PEACH = rgb(250 / 255, 240 / 255, 231 / 255);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(110 / 255, 110 / 255, 105 / 255);
const RULE = rgb(230 / 255, 226 / 255, 220 / 255);
const RED = rgb(0.68, 0.18, 0.12);

const safe = (s: string) =>
  String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—•·]/g, "?");
const rm = (n: number) => `RM ${Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export type StatementPdfInput = {
  number: string;
  version: CheckoutVersion;
  resident: { name: string; code: string; residence: string; unit: string; room: string; tenancyStart: string; tenancyEnd: string };
  brachtia: { name: string; signature: Uint8Array | null };
  /** once the resident has signed */
  residentSigned?: { name: string; date: string; signature: Uint8Array } | undefined;
  /** the photos of each deduction, appended after the statement */
  photos: Record<string, Uint8Array>;
  refund?: CheckoutStatement["refund"] | undefined;
};

const day = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
};

/** The statement in the invoice's look: green band, peach panel, then the sums. */
export async function statementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  const FOOT = 40;
  const v = input.version;
  const text = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(safe(s), { x: x - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color });

  const band = 66;
  page.drawRectangle({ x: 0, y: A4.h - band, width: A4.w, height: band, color: GREEN });
  const white = rgb(1, 1, 1);
  text(company.name, M, A4.h - 28, 14, bold, white);
  text(company.tagline, M, A4.h - 41, 8, font, white);
  text(`${company.email}  ·  WhatsApp ${company.phones[0]}`, M, A4.h - 52, 7.5, font, white);
  // what it is follows the balance: a refund is a credit note, a balance owed is an invoice
  right(v.net >= 0 ? "CREDIT NOTE" : "INVOICE", A4.w - M, A4.h - 25, 12, bold, white);
  right(`CHECKOUT STATEMENT · ${CHECKOUT_TYPE_LABEL[v.type ?? "end_of_tenancy"].toUpperCase()}`, A4.w - M, A4.h - 38, 8, font, white);
  right(`${input.number} · Version ${v.v} · ${day(v.issuedAt)}`, A4.w - M, A4.h - 50, 8, bold, white);

  let y = A4.h - band - 14;
  const panel = 50;
  page.drawRectangle({ x: M, y: y - panel, width: A4.w - 2 * M, height: panel, color: PEACH });
  const r = input.resident;
  const facts: [string, string][] = [
    ["Resident", `${r.name}${r.code ? ` (${r.code})` : ""}`],
    ["Residence", [r.residence, r.unit].filter(Boolean).join(" · ")],
    ["Room", r.room],
    ["Tenancy", r.tenancyStart && r.tenancyEnd ? `${day(r.tenancyStart)} – ${day(r.tenancyEnd)}` : "—"],
  ];
  const fw = (A4.w - 2 * M - 20) / 2;
  facts.forEach(([k, val], i) => {
    const x = M + 10 + (i % 2) * fw;
    const yy = y - 14 - Math.floor(i / 2) * 20;
    text(k.toUpperCase(), x, yy, 6.5, bold, MUTED);
    text(val || "—", x + 62, yy, 8.5, bold);
  });
  y -= panel + 22;

  const room = (need: number) => {
    if (y - need < M + FOOT) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };
  const W = A4.w - 2 * M;
  const section = (title: string) => {
    room(30);
    text(title, M, y, 9, bold, GREEN);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: RULE });
    y -= 13;
  };
  const row = (label: string, amount: string, opts: { f?: PDFFont; color?: typeof INK; sub?: string | undefined } = {}) => {
    const lines = wrap(label, opts.f ?? font, 9, W - 110);
    room(lines.length * 12 + (opts.sub ? 11 : 0) + 4);
    lines.forEach((l, i) => text(l, M, y - i * 12, 9, opts.f ?? font, opts.color ?? INK));
    right(amount, M + W, y, 9, opts.f ?? font, opts.color ?? INK);
    y -= lines.length * 12;
    if (opts.sub) {
      text(opts.sub, M + 10, y, 7.5, font, MUTED);
      y -= 11;
    }
    y -= 3;
  };

  // a cancellation holds what was paid, not deposits
  const paidIn = v.type === "cancellation";
  section(paidIn ? "PAID SO FAR" : "DEPOSITS HELD");
  if (!v.deposits.length) row(paidIn ? "Nothing paid" : "No refundable deposits on record", rm(0), { color: MUTED });
  // no sub-lines under the lines - invoice numbers and notes left off (Dani, 6 Oct 2026)
  for (const d of v.deposits) row(d.label, rm(d.amount));
  row(paidIn ? "Total paid" : "Total deposits held", rm(v.held), { f: bold });
  y -= 6;

  section("DEDUCTIONS");
  if (!v.lines.length) row("No deductions", rm(0), { color: MUTED });
  for (const l of v.lines) row(l.label, `- ${rm(l.amount)}`);
  row("Total deductions", `- ${rm(v.deducted)}`, { f: bold });
  y -= 8;

  // the result, on its own band
  room(40);
  page.drawRectangle({ x: M, y: y - 14, width: W, height: 30, color: v.net >= 0 ? PEACH : rgb(0.99, 0.93, 0.92) });
  text(v.net >= 0 ? "REFUND DUE TO RESIDENT" : "BALANCE OWED BY RESIDENT", M + 10, y - 3, 10, bold, v.net >= 0 ? GREEN : RED);
  right(rm(v.net), M + W - 10, y - 3, 12, bold, v.net >= 0 ? GREEN : RED);
  y -= 34;

  if (v.notes.trim()) {
    section("NOTES");
    for (const l of wrap(v.notes, font, 8.5, W)) {
      room(12);
      text(l, M, y, 8.5);
      y -= 12;
    }
    y -= 4;
  }

  if (input.refund) {
    section("REFUND PAID");
    row(`Paid ${day(input.refund.paidOn)} by ${input.refund.method}${input.refund.reference ? ` · Ref ${input.refund.reference}` : ""}`, rm(input.refund.amount), {
      f: bold,
    });
    y -= 4;
  }

  // agreement and signatures
  room(130);
  for (const l of wrap(
    "The Resident has reviewed this statement and agrees to the deposits held, every deduction and the final amount above, in full settlement of the tenancy.",
    font,
    7.5,
    W,
  )) {
    text(l, M, y, 7.5, font, MUTED);
    y -= 10;
  }
  y -= 8;
  const blocks = [
    // Brachtia on the left, the resident on the right (Dani, 5 Oct 2026)
    { title: "Brachtia Homes", x: M, name: input.brachtia.name, date: day(v.issuedAt), sig: input.brachtia.signature },
    { title: "Resident", x: A4.w / 2 + 10, name: input.residentSigned?.name ?? "", date: input.residentSigned?.date ?? "", sig: input.residentSigned?.signature ?? null },
  ];
  const top = y;
  for (const b of blocks) {
    let yy = top;
    text(b.title, b.x, yy - 8, 8.5, bold, GREEN);
    yy -= 46;
    if (b.sig) {
      const img = await pdf.embedPng(b.sig);
      const k = Math.min(150 / img.width, 34 / img.height);
      page.drawImage(img, { x: b.x, y: yy + 2, width: img.width * k, height: img.height * k });
    }
    page.drawLine({ start: { x: b.x, y: yy }, end: { x: b.x + 190, y: yy }, thickness: 0.6, color: INK });
    text(`Name: ${b.name || ""}`, b.x, yy - 11, 8);
    text(`Date: ${b.date || ""}`, b.x, yy - 22, 8);
  }

  // each deduction's photos, on the pages after - the evidence for it
  const withPhotos = v.lines.filter((l) => l.photos.some((p) => input.photos[p]));
  for (const l of withPhotos) {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M;
    text(`Photos - ${l.label}`, M, y - 10, 11, bold, GREEN);
    let gy = y - 30;
    const cell = (W - 12) / 2;
    let i = 0;
    for (const p of l.photos) {
      const bytes = input.photos[p];
      if (!bytes) continue;
      const img = bytes[0] === 0x89 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const k = Math.min(cell / img.width, 300 / img.height);
      const x = M + (i % 2) * (cell + 12);
      if (i && i % 2 === 0) gy -= 312;
      if (gy - 300 < M + FOOT) {
        page = pdf.addPage([A4.w, A4.h]);
        gy = A4.h - M;
      }
      page.drawImage(img, { x, y: gy - img.height * k, width: img.width * k, height: img.height * k });
      i++;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: FOOT }, end: { x: A4.w - M, y: FOOT }, thickness: 0.5, color: RULE });
    p.drawText(safe(`${company.legalName} · ${company.registration}`), { x: M, y: FOOT - 11, size: 6.5, font, color: MUTED });
    p.drawText(safe(company.address), { x: M, y: FOOT - 20, size: 6.5, font, color: MUTED });
    const n = `${input.number} v${v.v} · Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: A4.w - M - font.widthOfTextAtSize(n, 6.5), y: FOOT - 11, size: 6.5, font, color: MUTED });
  });
  return pdf.save();
}

/** What the PDF says about the resident and their stay, read as it is now. */
export async function residentParticulars(sb: any, residentId: string) {
  const { data: res } = await sb.from("residents").select("full_name, resident_code").eq("id", residentId).maybeSingle();
  const { data: bed } = await sb.from("beds").select("label, room_id").eq("resident_id", residentId).limit(1).maybeSingle();
  const { data: rm2 } = bed ? await sb.from("rooms").select("letter, unit_id").eq("id", bed.room_id).maybeSingle() : { data: null };
  const { data: un } = rm2 ? await sb.from("units").select("unit_no, residence_id").eq("id", rm2.unit_id).maybeSingle() : { data: null };
  const { data: rs } = un ? await sb.from("residences").select("name").eq("id", un.residence_id).maybeSingle() : { data: null };
  const { data: ag } = await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1);
  const { data: doc } = ag?.length
    ? await sb.from("agreement_documents").select("period_start, period_end").eq("agreement_id", ag[0].id).eq("doc_type", "agreement").order("version", { ascending: false }).limit(1)
    : { data: null };
  return {
    name: String(res?.full_name ?? ""),
    code: String(res?.resident_code ?? ""),
    residence: String(rs?.name ?? ""),
    unit: String(un?.unit_no ?? ""),
    room: [rm2?.letter ? `Room ${rm2.letter}` : "", bed?.label ?? ""].filter(Boolean).join(", "),
    tenancyStart: String(doc?.[0]?.period_start ?? ""),
    tenancyEnd: String(doc?.[0]?.period_end ?? ""),
  };
}

/** Build a version's PDF from the record - unsigned, signed, or with the refund. */
export async function buildStatementPdf(sb: any, residentId: string, s: CheckoutStatement, v: CheckoutVersion, withRefund = false) {
  const { loadSignatory, loadSignatureImage } = await import("@/lib/signatory.server");
  const signatory = await loadSignatory(sb);
  const photos: Record<string, Uint8Array> = {};
  for (const l of v.lines) for (const p of l.photos) {
    const b = await getFile(sb, p);
    if (b) photos[p] = b;
  }
  const sig = v.signed ? await getFile(sb, v.signed.signaturePath) : null;
  return statementPdf({
    number: s.number,
    version: v,
    resident: await residentParticulars(sb, residentId),
    brachtia: { name: signatory?.name ?? "", signature: signatory?.token ? await loadSignatureImage(sb, signatory.token) : null },
    residentSigned: v.signed && sig ? { name: v.signed.typedName, date: day(v.signed.at), signature: sig } : undefined,
    photos,
    refund: withRefund ? s.refund : undefined,
  });
}
