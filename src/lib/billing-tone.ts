/**
 * The colours money is shown in, on every page that shows it.
 *
 * Green is settled, amber is falling due, rose is late, sky is part paid, brand
 * is owed but not yet near its day, grey has not begun - so the state is read
 * before a word is. Kept out of the component file so that file
 * exports components only.
 */

/** How much of a total is in, as a whole percentage - the same rounding on every bar. */
export const collectedPct = (total: number, paid: number) =>
  total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

/** Add up one money field across a list of invoices. */
export const sumBy = <K extends string>(list: Record<K, number>[], key: K) =>
  list.reduce((n, item) => n + item[key], 0);

export type Tone = "done" | "due" | "late" | "part" | "open" | "idle";

export const TONE: Record<Tone, { icon: string; pill: string; text: string }> = {
  done: {
    icon: "bg-emerald-50 text-emerald-700",
    pill: "bg-emerald-50 text-emerald-700",
    text: "text-emerald-700",
  },
  due: {
    icon: "bg-amber-50 text-amber-700",
    pill: "bg-amber-50 text-amber-800",
    text: "text-amber-700",
  },
  late: {
    icon: "bg-rose-50 text-rose-700",
    pill: "bg-rose-50 text-rose-700",
    text: "text-rose-700",
  },
  part: {
    icon: "bg-sky-50 text-sky-700",
    pill: "bg-sky-50 text-sky-800",
    text: "text-sky-700",
  },
  open: {
    icon: "bg-brand-tint text-brand-deep",
    pill: "bg-brand-tint text-brand-deep",
    text: "text-brand-deep",
  },
  idle: {
    icon: "bg-brand-tint text-brand-deep",
    pill: "bg-muted text-muted-foreground",
    text: "text-brand-deep",
  },
};
