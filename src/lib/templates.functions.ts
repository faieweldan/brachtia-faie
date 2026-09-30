import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { detectPlaceholders, isDocumentOwn, testMappingFor, unmapped, type MappingContext, type Mappings } from "@/lib/template-fields";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type TemplateVersion = {
  id: string;
  version: number;
  status: "draft" | "active" | "archived";
  contentHtml: string;
  fileName: string;
  placeholders: string[];
  mappings: Mappings;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type DocTemplate = {
  id: string;
  name: string;
  category: string;
  docKey: string;
  /** null: for every residence */
  residenceId: string | null;
  versions: TemplateVersion[];
};

const toVersion = (r: any): TemplateVersion => ({
  id: r.id,
  version: r.version,
  status: r.status,
  contentHtml: r.content_html ?? "",
  fileName: r.file_name ?? "",
  placeholders: r.placeholders ?? [],
  mappings: r.mappings ?? {},
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  activatedAt: r.activated_at,
});

export const listTemplates = createServerFn({ method: "GET" }).handler(async (): Promise<DocTemplate[]> => {
  const db = await admin();
  const [{ data: t, error }, { data: v, error: e2 }] = await Promise.all([
    db.from("document_templates").select("*").order("sort_order"),
    db.from("template_versions").select("*").order("version", { ascending: false }),
  ]);
  if (error || e2) throw new Error("Could not load templates");
  return (t ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    docKey: row.doc_key,
    residenceId: row.residence_id ?? null,
    versions: (v ?? []).filter((x: any) => x.template_id === row.id).map(toVersion),
  }));
});

async function storeFile(db: any, templateId: string, file?: { name: string; base64: string }) {
  if (!file) return {};
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const path = `${templateId}/${Date.now().toString(36)}-${safe}`;
  const { error } = await db.storage.from("document-templates").upload(path, bytes, {
    contentType: isPdfPath(file.name)
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (error) throw new Error("File upload failed");
  return { file_path: path, file_name: file.name };
}

/* ---------------- the Word file itself ---------------- */

/**
 * A template can be a Word file - filled in place and laid out by a Word
 * engine - or a PDF, such as a building's scanned form, which is shown exactly
 * as it is (30 Sep 2026). Writing values onto a PDF comes with its boxes.
 */
const isPdfPath = (path: string | null | undefined) => /\.pdf$/i.test(String(path ?? "").trim());

/** The uploaded file a version was made from, or null when it has none. */
async function loadDocx(db: any, filePath: string | null | undefined): Promise<Uint8Array | null> {
  if (!filePath) return null;
  const { data, error } = await db.storage.from("document-templates").download(filePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Every placeholder a version has, read from its Word file - body, headers and
 * footers - as well as from the web copy. The web copy never had the headers,
 * so {{Agreement_id}} in the page header was never offered for mapping.
 */
async function placeholdersOf(db: any, row: { content_html?: string; file_path?: string }) {
  const fromHtml = detectPlaceholders(row.content_html ?? "");
  if (isPdfPath(row.file_path)) return fromHtml;
  const bytes = await loadDocx(db, row.file_path);
  if (!bytes) return fromHtml;
  const { docxPlaceholders } = await import("@/lib/docx-fill");
  return [...new Set([...(await docxPlaceholders(bytes)), ...fromHtml])];
}

const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const mappingSchema = z.record(
  z.string().max(80),
  z.union([
    z.object({ kind: z.literal("field"), key: z.string().max(80) }),
    z.object({ kind: z.literal("formula"), expr: z.string().max(500) }),
    z.object({ kind: z.literal("blank") }),
  ]),
);

/** Save placeholder mappings — drafts only. */
export const saveMappings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ versionId: z.string().uuid(), mappings: mappingSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: v } = await db.from("template_versions").select("status").eq("id", data.versionId).single();
    if (!v || v.status !== "draft") throw new Error("Only a draft's mappings can be changed");
    const { error } = await db.from("template_versions").update({ mappings: data.mappings, updated_at: new Date().toISOString() }).eq("id", data.versionId);
    if (error) throw new Error(`Could not save mappings: ${error.message}`);
    return { ok: true };
  });

const fileSchema = z.object({ name: z.string().max(200), base64: z.string().max(28_000_000) }).optional();

export const createTemplate = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      category: z.string().min(1).max(40),
      contentHtml: z.string().max(2_000_000),
      file: fileSchema,
      residenceId: z.string().uuid().nullable().optional(),
      docKey: z.string().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: t, error } = await db
      .from("document_templates")
      .insert({
        name: data.name,
        category: data.category,
        sort_order: 100,
        doc_key: data.docKey ?? "",
        ...(data.residenceId ? { residence_id: data.residenceId } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not create template");
    const f = await storeFile(db, t.id, data.file);
    const { error: e2 } = await db.from("template_versions").insert({
      template_id: t.id, version: 1, status: "draft", content_html: data.contentHtml,
      placeholders: detectPlaceholders(data.contentHtml), ...f,
    });
    if (e2) throw new Error("Could not create version");
    return { id: t.id as string };
  });

/**
 * Save a draft. Active and archived versions are never changed: saving from
 * one creates the next version as a draft (or updates the existing draft).
 */
export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ templateId: z.string().uuid(), fromVersionId: z.string().uuid().optional(), contentHtml: z.string().max(2_000_000), file: fileSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db.from("template_versions").select("*").eq("template_id", data.templateId);
    const all = (rows ?? []) as any[];
    const from = data.fromVersionId ? all.find((r) => r.id === data.fromVersionId) : undefined;
    if (data.fromVersionId && !from) throw new Error("Version not found");
    const f = await storeFile(db, data.templateId, data.file);
    const patch = { content_html: data.contentHtml, placeholders: detectPlaceholders(data.contentHtml), updated_at: new Date().toISOString(), ...f };
    const draft = from?.status === "draft" ? from : all.find((r) => r.status === "draft");
    if (draft) {
      const { error } = await db.from("template_versions").update(patch).eq("id", draft.id);
      if (error) throw new Error("Could not save draft");
      return { versionId: draft.id as string };
    }
    const next = Math.max(0, ...all.map((r) => r.version)) + 1;
    const { data: ins, error } = await db
      .from("template_versions")
      .insert({ template_id: data.templateId, version: next, status: "draft", file_path: from?.file_path ?? "", file_name: from?.file_name ?? "", mappings: from?.mappings ?? {}, ...patch })
      .select("id")
      .single();
    if (error) throw new Error("Could not create draft");
    return { versionId: ins.id as string };
  });

export const activateVersion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: v, error: readError } = await db.from("template_versions").select("status, content_html, file_path, mappings").eq("id", data.versionId).single();
    // a failed read is not "not a draft" - say what actually went wrong
    if (readError) throw new Error(`Could not read this version: ${readError.message}`);
    if (!v || v.status !== "draft") throw new Error("Only a draft can be activated");
    const bad = unmapped(await placeholdersOf(db, v), v.mappings ?? {});
    if (bad.length) throw new Error(`Unmapped placeholders: ${bad.join(", ")}`);
    const { error } = await db.rpc("activate_template_version", { _version_id: data.versionId });
    if (error) throw new Error("Could not activate");
    return { ok: true };
  });

export const searchResidents = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ q: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db.from("residents").select("id, full_name, resident_code").order("created_at", { ascending: false }).limit(20);
    const s = data.q.trim().replace(/[%,()]/g, "");
    if (s) q = q.or(`full_name.ilike.%${s}%,resident_code.ilike.%${s}%`);
    const { data: rows } = await q;
    return (rows ?? []).map((r: any) => ({ id: r.id as string, name: r.full_name as string, code: (r.resident_code ?? "") as string }));
  });

async function buildContext(db: any, residentId: string) {
  const data = { residentId };
    const { data: resident } = await db.from("residents").select("*").eq("id", data.residentId).maybeSingle();
    if (!resident) throw new Error("Resident not found");
    const [{ data: bed }, { data: tenancy }, { data: enquiry }] = await Promise.all([
      db.from("beds").select("*").eq("resident_id", data.residentId).limit(1).maybeSingle(),
      db.from("tenancies").select("*").eq("resident_id", data.residentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      resident.enquiry_id ? db.from("enquiries").select("*").eq("id", resident.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const { data: room } = bed ? await db.from("rooms").select("*").eq("id", bed.room_id).maybeSingle() : { data: null };
    const { data: unit } = room ? await db.from("units").select("*").eq("id", room.unit_id).maybeSingle() : { data: null };
    const { data: residence } = unit ? await db.from("residences").select("id, name, slug").eq("id", unit.residence_id).maybeSingle() : { data: null };
    const { data: agreement } = await db.from("tenancy_agreements").select("agreement_no, created_at").eq("resident_id", data.residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const ctx: MappingContext = { resident, enquiry, bed, room, unit, residence, tenancy, agreement };
  return { resident, ctx };
}

/** Read-only: gathers a resident's linked records and checks each placeholder. Writes nothing. */
export const testMapping = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid(), placeholders: z.array(z.string().max(80)).max(300), mappings: mappingSchema.optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { resident, ctx } = await buildContext(db, data.residentId);
    return {
      resident: { id: resident.id as string, name: resident.full_name as string, code: (resident.resident_code ?? "") as string },
      results: testMappingFor(data.placeholders, ctx, data.mappings),
    };
  });


const PACK_KEYS = ["tenancy_agreement", "schedule_a", "schedule_b", "schedule_c", "access_card_form"] as const;

/**
 * The Active version a resident's pack uses for one document: the one made
 * for their residence when there is one, otherwise the one for every
 * residence (30 Sep 2026).
 */
export function pickForResidence<T extends { document_templates: { doc_key: string; residence_id?: string | null } }>(
  rows: T[],
  docKey: string,
  residenceId: string | null | undefined,
): T | undefined {
  const forKey = rows.filter((r) => r.document_templates.doc_key === docKey);
  return (
    (residenceId ? forKey.find((r) => r.document_templates.residence_id === residenceId) : undefined) ??
    forKey.find((r) => !r.document_templates.residence_id)
  );
}

/** The Active template per document in the pack, filled with this resident's details. Read-only. */
export const getPackTemplates = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { ctx } = await buildContext(db, data.residentId);
    const { data: rows } = await db
      .from("template_versions")
      .select("id, version, content_html, file_path, mappings, document_templates!inner(doc_key, name, residence_id)")
      .eq("status", "active");
    const out: Record<string, { name: string; version: number; html: string; hasFile: boolean; placeholders: string[]; results: ReturnType<typeof testMappingFor> } | null> = {};
    for (const k of PACK_KEYS) {
      const row = pickForResidence((rows ?? []) as any[], k, ctx.residence?.["id"]);
      if (!row) { out[k] = null; continue; }
      const placeholders = await placeholdersOf(db, row);
      out[k] = { name: row.document_templates.name, version: row.version, html: row.content_html ?? "", hasFile: Boolean(row.file_path), placeholders, results: testMappingFor(placeholders, ctx, row.mappings ?? {}) };
    }
    return out;
  });

/**
 * A version's own Word file, and the placeholders in it, for the template
 * page to show as the document looks. Read-only.
 */
export const getTemplateDocx = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: v } = await db.from("template_versions").select("content_html, file_path").eq("id", data.versionId).maybeSingle();
    const bytes = v ? await loadDocx(db, v.file_path) : null;
    if (!bytes) return null;
    return {
      kind: isPdfPath(v.file_path) ? ("pdf" as const) : ("docx" as const),
      base64: toBase64(bytes),
      placeholders: await placeholdersOf(db, v),
    };
  });

/**
 * One pack document, filled in inside its Word file for this resident - the
 * corrections typed on the pack page included. Only the placeholders change;
 * every table, border, header, footer and signature line stays as written.
 * A placeholder with nothing to put in it is left showing, so the gap is seen.
 */
async function filledPackBytes(
  db: any,
  residentId: string,
  docKey: (typeof PACK_KEYS)[number],
  overrides?: Record<string, string>,
): Promise<{ kind: "pdf" | "docx"; bytes: Uint8Array } | null> {
  const { ctx } = await buildContext(db, residentId);
  const { data: rows } = await db
    .from("template_versions")
    .select("content_html, file_path, mappings, document_templates!inner(doc_key, residence_id)")
    .eq("status", "active")
    .eq("document_templates.doc_key", docKey);
  const row = pickForResidence((rows ?? []) as any[], docKey, ctx.residence?.["id"]);
  const bytes = row ? await loadDocx(db, row.file_path) : null;
  if (!row || !bytes) return null;
  if (isPdfPath(row.file_path)) return { kind: "pdf" as const, bytes };
  return { kind: "docx" as const, bytes: await fillFor(bytes, await placeholdersOf(db, row), ctx, row.mappings ?? {}, overrides) };
}

/** Fill a Word file from a resident's records, typed corrections winning. */
async function fillFor(
  bytes: Uint8Array,
  placeholders: string[],
  ctx: MappingContext,
  mappings: Mappings,
  overrides?: Record<string, string>,
) {
  const values: Record<string, string | null> = {};
  for (const r of testMappingFor(placeholders, ctx, mappings)) {
    // only the document's own values can be set on the pack page
    const typed = isDocumentOwn(r.key) ? overrides?.[r.key] : undefined;
    if (typed !== undefined && typed.trim() !== "") values[r.key] = typed;
    else if (r.result === "mapped") values[r.key] = r.value;
    else values[r.key] = null;
  }
  const { fillDocx } = await import("@/lib/docx-fill");
  return fillDocx(bytes, values);
}

const packInput = z.object({
  residentId: z.string().uuid(),
  docKey: z.enum(PACK_KEYS),
  overrides: z.record(z.string().max(80), z.string().max(2000)).optional(),
});

/** The filled Word file, for the quick on-page view. Read-only. */
export const fillPackDocx = createServerFn({ method: "POST" })
  .inputValidator((d) => packInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const doc = await filledPackBytes(db, data.residentId, data.docKey, data.overrides);
    // a PDF form has no Word file to show; its exact pages come from the preview
    return doc?.kind === "docx" ? { base64: toBase64(doc.bytes) } : null;
  });

/**
 * The same filled file as the PDF it prints as - the exact preview behind the
 * eye icon. Read-only: made on request, never saved.
 */
export const previewPackPdf = createServerFn({ method: "POST" })
  .inputValidator((d) => packInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const doc = await filledPackBytes(db, data.residentId, data.docKey, data.overrides);
    if (!doc) return { ok: false as const, error: "This document has no file to preview." };
    if (doc.kind === "pdf") return { ok: true as const, base64: toBase64(doc.bytes) };
    return pdfResult(doc.bytes);
  });

/**
 * A template version as the PDF it prints as: filled with the test resident
 * and the mappings on screen when a resident is picked, otherwise as uploaded
 * with its placeholders showing. Read-only.
 */
export const previewTemplatePdf = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ versionId: z.string().uuid(), residentId: z.string().uuid().optional(), mappings: mappingSchema.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: v } = await db.from("template_versions").select("content_html, file_path, mappings").eq("id", data.versionId).maybeSingle();
    let bytes = v ? await loadDocx(db, v.file_path) : null;
    if (!v || !bytes) return { ok: false as const, error: "This version has no file to preview." };
    if (isPdfPath(v.file_path)) return { ok: true as const, base64: toBase64(bytes) };
    if (data.residentId) {
      const { ctx } = await buildContext(db, data.residentId);
      bytes = await fillFor(bytes, await placeholdersOf(db, v), ctx, data.mappings ?? v.mappings ?? {});
    }
    return pdfResult(bytes);
  });

async function pdfResult(docx: Uint8Array) {
  const { docxToPdf, PdfPreviewUnavailable } = await import("@/lib/docx-to-pdf.server");
  try {
    return { ok: true as const, base64: toBase64(await docxToPdf(docx)) };
  } catch (e) {
    // not set up here is an answer, not a crash - the page says so
    if (e instanceof PdfPreviewUnavailable || e instanceof Error) return { ok: false as const, error: e.message };
    throw e;
  }
}

/* ---------------- deleting ---------------- */

/** How many residents' documents were made from this version. */
async function timesUsed(db: any, versionId: string) {
  const [a, b] = await Promise.all([
    db.from("agreement_documents").select("id", { count: "exact", head: true }).eq("template_version_id", versionId),
    db.from("access_card_forms").select("id", { count: "exact", head: true }).eq("template_version_id", versionId),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}

/**
 * Delete one version (Dani and Lav, 30 Sep 2026). A draft or an unused
 * archived version can go. The Active version cannot - it is what documents
 * are made from; activate another first. And a version any resident's
 * document was made from is never deleted: it is the record of what they
 * were given to sign.
 */
export const deleteTemplateVersion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: v } = await db.from("template_versions").select("id, status, file_path").eq("id", data.versionId).maybeSingle();
    if (!v) throw new Error("Version not found");
    if (v.status === "active") throw new Error("The Active version cannot be deleted. Activate another version first.");
    const used = await timesUsed(db, v.id);
    if (used) throw new Error(`Kept: ${used} resident document${used === 1 ? " was" : "s were"} made from this version.`);
    const { error } = await db.from("template_versions").delete().eq("id", v.id);
    if (error) throw new Error(`Could not delete: ${error.message}`);
    // the Word file goes too, unless another version still points at it
    if (v.file_path) {
      const { count } = await db.from("template_versions").select("id", { count: "exact", head: true }).eq("file_path", v.file_path);
      if (!count) await db.storage.from("document-templates").remove([v.file_path]);
    }
    return { ok: true };
  });

/**
 * Delete a whole template. The six all-residences templates the document
 * pack looks up (doc_key) always stay, or the pack would lose a tab; a
 * residence's own copy of one can go, and the all-residences one takes over. And not while any of its versions made a resident's document.
 */
export const deleteTemplate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ templateId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: t } = await db.from("document_templates").select("id, doc_key, residence_id").eq("id", data.templateId).maybeSingle();
    if (!t) throw new Error("Template not found");
    // a residence's own copy can go - the all-residences one then takes over
    if (t.doc_key && !t.residence_id) throw new Error("This template is part of the document pack and cannot be deleted. Its versions can be.");
    const { data: versions } = await db.from("template_versions").select("id, file_path").eq("template_id", t.id);
    for (const v of (versions ?? []) as any[]) {
      if (await timesUsed(db, v.id)) throw new Error("Kept: resident documents were made from this template.");
    }
    const { error } = await db.from("document_templates").delete().eq("id", t.id);
    if (error) throw new Error(`Could not delete: ${error.message}`);
    const files = ((versions ?? []) as any[]).map((v) => v.file_path).filter(Boolean);
    if (files.length) await db.storage.from("document-templates").remove(files);
    return { ok: true };
  });

/* ---------------- a template's details ---------------- */

/** The residences a template can be made for. */
export const listTemplateResidences = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("residences").select("id, name").order("sort_order");
  return ((data ?? []) as any[]).map((r) => ({ id: r.id as string, name: r.name as string }));
});

/**
 * Change a template's category and residence after it is made (30 Sep 2026).
 * Before this, both were fixed at Add Template and could only be put right by
 * starting again.
 */
export const updateTemplateDetails = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      templateId: z.string().uuid(),
      category: z.string().trim().min(1).max(40).optional(),
      residenceId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const patch: Record<string, unknown> = {};
    if (data.category !== undefined) patch["category"] = data.category;
    if (data.residenceId !== undefined) patch["residence_id"] = data.residenceId;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await db.from("document_templates").update(patch).eq("id", data.templateId);
    if (error) throw new Error(`Could not save: ${error.message}`);
    return { ok: true };
  });
