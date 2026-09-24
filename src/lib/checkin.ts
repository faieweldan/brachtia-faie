/**
 * The rules that decide when a student may arrive.
 *
 * Apart from the screen that asks, because admin will need the same numbers to
 * judge a request against, and two copies of a rule is one rule and one guess.
 */

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

export const todayISO = () => new Date().toISOString().slice(0, 10);
