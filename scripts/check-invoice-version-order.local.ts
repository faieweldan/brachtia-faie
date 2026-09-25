/**
 * Which kept invoice versions have their lines in the wrong order.
 *
 * Run against your own sandbox from the project root:
 *   bun scripts/check-invoice-version-order.local.ts
 *
 * Versions were frozen with their lines read back by id. The id is a random
 * uuid, so the lines were stored shuffled: a kept version lists the same
 * charges as the invoice, in a different order. This says how many are like
 * that, and shows one so the damage is visible rather than described.
 *
 * It compares each invoice's LATEST version against that invoice's live lines,
 * which is the only pair that can be checked - an older version's lines were
 * deleted when the invoice was edited, and nothing left on record says what
 * order they were in.
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

type Version = {
  id: string;
  invoice_id: string | null;
  version: number;
  number: string;
  document: { items?: { label?: string }[] } | null;
};

const { data: vRows, error: vError } = await db
  .from("invoice_versions")
  .select("id, invoice_id, version, number, document")
  .order("version", { ascending: true });

if (vError) {
  console.error("Could not read invoice_versions:", vError.message);
  process.exit(1);
}

const versions = (vRows ?? []) as Version[];
if (!versions.length) {
  console.log("No invoice versions kept yet. Nothing to check.");
  process.exit(0);
}

// the latest kept version per invoice - the only one with anything to compare to
const latest = new Map<string, Version>();
for (const v of versions) {
  if (!v.invoice_id) continue;
  const held = latest.get(v.invoice_id);
  if (!held || v.version > held.version) latest.set(v.invoice_id, v);
}

const { data: iRows, error: iError } = await db
  .from("invoice_items")
  .select("invoice_id, label, sort_order, created_at")
  .in("invoice_id", [...latest.keys()])
  .order("sort_order")
  .order("created_at");
if (iError) {
  console.error("Could not read invoice_items:", iError.message);
  process.exit(1);
}

const liveByInvoice = new Map<string, string[]>();
for (const r of (iRows ?? []) as { invoice_id: string; label: string }[]) {
  const list = liveByInvoice.get(r.invoice_id) ?? [];
  list.push(String(r.label ?? ""));
  liveByInvoice.set(r.invoice_id, list);
}

let scrambled = 0;
let matching = 0;
let uncheckable = 0;
let shown = false;

for (const [invoiceId, v] of latest) {
  const live = liveByInvoice.get(invoiceId) ?? [];
  const kept = (v.document?.items ?? []).map((i) => String(i?.label ?? ""));
  // only comparable when they are the same lines, just possibly reordered
  const sameSet =
    live.length === kept.length && [...live].sort().join("|") === [...kept].sort().join("|");
  if (!live.length || !kept.length || !sameSet) {
    uncheckable += 1;
    continue;
  }
  if (live.join("|") === kept.join("|")) {
    matching += 1;
    continue;
  }
  scrambled += 1;
  if (!shown) {
    shown = true;
    console.log(`Example - ${v.number} (version ${v.version})\n`);
    const width = Math.max(...live.map((l) => l.length), 20);
    console.log(`  ${"the invoice says".padEnd(width)}  the kept version says`);
    for (let i = 0; i < live.length; i += 1) {
      const same = live[i] === kept[i];
      console.log(`  ${(live[i] ?? "").padEnd(width)}  ${kept[i] ?? ""}${same ? "" : "   <-"}`);
    }
    console.log("");
  }
}

console.log(`Latest kept version checked for ${latest.size} invoice(s):`);
console.log(`  out of order   ${scrambled}`);
console.log(`  correct        ${matching}`);
console.log(`  not comparable ${uncheckable}  (lines changed since, so nothing to compare)`);
console.log(`\n${versions.length} version(s) kept in total. Older ones cannot be checked:`);
console.log("their lines were deleted when the invoice was next edited.");
