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

const TEMPLATE_KEY: Record<string, string> = {
  agreement: "tenancy_agreement",
  sched_a: "schedule_a",
  sched_b: "schedule_b",
  sched_c: "schedule_c",
  access_card: "access_card_form",
};

async function versions(db: any, residentId: string): Promise<Record<string, string>> {
  const { activeVersions, residenceIdOf } = await import("@/lib/template-versions.server");
  const byKey = await activeVersions(db, await residenceIdOf(db, residentId));
  // Settings names the templates differently from the document types
  const out: Record<string, string> = {};
  for (const [type, key] of Object.entries(TEMPLATE_KEY)) out[type] = byKey[key]?.id ?? "";
  return out;
}

/**
 * Every document about to be made has an Active template with a file. A
 * document made from nothing - Schedule C before its file was uploaded - is a
 * blank page in the resident's record (Dani, 30 Sep 2026).
 */
async function requireFiles(db: any, residentId: string, types: string[]) {
  const { activeVersions, residenceIdOf } = await import("@/lib/template-versions.server");
  const byKey = await activeVersions(db, await residenceIdOf(db, residentId));
  // Schedule C is a checklist the resident answers on their signing page - no file (1 Oct 2026)
  const missing = types.filter((t) => t !== "sched_c" && !byKey[TEMPLATE_KEY[t] ?? t]?.hasFile).map((t) => DOC_LABEL[t] ?? t);
  if (missing.length) throw new Error(`No file uploaded yet for: ${missing.join(", ")}. Upload and activate it in Settings → Templates first.`);
}

const DOC_LABEL: Record<string, string> = {
  agreement: "Tenancy Agreement",
  sched_a: "Schedule A",
  sched_b: "Schedule B",
  sched_c: "Schedule C",
  access_card: "Access Card Form",
};

/**
 * The pack documents still in use. A document whose templates are all
 * deactivated in Settings is no longer made - not on generating, not on
 * renewing (30 Sep 2026).
 */
async function retiredDocKeys(db: any): Promise<Set<string>> {
  const { data } = await db.from("document_templates").select("doc_key, deactivated_at");
  const rows = (data ?? []) as { doc_key: string; deactivated_at: string | null }[];
  const keys = new Set(rows.map((r) => r.doc_key).filter(Boolean));
  return new Set([...keys].filter((k) => rows.filter((r) => r.doc_key === k).every((r) => r.deactivated_at)));
}
const DOC_KEY_OF: Record<AgreementDocType, string> = {
  agreement: "tenancy_agreement",
  sched_a: "schedule_a",
  sched_b: "schedule_b",
  sched_c: "schedule_c",
};
async function docTypesInUse(db: any): Promise<AgreementDocType[]> {
  const retired = await retiredDocKeys(db);
  return (["agreement", "sched_a", "sched_b", "sched_c"] as AgreementDocType[]).filter((t) => !retired.has(DOC_KEY_OF[t]));
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
    {
      const types: string[] = [...(await docTypesInUse(db))];
      if (!(await retiredDocKeys(db)).has("access_card_form")) types.push("access_card");
      await requireFiles(db, data.residentId, types);
    }

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

    const docTypes = await docTypesInUse(db);
    const today = new Date().toISOString().slice(0, 10);
    const tv = await versions(db, data.residentId);
    const { error: dErr } = !docTypes.length ? { error: null } : await db.from("agreement_documents").insert(
      docTypes.map((t) => ({
        agreement_id: agreement.id,
        doc_type: t,
        version: 1,
        status: "generated",
        effective_date: today,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        merge_values: data.mergeValues,
        template_version_id: tv[t] || null,
      })),
    );
    if (dErr) throw new Error(dErr.message);

    if (!(await retiredDocKeys(db)).has("access_card_form")) {
      const { error: cErr } = await db.from("access_card_forms").insert({
        resident_id: data.residentId,
        reason: "Initial Tenancy",
        status: "generated",
        template_version_id: tv["access_card"] || null,
      });
      if (cErr) throw new Error(cErr.message);
    }

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
    const { data: ag } = await db.from("tenancy_agreements").select("resident_id").eq("id", data.agreementId).maybeSingle();
    const tv = await versions(db, ag?.resident_id ?? "");
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
      template_version_id: tv[data.docType] || null,
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
    await requireFiles(db, data.residentId, [...(await docTypesInUse(db))]);
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

    const docTypes = await docTypesInUse(db);
    const today = new Date().toISOString().slice(0, 10);
    const tv = await versions(db, data.residentId);
    const { error: dErr } = !docTypes.length ? { error: null } : await db.from("agreement_documents").insert(
      docTypes.map((t) => ({
        agreement_id: agreement.id,
        doc_type: t,
        version: 1,
        status: "generated",
        effective_date: today,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        merge_values: data.mergeValues,
        template_version_id: tv[t] || null,
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
    const tv = await versions(db, data.residentId);
    const { error } = await db
      .from("access_card_forms")
      .insert({ resident_id: data.residentId, reason: data.reason, status: "generated", template_version_id: tv["access_card"] || null });
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

/**
 * Open a generated document: the exact template version it was generated with,
 * plus the values snapshotted at generation. Later template changes never alter it.
 */
export const getDocumentView = createServerFn({ method: "GET" })
  .inputValidator((data: { kind: "agreement" | "card"; id: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    let versionId: string | null = null;
    let values: Record<string, string> = {};
    if (data.kind === "agreement") {
      const { data: doc, error } = await db.from("agreement_documents").select("template_version_id, merge_values").eq("id", data.id).single();
      if (error) throw new Error(error.message);
      versionId = doc.template_version_id;
      values = doc.merge_values ?? {};
    } else {
      const { data: card, error } = await db.from("access_card_forms").select("resident_id, template_version_id").eq("id", data.id).single();
      if (error) throw new Error(error.message);
      versionId = card.template_version_id;
      // access card forms share the pack's reviewed values
      const { data: ag } = await db.from("tenancy_agreements").select("id").eq("resident_id", card.resident_id).order("created_at", { ascending: false }).limit(1);
      if (ag?.length) {
        const { data: d } = await db.from("agreement_documents").select("merge_values").eq("agreement_id", ag[0].id).limit(1);
        values = d?.[0]?.merge_values ?? {};
      }
    }
    if (!versionId) return { html: null as string | null, version: null as number | null, values };
    const { data: tv, error: tErr } = await db.from("template_versions").select("content_html, version").eq("id", versionId).single();
    if (tErr) throw new Error(tErr.message);
    return { html: tv.content_html as string, version: tv.version as number, values };
  });

/**
 * Take back a pack that nothing has happened to yet (Dani, 30 Sep 2026): every
 * document still "generated" - none sent, signed or submitted. It is removed
 * as if never made, so it can be generated again from the current templates.
 * A sent link, or an inventory check sent in but not yet confirmed, does not
 * stop it (Dani, 1 Oct 2026); anything signed does - that is the record.
 */
/** What a document can be while its pack may still be reset: not signed. */
export const RESETTABLE = new Set(["generated", "pending_signature", "submitted"]);

export const undoDocumentPack = createServerFn({ method: "POST" })
  .inputValidator((data: { agreementId: string }) => data)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: agreement } = await db.from("tenancy_agreements").select("id, resident_id, kind").eq("id", data.agreementId).maybeSingle();
    if (!agreement) throw new Error("This pack no longer exists.");
    const { data: docs } = await db.from("agreement_documents").select("id, doc_type, status").eq("agreement_id", agreement.id);
    if ((docs ?? []).some((d: any) => !RESETTABLE.has(d.status))) {
      throw new Error("A document in this pack is already signed, so it is a record and can no longer be reset.");
    }
    // the first pack brought the first access card form with it; it goes too
    let cardIds: string[] = [];
    if (agreement.kind === "initial") {
      const { data: cards } = await db.from("access_card_forms").select("id, status").eq("resident_id", agreement.resident_id);
      if ((cards ?? []).some((c: any) => c.status !== "generated")) {
        throw new Error("The access card form has moved on (signed or submitted), so this pack can no longer be reset.");
      }
      cardIds = (cards ?? []).map((c: any) => c.id);
    }
    // an inventory check sent in goes with its Schedule C
    for (const d of (docs ?? []) as any[]) {
      if (d.doc_type !== "sched_c") continue;
      const files = ["in", "out"].flatMap((m) => ["json", "pdf"].map((x) => `inventory/${agreement.resident_id}/${d.id}-${m}.${x}`).concat(`inventory/${agreement.resident_id}/${d.id}-${m}-signature.png`));
      await db.storage.from("resident-documents").remove(files);
    }
    const { error: dErr } = await db.from("agreement_documents").delete().eq("agreement_id", agreement.id);
    if (dErr) throw new Error(dErr.message);
    if (cardIds.length) {
      const { error: cErr } = await db.from("access_card_forms").delete().in("id", cardIds);
      if (cErr) throw new Error(cErr.message);
    }
    const { error: aErr } = await db.from("tenancy_agreements").delete().eq("id", agreement.id);
    if (aErr) throw new Error(aErr.message);
    return { ok: true as const };
  });
