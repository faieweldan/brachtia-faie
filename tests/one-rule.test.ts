import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * One fact, one place (docs/MISTAKES-TO-AVOID.md, 11 Oct 2026). How a room can
 * be sold - single, twin, a twin let whole, a single made twin - is decided in
 * src/lib/room-offer.ts (roomOffer). A screen that writes its own copy drifts:
 * the booking picker never learnt that an empty twin can be sold as a single,
 * which Homes knew.
 *
 * So screens may not test a room's shape themselves. The lines below were
 * already there when this test was written; the count may go down, never up.
 * A new one fails here: call roomOffer instead, or - if it only draws a label -
 * raise the count on purpose and say why in the commit.
 */
const RULE = /\.occupancy\s*[!=]==\s*"(single|twin)"|isSoldAsSingle\(|"Sold as single"|SOLD_AS_SINGLE/;

const KNOWN: Record<string, number> = {
  "src/components/admin/ReserveBedDialog.tsx": 2,
  "src/components/admin/StayDetailsCard.tsx": 2,
  "src/routes/admin.bookings.$id.tsx": 8,
  "src/routes/admin.bookings.$id_.invoice.tsx": 2,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("room-selling rules live in src/lib, not on screens", () => {
  const counts: Record<string, number> = {};
  for (const f of [...files("src/routes"), ...files("src/components")]) {
    const n = readFileSync(f, "utf8").split("\n").filter((l) => RULE.test(l)).length;
    if (n) counts[f] = n;
  }
  test("no screen has more room-shape checks than it had", () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (KNOWN[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (allowed ${KNOWN[f] ?? 0}) - use roomOffer() from src/lib/room-offer.ts`);
    expect(over).toEqual([]);
  });
});
