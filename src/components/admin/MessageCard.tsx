import { useState, type ReactNode } from "react";
import { Check, Copy, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { MessageToggle } from "@/components/admin/MessageToggle";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { waDigits } from "@/lib/reference-data";

/** A PDF the message says is attached - opened here, saved, then attached in WhatsApp. */
export type MessageAttachment = { label: string; fileName: string; build: () => Promise<string> };

/**
 * One ready-made WhatsApp message, the same way every time (Dani, 27 Oct 2026):
 * amber until sent, green after; the text shown and editable before it goes;
 * Copy or Open in WhatsApp; and it closes once sent. The viewing, invoice,
 * welcome and signing messages each supply only their words and when they
 * count as sent - five copies of this frame had drifted apart, and the viewing
 * message never had one.
 *
 * WhatsApp's own markup carries the styling: *bold*, blank lines between parts.
 */
export function MessageCard({
  title,
  subtitle,
  message,
  onMessageChange,
  phone,
  sent,
  open,
  onOpenChange,
  onSent,
  rows = 10,
  attachments = [],
  actions,
  id,
  highlight,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** empty while it is being prepared */
  message: string;
  onMessageChange: (next: string) => void;
  phone: string;
  sent: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** copied or opened in WhatsApp - the card closes either way */
  onSent: () => void;
  rows?: number;
  attachments?: MessageAttachment[];
  /** buttons of this message's own, beside Copy and WhatsApp */
  actions?: ReactNode;
  id?: string | undefined;
  highlight?: boolean | undefined;
}) {
  const digits = waDigits(phone);

  function done() {
    onSent();
    onOpenChange(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // the browser refused the clipboard - it stays open to copy by hand
      toast.error("Could not copy", { description: "Select the message and copy it by hand." });
      return;
    }
    toast.success("Message copied", { description: "Paste it into WhatsApp." });
    done();
  }

  return (
    <div
      id={id}
      className={`scroll-mt-6 rounded-xl border p-4 transition-shadow duration-500 ${
        highlight ? "ring-2 ring-brand-deep/20" : ""
      } ${sent ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-deep">{title}</p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sent ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              <Check className="size-3" /> Sent
            </span>
          ) : (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              Not sent yet
            </span>
          )}
          <MessageToggle open={open} onToggle={() => onOpenChange(!open)} />
        </div>
      </div>
      {open ? (
        message ? (
          <div className="mt-3 space-y-3">
            {/* editable, so a line can be added before sending */}
            <Textarea value={message} onChange={(e) => onMessageChange(e.target.value)} rows={rows} className="bg-background" />
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
                    onClick={done}
                  >
                    <MessageCircle className="size-4" /> Open in WhatsApp
                  </a>
                </Button>
              ) : null}
              {actions}
            </div>
            {attachments.length ? (
              // WhatsApp cannot take files from a link: download these and attach them
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Attach</span>
                {attachments.map((a) => (
                  <PdfPreviewButton key={a.fileName} size="sm" variant="ghost" title={a.label} fileName={a.fileName} build={a.build}>
                    <FileText className="size-4" /> {a.label}
                  </PdfPreviewButton>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Preparing the message…</p>
        )
      ) : null}
    </div>
  );
}

/**
 * Sent, remembered in this browser under `key` - for messages with no record of
 * their own. Open by itself until then, when `startOpen`.
 */
export function useSentOnce(key: string, startOpen = true) {
  const read = () => {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  };
  const [sent, setSent] = useState(read);
  const [open, setOpen] = useState(() => startOpen && !read());
  const markSent = () => {
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      /* not remembered - it opens again next time */
    }
    setSent(true);
  };
  return { sent, markSent, open, setOpen };
}
