import { company } from "@/data/properties";

/**
 * The terms printed on an invoice, when admin asks for them.
 *
 * One list, in the app rather than on each invoice row: the wording is the same
 * every time, and a correction here reaches every invoice printed afterwards.
 * Copying six paragraphs onto every row would mean a typo fixed today still
 * stands on everything already issued.
 *
 * The legal name comes from `company` rather than being typed again, so the
 * entity money is payable to cannot drift from the one in the footer.
 */
export const INVOICE_TERMS: string[] = [
  "Payment must be made by the due date stated on this invoice.",
  `A RM150 disbursement cost will be deducted from the booking fee if the booking is cancelled or does not proceed. This amount is non-refundable and payable to ${company.legalName}.`,
  "Refundable deposits are subject to the terms of the Tenancy Agreement, including any applicable deductions upon check-out.",
  "Rental and other recurring payments must be made according to the agreed payment schedule.",
  "Please use the Invoice No. or Resident Name as the payment reference.",
  "This invoice and all payments are subject to the applicable accommodation and Tenancy Agreement terms.",
];

export const INVOICE_TERMS_HEADING = "Terms & Conditions";
