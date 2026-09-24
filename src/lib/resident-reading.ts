/**
 * What a student has to have opened before they can submit their application.
 *
 * The declaration says they agree to the Tenancy Agreement and the House Rules.
 * Agreeing to a document nobody put in front of them is not agreement, so it
 * has to be opened before the declaration can be left behind.
 *
 * One document, because Brachtia issues one. Two links were two things to read
 * where there is one thing to sign.
 *
 * PLACEHOLDER LINK. Brachtia has not issued it yet, so this points at a page on
 * the site so the flow can be used and tested. Replace the `href` with the real
 * PDF when it exists; nothing else has to change, and the gate keeps working
 * either way. The list is still a list, so a second document can be added
 * without touching the screens that read it.
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
    key: "tenancy_and_rules",
    label: "Tenancy Agreement and Brachtia Homes House Rules",
    note: "What you and Brachtia each agree to, and how the residence is run day to day.",
    href: "/contact",
  },
];
