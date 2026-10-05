import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { checkoutPdf, listPayables } from "@/lib/checkout.functions";
import { money } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/payables")({
  component: PayablesPage,
});

/**
 * Money out (Dani, 2 Oct 2026): what Brachtia owes residents - the credit note
 * of each checkout statement with a refund in it. Collections is the money in.
 * Each statement keeps its versions; the one listed is the latest.
 */
const TONE: Record<string, string> = {
  "With resident": "border-sky-200 bg-sky-100 text-sky-900",
  "To pay": "border-amber-200 bg-amber-100 text-amber-900",
  Paid: "border-emerald-200 bg-emerald-100 text-emerald-900",
};

function PayablesPage() {
  const q = useQuery({ queryKey: ["payables"], queryFn: () => listPayables() });
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const rows = q.data ?? [];
  const toPay = rows.filter((r) => r.status !== "Paid").reduce((n, r) => n + r.amount, 0);
  const paid = rows.filter((r) => r.status === "Paid").reduce((n, r) => n + r.amount, 0);

  async function view(residentId: string, v: number, title: string) {
    try {
      const { base64 } = await checkoutPdf({ data: { residentId, v } });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      setPdf({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), title });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the PDF");
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Owed to residents</p>
          <p className="text-2xl font-bold tabular-nums text-amber-800">{money(toPay)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Refunded</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-800">{money(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Credit notes</p>
          <p className="text-2xl font-bold tabular-nums text-brand-deep">{rows.length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {q.isLoading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No credit notes yet. They come from a resident's checkout statement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Credit note no.</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Resident</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.number} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-semibold">
                      {r.number}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">v{r.version}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {new Date(r.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-3">
                      <Link to="/admin/residents/$id" params={{ id: r.residentId }} className="font-medium hover:underline">
                        {r.name || "—"}
                      </Link>
                      {r.code ? <p className="text-xs text-muted-foreground">{r.code}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">CN</span>
                      Checkout credit note
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? ""}`}>{r.status}</span>
                      {r.paidOn ? <p className="mt-0.5 text-xs text-muted-foreground">Paid {r.paidOn}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => void view(r.residentId, r.version, `${r.number} · v${r.version}`)}>
                        <FileText className="size-4" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${(pdf?.title ?? "credit-note").replace(/[/ ·]+/g, "-")}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </div>
  );
}
