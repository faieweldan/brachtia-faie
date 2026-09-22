/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Why a booking's Stay details shows the rent it does.
 *
 *   bun scripts/check-booking-rates.ts BH-150926-QT0020
 *   bun scripts/check-booking-rates.ts <booking uuid>
 *
 * Reads the booking, the residence's room types in Website, and the bed held
 * for it, then says which rate the Stay details card can read and, when it can
 * read none, which of the four reasons it is:
 *
 *   the room preference is empty
 *   the room preference is not one of this residence's room types
 *   the room type has no rate for this term and occupancy
 *   the occupancy is Whole unit, which room-type rates do not price
 *
 * Read only: nothing is written. Needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env, so it reads the database .env points at.
 * Names and dates are printed, so the output stays on this Mac.
 */

const ref = process.argv[2];
if (!ref) {
  console.error('Usage: bun scripts/check-booking-rates.ts "BH-150926-QT0020"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Run from the project folder.",
  );
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { data: booking, error } = await supabase
  .from("enquiries")
  .select("*")
  .eq(UUID.test(ref) ? "id" : "reference", ref)
  .maybeSingle();
if (error) throw new Error(error.message);
if (!booking) {
  console.error(`No booking found for ${ref}`);
  process.exit(1);
}

/** The same rule the app uses: six months or less is the short-term rate. */
function termOf(from: string, to: string) {
  if (!from || !to) return null;
  const six = new Date(`${from}T00:00:00Z`);
  six.setUTCMonth(six.getUTCMonth() + 6);
  return new Date(`${to}T00:00:00Z`).getTime() > six.getTime() ? "long" : "short";
}

const b = booking as Record<string, any>;
const term = termOf(String(b["move_in"] ?? ""), String(b["move_out"] ?? ""));
const occupancy = String(b["occupancy"] ?? "");
const roomCode = String(b["room_code"] ?? "");
const money = (v: unknown) => (v == null || v === "" ? "—" : `RM${Number(v).toFixed(2)}`);

console.log("\nBOOKING");
console.log(`  reference      ${b["reference"] ?? b["id"]}`);
console.log(`  residence      ${b["residence_name"] || "—"}  (slug ${b["residence_slug"] || "—"})`);
console.log(`  unit type      ${b["unit_type"] || "—"}`);
console.log(`  room code      ${roomCode || "— (empty)"}`);
console.log(`  room name      ${b["room_name"] || "—"}`);
console.log(`  occupancy      ${occupancy || "—"}`);
console.log(`  move in/out    ${b["move_in"] || "—"} → ${b["move_out"] || "—"}`);
console.log(`  term           ${term ?? "— (needs both dates)"}  (saved: ${b["term"] || "—"})`);
console.log(`  saved rent     ${money(b["monthly_rent"])}`);
console.log(`  saved initial  ${money(b["first_payment"])}`);

const { data: residence } = await supabase
  .from("residences")
  .select("id, name, slug")
  .eq("slug", String(b["residence_slug"] ?? ""))
  .maybeSingle();

if (!residence) {
  console.log("\nNo residence in Website matches this booking's slug - nothing can be priced.\n");
  process.exit(0);
}

const { data: roomTypes } = await supabase
  .from("room_types")
  .select("code, room_code, name, unit_type, occupancies, rent")
  .eq("residence_id", (residence as any).id)
  .order("sort_order");

const types = (roomTypes ?? []) as Record<string, any>[];
console.log(`\nWEBSITE ROOM TYPES - ${(residence as any).name} (${types.length})`);
for (const t of types) {
  const rent = t["rent"] ?? {};
  const rate = (which: string) => `${rent?.[which]?.single ?? "—"} / ${rent?.[which]?.twin ?? "—"}`;
  console.log(
    `  ${String(t["code"]).padEnd(16)} ${String(t["name"]).padEnd(32)} ${String(
      t["unit_type"] ?? "",
    ).padEnd(22)} 12-mo ${rate("long").padEnd(14)} short ${rate("short")}`,
  );
}

const byCode = types.find((t) => String(t["code"] ?? "") === roomCode);
const byRoomCode = types.find((t) => String(t["room_code"] ?? "") === roomCode);
const byName = types.find((t) => String(t["name"] ?? "") === String(b["room_name"] ?? ""));
const match = byCode ?? byRoomCode ?? byName ?? null;

console.log("\nMATCHING THE BOOKING'S ROOM PREFERENCE");
console.log(`  by code        ${byCode ? byCode["name"] : "no match"}`);
console.log(`  by room_code   ${byRoomCode ? byRoomCode["name"] : "no match"}`);
console.log(`  by name        ${byName ? byName["name"] : "no match"}`);

const { data: beds } = await supabase
  .from("beds")
  .select("id, label, status, rent")
  .eq("enquiry_id", b["id"]);
const bed = (beds ?? [])[0] as Record<string, any> | undefined;
console.log(
  `\nBED HELD FOR THIS BOOKING  ${
    bed ? `${bed["label"]} · ${bed["status"]} · rent ${money(bed["rent"])}` : "none"
  }`,
);

console.log("\nWHAT STAY DETAILS CAN READ");
if (bed && bed["rent"] != null) {
  console.log(`  ${money(bed["rent"])} - the reserved bed's own agreed rent, whatever the term`);
} else if (!term) {
  console.log("  nothing - move in and move out are needed for the term");
} else if (occupancy === "unit") {
  console.log("  nothing - Whole unit is not priced by room-type rates");
} else if (!roomCode) {
  console.log("  nothing - the booking has no room preference");
} else if (!match) {
  console.log("  nothing - the room preference is not one of this residence's room types");
} else {
  const want = occupancy === "twin" ? "twin" : "single";
  const rate = match["rent"]?.[term]?.[want];
  console.log(
    rate
      ? `  ${money(rate)} - ${match["name"]}, ${term === "short" ? "short-term" : "12-month"} ${want} rate`
      : `  nothing - ${match["name"]} has no ${term === "short" ? "short-term" : "12-month"} ${want} rate in Website`,
  );
}
console.log("");
