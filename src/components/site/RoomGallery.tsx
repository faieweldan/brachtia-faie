import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function RoomGallery({
  images,
  alt,
  className = "",
  fit = "cover",
}: {
  images: string[];
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = images.length;

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

  return (
    <div className={`group/gallery relative overflow-hidden bg-muted ${className}`}>
      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={`${alt} — photo ${i + 1}`}
            loading={i === 0 ? "eager" : "lazy"}
            width={1200}
            height={900}
            className={`h-full w-full shrink-0 snap-center ${fit === "contain" ? "object-contain" : "object-cover"}`}
          />
        ))}
      </div>

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
            {images.map((_, i) => (
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
