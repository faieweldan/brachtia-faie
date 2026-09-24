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
export const INVOICE_TERMS: string[] = [
  "A RM500 Booking Fee is required to reserve the accommodation and will be credited towards the Initial Payment.",
  "Standard tenancy is 6 months or more. Shorter stays are subject to the applicable short-term rate. Rental is payable in advance and due on the 5th of each billing period.",
  "For cancellation before the balance of the Initial Payment is paid, RM150 is non-refundable and RM350 will be refunded. Once the Initial Payment has been made or the Tenancy Agreement has been signed, 1 month's rental + RM150 Administration Fee applies.",
  "Early termination of Tenancy Agreement will result in forfeiture of the Security and Utility Deposits. Refundable deposits will be returned within 14 working days after tenancy completion, less outstanding rent, utilities, damages, missing items and other applicable charges, subject to completion of the checkout process.",
  "Room Rentals include Wi-Fi, sewerage and basic monthly communal-area cleaning. Water and electricity are charged separately based on the applicable utility-sharing calculation.",
  "Room Rentals are halal, non-smoking and gender-segregated. Visitors are not permitted inside shared units, except for check-in, emergencies or with Management approval. Overnight guests are not permitted.",
  "For Unit Rentals, utilities and cleaning are borne by the resident. Mixed-gender occupancy is permitted for families and married couples.",
  "A mandatory RM60 basic move-out cleaning charge applies. Air-conditioning servicing is RM120 per room and is required annually, or once per stay where the tenancy is below 12 months, unless exempted by Management. Resident-requested room or unit changes are subject to availability and a RM100 Administration Fee, plus any applicable rental or deposit adjustment.",
  "Accommodation is for registered residents only. Subletting or unauthorised sharing is not permitted. All stays are subject to the Tenancy Agreement and Brachtia Homes House Rules.",
];

export const INVOICE_TERMS_HEADING = "Booking Terms and Conditions";
