/**
 * A person's details, and where each one lives (Dani, 15 Oct 2026). An
 * appointment, a booking and a resident's profile ask the same things; an
 * appointment linked to a booking or a resident is THAT person - its Person
 * card reads their record and saves to it, never a copy of its own. The
 * appointment copied six fields once, when linked: Larveena's said "—" for
 * Studying or working while her profile said Student, and an edit in the
 * drawer never reached her profile.
 *
 * The keys are the appointment's (and the booking's) own column names; a
 * resident keeps some under another name, and has no column for the rest -
 * those stay on the appointment.
 */
export const PERSON_FIELDS = [
  "full_name",
  "email",
  "phone",
  "university",
  "nationality",
  "gender",
  "current_status",
  "company",
  "occupation",
  "intake",
  "heard_about",
  "heard_about_other",
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];
export type PersonOwner = "resident" | "booking";

const RESIDENT_COLUMN: Partial<Record<PersonField, string>> = {
  full_name: "full_name",
  email: "email",
  phone: "mobile",
  university: "university",
  nationality: "nationality",
  gender: "gender",
  current_status: "current_status",
  company: "company",
  occupation: "occupation",
  // "How did you hear about us?" is the resident's one answer (20261020 referral_from_booking)
  heard_about: "referral_source",
};

/** the column a field is kept in on its owner - undefined: the owner has none */
export const ownerColumn = (owner: PersonOwner, field: PersonField) => (owner === "resident" ? RESIDENT_COLUMN[field] : field);

/** the fields the owner keeps - the rest are the appointment's own */
export const ownedFields = (owner: PersonOwner) => PERSON_FIELDS.filter((f) => ownerColumn(owner, f));

/** the person as their record has them, by the appointment's field names */
export function personFrom(owner: PersonOwner, row: Record<string, unknown> | null | undefined) {
  const out: Partial<Record<PersonField, string>> = {};
  if (!row) return out;
  for (const f of ownedFields(owner)) out[f] = String(row[ownerColumn(owner, f)!] ?? "");
  return out;
}

/** the change to write to the owner's record, in its own column names */
export function personPatch(owner: PersonOwner, values: Record<string, unknown>) {
  const patch: Record<string, string> = {};
  for (const f of ownedFields(owner)) if (typeof values[f] === "string") patch[ownerColumn(owner, f)!] = values[f] as string;
  return patch;
}

/** who the appointment is: its resident, else its booking, else nobody (its own details) */
export function personOwner(a: { resident_id?: unknown; enquiry_id?: unknown }): { owner: PersonOwner; id: string } | null {
  if (a.resident_id) return { owner: "resident", id: String(a.resident_id) };
  if (a.enquiry_id) return { owner: "booking", id: String(a.enquiry_id) };
  return null;
}
