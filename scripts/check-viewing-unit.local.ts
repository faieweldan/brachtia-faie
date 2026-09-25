/**
 * Why does the viewing link show no unit?
 *
 * Run against your own sandbox with a booking reference:
 *   bun scripts/check-viewing-unit.local.ts BH-250926-QT0038
 *
 * It walks the same three steps the viewing link walks - booking, bed, room,
 * unit - and says which one came back empty. The link itself cannot tell you
 * that: a lookup that fails and a booking with no bed held both end as no unit.
 *
 * Reads only. Nothing is written.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const key =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["VITE_SUPABASE_ANON_KEY"] ??
  "";

if (!url || !key) {
  console.error("No Supabase credentials in the environment. Run this from the project root");
  console.error("where your .env lives, or export VITE_SUPABASE_URL and a key first.");
  process.exit(1);
}

const reference = process.argv[2];
if (!reference) {
  console.error("Give me a booking reference, e.g. BH-250926-QT0038");
  process.exit(1);
}

const db = createClient(url, key);

const { data: booking, error: bookingError } = await db
  .from("enquiries")
  .select("id, reference, room_name")
  .eq("reference", reference)
  .maybeSingle();

if (bookingError) console.error("1. booking  ERROR:", bookingError.message);
if (!booking) {
  console.error(`1. booking  not found for ${reference}`);
  process.exit(1);
}
console.log(`1. booking  ${booking.reference}  (${booking.id})`);

const { data: beds, error: bedError } = await db
  .from("beds")
  .select("id, room_id, status, label")
  .eq("enquiry_id", booking.id);

if (bedError) console.error("2. beds     ERROR:", bedError.message);
console.log(`2. beds     ${(beds ?? []).length} carrying this booking`);
for (const b of (beds ?? []) as { id: string; status: string; label: string }[]) {
  console.log(`            ${b.label}  status=${b.status}`);
}

const held = ((beds ?? []) as { room_id: string; status: string }[]).find(
  (b) => b.status !== "vacant",
);
if (!held) {
  console.log("\nNo bed is held for this booking, so there is no unit to show.");
  console.log("Reserve a room for it, then look again.");
  process.exit(0);
}

const { data: room, error: roomError } = await db
  .from("rooms")
  .select("letter, unit_id")
  .eq("id", held.room_id)
  .maybeSingle();
if (roomError) console.error("3. room     ERROR:", roomError.message);
console.log(`3. room     letter=${(room as { letter?: string } | null)?.letter ?? "(none)"}`);

const unitId = (room as { unit_id?: string } | null)?.unit_id;
if (!unitId) {
  console.log("\nThe room has no unit on it. That is the fault.");
  process.exit(0);
}

const { data: unit, error: unitError } = await db
  .from("units")
  .select("unit_no")
  .eq("id", unitId)
  .maybeSingle();
if (unitError) console.error("4. unit     ERROR:", unitError.message);

const unitNo = (unit as { unit_no?: string } | null)?.unit_no ?? "";
console.log(`4. unit     unit_no=${unitNo || "(none)"}`);
console.log(
  `\nThe viewing link should say:  Unit ${unitNo} · Room ${(room as { letter?: string } | null)?.letter ?? ""}`,
);
