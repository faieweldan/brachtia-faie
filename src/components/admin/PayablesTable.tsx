import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { RefundForm } from "@/components/admin/CheckoutStatement";
import { StaffTag } from "@/components/admin/RecordPaymentDialog";
import { StaffPicker } from "@/components/admin/Dropdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { checkoutPdf, creditNoteProofUrl, issueAccountCreditNote, listResidentPayables, refundProofUrl, type PayableRow } from "@/lib/checkout.functions";
import { money } from "@/lib/ops-store";

const TONE: Record<string, string> = {
  "To pay": "border-amber-200 bg-amber-100 text-amber-900",
  Paid: "border-emerald-200 bg-emerald-100 text-emerald-900",
};

const CATEGORY = {
  checkout: { code: "CS", label: "Checkout credit note" },
  credit: { code: "AC", label: "Account credit refund" },
} as const;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Credit notes - what Brachtia owes residents (Dani, 2 Oct 2026; account
 * credit added 13 Oct 2026). One table for the Payables tab (every resident)
 * and a resident's Payments tab (theirs, `hideResident`), so the two show the
 * same rows the same way. View opens the note under its row, as Collections
 * opens an invoice; Record payment is the checkout refund's own form.
 */
export function PayablesTable({ rows, onChanged, hideResident = false }: { rows: PayableRow[]; onChanged: () => void; hideResident?: boolean }) {
  const qc = useQueryClient();
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const [paying, setPaying] = useState<PayableRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function view(r: PayableRow) {
    if (r.kind !== "checkout" || r.version == null) return;
    try {
      const { base64 } = await checkoutPdf({ data: { residentId: r.residentId, v: r.version } });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      setPdf({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), title: `${r.number} · v${r.version}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the PDF");
    }
  }

  const proof = (r: PayableRow) =>
    void (r.kind === "credit" ? creditNoteProofUrl({ data: { residentId: r.residentId, number: r.number } }) : refundProofUrl({ data: { residentId: r.residentId } }))
      .then(({ url }) => url && window.open(url, "_blank", "noopener"))
      .catch(() => toast.error("Could not open the proof"));

  const cols = hideResident ? 6 : 7;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Credit note no.</th>
              <th className="px-3 py-3 font-medium">Date</th>
              {hideResident ? null : <th className="px-3 py-3 font-medium">Resident</th>}
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
                    {r.version != null ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">v{r.version}</span> : null}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{dateOf(r.issuedAt)}</td>
                  {hideResident ? null : (
                    <td className="px-3 py-3">
                      <Link to="/admin/residents/$id" params={{ id: r.residentId }} className="font-medium hover:underline">
                        {r.name || "—"}
                      </Link>
                      {r.code ? <p className="text-xs text-muted-foreground">{r.code}</p> : null}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{CATEGORY[r.kind].code}</span>
                    {CATEGORY[r.kind].label}
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
                          {r.kind === "checkout" ? (
                            <DropdownMenuItem onSelect={() => void view(r)}>
                              <Download className="size-4" /> Download PDF
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem disabled={r.status !== "To pay"} onSelect={() => setPaying(r)}>
                            <Plus className="size-4" /> Record payment
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!r.refund?.hasProof} onSelect={() => proof(r)}>
                            <Eye className="size-4" /> Proof of payment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
                {open === r.number ? (
                  <tr>
                    <td colSpan={cols} className="bg-muted/20 px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.kind === "checkout" ? (
                            <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-brand-deep hover:underline" onClick={() => void view(r)}>
                              {r.number} <Eye className="size-4" />
                            </button>
                          ) : (
                            <span className="font-semibold text-brand-deep">{r.number}</span>
                          )}
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? ""}`}>{r.status}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.version != null ? `Version ${r.version} · ` : ""}issued {dateOf(r.issuedAt)}
                          </span>
                          {r.issuedBy ? <StaffTag name={r.issuedBy} /> : null}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                          {r.kind === "checkout" ? (
                            <>
                              {/* grouped like a statement: no prefix, the minus once, in the amount (Dani, 6 Oct 2026) */}
                              <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Deposits held</p>
                              {r.deposits.map((d, i) => (
                                <div key={`d${i}`} className="flex justify-between px-4 py-2">
                                  <span className="text-muted-foreground">{d.label}</span>
                                  <span className="tabular-nums">{money(d.amount)}</span>
                                </div>
                              ))}
                              {r.lines.length ? (
                                <p className="mt-1 border-t border-border/60 px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Deductions</p>
                              ) : null}
                              {r.lines.map((l, i) => (
                                <div key={`l${i}`} className="flex justify-between px-4 py-2">
                                  <span className="text-muted-foreground">{l.label}</span>
                                  <span className="whitespace-nowrap tabular-nums text-rose-700">− {money(l.amount)}</span>
                                </div>
                              ))}
                            </>
                          ) : (
                            r.lines.map((l, i) => (
                              <div key={`l${i}`} className="flex justify-between px-4 py-2">
                                <span className="text-muted-foreground">{l.label}</span>
                                <span className="tabular-nums">{money(l.amount)}</span>
                              </div>
                            ))
                          )}
                          <div className="mt-2 flex justify-between border-t-2 border-border bg-muted/50 px-4 py-2.5 font-semibold">
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
                                <button type="button" className="text-sm font-medium text-brand-deep hover:underline" onClick={() => proof(r)}>
                                  Proof
                                </button>
                              ) : null}
                              <span className="font-semibold tabular-nums text-emerald-800">{money(r.refund.amount)}</span>
                            </span>
                          </div>
                        ) : r.status === "To pay" ? (
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => setPaying(r)}>
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
              {...(paying.kind === "credit" ? { creditNote: paying.number } : {})}
              onDone={() => {
                setPaying(null);
                onChanged();
                void qc.invalidateQueries({ queryKey: ["payables"] });
                void qc.invalidateQueries({ queryKey: ["admin", "work-queue"] });
                void qc.invalidateQueries({ queryKey: ["checkout", paying.residentId] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${(pdf?.title ?? "credit-note").replace(/[/ ·]+/g, "-")}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </>
  );
}

/**
 * A resident's own credit notes, on their Payments tab (Dani, 13 Oct 2026).
 * Not there at all unless there is something to show: a credit note, or
 * account credit no invoice can take (`leftover`) - then the button to issue
 * one. The amount is the server's (creditOutlook), never typed: while rent is
 * still to be billed the credit goes onto it instead.
 */
export function ResidentCreditNotes({ residentId, leftover, onChanged }: { residentId: string; leftover: number; onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payables", residentId], queryFn: () => listResidentPayables({ data: { residentId } }) });
  const [issuedBy, setIssuedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = q.data ?? [];
  if (!rows.length && leftover <= 0.005) return null;

  async function issue() {
    if (!issuedBy) return void toast.error("Choose who is issuing this credit note");
    setBusy(true);
    try {
      const res = await issueAccountCreditNote({ data: { residentId, issuedBy } });
      toast.success(`Credit note ${res.number} issued`, { description: `${money(res.amount)} to refund - also in Payables.` });
      await Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ["payables"] })]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not issue the credit note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-5 pb-2 pt-4">
        <p className="text-sm font-semibold text-brand-deep">Credit notes</p>
        <p className="text-xs text-muted-foreground">Money Brachtia owes this resident. Every credit note is also listed in Payables.</p>
      </div>
      {leftover > 0.005 ? (
        <div className="mx-5 mb-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="min-w-0 text-sm text-amber-950">
            <p className="font-semibold">{money(leftover)} account credit has no invoice to go on</p>
            <p className="text-xs">No rent is left to bill, so it cannot be used. Issue a credit note to refund it.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <StaffPicker value={issuedBy} onChange={setIssuedBy} />
            </div>
            <Button size="sm" disabled={busy} onClick={() => void issue()}>
              {busy ? "Issuing…" : `Issue credit note ${money(leftover)}`}
            </Button>
          </div>
        </div>
      ) : null}
      {rows.length ? <PayablesTable rows={rows} hideResident onChanged={() => void q.refetch()} /> : null}
    </section>
  );
}
