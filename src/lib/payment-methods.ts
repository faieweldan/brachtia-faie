/**
 * What each way of paying needs before it can be recorded (Dani, 1 Oct 2026).
 *
 * A bank transfer has a slip and a reference to check against the statement;
 * cash has neither - the receipt Brachtia issues is the only paper there is.
 * Asking for a reference and a proof on cash made admin invent one. So each
 * method says what it needs, and the form and the server both ask the same.
 */

export type MethodRule = {
  /** null: this method has no reference, and the field is not shown */
  reference: { label: string; placeholder: string } | null;
  proof: { required: boolean; hint: string };
};

export const METHOD_RULES: Record<string, MethodRule> = {
  "DuitNow QR Pay": {
    reference: { label: "Transaction ref.", placeholder: "From the DuitNow receipt" },
    proof: { required: true, hint: "A screenshot of the DuitNow receipt" },
  },
  "Bank Transfer": {
    reference: { label: "Reference no.", placeholder: "From the bank slip" },
    proof: { required: true, hint: "A photo of the bank slip, or a PDF" },
  },
  // cash paid in at the bank: the bank's deposit slip is the proof (Dani, 6 Oct 2026)
  "Cash Deposit": {
    reference: { label: "Deposit slip no.", placeholder: "From the bank's deposit slip" },
    proof: { required: true, hint: "A photo of the bank's deposit slip, or a PDF" },
  },
  Cheque: {
    reference: { label: "Cheque no.", placeholder: "e.g. 001234 · Maybank" },
    proof: { required: true, hint: "A photo of the cheque" },
  },
  Cash: {
    reference: null,
    proof: { required: false, hint: "Optional - the receipt issued is the record of cash" },
  },
};

/** An unknown method is treated as the strictest: reference and proof. */
const STRICT: MethodRule = {
  reference: { label: "Reference no.", placeholder: "" },
  proof: { required: true, hint: "A photo or PDF of the proof" },
};

export const ruleFor = (method: string): MethodRule => METHOD_RULES[method] ?? STRICT;

/** What is still missing for this method, or "" when it can be recorded. */
export function paymentMissing(p: { method: string; reference: string; proofPath: string }): string {
  if (!p.method) return "Choose how it was paid";
  const rule = ruleFor(p.method);
  if (rule.reference && !p.reference.trim()) return `Enter the ${rule.reference.label.toLowerCase().replace(/\.$/, "")}`;
  if (rule.proof.required && !p.proofPath) return "Attach the payment proof";
  return "";
}
