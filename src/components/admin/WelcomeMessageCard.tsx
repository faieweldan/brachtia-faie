import { greetingName } from "@/lib/greeting";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MessageCard, type MessageAttachment } from "@/components/admin/MessageCard";
import { recordBookingEvent } from "@/lib/booking-activity.functions";

/**
 * The WhatsApp message sent once the booking fee is in and the resident created:
 * thanks, the invoice and receipt attached, and the Resident Form link for their
 * details and documents.
 *
 * The link is the same one "Copy link" on the resident page makes - reused while
 * it is live - so a student sent it twice still has one link. Until it is sent
 * the message is ready without a click; copying it or opening WhatsApp records
 * it as sent, with the staff member's name.
 */

/**
 * Brachtia's wording, word for word. Only the link is filled in. A blank line
 * between its parts and *bold* on what to do, so it reads like the other
 * messages once pasted (Dani, 27 Oct 2026).
 */
const welcomeMessage = (name: string, link: string, hasProof: boolean) =>
  [
    `Dear ${greetingName(name)},`,
    "Thank you for your booking fee payment! 🎉 We’re excited to welcome you to Brachtia Homes.",
    // a proof is only uploaded sometimes - never promise a part that is not there
    hasProof
      ? "Attached is one document with your updated invoice, payment receipt and proof of payment for your records."
      : "Attached is one document with your updated invoice and payment receipt for your records.",
    `To help us prepare for your arrival, please complete the *Resident Form* and provide the required details and documents:\n🔗 ${link}`,
    "Once completed, our team will proceed with the next steps for your tenancy and move-in.",
    "Thank you,\nBrachtia Homes 🏡",
  ].join("\n\n");

async function makeMessage(residentId: string, name: string, hasProof: boolean) {
  const { getOrCreateProfileLink } = await import("@/lib/profile-link.functions");
  const { token } = await getOrCreateProfileLink({ data: { residentId } });
  return welcomeMessage(name, `${window.location.origin}/my-profile/${token}`, hasProof);
}

/** A PDF the message says is attached - opened here, downloaded, then attached in WhatsApp. */
export type WelcomeAttachment = MessageAttachment;

export function WelcomeMessageCard({
  residentId,
  studentName,
  enquiryId,
  phone,
  attachments,
  hasProof = false,
  sent,
  onSent,
  id,
  highlight,
}: {
  residentId: string;
  /** greeted by name, not as "Student" */
  studentName: string;
  enquiryId: string;
  phone: string;
  attachments: WelcomeAttachment[];
  /** the payment came with a slip, so the document really does have all three parts */
  hasProof?: boolean;
  /** already sent once - the message waits for a click instead */
  sent: boolean;
  onSent: () => void;
  /** where Next Action scrolls to */
  id?: string;
  /** outlined for a moment after Next Action brought you here */
  highlight?: boolean;
}) {
  const [message, setMessage] = useState("");
  // open by itself until it is sent, like the signing message (Dani, 6 Oct 2026)
  const [open, setOpen] = useState(Boolean(highlight) || !sent);
  useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  // the link is made (or the live one reused) when the message is to be seen
  useEffect(() => {
    if (!open || message) return;
    let live = true;
    makeMessage(residentId, studentName, hasProof)
      .then((m) => live && setMessage(m))
      .catch(() => live && toast.error("Could not create the link"));
    return () => {
      live = false;
    };
  }, [open, message, residentId, hasProof]);

  // logged once, by whoever sends it
  const logged = useRef(sent);
  function markSent() {
    if (logged.current) return;
    logged.current = true;
    void recordBookingEvent({
      data: { enquiryId, kind: "welcome_sent", summary: "Welcome message sent" },
    })
      .then(onSent)
      .catch(() => {
        logged.current = false;
      });
  }

  return (
    <MessageCard
      id={id}
      highlight={highlight}
      title="Welcome message"
      message={message}
      onMessageChange={setMessage}
      phone={phone}
      sent={sent}
      open={open}
      onOpenChange={setOpen}
      onSent={markSent}
      rows={14}
      attachments={attachments}
    />
  );
}
