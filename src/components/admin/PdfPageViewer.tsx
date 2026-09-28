import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type LoadedPdf = {
  numPages: number;
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: Record<string, unknown>) => { promise: Promise<void> };
  }>;
};

export function PdfPageViewer({ url, className = "" }: { url: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loaded = await pdfjs.getDocument(url).promise;
      if (live) { setPdf(loaded as LoadedPdf); setPage(1); setError(""); }
    }).catch(() => live && setError("Could not open this PDF preview."));
    return () => { live = false; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !frameRef.current) return;
    let cancelled = false;
    void pdf.getPage(page).then(async (pdfPage) => {
      const base = pdfPage.getViewport({ scale: 1 });
      const available = Math.max(320, frameRef.current?.clientWidth ?? base.width) - 32;
      const scale = fit ? Math.min(1.6, available / base.width) : zoom;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      await pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
    });
    return () => { cancelled = true; };
  }, [pdf, page, zoom, fit]);

  const total = pdf?.numPages ?? 1;
  const changeZoom = (next: number) => { setFit(false); setZoom(Math.min(2, Math.max(0.5, next))); };

  return (
    <div className={`overflow-hidden rounded-md border border-border bg-muted ${className}`}>
      <div className="flex min-h-11 flex-wrap items-center justify-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <Button type="button" size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} title="Previous page"><ChevronLeft className="size-4" /></Button>
        <span className="min-w-24 text-center text-xs text-muted-foreground">Page {page} of {total}</span>
        <Button type="button" size="icon" variant="ghost" disabled={page >= total} onClick={() => setPage((value) => value + 1)} title="Next page"><ChevronRight className="size-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="icon" variant="ghost" onClick={() => changeZoom(zoom - 0.1)} title="Zoom out"><Minus className="size-4" /></Button>
        <span className="min-w-12 text-center text-xs text-muted-foreground">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <Button type="button" size="icon" variant="ghost" onClick={() => changeZoom(zoom + 0.1)} title="Zoom in"><Plus className="size-4" /></Button>
        <Button type="button" size="sm" variant={fit ? "secondary" : "ghost"} onClick={() => setFit(true)}><Maximize2 className="mr-1 size-3.5" /> Fit Page</Button>
      </div>
      <div ref={frameRef} className="h-[68vh] min-h-[520px] overflow-auto bg-muted p-4">
        {error ? <p className="py-20 text-center text-sm text-destructive">{error}</p> : null}
        {!pdf && !error ? <p className="py-20 text-center text-sm text-muted-foreground">Preparing pages…</p> : null}
        <canvas ref={canvasRef} className="mx-auto bg-background shadow-card" aria-label={`PDF page ${page}`} />
      </div>
    </div>
  );
}