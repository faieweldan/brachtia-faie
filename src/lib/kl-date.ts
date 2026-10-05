/**
 * Today's date in Malaysia, yyyy-mm-dd (Dani, 4 Oct 2026). toISOString() gives
 * the date in London (UTC), which is still yesterday until 8 a.m. here - an
 * invoice made at 12.11 a.m. on 4 Oct read 3 Oct.
 */
export function klToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
