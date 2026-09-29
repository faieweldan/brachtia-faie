import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";

import { PdfPageViewer } from "@/components/admin/PdfPageViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PdfResult = { ok: true; base64: string } | { ok: false; error: string };

/**
 * The eye icon: the document as the PDF it prints as, laid out by a real
 * Word engine - page breaks, signature lines and page numbers exactly as they
 * will be signed. The on-page view is quicker to redraw while values are
 * typed, but it is an imitation; this is the one to trust (29 Sep 2026).
 */
export function ExactPreviewButton({
  title,
  load,
  disabled,
}: {
  title: string;
  /** makes the PDF on request; nothing is saved */
  load: () => Promise<PdfResult | null>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  // the PDF lives in the browser only while the window is open
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  async function show() {
    setOpen(true);
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const res = await load();
      if (!res) setError("There is no document to preview.");
      else if (!res.ok) setError(res.error);
      else {
        const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        setUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The preview could not be made.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void show()}>
        <Eye className="size-4" /> Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {busy ? (
            <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Laying out the pages…
            </p>
          ) : error ? (
            <p className="py-24 text-center text-sm text-destructive">{error}</p>
          ) : url ? (
            <PdfPageViewer url={url} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
