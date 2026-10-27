import { useEffect, useState } from "react";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { toast } from "sonner";

import { MessageCard, useSentOnce } from "@/components/admin/MessageCard";
import { getOrCreateProfileLink } from "@/lib/profile-link.functions";

/**
 * The message a resident is sent when their documents are ready, with their
 * signing link in it - Dani's wording, 30 Sep 2026. Shown like the booking
 * page's message cards: seen and edited before it is copied or sent.
 * *bold* is WhatsApp's bold.
 */
const messageFor = (link: string) =>
  [
    "Hi! Your *Tenancy Agreement (TA)* is now ready for your review. 😊",
    "",
    "Please take some time to read through and understand the agreement. Once everything is in order, you may proceed to sign it here:",
    `🔗 ${link}`,
    "",
    "If you have any questions or notice anything that needs clarification, feel free to contact us before signing.",
    "",
    "Please note that the *Inventory section at the end of the agreement should only be completed after you have checked in*, so you can verify the actual condition and items in the unit. This section will remain open for submission for *48 hours after your check-in*.",
    "",
    "Thank you!",
  ].join("\n");

/*
 * Open by itself when a pack has just been made and its message not sent yet -
 * the next thing to do is send it; closed once sent (Dani, 1 Oct 2026).
 * Remembered in this browser, per pack.
 */
export function SigningMessageCard({ residentId, phone, packId, fresh }: { residentId: string; phone: string; packId: string; fresh: boolean }) {
  const { sent, markSent, open, setOpen } = useSentOnce(`brachtia-signing-copied-${packId}`, fresh);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  // the link is made (or the live one reused) only when the message is opened
  useEffect(() => {
    if (!open || message) return;
    let live = true;
    getOrCreateProfileLink({ data: { residentId } })
      .then(({ token }) => {
        if (!live) return;
        const url = `${window.location.origin}/sign/${token}`;
        setLink(url);
        setMessage(messageFor(url));
      })
      .catch(() => live && toast.error("Could not create the signing link"));
    return () => {
      live = false;
    };
  }, [open, message, residentId]);

  return (
    <MessageCard
      title={<><span aria-hidden>📩</span> Signing message</>}
      message={message}
      onMessageChange={setMessage}
      phone={phone}
      sent={sent}
      open={open}
      onOpenChange={setOpen}
      onSent={markSent}
      rows={14}
      // the signing link on its own, one click to copy - like the Application Form Link (Dani, 14 Oct 2026)
      actions={link ? <CopyLinkButton label="Signing link" link={link} copied="Signing link copied" /> : null}
    />
  );
}
