import { useState } from "react";
import { Check, Copy, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { company, formatRM } from "@/data/properties";
import { greetingName } from "@/lib/greeting";
import { LANDLORD_ENTITY } from "@/lib/declaration";
import { BOOKING_FEE } from "@/lib/invoices";
import { waDigits } from "@/lib/reference-data";

/**
 * The message that asks for the money, ready the moment the invoice exists.
 *
 * Raising an invoice and telling the student about it were two jobs, and the
 * second was done from memory in WhatsApp - so what a student was asked for
 * depended on who asked. The amount, the reference and the date come off the
 * invoice itself, which is the one place they cannot be mistyped.
 *
 * The invoice is attached by hand. A wa.me link carries text and nothing else:
 * it cannot take a file, whatever it is given. So the PDF is opened here, saved,
 * and attached in WhatsApp - the same way the welcome message already works.
 */

const paymentMessage = (d: {
  name: string;
  reference: string;
  amount: number;
  paid: number;
  dueDate: string;
  isBalance: boolean;
}) => {
  /*
   * Almost nobody pays the whole thing at once. They send the RM500 first to
   * hold the room and settle the rest later, so a message quoting only one
   * large figure asks for something the student was never going to do, and
   * leaves them working out the split themselves.
   *
   * The fee is only offered as a first step while it is still ahead of them
   * AND the invoice is actually bigger than the fee - on a smaller invoice
   * "pay RM500 first" would be asking for more than is owed.
   */
  const splitFee = !d.isBalance && d.amount > BOOKING_FEE;

  // built as paragraphs, so a line that has nothing to say can be left out
  // without taking a blank line with it
  const facts = [`Amount due: ${formatRM(d.amount)}`];
  if (d.dueDate) facts.push(`Payment due by: ${d.dueDate}`);
  if (splitFee) {
    facts.push(`To secure your room now: ${formatRM(BOOKING_FEE)} booking fee`);
    facts.push(`Balance after that: ${formatRM(d.amount - BOOKING_FEE)}`);
  } else if (d.paid > 0) {
    // what they already sent, so the smaller figure above is not a surprise
    facts.push(`Already received: ${formatRM(d.paid)} — thank you`);
  }

  return [
    `Dear ${greetingName(d.name)},`,
    `Please find your invoice details here — ${d.reference}.`,
    facts.join("\n"),
    [
      "I've attached the invoice, which has our bank details on it.",
      `Once you've paid, please send the payment proof here and we'll issue your receipt.${
        d.isBalance
          ? " Your room stays reserved for you in the meantime."
          : splitFee
            ? ` The ${company.bookingFee} booking fee secures your room straight away, and the balance is due by the date above.`
            : d.amount >= BOOKING_FEE
              ? ` The ${company.bookingFee} booking fee secures your room.`
              : // owed less than the fee - naming it would ask for more than is due
                ""
      }`,
    ].join("\n"),
    "Feel free to contact us if you have any questions. We look forward to working with you.",
    ["Have a great day!", LANDLORD_ENTITY].join("\n"),
  ].join("\n\n");
};

export type InvoiceAttachment = { label: string; fileName: string; build: () => Promise<string> };

export function InvoiceMessageCard({
  studentName,
  reference,
  amount,
  paid = 0,
  dueDate,
  phone,
  isBalance = false,
  attachments,
  id,
}: {
  studentName: string;
  /** the invoice number, as the student will see it on the paper */
  reference: string;
  /** what is still to pay, not what the invoice totalled */
  amount: number;
  /** what has come in already - the difference between the two figures */
  paid?: number;
  dueDate: string;
  phone: string;
  /** the booking fee is already in, so this asks for the rest */
  isBalance?: boolean;
  attachments: InvoiceAttachment[];
  id?: string;
}) {
  const [message, setMessage] = useState(() =>
    paymentMessage({ name: studentName, reference, amount, paid, dueDate, isBalance }),
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
  }

  const digits = waDigits(phone);

  return (
    <div id={id} className="scroll-mt-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand-deep">
            {isBalance ? "Ask for the balance" : "Ask for payment"}
          </p>
          <p className="text-xs text-muted-foreground">
            {reference} · {formatRM(amount)} due
          </p>
        </div>
        {copied ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" /> Copied
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {/* editable, so a staff member can add a line before sending */}
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={11} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy()}>
            <Copy className="size-4" /> Copy message
          </Button>
          {digits ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" /> Open in WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        {attachments.length ? (
          // WhatsApp cannot take files from a link: download these and attach them
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Attach</span>
            {attachments.map((a) => (
              <PdfPreviewButton
                key={a.fileName}
                size="sm"
                variant="ghost"
                title={a.label}
                fileName={a.fileName}
                build={a.build}
              >
                <FileText className="size-4" /> {a.label}
              </PdfPreviewButton>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
