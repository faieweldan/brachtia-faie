/* eslint-disable @typescript-eslint/no-explicit-any */
import { company, formatDate, formatRM } from "@/data/properties";
import qrAsset from "@/assets/duitnow-qr.jpg.asset.json";

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
};

export type InvoiceItem = { label: string; kind: string; amount: number };

export type InvoiceDoc = {
  number: string;
  issued_at?: string | null;
  reference?: string | null;
  full_name: string;
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
  total: number;
  deposits_total: number;
  notes?: string;
  items: InvoiceItem[];
};

const FREQ_LABEL: Record<string, string> = {
  bimonthly: "Bi-monthly",
  quarterly: "Quarterly",
  full: "Full term",
  monthly: "Monthly",
};

/** Brachtia mark, same geometry as the quote PDF. */
function drawLogo(doc: any, x: number, y: number, size: number) {
  const s = size / 64;
  const px = (a: number) => x + a * s;
  const py = (b: number) => y + b * s;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(size * 0.05);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.lines([[22 * s, -26 * s], [8 * s, 9 * s]], px(4), py(40));
  doc.lines([[-22 * s, -26 * s], [-12 * s, 14 * s]], px(60), py(40));
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

async function loadQr(): Promise<string | null> {
  try {
    const res = await fetch(qrAsset.url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null as any);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
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
  const M = 44;
  const FOOT = 54;

  const issued = inv.issued_at ? new Date(inv.issued_at) : new Date();
  const band = header(doc, "Invoice", [
    inv.number,
    issued.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
    inv.reference ? `Booking ${inv.reference}` : "",
  ].filter(Boolean) as string[]);

  let y = band + 30;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text(inv.full_name || "Student", M, y);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  y += 12;
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
      ["Residence", inv.residence_name || "—"],
      ["Room", inv.room_name || "—"],
      ["Occupancy", inv.occupancy === "twin" ? "Twin sharing (per pax)" : "Single"],
      ["Tenancy", `${formatDate(inv.tenancy_start ?? "")} — ${formatDate(inv.tenancy_end ?? "")}`],
      ["Monthly rent", formatRM(inv.monthly_rent)],
      ["Payment frequency", FREQ_LABEL[inv.payment_frequency] ?? inv.payment_frequency],
      ...(inv.university ? [["University", inv.university]] : []),
    ],
  });
  y = doc.lastAutoTable.finalY + 18;

  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Initial payment", M, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "grid",
    headStyles: { fillColor: PEACH, textColor: GREEN, fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 4.5, lineColor: [230, 226, 220], lineWidth: 0.5 },
    columnStyles: { 1: { halign: "right", cellWidth: 105 } },
    head: [["Item", "Amount"]],
    body: inv.items.map((l) => [
      l.kind === "refundable" ? `${l.label}  (refundable)` : l.label,
      formatRM(l.amount),
    ]),
    foot: [["Total Initial Payment", formatRM(inv.total)]],
    showFoot: "lastPage",
    footStyles: { fillColor: PEACH, textColor: GREEN, fontStyle: "bold", fontSize: 10, halign: "left" },
    didParseCell: (data: any) => {
      if (data.section === "foot" && data.column.index === 1) data.cell.styles.halign = "right";
    },
  });

  y = doc.lastAutoTable.finalY + 12;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Refundable deposits included: ${formatRM(inv.deposits_total)}`, M, y);
  if (inv.notes) {
    y += 11;
    doc.text(doc.splitTextToSize(inv.notes, W - M * 2), M, y);
    y += 4;
  }

  // Payment details + QR
  y += 20;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Payment details", M, y);

  const qr = await loadQr();
  const qrSize = 108;
  autoTable(doc, {
    startY: y + 6,
    margin: { left: M, right: M + (qr ? qrSize + 16 : 0), bottom: FOOT },
    theme: "plain",
    styles: infoStyles,
    columnStyles: infoCols,
    body: [
      ["Bank name", BANK.name],
      ["Bank address", BANK.address],
      ["Account name", BANK.accountName],
      ["Account no.", BANK.accountNo],
      ["Swift code", BANK.swift],
    ],
  });
  if (qr) {
    try {
      doc.addImage(qr, "JPEG", W - M - qrSize, y + 6, qrSize, qrSize * 1.55, undefined, "FAST");
    } catch {
      /* QR is optional */
    }
  }

  footer(doc, "Payment confirms your booking. Deposits are refundable per the tenancy agreement.");
  return doc;
}

export async function downloadInvoice(inv: InvoiceDoc) {
  const doc = await buildInvoice(inv);
  doc.save(`Brachtia-${inv.number}.pdf`);
}

export async function previewInvoice(inv: InvoiceDoc) {
  const doc = await buildInvoice(inv);
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}

export type ReceiptDoc = {
  number: string;
  issued_at?: string | null;
  invoiceNumber: string;
  full_name: string;
  amount: number;
  balance_after: number;
  method?: string;
  reference?: string;
  paid_on?: string | null;
};

export async function downloadReceipt(rec: ReceiptDoc) {
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
      ["Invoice", rec.invoiceNumber],
      ["Payment date", formatDate(rec.paid_on ?? "")],
      ["Method", rec.method || "—"],
      ["Reference", rec.reference || "—"],
      ["Balance remaining", formatRM(rec.balance_after)],
    ],
  });

  footer(doc, "This receipt is computer generated and valid without signature.");
  doc.save(`Brachtia-${rec.number}.pdf`);
}
