/* eslint-disable @typescript-eslint/no-explicit-any */
/** the Active template version id per document key, recorded on every generated document */
export async function activeVersionIds(db: any): Promise<Record<string, string>> {
  const { data } = await db
    .from("template_versions")
    .select("id, document_templates!inner(doc_key, deactivated_at)")
    .eq("status", "active")
    // a deactivated template makes no documents
    .is("document_templates.deactivated_at", null);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) out[r.document_templates.doc_key] = r.id;
  return out;
}
