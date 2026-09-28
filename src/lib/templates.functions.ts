import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { detectPlaceholders, testMappingFor, unmapped, type MappingContext, type Mappings } from "@/lib/template-fields";

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
    versions: (v ?? []).filter((x: any) => x.template_id === row.id).map(toVersion),
  }));
});

async function storeFile(db: any, templateId: string, file?: { name: string; base64: string }) {
  if (!file) return {};
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const path = `${templateId}/${Date.now().toString(36)}-${safe}`;
  const { error } = await db.storage.from("document-templates").upload(path, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (error) throw new Error("File upload failed");
  return { file_path: path, file_name: file.name };
}

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
    if (error) throw new Error("Could not save mappings");
    return { ok: true };
  });

const fileSchema = z.object({ name: z.string().max(200), base64: z.string().max(28_000_000) }).optional();

export const createTemplate = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ name: z.string().trim().min(1).max(120), category: z.string().min(1).max(40), contentHtml: z.string().max(2_000_000), file: fileSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: t, error } = await db
      .from("document_templates")
      .insert({ name: data.name, category: data.category, sort_order: 100 })
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
    const { data: v } = await db.from("template_versions").select("status, content_html, mappings").eq("id", data.versionId).single();
    if (!v || v.status !== "draft") throw new Error("Only a draft can be activated");
    const bad = unmapped(detectPlaceholders(v.content_html), v.mappings ?? {});
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

/** The Active template per document in the pack, filled with this resident's details. Read-only. */
export const getPackTemplates = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { ctx } = await buildContext(db, data.residentId);
    const { data: rows } = await db
      .from("template_versions")
      .select("id, version, content_html, mappings, document_templates!inner(doc_key, name)")
      .eq("status", "active");
    const out: Record<string, { name: string; version: number; html: string; placeholders: string[]; results: ReturnType<typeof testMappingFor> } | null> = {};
    for (const k of PACK_KEYS) {
      const row = (rows ?? []).find((r: any) => r.document_templates.doc_key === k);
      if (!row) { out[k] = null; continue; }
      const placeholders = detectPlaceholders(row.content_html ?? "");
      out[k] = { name: row.document_templates.name, version: row.version, html: row.content_html ?? "", placeholders, results: testMappingFor(placeholders, ctx, row.mappings ?? {}) };
    }
    return out;
  });
