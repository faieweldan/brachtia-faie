import { createServerFn } from "@tanstack/react-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What is waiting on Brachtia, for the Tasks page (Dani, 5 Oct 2026). Worked
 * out from the records each time, not stored as tasks - so a row goes away by
 * itself the moment the work is done, and nobody has to tick it off.
 *   inventory   a resident sent their Schedule C: answer it, or approve it once signed
 *   refund      a checkout statement is signed and money is owed back: pay it and upload the proof
 *   stamping    every document of an agreement is signed: upload the stamping page
 */
export type WorkItem = {
  kind: "inventory" | "refund" | "stamping";
  title: string;
  detail: string;
  residentId: string;
  residentName: string;
  /** when it started waiting - the oldest first */
  since: string;
};

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const DONE = new Set(["signed", "pending_stamping", "stamped"]);

export const adminWorkQueue = createServerFn({ method: "GET" }).handler(async (): Promise<WorkItem[]> => {
  const sb = await admin();
  const out: Omit<WorkItem, "residentName">[] = [];

  // agreements and their documents, once - Schedule C and stamping both read them
  const { data: ags } = await sb.from("tenancy_agreements").select("id, resident_id, agreement_no");
  const agById = new Map(((ags ?? []) as any[]).map((a) => [a.id, a]));
  const { data: docs } = await sb.from("agreement_documents").select("id, agreement_id, doc_type, version, status, created_at");
  const latest = new Map<string, any>();
  for (const d of (docs ?? []) as any[]) {
    const k = `${d.agreement_id}:${d.doc_type}`;
    if (!latest.has(k) || (latest.get(k).version ?? 1) < (d.version ?? 1)) latest.set(k, d);
  }

  // 1. Schedule C sent in: Brachtia's turn
  const { readInventory } = await import("@/lib/inventory.server");
  for (const d of latest.values()) {
    if (d.doc_type !== "sched_c" || DONE.has(d.status)) continue;
    const ag = agById.get(d.agreement_id);
    if (!ag) continue;
    for (const mode of ["in", "out"] as const) {
      const f = await readInventory(sb, ag.resident_id, d.id, mode);
      if (f?.status !== "review" && f?.status !== "submitted") continue;
      const what = mode === "in" ? "move-in" : "move-out";
      out.push({
        kind: "inventory",
        title: f.status === "review" ? `Review the ${what} check (Schedule C)` : `Approve the signed ${what} check (Schedule C)`,
        detail: f.status === "review" ? "Answer each defect and missing item within 48 hours" : "Signed by the resident",
        residentId: ag.resident_id,
        since: String((f as any).reviewAt ?? (f as any).submitted?.at ?? d.created_at),
      });
    }
  }

  // 2. stamping: every document of the agreement signed, no stamping page yet
  const byAgreement = new Map<string, any[]>();
  for (const d of latest.values()) byAgreement.set(d.agreement_id, [...(byAgreement.get(d.agreement_id) ?? []), d]);
  for (const [agId, list] of byAgreement) {
    const ag = agById.get(agId);
    if (!ag || !list.length) continue;
    if (!list.every((d) => DONE.has(d.status)) || list.some((d) => d.status === "stamped")) continue;
    out.push({
      kind: "stamping",
      title: `Upload the stamping page - ${ag.agreement_no}`,
      detail: "Every document is signed",
      residentId: ag.resident_id,
      since: String(list.map((d) => d.created_at).sort().at(-1) ?? ""),
    });
  }

  // 3. checkout refunds signed for and not paid yet
  const { readStatement } = await import("@/lib/checkout.server");
  const { data: folders } = await sb.storage.from("resident-documents").list("checkout", { limit: 1000 });
  for (const f of ((folders ?? []) as { name: string; id: string | null }[]).filter((x) => !x.id && /^[0-9a-f-]{36}$/.test(x.name))) {
    const s = await readStatement(sb, f.name);
    if (!s?.settled || s.settled.refund <= 0 || s.refund) continue;
    out.push({
      kind: "refund",
      title: `Pay the checkout refund - ${s.number}`,
      detail: `RM${s.settled.refund.toLocaleString("en-MY")} owed to the resident · upload the proof once paid`,
      residentId: f.name,
      since: s.settled.at,
    });
  }

  const ids = [...new Set(out.map((o) => o.residentId))];
  const { data: people } = ids.length ? await sb.from("residents").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((people ?? []) as any[]).map((p) => [p.id, String(p.full_name ?? "")]));
  return out.map((o) => ({ ...o, residentName: names.get(o.residentId) ?? "" })).sort((a, b) => a.since.localeCompare(b.since));
});
