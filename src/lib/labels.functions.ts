import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LABEL_COLOR_KEYS, cleanLabelName, type Label, type LabelColor } from "@/lib/labels";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Resident labels (Dani, 13 Oct 2026) - one list shared by every admin. See
 * src/lib/labels.ts and supabase/migrations/20261013120000_resident_labels.sql.
 */
async function admin(): Promise<any> {
  const { adminDb } = await import("@/lib/admin-session.server");
  return adminDb();
}

/** The tables are not on this database yet: say so, rather than a raw error. */
function check(error: any) {
  if (!error) return;
  if (/labels/.test(String(error.message)) && /does not exist|schema cache/.test(String(error.message)))
    throw new Error("Labels are not set up on this database yet - run 20261013120000_resident_labels.sql.");
  throw new Error(error.message);
}

const colorSchema = z.enum(LABEL_COLOR_KEYS as [LabelColor, ...LabelColor[]]);

/** Every label, and which residents carry each - read once for the whole list. */
export const listLabels = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const [labels, links] = await Promise.all([
    db.from("labels").select("id, name, color").order("name"),
    db.from("resident_labels").select("resident_id, label_id"),
  ]);
  // not set up yet: an empty list, so the pages still open
  if (labels.error || links.error) return { ready: false, labels: [] as Label[], byResident: {} as Record<string, string[]> };
  const byResident: Record<string, string[]> = {};
  for (const l of (links.data ?? []) as any[]) (byResident[l.resident_id] ??= []).push(l.label_id);
  return { ready: true, labels: (labels.data ?? []) as Label[], byResident };
});

/** Make a label, or rename / recolour one. */
export const saveLabel = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), name: z.string().max(60), color: colorSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const name = cleanLabelName(data.name);
    if (!name) throw new Error("Give the label a name.");
    const row = { name, color: data.color };
    const { data: saved, error } = data.id
      ? await db.from("labels").update(row).eq("id", data.id).select("id, name, color").single()
      : await db.from("labels").insert(row).select("id, name, color").single();
    if (error?.code === "23505") throw new Error(`There is already a label called "${name}".`);
    check(error);
    return saved as Label;
  });

/** Delete a label - it comes off every resident who had it. */
export const deleteLabel = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("labels").delete().eq("id", data.id);
    check(error);
    return { ok: true };
  });

/** Put a label on a resident, or take it off. */
export const toggleResidentLabel = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid(), labelId: z.string().uuid(), on: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = data.on
      ? await db.from("resident_labels").upsert({ resident_id: data.residentId, label_id: data.labelId }, { onConflict: "resident_id,label_id", ignoreDuplicates: true })
      : await db.from("resident_labels").delete().eq("resident_id", data.residentId).eq("label_id", data.labelId);
    check(error);
    return { ok: true };
  });
