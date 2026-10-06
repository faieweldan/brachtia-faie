import { ChevronLeft, ChevronRight, Download, Expand, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PDFJS_OPTIONS } from "@/lib/pdfjs-options";

type LoadedPdf = {
  numPages: number;
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: Record<string, unknown>) => { promise: Promise<void> };
  }>;
};

export function PdfPageViewer({
  url,
  className = "",
  onLastPage,
  fileName = "document.pdf",
  fill = false,
}: {
  url: string;
  className?: string;
  /** fills the window it sits in - a preview window - rather than a fixed height */
  fill?: boolean;
  /** the name a download is saved under */
  fileName?: string;
  /** called once the last page has been shown - the declaration waits for it */
  onLastPage?: () => void;
}) {
  /*
   * Every page, one under the other, so a reader can scroll (Dani, 6 Oct 2026).
   * The same viewer as before - toolbar, zoom, fit, full screen, download - the
   * arrows now scroll to the page, and "Page x of y" follows the scroll.
   */
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  /*
   * "width" fills the panel's width, for reading; "page" shows the whole page
   * at once, for checking layout; null is a chosen zoom. The one Fit button
   * only ever did width - already the default - so pressing it changed
   * nothing (30 Sep 2026).
   */
  const [fit, setFit] = useState<"width" | "page" | null>("width");
  const [error, setError] = useState("");
  /*
   * The whole screen, for a phone (Dani, 5 Oct 2026): the page in its box was
   * too small to read. A layer over the page rather than the browser's own
   * full screen, which an iPhone does not give to a page.
   */
  const [full, setFull] = useState(false);

  useEffect(() => {
    let live = true;
    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loaded = await pdfjs.getDocument({ url, ...PDFJS_OPTIONS }).promise;
      // a redrawn document keeps the page being read, not back to page 1
      if (live) { setPdf(loaded as LoadedPdf); setPage((p) => Math.min(Math.max(1, p), loaded.numPages)); setError(""); }
    }).catch(() => live && setError("Could not open this PDF preview."));
    return () => { live = false; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !frameRef.current) return;
    let cancelled = false;
    void (async () => {
      for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
        const pdfPage = await pdf.getPage(n);
        const base = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(320, frameRef.current?.clientWidth ?? base.width) - 32;
        const tall = Math.max(240, (frameRef.current?.clientHeight ?? base.height) - 32);
        const scale =
          fit === "width"
            ? Math.min(1.6, available / base.width)
            : fit === "page"
              ? Math.min(available / base.width, tall / base.height)
              : zoom;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRefs.current[n - 1];
        if (!canvas || cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, zoom, fit, full]);

  // the page in view: the last one whose top has passed the middle of the window
  const onScroll = () => {
    const frame = frameRef.current;
    if (!frame || !pdf) return;
    const mid = frame.scrollTop + frame.clientHeight / 2;
    let current = 1;
    canvasRefs.current.forEach((c, i) => { if (c && c.offsetTop <= mid) current = i + 1; });
    // scrolled to the bottom counts as the last page, however short it is
    if (frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 4) current = pdf.numPages;
    setPage(current);
  };
  const goTo = (n: number) => {
    const c = canvasRefs.current[n - 1];
    if (c && frameRef.current) frameRef.current.scrollTo({ top: c.offsetTop - 16, behavior: "smooth" });
    setPage(n);
  };

  useEffect(() => {
    if (pdf && page === pdf.numPages) onLastPage?.();
  }, [pdf, page, onLastPage]);

  const total = pdf?.numPages ?? 1;
  const changeZoom = (next: number) => { setFit(null); setZoom(Math.min(2, Math.max(0.5, next))); };

  return (
    <div
      className={
        full
          ? "fixed inset-0 z-[100] flex flex-col bg-muted"
          : fill
            ? `flex min-h-0 flex-1 flex-col overflow-hidden bg-muted ${className}`
            : `overflow-hidden rounded-md border border-border bg-muted ${className}`
      }
    >
      <div className="flex min-h-11 flex-wrap items-center justify-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <Button type="button" size="icon" variant="ghost" disabled={page <= 1} onClick={() => goTo(page - 1)} title="Previous page"><ChevronLeft className="size-4" /></Button>
        <span className="min-w-24 text-center text-xs text-muted-foreground">Page {page} of {total}</span>
        <Button type="button" size="icon" variant="ghost" disabled={page >= total} onClick={() => goTo(page + 1)} title="Next page"><ChevronRight className="size-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="icon" variant="ghost" onClick={() => changeZoom(zoom - 0.1)} title="Zoom out"><Minus className="size-4" /></Button>
        <span className="min-w-12 text-center text-xs text-muted-foreground">{fit === "width" ? "Width" : fit === "page" ? "Page" : `${Math.round(zoom * 100)}%`}</span>
        <Button type="button" size="icon" variant="ghost" onClick={() => changeZoom(zoom + 0.1)} title="Zoom in"><Plus className="size-4" /></Button>
        {/* says what it will do next: the whole page, or back to the width */}
        <Button type="button" size="sm" variant="ghost" onClick={() => setFit(fit === "page" ? "width" : "page")}>
          <Maximize2 className="mr-1 size-3.5" /> {fit === "page" ? "Fit width" : "Fit to screen"}
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" onClick={() => setFull((f) => !f)}>
          {full ? <Minimize2 className="mr-1 size-3.5" /> : <Expand className="mr-1 size-3.5" />} {full ? "Close full screen" : "Full screen"}
        </Button>
        <Button asChild type="button" size="sm" variant="ghost">
          <a href={url} download={fileName}>
            <Download className="mr-1 size-3.5" /> Download
          </a>
        </Button>
      </div>
      <div ref={frameRef} onScroll={onScroll} className={full || fill ? "min-h-0 flex-1 overflow-auto bg-muted p-4" : "h-[68vh] min-h-[520px] overflow-auto bg-muted p-4"}>
        {error ? <p className="py-20 text-center text-sm text-destructive">{error}</p> : null}
        {!pdf && !error ? <p className="py-20 text-center text-sm text-muted-foreground">Preparing pages…</p> : null}
        <div className="space-y-4">
          {Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => (
            <canvas key={i} ref={(el) => { canvasRefs.current[i] = el; }} className="mx-auto block bg-background shadow-card" aria-label={`PDF page ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
/**
 * A photo, with the same controls as a PDF (Dani, 6 Oct 2026): zoom out and in,
 * fit to the window, full screen, download.
 */
export function ImageViewer({
  url,
  alt,
  fileName,
  fill = false,
  hideDownload = false,
}: {
  url: string;
  alt: string;
  fileName: string;
  fill?: boolean;
  /** the window around it has its own Download */
  hideDownload?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [full, setFull] = useState(false);
  const change = (next: number) => {
    setFit(false);
    setZoom(Math.min(4, Math.max(0.25, next)));
  };
  return (
    <div
      className={
        full
          ? "fixed inset-0 z-[100] flex flex-col bg-muted"
          : fill
            ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-muted"
            : "overflow-hidden rounded-md border border-border bg-muted"
      }
    >
      <div className="flex min-h-11 flex-wrap items-center justify-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <Button type="button" size="icon" variant="ghost" onClick={() => change(zoom - 0.25)} title="Zoom out"><Minus className="size-4" /></Button>
        <span className="min-w-12 text-center text-xs text-muted-foreground">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <Button type="button" size="icon" variant="ghost" onClick={() => change(zoom + 0.25)} title="Zoom in"><Plus className="size-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setFit(true); setZoom(1); }}>
          <Maximize2 className="mr-1 size-3.5" /> Fit to screen
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" onClick={() => setFull((f) => !f)}>
          {full ? <Minimize2 className="mr-1 size-3.5" /> : <Expand className="mr-1 size-3.5" />} {full ? "Close full screen" : "Full screen"}
        </Button>
        {hideDownload ? null : (
          <Button asChild type="button" size="sm" variant="ghost">
            <a href={url} download={fileName}>
              <Download className="mr-1 size-3.5" /> Download
            </a>
          </Button>
        )}
      </div>
      <div className={`min-h-0 flex-1 overflow-auto p-4 ${fit ? "flex items-center justify-center" : ""} ${full || fill ? "" : "h-[68vh]"}`}>
        <img
          src={url}
          alt={alt}
          className={fit ? "max-h-full max-w-full object-contain shadow-card" : "mx-auto max-w-none shadow-card"}
          style={fit ? undefined : { width: `${zoom * 100}%` }}
        />
      </div>
    </div>
  );
}
