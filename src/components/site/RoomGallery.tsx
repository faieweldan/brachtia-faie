import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import type { Photo } from "./PhotoLightbox";

export default function RoomGallery({
  items,
  alt,
  className = "",
  onOpen,
}: {
  items: (string | Photo)[];
  alt: string;
  className?: string;
  onOpen?: (index: number) => void;
}) {
  const photos: Photo[] = items.map((it) => (typeof it === "string" ? { src: it } : it));
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(count - 1, i)));
  }, [count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  function go(next: number) {
    const el = ref.current;
    if (!el) return;
    const target = Math.max(0, Math.min(count - 1, next));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
    setIndex(target);
  }

  const current = photos[index];

  return (
    <div className={`group/gallery relative overflow-hidden bg-muted ${className}`}>
      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((p, i) => (
          <button
            key={`${p.src}-${i}`}
            type="button"
            onClick={() => onOpen?.(i)}
            aria-label={`View ${p.caption || alt} full size`}
            className="relative h-full w-full shrink-0 snap-center cursor-zoom-in overflow-hidden"
          >
            <img
              src={p.src}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
            />
            <img
              src={p.src}
              alt={p.caption ? `${alt} — ${p.caption}` : `${alt} — photo ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="relative h-full w-full object-contain"
            />
          </button>
        ))}
      </div>

      {current?.badge ? (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-card">
          {current.badge}
        </span>
      ) : null}

      <button
        type="button"
        aria-label="View full size"
        onClick={() => onOpen?.(index)}
        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-card transition hover:bg-card"
      >
        <Expand className="size-3.5" /> View full
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="absolute left-2 top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition disabled:opacity-0 group-hover/gallery:grid"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(index + 1)}
            disabled={index === count - 1}
            className="absolute right-2 top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition disabled:opacity-0 group-hover/gallery:grid"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full transition ${
                  i === index ? "w-4 bg-card" : "bg-card/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
