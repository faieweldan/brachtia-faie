/**
 * Which bookings the Invoice requested backfill will move, before it moves any.
 *
 * Run against your own sandbox from the project root:
 *   bun scripts/check-invoice-requested.local.ts
 *
 * It asks the same three questions the migration asks - sitting at Awaiting
 * payment, carrying viewing_skipped_at, and with no live invoice - and prints
 * the bookings that answer yes to all three. Those are the ones the old
 * behaviour filed as "the invoice went out" when the student had only asked
 * for it.
 *
 * It also prints the near misses: bookings at Awaiting payment with no invoice
 * that the migration will NOT touch because nobody skipped a viewing on them.
 * Those are a staff decision rather than this bug, so they are left alone - but
 * they are worth a look.
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

const db = createClient(url, key);

const { data: rows, error } = await db
  .from("enquiries")
  .select("id, reference, full_name, status, viewing_skipped_at, stage_changed_at")
  .eq("status", "awaiting_fee");

if (error) {
  console.error("Could not read bookings:", error.message);
  process.exit(1);
}

type Booking = {
  id: string;
  reference?: string;
  full_name?: string;
  viewing_skipped_at?: string | null;
  stage_changed_at?: string | null;
};
const bookings = (rows ?? []) as Booking[];
if (!bookings.length) {
  console.log("No bookings are sitting at Awaiting payment. Nothing to move.");
  process.exit(0);
}

// one query rather than one per booking
const { data: invRows, error: invError } = await db
  .from("invoices")
  .select("enquiry_id, status")
  .in(
    "enquiry_id",
    bookings.map((b) => b.id),
  );
if (invError) console.error("Could not read invoices:", invError.message);

const hasLiveInvoice = new Set(
  ((invRows ?? []) as { enquiry_id: string; status: string }[])
    .filter((i) => i.status !== "void" && i.status !== "scheduled")
    .map((i) => i.enquiry_id),
);

const days = (iso?: string | null) =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null;

const willMove = bookings.filter((b) => b.viewing_skipped_at && !hasLiveInvoice.has(b.id));
const leftAlone = bookings.filter((b) => !b.viewing_skipped_at && !hasLiveInvoice.has(b.id));

console.log(`${bookings.length} booking(s) at Awaiting payment.\n`);

console.log(`WILL MOVE to Invoice requested: ${willMove.length}`);
for (const b of willMove) {
  const waited = days(b.stage_changed_at);
  console.log(
    `  ${b.reference ?? b.id}  ${b.full_name ?? ""}` +
      `${waited === null ? "" : `  waiting ${waited}d`}`,
  );
}

console.log(`\nLEFT ALONE - no invoice, but nobody skipped a viewing: ${leftAlone.length}`);
for (const b of leftAlone) {
  console.log(`  ${b.reference ?? b.id}  ${b.full_name ?? ""}  (a staff decision, check by hand)`);
}

console.log(
  `\nUntouched because they really do have an invoice: ${bookings.length - willMove.length - leftAlone.length}`,
);
