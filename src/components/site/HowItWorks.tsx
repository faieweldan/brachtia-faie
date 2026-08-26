import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import roomSingle from "@/assets/room-single.jpg";
import roomTwin from "@/assets/room-twin.jpg";

/* ---------- Mini UI illustrations (non-interactive replicas) ---------- */

function MiniRoomBrowser() {
  const rows = [
    { image: roomSingle, name: "Room A", price: "RM 750", selected: true },
    { image: roomTwin, name: "Room B", price: "RM 550", selected: false },
    { image: roomSingle, name: "Room C", price: "RM 950", selected: false },
  ];
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-2xl bg-background p-5 text-foreground shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-brand-deep">Room options</p>
        <p className="text-xs font-medium text-muted-foreground">6 rooms</p>
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={r.image}
                alt=""
                className="size-12 shrink-0 rounded-lg object-cover"
              />
              <p className="text-sm font-bold text-brand-deep">{r.name}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <p className="text-sm font-extrabold tabular-nums text-brand-deep">{r.price}</p>
              <div
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  r.selected
                    ? "bg-brand-deep text-primary-foreground"
                    : "border border-border bg-card text-brand-deep"
                }`}
              >
                {r.selected ? "Selected" : "Select"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniCalculator() {
  return (
    <div className="pointer-events-none select-none rounded-2xl bg-background p-5 text-foreground shadow-lg">
      <p className="text-sm font-bold text-brand-deep">Your stay calculator</p>
      <div className="mt-4 rounded-xl bg-muted/50 px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Room</p>
        <p className="mt-0.5 text-sm font-bold text-foreground">4-Bedroom · Room A</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-brand-deep bg-brand-deep py-2 text-center text-xs font-bold text-primary-foreground">
          Single
        </div>
        <div className="rounded-lg border border-border py-2 text-center text-xs font-semibold text-muted-foreground">
          Twin
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {["Move-in", "Move-out"].map((l, i) => (
          <div key={l} className="rounded-xl bg-muted/50 px-3.5 py-3">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-3.5" /> {l}
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {i === 0 ? "1 Sep 2026" : "31 Aug 2027"}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-tint px-3.5 py-3">
        <p className="text-xs font-semibold text-brand-deep">Estimated move-in cost</p>
        <p className="text-base font-extrabold text-brand">RM 2,700</p>
      </div>
    </div>
  );
}

function MiniConfirmation() {
  return (
    <div className="pointer-events-none select-none rounded-2xl bg-background p-6 text-center text-foreground shadow-lg">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand/10">
        <BadgeCheck className="size-7 text-brand" />
      </span>
      <p className="mt-4 text-base font-extrabold text-brand-deep">Room Available</p>
      <p className="mt-1 text-sm text-muted-foreground">4-Bedroom · Room A · Single</p>
      <div className="mt-5 rounded-xl bg-brand-deep py-3 text-sm font-bold text-primary-foreground">
        Complete Booking
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="size-4 text-brand" /> Pay booking fee RM 500 to reserve your room
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

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-soft">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-background sm:text-4xl">
            Book your room in 3 simple steps.
          </h2>
          <p className="mt-3 text-base text-background/70">
            Explore your options, see your costs upfront and find the room that works for you.
          </p>
        </div>

        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.n}
              className="group relative flex flex-col rounded-[2.5rem] border border-background/12 bg-background/[0.06] p-7 backdrop-blur-xl transition-colors duration-300 hover:border-background/30 hover:bg-background/[0.1]"
            >
              <div className="flex items-center gap-4">
                <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full border border-background/20 bg-background/10 text-sm font-extrabold tracking-[0.15em] text-brand-soft">
                  {s.n}
                </span>
                <h3 className="text-xl font-bold leading-snug text-background sm:text-2xl">
                  {s.title}
                </h3>
              </div>

              <div className="mt-6 flex-grow">{s.visual}</div>

              <p className="mt-6 text-sm leading-relaxed text-background/70 sm:text-base">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-13 rounded-full bg-background px-8 text-base text-brand-deep hover:bg-background/90"
          >
            <Link to="/apply">
              Check Availability <ArrowRight className="size-5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-13 rounded-full border-2 border-background/40 bg-transparent px-8 text-base text-background hover:bg-background/10 hover:text-background"
          >
            <Link to="/book-viewing">
              Book a Viewing <ArrowRight className="size-5" />
            </Link>
          </Button>
        </div>

        <p className="mt-4 text-center text-sm text-background/60">
          No account needed · Takes about 2 minutes · Availability confirmed within 24 hours*
        </p>
        <p className="mt-1 text-center text-xs text-background/50">
          *Subject to availability and complete enquiry details.
        </p>
      </div>
    </section>
  );
}
