import { greetingName } from "@/lib/greeting";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { MessageToggle } from "@/components/admin/MessageToggle";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordBookingEvent } from "@/lib/booking-activity.functions";
import { waDigits } from "@/lib/reference-data";

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

/** Brachtia's wording, word for word. Only the link is filled in. */
const welcomeMessage = (name: string, link: string, hasProof: boolean) =>
  [
    `Dear ${greetingName(name)},`,
    "Thank you for your booking fee payment! 🎉 We’re excited to welcome you to Brachtia Homes.",
    // a proof is only uploaded sometimes - never promise a part that is not there
    hasProof
      ? "Attached is one document with your updated invoice, payment receipt and proof of payment for your records."
      : "Attached is one document with your updated invoice and payment receipt for your records.",
    "To help us prepare for your arrival, please complete the Resident Form and provide the required details and documents:",
    `🔗 Resident Form: ${link}`,
    "Once completed, our team will proceed with the next steps for your tenancy and move-in.",
    "Thank you,",
    "Brachtia Homes 🏡",
  ].join("\n");

async function makeMessage(residentId: string, name: string, hasProof: boolean) {
  const { getOrCreateProfileLink } = await import("@/lib/profile-link.functions");
  const { token } = await getOrCreateProfileLink({ data: { residentId } });
  return welcomeMessage(name, `${window.location.origin}/my-profile/${token}`, hasProof);
}

/** A PDF the message says is attached - opened here, downloaded, then attached in WhatsApp. */
export type WelcomeAttachment = { label: string; fileName: string; build: () => Promise<string> };

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
  const [loading, setLoading] = useState(false);
  // closed until it is wanted; a card the page points at opens itself
  const [open, setOpen] = useState(Boolean(highlight));
  useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  async function prepare() {
    setLoading(true);
    try {
      setMessage(await makeMessage(residentId, studentName, hasProof));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link");
    } finally {
      setLoading(false);
    }
  }

  // not sent yet: have it ready, so the step is one click
  useEffect(() => {
    if (sent) return;
    let live = true;
    setLoading(true);
    makeMessage(residentId, studentName, hasProof)
      .then((m) => live && setMessage(m))
      .catch(() => live && toast.error("Could not create the link"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [residentId, sent, hasProof]);

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

  async function copy() {
    await navigator.clipboard.writeText(message);
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
    markSent();
  }

  const digits = waDigits(phone);

  return (
    <div
      id={id}
      className={`scroll-mt-6 rounded-xl border bg-card p-4 transition-shadow duration-500 ${
        highlight ? "border-brand-deep/40 ring-2 ring-brand-deep/20" : "border-border"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-deep">Welcome message</p>
        <div className="flex items-center gap-2">
          {sent ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="size-3.5" /> Sent
            </span>
          ) : null}
          {message ? <MessageToggle open={open} onToggle={() => setOpen((v) => !v)} /> : null}
        </div>
      </div>
      {message && open ? (
        <div className="space-y-3">
          {/* editable, so a staff member can add a line before sending */}
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} />
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
                  onClick={markSent}
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
      ) : message ? null : (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setOpen(true);
            void prepare();
          }}
        >
          <MessageCircle className="size-4" /> {loading ? "Preparing…" : "Prepare message"}
        </Button>
      )}
    </div>
  );
}
