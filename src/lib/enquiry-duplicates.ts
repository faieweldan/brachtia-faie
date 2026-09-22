/**
 * The same enquiry, sent twice.
 *
 * Students re-submit. They are not sure the first one went through, the page
 * was slow, or a parent sends one from the same phone. None of that is wrong,
 * and none of it is blocked here: a genuine enquiry is never refused because a
 * number has been seen before. It is accepted, marked, and pointed at the one
 * it repeats, so staff answer one person once instead of three times.
 *
 * Pure functions with no database and no server in them, so the rules can be
 * read - and tested - without standing a Supabase up.
 */

/** How far back a repeat still counts as the same enquiry. */
export const DUPLICATE_WINDOW_HOURS = 24;

/** What the student is told. Their words, not ours: they may well be right. */
export const DUPLICATE_NOTICE =
  "We may have already received your enquiry. To update it, call +6012-330 6815 or email contact@brachtiahomes.com. Otherwise, you may continue submitting a new enquiry.";

/** "  Aisha@Example.COM " and "aisha@example.com" are one address. */
export function normaliseEmail(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/**
 * A phone number reduced to the digits that identify it.
 *
 * The same Malaysian mobile arrives as "012-345 6789", "+60 12 345 6789" and
 * "60123456789". Dropping the punctuation, the +60 and the trunk 0 leaves
 * "123456789" for all three - without this, one student submitting twice from
 * two devices reads as two different people.
 *
 * Only +60 is unwound, because it is the only country code we can tell apart
 * from a real leading digit with any confidence. Everything else keeps its
 * digits, which still matches an identical re-submission.
 */
export function normalisePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const withoutCountry = digits.startsWith("60") ? digits.slice(2) : digits;
  return withoutCountry.replace(/^0+/, "");
}

/** The moment the window opens, counting back from now. */
export function windowStart(now: Date = new Date(), hours = DUPLICATE_WINDOW_HOURS): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Was this sent recently enough to be the same enquiry? */
export function isWithinWindow(
  earlier: string | Date,
  now: Date = new Date(),
  hours = DUPLICATE_WINDOW_HOURS,
): boolean {
  const at = earlier instanceof Date ? earlier : new Date(earlier);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return false;
  // a row stamped in the future is not a repeat of anything
  if (ms > now.getTime()) return false;
  return ms >= windowStart(now, hours).getTime();
}

/**
 * A name reduced to what identifies it: case, spacing and punctuation gone.
 *
 * "Nur  Aisha binti Rahman", "nur aisha binti rahman" and "Nur Aisha Binti
 * Rahman" are one person typed three ways. The order of the words is left
 * alone - reversing them is a different name often enough that swapping them
 * around would match strangers to each other.
 */
export function normaliseName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

/**
 * Do these two enquiries look like the same person?
 *
 * Any one of the email, the phone or the name is enough - Lav, 22 Sept 2026.
 * They are deliberately loose, because none of this decides anything: it marks
 * a booking as worth a second look, and an admin says whether it really is.
 *
 * The name is the loosest of the three and will match two unrelated students
 * who happen to share one. That is the price of catching somebody who enquired
 * twice from two different addresses, and it is only ever a suggestion.
 */
export function looksLikeSameSender(
  a: { email?: string; phone?: string; full_name?: string },
  b: { email?: string; phone?: string; full_name?: string },
): boolean {
  const emailA = normaliseEmail(a.email ?? "");
  const emailB = normaliseEmail(b.email ?? "");
  if (emailA && emailA === emailB) return true;

  const phoneA = normalisePhone(a.phone ?? "");
  const phoneB = normalisePhone(b.phone ?? "");
  if (phoneA && phoneA === phoneB) return true;

  const nameA = normaliseName(a.full_name ?? "");
  const nameB = normaliseName(b.full_name ?? "");
  return !!nameA && nameA === nameB;
}

/**
 * The earlier enquiry a new one repeats, if there is one.
 *
 * Rows are handed in already narrowed to the window by the database; this picks
 * the match and prefers the oldest, so a third submission points at the first
 * rather than at the second. Otherwise a chain forms and staff have to walk it.
 */
export function findRepeatOf<
  T extends { id: string; email?: string; phone?: string; full_name?: string; created_at?: string },
>(
  incoming: { email?: string; phone?: string; full_name?: string },
  recent: T[],
  now: Date = new Date(),
): T | null {
  const matches = recent
    .filter((r) => looksLikeSameSender(incoming, r))
    .filter((r) => !r.created_at || isWithinWindow(r.created_at, now));
  if (matches.length === 0) return null;
  // oldest first, so every repeat points at the original
  matches.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return matches[0] ?? null;
}
