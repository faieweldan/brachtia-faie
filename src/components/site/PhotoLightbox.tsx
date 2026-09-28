import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type Photo = { src: string; caption?: string; badge?: string };

export default function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  open,
  onOpenChange,
  title,
}: {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const count = photos.length;
  const touchX = useRef<number | null>(null);

  /*
   * Zoom, so a student can look at the actual furniture and finishes rather
   * than a photo fitted to the screen. Double-click or the buttons zoom; a
   * zoomed photo is dragged to look around. Each photo starts unzoomed.
   */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const MAX_ZOOM = 4;
  const zoomTo = useCallback((next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, Math.round(next * 100) / 100));
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  }, []);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index, open]);

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      onIndexChange((next + count) % count);
    },
    [count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go]);

  const current = photos[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-foreground/95 p-0 sm:max-w-none [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="flex items-center justify-between gap-4 px-4 py-3 text-background sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{current?.caption || title}</p>
            <p className="text-xs text-background/70">
              {count ? `${index + 1} / ${count}` : ""}
              {current?.badge ? ` · ${current.badge}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close photo viewer"
            onClick={() => onOpenChange(false)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-background/15 text-background transition hover:bg-background/25"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 sm:px-16"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            touchX.current = null;
            // a swipe on a zoomed photo is looking around it, not moving on
            if (start == null || end == null || zoom > 1) return;
            if (Math.abs(end - start) > 45) go(index + (end < start ? 1 : -1));
          }}
          onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
        >
          {current ? (
            <img
              src={current.src}
              alt={current.caption || title}
              draggable={false}
              onDoubleClick={() => zoomTo(zoom > 1 ? 1 : 2.5)}
              onPointerDown={(e) => {
                if (zoom === 1) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setPan({ x: d.px + (e.clientX - d.x) / zoom, y: d.py + (e.clientY - d.y) / zoom });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
              className={`max-h-full max-w-full select-none object-contain transition-transform duration-150 ${
                zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
            />
          ) : null}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-background/15 p-1 text-background">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => zoomTo(zoom - 0.5)}
              className="grid size-8 place-items-center rounded-full transition hover:bg-background/25 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={() => zoomTo(1)}
              className="min-w-12 rounded-full px-2 text-xs font-semibold tabular-nums transition hover:bg-background/25"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomTo(zoom + 0.5)}
              className="grid size-8 place-items-center rounded-full transition hover:bg-background/25 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => go(index - 1)}
                className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/15 text-background transition hover:bg-background/30 sm:left-4"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => go(index + 1)}
                className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/15 text-background transition hover:bg-background/30 sm:right-4"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
            {photos.map((p, i) => (
              <button
                key={`${p.src}-${i}`}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => onIndexChange(i)}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                  i === index ? "border-background" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={p.src} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
