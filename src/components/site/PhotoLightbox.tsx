import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
      <DialogContent
        showCloseButton={false}
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 border-0 bg-foreground/95 p-0 sm:max-w-none"
      >
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
          className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            touchX.current = null;
            if (start == null || end == null) return;
            if (Math.abs(end - start) > 45) go(index + (end < start ? 1 : -1));
          }}
        >
          {current ? (
            <img
              src={current.src}
              alt={current.caption || title}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}

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
