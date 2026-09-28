/**
 * Where an appointment's status goes as admin works on it.
 *
 *   new        a student's booking nobody has opened yet
 *   pending    opened, but nobody is taking it
 *   confirmed  a staff member is taking it
 *
 * Only these three move on their own. Completed, no-show and cancelled are
 * admin's answers, and nothing here changes them.
 */
const MOVES_ON_ITS_OWN = new Set(["new", "pending"]);

/** The status once admin has opened it. */
export function statusWhenOpened(status: string, assignedStaff: string): string {
  if (status !== "new") return status;
  return assignedStaff.trim() ? "confirmed" : "pending";
}

/** The status once staff is set (or cleared) on it. */
export function statusWithStaff(status: string, assignedStaff: string): string {
  if (!MOVES_ON_ITS_OWN.has(status) && status !== "confirmed") return status;
  if (assignedStaff.trim()) return MOVES_ON_ITS_OWN.has(status) ? "confirmed" : status;
  // nobody taking it any more: it is waiting again
  return status === "confirmed" ? "pending" : status;
}
