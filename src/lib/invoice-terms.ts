/**
 * The terms printed on an invoice, when admin asks for them.
 *
 * One list, in the app rather than on each invoice row: the wording is the same
 * every time, and a correction here reaches every invoice printed afterwards.
 * Copying nine paragraphs onto every row would mean a typo fixed today still
 * stands on everything already issued.
 *
 * The same clauses the quotation states, less the one that says a quotation is
 * only an estimate - an invoice is not an estimate. The quotation's copy lives
 * on the residence row (Website -> Residences), because the site and the quote
 * PDF read it from there; this one is code, so the two are kept in step by
 * hand. Changing one is a reason to look at the other.
 */

/**
 * A run of words, and whether it is bold.
 *
 * The clauses are kept in pieces rather than as sentences because the sums and
 * the deadlines are what a resident comes back to the page for - the RM150, the
 * fourteen days - and they are set in bold on the document these were written
 * from. A PDF table cell holds one font, so the emphasis cannot be marked up
 * inside a string; it has to be a list the renderer can walk.
 */
export type TermSpan = { text: string; bold?: boolean };

const b = (text: string): TermSpan => ({ text, bold: true });
const t = (text: string): TermSpan => ({ text });

export const INVOICE_TERM_SPANS: TermSpan[][] = [
  [
    t("A "),
    b("RM500 Booking Fee"),
    t(
      " is required to reserve the accommodation and will be credited towards the Initial Payment.",
    ),
  ],
  [
    t("Standard tenancy is "),
    b("six (6) months or more"),
    t(". Shorter stays are subject to the applicable short-term rate. Rental is payable "),
    b("in advance"),
    t(" and due on the "),
    b("5th of each billing period"),
    t("."),
  ],
  [
    t("For cancellation before the balance of the Initial Payment is paid, "),
    b("RM150 is non-refundable and RM350 will be refunded"),
    t(". Once the Initial Payment has been made or the Tenancy Agreement has been signed, "),
    b("one (1) month's rental + RM150 Administration Fee"),
    t(" applies."),
  ],
  [
    t("Early termination of Tenancy Agreement will result in forfeiture of the "),
    b("Security and Utility Deposits"),
    t(". Refundable deposits will be returned within "),
    b("fourteen (14) working days after the move out date"),
    t(
      ", less outstanding rent, utilities, damages, missing items and other applicable charges, subject to completion of the checkout process.",
    ),
  ],
  [
    b("Room Rentals"),
    t(
      " include Wi-Fi, sewerage and basic monthly communal-area cleaning. Water and electricity are charged separately based on the applicable utility-sharing calculation.",
    ),
  ],
  [
    t("Room Rentals are "),
    b("halal, non-smoking and gender-segregated"),
    t(". Visitors are not permitted inside shared units, "),
    b("except for check-in, emergencies or with Management approval."),
    t(" Overnight guests are not permitted."),
  ],
  [
    t("For "),
    b("Unit Rentals"),
    t(
      ", utilities and cleaning are borne by the resident. Mixed-gender occupancy is permitted for ",
    ),
    b("families and married couples"),
    t("."),
  ],
  [
    t("A "),
    b("mandatory RM60 basic move-out cleaning charge"),
    t(" applies. Air-conditioning servicing is "),
    b("RM120 per room"),
    t(
      " and is required annually, or once per stay where the tenancy is below 12 months, unless exempted by Management. Resident-requested room or unit changes are subject to availability and a ",
    ),
    b("RM100 Administration Fee"),
    t(", plus any applicable rental or deposit adjustment."),
  ],
  [
    t("Accommodation is for "),
    b("registered residents only"),
    t(". Subletting or unauthorised sharing is not permitted. All stays are subject to the "),
    b("Tenancy Agreement and Brachtia Homes House Rules"),
    t("."),
  ],
];

/** What the payer carries, and what they get back. */
export const CURRENCY_NOTE_SPANS: TermSpan[][] = [
  [
    t("All fees are payable in "),
    b("Ringgit Malaysia (RM)"),
    t(
      ". Any foreign currency amount or exchange rate shown is for reference only and is subject to exchange-rate fluctuations and applicable bank or transfer charges. The payer is responsible for any difference required to ensure the ",
    ),
    b("full invoiced amount in RM"),
    t(" is received."),
  ],
  [
    t("Any applicable stamp duty is charged in accordance with the "),
    b("prevailing Malaysian stamp duty requirements"),
    t("."),
  ],
  [t("An "), b("official receipt"), t(" will be issued upon confirmation of payment.")],
];

export const CURRENCY_NOTE_HEADING = "Currency & Payment Note";

/** The same clauses as plain sentences, for anywhere that cannot set a font. */
export const spansToText = (spans: TermSpan[]) => spans.map((s) => s.text).join("");

/**
 * Derived rather than written out again: the screen shows these beside the PDF,
 * and two hand-kept copies of nine paragraphs is how the two come to disagree.
 */
export const INVOICE_TERMS: string[] = INVOICE_TERM_SPANS.map(spansToText);

export const INVOICE_TERMS_HEADING = "Booking Terms and Conditions";
