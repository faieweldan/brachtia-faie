/** Timeslot generation shared by the booking page and the admin portal. */

export type AvailabilityRule = {
  start_time: string;
  end_time: string;
  slot_minutes: number;
  buffer_minutes?: number;
  capacity: number;
};

const TZ_OFFSET = "+08:00"; // Malaysia

function toMinutes(time: string) {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function slotISO(date: string, minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${h}:${m}:00${TZ_OFFSET}`).toISOString();
}

export function formatSlot(iso: string) {
  return new Date(iso).toLocaleTimeString("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  });
}

/**
 * Expands weekly availability rules into bookable ISO timestamps for one day,
 * skipping slots already at capacity and slots in the past.
 */
export function buildSlots(
  date: string,
  rules: AvailabilityRule[],
  bookedISO: string[] = [],
): string[] {
  const counts = new Map<string, number>();
  for (const iso of bookedISO) counts.set(iso, (counts.get(iso) ?? 0) + 1);

  const now = Date.now();
  const out = new Set<string>();

  for (const rule of rules) {
    const step = Math.max(10, (rule.slot_minutes || 30) + (rule.buffer_minutes ?? 0));
    const end = toMinutes(rule.end_time);
    for (let t = toMinutes(rule.start_time); t + (rule.slot_minutes || 30) <= end; t += step) {
      const iso = slotISO(date, t);
      if (new Date(iso).getTime() <= now) continue;
      if ((counts.get(iso) ?? 0) >= (rule.capacity || 1)) continue;
      out.add(iso);
    }
  }

  return Array.from(out).sort();
}
