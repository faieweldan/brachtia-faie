import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Check, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ImageViewer, PdfPageViewer } from "@/components/admin/PdfPageViewer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { referenceFor, versionLabel, type DocumentVersion } from "@/lib/document-versions";

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
 * Version 1 is the original the student asked for; later ones are what
 * Brachtia changed. A document that records a version every time it is saved
 * gives no `freeze` - its newest version IS the current one, so there is no
 * unsaved copy to offer. One that does not record itself gives `freeze`, and
 * downloading is what turns the working copy into a version.
 */
export type VersionNav = {
  /** the reference without the /1, e.g. "BH-240926-QT0035" */
  reference: string;
  /** every version, oldest first */
  load: () => Promise<DocumentVersion[]>;
  /** rebuild the PDF of a version as it was */
  buildVersion: (v: DocumentVersion) => Promise<string>;
  /** only when the document does not record its own versions as it is saved */
  freeze?: () => Promise<{ version: number }>;
};

/** One stop in the preview: a version already given out, or the working copy. */
type Stop = { version: DocumentVersion | null };

/**
 * The stops to offer: every version, and a working copy only when there is one
 * that has not been recorded yet. A quote records itself on every save, so its
 * newest version is already the current one and a "working copy" row would be
 * the same document listed twice.
 */
const listFor = (found: DocumentVersion[], canFreeze: boolean): Stop[] =>
  canFreeze || !found.length
    ? [...found.map((v) => ({ version: v })), { version: null }]
    : found.map((v) => ({ version: v }));

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
  downloadable = true,
  downloadHint,
}: {
  title: string;
  fileName: string;
  url: string | null;
  onClose: () => void;
  /** false while the document is a draft with no number to stand behind it */
  downloadable?: boolean;
  /** what has to happen first, said where the button would have been */
  downloadHint?: string | undefined;
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
          {url && downloadable ? (
            <Button asChild size="sm" variant="outline">
              <a href={url} download={fileName}>
                <Download className="size-4" /> Download
              </a>
            </Button>
          ) : downloadHint ? (
            <p className="shrink-0 text-xs text-muted-foreground">{downloadHint}</p>
          ) : null}
        </div>
        {url ? <PreviewBody url={url} title={title} fileName={fileName} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function PdfPreviewButton({
  title,
  fileName,
  build,
  versions,
  downloadable = true,
  downloadHint,
  children,
  ...button
}: {
  title: string;
  fileName: string;
  /** makes the PDF and returns its link - see invoicePdfUrl / receiptPdfUrl */
  build: () => Promise<string>;
  /** given when the document keeps a history worth stepping through */
  versions?: VersionNav;
  /** false while the document is a draft with no number to stand behind it */
  downloadable?: boolean;
  /** what has to happen first, said where the button would have been */
  downloadHint?: string | undefined;
  children: ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [at, setAt] = useState(0);
  const [freezing, setFreezing] = useState(false);

  const stop = stops[at];
  const onWorkingCopy = Boolean(stop) && stop!.version === null;
  const kept = stops.filter((s) => s.version).length;
  const shown = stop?.version;
  // a working copy has no number of its own until it is recorded
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
      list = listFor(found, Boolean(versions.freeze));
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
    if (!versions?.freeze || !onWorkingCopy || freezing) return;
    setFreezing(true);
    try {
      await versions.freeze!();
      const found = await versions.load();
      setStops(listFor(found, true));
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
        <PdfPreviewDialog
          title={title}
          fileName={fileName}
          url={url}
          onClose={close}
          downloadable={downloadable}
          downloadHint={downloadHint}
        />
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
                    {/* what you are looking at, then how deep the history is -
                        never both saying the same thing */}
                    {onWorkingCopy ? (kept ? "Working copy" : "Not saved yet") : label}
                    {kept > 1 ? (
                      <span className="ml-1 text-muted-foreground">· {kept - 1} revised</span>
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
                          ? versionLabel(
                              versions.reference || s.version.reference,
                              s.version.version,
                              s.version.issuedAs,
                            )
                          : "Working copy"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.version ? sentOn(s.version.createdAt) : "not saved yet"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {url && downloadable ? (
              <Button asChild size="sm" variant="outline" disabled={freezing}>
                <a href={url} download={downloadName} onClick={() => void afterDownload()}>
                  <Download className="size-4" /> Download
                </a>
              </Button>
            ) : downloadHint ? (
              <p className="shrink-0 text-xs text-muted-foreground">{downloadHint}</p>
            ) : null}
          </div>
          {url ? <PreviewBody url={url} title={title} fileName={downloadName} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/*
 * Every preview with the same controls (Dani, 6 Oct 2026): - and +, fit to
 * screen, full screen, download - a photo as a photo, a PDF page by page. The
 * browser's own PDF frame had its own buttons, different in every browser and
 * missing on a phone.
 */
function PreviewBody({ url, title, fileName }: { url: string; title: string; fileName: string }) {
  // the window's own Download, at the top, is the one: an invoice's records the version sent
  if (/\.(jpe?g|png|webp|gif)$/i.test(fileName)) return <ImageViewer url={url} alt={title} fileName={fileName} fill hideDownload />;
  return <PdfPageViewer url={url} fileName={fileName} fill className="[&_a[download]]:hidden" />;
}
