/* eslint-disable @typescript-eslint/no-explicit-any */
import { A4, GREEN, INK, M, MUTED, creditNoteFrame, day, rm, wrap } from "@/lib/credit-note-pdf";
import { CHECKOUT_TYPE_LABEL, checkoutDocKind, checkoutTotals, type CheckoutType } from "@/lib/checkout-types";

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
 *   (the number: CN/CS/00001 - the database's checkout_note_seq, nextNumber)
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
  /** who it was made for, as it says - Payables shows it if the resident is later removed */
  issuedTo?: { name: string; code: string };
  draft: { lines: CheckoutLine[]; notes: string; type?: CheckoutType };
  /** admin made the resident inactive after it was settled */
  inactiveAt?: string;
  versions: CheckoutVersion[];
  refund?: { amount: number; paidOn: string; method: string; reference: string; proofPath: string; recordedAt: string; recordedBy?: string };
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

/*
 * Every read asks storage for a fresh copy (cacheNonce). These records are
 * overwritten in place; on Vercel a read could get the copy cached before the
 * last write, so a reissued version did not show and two statements got the
 * same number, CS/00026 (Dani, 6 Oct 2026).
 */
export async function readStatement(sb: any, residentId: string): Promise<CheckoutStatement | null> {
  const { data } = await sb.storage.from(BUCKET).download(`${base(residentId)}/statement.json`, { cacheNonce: Date.now() });
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
  const { data } = await sb.storage.from(BUCKET).download(path, { cacheNonce: Date.now() });
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/**
 * The next checkout credit note number: CN/CS/00001, its own series from 1
 * (Dani, 14 Oct 2026) - CS on both sides of checkout, CN/CS here and INV/CS
 * when the resident owes. From the database, given once: it was a counter in a
 * Storage file, read then written, so two statements started together could
 * share a number. CS/ numbers given before keep theirs.
 */
export async function nextNumber(sb: any): Promise<string> {
  const { data, error } = await sb.rpc("next_checkout_note_number");
  if (error || !data) throw new Error(`Could not number the checkout statement: ${error?.message ?? "no number"}`);
  return String(data);
}

export const sha256 = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, "0")).join("");

// the same sums the admin card shows - one rule, in checkout-types.ts
export const totals = (deposits: CheckoutDeposit[], lines: CheckoutLine[]) => checkoutTotals(deposits, lines);

/* ---------------------------------------------------------------- the PDF */

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

/** The statement on the shared credit-note frame (credit-note-pdf.ts): the sums, then the signatures and photos. */
export async function statementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const v = input.version;
  const r = input.resident;
  const f = await creditNoteFrame({
    // what it is follows the balance: a refund is a credit note, a balance owed is an invoice
    kind: checkoutDocKind(v.net),
    subtitle: `CHECKOUT STATEMENT · ${CHECKOUT_TYPE_LABEL[v.type ?? "end_of_tenancy"]}`,
    numberLine: `${input.number} · Version ${v.v} · ${day(v.issuedAt)}`,
    facts: [
      ["Resident", `${r.name}${r.code ? ` (${r.code})` : ""}`],
      ["Residence", [r.residence, r.unit].filter(Boolean).join(" · ")],
      ["Room", r.room],
      ["Tenancy", r.tenancyStart && r.tenancyEnd ? `${day(r.tenancyStart)} – ${day(r.tenancyEnd)}` : "—"],
    ],
  });
  const { font, bold, W } = f;

  // a cancellation holds what was paid, not deposits
  const paidIn = v.type === "cancellation";
  f.section(paidIn ? "PAID SO FAR" : "DEPOSITS HELD");
  if (!v.deposits.length) f.row(paidIn ? "Nothing paid" : "No refundable deposits on record", rm(0), { color: MUTED });
  // no sub-lines under the lines - invoice numbers and notes left off (Dani, 6 Oct 2026)
  for (const d of v.deposits) f.row(d.label, rm(d.amount));
  f.row(paidIn ? "Total paid" : "Total deposits held", rm(v.held), { f: bold });
  f.y -= 6;

  f.section("DEDUCTIONS");
  if (!v.lines.length) f.row("No deductions", rm(0), { color: MUTED });
  for (const l of v.lines) f.row(l.label, `- ${rm(l.amount)}`);
  f.row("Total deductions", `- ${rm(v.deducted)}`, { f: bold });
  f.y -= 8;

  f.result(v.net >= 0 ? "REFUND DUE TO RESIDENT" : "BALANCE OWED BY RESIDENT", v.net, v.net >= 0);

  f.notes(v.notes);

  if (input.refund) {
    f.section("REFUND PAID");
    f.row(`Paid ${day(input.refund.paidOn)} by ${input.refund.method}${input.refund.reference ? ` · Ref ${input.refund.reference}` : ""}`, rm(input.refund.amount), {
      f: bold,
    });
    f.y -= 4;
  }

  // agreement and signatures
  f.room(130);
  for (const l of wrap(
    "The Resident has reviewed this statement and agrees to the deposits held, every deduction and the final amount above, in full settlement of the tenancy.",
    font,
    7.5,
    W,
  )) {
    f.text(l, M, f.y, 7.5, font, MUTED);
    f.y -= 10;
  }
  f.y -= 8;
  const blocks = [
    // Brachtia on the left, the resident on the right (Dani, 5 Oct 2026)
    { title: "Brachtia Homes", x: M, name: input.brachtia.name, date: day(v.issuedAt), sig: input.brachtia.signature },
    { title: "Resident", x: A4.w / 2 + 10, name: input.residentSigned?.name ?? "", date: input.residentSigned?.date ?? "", sig: input.residentSigned?.signature ?? null },
  ];
  const top = f.y;
  for (const b of blocks) {
    let yy = top;
    f.text(b.title, b.x, yy - 8, 8.5, bold, GREEN);
    yy -= 46;
    if (b.sig) {
      const img = await f.pdf.embedPng(b.sig);
      const k = Math.min(150 / img.width, 34 / img.height);
      f.page.drawImage(img, { x: b.x, y: yy + 2, width: img.width * k, height: img.height * k });
    }
    f.page.drawLine({ start: { x: b.x, y: yy }, end: { x: b.x + 190, y: yy }, thickness: 0.6, color: INK });
    f.text(`Name: ${b.name || ""}`, b.x, yy - 11, 8);
    f.text(`Date: ${b.date || ""}`, b.x, yy - 22, 8);
  }

  // each deduction's photos, on the pages after - the evidence for it
  const withPhotos = v.lines.filter((l) => l.photos.some((p) => input.photos[p]));
  for (const l of withPhotos) {
    f.page = f.pdf.addPage([A4.w, A4.h]);
    f.y = A4.h - M;
    f.text(`Photos - ${l.label}`, M, f.y - 10, 11, bold, GREEN);
    let gy = f.y - 30;
    const cell = (W - 12) / 2;
    let i = 0;
    for (const p of l.photos) {
      const bytes = input.photos[p];
      if (!bytes) continue;
      const img = bytes[0] === 0x89 ? await f.pdf.embedPng(bytes) : await f.pdf.embedJpg(bytes);
      const k = Math.min(cell / img.width, 300 / img.height);
      const x = M + (i % 2) * (cell + 12);
      if (i && i % 2 === 0) gy -= 312;
      if (gy - 300 < M + 40) {
        f.page = f.pdf.addPage([A4.w, A4.h]);
        gy = A4.h - M;
      }
      f.page.drawImage(img, { x, y: gy - img.height * k, width: img.width * k, height: img.height * k });
      i++;
    }
  }

  return f.finish(`${input.number} v${v.v}`);
}

/** What the PDF says about the resident and their stay, read as it is now. */
export async function residentParticulars(sb: any, residentId: string) {
  const { data: res } = await sb.from("residents").select("full_name, resident_code").eq("id", residentId).maybeSingle();
  // their bed now, or - once they have left and the next resident has it - the
  // one their tenancy kept, so the statement never shows the next person's room
  const { placementForResident } = await import("@/lib/placement.server");
  const placed = await placementForResident(sb, residentId);
  const bed = placed?.bed ?? null;
  const rm2 = placed?.room ?? null;
  const un = placed?.unit ?? null;
  const rs = placed?.residence ?? null;
  const { data: ag } = await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1);
  const { data: doc } = ag?.length
    ? await sb.from("agreement_documents").select("period_start, period_end").eq("agreement_id", ag[0].id).eq("doc_type", "agreement").order("version", { ascending: false }).limit(1)
    : { data: null };
  return {
    name: String(res?.full_name ?? ""),
    code: String(res?.resident_code ?? ""),
    residence: String(rs?.name ?? ""),
    unit: String(un?.unit_no ?? ""),
    // as sold: a twin room let whole is a single (placement.ts soldBedLabel)
    room: [rm2?.letter ? `Room ${rm2.letter}` : "", bed ? (await import("@/lib/placement")).soldBedLabel(rm2, bed, placed?.letWhole) : ""].filter(Boolean).join(", "),
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
