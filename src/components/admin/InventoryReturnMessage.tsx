import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageToggle } from "@/components/admin/MessageToggle";
import { getOrCreateProfileLink } from "@/lib/profile-link.functions";
import { waDigits } from "@/lib/reference-data";

/**
 * Once Brachtia has answered the check and sent it back, the resident is told
 * so, with their link (Dani, 2 Oct 2026). One line until opened - the dialog
 * already says a lot.
 */
const checkoutMessage = (link: string) =>
  [
    "Hi! Your checkout statement is ready. 😊",
    "",
    "It shows the deposits we hold, any deductions, and the amount we will refund to you.",
    "",
    "Please open your link, read it and sign:",
    link,
    "",
    "If anything looks wrong, contact us before signing. Once you have signed, we will pay the refund and send you the proof.",
    "",
    "Thank you!",
  ].join("\n");

const messageFor = (link: string, defects: number) =>
  [
    "Hi! We have reviewed your inventory check (Schedule C). 😊",
    "",
    defects
      ? `We have replied to the ${defects === 1 ? "defect" : `${defects} defects`} you reported - ${defects === 1 ? "it is" : "each one is"} marked Resolved (fixed) or Accepted (left as it is, and recorded so you are not charged for it).`
      : "Thank you - no defects were reported.",
    "",
    "Please open your link, agree to our answers and sign:",
    link,
    "",
    "If something is still not right, change it on the same page and send it back to us.",
    "",
    "Thank you!",
  ].join("\n");

export function ReturnMessage({
  residentId,
  phone,
  defects,
  kind = "inventory",
}: {
  residentId: string;
  phone: string;
  defects: number;
  /** checkout: the checkout statement is ready to sign */
  kind?: "inventory" | "checkout";
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || message) return;
    let live = true;
    getOrCreateProfileLink({ data: { residentId } })
      .then(({ token }) => {
        const link = `${window.location.origin}/sign/${token}`;
        if (live) setMessage(kind === "checkout" ? checkoutMessage(link) : messageFor(link, defects));
      })
      .catch(() => live && toast.error("Could not create the signing link"));
    return () => {
      live = false;
    };
  }, [open, message, residentId, defects, kind]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      toast.error("Could not copy", { description: "Select the message and copy it by hand." });
      return;
    }
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
    setCopied(true);
    setOpen(false);
  }

  const digits = waDigits(phone);
  return (
    <div className={`rounded-lg border p-3 ${copied ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
          <span aria-hidden>📩</span> Tell the resident
          {copied ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              <Check className="size-3" /> Copied
            </span>
          ) : null}
        </p>
        <MessageToggle open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      {open ? (
        message ? (
          <div className="mt-3 space-y-2">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} className="bg-background text-sm" />
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
          <p className="mt-2 text-xs text-muted-foreground">Preparing the message…</p>
        )
      ) : null}
    </div>
  );
}
