import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { klToday } from "@/lib/kl-date";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The checkout statement - see checkout.server.ts for what it is and where it
 * is kept. Admin starts it, edits the deductions, and issues it; the resident
 * signs it on their signing link; admin records the refund with its proof.
 */

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const rid = z.object({ residentId: z.string().uuid() });
const lineSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(200),
  amount: z.number().min(0).max(1_000_000),
  source: z.enum(["outstanding", "forfeit", "deduction"]),
  invoiceNumber: z.string().max(40).optional(),
  photos: z.array(z.string().max(300)).max(6),
});

const typeSchema = z.enum(["cancellation", "early_termination", "end_of_tenancy"]);
type CheckoutType = z.infer<typeof typeSchema>;

/**
 * What the resident's money says now, for the kind of checkout: what is held
 * (deposits - or, for a cancellation, what was paid), every invoice with money
 * still owing, and what the kind of checkout keeps - the same figures as their
 * Payments tab.
 */
async function moneyNow(residentId: string, type?: CheckoutType) {
  const { getResidentBilling } = await import("@/lib/resident-billing.functions");
  const { CANCELLATION_FEE, checkoutTypeFor } = await import("@/lib/checkout.server");
  const b = await getResidentBilling({ data: { residentId } });
  const all = [...b.groups.initial, ...b.groups.rental, ...b.groups.charge, ...b.groups.checkout].filter((i) => !i.scheduled);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const first = b.groups.initial[0]?.doc as { tenancy_start?: string | null; tenancy_end?: string | null } | undefined;
  const suggested = checkoutTypeFor(String(first?.tenancy_start ?? "").slice(0, 10), String(first?.tenancy_end ?? "").slice(0, 10));
  const kind = type ?? suggested;
  // the initial payment, paid in full
  const initialPaid = b.groups.initial.length > 0 && b.groups.initial.every((i) => i.outstanding <= 0.005);
  const depositLines = all.flatMap((inv) => {
    const typed = inv.items.filter((i) => i.kind === "refundable");
    const lines = typed.length ? typed : inv.items.filter((i) => /deposit/i.test(i.kind) || /deposit/i.test(i.label));
    return lines.map((i) => ({ label: i.label, amount: r2(i.amount * i.quantity), invoiceNumber: inv.number }));
  });
  // a cancellation: what was paid on the initial invoice is held, and that invoice is cancelled, not chased
  const deposits =
    kind === "cancellation"
      ? b.groups.initial.filter((i) => i.paid > 0).map((i) => ({ label: `Paid on ${i.number}`, amount: r2(i.paid), invoiceNumber: i.number }))
      : depositLines;
  const outstanding = all
    .filter((i) => i.outstanding > 0 && !(kind === "cancellation" && i.type === "initial"))
    .map((i) => ({
      id: `out-${i.id.slice(0, 8)}`,
      label: `Outstanding on ${i.number}`,
      amount: r2(i.outstanding),
      source: "outstanding" as const,
      invoiceNumber: i.number,
      photos: [] as string[],
    }));
  const forfeit = (id: string, label: string, amount: number) => ({ id: `ff-${id}`, label, amount: r2(amount), source: "forfeit" as const, photos: [] as string[] });
  const forfeits =
    kind === "cancellation"
      ? [
          forfeit("cancel", "Cancellation fee", CANCELLATION_FEE),
          // paid in full but not moved in: one month's rent is kept too (Dani, 2 Oct 2026)
          ...(initialPaid && b.monthlyRent > 0 ? [forfeit("rent", "One month's rental", b.monthlyRent)] : []),
        ]
      : kind === "early_termination"
        ? depositLines
            .filter((d) => /security|utilit/i.test(d.label))
            .map((d, i) => forfeit(`dep${i}`, `${d.label} - forfeited`, d.amount))
        : [];
  return { deposits, outstanding, forfeits, initialPaid, suggested, type: kind };
}

/** Everything the admin card shows. */
export const getCheckout = createServerFn({ method: "GET" })
  .inputValidator((d) => rid.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { readStatement, totals } = await import("@/lib/checkout.server");
    let s = await readStatement(sb, data.residentId);
    const now = await moneyNow(data.residentId, s?.draft.type);
    /*
     * What is owed changes as payments come in (Dani, 2 Oct 2026): the draft's
     * "Outstanding on ..." lines follow the invoices as they are now - a paid
     * one drops out - and the deductions admin added stay. Issued already, it
     * then shows as changed, to be issued again.
     */
    if (s && !s.settled && !s.refund) {
      const fresh = [...now.outstanding, ...now.forfeits, ...s.draft.lines.filter((l) => l.source === "deduction")];
      if (JSON.stringify(fresh) !== JSON.stringify(s.draft.lines)) {
        s = { ...s, draft: { ...s.draft, lines: fresh } };
        const { writeStatement } = await import("@/lib/checkout.server");
        await writeStatement(sb, data.residentId, s);
      }
    }
    const paths = s ? [...s.draft.lines, ...s.versions.flatMap((v) => v.lines)].flatMap((l) => l.photos) : [];
    const { photoUrls } = await import("@/lib/inventory.server");
    const latest = s?.versions.at(-1) ?? null;
    // the balance invoiced at signing: paid yet?
    let csPaid = false;
    if (s?.settled?.csInvoiceNumber) {
      const { data: cs } = await sb.from("invoices").select("status").eq("number", s.settled.csInvoiceNumber).maybeSingle();
      csPaid = cs?.status === "paid";
    }
    return {
      statement: s,
      csPaid,
      deposits: now.deposits,
      outstanding: now.outstanding,
      draftTotals: totals(now.deposits, s?.draft.lines ?? [...now.outstanding, ...now.forfeits]),
      photos: await photoUrls(sb, [...new Set(paths)]),
      initialPaid: now.initialPaid,
      /** the kind the dates say, and the kind in use */
      suggested: now.suggested,
      type: now.type,
      // the draft or the deposits differ from what was issued last: it can be issued again
      changed:
        !!s &&
        !s.settled &&
        (!latest ||
          JSON.stringify(latest.lines) !== JSON.stringify(s.draft.lines) ||
          latest.notes !== s.draft.notes ||
          (latest.type ?? "end_of_tenancy") !== now.type ||
          JSON.stringify(latest.deposits) !== JSON.stringify(now.deposits)),
    };
  });

/** Start the statement: a number of its own, and every unpaid invoice already in it. */
export const startCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => rid.extend({ type: typeSchema }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { nextNumber, readStatement, writeStatement } = await import("@/lib/checkout.server");
    if (await readStatement(sb, data.residentId)) throw new Error("This resident already has a checkout statement.");
    const now = await moneyNow(data.residentId, data.type);
    // moved in: the move-in money first - only a cancellation settles an unpaid initial invoice (Dani, 2 Oct 2026)
    if (data.type !== "cancellation" && !now.initialPaid) throw new Error("The initial payment has to be paid in full first - or choose Cancellation.");
    const number = await nextNumber(sb);
    await writeStatement(sb, data.residentId, {
      number,
      createdAt: new Date().toISOString(),
      draft: { lines: [...now.outstanding, ...now.forfeits], notes: "", type: data.type },
      versions: [],
    });
    return { number };
  });

/**
 * Start over (Dani, 4 Oct 2026): the statement and its versions go, so a
 * different checkout can be tried. Only before the resident signs - once
 * signed, money has moved (deposit applied, CS invoice, credit note). Its CN
 * number is not given out again.
 */
export const discardCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => rid.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { readStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    if (!s) return { ok: true as const };
    if (s.settled || s.refund || s.versions.some((v) => v.signed)) throw new Error("Signed already - it can no longer be discarded.");
    const bucket = sb.storage.from("resident-documents");
    const list = async (folder: string) =>
      (((await bucket.list(folder, { limit: 1000 })).data ?? []) as { name: string; id: string | null }[])
        .filter((f) => f.id)
        .map((f) => `${folder}/${f.name}`);
    const files = [...(await list(`checkout/${data.residentId}`)), ...(await list(`checkout/${data.residentId}/photos`))];
    if (files.length) await bucket.remove(files);
    return { ok: true as const };
  });

export const saveCheckoutDraft = createServerFn({ method: "POST" })
  .inputValidator((d) => rid.extend({ lines: z.array(lineSchema).max(60), notes: z.string().max(2000), type: typeSchema.optional() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { readStatement, writeStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    if (!s) throw new Error("Start the statement first.");
    if (s.refund || s.settled) throw new Error("This statement is signed and settled - it can no longer change.");
    const folder = `checkout/${data.residentId}/photos/`;
    const type = data.type ?? s.draft.type;
    // a new kind of checkout keeps different things: its lines come again from the money
    const typed = type !== s.draft.type ? await moneyNow(data.residentId, type) : null;
    const lines = [
      ...(typed ? [...typed.outstanding, ...typed.forfeits] : data.lines.filter((l) => l.source !== "deduction")),
      ...data.lines
        .filter((l) => l.source === "deduction" && (l.label.trim() || l.amount))
        .map((l) => ({ ...l, label: l.label.trim(), photos: l.photos.filter((p) => p.startsWith(folder)) })),
    ];
    await writeStatement(sb, data.residentId, {
      ...s,
      draft: { lines: lines as import("@/lib/checkout.server").CheckoutLine[], notes: data.notes, ...(type ? { type } : {}) },
    });
    return { ok: true as const };
  });

/** A deduction's photo - optional evidence, shown to the resident in the PDF. */
export const uploadCheckoutPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: FormData) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = String(data.get("residentId") ?? "");
    const file = data.get("file");
    if (!/^[0-9a-f-]{36}$/.test(residentId) || !(file instanceof File)) throw new Error("No photo");
    if (file.size > 4 * 1024 * 1024) throw new Error("That photo is too large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    if (!jpg && !png) throw new Error("Use a JPG or PNG photo");
    const { putFile } = await import("@/lib/checkout.server");
    const path = `checkout/${residentId}/photos/${crypto.randomUUID().slice(0, 12)}.${jpg ? "jpg" : "png"}`;
    await putFile(sb, path, bytes, jpg ? "image/jpeg" : "image/png");
    const { photoUrls } = await import("@/lib/inventory.server");
    return { path, url: (await photoUrls(sb, [path]))[path] ?? "" };
  });

/**
 * Issue the draft as the next version: the deposits as they stand today, the
 * deductions, the PDF with Brachtia's signatory on it. An earlier version is
 * kept as it was; only the latest is for the resident to sign.
 */
export const issueCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => rid.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { buildStatementPdf, putFile, readStatement, sha256, totals, writeStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    if (!s) throw new Error("Start the statement first.");
    if (s.refund || s.settled) throw new Error("This statement is signed and settled - it can no longer change.");
    const { loadSignatory } = await import("@/lib/signatory.server");
    if (!(await loadSignatory(sb))?.token) throw new Error("Save the signatory's signature in Settings → Signatory first.");
    const now = await moneyNow(data.residentId, s.draft.type);
    const v = (s.versions.at(-1)?.v ?? 0) + 1;
    const version = {
      v,
      issuedAt: new Date().toISOString(),
      type: now.type,
      deposits: now.deposits,
      lines: s.draft.lines,
      notes: s.draft.notes,
      ...totals(now.deposits, s.draft.lines),
      pdfPath: `checkout/${data.residentId}/v${v}.pdf`,
      pdfSha256: "",
    };
    const bytes = await buildStatementPdf(sb, data.residentId, s, version);
    await putFile(sb, version.pdfPath, bytes, "application/pdf");
    version.pdfSha256 = await sha256(bytes);
    await writeStatement(sb, data.residentId, { ...s, versions: [...s.versions, version] });
    return { v };
  });

/** A version's PDF: as issued, as signed, or - the latest, once paid - with the refund. */
export const checkoutPdf = createServerFn({ method: "GET" })
  .inputValidator((d) => rid.extend({ v: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { buildStatementPdf, getFile, readStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    const v = s?.versions.find((x) => x.v === data.v);
    if (!s || !v) throw new Error("Not found");
    const last = s.versions.at(-1)?.v === v.v;
    const bytes = last && s.refund ? await buildStatementPdf(sb, data.residentId, s, v, true) : await getFile(sb, v.signed?.pdfPath ?? v.pdfPath);
    if (!bytes) throw new Error("The PDF could not be found");
    return { base64: toBase64(bytes) };
  });

/** Pay the refund and keep its proof - only once the resident has signed the latest version. */
export const recordCheckoutRefund = createServerFn({ method: "POST" })
  .inputValidator((d: FormData) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const residentId = String(data.get("residentId") ?? "");
    const { putFile, readStatement, writeStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, residentId);
    const latest = s?.versions.at(-1);
    if (!s || !latest) throw new Error("Issue the statement first.");
    if (!latest.signed) throw new Error("The resident has to sign the latest version first.");
    if (s.refund) throw new Error("The refund is already recorded.");
    if (s.settled && s.settled.refund <= 0) throw new Error("Nothing is owed to the resident - the balance is invoiced in Collections.");
    const amount = Number(data.get("amount"));
    const paidOn = String(data.get("paidOn") ?? "");
    const method = String(data.get("method") ?? "").trim();
    const reference = String(data.get("reference") ?? "").trim();
    if (!(amount >= 0) || !paidOn || !method) throw new Error("Enter the amount, date and method");
    const file = data.get("file");
    let proofPath = "";
    if (file instanceof File && file.size) {
      if (file.size > 8 * 1024 * 1024) throw new Error("The proof is larger than 8MB");
      const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toLowerCase() ?? "pdf";
      proofPath = `checkout/${residentId}/refund-proof.${ext}`;
      await putFile(sb, proofPath, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
    } else if (amount > 0) throw new Error("Attach the proof of the refund");
    await writeStatement(sb, residentId, { ...s, refund: { amount, paidOn, method, reference, proofPath, recordedAt: new Date().toISOString() } });
    return { ok: true as const };
  });

/**
 * Settled, and the money is in or out: admin makes the resident inactive here
 * (Dani, 2 Oct 2026) - a button, so it is seen to be done. The bed is freed on
 * the resident card; this keeps the date on the statement.
 */
export const markCheckoutInactive = createServerFn({ method: "POST" })
  .inputValidator((d) => rid.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { readStatement, writeStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    if (!s?.settled) throw new Error("The resident has to sign the statement first.");
    if (s.settled.refund > 0 && !s.refund) throw new Error("Record the refund first.");
    if (s.settled.owed > 0) {
      const { data: cs } = await sb.from("invoices").select("status").eq("number", s.settled.csInvoiceNumber ?? "").maybeSingle();
      if (cs?.status !== "paid") throw new Error(`${s.settled.csInvoiceNumber || "The settlement invoice"} has to be paid first.`);
    }
    const at = new Date().toISOString();
    await writeStatement(sb, data.residentId, { ...s, inactiveAt: at });
    return { at };
  });

export const refundProofUrl = createServerFn({ method: "GET" })
  .inputValidator((d) => rid.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { readStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, data.residentId);
    if (!s?.refund?.proofPath) throw new Error("No proof");
    const { photoUrls } = await import("@/lib/inventory.server");
    return { url: (await photoUrls(sb, [s.refund.proofPath]))[s.refund.proofPath] ?? "" };
  });

/* ------------------------------------------------------- the resident's side */

async function residentForToken(sb: any, token: string) {
  const { residentForToken: find } = await import("@/lib/profile-link.functions");
  const found = await find(sb, token);
  if ("error" in found) return null;
  const { data: resident } = await sb.from("residents").select("id, full_name").eq("id", found.link.resident_id).maybeSingle();
  return resident ? { resident, linkId: String(found.link.id) } : null;
}

/** The latest issued version, for the signing page - nothing until one is issued. */
export const getResidentCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(16).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const found = await residentForToken(sb, data.token);
    if (!found) return null;
    const { getFile, readStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, found.resident.id);
    const v = s?.versions.at(-1);
    if (!s || !v) return null;
    const bytes = await getFile(sb, v.signed?.pdfPath ?? v.pdfPath);
    return {
      number: s.number,
      v: v.v,
      net: v.net,
      signed: !!v.signed,
      refunded: !!s.refund,
      pdf: bytes ? { ok: true as const, base64: toBase64(bytes), gaps: [] as string[] } : { ok: false as const, error: "Not found" },
    };
  });

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The resident agrees to the latest version and signs it. */
export const signCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(16).max(128),
        v: z.number().int().min(1),
        typedName: z.string().trim().min(1).max(200),
        agreed: z.literal(true),
        png: z.string().min(100).max(600_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await db();
    const found = await residentForToken(sb, data.token);
    if (!found) return { ok: false as const, error: "This link is not valid." };
    const { buildStatementPdf, putFile, readStatement, sha256, writeStatement } = await import("@/lib/checkout.server");
    const s = await readStatement(sb, found.resident.id);
    const v = s?.versions.at(-1);
    if (!s || !v) return { ok: false as const, error: "There is no statement to sign." };
    // a newer version was issued while they were reading: that is the one to sign
    if (v.v !== data.v) return { ok: false as const, error: "Brachtia has updated this statement. Please read the new version." };
    if (v.signed) return { ok: false as const, error: "This statement is already signed." };
    if (norm(data.typedName) !== norm(String(found.resident.full_name ?? ""))) {
      return { ok: false as const, error: "Type your full name exactly as it appears on your documents." };
    }
    const png = Uint8Array.from(atob(data.png), (c) => c.charCodeAt(0));
    if (png[0] !== 0x89 || png[1] !== 0x50) return { ok: false as const, error: "The signature could not be read. Please sign again." };
    const h = getRequest()?.headers;
    const at = new Date().toISOString();
    const signaturePath = `checkout/${found.resident.id}/v${v.v}-signature.png`;
    await putFile(sb, signaturePath, png, "image/png");
    const signed: NonNullable<import("@/lib/checkout.server").CheckoutVersion["signed"]> = {
      at,
      typedName: data.typedName.trim(),
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? "",
      userAgent: h?.get("user-agent") ?? "",
      profileLinkId: found.linkId,
      signaturePath,
      signatureSha256: await sha256(png),
      pdfPath: `checkout/${found.resident.id}/v${v.v}-signed.pdf`,
      pdfSha256: "",
    };
    const withSig = { ...v, signed };
    const bytes = await buildStatementPdf(sb, found.resident.id, s, withSig);
    await putFile(sb, signed.pdfPath, bytes, "application/pdf");
    signed.pdfSha256 = await sha256(bytes);
    const signedStatement = { ...s, versions: [...s.versions.slice(0, -1), withSig] };
    await writeStatement(sb, found.resident.id, signedStatement);
    try {
      await settle(sb, found.resident.id, signedStatement, withSig);
    } catch (e) {
      // signed either way; admin sees it unsettled and can look into it
      console.error("checkout settle failed", e);
    }
    return { ok: true as const };
  });

/* ------------------------------------------------------------ settling up */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A payment and its receipt on an invoice - the same records a payment admin records makes. */
async function applyPayment(sb: any, inv: any, amount: number, reference: string) {
  const { data: existing } = await sb.from("payments").select("amount").eq("invoice_id", inv.id);
  const paidBefore = ((existing ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0);
  const balance = round2(Number(inv.total || 0) - paidBefore - amount);
  const today = klToday();
  const row: Record<string, unknown> = {
    invoice_id: inv.id,
    enquiry_id: inv.enquiry_id,
    resident_id: inv.resident_id ?? "",
    amount,
    paid_on: today,
    method: "Deposit applied",
    reference,
    proof_path: "",
    description: "Deposit applied at checkout",
    recorded_by: "Checkout",
  };
  let { data: payment, error } = await sb.from("payments").insert(row).select("*").maybeSingle();
  if (error && /recorded_by/.test(error.message)) {
    delete row["recorded_by"];
    ({ data: payment, error } = await sb.from("payments").insert(row).select("*").maybeSingle());
  }
  if (error) throw new Error(error.message);
  const { error: recErr } = await sb.from("receipts").insert({
    payment_id: payment.id,
    invoice_id: inv.id,
    enquiry_id: inv.enquiry_id,
    resident_id: inv.resident_id ?? "",
    amount,
    balance_after: balance,
    paid_to_date: round2(paidBefore + amount),
  });
  if (recErr) throw new Error(recErr.message);
  await sb.from("invoices").update({ status: balance <= 0 ? "paid" : "part_paid", updated_at: new Date().toISOString() }).eq("id", inv.id);
}

/**
 * Once the resident signs: the deposit pays each unpaid invoice first, then the
 * deductions. Left over is a credit note to pay (Payables); short is a
 * Checkout settlement invoice for the rest (Collections). Done once.
 */
async function settle(sb: any, residentId: string, s: import("@/lib/checkout.server").CheckoutStatement, v: import("@/lib/checkout.server").CheckoutVersion) {
  if (s.settled) return;
  let left = v.held;
  const applied: { invoiceNumber: string; amount: number }[] = [];
  for (const l of v.lines.filter((x) => x.source === "outstanding" && x.invoiceNumber)) {
    const { data: inv } = await sb.from("invoices").select("*").eq("number", l.invoiceNumber).eq("resident_id", residentId).maybeSingle();
    if (!inv) continue;
    const { data: pays } = await sb.from("payments").select("amount").eq("invoice_id", inv.id);
    const owing = round2(Number(inv.total || 0) - ((pays ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0));
    const amount = round2(Math.min(left, owing));
    if (amount <= 0) continue;
    await applyPayment(sb, inv, amount, s.number);
    applied.push({ invoiceNumber: String(inv.number), amount });
    left = round2(left - amount);
  }
  // what admin added, and what the kind of checkout keeps
  const deductions = v.lines.filter((x) => x.source !== "outstanding");
  const manual = round2(deductions.reduce((n, x) => n + x.amount, 0));
  const refund = round2(Math.max(0, left - manual));
  const owed = round2(Math.max(0, manual - left));
  let csInvoiceNumber: string | undefined;
  if (owed > 0) {
    // the resident's details as their move-in invoice has them
    const { data: first } = await sb
      .from("invoices")
      .select("full_name, email, phone, university, nationality, residence_name, room_name, occupancy, tenancy_start, tenancy_end, monthly_rent, payment_frequency, company, occupation, tenancy_id")
      .eq("resident_id", residentId)
      .eq("invoice_type", "initial")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const today = klToday();
    const { data: inv, error } = await sb
      .from("invoices")
      .insert({
        ...(first ?? {}),
        resident_id: residentId,
        invoice_type: "checkout",
        invoice_date: today,
        payment_terms: "NET14",
        issued_at: new Date().toISOString(),
        total: owed,
        deposits_total: 0,
        notes: `Checkout settlement - statement ${s.number}`,
      })
      .select("id, number")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const items = [
      ...deductions.map((x) => ({ label: x.label, kind: "charge", amount: x.amount })),
      ...(left > 0 ? [{ label: `Deposit applied (${s.number})`, kind: "charge", amount: -left }] : []),
    ];
    await sb.from("invoice_items").insert(items.map((x, i) => ({ invoice_id: inv.id, ...x, quantity: 1, sort_order: i })));
    const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
    await recordInvoiceVersion(sb, String(inv.id));
    csInvoiceNumber = String(inv.number ?? "");
  }
  // a cancellation: the initial invoice is not chased any more - what was paid on it is on this statement
  if (v.type === "cancellation") {
    const { data: initial } = await sb.from("invoices").select("id, total, status").eq("resident_id", residentId).eq("invoice_type", "initial");
    for (const inv of (initial ?? []) as any[]) {
      if (inv.status === "paid" || inv.status === "void") continue;
      await sb.from("invoices").update({ status: "void", updated_at: new Date().toISOString() }).eq("id", inv.id);
    }
  }
  const { writeStatement } = await import("@/lib/checkout.server");
  await writeStatement(sb, residentId, { ...s, settled: { at: new Date().toISOString(), applied, refund, owed, ...(csInvoiceNumber ? { csInvoiceNumber } : {}) } });
}

/* ----------------------------------------------------------------- Payables */

/**
 * Money out (Dani, 2 Oct 2026): every credit note Brachtia owes a resident at
 * checkout, issued or paid - beside Collections, which is money in.
 */
export const listPayables = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { readStatement } = await import("@/lib/checkout.server");
  const { data: folders } = await sb.storage.from("resident-documents").list("checkout", { limit: 1000 });
  const ids = ((folders ?? []) as { name: string; id: string | null }[]).filter((f) => !f.id && /^[0-9a-f-]{36}$/.test(f.name)).map((f) => f.name);
  const { data: people } = ids.length ? await sb.from("residents").select("id, full_name, resident_code").in("id", ids) : { data: [] };
  const who = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const rows = [];
  for (const id of ids) {
    const s = await readStatement(sb, id);
    const v = s?.versions.at(-1);
    if (!s || !v) continue;
    // only once the resident has signed it (Dani, 2 Oct 2026): before that it is not owed yet
    if (!s.settled) continue;
    const amount = s.settled.refund;
    if (amount <= 0) continue;
    rows.push({
      residentId: id,
      name: String(who.get(id)?.full_name ?? ""),
      code: String(who.get(id)?.resident_code ?? ""),
      number: s.number,
      version: v.v,
      issuedAt: v.issuedAt,
      amount,
      status: s.refund ? "Paid" : "To pay",
      paidOn: s.refund?.paidOn ?? "",
    });
  }
  return rows.sort((a, b) => b.number.localeCompare(a.number));
});
