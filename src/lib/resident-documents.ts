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
export const STUDENT_DOCS = [
  { key: "photo", label: "Passport size photo", required: true },
  { key: "offer", label: "University offer / admission letter", required: true },
  { key: "id", label: "Passport / NRIC copy", required: true },
] as const;

/**
 * What a document is called for this student. The ID copy follows nationality -
 * an IC copy for a Malaysian, a passport copy for everybody else - the same rule
 * that names the ID number field.
 */
export function studentDocLabel(key: string, nationality: string): string {
  if (key === "id") return idDocLabelFor(nationality);
  return STUDENT_DOCS.find((d) => d.key === key)?.label ?? key;
}
