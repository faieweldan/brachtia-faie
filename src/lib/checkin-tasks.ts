/**
 * What has to happen at an arrival check-in.
 *
 * A PLACEHOLDER list, drawn from how Brachtia checked people in before the
 * website (LEGACY-OPERATIONS.md) - to be confirmed with the business. The keys
 * are what gets saved, so rewording a label is safe; changing a key starts that
 * task afresh on every appointment.
 */
export const CHECKIN_TASKS = [
  { key: "payment", label: "Initial payment fully paid" },
  { key: "agreement", label: "Tenancy agreement signed" },
  { key: "inventory", label: "Room inventory checked, with photos" },
  { key: "keys", label: "Keys handed over" },
  { key: "access_card", label: "Access card given" },
  { key: "tour", label: "Tour of the unit and house rules explained" },
] as const;

export type CheckInTaskKey = (typeof CHECKIN_TASKS)[number]["key"];

/** One task as saved: ticked or not, by whom, and when. */
export type CheckInTaskState = { done: boolean; by: string; at: string };
