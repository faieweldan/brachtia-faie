/**
 * The declaration a student agrees to, as content rather than as markup.
 *
 * The thirteen terms live here so the same words can be shown on screen, frozen
 * into the signature record, and printed later without being written out three
 * times and drifting apart.
 *
 * Changing any word here means a new version. The old text is not edited,
 * because a student who signed it agreed to what it said then, and that has to
 * stay answerable. `DECLARATION_VERSION` is the only thing to bump.
 */

export const DECLARATION_VERSION = "v1";

/** The five terms that cost money. They are ticked one at a time, because these
 *  are the ones a student argues about eight months later. */
export const COST_TERMS = [
  {
    key: "minimum_term",
    summary: "Minimum stay",
    plain: "12 months",
    detail:
      "The minimum term for a local student is twelve months. International students are considered case by case.",
    term: 6,
  },
  {
    key: "admin_fee",
    summary: "Administration fee",
    plain: "RM 150, non-refundable",
    detail: "RM 150 is payable when this form is signed, and is not refundable.",
    term: 7,
  },
  {
    key: "cancellation",
    summary: "If you cancel",
    plain: "1 month rent + RM 150",
    detail:
      "Cancelling or withdrawing after full payment, or before signing the accommodation agreement, costs one month's rent plus the RM 150 administration fee.",
    term: 8,
  },
  {
    key: "early_exit",
    summary: "If you leave early",
    plain: "Deposit forfeited",
    detail:
      "Ending the tenancy early may forfeit the deposit, plus one month's advance rental and the administration fee.",
    term: 9,
  },
  {
    key: "move_out",
    summary: "When you move out",
    plain: "RM 50 cleaning + RM 120 air-cond",
    detail:
      "A one-time RM 50 cleaning charge applies if the room and unit are not left clean and tidy, and RM 120 per room for air-conditioner servicing.",
    term: 13,
  },
] as const;

export type CostTermKey = (typeof COST_TERMS)[number]["key"];

/** All thirteen, in the order they appear on Brachtia's paper form. */
export const DECLARATION_TERMS: string[] = [
  "Only a student duly registered in a programme conducted by a university may apply for off-campus student accommodation.",
  "The application form should be completed accurately to facilitate processing.",
  "Room reservations are not transferable.",
  "This application is subject to room availability, on a first come first served basis. All rooms in a unit must be fully occupied before another empty unit is opened. Only rooms and units that are available will be offered.",
  "Room rental only: a student may be moved to another room if the unit is not fully occupied, because a partly occupied unit carries higher utility costs. Any difference in room price is borne by the student, and the choice is the student's own.",
  "The minimum term of a local student accommodation agreement is twelve (12) months. International students are considered case by case.",
  "A non-refundable administration fee of RM 150.00 is payable upon signing this application form.",
  "Cancellation: a penalty of one (1) month's rental and the RM 150.00 administration fee applies if the student cancels or withdraws after full payment is made, or before signing the accommodation agreement.",
  "Upon signing the accommodation agreement: (a) deposits paid are refundable within 14 days of completing the tenancy, in accordance with the Tenancy Agreement; (b) pre-terminating may cause the deposit to be forfeited, along with one month's advance rental and the administration fees.",
  "All residents must adhere to the house rules attached to this form.",
  "Monthly, bi-monthly or quarterly rental must be paid by the 5th day of each month.",
  "Utility bills for electricity, water and internet are paid monthly and shared equally between housemates by the 10th day of each month.",
  "At the end of the tenancy a one-time moving out cleaning charge of RM 50 applies if the room and unit are not left clean and tidy, and air-conditioner service charges of RM 120 per room.",
];

export const DECLARATION_INTRO =
  "I have read and agreed to all the terms set out in this Student Accommodation Application Form. By signing this document I understand and fully agree to the following:";

/**
 * The exact words a signature is taken against.
 *
 * Built from the parts above rather than typed out again, so the text shown on
 * screen and the text recorded in the signature cannot drift. The server hashes
 * this and refuses to record a signature if its hash does not match the version
 * on record - which is how an accidental edit to the wording is caught rather
 * than quietly changing what past students appear to have agreed to.
 */
export function declarationBody(): string {
  const numbered = DECLARATION_TERMS.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `PART 2: DECLARATION (${DECLARATION_VERSION})\n\n${DECLARATION_INTRO}\n\n${numbered}\n`;
}

/** Names compared the way a person would: spacing and case do not matter. */
export function nameMatches(typed: string, onFile: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm(typed) || !norm(onFile)) return false;
  return norm(typed) === norm(onFile);
}
