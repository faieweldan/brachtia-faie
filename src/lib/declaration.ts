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

/**
 * All thirteen, word for word from Brachtia's form, with its emphasis kept.
 *
 * Not tidied up, not rephrased. This is a contract: a clearer paraphrase is a
 * different set of terms from the one on the paper copy, and if the two ever
 * disagree nobody can say which a student agreed to.
 *
 * The bold and underline are part of the document, not decoration - they are
 * what the drafter chose to draw the eye to. `**bold**` and `__underlined__`
 * mark them up here so the same words stand out on screen and on the printed
 * copy without the text being written out twice.
 */
export const DECLARATION_TERMS: string[] = [
  "Only student duly registered in any programs conducted by university may apply or off-campus student's accommodation.",
  "The application form should be completed accurately to facilitate processing.",
  "Room reservations are not transferable.",
  "That this Student Accommodation Application Form is subject to room availability (on first come first serve basis). All the room in the UNIT must be fully occupied before accommodating another empty unit. ONLY rooms / units that are available will be offered to the students.",
  "**__ONLY APPLICABLE TO FOR ROOM RENTAL:__** Student will be moved to any other rooms in the event the Unit is not fully occupied (for cost effective reasons). A student who is occupying a unit which is not fully occupied will end up bearing higher utility costs. Hence, moving the said student to another available room in a different unit will hinder such cost. However, the room price difference should be borne by the student, if need be. The choice of this, which would be allowed and to be decided by the student personally.",
  "**The minimum term** of LOCAL student accommodation agreement is TWELVE (12) months. Exception to INTERNATIONAL student on case-to-case basis.",
  "**A non-refundable deposit of RM150.00** for administration fee is required to be paid upon signing this application form.",
  "**CANCELLATION** - Penalty of **__One (1) month rental and administration fees of RM150.00__** will be imposed if the student decides to cancel and/or withdraw from accommodating the unit after full payment is made or prior to signing the accommodation agreement.",
  "**Upon Signing accommodation agreement** (a) **Deposits** paid will be **refundable within 14 days** upon completion of the duration of the tenancy pursuant to Tenancy Agreement. (b) **Pre-Terminating** may cause **deposit to be forfeited** and one-month advance rental and the administration fees.",
  "All residents of student accommodation must **adhere to house rules** as attached herein:",
  "**Monthly / Quarterly Rental** MUST BE paid by the 5th day of each month - Bi-Monthly/Quarterly.",
  "**Utilities bills** (Electricity, Water and Internet) must be paid monthly and shared equally between housemates by 10th day of each month",
  "At the end of Tenancy, I will be charged **one-time**__ moving out Cleaning @RM50__ if I do not leave the room and unit clean and tidy and __Air-Cond service charges of RM120__ (per room).",
];

/** The marked-up text as the plain words, for anything that cannot show
 *  emphasis - the stored copy a signature is taken against, for instance. */
export function plainTerm(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "");
}

/**
 * Split marked-up text into runs a renderer can walk.
 *
 * Kept deliberately small: two markers, no nesting rules beyond bold wrapping
 * underline, because this formats one fixed document rather than arbitrary
 * input.
 */
export type Run = { text: string; bold: boolean; underline: boolean };

export function termRuns(text: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let underline = false;
  let buf = "";
  const push = () => {
    if (buf) runs.push({ text: buf, bold, underline });
    buf = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("**", i)) {
      push();
      bold = !bold;
      i += 1;
    } else if (text.startsWith("__", i)) {
      push();
      underline = !underline;
      i += 1;
    } else {
      buf += text[i];
    }
  }
  push();
  return runs;
}

export const DECLARATION_INTRO =
  "I have read and agreed to all the terms set out in this Student Accommodation Application Form in page 2 specifically. By signing the document, I understand and fully agree to the following:";

/** The party on the other side of this agreement, as printed on the form. */
export const LANDLORD_ENTITY = "Brachtia Maju Resources PLT";
export const LANDLORD_REG_NO = "202304003086 (LLP0037045-LGN)";

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
  const numbered = DECLARATION_TERMS.map((t, i) => `${i + 1}. ${plainTerm(t)}`).join("\n");
  return [
    `PART 2: DECLARATION (${DECLARATION_VERSION})`,
    `${LANDLORD_ENTITY} · Reg No ${LANDLORD_REG_NO}`,
    "",
    DECLARATION_INTRO,
    "",
    numbered,
    "",
  ].join("\n");
}

/** Names compared the way a person would: spacing and case do not matter. */
export function nameMatches(typed: string, onFile: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm(typed) || !norm(onFile)) return false;
  return norm(typed) === norm(onFile);
}
