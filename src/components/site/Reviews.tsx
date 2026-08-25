import { Star } from "lucide-react";
import { reviews, reviewSummary } from "@/data/reviews";

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-4 ${i <= Math.round(rating) ? "fill-gold text-gold" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.8 6.1C12.3 14 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9.1h12.7c-.6 3-2.3 5.6-4.9 7.3l7.6 5.9c4.4-4.1 7.1-10.2 7.1-17.6z" />
      <path fill="#FBBC05" d="M10.4 28.1c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.1 0 19.9 0 23.5s.9 7.4 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2.1 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-4.5-13.6-10.4l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

export default function Reviews() {
  return (
    <section className="bg-secondary/60 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Student reviews</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl">
              What our students say
            </h2>
          </div>
          <div className="flex items-center gap-4 rounded-3xl border border-border/70 bg-card px-5 py-4 shadow-card">
            <GoogleG className="size-8" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold text-foreground">{reviewSummary.average}</span>
                <Stars rating={reviewSummary.average} />
              </div>
              <p className="text-xs text-muted-foreground">
                Based on {reviewSummary.count} Google reviews
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {reviews.map((r) => (
            <article
              key={r.id}
              className="w-[85vw] shrink-0 snap-start rounded-3xl border border-border/70 bg-card p-5 shadow-card sm:w-[340px]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep">
                  {r.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                <GoogleG className="ml-auto size-4 shrink-0" />
              </div>
              <Stars rating={r.rating} className="mt-3" />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
            </article>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">Swipe to read more reviews →</p>
      </div>
    </section>
  );
}
