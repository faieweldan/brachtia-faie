import { useMemo } from "react";

import {
  addDays,
  CHECKIN_NOTICE_DAYS,
  CHECKIN_SLOTS,
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
 * the days themselves are on the page, and the ones too soon to staff are
 * visibly closed rather than silently rejected.
 *
 * Not knowing yet is a real answer. A student whose flight is not booked says
 * so and submits; what would be lost is the rest of the form, and Brachtia
 * would rather have that and chase the date.
 */

type Day = { iso: string; weekday: string; day: string; month: string; tooSoon: boolean };

export function CheckInStep({
  moveIn,
  value,
  onChange,
}: {
  /** the day their tenancy starts - the first day a key exists for them */
  moveIn: string;
  value: CheckInChoice;
  onChange: (next: CheckInChoice) => void;
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
            {/* the eight days, as themselves. A student picking a day should be
                able to see which day of the week it falls on without counting */}
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {days.map((d) => {
                const on = value.on === d.iso;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    disabled={d.tooSoon || off}
                    aria-pressed={on}
                    title={d.tooSoon ? `Less than ${CHECKIN_NOTICE_DAYS} days away` : undefined}
                    onClick={() => onChange({ ...value, on: on ? "" : d.iso })}
                    className={`flex flex-col items-center rounded-xl border py-2 transition-colors ${
                      on
                        ? "border-brand-deep bg-brand-deep text-primary-foreground"
                        : d.tooSoon
                          ? "cursor-not-allowed border-dashed border-border bg-muted/40 text-muted-foreground/60"
                          : "border-border bg-background text-foreground hover:border-brand/50 hover:bg-brand-tint/40"
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wide opacity-75">
                      {d.weekday}
                    </span>
                    <span className="text-base font-bold leading-tight">{d.day}</span>
                    <span className="text-[10px] uppercase tracking-wide opacity-75">
                      {d.month}
                    </span>
                  </button>
                );
              })}
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
      </div>
    </section>
  );
}
