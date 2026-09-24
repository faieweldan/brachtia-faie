import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Eye,
  KeyRound,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { getViewingLink, confirmViewingFromLink } from "@/lib/public.functions";
import { formatSlot } from "@/lib/slots";
import { company, formatRate } from "@/data/properties";
import { stayLength } from "@/lib/stay-length";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";

// the page opens on a choice, not on a calendar - it is not a booking form
const title = "Your room is available | Brachtia Homes";
const description = "View your Brachtia Homes room first, or go straight to your booking.";

export const Route = createFileRoute("/viewing/$token")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ViewingLinkPage,
});

type Mode = "in_person" | "virtual";

/** A stored date as a person reads it. */
function prettyDay(iso: string) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The canvas this page stands on.
 *
 * White cards on a white page have nothing to lift off, which read as flat
 * beside the resident form - and it is the same student, an hour apart. The
 * tint is the one that form already uses, so the two feel like one place
 * rather than two products.
 */
function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-tint">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">{children}</div>
    </div>
  );
}

function ViewingLinkPage() {
  const { token } = Route.useParams();
  const [mode, setMode] = useState<Mode>("in_person");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // either a time they picked, or their decision not to view it at all
  const [done, setDone] = useState<{ slot: string } | { skipped: true } | null>(null);
  const [skipping, setSkipping] = useState(false);
  /*
   * Which of the three the student is looking at: the choice, the viewing, or
   * the booking. One page holding all of it asked them to read past a calendar
   * to find out they never had to book a viewing at all.
   */
  const [view, setView] = useState<"choose" | "viewing" | "booking">("choose");
  // the booking is requested by ticking, not by arriving at the right button
  const [confirmed, setConfirmed] = useState(false);
  // the full particulars, put away until asked for - the card says the room,
  // and a student who wants the rest can have it without it being in the way
  const [showDetails, setShowDetails] = useState(false);

  const linkQuery = useQuery({
    queryKey: ["viewing-link", token],
    queryFn: () => getViewingLink({ data: { token } }),
  });

  // the row as it comes back: rent is a number, everything else text
  const booking = linkQuery.data?.ok
    ? (linkQuery.data.booking as Record<string, string | number | null>)
    : null;
  const slug = String(booking?.["residence_slug"] ?? "");
  const isoDate = date ? toISODate(date) : "";

  useEffect(() => setSlot(null), [isoDate, mode]);

  const slotsQuery = useQuery({
    queryKey: ["slots", slug, mode, isoDate],
    enabled: Boolean(isoDate && booking),
    queryFn: async () => {
      const { fetchDaySlots } = await import("@/lib/public.functions");
      return fetchDaySlots({ data: { residenceSlug: slug, mode, date: isoDate } });
    },
  });
  const slots = slotsQuery.data?.slots ?? [];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  async function confirm() {
    if (!slot) return;
    setSaving(true);
    try {
      const res = await confirmViewingFromLink({ data: { token, startsAt: slot, mode } });
      if (!res.ok) {
        toast.error("This link is no longer valid");
        return;
      }
      setDone({ slot });
    } catch {
      toast.error("Could not confirm your viewing");
    } finally {
      setSaving(false);
    }
  }

  /**
   * They have seen enough and want the invoice.
   *
   * A viewing is offered, not required, and making somebody book a slot they
   * will not attend just to move on is how a booking stalls here for a week.
   */
  async function skip() {
    if (!confirmed) return;
    setSkipping(true);
    try {
      const { skipViewingFromLink } = await import("@/lib/public.functions");
      const res = await skipViewingFromLink({ data: { token } });
      if (!res.ok) {
        toast.error("This link is no longer valid");
        return;
      }
      setDone({ skipped: true });
    } catch {
      toast.error("Could not take you to the booking");
    } finally {
      setSkipping(false);
    }
  }

  if (linkQuery.isLoading) {
    return (
      <Canvas>
        <p className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </p>
      </Canvas>
    );
  }

  if (!booking) {
    return (
      <Canvas>
        <div className="py-8 text-center">
          <h1 className="text-3xl font-extrabold text-brand-deep">Link not available</h1>
          <p className="mt-3 text-muted-foreground">
            This viewing link has expired or is no longer valid. Message us and we'll sort out a
            time with you.
          </p>
          <Button asChild size="lg" className="mt-8 rounded-full">
            <a
              href="https://wa.me/60123306815?text=Hi+my+viewing+link+is+not+working"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-4" /> WhatsApp us
            </a>
          </Button>
        </div>
      </Canvas>
    );
  }

  if (done) {
    return (
      <Canvas>
        <div className="py-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft">
            <CheckCircle2 className="size-7 text-brand" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold text-brand-deep">
            {"slot" in done ? "Viewing confirmed" : "We'll send your invoice"}
          </h1>
          {"slot" in done ? (
            <p className="mt-3 text-muted-foreground">
              {mode === "virtual" ? "Video tour" : "Viewing"} on{" "}
              <strong className="text-foreground">
                {new Date(done.slot).toLocaleDateString("en-MY", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </strong>{" "}
              at <strong className="text-foreground">{formatSlot(done.slot)}</strong>.
            </p>
          ) : (
            <p className="mt-3 text-muted-foreground">
              No viewing needed — we&apos;ll send your booking invoice shortly. You can still ask
              for a viewing at any time.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Booking ID {booking["reference"]} · {booking["residence_name"]}
          </p>
        </div>
      </Canvas>
    );
  }

  /** The room itself, shown the same way wherever it appears. */
  const roomCard = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.18)]">
      {/* the room on the brand, the way the arrival step carries its welcome -
          this is the thing the page is about, not a field beside the others */}
      <div className="bg-brand-deep px-5 py-4 text-primary-foreground sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
          Your room
        </p>
        <p className="mt-1.5 text-lg font-bold leading-tight">{booking["residence_name"]}</p>
        <p className="text-sm font-medium text-primary-foreground/90">{booking["room_name"]}</p>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
          <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-deep">
            {booking["occupancy"] === "twin" ? "Twin sharing" : "Single occupancy"}
          </span>
          {booking["move_in"] ? (
            <span className="text-muted-foreground">
              {prettyDay(String(booking["move_in"]))}
              {booking["move_out"] ? ` – ${prettyDay(String(booking["move_out"]))}` : ""}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Booking ID <span className="font-semibold text-foreground">{booking["reference"]}</span>
        </p>

        <button
          type="button"
          onClick={() => setShowDetails((was) => !was)}
          aria-expanded={showDetails}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline"
        >
          {showDetails ? "Hide booking details" : "View booking details"}
          {showDetails ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showDetails ? (
          <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-[auto_1fr]">
            {(
              [
                ["Booking ID", booking["reference"]],
                ["Name", booking["full_name"]],
                ["Residence", booking["residence_name"]],
                ["Unit type", booking["unit_type"]],
                ["Room", booking["room_name"]],
                ["Occupancy", booking["occupancy"] === "twin" ? "Twin sharing" : "Single"],
                ["Move-in date", prettyDay(String(booking["move_in"] ?? ""))],
                ["Move-out date", prettyDay(String(booking["move_out"] ?? ""))],
                [
                  "Stay duration",
                  booking["move_in"] && booking["move_out"]
                    ? stayLength(String(booking["move_in"]), String(booking["move_out"]))
                    : "",
                ],
                [
                  "Monthly rental",
                  Number(booking["monthly_rent"]) > 0
                    ? formatRate(Number(booking["monthly_rent"]))
                    : "",
                ],
              ] as const
            )
              // a blank line says nothing and reads as something missing
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground sm:whitespace-nowrap">{label}</dt>
                  <dd className="font-semibold text-foreground sm:text-right">{value}</dd>
                </div>
              ))}
          </dl>
        ) : null}
      </div>
    </div>
  );

  return (
    <Canvas>
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
        <CalendarCheck className="size-3.5" /> Booking ID {booking["reference"]}
      </span>

      {view === "choose" ? (
        <>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Good news — we have a room for you! 🎉
          </h1>
          <p className="mt-3 text-muted-foreground">
            Hi {String(booking["full_name"] ?? "").split(" ")[0]}, your preferred room is available.
            What would you like to do next?
          </p>

          <div className="mt-6">{roomCard}</div>

          <h2 className="mt-10 text-xl font-bold text-brand-deep">What would you like to do?</h2>

          {/*
            Two ways on, side by side and equally weighted. A viewing is offered,
            not required - and a student who has seen enough should not have to
            read past a calendar to find that out.
          */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {/*
              Two ways on, side by side and equally weighted. A viewing is
              offered, not required - and a student who has seen enough should
              not have to read past a calendar to find that out.

              Each carries its own mark rather than a shared grey rule, so the
              choice reads as two things rather than one list.
            */}
            <button
              type="button"
              onClick={() => setView("viewing")}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-14px_rgba(16,24,40,0.3)]"
            >
              <span className="absolute inset-x-0 top-0 h-1 bg-brand/40" aria-hidden />
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-tint text-xl">
                <Eye className="size-5 text-brand-deep" />
              </span>
              <span className="mt-3 block text-base font-bold text-brand-deep">
                View the room first
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Visit the residence in person or take a virtual tour before deciding.
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                Schedule a viewing
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setView("booking")}
              className="group relative overflow-hidden rounded-2xl border border-brand/40 bg-brand-tint/40 p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-14px_rgba(16,24,40,0.3)]"
            >
              <span className="absolute inset-x-0 top-0 h-1 bg-brand-deep" aria-hidden />
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-deep text-primary-foreground">
                <KeyRound className="size-5" />
              </span>
              <span className="mt-3 block text-base font-bold text-brand-deep">Ready to book?</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                Proceed with the room above and request your booking invoice.
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep">
                Proceed to booking
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            Need help? WhatsApp us on +6012-330 6815.
          </p>
        </>
      ) : view === "viewing" ? (
        <>
          <button
            type="button"
            onClick={() => setView("choose")}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-deep sm:text-3xl">
            Schedule your viewing
          </h1>

          <div className="mt-6 space-y-6 rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
            <div>
              <Label>How would you like to view?</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      value: "in_person",
                      label: "In person",
                      icon: MapPin,
                      hint: "At the residence",
                    },
                    {
                      value: "virtual",
                      label: "Virtual tour",
                      icon: Video,
                      hint: "Live video call",
                    },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setMode(o.value)}
                    className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors sm:gap-3 sm:p-4 ${
                      mode === o.value
                        ? "border-brand bg-brand-tint/60"
                        : "border-border hover:border-brand/40"
                    }`}
                  >
                    <o.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-brand-deep">{o.label}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {o.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Choose a date</Label>
              <div className="rounded-2xl border border-border p-2">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={{ before: today }}
                  className="mx-auto pointer-events-auto"
                />
              </div>
            </div>

            <div>
              <Label>Available times</Label>
              {!isoDate ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a date to see available times.
                </p>
              ) : slotsQuery.isLoading ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading times…
                </p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No times available on this date. Try another day or message us on WhatsApp.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {slots.map((sl) => (
                    <button
                      key={sl}
                      type="button"
                      onClick={() => setSlot(sl)}
                      className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
                        slot === sl
                          ? "border-brand bg-brand text-white"
                          : "border-border hover:border-brand/50"
                      }`}
                    >
                      {formatSlot(sl)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full rounded-full"
              disabled={!slot || saving}
              onClick={() => void confirm()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null} Confirm viewing
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Need help? WhatsApp us on +6012-330 6815.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setView("choose")}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-deep sm:text-3xl">
            Confirm your booking
          </h1>
          <p className="mt-2 text-muted-foreground">
            Please check that the details below are correct.
          </p>

          <div className="mt-6">{roomCard}</div>

          {/*
            Ticked, not assumed. Reserving used to happen on the click of a
            quiet link beside a button, which is no way to agree to anything -
            and this is the point a room stops being available to anybody else.
          */}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand-deep,#1a4734)]"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="text-sm text-foreground">
              I confirm that the room and booking details above are correct and I would like to
              proceed with the booking.
            </span>
          </label>

          <Button
            size="lg"
            className="mt-5 w-full rounded-full"
            disabled={!confirmed || skipping}
            onClick={() => void skip()}
          >
            {skipping ? <Loader2 className="size-4 animate-spin" /> : null} Request booking invoice{" "}
            <ArrowRight className="size-4" />
          </Button>

          <div className="mt-5 rounded-2xl bg-brand-tint/60 p-4 text-sm text-foreground">
            <p>
              Once submitted, our team will send you the booking invoice and payment instructions.
            </p>
            <p className="mt-2">
              To reserve your room, please make the{" "}
              <strong>{company.bookingFee} booking fee</strong> payment and send your payment proof
              to our team.
            </p>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Changed your mind? You can still{" "}
            <button
              type="button"
              className="font-medium text-brand underline underline-offset-2"
              onClick={() => setView("viewing")}
            >
              schedule a viewing
            </button>{" "}
            instead.
          </p>
        </>
      )}
    </Canvas>
  );
}
