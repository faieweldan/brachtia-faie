/**
 * How long a stay is, in months and days - "11 months 30 days".
 *
 * Whole months are counted first, then the days left over are borrowed from the
 * month before the end date, so 16 Sept 2026 -> 15 Sept 2027 reads as 11 months
 * 30 days, never a rounded "1y".
 */
export function stayLength(start?: string | null, end?: string | null) {
  if (!start || !end) return "—";
  const a = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return "—";

  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
  }
  const parts = [
    months > 0 ? `${months} month${months === 1 ? "" : "s"}` : "",
    days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 days";
}
