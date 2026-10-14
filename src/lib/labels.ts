/**
 * Resident labels (Dani, 13 Oct 2026) - admin's own tags, like WhatsApp's chat
 * labels: a name and a colour, put on any resident to filter by. They mean
 * nothing to the system; no rule reads them.
 *
 * The colours are a fixed set, so every label stays readable in the same pill
 * and a typo cannot make one invisible. The key is what the database stores.
 */
export const LABEL_COLORS = {
  slate: { name: "Grey", pill: "border-slate-200 bg-slate-100 text-slate-800", dot: "bg-slate-500" },
  red: { name: "Red", pill: "border-red-200 bg-red-100 text-red-900", dot: "bg-red-500" },
  orange: { name: "Orange", pill: "border-orange-200 bg-orange-100 text-orange-900", dot: "bg-orange-500" },
  amber: { name: "Yellow", pill: "border-amber-200 bg-amber-100 text-amber-900", dot: "bg-amber-400" },
  emerald: { name: "Green", pill: "border-emerald-200 bg-emerald-100 text-emerald-900", dot: "bg-emerald-500" },
  sky: { name: "Blue", pill: "border-sky-200 bg-sky-100 text-sky-900", dot: "bg-sky-500" },
  violet: { name: "Purple", pill: "border-violet-200 bg-violet-100 text-violet-900", dot: "bg-violet-500" },
  pink: { name: "Pink", pill: "border-pink-200 bg-pink-100 text-pink-900", dot: "bg-pink-500" },
} as const;

export type LabelColor = keyof typeof LABEL_COLORS;
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];
export const labelColor = (c: string) => LABEL_COLORS[(c in LABEL_COLORS ? c : "slate") as LabelColor];

export type Label = { id: string; name: string; color: LabelColor };

/** A name as admin typed it, tidied: one space between words, at most 30 characters. */
export const cleanLabelName = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 30);
