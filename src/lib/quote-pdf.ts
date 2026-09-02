import {
  company,
  formatDate,
  formatRM,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomType,
  type StayQuote,
} from "@/data/properties";

const GREEN: [number, number, number] = [26, 71, 52];
const PEACH: [number, number, number] = [250, 240, 231];
const MUTED: [number, number, number] = [110, 110, 105];

const PDF_PHONE = "+6012 330 6815";

/** Brachtia mark: same geometry as Logo.tsx, drawn in a 64x64 box. */
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
  const squares: [number, number][] = [
    [26, 34],
    [34, 34],
    [26, 42],
    [34, 42],
  ];
  for (const [rx, ry] of squares) {
    doc.rect(px(rx), py(ry), 5 * s, 5 * s);
  }
}

export type QuoteInput = {
  property: Property;
  room: RoomType;
  occupancy: Occupancy;
  term: ContractTerm;
  moveIn: string;
  moveOut: string;
  quote: StayQuote;
  reference?: string;
  lead?: {
    name: string;
    university: string;
    intake: string;
    nationality: string;
    gender: string;
    email: string;
    mobile: string;
  };
};

export async function downloadStayQuote(input: QuoteInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Render at progressively tighter scales until everything fits on one page.
  const scales = [1, 0.92, 0.85, 0.78, 0.72, 0.66];
  let doc: any = null;
  for (const s of scales) {
    doc = build(jsPDF, autoTable, input, s);
    if (doc.getNumberOfPages() === 1) break;
  }

  const safe = (str: string) => str.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  doc.save(
    input.reference
      ? `Brachtia-Quote-${safe(input.reference)}.pdf`
      : `Brachtia-Quote-${safe(input.property.name)}-${safe(input.room.name)}-${input.moveIn}.pdf`,
  );
}

function build(
  jsPDF: any,
  autoTable: any,
  { property, room, occupancy, term, moveIn, moveOut, quote, lead, reference }: QuoteInput,
  k: number,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const FOOT = 54;
  const g = (n: number) => n * k; // scaled gaps / font sizes

  // Header band
  const band = g(72);
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, band, "F");
  const tile = g(38);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, (band - tile) / 2, tile, tile, g(8), g(8), "F");
  drawLogo(doc, M + tile * 0.17, (band - tile) / 2 + tile * 0.17, tile * 0.66);

  const tx = M + tile + g(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(g(14));
  doc.text(company.name, tx, band / 2 - g(8));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(g(8));
  doc.text(company.tagline, tx, band / 2 + g(4));
  doc.text(`${company.email}  ·  WhatsApp ${PDF_PHONE}`, tx, band / 2 + g(15));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(g(10));
  doc.text("Stay quote", W - M, band / 2 - g(4), { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(g(8));
  doc.text(
    new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
    W - M,
    band / 2 + g(8),
    { align: "right" },
  );
  if (reference) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(g(8));
    doc.text(`Ref ${reference}`, W - M, band / 2 + g(19), { align: "right" });
  }

  // Listing summary
  let y = band + g(30);
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(g(13.5));
  doc.text(property.name, M, y);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(g(8.5));
  y += g(12);
  doc.text(property.location, M, y);
  y += g(12);

  const rowPad = { top: g(1.8), bottom: g(1.8), left: 0, right: 0 };
  const infoStyles = {
    fontSize: g(8.5),
    cellPadding: rowPad,
  };
  const infoCols = {
    0: { cellWidth: g(112), textColor: MUTED },
    1: { fontStyle: "bold" as const, textColor: [30, 30, 30] as [number, number, number] },
  };

  if (lead) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: FOOT },
      theme: "plain",
      styles: infoStyles,
      columnStyles: infoCols,
      body: [
        ["Prepared for", lead.name],
        ["University", `${lead.university}  ·  Intake ${lead.intake}`],
        ["Nationality", `${lead.nationality}  ·  ${lead.gender}`],
        ["Contact", `${lead.email}  ·  ${lead.mobile}`],
      ],
    });
    y = doc.lastAutoTable.finalY + g(8);
    doc.setDrawColor(230, 226, 220);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += g(8);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "plain",
    styles: infoStyles,
    columnStyles: infoCols,
    body: [
      ["Room type", `${room.unitType} · ${room.name}`],
      ["Occupancy", occupancy === "single" ? "Single" : "Twin sharing (per pax)"],
      [
        "Room details",
        [
          room.sizeLabel,
          room.bathroom === "ensuite" ? "Private ensuite" : "Shared bathroom",
          room.hasView ? `With view${room.viewType ? ` (${room.viewType})` : ""}` : "Internal facing",
        ]
          .filter(Boolean)
          .join(" · "),
      ],
      ["Move in", formatDate(moveIn)],
      ["Move out", formatDate(moveOut)],
      ["Contract term", term === "long" ? "12-month stay" : "Short-term stay"],
      ["Monthly rate", `${formatRM(quote.rent)} / month  (${quote.days} days total)`],
    ],
  });

  y = doc.lastAutoTable.finalY + g(18);

  // Due before move-in
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(g(10.5));
  doc.text("Due before move-in", M, y);
  y += g(6);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOT },
    theme: "grid",
    headStyles: { fillColor: PEACH, textColor: GREEN, fontStyle: "bold", fontSize: g(8.5) },
    styles: {
      fontSize: g(8.5),
      cellPadding: g(4.5),
      lineColor: [230, 226, 220],
      lineWidth: 0.5,
    },
    columnStyles: { 1: { halign: "right", cellWidth: g(105) } },
    head: [["Item", "Amount"]],
    body: quote.firstPayment.map((l) => [
      l.kind === "refundable" ? `${l.label}  (refundable)` : l.label,
      formatRM(l.amount),
    ]),
    foot: [["Total to pay now", formatRM(quote.totalUpfront)]],
    showFoot: "lastPage",
    footStyles: {
      fillColor: PEACH,
      textColor: GREEN,
      fontStyle: "bold",
      fontSize: g(10),
      halign: "left",
    },
    didParseCell: (data: any) => {
      if (data.section === "foot" && data.column.index === 1) data.cell.styles.halign = "right";
    },
  });

  y = doc.lastAutoTable.finalY + g(11);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(g(8));
  doc.text(
    `Then ${formatRM(quote.monthlyAfter)}/month. Booking fee ${company.bookingFee} is offset against your first payment.`,
    M,
    y,
  );

  // Terms & conditions
  if (property.terms.length > 0) {
    y += g(18);
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(g(10.5));
    doc.text("Terms & conditions", M, y);

    autoTable(doc, {
      startY: y + g(6),
      margin: { left: M, right: M, bottom: FOOT },
      theme: "plain",
      styles: {
        fontSize: g(8),
        cellPadding: { top: g(1.4), bottom: g(1.4), left: 0, right: 0 },
        textColor: [60, 60, 58],
        valign: "top",
      },
      columnStyles: { 0: { cellWidth: g(16), textColor: MUTED }, 1: { cellWidth: "auto" } },
      body: property.terms.map((t, i) => [`${i + 1}.`, t]),
    });
  }

  // Footer on every page (normally just one)
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(230, 226, 220);
    doc.setLineWidth(0.5);
    doc.line(M, H - 46, W - M, H - 46);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      [
        `${company.legalName} · ${company.registration}`,
        company.address,
        "Indicative quote — subject to availability and final tenancy agreement.",
      ],
      M,
      H - 35,
    );
    doc.text("brachtiahomes.com", W - M, H - 35, { align: "right" });
  }

  return doc;
}
