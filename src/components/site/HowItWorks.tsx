import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ---------- Mini UI illustrations (non-interactive replicas) ---------- */

function MiniRoomBrowser() {
  const rows = [
    { name: "4-Bedroom · Room A", single: "RM 750", twin: "RM 550", active: "twin" as const },
    { name: "3-Bedroom · Ensuite", single: "RM 950", twin: "—", active: "single" as const },
  ];
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-2xl bg-background text-foreground shadow-lg">
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2">
        <p className="text-[11px] font-bold text-brand-deep">Room options</p>
        <p className="text-[9px] font-medium text-muted-foreground">6 rooms</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr] gap-2 bg-muted/50 px-3.5 py-1.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Room</span>
        <span>Single</span>
        <span>Twin</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr] items-center gap-2 border-t border-border/60 px-3.5 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="size-7 shrink-0 rounded-md bg-brand-tint" />
            <p className="truncate text-[10px] font-semibold text-brand-deep">{r.name}</p>
          </div>
          {(["single", "twin"] as const).map((occ) => {
            const price = occ === "single" ? r.single : r.twin;
            const active = r.active === occ;
            return price === "—" ? (
              <div
                key={occ}
                className="flex h-7 items-center justify-center rounded-md border border-dashed border-border/70 text-[9px] text-muted-foreground"
              >
                —
              </div>
            ) : (
              <div
                key={occ}
                className={`flex h-7 items-center justify-center rounded-md border text-[9px] font-extrabold tabular-nums ${
                  active
                    ? "border-brand-deep bg-brand-deep text-primary-foreground"
                    : "border-border bg-card text-brand-deep"
                }`}
              >
                {price}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MiniCalculator() {
  return (
    <div className="pointer-events-none select-none rounded-2xl bg-background p-3.5 text-foreground shadow-lg">
      <p className="text-[11px] font-bold text-brand-deep">Your stay calculator</p>
      <div className="mt-2.5 rounded-lg bg-muted/70 px-2.5 py-1.5">
        <p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">Room</p>
        <p className="text-[10px] font-bold text-foreground">4-Bedroom · Room A</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-brand-deep bg-brand-deep py-1 text-center text-[9px] font-bold text-primary-foreground">
          Single
        </div>
        <div className="rounded-md border border-border py-1 text-center text-[9px] font-semibold text-muted-foreground">
          Twin
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {["Move-in", "Move-out"].map((l, i) => (
          <div key={l} className="rounded-lg bg-muted/70 px-2.5 py-1.5">
            <p className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-2.5" /> {l}
            </p>
            <p className="text-[10px] font-bold text-foreground">
              {i === 0 ? "1 Sep 2026" : "31 Aug 2027"}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-brand-tint px-2.5 py-2">
        <p className="text-[9px] font-semibold text-brand-deep">Estimated move-in cost</p>
        <p className="text-xs font-extrabold text-brand">RM 2,700</p>
      </div>
    </div>
  );
}

function MiniConfirmation() {
  return (
    <div className="pointer-events-none select-none rounded-2xl bg-background p-3.5 text-center text-foreground shadow-lg">
      <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-brand/10">
        <BadgeCheck className="size-5 text-brand" />
      </span>
      <p className="mt-2 text-[11px] font-extrabold text-brand-deep">Room Available</p>
      <p className="text-[9px] text-muted-foreground">4-Bedroom · Room A · Single</p>
      <div className="mt-2.5 rounded-lg bg-brand-deep py-1.5 text-[10px] font-bold text-primary-foreground">
        Complete Booking
      </div>
      <p className="mt-2 flex items-center justify-center gap-1 text-[8.5px] font-medium text-muted-foreground">
        <Check className="size-2.5 text-brand" /> Pay booking fee RM 500 to reserve your room
      </p>
    </div>
  );
}

/* ---------- Section ---------- */

const steps = [
  {
    n: "01",
    title: "Find What Suits You",
    text: "Browse residences and compare room types, prices and stay options.",
    visual: <MiniRoomBrowser />,
  },
  {
    n: "02",
    title: "See Your Costs Upfront",
    text: "Choose your room, occupancy and dates to instantly see your estimated move-in cost.",
    visual: <MiniCalculator />,
  },
  {
    n: "03",
    title: "Confirm & Reserve Your Room",
    text: "Once we've confirmed availability, simply pay your booking fee to reserve your place.",
    visual: <MiniConfirmation />,
  },
];

export default function HowItWorks() {
  return (
    <section className="relative overflow-hidden bg-brand-deep py-20 sm:py-24">
      {/* ambient gradient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,color-mix(in_oklab,var(--brand)_55%,transparent),transparent_70%),radial-gradient(55%_45%_at_90%_100%,color-mix(in_oklab,var(--brand-soft)_28%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-brand/30 blur-3xl animate-float-slow"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-brand-soft/20 blur-3xl animate-float-slow [animation-delay:-6s]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-soft">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-background sm:text-4xl">
            Book your room in 3 simple steps.
          </h2>
          <p className="mt-3 text-base text-background/70">
            Explore your options, see your costs upfront and find the room that works for you.
          </p>
        </div>

        <div className="relative mt-14">
          {/* connector line + travelling pulse */}
          <div
            aria-hidden
            className="absolute left-[30px] top-6 bottom-6 w-px overflow-hidden bg-gradient-to-b from-transparent via-background/30 to-transparent md:left-0 md:right-0 md:top-[30px] md:bottom-auto md:h-px md:w-auto md:bg-gradient-to-r"
          >
            <span className="absolute inset-y-0 left-0 hidden w-1/4 bg-gradient-to-r from-transparent via-brand-soft to-transparent animate-flow-x md:block" />
          </div>

          <ol className="relative grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.n}
                className="group relative flex flex-col rounded-3xl border border-background/12 bg-background/[0.06] p-6 backdrop-blur-xl transition-colors duration-300 hover:border-background/30 hover:bg-background/[0.1]"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-background/10 ring-1 ring-background/20">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-brand-soft/30 animate-pulse-ring"
                      style={{ animationDelay: `${i * 0.9}s` }}
                    />
                    <span className="relative text-sm font-extrabold tracking-[0.15em] text-brand-soft">
                      {s.n}
                    </span>
                  </span>
                  <h3 className="text-lg font-bold leading-snug text-background">{s.title}</h3>
                </div>

                <div className="mt-5">{s.visual}</div>

                <p className="mt-5 text-sm leading-relaxed text-background/70">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 flex flex-col items-start gap-3">
          <Button
            asChild
            size="lg"
            className="h-13 rounded-full bg-background px-8 text-base text-brand-deep hover:bg-background/90"
          >
            <Link to="/apply">
              Check Availability <ArrowRight className="size-5" />
            </Link>
          </Button>
          <p className="text-sm text-background/70">
            No account needed · Takes about 2 minutes · Availability confirmed within 24 hours*
          </p>
          <p className="text-xs text-background/50">
            *Subject to availability and complete enquiry details.
          </p>
        </div>

        {/* Prefer to see it first? */}
        <div className="mt-12 flex flex-col gap-4 rounded-3xl border border-background/12 bg-background/[0.05] p-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <h3 className="text-xl font-bold text-background">Prefer to see it first?</h3>
            <p className="mt-1 text-sm text-background/70">
              Visit the residence and explore your options in person before deciding.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 shrink-0 rounded-full border-2 border-background/40 bg-transparent px-7 text-base text-background hover:bg-background/10 hover:text-background"
          >
            <Link to="/book-viewing">
              Book a Viewing <ArrowRight className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
