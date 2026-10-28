import { useEffect, useState } from "react";
import { StaffPicker } from "@/components/admin/Dropdown";
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
import { canAmend, paymentMissing, ruleFor } from "@/lib/payment-methods";
import { amendPayment, recordPayment } from "@/lib/admin.functions";
import { afterPaymentRecorded, uploadProof } from "@/lib/billing-client";
import { formatRM } from "@/data/properties";
import { PAY_METHODS } from "@/lib/ops-store";
import {
  paymentHistory,
  paymentProofUrl,
  type PaymentChange,
} from "@/lib/resident-billing.functions";
import { Textarea } from "@/components/ui/textarea";
import { klToday } from "@/lib/kl-date";
import { toastTenancyOutcomes } from "@/lib/tenancy-change-toast";

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
  /** who is already known to be working - the booking's picked staff */
  staff?: string;
};

/** A payment as it was saved - what Amend payment opens the form with. */
export type AmendablePayment = {
  id: string;
  amount: number;
  paidOn: string;
  method: string;
  reference: string;
  proofPath: string;
  description: string;
  recordedBy: string;
  /** its receipt number - the one the amendment replaces */
  receipt: string;
};

/* each staff member's colour, so "by Syazwani" is told apart at a glance */
const STAFF_TONE: Record<string, string> = {
  Syazwani: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Norfadirah: "border-violet-200 bg-violet-50 text-violet-800",
  Valsala: "border-sky-200 bg-sky-50 text-sky-800",
};

/** "by Syazwani" beside a payment - who recorded it (Dani, 1 Oct 2026). */
export function StaffTag({ name }: { name: string }) {
  if (!name) return null;
  return (
    <span
      title={`Recorded by ${name}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAFF_TONE[name] ?? "border-border bg-muted text-muted-foreground"}`}
    >
      by {name}
    </span>
  );
}

/**
 * Record money received against one invoice: what it was for, the date, the
 * bank reference, the amount, and a proof.
 *
 * The resident's Payments tab and the Collections page both use this, and it
 * calls the same recordPayment the booking page does - so a receipt is issued
 * and the invoice becomes part paid or paid, whichever page the money was
 * recorded on.
 *
 * Amend payment opens this same form (28 Oct 2026), filled with what was
 * saved, with a reason to give - so a payment is corrected with exactly the
 * fields and rules it was recorded with. The wrong payment and its receipt are
 * kept with the reason, and the corrected one gets a new receipt.
 *
 * Give it a `key` of the invoice id, so it starts fresh for each invoice.
 */
export function RecordPaymentDialog({
  invoice,
  amending,
  onClose,
  onRecorded,
}: {
  invoice: PayableInvoice | null;
  /** the payment being corrected - the form opens filled with it */
  amending?: AmendablePayment;
  onClose: () => void;
  /** after the payment is saved - the booking page moves on to its next step */
  onRecorded?: () => void;
}) {
  const queryClient = useQueryClient();
  // empty when recording, the booking fee included: a figure that arrives
  // already filled in gets saved unread, and the amount is the one thing
  // someone came here to type - Lav, 21 Sept 2026. Amending starts from what
  // was saved: that is what is being checked.
  const [amount, setAmount] = useState(amending ? String(amending.amount) : "");
  const [description, setDescription] = useState(
    amending?.description ?? invoice?.description ?? "",
  );
  const [paidOn, setPaidOn] = useState(amending?.paidOn ?? klToday());
  const [method, setMethod] = useState(amending?.method ?? PAY_METHODS[0] ?? "");
  const [reference, setReference] = useState(amending?.reference ?? "");
  const [proof, setProof] = useState<{ name: string; path: string } | null>(
    amending?.proofPath ? { name: "the proof already attached", path: amending.proofPath } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // who is recording it - asked every time, as on entering a booking; an
  // amendment is recorded by whoever makes it
  const [recordedBy, setRecordedBy] = useState(amending ? "" : (invoice?.staff ?? ""));
  // why it is amended - kept with the old payment, for accounts
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<PaymentChange[] | null>(null);
  const amendingId = amending?.id ?? "";
  useEffect(() => {
    if (!amendingId) return;
    paymentHistory({ data: { paymentId: amendingId } })
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [amendingId]);
  /*
   * One key per payment being saved (15 Oct 2026): a double click, or Save again
   * after an answer that never came back, sends the same key - and the server
   * returns the payment it already saved instead of saving a second one. A new
   * key only once this payment is saved.
   */
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

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
  const reasonGiven = reason.trim().length >= 3;
  const complete =
    Number(amount) > 0 && !!paidOn && !missing && !!recordedBy && (!amending || reasonGiven);

  async function save() {
    if (!invoice) return;
    const value = Number(amount);
    if (!(value > 0)) return void toast.error("Enter the amount received");
    if (!paidOn) return void toast.error("Enter the payment date");
    if (missing) return void toast.error(missing);
    if (!recordedBy) return void toast.error("Choose who is recording this payment");
    if (amending && !reasonGiven) return void toast.error("Say why the payment is being amended");

    setSaving(true);
    try {
      const form = {
        amount: value,
        paidOn,
        method,
        // a method with no reference keeps none, even one typed before switching
        reference: rule.reference ? reference.trim() : "",
        proofPath: proof?.path ?? "",
        description: description.trim(),
        recordedBy,
        requestKey,
      };
      const res = amending
        ? await amendPayment({ data: { ...form, paymentId: amending.id, reason: reason.trim() } })
        : await recordPayment({ data: { ...form, invoiceId: invoice.id } });
      setRequestKey(crypto.randomUUID());
      if (amending)
        toast.success("Payment amended", {
          description: `${amending.receipt || "The old receipt"} is replaced by ${res.receipt?.number ?? "a new receipt"}. The old one is kept with your reason.`,
        });
      /*
       * Saved: the dialog closes now and the page catches up behind it (13 Oct
       * 2026). Waiting for every list to reload - the whole unit tree, ~1 s on
       * its own - kept the button spinning after the payment was already in.
       */
      onClose();
      onRecorded?.();
      void afterPaymentRecorded(queryClient, res);
      // an Update Tenancy IP paid in full: what it set going (Dani, 7 Oct 2026)
      toastTenancyOutcomes(res.tenancyChange);
      // any payment can move a tenancy change along (paid, new date needed) - not only one it made happen
      void queryClient.invalidateQueries({ queryKey: ["tenancy-events"] });
      void queryClient.invalidateQueries({ queryKey: ["tenancy-docs"] });
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
            {amending
              ? ["Amend payment", amending.receipt].filter(Boolean).join(" · ")
              : (invoice?.title ?? "Record payment")}
          </DialogTitle>
          <DialogDescription>
            {!invoice
              ? ""
              : amending
                ? `${invoice.number} · saved as ${formatRM(amending.amount)}. The receipt is never edited: the old one is kept with your reason, and a new one is issued.`
                : [invoice.label, invoice.number, `${formatRM(invoice.outstanding)} outstanding`]
                    .filter(Boolean)
                    .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        {amending ? (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Why is it being amended?
              {reasonGiven ? null : <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
            </p>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="e.g. Typed RM1,912.21, the bank slip says RM1,923.86"
            />
          </div>
        ) : null}

        {/* the same picker as "Who's working on this booking?" */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Recorded by
            {recordedBy ? null : <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
          </p>
          <StaffPicker value={recordedBy} onChange={setRecordedBy} />
        </div>

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
          {saving ? "Saving…" : amending ? "Save & issue new receipt" : "Save & issue receipt"}
        </Button>

        {history?.length ? <PaymentHistoryList changes={history} /> : null}
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

/** A payment's earlier versions - what it was, when, who changed it and why. */
function PaymentHistoryList({ changes }: { changes: PaymentChange[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
      <p className="font-medium text-foreground">Amended before</p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {changes.map((c) => (
          <li key={c.at}>
            {new Date(c.at).toLocaleDateString("en-MY", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {c.by ? ` · ${c.by}` : ""} — {c.reason}
            {c.was
              ? ` (was ${[formatRM(c.was.amount), c.was.reference, c.was.receipt].filter(Boolean).join(" · ")})`
              : " (proof replaced)"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Amend a payment typed wrong - the amount, date, reference or proof (28 Oct
 * 2026; it replaces Replace proof, 1 Oct 2026). Opens the same Record payment
 * form, filled with what was saved.
 */
export function AmendPaymentButton({
  invoice,
  payment,
}: {
  invoice: { id: string; number: string; outstanding: number };
  payment: AmendablePayment;
}) {
  const [open, setOpen] = useState(false);
  if (!canAmend(payment.method)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Amend
      </button>
      {open ? (
        <RecordPaymentDialog
          invoice={{
            ...invoice,
            // a new proof goes in the folder the old one was filed in
            owner: payment.proofPath.split("/")[0] || "payments",
          }}
          amending={payment}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
