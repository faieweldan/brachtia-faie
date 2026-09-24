import { CalendarDays, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * When the student says they will arrive.
 *
 * Arrival is not a viewing: a room is theirs from the day their tenancy starts,
 * so those are the only days offered - that day and the week after it. Nothing
 * before it, because there is no room yet, and nothing long after, because a
 * key left uncollected is a room nobody can let and nobody has moved into.
 *
 * Not knowing yet is a real answer. A student whose flight is not booked says
 * so and submits; what would be lost is the rest of the form, and Brachtia
 * would rather have that and chase the date.
 */

export const CHECKIN_WINDOW_DAYS = 7;

/** Times a key can be handed over: office hours, on the hour and the half. */
export const CHECKIN_SLOTS = [
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
];

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const pretty = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

export type CheckInChoice = { on: string; slot: string; remind: boolean };

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
  const last = moveIn ? addDays(moveIn, CHECKIN_WINDOW_DAYS) : "";

  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-brand-deep">Schedule check-in</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us when you plan to arrive. Our team will meet you, show you around, and hand over your
        keys and access card.
      </p>

      {moveIn ? (
        <p className="mt-3 rounded-lg bg-brand-tint px-3 py-2 text-xs text-foreground">
          Your tenancy starts <strong>{pretty(moveIn)}</strong>. Pick any day from then up to{" "}
          <strong>{pretty(last)}</strong>. Arriving later than that needs our approval first.
        </p>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          We do not have your move-in date yet, so we cannot offer days to choose from. Pick the
          reminder below and we will sort this out with you.
        </p>
      )}

      <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${value.remind ? "opacity-50" : ""}`}>
        <div>
          <label
            htmlFor="checkin-date"
            className="flex items-center gap-1.5 text-xs font-medium text-foreground/70"
          >
            <CalendarDays className="size-3.5" /> Arrival date
          </label>
          <Input
            id="checkin-date"
            type="date"
            className="mt-1.5"
            disabled={value.remind || !moveIn}
            value={value.on}
            min={moveIn}
            max={last}
            onChange={(e) => onChange({ ...value, on: e.target.value })}
          />
        </div>
        <div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
            <Clock className="size-3.5" /> Arrival time
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CHECKIN_SLOTS.map((t) => {
              const on = value.slot === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  disabled={value.remind || !moveIn}
                  onClick={() => onChange({ ...value, slot: on ? "" : t })}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
                    on
                      ? "border-brand-deep bg-brand-deep text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* said as a choice, not as a way out: a student who does not know yet
          should not feel they are failing the form by saying so */}
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--brand-deep,#1a4734)]"
          checked={value.remind}
          onChange={(e) => onChange({ on: "", slot: "", remind: e.target.checked })}
        />
        <span>
          <span className="font-medium text-foreground">I&rsquo;ll pick a time later</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Remind me about a week before I move in. You can come back to this link any time to
            choose.
          </span>
        </span>
      </label>
    </section>
  );
}
