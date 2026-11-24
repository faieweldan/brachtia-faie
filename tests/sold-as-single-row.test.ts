import { describe, expect, test } from "bun:test";
import { collapseSingles, ownRow } from "@/lib/room-types";
import type { BedRow } from "@/lib/ops-store";

/*
 * A twin room let whole: Ali in Twin 1, Twin 2 marked "Sold as single".
 * On live (24 Nov 2026) the mark showed alone under Reserved - 60 of 66 rows,
 * no name, with a Release button. It is part of Ali's row, everywhere.
 */
const ali = { id: "b1", label: "Twin 1", status: "active", residentName: "Ali" };
const mark = { id: "b2", label: "Twin 2", status: "held", holdFor: "Sold as single" };
const room = { id: "r1", letter: "A", occupancy: "twin", beds: [ali, mark] };
const unit = { id: "u1", rooms: [room] };
const row = (bed: object) => ({ unit, room, bed }) as unknown as BedRow;

describe("Sold as single is part of its room-mate's row", () => {
  test("the mark is never a row of its own", () => {
    expect(ownRow(mark as never)).toBe(false);
    expect(ownRow(ali as never)).toBe(true);
  });

  test("Occupied (mark filtered out): Ali is still one Single row", () => {
    const out = collapseSingles([row(ali)], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.bed.id).toBe("b1");
    expect(out[0]!.asSingle).toBe(true);
  });

  test("All (both beds): one Single row, Ali's", () => {
    const out = collapseSingles([row(ali), row(mark)], []);
    expect(out.map((r) => [r.bed.id, r.asSingle])).toEqual([["b1", true]]);
  });
});
