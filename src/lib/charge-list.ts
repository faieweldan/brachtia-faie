/**
 * Schedule B, clause 11 - Additional Charges (House Rules, Sept 2026). Picked
 * from a list on an additional-charge invoice and a checkout deduction (Dani,
 * 2 Oct 2026): the description and amount fill in, and both stay editable -
 * "Damage or missing items" becomes "Missing item (watch), kitchen".
 * No amount: the clause says "reasonable cost", so admin types it.
 * Change these when Schedule B changes.
 */
export const CHARGES: { label: string; amount: number | null }[] = [
  { label: "Resident-requested room/unit change", amount: 100 },
  { label: "Additional access card following room/unit change", amount: 20 },
  { label: "Lost/damaged room key", amount: 15 },
  { label: "Residence access card (lost)", amount: 60 },
  { label: "Residence access card (damaged)", amount: 30 },
  { label: "Car access card (lost)", amount: 125 },
  { label: "Car access card (damaged)", amount: 65 },
  { label: "Car sticker (application/lost/damaged)", amount: 15 },
  { label: "Lockout assistance (Mon-Fri, 9.00 a.m.-5.00 p.m.)", amount: 10 },
  { label: "Lockout assistance (after 5.00 p.m., weekends/public holidays)", amount: 20 },
  { label: "Additional room cleaning", amount: 30 },
  { label: "Additional communal-area cleaning", amount: 100 },
  { label: "Mandatory basic move-out cleaning", amount: 60 },
  { label: "Air-conditioning servicing", amount: 120 },
  { label: "Damage or missing items", amount: null },
  { label: "Deep cleaning/restoration/removal/disposal", amount: null },
  { label: "Utility late-payment/reconnection charges", amount: null },
];
