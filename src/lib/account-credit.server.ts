import { klToday } from "@/lib/kl-date";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Account credit (agreed 7 Oct 2026). Money of the resident's that Brachtia
 * holds against what they will owe - never paid out during Update Tenancy:
 *   - a lower required deposit: the difference is reclassified from deposit
 *     to account credit, so checkout does not refund it a second time
 *   - a cheaper room moved into during a rent period already billed
 *
 * Credit is applied by itself to the oldest outstanding invoice - an IP, a
 * Rental Payment (RP) or a later Additional Charge. Each use is a payment
 * whose method is "Account credit", so the invoice shows it as paid like any
 * other money.
 *
 * Kept beside the resident's documents, so neither database needs a change:
 *   account-credit/<resident>.json   every credit given
 *   account-credit/index.json        the residents who have one
 *
 * Server only - each is handed the service-role client by a server function.
 */
const BUCKET = "resident-documents";
export const CREDIT_METHOD = "Account credit";

export type CreditEntry = {
  id: string;
  at: string;
  amount: number;
  /** "Security deposit reduced - room change 11 Nov 2026" */
  reason: string;
  kind: "deposit" | "rent";
  /** a deposit reclassified: which one - checkout takes it off what is held */
  depositKey?: string;
  depositLabel?: string;
  /** the Update Tenancy event it came from */
  eventId?: string;
};

const path = (residentId: string) => `account-credit/${residentId}.json`;
const INDEX = "account-credit/index.json";
const r2 = (n: number) => Math.round(n * 100) / 100;

async function readJson<T>(sb: any, p: string): Promise<T | null> {
  const { data } = await sb.storage.from(BUCKET).download(p, { cacheNonce: Date.now() });
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}
async function writeJson(sb: any, p: string, value: unknown) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(p, new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Could not save the account credit: ${error.message}`);
}

export async function creditEntries(sb: any, residentId: string): Promise<CreditEntry[]> {
  return (await readJson<CreditEntry[]>(sb, path(residentId))) ?? [];
}

export async function addCredit(sb: any, residentId: string, entries: Omit<CreditEntry, "id" | "at">[]) {
  const add = entries.filter((e) => e.amount > 0.005);
  if (!add.length) return;
  const now = new Date().toISOString();
  const list = await creditEntries(sb, residentId);
  list.push(...add.map((e) => ({ ...e, amount: r2(e.amount), id: crypto.randomUUID().slice(0, 8), at: now })));
  await writeJson(sb, path(residentId), list);
  const index = (await readJson<string[]>(sb, INDEX)) ?? [];
  if (!index.includes(residentId)) await writeJson(sb, INDEX, [...index, residentId]);
}

/** given, used, and what is left */
export async function creditBalance(sb: any, residentId: string) {
  const given = r2((await creditEntries(sb, residentId)).reduce((n, e) => n + e.amount, 0));
  if (!given) return { given: 0, used: 0, balance: 0 };
  const { data } = await sb.from("payments").select("amount").eq("resident_id", residentId).eq("method", CREDIT_METHOD);
  const used = r2(((data ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0));
  return { given, used, balance: r2(Math.max(0, given - used)) };
}

/** the deposits reclassified as credit, by deposit - checkout holds that much less */
export async function reclassifiedDeposits(sb: any, residentId: string) {
  return (await creditEntries(sb, residentId)).filter((e) => e.kind === "deposit");
}

/**
 * Use the credit: on `first` when it is given (the event's own IP, even
 * before it is billed), then on the oldest invoice still owing. Rent not
 * billed yet is left alone - it is made again whenever the schedule changes -
 * and takes the credit on the day it is billed.
 */
export async function applyAccountCredit(sb: any, residentId: string, first?: string, only = false) {
  let { balance } = await creditBalance(sb, residentId);
  if (balance <= 0.005) return [] as { invoiceId: string; amount: number }[];
  const { data: rows } = await sb
    .from("invoices")
    .select("id, total, status, enquiry_id, invoice_date, issued_at")
    .eq("resident_id", residentId)
    .not("status", "in", "(void,paid)")
    .order("invoice_date", { ascending: true })
    .order("issued_at", { ascending: true });
  const all = (rows ?? []) as any[];
  const targets = [
    ...all.filter((r) => r.id === first),
    // only: Update Tenancy's confirm, which uses credit on its own IPs, as its preview showed
    ...(only ? [] : all.filter((r) => r.id !== first && r.status !== "scheduled")),
  ];
  if (!targets.length) return [];
  const { data: pays } = await sb.from("payments").select("invoice_id, amount").in("invoice_id", targets.map((t) => t.id));
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));

  const used: { invoiceId: string; amount: number }[] = [];
  for (const inv of targets) {
    if (balance <= 0.005) break;
    const owing = r2(Number(inv.total || 0) - (paid.get(inv.id) ?? 0));
    if (owing <= 0.005) continue;
    const amount = r2(Math.min(owing, balance));
    const row: Record<string, unknown> = {
      invoice_id: inv.id,
      enquiry_id: inv.enquiry_id ?? null,
      resident_id: residentId,
      amount,
      paid_on: klToday(),
      method: CREDIT_METHOD,
      reference: "",
      proof_path: "",
      description: "Account credit applied",
      recorded_by: "System",
    };
    let { error } = await sb.from("payments").insert(row);
    if (error && /recorded_by/.test(error.message)) {
      delete row["recorded_by"];
      ({ error } = await sb.from("payments").insert(row));
    }
    if (error) throw new Error(`Could not apply the account credit: ${error.message}`);
    balance = r2(balance - amount);
    const settled = owing - amount <= 0.005;
    // an IP not billed yet stays scheduled - it is billed on its day, already paid
    if (inv.status !== "scheduled") {
      await sb.from("invoices").update({ status: settled ? "paid" : "part_paid", updated_at: new Date().toISOString() }).eq("id", inv.id);
    }
    used.push({ invoiceId: inv.id, amount });
    if (settled) {
      const { tenancyChangeAfterPayment } = await import("@/lib/tenancy-change.functions");
      await tenancyChangeAfterPayment(sb, inv.id);
    }
  }
  return used;
}

/** every resident with credit: theirs used on whatever has been billed since */
export async function applyAllAccountCredit(sb: any) {
  const index = (await readJson<string[]>(sb, INDEX)) ?? [];
  for (const id of index) {
    try {
      await applyAccountCredit(sb, id);
    } catch (err) {
      console.warn(`account credit ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
