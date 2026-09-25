/* eslint-disable @typescript-eslint/no-explicit-any */
import { company, formatDate, formatRM } from "@/data/properties";
import { nextRentalPayment, cycleEnd } from "@/lib/rental-schedule";
import { stayLength } from "@/lib/stay-length";
import { lineQty } from "@/lib/invoices";

const GREEN: [number, number, number] = [26, 71, 52];
const PEACH: [number, number, number] = [250, 240, 231];
const MUTED: [number, number, number] = [110, 110, 105];

const PDF_PHONE = "+6012 330 6815";

export const BANK = {
  name: "RHB Bank Berhad",
  address:
    "No. 1, Jalan Anggerik Vanilla X31/X, Kota Kemuning, Section 31, 40460 Shah Alam, Selangor, Malaysia",
  accountName: "BRACHTIA MAJU RESOURCES PLT",
  accountNo: "2126-0200-0280-57",
  swift: "RHBBMYKL",
  // stated rather than left off: an overseas payer looking for it and finding
  // nothing assumes the invoice is incomplete and writes to ask
  iban: "Not applicable for Malaysian bank accounts",
};

/** amount is the price of one; the line is worth quantity x amount. */
export type InvoiceItem = { label: string; kind: string; amount: number; quantity?: number };

export type InvoiceDoc = {
  number: string;
  issued_at?: string | null;
  invoice_date?: string | null;
  payment_terms?: string;
  due_date?: string | null;
  reference?: string | null;
  full_name: string;
  /** the ID the resident goes by - their resident ID, or the Brachtia ID they kept */
  resident_code?: string;
  email: string;
  phone: string;
  university?: string;
  nationality?: string;
  residence_name: string;
  room_name: string;
  occupancy: string;
  tenancy_start?: string | null;
  tenancy_end?: string | null;
  monthly_rent: number;
  payment_frequency: string;
  /** what the invoice is - it decides whether the rental terms are stated at all */
  kind?: "initial" | "rental" | "charge" | "checkout";
  total: number;
  deposits_total: number;
  notes?: string;
  items: InvoiceItem[];
  /** paid to date - the booking fee first. Shown with the balance when above zero */
  paid?: number;
  /** what the invoice is for - "Rental", "Charges". The initial payment by default */
  heading?: string;
  /** the period a rental invoice covers, already written out */
  period?: string;
  /** print the standard terms, and what falls due next - Lav, 21 Sept 2026 */
  show_terms?: boolean;
  next_payment_date?: string | null;
  next_payment_amount?: number | null;
  /** the rent before its discount, what came off ("20%"), and why - Lav, 17 Sept 2026 */
  list_rent?: number | null;
  discount_label?: string;
  discount_note?: string;
};

const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly",
  bimonthly: "Bi-monthly",
  quarterly: "Quarterly",
  semiannual: "Semi-annually",
  annual: "Annually",
  full: "Full term",
};

/** Initial invoices use the advance-rent ledger, never a period guessed backwards. */
export function invoiceNextPayment(inv: InvoiceDoc) {
  if (!inv.kind || inv.kind === "initial") {
    return nextRentalPayment({
      tenancyStart: inv.tenancy_start ?? "",
      tenancyEnd: inv.tenancy_end ?? "",
      frequency: inv.payment_frequency,
      monthlyRent: inv.monthly_rent,
      items: inv.items,
    });
  }
  if (!inv.next_payment_date || !inv.next_payment_amount) return null;
  const start = `${inv.next_payment_date.slice(0, 8)}01`;
  return {
    start,
    end: cycleEnd(start, inv.payment_frequency, inv.tenancy_end ?? ""),
    due: inv.next_payment_date,
    amount: inv.next_payment_amount,
  };
}

/** Brachtia mark, same geometry as the quote PDF. */
function drawLogo(doc: any, x: number, y: number, size: number) {
  const s = size / 64;
  const px = (a: number) => x + a * s;
  const py = (b: number) => y + b * s;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(size * 0.05);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.lines(
    [
      [22 * s, -26 * s],
      [8 * s, 9 * s],
    ],
    px(4),
    py(40),
  );
  doc.lines(
    [
      [-22 * s, -26 * s],
      [-12 * s, 14 * s],
    ],
    px(60),
    py(40),
  );
  doc.setLineWidth(size * 0.032);
  for (const [rx, ry] of [
    [26, 34],
    [34, 34],
    [26, 42],
    [34, 42],
  ] as [number, number][]) {
    doc.rect(px(rx), py(ry), 5 * s, 5 * s);
  }
}

function header(doc: any, title: string, right: string[]) {
  const W = doc.internal.pageSize.getWidth();
  const M = 44;
  const band = 72;
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, band, "F");
  const tile = 38;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, (band - tile) / 2, tile, tile, 8, 8, "F");
  drawLogo(doc, M + tile * 0.17, (band - tile) / 2 + tile * 0.17, tile * 0.66);

  const tx = M + tile + 14;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(company.name, tx, band / 2 - 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(company.tagline, tx, band / 2 + 4);
  doc.text(`${company.email}  ·  WhatsApp ${PDF_PHONE}`, tx, band / 2 + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, W - M, band / 2 - 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  right.forEach((line, i) => {
    doc.text(line, W - M, band / 2 + 2 + i * 11, { align: "right" });
  });
  return band;
}

function footer(doc: any, note: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(230, 226, 220);
    doc.setLineWidth(0.5);
    doc.line(M, H - 46, W - M, H - 46);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text([`${company.legalName} · ${company.registration}`, company.address, note], M, H - 35);
    doc.text("brachtiahomes.com", W - M, H - 35, { align: "right" });
  }
}

async function buildInvoice(inv: InvoiceDoc) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc: any = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const FOOT = 54;

  /*
   * Numbered paragraphs with some words set in bold.
   *
   * autoTable draws a cell in one font, so the sums and the deadlines could not
   * be picked out inside a sentence - which is the whole reason a resident
   * comes back to this page. Drawn by hand instead: every word is measured,
   * the line wraps at the margin, the font changes where the emphasis does,
   * and a line that would cross the footer starts a new page. Wrapped lines sit
   * under the text rather than under the number, so the block reads as a list.
   *
   * Returns where it finished, so what follows can be placed after it.
   */
  const drawSpans = (
    paras: { text: string; bold?: boolean }[][],
    opts: { y: number; size: number; numbered?: boolean; gap: number },
  ) => {
    const indent = opts.numbered ? 16 : 0;
    const left = M + indent;
    const right = W - M;
    const lineH = opts.size * 1.35;
    let y = opts.y;

    doc.setFontSize(opts.size);
    doc.setTextColor(60, 60, 58);

    paras.forEach((spans, i) => {
      // every word with the font it is set in, whitespace kept so it can break
      const words: { text: string; bold: boolean }[] = [];
      for (const span of spans) {
        for (const piece of span.text.split(/(\s+)/)) {
          if (piece) words.push({ text: piece, bold: Boolean(span.bold) });
        }
      }

      let line: { text: string; bold: boolean }[] = [];
      let lineW = 0;
      let first = true;

      const flush = () => {
        if (!line.length) return;
        if (y + lineH > H - FOOT) {
          doc.addPage();
          y = M + 20;
        }
        let x = left;
        if (first && opts.numbered) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...MUTED);
          doc.text(`${i + 1}.`, M, y);
          doc.setTextColor(60, 60, 58);
        }
        for (const w of line) {
          doc.setFont("helvetica", w.bold ? "bold" : "normal");
          doc.text(w.text, x, y);
          x += doc.getTextWidth(w.text);
        }
        y += lineH;
        line = [];
        lineW = 0;
        first = false;
      };

      for (const w of words) {
        doc.setFont("helvetica", w.bold ? "bold" : "normal");
        const width = doc.getTextWidth(w.text);
        // a space that falls at the end of a line is dropped, not carried down
        if (lineW + width > right - left && line.length) {
          flush();
          if (!w.text.trim()) continue;
        }
        line.push({ text: w.text, bold: w.bold });
        lineW += width;
      }
      flush();
      y += opts.gap;
    });

    return y - opts.gap;
  };

  const issued = inv.issued_at ? new Date(inv.issued_at) : new Date();
  const invDate = inv.invoice_date ? new Date(inv.invoice_date) : issued;
  const terms = inv.payment_terms || "NET15";
  const termDays = Number(/NET\s*(\d+)/i.exec(terms)?.[1] ?? 15);
  const due = inv.due_date
    ? new Date(inv.due_date)
    : new Date(invDate.getTime() + termDays * 86400000);
  const band = header(
    doc,
    "Invoice",
    [
      inv.number,
      `Invoice date: ${invDate.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}`,
      `Due date: ${due.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })} (${terms})`,
      inv.reference ? `Booking ${inv.reference}` : "",
    ].filter(Boolean) as string[],
  );

  let y = band + 30;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text(inv.full_name || "Student", M, y);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y += 12;
  // the resident ID used to sit here, in the grey line - it is a row in the
  // details below now, where it is read rather than skimmed past
  doc.text([inv.email, inv.phone].filter(Boolean).join("  ·  "), M, y);
  y += 14;

  const infoStyles = { fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 0, right: 0 } };
  const infoCols = {
    0: { cellWidth: 112, textColor: MUTED },
    1: { fontStyle: "bold" as const, textColor: [30, 30, 30] as [number, number, number] },
  };

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "plain",
    styles: infoStyles,
    columnStyles: infoCols,
    body: [
      // who the invoice is for comes before what they are renting - and it is a
      // row of its own, not a word in the grey line under the name, because it
      // is the number accounts match a payment back to. Their resident ID, or
      // the Brachtia ID they kept when they have no new one - Lav, 21 Sept 2026
      ...(inv.resident_code ? [["Resident ID", inv.resident_code]] : []),
      ["Residence", inv.residence_name || "—"],
      ["Room", inv.room_name || "—"],
      ["Occupancy", inv.occupancy === "twin" ? "Twin sharing (per pax)" : "Single"],
      [
        "Tenancy",
        // how long the stay runs, the way Stay details and the quote say it
        `${formatDate(inv.tenancy_start ?? "")} — ${formatDate(inv.tenancy_end ?? "")}  (${stayLength(
          inv.tenancy_start,
          inv.tenancy_end,
        )})`,
      ],
      // the rental terms - what the rent is, and how often it is paid. A charge
      // for a broken air conditioner is not rent and is not on a cycle, so they
      // are left off it entirely rather than printed as blanks - Lav, 21 Sept 2026
      ...(inv.kind === "charge" || inv.kind === "checkout"
        ? []
        : [
            ["Monthly rent", formatRM(inv.monthly_rent)],
            // the rent above prices the whole invoice; this says what was taken
            // off the set price to reach it, and why
            ...(inv.list_rent && inv.discount_label
              ? [
                  [
                    "Discount",
                    `${inv.discount_label} off ${formatRM(inv.list_rent)}${inv.discount_note ? ` · ${inv.discount_note}` : ""}`,
                  ],
                ]
              : []),
            ["Payment frequency", FREQ_LABEL[inv.payment_frequency] ?? inv.payment_frequency],
          ]),
      /*
       * The date the money is due, not the jargon for it. "NET105" is a term of
       * trade nobody outside accounts reads as a date, and the due date was
       * already printed in the band above - so this row said the same thing
       * twice, in its least readable form. Same formatting as the band, so one
       * invoice never prints one date two ways.
       */
      [
        "Invoice due date",
        due.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
      ],
      ...(inv.period ? [["Period", inv.period]] : []),
      ...(inv.university ? [["University", inv.university]] : []),
    ],
  });
  y = doc.lastAutoTable.finalY + 18;

  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(inv.heading ?? "Initial payment", M, y);
  y += 6;

  /*
   * How many, and the price of one, are only asked on an additional charge -
   * two damaged chairs, three months of a fee. Rent and the initial payment are
   * each one thing at one price, so those two columns would print "1" and then
   * the same amount twice on every line, which reads like a mistake.
   *
   * Unless one of them is not one thing. Two months of advance rent billed as a
   * single line has to say "2 x RM1,050", or the student is shown a figure twice
   * the rent they agreed with nothing on the paper explaining it.
   */
  const itemised =
    inv.kind === "charge" ||
    inv.kind === "checkout" ||
    inv.items.some((l) => lineQty(l.quantity) > 1);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "grid",
    headStyles: { fillColor: PEACH, textColor: GREEN, fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 4.5, lineColor: [230, 226, 220], lineWidth: 0.5 },
    // how an invoice is normally read: what it is, how many, the price of one,
    // and what that comes to
    columnStyles: itemised
      ? {
          1: { halign: "right", cellWidth: 40 },
          2: { halign: "right", cellWidth: 86 },
          3: { halign: "right", cellWidth: 96 },
        }
      : { 1: { halign: "right", cellWidth: 96 } },
    head: itemised ? [["Item", "Qty", "Unit price", "Amount"]] : [["Item", "Amount"]],
    body: inv.items.map((l) => {
      const many = lineQty(l.quantity);
      const label = l.kind === "refundable" ? `${l.label}  (refundable)` : l.label;
      // the line is still worth quantity x amount whether or not it is shown
      return itemised
        ? [label, String(many), formatRM(l.amount), formatRM(l.amount * many)]
        : [label, formatRM(l.amount * many)];
    }),
    foot: [
      itemised
        ? [
            inv.heading ? `Total ${inv.heading}` : "Total Initial Payment",
            "",
            "",
            formatRM(inv.total),
          ]
        : [inv.heading ? `Total ${inv.heading}` : "Total Initial Payment", formatRM(inv.total)],
    ],
    showFoot: "lastPage",
    footStyles: {
      fillColor: PEACH,
      textColor: GREEN,
      fontStyle: "bold",
      fontSize: 10,
      halign: "left",
    },
    didParseCell: (data: any) => {
      // the total sits in the last column, whichever shape the table took
      const lastCol = itemised ? 3 : 1;
      if (data.section === "foot" && data.column.index === lastCol)
        data.cell.styles.halign = "right";
    },
  });

  y = doc.lastAutoTable.finalY + 12;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  /*
   * Deposits are taken once, on the initial payment. Rent and additional
   * charges carry none, so this printed "RM0.00" on every one of them and
   * invited the question of which deposit was meant.
   */
  const showsDeposits = !inv.kind || inv.kind === "initial";
  if (showsDeposits) {
    doc.text(`Refundable deposits included: ${formatRM(inv.deposits_total)}`, M, y);
  }
  // the same invoice, updated as money comes in: what is paid, and what is left
  if (inv.paid && inv.paid > 0) {
    // only leave room for the line above when there actually was one
    if (showsDeposits) y += 16;
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`Paid to date: ${formatRM(inv.paid)}`, M, y);
    y += 13;
    doc.text(`Balance due: ${formatRM(Math.max(inv.total - inv.paid, 0))}`, M, y);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
  }
  if (inv.notes) {
    y += 11;
    doc.text(doc.splitTextToSize(inv.notes, W - M * 2), M, y);
    y += 4;
  }

  /*
   * The terms, then how to pay. The terms set out what the money buys and what
   * happens if the stay ends early, so they are read before the account number
   * rather than after it - they run onto a second page now, and the bank
   * details go with them, which is the order asked for.
   *
   * autoTable rather than hand-drawn text throughout, so a clause that runs
   * long wraps and carries onto the next page instead of printing over the
   * footer.
   */
  if (inv.show_terms) {
    const { INVOICE_TERM_SPANS, INVOICE_TERMS_HEADING } = await import("@/lib/invoice-terms");
    y += 20;

    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(INVOICE_TERMS_HEADING, M, y);

    y = drawSpans(INVOICE_TERM_SPANS, { y: y + 14, size: 7.5, numbered: true, gap: 6 });
  }

  /*
   * Each block below carries its heading inside its own table and is told not
   * to break across pages.
   *
   * Drawn as loose text with a table after it, a heading printed at the foot of
   * one page and its rows on the next: "Payment Details" on one page and the
   * account number on another, which is the one thing here nobody should have
   * to hunt for. A block that will not fit now moves whole to the next page.
   */
  const heading = (size: number) => ({
    fillColor: false as never,
    textColor: GREEN,
    fontStyle: "bold" as const,
    fontSize: size,
    cellPadding: { top: 0, bottom: 6, left: 0, right: 0 },
  });

  autoTable(doc, {
    startY: y + 22,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "plain",
    styles: infoStyles,
    columnStyles: infoCols,
    pageBreak: "avoid",
    head: [[{ content: "Payment Details", colSpan: 2 }]],
    headStyles: heading(10.5),
    body: [
      ["Bank", BANK.name],
      ["Account Name", BANK.accountName],
      ["Account No.", BANK.accountNo],
      ["SWIFT Code", BANK.swift],
      ["IBAN", BANK.iban],
      ["Payment Reference", "Invoice Number or Resident ID"],
      ["Proof of Payment", `Submit via WhatsApp to ${PDF_PHONE}`],
    ],
  });

  // what the payer carries, and what they get back
  const { CURRENCY_NOTE_SPANS, CURRENCY_NOTE_HEADING } = await import("@/lib/invoice-terms");
  y = doc.lastAutoTable.finalY + 18;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(CURRENCY_NOTE_HEADING, M, y);
  y = drawSpans(CURRENCY_NOTE_SPANS, { y: y + 14, size: 7.5, gap: 8 });

  // what falls due next - the lines that save the follow-up call
  const next = invoiceNextPayment(inv);
  const nextRows = next
    ? [
        ["Next Billing Period", `${formatDate(next.start)} — ${formatDate(next.end)}`],
        ["Next Payment Due", formatDate(next.due)],
        ["Next Payment Amount", formatRM(next.amount)],
      ]
    : [];
  if (nextRows.length) {
    autoTable(doc, {
      // where the currency note finished - it is drawn by hand, so the last
      // TABLE to finish is the payment details above it, and reading that would
      // start this one back up the page on top of the note
      startY: y + 20,
      margin: { left: M, right: M, bottom: FOOT },
      theme: "plain",
      styles: infoStyles,
      columnStyles: infoCols,
      pageBreak: "avoid",
      head: [[{ content: "After Full Initial Payment & Tenancy Agreement Signing", colSpan: 2 }]],
      headStyles: heading(9.5),
      body: nextRows,
    });
  }

  footer(doc, "Payment confirms your booking. Deposits are refundable per the tenancy agreement.");
  return doc;
}

export async function downloadInvoice(inv: InvoiceDoc) {
  const doc = await buildInvoice(inv);
  doc.save(`Brachtia-${inv.number}.pdf`);
}

/**
 * The invoice as a PDF link that lives in this browser tab only, for showing it
 * inside the system instead of downloading it. Revoke it once it is closed.
 */
export async function invoicePdfUrl(inv: InvoiceDoc) {
  const doc = await buildInvoice(inv);
  return URL.createObjectURL(doc.output("blob"));
}

export type ReceiptDoc = {
  number: string;
  issued_at?: string | null;
  invoiceNumber: string;
  full_name: string;
  /** the ID the resident goes by */
  resident_code?: string;
  amount: number;
  balance_after: number;
  method?: string;
  reference?: string;
  paid_on?: string | null;
  /** what the money was for - "Booking fee" */
  description?: string;
  /** paid on the invoice once this payment was in - older receipts have none */
  paid_to_date?: number | null;
};

async function buildReceipt(rec: ReceiptDoc) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc: any = new jsPDF({ unit: "pt", format: "a4" });
  const M = 44;

  const issued = rec.issued_at ? new Date(rec.issued_at) : new Date();
  const band = header(doc, "Payment receipt", [
    rec.number,
    issued.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
  ]);

  let y = band + 30;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text(`${formatRM(rec.amount)} received`, M, y);
  y += 16;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 54 },
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 112, textColor: MUTED },
      1: { fontStyle: "bold" as const, textColor: [30, 30, 30] as [number, number, number] },
    },
    body: [
      ["Received from", rec.full_name || "—"],
      ...(rec.resident_code ? [["Resident ID", rec.resident_code]] : []),
      ...(rec.description ? [["For", rec.description]] : []),
      ["Invoice", rec.invoiceNumber],
      ["Payment date", formatDate(rec.paid_on ?? "")],
      ["Method", rec.method || "—"],
      ["Reference", rec.reference || "—"],
      ...(rec.paid_to_date != null ? [["Paid to date", formatRM(rec.paid_to_date)]] : []),
      ["Balance remaining", formatRM(rec.balance_after)],
    ],
  });

  footer(doc, "This receipt is computer generated and valid without signature.");
  return doc;
}

/**
 * Several PDFs as one, in the order given.
 *
 * A part that cannot be read is left out rather than losing the rest with it -
 * a receipt whose slip is missing must still open, because a document that
 * refuses to open at all is worse than one without its slip.
 */
async function stitch(parts: Array<() => Promise<ArrayBuffer>>) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const part of parts) {
    try {
      const src = await PDFDocument.load(await part());
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
    } catch {
      /* one unreadable part must not cost the others */
    }
  }
  const bytes = await out.save();
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

/** A slip as pages: a PDF goes in whole, a photo gets a page made for it. */
const proofPart = (proof: ProofFile, rec: ReceiptDoc) => async () =>
  /pdf/i.test(proof.type) || /\.pdf$/i.test(proof.name)
    ? await proof.blob.arrayBuffer()
    : ((await buildProofPage(proof, rec)).output("arraybuffer") as ArrayBuffer);

/**
 * The receipt as a PDF link, the same way as invoicePdfUrl - with the slip it
 * was paid with on the pages after it.
 *
 * A receipt and its proof were two files to open and two things to send. They
 * are one document: the money received, then the evidence of it.
 */
export async function receiptPdfUrl(rec: ReceiptDoc, proof?: ProofFile | null) {
  const doc = await buildReceipt(rec);
  if (!proof) return URL.createObjectURL(doc.output("blob"));
  return stitch([async () => doc.output("arraybuffer") as ArrayBuffer, proofPart(proof, rec)]);
}

/** A payment proof as it was uploaded - a photo of the bank slip, or a PDF. */
export type ProofFile = { name: string; type: string; blob: Blob };

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });
}

/** The proof photo on its own page, fitted to the paper and kept in proportion. */
async function buildProofPage(proof: ProofFile, rec: ReceiptDoc) {
  const { jsPDF } = await import("jspdf");
  const doc: any = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;

  const band = header(doc, "Proof of payment", [rec.number, formatDate(rec.paid_on ?? "")]);
  const url = await dataUrlOf(proof.blob);
  const props = doc.getImageProperties(url);
  const top = band + 30;
  // whichever runs out first - the width or the height - decides the scale
  const scale = Math.min((W - M * 2) / props.width, (H - top - 54) / props.height);
  const w = props.width * scale;
  const h = props.height * scale;
  doc.addImage(url, W / 2 - w / 2, top, w, h, undefined, "FAST");

  footer(doc, "The bank slip as the student sent it.");
  return doc;
}

/**
 * One document for the welcome message: the updated invoice, then EVERY receipt
 * with the slip it was paid with after it - so the student opens a single file
 * and scrolls through the lot instead of juggling attachments.
 *
 * Every receipt, because a booking fee is often paid in parts: RM400 today and
 * RM100 on Friday is two receipts and two slips, and sending only the last of
 * them showed RM100 against a fee of RM500 and left the student looking for the
 * rest. Each receipt is followed by its own proof, so the pairs stay together
 * however many there are.
 */
export async function welcomePackPdfUrl(pack: {
  invoice: InvoiceDoc;
  receipts: { receipt: ReceiptDoc; proof?: ProofFile | null }[];
}) {
  return stitch([
    async () => (await buildInvoice(pack.invoice)).output("arraybuffer") as ArrayBuffer,
    ...pack.receipts.flatMap(({ receipt, proof }) => [
      async () => (await buildReceipt(receipt)).output("arraybuffer") as ArrayBuffer,
      ...(proof ? [proofPart(proof, receipt)] : []),
    ]),
  ]);
}
