import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Check, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { referenceFor, type DocumentVersion } from "@/lib/document-versions";

/**
 * A PDF - an invoice, a receipt - shown inside the system, in a window over the
 * page, instead of downloading it or opening a new tab.
 *
 * The PDF is built in the browser and lives only while the window is open;
 * Download is there for when a copy is actually wanted.
 */

/**
 * The versions of one document, and how to build each of them.
 *
 * Given to a preview that has a history worth stepping through. The working
 * copy is always the last stop and is not a version yet - downloading it is
 * what makes it one, because that is the moment it can reach the student.
 */
export type VersionNav = {
  /** the reference without the /2, e.g. "BH-240926-QT0035" */
  reference: string;
  /** every version already given out, oldest first */
  load: () => Promise<DocumentVersion[]>;
  /** rebuild the PDF of a version as it was given out */
  buildVersion: (v: DocumentVersion) => Promise<string>;
  /** record the working copy as the next version; returns which one it became */
  freeze: () => Promise<{ version: number }>;
};

/** One stop in the preview: a version already given out, or the working copy. */
type Stop = { version: DocumentVersion | null };

/** The day a version went out, short enough to sit at the end of a menu row. */
const sentOn = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
};

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
  versions,
  children,
  ...button
}: {
  title: string;
  fileName: string;
  /** makes the PDF and returns its link - see invoicePdfUrl / receiptPdfUrl */
  build: () => Promise<string>;
  /** given when the document keeps a history worth stepping through */
  versions?: VersionNav;
  children: ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [at, setAt] = useState(0);
  const [freezing, setFreezing] = useState(false);

  const stop = stops[at];
  const onWorkingCopy = Boolean(stop) && stop!.version === null;
  // the working copy is always the last stop, and is not one of them
  const sent = Math.max(0, stops.length - 1);
  const shown = stop?.version;
  // the working copy has no number of its own until it is downloaded
  const label = shown
    ? referenceFor(versions?.reference ?? shown.reference, shown.version)
    : (versions?.reference ?? "");

  function close() {
    setUrl(null);
    setStops([]);
    setAt(0);
  }

  async function show(next: number, list: Stop[]) {
    const target = list[next];
    if (!target) return;
    setLoading(true);
    try {
      const built = target.version ? await versions!.buildVersion(target.version) : await build();
      // the effect below frees whichever link this replaces - each one holds a
      // whole PDF in memory, and stepping through versions builds a new one
      setUrl(built);
      setAt(next);
    } catch {
      toast.error(`Could not open the ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  async function open() {
    if (!versions) {
      setLoading(true);
      try {
        setUrl(await build());
      } catch {
        toast.error(`Could not open the ${title.toLowerCase()}`);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    let list: Stop[] = [{ version: null }];
    try {
      // a history that cannot be read is not a reason to refuse the preview
      const found = await versions.load();
      list = [...found.map((v) => ({ version: v })), { version: null }];
    } catch {
      /* the working copy on its own */
    } finally {
      setLoading(false);
    }
    setStops(list);
    await show(list.length - 1, list);
  }

  /**
   * Downloading the working copy is what makes it a version, so the history is
   * re-read afterwards and the window lands on the version it just became.
   */
  async function afterDownload() {
    if (!versions || !onWorkingCopy || freezing) return;
    setFreezing(true);
    try {
      await versions.freeze();
      const found = await versions.load();
      setStops([...found.map((v) => ({ version: v })), { version: null }]);
      setAt(Math.max(0, found.length - 1));
    } catch {
      toast.error("Downloaded, but could not record which version it was");
    } finally {
      setFreezing(false);
    }
  }

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!versions) {
    return (
      <>
        <Button {...button} disabled={button.disabled || loading} onClick={() => void open()}>
          {children}
        </Button>
        <PdfPreviewDialog title={title} fileName={fileName} url={url} onClose={close} />
      </>
    );
  }

  const downloadName = label ? `${fileName.replace(/\.pdf$/i, "")}-${label}.pdf` : fileName;

  return (
    <>
      <Button {...button} disabled={button.disabled || loading} onClick={() => void open()}>
        {children}
      </Button>
      <Dialog open={Boolean(url)} onOpenChange={(o) => !o && close()}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[94vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border py-3 pl-5 pr-14">
            <div className="flex min-w-0 items-center gap-3">
              <DialogTitle className="truncate text-base">{title}</DialogTitle>
              {/* the whole history in one menu: how many there are is the
                  first thing asked, and arrows alone never answer it */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 shrink-0" disabled={loading}>
                    {/* what you are looking at, then how many have gone out -
                        never both saying the same thing */}
                    {onWorkingCopy ? (sent ? "Working copy" : "Not sent yet") : label}
                    {sent ? (
                      <span className="ml-1 text-muted-foreground">· {sent} sent</span>
                    ) : null}
                    <ChevronDown className="ml-0.5 size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56">
                  {stops.map((s, i) => (
                    <DropdownMenuItem
                      key={s.version?.id ?? "working"}
                      onSelect={() => void show(i, stops)}
                      className="gap-2"
                    >
                      <Check className={`size-3.5 ${i === at ? "" : "invisible"}`} />
                      <span className="flex-1">
                        {s.version
                          ? referenceFor(
                              versions.reference || s.version.reference,
                              s.version.version,
                            )
                          : "Working copy"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.version ? sentOn(s.version.createdAt) : "not sent yet"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {url ? (
              <Button asChild size="sm" variant="outline" disabled={freezing}>
                <a href={url} download={downloadName} onClick={() => void afterDownload()}>
                  <Download className="size-4" /> Download
                </a>
              </Button>
            ) : null}
          </div>
          {url ? (
            <iframe
              src={`${url}#navpanes=0&view=FitH`}
              title={title}
              className="min-h-0 w-full flex-1 bg-muted"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
