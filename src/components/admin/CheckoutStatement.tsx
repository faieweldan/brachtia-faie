import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, FileText, Loader2, Plus, Send, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { ChargeInput } from "@/components/admin/ChargePicker";
import { ReturnMessage } from "@/components/admin/InventoryReturnMessage";
import { money } from "@/lib/ops-store";
import {
  checkoutPdf,
  discardCheckout,
  getCheckout,
  issueCheckout,
  markCheckoutInactive,
  previewCheckout,
  recordCheckoutRefund,
  refundProofUrl,
  saveCheckoutDraft,
  startCheckout,
  uploadCheckoutPhoto,
} from "@/lib/checkout.functions";
import type { CheckoutLine } from "@/lib/checkout.server";
import { CHECKOUT_TYPES, CHECKOUT_TYPE_LABEL, type CheckoutType } from "@/lib/checkout-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { klToday } from "@/lib/kl-date";

/**
 * The checkout statement on the resident's Payments tab (Dani, 2 Oct 2026) -
 * edited like an invoice, but a credit note: the deposits held at the top,
 * what is still owed and each deduction taken off, the refund at the bottom.
 *
 *   Start → edit → Issue (v1) → the resident signs → Record refund
 *   Changed after issuing → Issue again (v2); v1 is kept, v2 is signed
 */
const METHODS = ["Bank Transfer", "DuitNow QR Pay", "Cash Deposit", "Cash", "Cheque"];

const pdfUrl = (base64: string) =>
  URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "application/pdf" }));
const fmt = (v: string) =>
  new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

/** what each kind of checkout keeps, said once beside the picker */
const TYPE_HINT: Record<CheckoutType, string> = {
  cancellation: "Before the tenancy starts. RM150 is kept; one month's rent too if the initial payment was paid in full.",
  early_termination: "After move-in, before the end date. The security and utility deposits are kept.",
  end_of_tenancy: "Within 2 weeks of the end date. Every deposit comes back, less what is owed.",
};

function TypePicker({ value, onChange, disabled }: { value: CheckoutType; onChange: (t: CheckoutType) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CheckoutType)} disabled={disabled ?? false}>
      <SelectTrigger className="h-9 w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="admin-ui">
        {CHECKOUT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {CHECKOUT_TYPE_LABEL[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CheckoutStatement({
  residentId,
  phone,
  onInactive,
}: {
  residentId: string;
  phone: string;
  /** frees the bed and marks the resident Inactive on their record */
  onInactive?: (() => Promise<void> | void) | undefined;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["checkout", residentId], queryFn: () => getCheckout({ data: { residentId } }) });
  const s = q.data?.statement ?? null;
  const [lines, setLines] = useState<CheckoutLine[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // the kind picked before starting - the dates' suggestion until changed
  const [startType, setStartType] = useState<CheckoutType | null>(null);

  // the draft as saved, each time it is loaded
  useEffect(() => {
    if (!s) return;
    setLines(s.draft.lines);
    setNotes(s.draft.notes);
    setUrls(q.data?.photos ?? {});
  }, [s, q.data?.photos]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["checkout", residentId] });
  const run = async (what: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(what);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  if (q.isLoading) return <p className="py-3 text-sm text-muted-foreground">Loading…</p>;
  if (!q.data) return null;

  const deposits = q.data.deposits;
  const held = deposits.reduce((n, d) => n + d.amount, 0);
  const deducted = lines.reduce((n, l) => n + (Number(l.amount) || 0), 0);
  const net = Math.round((held - deducted) * 100) / 100;
  const latest = s?.versions.at(-1) ?? null;
  // signed and settled: nothing on it changes any more
  const closed = !!s?.refund || !!s?.settled;
  const settled = s?.settled ?? null;
  const unsaved = !!s && (JSON.stringify(lines) !== JSON.stringify(s.draft.lines) || notes !== s.draft.notes);
  // what was issued last differs from what is here: issue it (again)
  const toIssue = !!s && !closed && (unsaved || q.data.changed);

  const edit = (i: number, patch: Partial<CheckoutLine>) => setLines((rows) => rows.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = () => saveCheckoutDraft({ data: { residentId, lines, notes } });
  const type: CheckoutType = q.data.type;
  const changeType = (t: CheckoutType) =>
    void run("type", () => saveCheckoutDraft({ data: { residentId, lines, notes, type: t } }), `Changed to ${CHECKOUT_TYPE_LABEL[t]}`);
  const paidIn = type === "cancellation";
  // the money is in or out: the resident can be made inactive
  const moneyDone = !!settled && (settled.refund > 0 ? !!s?.refund : settled.owed > 0 ? q.data.csPaid : true);

  async function addPhoto(i: number, file: File | undefined) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.set("residentId", residentId);
      fd.set("file", await shrink(file));
      const r = await uploadCheckoutPhoto({ data: fd });
      setUrls((u) => ({ ...u, [r.path]: r.url }));
      edit(i, { photos: [...(lines[i]?.photos ?? []), r.path] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the photo");
    }
  }
  async function view(v: number) {
    try {
      const { base64 } = await checkoutPdf({ data: { residentId, v } });
      setPdf({ url: pdfUrl(base64), title: `${s?.number} · Version ${v}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the PDF");
    }
  }

  if (!s) {
    const pick = startType ?? q.data.suggested;
    const blocked = pick !== "cancellation" && !q.data.initialPaid;
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TypePicker value={pick} onChange={setStartType} />
          {pick === q.data.suggested ? <span className="text-xs text-muted-foreground">From the tenancy dates</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">{TYPE_HINT[pick]}</p>
        {blocked ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            The initial payment has to be paid in full first - or choose Cancellation.
          </p>
        ) : null}
        <Button
          size="sm"
          disabled={!!busy || blocked}
          onClick={() => void run("start", () => startCheckout({ data: { residentId, type: pick } }), "Checkout statement started")}
        >
          <Plus className="size-4" /> Start checkout statement
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-deep">
          {/* a refund is a credit note, a balance owed is an invoice - it follows the balance (Dani, 5 Oct 2026) */}
          {net >= 0 ? "Credit note" : "Invoice"} {s.number}
          {latest ? <span className="ml-2 text-xs font-normal text-muted-foreground">Version {latest.v}</span> : null}
        </p>
        <span
          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            closed
              ? "border-emerald-200 bg-emerald-100 text-emerald-900"
              : latest?.signed && !toIssue
                ? "border-violet-200 bg-violet-100 text-violet-900"
                : latest
                  ? "border-sky-200 bg-sky-100 text-sky-900"
                  : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {s.refund
            ? "Settled"
            : settled
              ? settled.refund > 0
                ? "Signed - pay the refund"
                : settled.owed > 0
                  ? "Signed - balance invoiced"
                  : "Settled"
              : latest?.signed && !toIssue
                ? "Signed"
                : latest ? "With resident to sign" : "Draft"}
        </span>
      </div>

      {/* the kind of checkout: picked from the dates, admin can change it until it is signed */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypePicker value={type} onChange={changeType} disabled={closed || !!busy} />
          {type === q.data.suggested ? <span className="text-xs text-muted-foreground">From the tenancy dates</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">{TYPE_HINT[type]}</p>
      </div>

      {/* deposits held - or, for a cancellation, what was paid - read from the resident's invoices */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {paidIn ? "Paid so far" : "Deposits held"}
        </div>
        {deposits.length ? (
          deposits.map((d, i) => (
            <div key={i} className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
              <span>{d.label}</span>
              <span className="tabular-nums">{money(d.amount)}</span>
            </div>
          ))
        ) : (
          <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">{paidIn ? "Nothing paid." : "No refundable deposits on record."}</p>
        )}
        <div className="flex items-center justify-between border-t border-border bg-muted px-3 py-2 text-sm font-medium">
          <span>{paidIn ? "Total paid" : "Total held"}</span>
          <span className="tabular-nums">{money(held)}</span>
        </div>
      </div>

      {/* deductions: unpaid invoices first, then what admin adds - like the invoice's lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Deductions</p>
          {closed ? null : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLines((rows) => [...rows, { id: crypto.randomUUID().slice(0, 8), label: "", amount: 0, source: "deduction", photos: [] }])}
            >
              <Plus className="size-4" /> Add line
            </Button>
          )}
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Description</span>
            <span className="w-28 text-right">Amount (RM)</span>
            <span className="w-16 shrink-0" aria-hidden />
          </div>
          {lines.length ? null : <p className="px-3 py-2 text-sm text-muted-foreground">No deductions.</p>}
          {lines.map((l, i) => (
            <div key={l.id} className="space-y-2 px-3 py-2">
              <div className="flex items-center gap-2">
                {l.source === "deduction" ? (
                  <ChargeInput
                    value={l.label}
                    placeholder="e.g. Cleaning, broken chair"
                    disabled={closed}
                    onChange={(label) => edit(i, { label })}
                    onPick={(label, amount) => edit(i, { label, ...(amount != null ? { amount } : {}) })}
                  />
                ) : (
                  <Input
                    value={l.label}
                    placeholder="e.g. Cleaning, broken chair"
                    className="h-8 flex-1"
                    disabled={closed || l.source === "forfeit"}
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                )}
                <Input
                  type="number"
                  value={l.amount}
                  aria-label="Amount"
                  // what is kept can be changed - Brachtia may give some back (Dani, 6 Oct 2026)
                  disabled={closed}
                  className="h-8 w-28 text-right tabular-nums"
                  onChange={(e) => edit(i, { amount: Math.max(0, Number(e.target.value) || 0) })}
                />
                <label
                  title="Add a photo (optional)"
                  className={`relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted ${closed ? "pointer-events-none opacity-40" : ""}`}
                >
                  <Camera className="size-4" />
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => void addPhoto(i, e.target.files?.[0])} />
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={closed}
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label="Remove line"
                  onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {l.photos.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {l.photos.map((p) => (
                    <span key={p} className="relative size-12 overflow-hidden rounded-md border border-border bg-muted">
                      {urls[p] ? <img src={urls[p]} alt="" className="size-full object-cover" /> : null}
                      {closed ? null : (
                        <button
                          type="button"
                          title="Remove photo"
                          onClick={() => edit(i, { photos: l.photos.filter((x) => x !== p) })}
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex items-center justify-between bg-muted px-3 py-2 text-sm font-medium">
            <span>Total deductions</span>
            <span className="tabular-nums">- {money(deducted)}</span>
          </div>
        </div>
      </div>

      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${net >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
        <span className="text-sm font-semibold">{net >= 0 ? "Refund due to resident" : "Balance owed by resident"}</span>
        <span className="text-lg font-bold tabular-nums">{money(Math.abs(net))}</span>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Note on the statement</p>
        <Textarea rows={2} value={notes} disabled={closed} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>

      {closed ? null : (
        <div className="flex flex-wrap justify-end gap-2">
          {/* the PDF as it would be issued, before anything is saved */}
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void (async () => {
                try {
                  const { base64 } = await previewCheckout({ data: { residentId, lines, notes } });
                  setPdf({ url: pdfUrl(base64), title: `${s.number} · Preview` });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not make the preview");
                }
              })()
            }
          >
            <FileText className="size-4" /> Preview
          </Button>
          {/* start over with another kind of checkout - only until the resident signs */}
          {latest?.signed ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="mr-auto text-muted-foreground"
              disabled={!!busy}
              onClick={() => {
                if (!window.confirm(`Discard ${s.number}? The statement and its versions are removed.`)) return;
                void run("discard", () => discardCheckout({ data: { residentId } }), "Statement discarded");
              }}
            >
              <Undo2 className="size-4" /> Discard statement
            </Button>
          )}
          {unsaved ? (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run("save", save, "Saved")}>
              Save draft
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!!busy || !toIssue}
            onClick={() =>
              void run(
                "issue",
                async () => {
                  if (unsaved) await save();
                  await issueCheckout({ data: { residentId } });
                },
                latest ? `Version ${latest.v + 1} issued - the resident signs it again` : "Issued - send the resident their link",
              )
            }
          >
            {busy === "issue" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {latest ? (toIssue ? `Reissue as version ${latest.v + 1}` : "Issued") : "Issue to resident"}
          </Button>
        </div>
      )}

      {/* every version, kept */}
      {s.versions.length ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Versions</div>
          {[...s.versions].reverse().map((v) => (
            <div key={v.v} className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-sm">
              <span className="font-medium">Version {v.v}</span>
              <span className="text-xs text-muted-foreground">Issued {fmt(v.issuedAt)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">· {money(Math.abs(v.net))} {v.net >= 0 ? "refund" : "owed"}</span>
              <span className="ml-auto flex items-center gap-2">
                {v.signed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                    <Check className="size-3.5" /> Signed {fmt(v.signed.at)}
                  </span>
                ) : v.v === latest?.v ? (
                  <span className="text-xs font-medium text-sky-800">Waiting for signature</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Replaced</span>
                )}
                <Button size="sm" variant="ghost" onClick={() => void view(v.v)}>
                  <FileText className="size-4" /> PDF
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* tell the resident: the same link as their documents */}
      {latest && !latest.signed && !closed ? (
        <ReturnMessage residentId={residentId} phone={phone} defects={0} kind="checkout" />
      ) : null}

      {/* what signing did: the deposit applied, then a refund or an invoice for the rest */}
      {settled ? (
        <div className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          {settled.applied.map((x) => (
            <p key={x.invoiceNumber}>
              Deposit applied to {x.invoiceNumber}: <span className="tabular-nums">{money(x.amount)}</span>
            </p>
          ))}
          {settled.owed > 0 ? (
            <p className="font-medium text-red-800">
              {money(settled.owed)} still owed - invoiced as {settled.csInvoiceNumber || "a checkout settlement invoice"} in Collections.
            </p>
          ) : settled.refund > 0 ? (
            <p className="font-medium text-emerald-800">{money(settled.refund)} to refund - in Payables.</p>
          ) : (
            <p className="text-muted-foreground">Nothing left to pay either way.</p>
          )}
        </div>
      ) : null}

      {settled && settled.refund > 0 && !s.refund ? <RefundForm residentId={residentId} net={settled.refund} onDone={() => void refresh()} /> : null}

      {s.refund ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>
            {money(s.refund.amount)} {latest && latest.net < 0 ? "received" : "refunded"} {s.refund.paidOn} by {s.refund.method}
            {s.refund.reference ? ` · Ref ${s.refund.reference}` : ""}
          </span>
          {s.refund.proofPath ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void refundProofUrl({ data: { residentId } }).then(({ url }) => url && window.open(url, "_blank", "noopener"))
              }
            >
              Proof
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* last step: the resident becomes inactive, and the bed is freed (Dani, 2 Oct 2026) */}
      {settled ? (
        s.inactiveAt ? (
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Resident made inactive {fmt(s.inactiveAt)}.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="text-muted-foreground">
              {moneyDone
                ? "Settled. Make the resident inactive - their bed is freed."
                : settled.owed > 0
                  ? `Waiting for ${settled.csInvoiceNumber || "the settlement invoice"} to be paid.`
                  : "Waiting for the refund to be recorded."}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!moneyDone || !!busy}
              onClick={() =>
                void run(
                  "inactive",
                  async () => {
                    await markCheckoutInactive({ data: { residentId } });
                    await onInactive?.();
                  },
                  "Resident made inactive",
                )
              }
            >
              Make this resident inactive
            </Button>
          </div>
        )
      ) : null}

      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${(pdf?.title ?? "statement").replace(/\//g, "-")}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </div>
  );
}

/** Pay the refund: how, when, and its proof. */
export function RefundForm({ residentId, net, onDone }: { residentId: string; net: number; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.abs(net)));
  const [paidOn, setPaidOn] = useState(klToday());
  const [method, setMethod] = useState(METHODS[0]!);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("residentId", residentId);
      fd.set("amount", amount);
      fd.set("paidOn", paidOn);
      fd.set("method", method);
      fd.set("reference", reference);
      if (file) fd.set("file", file);
      await recordCheckoutRefund({ data: fd });
      toast.success("Refund recorded");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the refund");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <p className="text-sm font-semibold text-brand-deep">
        {net >= 0 ? "Signed by the resident - record the refund" : "Signed by the resident - record the balance they paid"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{net >= 0 ? "Refund paid (RM)" : "Received from resident (RM)"}</span>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Paid on</span>
          <DateInput value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-9" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Reference</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" placeholder="From the bank slip" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Proof of payment {Number(amount) > 0 ? "" : "(optional)"}</span>
        <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9 text-xs" />
      </label>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : net >= 0 ? "Record refund" : "Record payment"}
        </Button>
      </div>
    </div>
  );
}

/** a phone photo is several megabytes; 1600 pixels on the long side shows a scratch */
async function shrink(file: File): Promise<File> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
