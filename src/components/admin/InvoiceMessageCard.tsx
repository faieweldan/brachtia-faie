import { useState } from "react";

import { MessageCard, useSentOnce, type MessageAttachment } from "@/components/admin/MessageCard";
import { company, formatRM } from "@/data/properties";
import { greetingName } from "@/lib/greeting";
import { LANDLORD_ENTITY } from "@/lib/declaration";
import { BOOKING_FEE } from "@/lib/invoices";

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
  /** money already in on an earlier invoice - the booking fee is behind them */
  paidBefore: number;
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
  /*
   * A second invoice after the first was paid in full (a room upgrade) asks
   * for the difference only - their room has been secured since the first
   * payment, so naming the booking fee again is wrong (Dani, 13 Oct 2026).
   */
  const feeBehind = d.isBalance || d.paidBefore > 0;
  const splitFee = !feeBehind && d.amount > BOOKING_FEE;

  // built as paragraphs, so a line that has nothing to say can be left out
  // without taking a blank line with it
  const facts = [`💰 Amount due: *${formatRM(d.amount)}*`];
  if (d.dueDate) facts.push(`📅 Payment due by: *${d.dueDate}*`);
  if (splitFee) {
    facts.push(`To secure your room now: ${formatRM(BOOKING_FEE)} booking fee`);
    facts.push(`Balance after that: ${formatRM(d.amount - BOOKING_FEE)}`);
  } else if (d.paid > 0) {
    // what they already sent, so the smaller figure above is not a surprise
    facts.push(`Already received: ${formatRM(d.paid)} — thank you`);
  }

  return [
    `Dear ${greetingName(d.name)},`,
    `Please find your invoice details here — *${d.reference}*.`,
    facts.join("\n"),
    [
      "I've attached the invoice, which has our bank details on it.",
      `Once you've paid, please send the payment proof here and we'll issue your receipt.${
        feeBehind
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

export type InvoiceAttachment = MessageAttachment;

export function InvoiceMessageCard({
  studentName,
  reference,
  amount,
  paid = 0,
  dueDate,
  phone,
  isBalance = false,
  paidBefore = 0,
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
  /** paid on the booking's earlier invoices - the fee is not asked for again */
  paidBefore?: number;
  attachments: InvoiceAttachment[];
  id?: string;
}) {
  const [message, setMessage] = useState(() =>
    paymentMessage({ name: studentName, reference, amount, paid, dueDate, isBalance, paidBefore }),
  );
  /*
   * Open by itself until it is sent, closed after. Remembered per invoice and
   * amount on this browser, so the balance message - a new amount - opens again
   * after the fee is paid.
   */
  const { sent, markSent, open, setOpen } = useSentOnce(`brachtia-invoice-msg-${reference}-${amount}`);

  return (
    <MessageCard
      id={id}
      title={isBalance ? "Ask for the balance" : "Ask for payment"}
      subtitle={`${reference} · ${formatRM(amount)} due`}
      message={message}
      onMessageChange={setMessage}
      phone={phone}
      sent={sent}
      open={open}
      onOpenChange={setOpen}
      onSent={markSent}
      rows={12}
      attachments={attachments}
    />
  );
}
