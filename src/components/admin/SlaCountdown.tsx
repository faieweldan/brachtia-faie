import { useEffect, useState } from "react";

import { slaText } from "@/lib/bookings-pipeline";

/**
 * How long is left for a booking's next action, as a small status chip.
 *
 * Amber while the step is still to do - a soft tint with a solid dot, the text a
 * deep amber so it reads on a light card. Red once the deadline has passed, with
 * the dot pulsing, and it says how overdue it is. Written out in full, to the
 * minute.
 */
export function SlaCountdown({
  due,
}: {
  due: number;
  /** the time allowed for the stage - no longer drawn */
  window?: number | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const { remaining } = slaText(due, now);
  const overdue = remaining < 0;
  const abs = Math.abs(remaining);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  // "21 hours 49 minutes", days only when there are some
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const clock = [days ? unit(days, "day") : "", unit(hours, "hour"), unit(minutes, "minute")]
    .filter(Boolean)
    .join(" ");

  return (
    // the server and the browser disagree by a moment; the browser wins
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${
        overdue
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-[#FFBF00]/15 text-[#7A5200] ring-[#FFBF00]/50"
      }`}
      suppressHydrationWarning
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          overdue ? "bg-rose-500 motion-safe:animate-pulse" : "bg-[#FFBF00]"
        }`}
      />
      {overdue ? `Overdue ${clock}` : `${clock} left`}
    </span>
  );
}
