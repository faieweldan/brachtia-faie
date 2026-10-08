import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
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

/*
 * Open by itself when a pack has just been made and its message not copied
 * yet - the next thing to do is send it; closed once copied (Dani, 1 Oct
 * 2026). Whether it was copied is remembered in this browser, per pack.
 */
const copiedKey = (packId: string) => `brachtia-signing-copied-${packId}`;
const wasCopied = (packId: string) => {
  try {
    return !!localStorage.getItem(copiedKey(packId));
  } catch {
    return false;
  }
};

export function SigningMessageCard({ residentId, phone, packId, fresh }: { residentId: string; phone: string; packId: string; fresh: boolean }) {
  const [copied, setCopied] = useState(() => wasCopied(packId));
  const [open, setOpen] = useState(() => fresh && !wasCopied(packId));
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // the browser refused the clipboard - it stays open to copy by hand
      toast.error("Could not copy", { description: "Select the message and copy it by hand." });
      return;
    }
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
    try {
      localStorage.setItem(copiedKey(packId), new Date().toISOString());
    } catch {
      /* not remembered - it just opens again next time */
    }
    setCopied(true);
    setOpen(false);
  }

  const digits = waDigits(phone);

  return (
    <div className={`rounded-xl border p-4 ${copied ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
          <span aria-hidden>📩</span> Signing message
          {copied ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              <Check className="size-3" /> Copied
            </span>
          ) : (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              Not sent yet
            </span>
          )}
        </p>
        <MessageToggle open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      {open ? (
        message ? (
          <div className="mt-3 space-y-3">
            {/* editable, so a line can be added before sending */}
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={12} className="bg-background" />
            {/* a text box cannot hold a link, so the signing link is also here to open (Dani, 8 Oct 2026) */}
            {link ? (
              <p className="flex min-w-0 items-center gap-1.5 text-xs">
                <span className="shrink-0 text-muted-foreground">Signing link:</span>
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
                  <span className="truncate">{link}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              </p>
            ) : null}
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
