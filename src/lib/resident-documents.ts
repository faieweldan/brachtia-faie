import { idDocLabelFor } from "@/lib/reference-data";

/**
 * Residents' files - which ones a student is asked for, what may be uploaded,
 * and where it is kept.
 *
 * Plain values with no server code, so the student form, the admin page and
 * both upload handlers (profile documents, payment proofs) read the same rules.
 */

/** Private on purpose: identity documents and bank slips. Shown only by signed link. */
export const DOC_BUCKET = "resident-documents";
export const MAX_DOC_BYTES = 8 * 1024 * 1024;
export const DOC_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

export function safeExt(name: string, type: string) {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return type === "application/pdf" ? "pdf" : "jpg";
}

/**
 * Only what a student can supply on their own.
 *
 * The declaration form and the tenancy agreement are issued by Brachtia and
 * signed later, and the balance is paid after the room is confirmed - asking
 * for them here made the list look unfinished for everybody. They come back
 * when there is a document to sign and a balance to pay.
 *
 * The booking fee slip is not asked for either. It reaches admin with the
 * payment - recorded against it, kept with its receipt, and sent back out on
 * the same document - so asking the student to upload it a second time left a
 * red "Not uploaded yet" on a profile whose fee was already paid and receipted.
 */
export type ResidentDoc = {
  key: string;
  label: string;
  required: boolean;
  /** "student", "employed", or "any" - who is asked for it */
  appliesTo: "student" | "employed" | "any";
};

/**
 * Brachtia is not only for students, and this list was.
 *
 * Everyone was asked for a "University offer / admission letter", marked
 * required, whatever they had answered to Student or Employed. Somebody working
 * cannot produce one - the form had already stopped asking them for a
 * university and an intake, and then asked them to upload the letter from it.
 *
 * The employment letter takes that place, on the same terms. The photo and the
 * ID are asked of everybody, and the order is kept so the list reads the same
 * way for both: who you are, what you are doing, then your ID.
 */
export const RESIDENT_DOCS: ResidentDoc[] = [
  { key: "photo", label: "Passport size photo", required: true, appliesTo: "any" },
  {
    key: "offer",
    label: "University offer / admission letter",
    required: true,
    appliesTo: "student",
  },
  // asked for, but not required: some employers will not write one, and a
  // working resident should not be held up waiting on their company
  {
    key: "employment",
    label: "Employment letter",
    required: false,
    appliesTo: "employed",
  },
  { key: "id", label: "Passport / NRIC copy", required: true, appliesTo: "any" },
];

/**
 * The documents to ask this person for.
 *
 * An answer that is neither - nobody has said yet, or a status this list does
 * not know - is given the student set, which is what every resident was asked
 * for before this existed. Better to ask a working person for one letter they
 * have to skip than to ask a student for nothing and find out at check-in.
 */
export function residentDocsFor(currentStatus: string): ResidentDoc[] {
  const employed =
    String(currentStatus ?? "")
      .trim()
      .toLowerCase() === "employed";
  return RESIDENT_DOCS.filter(
    (d) => d.appliesTo === "any" || d.appliesTo === (employed ? "employed" : "student"),
  );
}

/**
 * What a document is called for this person. The ID copy follows nationality -
 * an IC copy for a Malaysian, a passport copy for everybody else - the same rule
 * that names the ID number field.
 */
export function residentDocLabel(key: string, nationality: string): string {
  if (key === "id") return idDocLabelFor(nationality);
  return RESIDENT_DOCS.find((d) => d.key === key)?.label ?? key;
}

/**
 * The uploads still outstanding for this person.
 *
 * Only what they are actually shown counts. A student is never asked for an
 * employment letter and must not be held up by one, and the same the other way
 * round - which is the whole reason the list depends on their answer.
 */
export function missingResidentDocs(
  currentStatus: string,
  uploaded: Record<string, string>,
): ResidentDoc[] {
  return residentDocsFor(currentStatus).filter((d) => d.required && !uploaded[d.key]);
}
