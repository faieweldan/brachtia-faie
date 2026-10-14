import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/*
 * 20261017100000_placement_order_fix.sql (17 Oct 2026) - two faults in
 * 20261014100000_one_placement.sql found by its database tests on test-bratchia.
 * The behaviour itself is proved against a database: tests 8 and 9 of
 * tests/one-placement.db.test.ts. These check the file says what it should.
 */
const fix = readFileSync("supabase/migrations/20261017100000_placement_order_fix.sql", "utf8");
const down = readFileSync("supabase/rollback/20261017100000_placement_order_fix.down.sql", "utf8");
const one = readFileSync("supabase/migrations/20261014100000_one_placement.sql", "utf8");
const fn = (sql: string, name: string) => {
  const at = sql.indexOf(`create or replace function public.${name}(`);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

describe("a resident moving out: the next paid stay on the bed they left is seated", () => {
  const body = fn(fix, "place_stay");

  test("their tenancy moves to the new bed before the old bed is offered to the next stay", () => {
    const moved = body.indexOf("update public.tenancies set bed_id = p_bed::text");
    const next = body.indexOf("perform public.seat_if_first(v_gone, t.id)");
    expect(moved).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(moved);
    // and not also inside the loop that empties the old beds, before the move
    const emptying = body.slice(
      body.indexOf("for v_old in select"),
      body.indexOf("end loop;", body.indexOf("for v_old in select")),
    );
    expect(emptying).toContain("perform public.empty_bed(v_old.id)");
    expect(emptying).not.toContain("seat_if_first");
  });

  test("everything else in place_stay is as 20261014100000 left it", () => {
    const strip = (s: string) =>
      s
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n")
        .replace(/\s+/g, " ");
    const before = strip(fn(one, "place_stay"));
    const after = strip(body);
    const nextBlock =
      /perform public\.seat_if_first\(v_[\w.]+, t\.id\) from public\.tenancies t join public\.residents r on r\.id = t\.resident_id where t\.bed_id = v_[\w.]+::text and t\.resident_id <> v_res\.id and coalesce\(t\.end_date, 'infinity'::date\) >= current_date and lower\(coalesce\(r\.status, ''\)\) <> 'inactive' order by t\.start_date nulls last limit 1; /;
    expect(before).toMatch(nextBlock);
    expect(after).toMatch(nextBlock);
    // the same block, moved; one new variable to walk the beds they left
    expect(
      after
        .replace(nextBlock, "")
        .replace(" foreach v_gone in array coalesce(v_left, '{}'::uuid[]) loop end loop;", "")
        .replace(" v_gone uuid;", ""),
    ).toBe(before.replace(nextBlock, ""));
  });
});

describe("saving a unit: the room-shape list is emptied without a DELETE Supabase refuses", () => {
  test("TRUNCATE on its own temporary table, never DELETE without WHERE", () => {
    const body = fn(fix, "sync_room_shapes");
    expect(body).toContain("create temporary table if not exists _reshape");
    expect(body).toContain("truncate _reshape;");
    expect(body).not.toMatch(/delete\s+from\s+_reshape\s*;/i);
    // the rest of the function unchanged
    const rest = (s: string) =>
      s
        .split("\n")
        .filter((l) => !/^\s*--/.test(l) && !/_reshape;\s*$/.test(l.trim()))
        .join("\n");
    expect(rest(body)).toBe(rest(fn(one, "sync_room_shapes")));
  });
});

describe("the migration and its undo", () => {
  test("one transaction, needs 20261014100000, server only, nothing else changed", () => {
    expect(fix.trim().endsWith("commit;")).toBe(true);
    expect(fix).toMatch(/\nbegin;\n/);
    expect(fix).toContain("needs 20261014100000_one_placement.sql first");
    expect(
      [...fix.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]),
    ).toEqual(["place_stay", "sync_room_shapes"]);
    expect(fix).not.toMatch(/security definer|drop function|alter table|create table/i);
    expect(fix).toContain("revoke execute on function %s from public, anon, authenticated");
    expect(fix).toContain("grant execute on function %s to service_role");
  });

  test("the undo puts back exactly what 20261014100000 made", () => {
    for (const f of ["place_stay", "sync_room_shapes"]) expect(fn(down, f)).toBe(fn(one, f));
  });
});
