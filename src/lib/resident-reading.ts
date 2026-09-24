/**
 * What a student has to have opened before they can submit their application.
 *
 * The declaration says they agree to the Tenancy Agreement and the House Rules.
 * Agreeing to a document nobody put in front of them is not agreement, so both
 * have to be opened - once each - before Submit will do anything.
 *
 * PLACEHOLDER LINKS. Brachtia has not issued either document yet, so these
 * point at pages on the site so the flow can be used and tested. Replace the
 * two `href` values with the real PDFs when they exist; nothing else has to
 * change, and the gate keeps working either way.
 */
export type ResidentDocument = {
  key: string;
  label: string;
  /** what it is, in the student's words, so the link is worth clicking */
  note: string;
  href: string;
};

export const RESIDENT_DOCUMENTS: ResidentDocument[] = [
  {
    key: "tenancy_agreement",
    label: "Tenancy Agreement",
    note: "What you and Brachtia each agree to for the length of your stay.",
    href: "/contact",
  },
  {
    key: "house_rules",
    label: "Brachtia Homes House Rules",
    note: "How the residence is run day to day, and what is expected of residents.",
    href: "/about",
  },
];
