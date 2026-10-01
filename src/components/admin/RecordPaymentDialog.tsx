import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/admin/ops-ui";
import { Choice } from "@/components/admin/Choice";
import { paymentMissing, ruleFor } from "@/lib/payment-methods";
import { recordPayment } from "@/lib/admin.functions";
import { afterPaymentRecorded, uploadProof } from "@/lib/billing-client";
import { formatRM } from "@/data/properties";
import { PAY_METHODS } from "@/lib/ops-store";
import { paymentProofUrl } from "@/lib/resident-billing.functions";

export type PayableInvoice = {
  id: string;
  number: string;
  outstanding: number;
  /** whose folder the proof is filed in - see proofOwner */
  owner: string;
  /** who it is for, when the page does not already say */
  label?: string;
  /** what the money is for, filled in - "Booking fee" */
  description?: string;
  /** what the box is called, when it is not just any payment - "Record booking fee" */
  title?: string;
};

/**
 * Record money received against one invoice: what it was for, the date, the
 * bank reference, the amount, and a proof.
 *
 * The resident's Payments tab and the Collections page both use this, and it
 * calls the same recordPayment the booking page does - so a receipt is issued
 * and the invoice becomes part paid or paid, whichever page the money was
 * recorded on.
 *
 * Give it a `key` of the invoice id, so it starts fresh for each invoice.
 */
export function RecordPaymentDialog({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: PayableInvoice | null;
  onClose: () => void;
  /** after the payment is saved - the booking page moves on to its next step */
  onRecorded?: () => void;
}) {
  const queryClient = useQueryClient();
  // always empty, the booking fee included: a figure that arrives already filled
  // in gets saved unread, and the amount is the one thing someone came here to
  // type - Lav, 21 Sept 2026
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(PAY_METHODS[0] ?? "");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function upload(file: File) {
    if (!invoice) return;
    setUploading(true);
    try {
      setProof({ name: file.name, path: await uploadProof(file, invoice.owner) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the proof");
    } finally {
      setUploading(false);
    }
  }

  /*
   * What is required depends on how it was paid (Dani, 1 Oct 2026): a transfer
   * needs its reference and slip, a cheque its number and a photo, and cash
   * neither - the receipt issued is the record. The rule lives in
   * payment-methods.ts, so this form and the server ask the same things.
   */
  const rule = ruleFor(method);
  const missing = paymentMissing({ method, reference, proofPath: proof?.path ?? "" });
  const complete = Number(amount) > 0 && !!paidOn && !missing;

  async function save() {
    if (!invoice) return;
    const value = Number(amount);
    if (!(value > 0)) return void toast.error("Enter the amount received");
    if (!paidOn) return void toast.error("Enter the payment date");
    if (missing) return void toast.error(missing);

    setSaving(true);
    try {
      const res = await recordPayment({
        data: {
          invoiceId: invoice.id,
          amount: value,
          paidOn,
          method,
          // a method with no reference keeps none, even one typed before switching
          reference: rule.reference ? reference.trim() : "",
          proofPath: proof?.path ?? "",
          description: description.trim(),
        },
      });
      await afterPaymentRecorded(queryClient, res);
      onClose();
      onRecorded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="admin-ui">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">
            {invoice?.title ?? "Record payment"}
          </DialogTitle>
          <DialogDescription>
            {invoice
              ? [invoice.label, invoice.number, `${formatRM(invoice.outstanding)} outstanding`]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* the money first, and the cursor starts on the amount - that is what
              this box is for, and what someone came here to type */}
          <Text label="Payment date" type="date" value={paidOn} onChange={setPaidOn} required />
          <Text
            label="Amount (RM)"
            type="number"
            value={amount}
            onChange={setAmount}
            autoFocus
            required
          />
          {/* how it was paid comes first: it decides what else is asked */}
          <Choice label="Method" value={method} onChange={setMethod} options={PAY_METHODS} />
          {rule.reference ? (
            <Text
              label={rule.reference.label}
              value={reference}
              onChange={setReference}
              placeholder={rule.reference.placeholder}
              required
            />
          ) : (
            <div className="hidden sm:block" />
          )}
          {/* after the money, not before it: the amount and the invoice it lands
              on already say what this is, so an empty box reads as nothing missing */}
          <div className="sm:col-span-2">
            <Text
              label="Description (optional)"
              value={description}
              onChange={setDescription}
              placeholder="e.g. Booking fee, Balance"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            {/* hand-rolled markup, so the same dot is drawn here by hand */}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {rule.proof.required ? "Payment proof" : "Payment proof (optional)"}
              {proof || !rule.proof.required ? null : (
                <span aria-hidden title="Still empty" className="size-1.5 rounded-full bg-brand" />
              )}
            </p>
            <Input
              type="file"
              accept="image/*,application/pdf"
              disabled={uploading || saving}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {uploading
                ? "Uploading…"
                : proof
                  ? `Attached: ${proof.name}`
                  : rule.proof.hint}
            </p>
          </div>
        </div>

        <Button onClick={() => void save()} disabled={saving || uploading || !complete}>
          {saving ? "Saving…" : "Save & issue receipt"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Opens a payment proof. The link is made on click, and lasts ten minutes. */
export function ProofLink({ path }: { path: string }) {
  if (!path) return null;
  return (
    <button
      type="button"
      className="text-xs font-medium text-brand-deep underline-offset-2 hover:underline"
      onClick={() => {
        // the tab is opened now, inside the click, or the browser blocks it
        const tab = window.open("", "_blank");
        void paymentProofUrl({ data: { path } })
          .then(({ url }) => {
            if (tab) tab.location.href = url;
          })
          .catch(() => {
            tab?.close();
            toast.error("Could not open the proof");
          });
      }}
    >
      Proof
    </button>
  );
}
