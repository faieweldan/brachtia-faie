import { createServerFn } from "@tanstack/react-start";

import { referenceFor, type DocumentVersion } from "@/lib/document-versions";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every quote and invoice the student was actually given, kept.
 *
 * The working copy is the one on the booking, and editing it freezes nothing -
 * a quote is updated many times while a room is still being settled, and
 * numbering those would count keystrokes rather than documents. A version is
 * frozen when the PDF is downloaded or sent, because that is the moment it can
 * reach the student. Preview does not count, so admin can look first.
 *
 * Versions are a record, never a source: the booking and the invoice row stay
 * the one live copy. This matters most for invoices, where payments point at
 * the invoice - a new row per version would leave the money on the old one.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const rowToVersion = (row: any, refKey: string, bodyKey: string): DocumentVersion => ({
  id: String(row.id),
  version: Number(row.version || 1),
  reference: String(row[refKey] ?? ""),
  body: row[bodyKey] ?? {},
  total: Number(row.total ?? row.total_upfront ?? 0),
  issuedAs: String(row.issued_as ?? "downloaded"),
  createdAt: String(row.created_at ?? ""),
});

/**
 * Keep this quote as a version, if it differs from the one before it.
 *
 * Called wherever quote_snapshot is written - the website submission, which
 * becomes the original, and every admin change after it. Writing it at the
 * source rather than at the download means no path can quietly skip it, and a
 * quote that was changed and never sent is still on the record.
 *
 * An unchanged snapshot records nothing, so pressing Update quote without
 * having changed anything does not invent a revision.
 *
 * Never throws: failing to keep the history is not a reason to refuse the
 * booking change that produced it.
 */
export async function recordQuoteVersion(
  supabase: any,
  enquiryId: string,
  reference: string,
  snapshot: any,
): Promise<void> {
  try {
    const quote = snapshot?.quote;
    if (!snapshot?.property || !quote) return;
    await freeze(
      "quote_versions",
      "enquiry_id",
      enquiryId,
      "reference",
      "snapshot",
      reference,
      snapshot,
      {
        total_upfront: Number(quote.totalUpfront ?? 0),
        monthly_rent: Number(quote.monthlyAfter ?? 0),
      },
      "saved",
      supabase,
    );
  } catch {
    /* the booking change matters more than the record of it */
  }
}

/** Every quote this booking has given out, oldest first. */
export const listQuoteVersions = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }): Promise<DocumentVersion[]> => {
    const supabase = await admin();
    const { data: rows, error } = await supabase
      .from("quote_versions")
      .select("*")
      .eq("enquiry_id", data.enquiryId)
      .order("version", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => rowToVersion(r, "reference", "snapshot"));
  });

/** Every version of one invoice, oldest first. */
export const listInvoiceVersions = createServerFn({ method: "GET" })
  .inputValidator((data: { invoiceId: string }) => data)
  .handler(async ({ data }): Promise<DocumentVersion[]> => {
    const supabase = await admin();
    const { data: rows, error } = await supabase
      .from("invoice_versions")
      .select("*")
      .eq("invoice_id", data.invoiceId)
      .order("version", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => rowToVersion(r, "number", "document"));
  });

/**
 * The version a fresh download would be.
 *
 * Downloading the same unchanged document twice is one version, not two - the
 * student has one document either way. So an identical body returns the
 * version already frozen rather than making another.
 */
async function freeze(
  table: string,
  idColumn: string,
  id: string,
  refColumn: string,
  bodyColumn: string,
  reference: string,
  body: unknown,
  extra: Record<string, unknown>,
  issuedAs: string,
  client?: any,
): Promise<number> {
  const supabase = client ?? (await admin());
  const { data: rows, error } = await supabase
    .from(table)
    .select(`version, ${bodyColumn}`)
    .eq(idColumn, id)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const latest = ((rows ?? []) as any[])[0];
  const unchanged =
    latest && JSON.stringify(latest[bodyColumn] ?? {}) === JSON.stringify(body ?? {});
  if (unchanged) return Number(latest.version || 1);

  const version = Number(latest?.version || 0) + 1;
  const { error: insertError } = await supabase.from(table).insert({
    [idColumn]: id,
    version,
    [refColumn]: reference,
    [bodyColumn]: body ?? {},
    issued_as: issuedAs,
    ...extra,
  });
  // two downloads at once both claim the same number; the unique index refuses
  // the second, and the version it wanted is the one already frozen
  if (insertError) {
    if (!String(insertError.message).includes("duplicate")) throw new Error(insertError.message);
  }
  return version;
}

/** Freeze the quote as it now stands. Returns the version this download is. */
export const freezeQuoteVersion = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      enquiryId: string;
      reference: string;
      snapshot: unknown;
      totalUpfront: number;
      monthlyRent: number;
      issuedAs?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const version = await freeze(
      "quote_versions",
      "enquiry_id",
      data.enquiryId,
      "reference",
      "snapshot",
      data.reference,
      data.snapshot,
      { total_upfront: data.totalUpfront, monthly_rent: data.monthlyRent },
      data.issuedAs ?? "downloaded",
    );
    return { version, reference: referenceFor(data.reference, version) };
  });

/** Freeze the invoice as it now stands. Returns the version this download is. */
export const freezeInvoiceVersion = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      invoiceId: string;
      number: string;
      document: unknown;
      total: number;
      issuedAs?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const version = await freeze(
      "invoice_versions",
      "invoice_id",
      data.invoiceId,
      "number",
      "document",
      data.number,
      data.document,
      { total: data.total },
      data.issuedAs ?? "downloaded",
    );
    return { version, reference: referenceFor(data.number, version) };
  });
