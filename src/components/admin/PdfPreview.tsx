import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A PDF - an invoice, a receipt - shown inside the system, in a window over the
 * page, instead of downloading it or opening a new tab.
 *
 * The PDF is built in the browser and lives only while the window is open;
 * Download is there for when a copy is actually wanted.
 */

/** The window itself, for a PDF already built - a menu item opens it the same way the button does. */
export function PdfPreviewDialog({
  title,
  fileName,
  url,
  onClose,
}: {
  title: string;
  fileName: string;
  url: string | null;
  onClose: () => void;
}) {
  // the link holds the whole PDF in memory: let it go when the window closes
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <Dialog open={Boolean(url)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[94vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border py-3 pl-5 pr-14">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          {url ? (
            <Button asChild size="sm" variant="outline">
              <a href={url} download={fileName}>
                <Download className="size-4" /> Download
              </a>
            </Button>
          ) : null}
        </div>
        {url ? (
          <iframe
            // no page strip, page fitted to the width - the text reads at a glance
            src={`${url}#navpanes=0&view=FitH`}
            title={title}
            className="min-h-0 w-full flex-1 bg-muted"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PdfPreviewButton({
  title,
  fileName,
  build,
  children,
  ...button
}: {
  title: string;
  fileName: string;
  /** makes the PDF and returns its link - see invoicePdfUrl / receiptPdfUrl */
  build: () => Promise<string>;
  children: ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      setUrl(await build());
    } catch {
      toast.error(`Could not open the ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button {...button} disabled={button.disabled || loading} onClick={() => void open()}>
        {children}
      </Button>
      <PdfPreviewDialog title={title} fileName={fileName} url={url} onClose={() => setUrl(null)} />
    </>
  );
}
