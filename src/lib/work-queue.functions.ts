import { createServerFn } from "@tanstack/react-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What is waiting on Brachtia, for the Tasks page (Dani, 5 Oct 2026). Worked
 * out from the records each time, not stored as tasks - so a row goes away by
 * itself the moment the work is done, and nobody has to tick it off.
 *   inventory   a resident sent their Schedule C: answer it, or approve it once signed
 *   refund      Checkout Settlement Payment: signed, and a refund to pay out or a CS invoice to collect
 *   stamping    every document of an agreement is signed: upload the stamping page
 *   checkin     a student booked a check-in time and nobody has taken it yet. A taken
 *               (confirmed) one needs nothing until the day, so it is not listed
 */
export type WorkItem = {
  kind: "inventory" | "refund" | "stamping" | "checkin";
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

  // 3. Checkout Settlement Payment (Dani's words, 5 Oct 2026): the student signed, and money is
  //    still to move - Brachtia pays out a refund, or the student pays the CS invoice
  const { readStatement } = await import("@/lib/checkout.server");
  const { data: folders } = await sb.storage.from("resident-documents").list("checkout", { limit: 1000 });
  for (const f of ((folders ?? []) as { name: string; id: string | null }[]).filter((x) => !x.id && /^[0-9a-f-]{36}$/.test(x.name))) {
    const s = await readStatement(sb, f.name);
    if (!s?.settled) continue;
    const rm = (n: number) => `RM${n.toLocaleString("en-MY")}`;
    if (s.settled.refund > 0 && !s.refund) {
      out.push({
        kind: "refund",
        title: `Checkout Settlement Payment - ${s.number}`,
        detail: `Signed by the student · pay out ${rm(s.settled.refund)} and upload the receipt`,
        residentId: f.name,
        since: s.settled.at,
      });
    } else if (s.settled.owed > 0 && s.settled.csInvoiceNumber) {
      const { data: cs } = await sb.from("invoices").select("status").eq("number", s.settled.csInvoiceNumber).maybeSingle();
      if (cs?.status === "paid" || cs?.status === "void") continue;
      out.push({
        kind: "refund",
        title: `Checkout Settlement Payment - ${s.settled.csInvoiceNumber}`,
        detail: `Signed by the student · ${rm(s.settled.owed)} owed by the student · record their payment and upload the receipt`,
        residentId: f.name,
        since: s.settled.at,
      });
    }
  }

  // 4. a check-in the student booked, still with nobody to take it (Dani, 5 Oct 2026)
  {
    const { data: appts } = await sb
      .from("appointments")
      .select("resident_id, starts_at, assigned_staff, status, created_at")
      .eq("type_slug", "check-in")
      .in("status", ["new", "pending"])
      .gte("starts_at", new Date(Date.now() - 86_400_000).toISOString());
    for (const a of (appts ?? []) as any[]) {
      if (a.assigned_staff || !a.resident_id) continue;
      const when = new Date(a.starts_at).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kuala_Lumpur",
      });
      out.push({
        kind: "checkin",
        title: `Take the check-in - ${when}`,
        detail: "Booked by the student · nobody assigned yet",
        residentId: a.resident_id,
        since: String(a.created_at ?? a.starts_at),
      });
    }
  }

  const ids = [...new Set(out.map((o) => o.residentId))];
  const { data: people } = ids.length ? await sb.from("residents").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((people ?? []) as any[]).map((p) => [p.id, String(p.full_name ?? "")]));
  return out.map((o) => ({ ...o, residentName: names.get(o.residentId) ?? "" })).sort((a, b) => a.since.localeCompare(b.since));
});
