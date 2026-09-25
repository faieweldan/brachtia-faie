import { useState } from "react";
import { Check, Copy, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { company, formatRM } from "@/data/properties";
import { greetingName } from "@/lib/greeting";

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
  staff: string;
  reference: string;
  amount: number;
  dueDate: string;
  residence: string;
  isBalance: boolean;
}) => {
  // built as paragraphs, so a line that has nothing to say can be left out
  // without taking a blank line with it
  const facts = [`Amount due: ${formatRM(d.amount)}`];
  if (d.dueDate) facts.push(`Payment due by: ${d.dueDate}`);

  return [
    `Hi ${greetingName(d.name)}, this is ${d.staff} from Brachtia Homes 😊`,
    d.isBalance
      ? `Here is your invoice for ${d.residence} — ${d.reference}.`
      : `Good news, your invoice for ${d.residence} is ready — ${d.reference}.`,
    facts.join("\n"),
    [
      "I've attached the invoice, which has our bank details on it.",
      `Once you've paid, please send the payment proof here and we'll issue your receipt. ${
        d.isBalance
          ? "Your room stays reserved for you in the meantime."
          : `The ${company.bookingFee} booking fee secures your room.`
      }`,
    ].join("\n"),
    "Let me know if you have any questions!",
  ].join("\n\n");
};

export type InvoiceAttachment = { label: string; fileName: string; build: () => Promise<string> };

export function InvoiceMessageCard({
  studentName,
  staffName,
  reference,
  amount,
  dueDate,
  residence,
  phone,
  isBalance = false,
  attachments,
  id,
}: {
  studentName: string;
  staffName: string;
  /** the invoice number, as the student will see it on the paper */
  reference: string;
  /** what is still to pay, not what the invoice totalled */
  amount: number;
  dueDate: string;
  residence: string;
  phone: string;
  /** the booking fee is already in, so this asks for the rest */
  isBalance?: boolean;
  attachments: InvoiceAttachment[];
  id?: string;
}) {
  const [message, setMessage] = useState(() =>
    paymentMessage({
      name: studentName,
      staff: staffName.trim() || "the team",
      reference,
      amount,
      dueDate,
      residence,
      isBalance,
    }),
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
  }

  const digits = phone.replace(/\D/g, "");

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
