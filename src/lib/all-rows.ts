/**
 * Every row of a query, not only the first 1,000 (Dani, 21 Oct 2026). The
 * database answers at most 1,000 rows at a time; once the migration brought
 * in 1,081 invoices, Collections silently lost the oldest - the 2025 initial
 * payments. `build` makes the same query again for each page; it must order
 * by something unique (id last) so no row is skipped or read twice.
 */
export async function allRows<T = any>(build: () => any, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}
