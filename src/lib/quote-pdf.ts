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

export async function downloadStayQuote({
  property,
  room,
  occupancy,
  term,
  moveIn,
  moveOut,
  quote,
  lead,
}: QuoteInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 44;

  // Header
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 96, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 24, 48, 48, 10, 10, "F");
  drawLogo(doc, M + 8, 32, 32);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(company.name, M + 62, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(company.tagline, M + 62, 60);
  doc.text(`${company.email}  ·  WhatsApp +${company.whatsapp}`, M + 62, 73);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Stay quote", W - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
    W - M,
    60,
    { align: "right" },
  );

  // Listing summary
  let y = 128;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(property.name, M, y);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  y += 14;
  doc.text(property.location, M, y);
  y += 18;

  if (lead) {
    const leadRows: [string, string][] = [
      ["Prepared for", lead.name],
      ["University", `${lead.university}  ·  Intake ${lead.intake}`],
      ["Nationality", `${lead.nationality}  ·  ${lead.gender}`],
      ["Contact", `${lead.email}  ·  ${lead.mobile}`],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 84 },
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 0, right: 0 } },
      columnStyles: {
        0: { cellWidth: 120, textColor: MUTED },
        1: { fontStyle: "bold", textColor: [30, 30, 30] },
      },
      body: leadRows,
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  const details: [string, string][] = [
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
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 84 },
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 120, textColor: MUTED },
      1: { fontStyle: "bold", textColor: [30, 30, 30] },
    },
    body: details,
  });

  y = (doc as any).lastAutoTable.finalY + 24;

  // Due before move-in
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Due before move-in", M, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 84 },
    theme: "grid",
    headStyles: { fillColor: PEACH, textColor: GREEN, fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 9.5, cellPadding: 6, lineColor: [230, 226, 220], lineWidth: 0.5 },
    columnStyles: { 1: { halign: "right", cellWidth: 110 } },
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
      fontSize: 11,
      halign: "left",
    },
    didParseCell: (data: any) => {
      if (data.section === "foot" && data.column.index === 1) data.cell.styles.halign = "right";
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `Then ${formatRM(quote.monthlyAfter)}/month. Booking fee ${company.bookingFee} is offset against your first payment.`,
    M,
    y,
  );

  // Terms & conditions
  if (property.terms.length > 0) {
    y += 24;
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Terms & conditions", M, y);

    autoTable(doc, {
      startY: y + 8,
      margin: { left: M, right: M, bottom: 84 },
      theme: "plain",
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 0, right: 0 },
        textColor: [60, 60, 58],
        valign: "top",
      },
      columnStyles: { 0: { cellWidth: 18, textColor: MUTED }, 1: { cellWidth: "auto" } },
      body: property.terms.map((t, i) => [`${i + 1}.`, t]),
    });
  }

  // Footer
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(230, 226, 220);
    doc.setLineWidth(0.5);
    doc.line(M, H - 62, W - M, H - 62);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      [
        `${company.legalName} · ${company.registration}`,
        company.address,
        "Indicative quote — subject to availability and final tenancy agreement.",
      ],
      M,
      H - 48,
    );
    doc.text("brachtiahomes.com", W - M, H - 48, { align: "right" });
  }

  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  doc.save(`Brachtia-Quote-${safe(property.name)}-${safe(room.name)}-${moveIn}.pdf`);
}
