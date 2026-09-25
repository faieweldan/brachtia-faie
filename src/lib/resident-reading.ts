/**
 * What a student has to have opened before they can submit their application.
 *
 * The declaration says they agree to the Tenancy Agreement and the House Rules.
 * Agreeing to a document nobody put in front of them is not agreement, so
 * anything listed here has to be opened before the declaration can be left
 * behind.
 *
 * EMPTY ON PURPOSE. Brachtia has not issued the documents yet, and the form is
 * now in front of real students. A link that went to a page which is not the
 * agreement was worse than no link: it let a student tick "opened" against
 * something that was never the thing they were agreeing to, and the system
 * would have recorded that as though it meant something.
 *
 * Nothing else has to change when the real PDF exists. Add it here and the link,
 * the panel on step 2, and the gate on Next and Submit all come back on
 * together - they are all driven by this list, and an empty list switches the
 * whole panel off rather than showing an empty box.
 */
export type ResidentDocument = {
  key: string;
  label: string;
  /** what it is, in the student's words, so the link is worth clicking */
  note: string;
  href: string;
};

export const RESIDENT_DOCUMENTS: ResidentDocument[] = [
  // {
  //   key: "tenancy_and_rules",
  //   label: "Tenancy Agreement and Brachtia Homes House Rules",
  //   note: "What you and Brachtia each agree to, and how the residence is run day to day.",
  //   href: "<the real PDF>",
  // },
];
