/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Saving a payment - the one way, for every kind (15 Oct 2026): admin's Record
 * payment, account credit, and the deposit applied at checkout. The payment,
 * its receipt and the invoice's status are one database step
 * (record_invoice_payment, 20261015100000_atomic_payments.sql): the invoice is
 * locked, what is paid on it re-read, and either all three are saved or none.
 *
 * What comes after the money - the booking's stage, the resident made from the
 * fee, an access card, an Update Tenancy event - runs once this has returned,
 * outside the step, and is safe to run again.
 *
 * Server only - handed the service-role client.
 */

/** an amount that is money: a finite number of at least one sen */
export const isValidAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.round(n * 100) > 0;

/** a request key: one per save attempt, made by the Record payment box */
export const isRequestKey = (k: unknown): k is string =>
  typeof k === "string" && /^[A-Za-z0-9:_./-]{8,160}$/.test(k);

/** what the database says, in the words the screens already use */
export const PAYMENT_ERRORS: Record<string, string> = {
  invalid_amount: "Enter the amount received",
  invoice_not_found: "Invoice not found",
  invoice_void: "This invoice was cancelled",
  not_billed: "This invoice is not billed yet",
  nothing_owing: "Nothing is owed on this invoice",
  request_key_reused:
    "This payment was already saved with other details. Close the box, check the invoice, and record it again if it is still owed.",
  reason_needed: "Say why the payment is being amended",
  payment_not_found: "This payment is no longer on the invoice - it may have been amended already",
  not_amendable: "Account credit is applied by the system and cannot be amended here",
};

export class PaymentRefused extends Error {
  constructor(readonly code: string) {
    super(PAYMENT_ERRORS[code] ?? `The payment could not be saved (${code})`);
  }
}

export type PaymentInput = {
  invoiceId: string;
  amount: number;
  /** yyyy-mm-dd */
  paidOn: string;
  method: string;
  reference?: string;
  proofPath?: string;
  description?: string;
  recordedBy?: string;
  /** the same key again returns the first payment, and saves nothing */
  requestKey?: string | null;
  /** account credit and checkout: never more than the invoice owes now */
  capToOwing?: boolean;
};

export type RecordedPayment = {
  payment: any;
  receipt: any;
  /** owed after it - below 0 when more was paid than owed */
  balance: number;
  paidToDate: number;
  /** nothing left owing */
  settled: boolean;
  /** the request was saved before: nothing was saved now */
  replayed: boolean;
  invoice: {
    id: string;
    number: string;
    enquiry_id: string | null;
    resident_id: string;
    status: string;
    invoice_type: string;
    total: number;
  };
};

export async function recordInvoicePayment(sb: any, input: PaymentInput): Promise<RecordedPayment> {
  // refused here first, so nothing reaches the database
  if (!isValidAmount(input.amount)) throw new PaymentRefused("invalid_amount");
  if (input.requestKey != null && !isRequestKey(input.requestKey))
    throw new Error("The payment could not be saved: its request key is not valid");
  const { data, error } = await sb.rpc("record_invoice_payment", {
    p_invoice: input.invoiceId,
    p_amount: input.amount,
    p_paid_on: input.paidOn || null,
    p_method: input.method ?? "",
    p_reference: input.reference ?? "",
    p_proof_path: input.proofPath ?? "",
    p_description: input.description ?? "",
    p_recorded_by: input.recordedBy ?? "",
    p_request_key: input.requestKey ?? null,
    p_cap_to_owing: !!input.capToOwing,
  });
  return fromDatabase(data, error);
}

/** what record_invoice_payment and amend_invoice_payment answer, read the same way */
function fromDatabase(data: any, error: any): RecordedPayment {
  if (error) throw new Error(`The payment could not be saved: ${error.message}`);
  const out = data as any;
  if (!out?.ok) throw new PaymentRefused(String(out?.error ?? "unknown"));
  return {
    payment: out.payment,
    receipt: out.receipt,
    balance: Number(out.balance),
    paidToDate: Number(out.paid_to_date),
    settled: !!out.settled,
    replayed: !!out.replayed,
    invoice: { ...out.invoice, total: Number(out.invoice?.total ?? 0) },
  };
}

export type AmendInput = Omit<PaymentInput, "invoiceId" | "capToOwing"> & {
  /** the payment typed wrong */
  paymentId: string;
  /** why - kept with the old payment for accounts */
  reason: string;
};

export type AmendedPayment = RecordedPayment & {
  /** the receipt number the wrong payment had - the one now replaced */
  oldReceipt: string;
};

/**
 * Amend a payment typed wrong (28 Oct 2026): the wrong payment and its receipt
 * are kept, whole, with the reason (payment_amendments), and the corrected one
 * is saved by record_invoice_payment - a new receipt, the balance and status
 * worked out as for any payment. One database step
 * (amend_invoice_payment, 20261028100000_amend_payment.sql), all or nothing.
 */
export async function amendInvoicePayment(sb: any, input: AmendInput): Promise<AmendedPayment> {
  if (!isValidAmount(input.amount)) throw new PaymentRefused("invalid_amount");
  if (String(input.reason ?? "").trim().length < 3) throw new PaymentRefused("reason_needed");
  if (input.requestKey != null && !isRequestKey(input.requestKey))
    throw new Error("The payment could not be saved: its request key is not valid");
  const { data, error } = await sb.rpc("amend_invoice_payment", {
    p_payment: input.paymentId,
    p_reason: input.reason,
    p_amended_by: input.recordedBy ?? "",
    p_amount: input.amount,
    p_paid_on: input.paidOn || null,
    p_method: input.method ?? "",
    p_reference: input.reference ?? "",
    p_proof_path: input.proofPath ?? "",
    p_description: input.description ?? "",
    p_request_key: input.requestKey ?? null,
  });
  const saved = fromDatabase(data, error);
  return { ...saved, oldReceipt: String((data as any)?.amended?.old_receipt?.number ?? "") };
}
