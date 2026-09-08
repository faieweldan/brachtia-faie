/** Timeslot generation shared by the booking page and the admin portal. */

export type AvailabilityRule = {
  start_time: string;
  end_time: string;
  capacity_group?: number;
  slot_minutes?: number;
  buffer_minutes?: number;
  capacity?: number;
  valid_from?: string | null;
  valid_to?: string | null;
};

/** A blocked window; null/empty times mean the whole day. */
export type BlockedWindow = {
  start_time?: string | null;
  end_time?: string | null;
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

/** "09:00" -> "9:00 AM" */
export function formatTime(time: string) {
  const mins = toMinutes(time);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/**
 * Expands availability rules into bookable ISO timestamps for one day.
 *
 * Capacity for a start time is the number of rules (across capacity groups)
 * whose window fully covers it, so adding a second capacity lets two
 * appointments share the same timeslot while students still see one slot.
 * Slots in the past, at capacity, or overlapping a blocked window are dropped.
 */
export function buildSlots(
  date: string,
  rules: AvailabilityRule[],
  bookedISO: string[] = [],
  durationMinutes?: number,
  blocked: BlockedWindow[] = [],
): string[] {
  const counts = new Map<string, number>();
  for (const iso of bookedISO) counts.set(iso, (counts.get(iso) ?? 0) + 1);

  const length = durationMinutes || 30;
  const now = Date.now();

  const windows = rules
    .filter(
      (r) =>
        (!r.valid_from || date >= String(r.valid_from).slice(0, 10)) &&
        (!r.valid_to || date <= String(r.valid_to).slice(0, 10)),
    )
    .map((r) => ({
      start: toMinutes(r.start_time),
      end: toMinutes(r.end_time),
      buffer: r.buffer_minutes ?? 0,
    }));

  const blockedWindows = blocked.map((b) => ({
    start: b.start_time ? toMinutes(String(b.start_time)) : 0,
    end: b.end_time ? toMinutes(String(b.end_time)) : 24 * 60,
  }));

  const starts = new Set<number>();
  for (const w of windows) {
    const step = Math.max(10, length + w.buffer);
    for (let t = w.start; t + length <= w.end; t += step) starts.add(t);
  }

  const out: string[] = [];
  for (const t of Array.from(starts).sort((a, b) => a - b)) {
    const capacity = windows.filter((w) => t >= w.start && t + length <= w.end).length;
    if (capacity === 0) continue;
    if (blockedWindows.some((b) => t < b.end && t + length > b.start)) continue;
    const iso = slotISO(date, t);
    if (new Date(iso).getTime() <= now) continue;
    if ((counts.get(iso) ?? 0) >= capacity) continue;
    out.push(iso);
  }

  return out;
}
