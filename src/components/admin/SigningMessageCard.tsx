import { useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageToggle } from "@/components/admin/MessageToggle";
import { getOrCreateProfileLink } from "@/lib/profile-link.functions";
import { waDigits } from "@/lib/reference-data";

/**
 * The message a resident is sent when their documents are ready, with their
 * signing link in it - Dani's wording, 30 Sep 2026. Shown like the booking
 * page's message cards: seen and edited before it is copied or sent.
 * *bold* is WhatsApp's bold.
 */
const messageFor = (link: string) =>
  [
    "Hi! Your Tenancy Agreement (TA) is now ready for your review. 😊",
    "",
    "Please take some time to read through and understand the agreement. Once everything is in order, you may proceed to sign it here:",
    link,
    "",
    "If you have any questions or notice anything that needs clarification, feel free to contact us before signing.",
    "",
    "Please note that the *Inventory section at the end of the agreement should only be completed after you have checked in*, so you can verify the actual condition and items in the unit. This section will remain open for submission for *48 hours after your check-in*.",
    "",
    "Thank you!",
  ].join("\n");

export function SigningMessageCard({ residentId, phone }: { residentId: string; phone: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  // the link is made (or the live one reused) only when the message is opened
  useEffect(() => {
    if (!open || message) return;
    let live = true;
    getOrCreateProfileLink({ data: { residentId } })
      .then(({ token }) => live && setMessage(messageFor(`${window.location.origin}/sign/${token}`)))
      .catch(() => live && toast.error("Could not create the signing link"));
    return () => {
      live = false;
    };
  }, [open, message, residentId]);

  async function copy() {
    await navigator.clipboard.writeText(message);
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
  }

  const digits = waDigits(phone);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-deep">Signing message</p>
        <MessageToggle open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      {open ? (
        message ? (
          <div className="mt-3 space-y-3">
            {/* editable, so a line can be added before sending */}
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={12} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy()}>
                <Copy className="size-4" /> Copy message
              </Button>
              {digits ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> Open in WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Preparing the message…</p>
        )
      ) : null}
    </div>
  );
}
