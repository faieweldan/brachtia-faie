import { createServerFn } from "@tanstack/react-start";

import type {
  AccessCardForm,
  AgreementDoc,
  AgreementDocType,
  TenancyAgreement,
} from "@/lib/tenancy-docs";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tenancy documents.
 *
 * Same shape as residents.functions.ts: snake_case in Postgres, camelCase in
 * TypeScript, translated here and nowhere else. The admin portal is behind the
 * staff passcode, so these use the privileged client like the other admin
 * functions do.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const str = (v: unknown) => (v == null ? "" : String(v));

/** tenancies made on the Homes screen use short local ids, not database ids; only keep real ones */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenancyRef = (v?: string) => (v && UUID.test(v) ? v : null);

async function versions(db: any): Promise<Record<string, string>> {
  const { activeVersionIds } = await import("@/lib/template-versions.server");
  return activeVersionIds(db);
}

function toDoc(row: any): AgreementDoc {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    docType: row.doc_type,
    version: row.version ?? 1,
    status: str(row.status),
    effectiveDate: str(row.effective_date),
    periodStart: str(row.period_start),
    periodEnd: str(row.period_end),
    mergeValues: (row.merge_values ?? {}) as Record<string, string>,
    supersedes: row.supersedes ?? undefined,
    createdAt: row.created_at ?? "",
  };
}

function toAgreement(row: any, docs: AgreementDoc[]): TenancyAgreement {
  return {
    id: row.id,
    residentId: row.resident_id,
    tenancyId: row.tenancy_id ?? undefined,
    agreementNo: str(row.agreement_no),
    kind: str(row.kind),
    createdAt: row.created_at ?? "",
    documents: docs
      .filter((d) => d.agreementId === row.id)
      .sort((a, b) => a.docType.localeCompare(b.docType) || b.version - a.version),
  };
}

function toCard(row: any): AccessCardForm {
  return {
    id: row.id,
    residentId: row.resident_id,
    reason: str(row.reason),
    cardNo: str(row.card_no),
    status: str(row.status),
    formDate: str(row.form_date),
    createdAt: row.created_at ?? "",
  };
}

/** everything the Tenancy tab shows, in one round trip */
export const getTenancyDocs = createServerFn({ method: "GET" })
  .inputValidator((data: { residentId: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: agreements, error } = await db
      .from("tenancy_agreements")
      .select("*")
      .eq("resident_id", data.residentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (agreements ?? []).map((a: any) => a.id);
    let docs: AgreementDoc[] = [];
    if (ids.length) {
      const { data: rows, error: dErr } = await db
        .from("agreement_documents")
        .select("*")
        .in("agreement_id", ids)
        .order("created_at", { ascending: true });
      if (dErr) throw new Error(dErr.message);
      docs = (rows ?? []).map(toDoc);
    }

    const { data: cards, error: cErr } = await db
      .from("access_card_forms")
      .select("*")
      .eq("resident_id", data.residentId)
      .order("created_at", { ascending: false });
    if (cErr) throw new Error(cErr.message);

    return {
      agreements: (agreements ?? []).map((a: any) => toAgreement(a, docs)),
      accessCards: (cards ?? []).map(toCard),
    };
  });

/**
 * Generate the initial document pack: one Agreement No. shared by the four
 * agreement documents, plus the first Access Card Form. The reviewed merge
 * values are snapshotted onto every document.
 */
export const generateDocumentPack = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      residentId: string;
      tenancyId?: string | undefined;
      mergeValues: Record<string, string>;
      periodStart?: string | undefined;
      periodEnd?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await admin();

    const { data: existing } = await db
      .from("tenancy_agreements")
      .select("id")
      .eq("resident_id", data.residentId)
      .limit(1);
    if (existing?.length) throw new Error("This resident already has a document pack");

    const { data: seqRow, error: seqErr } = await db.rpc("next_agreement_no" as never);
    if (seqErr) throw new Error((seqErr as any).message ?? "Could not number the agreement");
    const agreementNo = `TA-${String(seqRow).padStart(4, "0")}`;

    const { data: agreement, error: aErr } = await db
      .from("tenancy_agreements")
      .insert({
        resident_id: data.residentId,
        tenancy_id: tenancyRef(data.tenancyId),
        agreement_no: agreementNo,
        kind: "initial",
      })
      .select()
      .single();
    if (aErr) throw new Error(aErr.message);

    const docTypes: AgreementDocType[] = ["agreement", "sched_a", "sched_b", "sched_c"];
    const today = new Date().toISOString().slice(0, 10);
    const tv = await versions(db);
    const { error: dErr } = await db.from("agreement_documents").insert(
      docTypes.map((t) => ({
        agreement_id: agreement.id,
        doc_type: t,
        version: 1,
        status: "generated",
        effective_date: today,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        merge_values: data.mergeValues,
        template_version_id: tv[t] ?? null,
      })),
    );
    if (dErr) throw new Error(dErr.message);

    const { error: cErr } = await db.from("access_card_forms").insert({
      resident_id: data.residentId,
      reason: "Initial Tenancy",
      status: "generated",
      template_version_id: tv["access_card"] ?? null,
    });
    if (cErr) throw new Error(cErr.message);

    return { ok: true as const, agreementId: agreement.id, agreementNo };
  });

/**
 * Issue a revised schedule under the same Agreement No. The previous version
 * is kept and linked through `supersedes`.
 */
export const reviseSchedule = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      agreementId: string;
      docType: AgreementDocType;
      mergeValues: Record<string, string>;
      periodStart?: string;
      periodEnd?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: current, error } = await db
      .from("agreement_documents")
      .select("*")
      .eq("agreement_id", data.agreementId)
      .eq("doc_type", data.docType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!current) throw new Error("No existing schedule to revise");

    const today = new Date().toISOString().slice(0, 10);
    const tv = await versions(db);
    const { error: iErr } = await db.from("agreement_documents").insert({
      agreement_id: data.agreementId,
      doc_type: data.docType,
      version: (current.version ?? 1) + 1,
      status: "generated",
      effective_date: today,
      period_start: data.periodStart || current.period_start,
      period_end: data.periodEnd || current.period_end,
      merge_values: data.mergeValues,
      supersedes: current.id,
      template_version_id: tv[data.docType] ?? null,
    });
    if (iErr) throw new Error(iErr.message);
    return { ok: true as const };
  });

/** a renewal is a brand-new Agreement No. with a fresh set of four documents */
export const renewAgreement = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      residentId: string;
      tenancyId?: string | undefined;
      mergeValues: Record<string, string>;
      periodStart?: string | undefined;
      periodEnd?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: seqRow, error: seqErr } = await db.rpc("next_agreement_no" as never);
    if (seqErr) throw new Error((seqErr as any).message ?? "Could not number the agreement");
    const agreementNo = `TA-${String(seqRow).padStart(4, "0")}`;

    const { data: agreement, error: aErr } = await db
      .from("tenancy_agreements")
      .insert({
        resident_id: data.residentId,
        tenancy_id: tenancyRef(data.tenancyId),
        agreement_no: agreementNo,
        kind: "renewal",
      })
      .select()
      .single();
    if (aErr) throw new Error(aErr.message);

    const docTypes: AgreementDocType[] = ["agreement", "sched_a", "sched_b", "sched_c"];
    const today = new Date().toISOString().slice(0, 10);
    const tv = await versions(db);
    const { error: dErr } = await db.from("agreement_documents").insert(
      docTypes.map((t) => ({
        agreement_id: agreement.id,
        doc_type: t,
        version: 1,
        status: "generated",
        effective_date: today,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        merge_values: data.mergeValues,
        template_version_id: tv[t] ?? null,
      })),
    );
    if (dErr) throw new Error(dErr.message);
    return { ok: true as const, agreementId: agreement.id, agreementNo };
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { documentId: string; status: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("agreement_documents")
      .update({ status: data.status })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const createAccessCardForm = createServerFn({ method: "POST" })
  .inputValidator((data: { residentId: string; reason: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    const tv = await versions(db);
    const { error } = await db
      .from("access_card_forms")
      .insert({ resident_id: data.residentId, reason: data.reason, status: "generated", template_version_id: tv["access_card"] ?? null });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateAccessCard = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status?: string; cardNo?: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    const patch: Record<string, string> = {};
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.cardNo !== undefined) patch["card_no"] = data.cardNo;
    const { error } = await db.from("access_card_forms").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
