/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A stand-in for the service-role client, for tests that run server code
 * without a database: tables are arrays of rows, storage is a map of JSON
 * files. Every write - a row inserted, updated or deleted, a file uploaded, a
 * database function that changes something - is recorded, so a test can say
 * nothing was written. Filters are the ones the code under test uses.
 */
export type Row = Record<string, any>;

/** the database functions that only read - any other call counts as a write */
const READ_ONLY_RPC = new Set(["resident_placements", "placement_claims"]);

export function fakeDb(
  tables: Record<string, Row[]> = {},
  files: Record<string, unknown> = {},
  /** what a database function answers - [] when not given */
  answers: Record<string, (args: any) => unknown> = {},
) {
  const reads: string[] = [];
  const writes: { what: string; op: string; value?: unknown }[] = [];
  const rpcs: string[] = [];
  /** reads and writes in the order they were made */
  const log: string[] = [];
  const wrote = (w: { what: string; op: string; value?: unknown }) => {
    writes.push(w);
    log.push(`${w.op} ${w.what}`);
  };
  const at = (row: Row, path: string) => path.split(".").reduce<any>((o, k) => o?.[k], row);

  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    let write = false;
    const orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
    let max = Infinity;
    const result = () => {
      const sorted = [...rows].sort((a, b) => {
        for (const o of orders) {
          const x = at(a, o.col) ?? null;
          const y = at(b, o.col) ?? null;
          if (x === y) continue;
          if (x === null) return o.nullsFirst ? -1 : 1;
          if (y === null) return o.nullsFirst ? 1 : -1;
          return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
        }
        return 0;
      });
      return write ? null : sorted.slice(0, max);
    };
    let op = "";
    let made: Row[] = [];
    const record = (kind: string, value?: unknown) => {
      write = true;
      op = kind;
      wrote({ what: table, op: kind, value });
      // a row inserted is there for the reads after it, with an id when it brought none
      if (kind === "insert" || kind === "upsert") {
        made = (Array.isArray(value) ? value : [value]).map((v: any) => ({
          id: crypto.randomUUID(),
          ...v,
        }));
        (tables[table] ??= []).push(...made);
      }
      if (kind === "update") made = [value as Row];
      return q;
    };
    // an update or delete applies to the rows its filters leave, once it is run
    const run = () => {
      if (op === "update") for (const r of rows) Object.assign(r, made[0]);
      if (op === "delete") tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
      return write ? (op === "update" ? rows : made) : result();
    };
    const q: any = {
      select: () => {
        if (!write) {
          reads.push(table);
          log.push(`read ${table}`);
        }
        return q;
      },
      insert: (v: unknown) => record("insert", v),
      update: (v: unknown) => record("update", v),
      upsert: (v: unknown) => record("upsert", v),
      delete: () => record("delete"),
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => at(r, c) === v)), q),
      neq: (c: string, v: unknown) => ((rows = rows.filter((r) => at(r, c) !== v)), q),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(at(r, c)))), q),
      is: (c: string, v: unknown) => ((rows = rows.filter((r) => (at(r, c) ?? null) === v)), q),
      gte: (c: string, v: any) => ((rows = rows.filter((r) => at(r, c) >= v)), q),
      gt: (c: string, v: any) => ((rows = rows.filter((r) => at(r, c) > v)), q),
      lte: (c: string, v: any) => ((rows = rows.filter((r) => at(r, c) <= v)), q),
      lt: (c: string, v: any) => ((rows = rows.filter((r) => at(r, c) < v)), q),
      not: () => q,
      or: () => q,
      order: (col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
        const asc = o.ascending !== false;
        orders.push({ col, asc, nullsFirst: o.nullsFirst ?? !asc });
        return q;
      },
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => ({ data: run()?.[0] ?? null, error: null }),
      single: async () => ({ data: run()?.[0] ?? null, error: null }),
      then: (ok: any, fail: any) => Promise.resolve({ data: run(), error: null }).then(ok, fail),
    };
    return q;
  }

  const sb = {
    from: query,
    rpc: async (name: string, args: unknown) => {
      rpcs.push(name);
      if (READ_ONLY_RPC.has(name)) log.push(`read rpc ${name}`);
      else wrote({ what: `rpc ${name}`, op: "call", value: args });
      return { data: answers[name]?.(args) ?? [], error: null };
    },
    storage: {
      from: () => ({
        download: async (path: string) => (
          log.push(`read file ${path}`),
          {
            data: path in files ? { text: async () => JSON.stringify(files[path]) } : null,
            error: null,
          }
        ),
        upload: async (path: string, value: unknown) => {
          files[path] = JSON.parse(await (value as Blob).text());
          wrote({ what: `file ${path}`, op: "upload", value: files[path] });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          wrote({ what: `files ${paths.join(", ")}`, op: "remove" });
          return { error: null };
        },
      }),
    },
  };
  return { sb, reads, writes, rpcs, log, files };
}
