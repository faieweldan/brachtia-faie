/**
 * Which bookings are sitting behind their own money.
 *
 * Run against your own sandbox from the project root:
 *   bun scripts/check-stage-vs-money.local.ts
 *
 * A student's viewing link stayed live after they paid, and pressing "Request
 * booking invoice" on it set the stage again - so a booking with its fee banked
 * could land back at Invoice requested. This lists the bookings that happened
 * to, and what the migration will set each one to.
 *
 * It asks the same three questions the app asks: the fee in full is Booked,
 * something paid is Awaiting balance, an invoice with nothing paid is Awaiting
 * payment.
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

const BOOKING_FEE = 500;
const BEHIND = ["open", "room_reserved", "viewing_scheduled", "invoice_requested"];
const db = createClient(url, key);

const { data: eRows, error: eError } = await db
  .from("enquiries")
  .select("id, reference, full_name, status, resident_id")
  .in("status", BEHIND);
if (eError) {
  console.error("Could not read bookings:", eError.message);
  process.exit(1);
}

const bookings = (eRows ?? []) as {
  id: string;
  reference?: string;
  full_name?: string;
  status: string;
  resident_id?: string | null;
}[];
if (!bookings.length) {
  console.log("No bookings are at those stages. Nothing to check.");
  process.exit(0);
}

const { data: iRows, error: iError } = await db
  .from("invoices")
  .select("id, enquiry_id, status, number")
  .in(
    "enquiry_id",
    bookings.map((b) => b.id),
  );
if (iError) {
  console.error("Could not read invoices:", iError.message);
  process.exit(1);
}
const invoices = (
  (iRows ?? []) as { id: string; enquiry_id: string; status: string; number: string }[]
).filter((i) => i.status !== "void" && i.status !== "scheduled");

const { data: pRows, error: pError } = invoices.length
  ? await db
      .from("payments")
      .select("invoice_id, amount")
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      )
  : { data: [], error: null };
if (pError) console.error("Could not read payments:", pError.message);

const paidByInvoice = new Map<string, number>();
for (const p of (pRows ?? []) as { invoice_id: string; amount: number }[]) {
  paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
}

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const rows: string[] = [];

for (const b of bookings) {
  const theirs = invoices.filter((i) => i.enquiry_id === b.id);
  if (!theirs.length) continue; // no invoice: not this bug
  const paid = theirs.reduce((n, i) => n + (paidByInvoice.get(i.id) ?? 0), 0);
  const should =
    paid + 0.005 >= BOOKING_FEE ? "booked" : paid > 0 ? "awaiting_payment" : "awaiting_fee";
  rows.push(
    `  ${(b.reference ?? b.id).padEnd(20)} ${(b.full_name ?? "").padEnd(18)}` +
      ` ${b.status.padEnd(18)} -> ${should.padEnd(18)} paid ${rm(paid)}` +
      `${b.resident_id ? "  (resident exists)" : ""}`,
  );
}

if (!rows.length) {
  console.log(`${bookings.length} booking(s) at those stages, none of them behind their money.`);
  process.exit(0);
}

console.log(`${rows.length} booking(s) sitting behind their own money:\n`);
console.log(
  `  ${"REFERENCE".padEnd(20)} ${"NAME".padEnd(18)} ${"NOW".padEnd(18)} -> ${"SHOULD BE".padEnd(18)}`,
);
for (const r of rows) console.log(r);
console.log("\nThe migration 20260926100000_restage_bookings_pulled_back.sql sets exactly these.");
