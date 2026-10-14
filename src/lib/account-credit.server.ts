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
 * Kept in the database since 15 Oct 2026 (20261015100000_atomic_payments.sql):
 *   account_credit_entries   every credit given, and when one was taken back
 * Each grant has a key, so the same credit is never given twice; using credit
 * locks the resident's credit and open invoices first, so two requests at once
 * cannot spend it twice (apply_account_credit).
 *
 * Before, it was kept in Storage - account-credit/<resident>.json and
 * account-credit/index.json. Those files are read, never written: a resident's
 * file is brought into the database once, the first time their credit is used
 * or shown (import_legacy_account_credit), and left where it is.
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
  kind: "deposit" | "rent" | "cancel";
  /** a deposit reclassified: which one - checkout takes it off what is held */
  depositKey?: string;
  depositLabel?: string;
  /** the Update Tenancy event it came from */
  eventId?: string;
  /** the event was cancelled: the credit is taken back, kept here for the record */
  reversedAt?: string;
  reversedReason?: string;
};

/** A credit note's refund, once paid (13 Oct 2026). */
export type CreditRefund = {
  amount: number;
  paidOn: string;
  method: string;
  reference: string;
  proofPath: string;
  recordedBy: string;
  recordedAt: string;
};

/**
 * A credit note: account credit no invoice can take, paid back (Dani, 13 Oct
 * 2026). Its own table since 14 Oct 2026 (20261018100000_account_credit_notes.sql),
 * counted in account_credit_position, so the balance is one figure.
 */
export type CreditNote = {
  id: string;
  at: string;
  /** what was paid back - above zero */
  amount: number;
  reason: string;
  /** CN/RF/00001 */
  number: string;
  issuedBy: string;
  /** who it was issued to, as it says (20261021100000_credit_note_numbers.sql) */
  residentName: string;
  residentCode: string;
  refund?: CreditRefund | undefined;
};

/** credit to give - `key` makes it once only; an event's credit has one by itself */
export type CreditGrant = Omit<CreditEntry, "id" | "at" | "reversedAt" | "reversedReason"> & {
  key?: string;
};

const legacyPath = (residentId: string) => `account-credit/${residentId}.json`;
const LEGACY_INDEX = "account-credit/index.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The key a grant is given once under: an Update Tenancy event's credit by the
 * event, its kind and its deposit - the same event cannot give it twice; any
 * other once, by the key it was given or a new one.
 */
export function grantKey(e: CreditGrant): string {
  if (e.key) return e.key;
  if (e.eventId && e.kind !== "cancel") return `event:${e.eventId}:${e.kind}:${e.depositKey ?? ""}`;
  return `once:${crypto.randomUUID()}`;
}

/**
 * An old Storage file, read - null when the resident never had one. A file
 * that cannot be read stops here: marking it brought over would lose it.
 */
async function readLegacy(sb: any, path: string): Promise<unknown[] | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path, { cacheNonce: Date.now() });
  if (!data) {
    const why = `${String(error?.message ?? "")} ${JSON.stringify(error ?? {})}`;
    if (!error || /not.?found|404/i.test(why)) return null;
    throw new Error(`Could not read the old account credit file: ${error.message ?? why}`);
  }
  try {
    const list = JSON.parse(await data.text());
    if (!Array.isArray(list)) throw new Error("not a list");
    return list;
  } catch (err) {
    throw new Error(
      `The old account credit file ${path} cannot be read (${err instanceof Error ? err.message : String(err)}) - nothing was brought over.`,
    );
  }
}

// residents brought over by this server already - the database says so too
const brought = new Set<string>();

/** The resident's old Storage credit, brought into the database once - before any read or use. */
async function ledgerReady(sb: any, residentId: string) {
  if (brought.has(residentId)) return;
  const { data: mark, error } = await sb
    .from("account_credit_imports")
    .select("resident_id")
    .eq("resident_id", residentId)
    .maybeSingle();
  if (error) throw new Error(`Account credit is not ready on this database: ${error.message}`);
  if (!mark) {
    const entries = (await readLegacy(sb, legacyPath(residentId))) ?? [];
    // marked in the same step as the entries - run twice, by two requests at once, it adds nothing
    const { error: iErr } = await sb.rpc("import_legacy_account_credit", {
      p_resident: residentId,
      p_entries: entries,
    });
    if (iErr) throw new Error(`Could not bring over the old account credit: ${iErr.message}`);
  }
  brought.add(residentId);
}

const toEntry = (r: any): CreditEntry => ({
  id: String(r.id),
  at: String(r.created_at ?? ""),
  amount: Number(r.amount),
  reason: String(r.reason ?? ""),
  kind: r.kind,
  ...(r.deposit_key ? { depositKey: String(r.deposit_key) } : {}),
  ...(r.deposit_label ? { depositLabel: String(r.deposit_label) } : {}),
  ...(r.event_id ? { eventId: String(r.event_id) } : {}),
  ...(r.reversed_at
    ? { reversedAt: String(r.reversed_at), reversedReason: String(r.reversed_reason ?? "") }
    : {}),
});

export async function creditEntries(sb: any, residentId: string): Promise<CreditEntry[]> {
  if (!UUID.test(residentId)) return [];
  await ledgerReady(sb, residentId);
  const { data, error } = await sb
    .from("account_credit_entries")
    .select("*")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(toEntry);
}

/** Give credit - each entry once, by its key (grantKey); what was given before is not given again. */
export async function addCredit(sb: any, residentId: string, entries: CreditGrant[]) {
  const add = entries.filter((e) => e.amount > 0.005);
  if (!add.length) return;
  if (!UUID.test(residentId)) throw new Error("Account credit needs a resident");
  await ledgerReady(sb, residentId);
  const { error } = await sb.rpc("grant_account_credit", {
    p_resident: residentId,
    p_entries: add.map((e) => ({
      amount: e.amount,
      reason: e.reason,
      kind: e.kind,
      depositKey: e.depositKey ?? "",
      depositLabel: e.depositLabel ?? "",
      eventId: e.eventId ?? "",
      key: grantKey(e),
    })),
  });
  if (error) throw new Error(`Could not save the account credit: ${error.message}`);
}

/**
 * Given, used, and what is left. Credit used on an invoice later voided - a
 * cancelled event's IP - is the resident's again.
 */
export async function creditBalance(sb: any, residentId: string) {
  if (!UUID.test(residentId)) return { given: 0, used: 0, noted: 0, balance: 0 };
  await ledgerReady(sb, residentId);
  const { data, error } = await sb.rpc("account_credit_position", { p_resident: residentId });
  if (error) throw new Error(error.message);
  return {
    given: Number((data as any)?.given ?? 0),
    used: Number((data as any)?.used ?? 0),
    // paid back on credit notes: no longer the resident's to use (13 Oct 2026)
    noted: Number((data as any)?.noted ?? 0),
    balance: Number((data as any)?.balance ?? 0),
  };
}

/**
 * Where the credit left will go (Dani, 13 Oct 2026): onto the invoices still to
 * pay - rent not billed yet included - oldest first, as applyAccountCredit
 * takes them; and the leftover no invoice can take. Read-only.
 *
 * The leftover is the database's (account_credit_leftover) - the figure the
 * credit note is issued for, under lock - so the button never offers one
 * amount and the note says another. planCredit only spreads the balance over
 * the invoices for the screen.
 */
export async function creditOutlook(sb: any, residentId: string) {
  const { planCredit } = await import("@/lib/credit-plan");
  if (!UUID.test(residentId)) return { balance: 0, plan: [] as ReturnType<typeof planCredit>["plan"], leftover: 0 };
  const { balance } = await creditBalance(sb, residentId);
  const [{ data: rows }, { data: left, error }] = await Promise.all([
    sb
      .from("invoices")
      .select("id, total, status")
      .eq("resident_id", residentId)
      .not("status", "in", "(void,paid)")
      .order("invoice_date", { ascending: true })
      .order("issued_at", { ascending: true }),
    sb.rpc("account_credit_leftover", { p_resident: residentId }),
  ]);
  if (error) throw new Error(error.message);
  const open = (rows ?? []) as any[];
  const { data: pays } = open.length
    ? await sb.from("payments").select("invoice_id, amount").in("invoice_id", open.map((r) => r.id))
    : { data: [] };
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
  const { plan } = planCredit(balance, open.map((r) => ({ id: r.id, owing: Number(r.total || 0) - (paid.get(r.id) ?? 0) })));
  return { balance, plan, leftover: Number(left ?? 0) };
}

/**
 * Issue a credit note for the credit no invoice can take - only that leftover;
 * while rent is still to be billed the credit goes there. One database step:
 * the credit and open invoices locked, the leftover read, the note made for it.
 */
export async function issueCreditNote(sb: any, residentId: string, issuedBy: string) {
  if (!UUID.test(residentId)) throw new Error("A credit note needs a resident");
  await ledgerReady(sb, residentId);
  const { data, error } = await sb.rpc("issue_account_credit_note", { p_resident: residentId, p_issued_by: issuedBy });
  if (error) throw new Error(`Could not issue the credit note: ${error.message}`);
  if (!(data as any)?.ok) throw new Error("There is no credit left over - it goes onto the rent still to be billed.");
  return { number: String((data as any).number), amount: Number((data as any).amount) };
}

const toNote = (r: any): CreditNote => ({
  id: String(r.id),
  at: String(r.issued_at ?? ""),
  amount: Number(r.amount),
  reason: String(r.reason ?? ""),
  number: String(r.number ?? ""),
  issuedBy: String(r.issued_by ?? ""),
  residentName: String(r.resident_name ?? ""),
  residentCode: String(r.resident_code ?? ""),
  ...(r.refund ? { refund: r.refund as CreditRefund } : {}),
});

/** A resident's credit notes, newest first. */
export async function creditNotes(sb: any, residentId: string): Promise<CreditNote[]> {
  if (!UUID.test(residentId)) return [];
  await ledgerReady(sb, residentId);
  const { data, error } = await sb
    .from("account_credit_notes")
    .select("*")
    .eq("resident_id", residentId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(toNote);
}

/** The residents with a credit note - the Payables list reads only these. */
export async function creditResidents(sb: any): Promise<string[]> {
  const { data, error } = await sb.from("account_credit_notes").select("resident_id");
  if (error) throw new Error(error.message);
  return [...new Set(((data ?? []) as any[]).map((r) => String(r.resident_id)))];
}

/** The refund of a credit note is paid: recorded on the note, once - the note locked first. */
export async function recordCreditNoteRefund(sb: any, residentId: string, number: string, refund: CreditRefund) {
  const { data, error } = await sb.rpc("record_account_credit_note_refund", {
    p_resident: residentId,
    p_number: number,
    p_refund: refund,
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error === "not_found") throw new Error(`Credit note ${number} not found`);
  if ((data as any)?.error === "already_paid") throw new Error("The refund is already recorded.");
}

export async function putCreditFile(sb: any, p: string, bytes: Uint8Array, type: string) {
  const { error } = await sb.storage.from(BUCKET).upload(p, bytes, { upsert: true, contentType: type });
  if (error) throw new Error(`Could not save the proof: ${error.message}`);
}

/** the deposits reclassified as credit, by deposit - checkout holds that much less */
export async function reclassifiedDeposits(sb: any, residentId: string) {
  return (await creditEntries(sb, residentId)).filter((e) => e.kind === "deposit" && !e.reversedAt);
}

/**
 * Cancel an Update Tenancy event's invoice (its IP or RP adjustment) - one
 * database step (void_invoice_to_credit, 16 Oct 2026): the resident's credit
 * and the invoice locked, the money paid on it read, the invoice voided with
 * the note, and that money given as account credit once. Already void - a
 * cancellation run again - nothing changes. Returns the money moved to credit.
 */
export async function voidInvoiceToCredit(
  sb: any,
  residentId: string,
  o: { invoiceId: string; note: string; what: string; tail: string; eventId: string },
): Promise<number> {
  if (!UUID.test(residentId)) throw new Error("Account credit needs a resident");
  await ledgerReady(sb, residentId);
  const { data, error } = await sb.rpc("void_invoice_to_credit", {
    p_resident: residentId,
    p_invoice: o.invoiceId,
    p_note: o.note,
    p_what: o.what,
    p_tail: o.tail,
    p_event_id: o.eventId,
  });
  if (error) throw new Error(`Could not cancel the invoice: ${error.message}`);
  if ((data as any)?.ok === false)
    throw new Error("Could not cancel the invoice: it is not this resident's invoice.");
  return Number((data as any)?.cash ?? 0);
}

/** a cancelled event's credit, taken back - marked, never removed */
export async function reverseCredit(
  sb: any,
  residentId: string,
  eventIds: string[],
  reason: string,
) {
  if (!eventIds.length || !UUID.test(residentId)) return;
  await ledgerReady(sb, residentId);
  const { error } = await sb.rpc("reverse_account_credit", {
    p_resident: residentId,
    p_event_ids: eventIds,
    p_reason: reason,
  });
  if (error) throw new Error(`Could not take back the account credit: ${error.message}`);
}

/**
 * Use the credit: on `first` when it is given (the event's own IP, even
 * before it is billed), then on the oldest invoice still owing. Rent not
 * billed yet is left alone - it is made again whenever the schedule changes -
 * and takes the credit on the day it is billed. One database step: the
 * resident's credit and open invoices are locked before anything is added up.
 */
export async function applyAccountCredit(
  sb: any,
  residentId: string,
  first?: string,
  only = false,
) {
  if (!UUID.test(residentId)) return [] as { invoiceId: string; amount: number }[];
  await ledgerReady(sb, residentId);
  const { data, error } = await sb.rpc("apply_account_credit", {
    p_resident: residentId,
    p_first: first || null,
    p_only: only,
    p_paid_on: klToday(),
  });
  if (error) throw new Error(`Could not apply the account credit: ${error.message}`);
  const used = ((data ?? []) as any[]).map((u) => ({
    invoiceId: String(u.invoiceId),
    amount: Number(u.amount),
    settled: !!u.settled,
  }));
  // after the money is in: an Update Tenancy event waiting for its IP moves on
  for (const u of used)
    if (u.settled) {
      const { tenancyChangeAfterPayment } = await import("@/lib/tenancy-change.functions");
      await tenancyChangeAfterPayment(sb, u.invoiceId);
    }
  return used.map(({ invoiceId, amount }) => ({ invoiceId, amount }));
}

/** every resident with credit: theirs used on whatever has been billed since */
export async function applyAllAccountCredit(sb: any) {
  const ids = new Set<string>();
  // residents with credit in the database, and any whose old file is not brought over yet
  const { data } = await sb
    .from("account_credit_entries")
    .select("resident_id")
    .is("reversed_at", null);
  for (const r of (data ?? []) as any[]) ids.add(String(r.resident_id));
  try {
    for (const id of (await readLegacy(sb, LEGACY_INDEX)) ?? [])
      if (typeof id === "string") ids.add(id);
  } catch (err) {
    console.warn(`account credit index: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const id of ids) {
    try {
      await applyAccountCredit(sb, id);
    } catch (err) {
      console.warn(`account credit ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
