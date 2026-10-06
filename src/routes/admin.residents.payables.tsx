import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { RefundForm } from "@/components/admin/CheckoutStatement";
import { StaffTag } from "@/components/admin/RecordPaymentDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { checkoutPdf, listPayables, refundProofUrl } from "@/lib/checkout.functions";
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
  // the payout recorded here too, not only on the resident's Payments tab (Dani, 6 Oct 2026)
  const [paying, setPaying] = useState<{ residentId: string; number: string; name: string; amount: number } | null>(null);
  // View opens the credit note under its row, as Collections opens an invoice (Dani, 6 Oct 2026)
  const [open, setOpen] = useState<string | null>(null);
  const qc = useQueryClient();
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

  const proof = (residentId: string) =>
    void refundProofUrl({ data: { residentId } })
      .then(({ url }) => url && window.open(url, "_blank", "noopener"))
      .catch(() => toast.error("Could not open the proof"));

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
                  <Fragment key={r.number}>
                  <tr className="border-b border-border/60 last:border-0">
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
                      <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">CS</span>
                      Checkout credit note
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? ""}`}>{r.status}</span>
                      {r.paidOn ? <p className="mt-0.5 text-xs text-muted-foreground">Paid {r.paidOn}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 min-w-[3.75rem]" aria-expanded={open === r.number} onClick={() => setOpen(open === r.number ? null : r.number)}>
                          {open === r.number ? "Hide" : "View"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="outline" className="size-8" aria-label={`More actions for ${r.number}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={() => void view(r.residentId, r.version, `${r.number} · v${r.version}`)}>
                              <Download className="size-4" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={r.status !== "To pay"} onSelect={() => setPaying({ residentId: r.residentId, number: r.number, name: r.name, amount: r.amount })}>
                              <Plus className="size-4" /> Record payment
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!r.refund?.hasProof} onSelect={() => proof(r.residentId)}>
                              <Eye className="size-4" /> Proof of payment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {open === r.number ? (
                    <tr>
                      <td colSpan={7} className="bg-muted/20 px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-brand-deep hover:underline" onClick={() => void view(r.residentId, r.version, `${r.number} · v${r.version}`)}>
                              {r.number} <Eye className="size-4" />
                            </button>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? ""}`}>{r.status}</span>
                            <span className="text-xs text-muted-foreground">
                              Version {r.version} · issued {new Date(r.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-border bg-card">
                            {r.deposits.map((d, i) => (
                              <div key={`d${i}`} className="flex justify-between border-b border-border/60 px-4 py-2.5">
                                <span className="text-muted-foreground">{d.label}</span>
                                <span className="tabular-nums">{money(d.amount)}</span>
                              </div>
                            ))}
                            {r.lines.map((l, i) => (
                              <div key={`l${i}`} className="flex justify-between border-b border-border/60 px-4 py-2.5">
                                <span className="text-muted-foreground">Less: {l.label}</span>
                                <span className="tabular-nums">-{money(l.amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between bg-muted/50 px-4 py-2.5 font-semibold">
                              <span>Refund to the resident</span>
                              <span className="tabular-nums">{money(r.amount)}</span>
                            </div>
                          </div>
                          {r.refund ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-2.5">
                              <span className="text-muted-foreground">
                                Refund · {r.refund.paidOn} · {r.refund.method}
                                {r.refund.reference ? ` · ${r.refund.reference}` : ""}
                              </span>
                              <StaffTag name={r.refund.recordedBy} />
                              <span className="ml-auto flex items-center gap-3">
                                {r.refund.hasProof ? (
                                  <button type="button" className="text-sm font-medium text-brand-deep hover:underline" onClick={() => proof(r.residentId)}>
                                    Proof
                                  </button>
                                ) : null}
                                <span className="font-semibold tabular-nums text-emerald-800">{money(r.refund.amount)}</span>
                              </span>
                            </div>
                          ) : r.status === "To pay" ? (
                            <div className="flex justify-end">
                              <Button size="sm" onClick={() => setPaying({ residentId: r.residentId, number: r.number, name: r.name, amount: r.amount })}>
                                Record payment
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="admin-ui max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">
              Record payment · {paying?.number} · {paying?.name}
            </DialogTitle>
          </DialogHeader>
          {paying ? (
            <RefundForm
              residentId={paying.residentId}
              net={paying.amount}
              onDone={() => {
                setPaying(null);
                void q.refetch();
                void qc.invalidateQueries({ queryKey: ["admin", "work-queue"] });
                void qc.invalidateQueries({ queryKey: ["checkout", paying.residentId] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${(pdf?.title ?? "credit-note").replace(/[/ ·]+/g, "-")}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </div>
  );
}
