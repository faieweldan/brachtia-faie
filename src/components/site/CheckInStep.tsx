import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappUrl } from "@/data/properties";
import { fetchDaySlots } from "@/lib/public.functions";

import {
  addDays,
  CHECKIN_WINDOW_DAYS,
  todayISO,
  type CheckInChoice,
} from "@/lib/checkin";

/**
 * When the student says they will arrive.
 *
 * Arrival is not a viewing: a room is theirs from the day their tenancy starts,
 * so those are the only days offered - that day and the week after it. Nothing
 * before it, because there is no room yet, and nothing long after, because a
 * key left uncollected is a room nobody can let and nobody has moved into.
 *
 * Eight days is a small enough choice to show. A date field would hide them
 * behind a calendar the student has to open, guess at, and be refused by - so
 * the days themselves are on the page. Days already gone are left out, and
 * the request is confirmed by a person either way.
 *
 * Not knowing yet is a real answer. A student whose flight is not booked says
 * so and submits; what would be lost is the rest of the form, and Brachtia
 * would rather have that and chase the date.
 */

const prettyDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

type Day = { iso: string; label: string };

/** A slot from the scheduler as the "10:00" the arrival is saved as - Malaysian time. */
const slotTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kuala_Lumpur",
  });

export function CheckInStep({
  moveIn,
  value,
  onChange,
  name = "",
  residentCode = "",
}: {
  /** the day their tenancy starts - the first day a key exists for them */
  moveIn: string;
  value: CheckInChoice;
  onChange: (next: CheckInChoice) => void;
  /** who is asking, so a message about arriving late names them */
  name?: string;
  residentCode?: string;
}) {
  const days = useMemo<Day[]>(() => {
    if (!moveIn) return [];
    const today = todayISO();
    return Array.from({ length: CHECKIN_WINDOW_DAYS + 1 }, (_, i) => addDays(moveIn, i))
      // a day already gone is not a choice, so it is not offered at all
      .filter((iso) => iso >= today)
      .map((iso) => ({
        iso,
        // the weekday is named, because somebody arriving is choosing around a
        // flight and a bare date makes them count
        label: new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      }));
  }, [moveIn]);

  /*
   * The times come from the same opening hours, blocked days and bookings the
   * appointment scheduler uses, so a student is never offered a slot staff
   * cannot keep. A fixed list here used to drift from the real calendar.
   */
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  useEffect(() => {
    if (!value.on) {
      setSlots([]);
      return;
    }
    let live = true;
    setLoadingSlots(true);
    fetchDaySlots({ data: { date: value.on, kind: "check-in" } })
      .then((res) => {
        if (live) setSlots((res.slots ?? []).map(slotTime));
      })
      .catch(() => {
        if (live) setSlots([]);
      })
      .finally(() => {
        if (live) setLoadingSlots(false);
      });
    return () => {
      live = false;
    };
  }, [value.on]);
  // a time already saved stays selectable even if the calendar has since filled
  const timeChoices =
    value.slot && !slots.includes(value.slot) ? [value.slot, ...slots] : slots;

  const off = value.remind;
  // the last day that needs no approval - past it the calendar marks, not blocks
  const lastInWindow = moveIn ? addDays(moveIn, CHECKIN_WINDOW_DAYS) : "";
  /*
   * For the student none of these days suit. Arriving outside the window needs
   * a person either way, so rather than leaving them to work out that the form
   * cannot help, it hands them the conversation with their own details already
   * in it - nobody should have to introduce themselves twice.
   */
  const lateArrivalMessage = [
    "Hi Brachtia Homes, I cannot arrive within the 7 days after my tenancy starts.",
    name ? `Name: ${name}` : "",
    residentCode ? `Resident ID: ${residentCode}` : "",
    moveIn ? `Tenancy starts: ${prettyDay(moveIn)}` : "",
    "Could we arrange another arrival date?",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.18)]">
      {/* the welcome, on the brand rather than in grey body text - this is the
          one moment in the form that is good news rather than a question */}
      {/* the title carries the brand; the reading under it does not. A block of
          green behind body text made the part you read once the heaviest thing
          on the step */}
      <div className="bg-brand-deep px-5 py-4 text-primary-foreground sm:px-6">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Schedule Your Arrival Check-In
        </h2>
      </div>

      <div className="p-5 sm:p-6">
        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          You&rsquo;re almost home! On your arrival day, our team will give you a tour, answer any
          questions, and hand over your keys and access card.
        </p>
        <p className="mt-2 max-w-prose text-sm italic leading-relaxed text-muted-foreground">
          In the meantime, we will send a copy of your tenancy agreement for your review.
        </p>

        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-brand-deep">Important Details:</p>
          <ul className="mt-3 space-y-3">
            {[
              {
                icon: "🔑",
                label: "Key Collection:",
                rest: (
                  <>
                    Full initial payment must be cleared on or before arrival to receive your keys.
                  </>
                ),
              },
              {
                icon: "📅",
                label: "Book Early:",
                rest: (
                  <>
                    Reserve your arrival check-in slot at least <strong>5 days in advance</strong>.
                    Spaces fill up quickly during peak periods, so early booking is recommended.
                  </>
                ),
              },
              {
                icon: "⏳",
                label: "Arrival Window:",
                rest: (
                  <>
                    You can choose any date from your tenancy start day up to{" "}
                    <strong>7 days after</strong>. Any later arrival requires prior approval.
                  </>
                ),
              },
            ].map((d) => (
              <li key={d.label} className="flex gap-3 text-sm leading-relaxed text-foreground">
                <span aria-hidden className="shrink-0 text-base leading-6">
                  {d.icon}
                </span>
                <span>
                  <strong className="font-semibold">{d.label}</strong> {d.rest}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!moveIn ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            We do not have your move-in date yet, so we cannot offer days to choose from. Pick the
            reminder below and we will sort this out with you.
          </p>
        ) : days.length === 0 ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Every day in your arrival window has already passed. Message us on WhatsApp below and we
            will arrange your check-in with you.
          </p>
        ) : null}

        {moveIn && days.length > 0 ? (
          <div className={`mt-6 transition-opacity ${off ? "pointer-events-none opacity-40" : ""}`}>
            <p className="text-sm font-semibold italic text-foreground">Date:</p>
            {/*
              A list, not a calendar. Eight days is the whole choice, and a
              month grid drawn around them was twenty-three greyed squares and
              a pair of arrows that led nowhere - work to do before the one
              decision could be made.
            */}
            {/*
              Drawn by the page, not the browser: a plain <select> opens the
              operating system's own list - a grey Mac sheet, a Windows box, a
              wheel on a phone - so each student saw something different (30 Sep 2026).
            */}
            <Select
              value={value.on}
              disabled={off}
              // a new day has its own times, so the old one is cleared
              onValueChange={(on) => onChange({ ...value, on, slot: "" })}
            >
              <SelectTrigger className="mt-2 h-10 w-full rounded-lg sm:max-w-sm">
                <SelectValue placeholder="Choose your arrival date" />
              </SelectTrigger>
              <SelectContent>
                {days.map((d) => (
                  <SelectItem key={d.iso} value={d.iso}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="mt-5 text-sm font-semibold italic text-foreground">Time:</p>
            <Select
              value={value.slot}
              disabled={off || !value.on || loadingSlots || timeChoices.length === 0}
              onValueChange={(slot) => onChange({ ...value, slot })}
            >
              <SelectTrigger className="mt-2 h-10 w-full rounded-lg sm:max-w-sm">
                <SelectValue
                  placeholder={
                    !value.on
                      ? "Choose a date first"
                      : loadingSlots
                        ? "Loading times…"
                        : timeChoices.length === 0
                          ? "No times free that day - try another"
                          : "Choose your arrival time"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {timeChoices.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {/* offered as a choice, not as a way out: a student who does not know
            yet should not feel they are failing the form by saying so */}
        <p className="mt-6 text-sm font-semibold text-foreground">
          Not sure when you&rsquo;re arriving yet?
        </p>
        <label
          className={`mt-2 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
            off ? "border-brand-deep bg-brand-tint/70" : "border-border hover:bg-muted/40"
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-brand"
            checked={off}
            onChange={(e) => onChange({ on: "", slot: "", remind: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">
              Remind me closer to my move-in date
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              We&rsquo;ll remind you about a week before move-in to schedule your check-in. You can
              also return to this link anytime to choose a time.
            </span>
          </span>
        </label>

        {/* the way out of the window itself. Not the same question as the
            reminder above: that one is "not yet", this one is "not then" */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Cannot arrive within those 7 days? Any later arrival needs our approval first — message
            us and we will sort it out with you.
          </p>
          <a
            href={whatsappUrl(lateArrivalMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <MessageCircle className="size-3.5" /> WhatsApp us
          </a>
        </div>
      </div>
    </section>
  );
}
