import { useMemo } from "react";
import { MessageCircle } from "lucide-react";

import { whatsappUrl } from "@/data/properties";

import { Calendar } from "@/components/ui/calendar";
import {
  addDays,
  CHECKIN_NOTICE_DAYS,
  CHECKIN_SLOTS,
  CHECKIN_WINDOW_DAYS,
  toISO,
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
 * the days themselves are on the page, and the ones too soon to staff are
 * visibly closed rather than silently rejected.
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

type Day = { iso: string; weekday: string; day: string; month: string; tooSoon: boolean };

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
    const earliest = addDays(todayISO(), CHECKIN_NOTICE_DAYS);
    return Array.from({ length: CHECKIN_WINDOW_DAYS + 1 }, (_, i) => {
      const iso = addDays(moveIn, i);
      const d = new Date(`${iso}T00:00:00`);
      return {
        iso,
        weekday: d.toLocaleDateString("en-MY", { weekday: "short" }),
        day: d.toLocaleDateString("en-MY", { day: "numeric" }),
        month: d.toLocaleDateString("en-MY", { month: "short" }),
        tooSoon: iso < earliest,
      };
    });
  }, [moveIn]);

  const open = days.filter((d) => !d.tooSoon);
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
      <div className="bg-brand-deep px-5 py-6 text-primary-foreground sm:px-6">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Schedule Your Arrival</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-primary-foreground/90">
          You&rsquo;re almost home! On your arrival day, our team will give you a tour, answer any
          questions, and hand over your keys and access card.
        </p>
        <p className="mt-2 max-w-prose text-sm italic leading-relaxed text-primary-foreground/75">
          In the meantime, we will send a copy of your tenancy agreement for your review.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="rounded-xl bg-brand-tint/60 p-4">
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
                    Reserve your slot at least <strong>5 days in advance</strong>. Spaces fill up
                    quickly during peak periods, so early booking is recommended.
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

        <p className="mt-4 text-sm italic leading-relaxed text-muted-foreground">
          Not ready to schedule yet? Select <strong>&ldquo;Remind me 1 week before&rdquo;</strong>{" "}
          below to pick a slot later.
        </p>

        {!moveIn ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            We do not have your move-in date yet, so we cannot offer days to choose from. Pick the
            reminder below and we will sort this out with you.
          </p>
        ) : !open.length ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Every day in your arrival window is less than {CHECKIN_NOTICE_DAYS} days away. Pick the
            reminder below and message us — we will arrange your arrival with you directly.
          </p>
        ) : null}

        {moveIn && open.length ? (
          <div className={`mt-6 transition-opacity ${off ? "pointer-events-none opacity-40" : ""}`}>
            <p className="text-sm font-semibold italic text-foreground">Date:</p>
            {/*
              A real calendar, because a student is choosing around a flight and
              needs to see the month they are choosing in - and the window can
              straddle two of them. What the window means is drawn onto it
              rather than enforced after the fact: before the tenancy starts
              there is no room, after the seventh day it is not offered here at
              all, and days too soon for anybody to be there to meet are closed.
            */}
            <div className="mt-2 rounded-xl border border-border p-2">
              <Calendar
                mode="single"
                selected={value.on ? new Date(`${value.on}T00:00:00`) : undefined}
                onSelect={(d) => onChange({ ...value, on: d ? toISO(d) : "" })}
                defaultMonth={new Date(`${(open[0] ?? days[0])!.iso}T00:00:00`)}
                startMonth={new Date(`${moveIn}T00:00:00`)}
                endMonth={new Date(`${lastInWindow}T00:00:00`)}
                disabled={(d) => {
                  const iso = toISO(d);
                  return (
                    iso < moveIn ||
                    iso > lastInWindow ||
                    iso < addDays(todayISO(), CHECKIN_NOTICE_DAYS)
                  );
                }}
                className="mx-auto pointer-events-auto"
              />
            </div>

            <p className="mt-5 text-sm font-semibold italic text-foreground">Time:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHECKIN_SLOTS.map((t) => {
                const on = value.slot === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    disabled={off}
                    onClick={() => onChange({ ...value, slot: on ? "" : t })}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      on
                        ? "border-brand-deep bg-brand-deep text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-brand/50 hover:bg-brand-tint/40"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* offered as a choice, not as a way out: a student who does not know
            yet should not feel they are failing the form by saying so */}
        <label
          className={`mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
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
              Remind me 1 week before
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              We will get in touch about a week before you move in. You can come back to this link
              any time to pick a slot yourself.
            </span>
          </span>
        </label>

        {/* the way out of the window itself. Not the same question as the
            reminder above: that one is "not yet", this one is "not then" */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Cannot arrive within those 7 days? Any later arrival needs our approval first \u2014
            message us and we will sort it out with you.
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
