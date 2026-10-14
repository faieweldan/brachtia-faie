import { useState, type ComponentProps } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * A link to send someone, as a button that copies it (Dani, 14 Oct 2026) - the
 * Application Form Link on a resident's profile, the signing link under the
 * signing message. A long URL on the page is hard to copy and reads as noise;
 * the chain says "a link", one click puts it on the clipboard.
 *
 * `link` is the URL, or a function that makes it (the profile link is created
 * on first use).
 */
export function CopyLinkButton({
  label,
  link,
  copied,
  note,
  className = "",
  ...button
}: {
  label: string;
  link: string | (() => Promise<string>);
  /** the toast once copied: "Signing link copied" */
  copied: string;
  /** under it: "Send it to the resident. It works for 30 days." */
  note?: string;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      const url = typeof link === "string" ? link : await link();
      await navigator.clipboard.writeText(url);
      toast.success(copied, note ? { description: note } : undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      {...button}
      className={className}
      disabled={busy || button.disabled}
      onClick={() => void copy()}
    >
      <Link2 className="mr-1.5 size-3.5" />
      {busy ? "Preparing…" : label}
    </Button>
  );
}
