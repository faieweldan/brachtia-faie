import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import { Choice } from "@/components/admin/Choice";
import { Button } from "@/components/ui/button";
import { PDFJS_OPTIONS } from "@/lib/pdfjs-options";
import { Input } from "@/components/ui/input";
import type { BoxKind, PdfBox } from "@/lib/pdf-boxes";

type LoadedPdf = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: Record<string, unknown>) => { promise: Promise<void> };
  }>;
};

const KINDS: { value: BoxKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "tick", label: "Tick" },
  { value: "signature", label: "Signature (left for a pen)" },
];

/**
 * Drawing where each value goes on a PDF form (30 Sep 2026).
 *
 * The page is shown as it is. Drag across it - over the line after "Name :",
 * over a tick box - to make a box, then give the box a name and a kind. The
 * name is what the mapping panel maps, the same as a Word placeholder. Boxes
 * are kept as fractions of the page, so they land in the same place however
 * large the page is drawn.
 */
export function PdfBoxEditor({
  url,
  boxes,
  onChange,
  names,
}: {
  url: string;
  boxes: PdfBox[];
  onChange: (next: PdfBox[]) => void;
  /** names already used, offered while naming a box */
  names: string[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loaded = await pdfjs.getDocument({ url, ...PDFJS_OPTIONS }).promise;
        if (live) {
          setPdf(loaded as unknown as LoadedPdf);
          setError("");
        }
      })
      .catch(() => live && setError("Could not open this PDF."));
    return () => {
      live = false;
    };
  }, [url]);

  // draw the page to the width of the panel
  useEffect(() => {
    if (!pdf || !canvas.current || !frame.current) return;
    let cancelled = false;
    void pdf.getPage(page + 1).then(async (p) => {
      const base = p.getViewport({ scale: 1 });
      const scale = Math.max(0.5, (frame.current?.clientWidth ?? base.width) / base.width);
      const vp = p.getViewport({ scale });
      const c = canvas.current;
      if (!c || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.floor(vp.width * ratio);
      c.height = Math.floor(vp.height * ratio);
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
      setSize({ w: vp.width, h: vp.height });
      const ctx = c.getContext("2d");
      if (!ctx) return;
      await p.render({ canvas: c, canvasContext: ctx, viewport: vp, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  function finishDrag() {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    // a click, not a drag: nothing to make
    if (w < 0.01 || h < 0.006) return;
    const id = Math.random().toString(36).slice(2, 10);
    onChange([...boxes, { id, key: `Box_${boxes.length + 1}`, kind: "text", page, x, y, w, h }]);
    setSelected(id);
  }

  const update = (id: string, patch: Partial<PdfBox>) => onChange(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const current = boxes.find((b) => b.id === selected) ?? null;
  const total = pdf?.numPages ?? 1;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag across the page where a value should go - over the line after a label, or over a tick box. Then name
        the box and map it on the right.
      </p>

      {current ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <label className="min-w-40 flex-1 space-y-1">
            <span className="text-[11px] text-muted-foreground">Box name</span>
            <Input
              list="pdf-box-names"
              className="h-8 text-sm"
              value={current.key}
              onChange={(e) => update(current.id, { key: e.target.value.replace(/[^A-Za-z0-9_ -]/g, "").slice(0, 60) })}
            />
            <datalist id="pdf-box-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <div className="w-52">
            <Choice
              label="Kind"
              className="h-8 text-sm"
              value={current.kind}
              onChange={(v) => update(current.id, { kind: v as BoxKind })}
              options={KINDS}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              onChange(boxes.filter((b) => b.id !== current.id));
              setSelected(null);
            }}
          >
            <Trash2 className="mr-1 size-3.5" /> Remove box
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Button type="button" size="icon" variant="ghost" disabled={page <= 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        Page {page + 1} of {total} · {boxes.length} box{boxes.length === 1 ? "" : "es"}
        <Button type="button" size="icon" variant="ghost" disabled={page >= total - 1} onClick={() => setPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div ref={frame} className="overflow-hidden rounded-md border border-border bg-muted">
        {error ? <p className="py-20 text-center text-sm text-destructive">{error}</p> : null}
        <div className="relative mx-auto select-none" style={{ width: size.w || undefined, height: size.h || undefined }}>
          <canvas ref={canvas} className="block bg-background" />
          <div
            className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const p = at(e);
              setSelected(null);
              setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              const p = at(e);
              setDrag({ ...drag, x1: p.x, y1: p.y });
            }}
            onPointerUp={finishDrag}
          >
            {boxes
              .filter((b) => b.page === page)
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelected(b.id)}
                  title={b.key}
                  className={`absolute rounded-sm border text-left ${
                    b.id === selected ? "border-brand bg-brand/15 ring-2 ring-brand/30" : "border-brand/70 bg-brand/5 hover:bg-brand/10"
                  }`}
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                >
                  <span className="pointer-events-none absolute -top-3.5 left-0 whitespace-nowrap rounded bg-brand px-1 text-[9px] leading-3 text-white">
                    {b.kind === "tick" ? "✓ " : b.kind === "signature" ? "✍ " : ""}
                    {b.key}
                  </span>
                </button>
              ))}
            {drag ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-brand bg-brand/10"
                style={{
                  left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                  top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                  width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                  height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
