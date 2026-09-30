/* eslint-disable @typescript-eslint/no-explicit-any */

/** The residence a resident's bed is in, or null while they have no bed. */
export async function residenceIdOf(db: any, residentId: string): Promise<string | null> {
  const { data: bed } = await db.from("beds").select("room_id").eq("resident_id", residentId).limit(1).maybeSingle();
  if (!bed) return null;
  const { data: room } = await db.from("rooms").select("unit_id").eq("id", bed.room_id).maybeSingle();
  if (!room) return null;
  const { data: unit } = await db.from("units").select("residence_id").eq("id", room.unit_id).maybeSingle();
  return unit?.residence_id ?? null;
}

/**
 * The Active template version per document key, recorded on every generated
 * document - the one for the resident's residence when there is one, else the
 * one for every residence. The same choice the pack's preview makes, so what
 * is generated is what was previewed (30 Sep 2026).
 */
export async function activeVersions(
  db: any,
  residenceId?: string | null,
): Promise<Record<string, { id: string; hasFile: boolean }>> {
  const { data } = await db
    .from("template_versions")
    .select("id, file_path, document_templates!inner(doc_key, residence_id, deactivated_at)")
    .eq("status", "active")
    // a deactivated template makes no documents
    .is("document_templates.deactivated_at", null);
  const out: Record<string, { id: string; hasFile: boolean }> = {};
  const rows = (data ?? []) as any[];
  for (const key of new Set(rows.map((r) => r.document_templates.doc_key as string))) {
    const forKey = rows.filter((r) => r.document_templates.doc_key === key);
    const row =
      (residenceId ? forKey.find((r) => r.document_templates.residence_id === residenceId) : undefined) ??
      forKey.find((r) => !r.document_templates.residence_id);
    if (row) out[key] = { id: row.id, hasFile: Boolean(row.file_path) };
  }
  return out;
}

export async function activeVersionIds(db: any, residenceId?: string | null): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(await activeVersions(db, residenceId))) out[k] = v.id;
  return out;
}
