/* eslint-disable @typescript-eslint/no-explicit-any */

/** What a stay asks of its room - the fields a reserved room was picked against. */
const FIT = {
  residenceSlug: "residence_slug",
  unitType: "unit_type",
  roomCode: "room_code",
  occupancy: "occupancy",
} as const;

/**
 * The stay now asks for a different room than the one reserved: another
 * residence, unit type, room type or occupancy. The reserved room was picked for
 * the old one, so it no longer fits and is released on save. Dates, payment
 * frequency and add-ons leave it alone.
 */
export function roomFitChanged(
  row: any,
  stay: { residenceSlug?: unknown; unitType?: unknown; roomCode?: unknown; occupancy?: unknown },
) {
  return (Object.keys(FIT) as (keyof typeof FIT)[]).some(
    (key) => stay[key] !== undefined && String(stay[key] ?? "") !== String(row?.[FIT[key]] ?? ""),
  );
}

/** The stay fields worth a line in the booking's activity, and their wording. */
const STAY_FIELDS: { key: string; column: string; label: string; kind?: "date" | "money" }[] = [
  { key: "residenceName", column: "residence_name", label: "Residence" },
  { key: "unitType", column: "unit_type", label: "Unit type" },
  { key: "roomName", column: "room_name", label: "Room preference" },
  { key: "occupancy", column: "occupancy", label: "Occupancy" },
  { key: "moveIn", column: "move_in", label: "Move in", kind: "date" },
  { key: "moveOut", column: "move_out", label: "Move out", kind: "date" },
  { key: "paymentTerm", column: "payment_term", label: "Payment frequency" },
  { key: "monthlyRent", column: "monthly_rent", label: "Monthly rent", kind: "money" },
];

const WORDS: Record<string, string> = {
  single: "Single",
  twin: "Twin",
  unit: "Whole unit",
  bimonthly: "Bi-monthly",
  quarterly: "Quarterly",
  full: "Full upfront",
};

const say = (v: unknown, kind?: "date" | "money") => {
  const raw = String(v ?? "").trim();
  if (!raw) return "none";
  if (kind === "money") return `RM${Number(raw).toLocaleString("en-MY")}`;
  if (kind === "date") {
    const d = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleDateString("en-MY", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  }
  return WORDS[raw] ?? raw;
};

/**
 * What a stay edit actually changed, each as "Move out 17 Jan 2027 → 17 Nov 2027".
 *
 * Only the fields a person would recognise: the quote and the snapshot behind it
 * follow from these, so listing them again would say the same thing twice.
 */
export function stayChanges(row: any, patch: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const field of STAY_FIELDS) {
    if (patch[field.key] === undefined) continue;
    const before = String(row?.[field.column] ?? "");
    const after = String(patch[field.key] ?? "");
    if (before === after) continue;
    lines.push(`${field.label} ${say(before, field.kind)} → ${say(after, field.kind)}`);
  }
  const addons = patch["addons"];
  if (Array.isArray(addons)) {
    const before = Array.isArray(row?.addons) ? (row.addons as unknown[]).map(String) : [];
    const after = addons.map(String);
    if (before.join("|") !== after.join("|")) {
      lines.push(`Add-ons ${before.join(", ") || "none"} → ${after.join(", ") || "none"}`);
    }
  }
  return lines;
}
