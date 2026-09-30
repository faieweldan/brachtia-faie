/**
 * The rules that decide when a student may arrive.
 *
 * Apart from the screen that asks, because admin will need the same numbers to
 * judge a request against, and two copies of a rule is one rule and one guess.
 */

/** The appointment type an arrival is booked as, as seeded in the database. */
export const CHECKIN_TYPE = "check-in";

/** Arrival may be the tenancy start day or any of the seven days after it. */
export const CHECKIN_WINDOW_DAYS = 7;

/** A slot has to be booked this far ahead for somebody to be there to meet it. */
export const CHECKIN_NOTICE_DAYS = 5;

/** Times a key can be handed over: office hours, on the hour and the half. */
export const CHECKIN_SLOTS = [
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
];

export type CheckInChoice = { on: string; slot: string; remind: boolean };

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * A Date as the day it is where the student is, not where the server is.
 *
 * toISOString would shift a Malaysian evening back into the previous day, so a
 * calendar click on the 15th would be recorded as the 14th.
 */
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = () => toISO(new Date());

/**
 * Where a resident's arrival stands, for the admin (30 Sep 2026).
 *
 * "Asked for a reminder" is a promise the website does not keep by itself yet:
 * the admin sends it. So it is shown, never left in a column nobody reads.
 */
export type CheckInStatus = "booked" | "remind" | "none";
export const checkInStatus = (r: { on?: string | null; slot?: string | null; remind?: boolean | null }): CheckInStatus =>
  r.on && r.slot ? "booked" : r.remind ? "remind" : "none";

/**
 * Whether the admin should chase this arrival now: the move-in is within the
 * next week, or it has started and the arrival window is still open, and no
 * day and time has been chosen.
 */
export const needsCheckInBooking = (moveIn: string, status: CheckInStatus, today: string) =>
  status !== "booked" &&
  !!moveIn &&
  moveIn <= addDays(today, CHECKIN_WINDOW_DAYS) &&
  addDays(moveIn, CHECKIN_WINDOW_DAYS) >= today;
