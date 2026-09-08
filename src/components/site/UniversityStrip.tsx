const universities = [
  { short: "MMU", full: "Multimedia University" },
  { short: "HWUM", full: "Heriot-Watt University Malaysia" },
  { short: "UOC", full: "University of Cyberjaya" },
  { short: "City University", full: "City University" },
];

export default function UniversityStrip() {
  const row = [...universities, ...universities];

  return (
    <section className="border-y border-border/70 bg-brand-tint py-8">
      <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
        Home to students from
      </p>
      <div className="marquee-mask mt-5 overflow-hidden">
        <div className="animate-marquee flex w-max gap-3">
          {row.map((u, i) => (
            <span
              key={`${u.short}-${i}`}
              className="flex shrink-0 items-baseline gap-2 rounded-full border border-border bg-card px-6 py-3 shadow-card"
              aria-hidden={i >= universities.length}
            >
              <span className="text-lg font-extrabold tracking-tight text-brand-deep">{u.short}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{u.full}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
