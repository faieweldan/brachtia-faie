/**
 * Brachtia's staff - one list, kept in Settings → Staff (Dani, 4 Nov 2026).
 *
 * Every staff dropdown reads it (Assign staff, Prepared by, Approved by,
 * Issued by, Record payment), and each person keeps their own signature. The
 * name chosen on an action is the person who signs what it makes:
 *   - the document pack (TA, Schedules A and B): Prepared by
 *   - Schedule C: Approved by
 *   - Update Tenancy's and a room change's documents: Approved by
 *   - the checkout statement: Issued by
 *
 * A person is never removed: old records say "by Valsala", so someone who has
 * left is marked "No longer working here" and drops out of the dropdowns.
 * A name never changes once added, for the same reason.
 */
export type StaffMember = {
  name: string;
  title: string;
  /** "@signature:<hash>" - the saved picture (signatory.ts); "" when none yet */
  token: string;
  active: boolean;
};

/**
 * The list before Settings → Staff existed - read only when nothing has been
 * saved there yet, so the first visit shows the team as it was.
 */
export const FIRST_STAFF = ["Syazwani", "Norfadirah", "Valsala"];

/** Same person: names are compared without case or extra spaces. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The names a dropdown offers: who works here now, plus the one already chosen (a record made by someone who has left). */
export function staffChoices(list: { name: string; active: boolean }[], current = ""): string[] {
  const names = list.filter((s) => s.active).map((s) => s.name);
  return current && !names.includes(current) ? [...names, current] : names;
}
