import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel } from "@/components/admin/ops-ui";
import { CollectedBar, Figure, TonePill } from "@/components/admin/billing-ui";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { RecordPaymentDialog, type PayableInvoice } from "@/components/admin/RecordPaymentDialog";
import {
  ResidentInvoiceDialog,
  type ResidentDetails,
} from "@/components/admin/ResidentInvoiceDialog";
import { InvoiceDetail } from "@/components/admin/ResidentPayments";
import { cancelInvoice } from "@/lib/admin.functions";
import { proofOwner, refreshMoney, useBillingLedger, type LedgerRow } from "@/lib/billing-client";
import { TONE, sumBy, type Tone } from "@/lib/billing-tone";
import {
  INVOICE_CATEGORIES,
  categoryOf,
  invoiceRef,
  type InvoiceCategory,
} from "@/lib/invoice-category";
import { fmtDate, money } from "@/lib/ops-store";
import { paymentStateOf, type PaymentStatus } from "@/lib/payment-status";
import { getInvoiceBilling, type BillingInvoice } from "@/lib/resident-billing.functions";

export const Route = createFileRoute("/admin/residents/payments")({
  component: CollectionsPage,
});

/* ---------------- what state an invoice is in ---------------- */

/*
 * The five states and the rules behind them live in payment-status, so this
 * page, the resident's own Payments tab and anything added later all say the
 * same word about the same money.
 *
 * This page kept its own copy until 22 Sept 2026, and the two had already
 * drifted: one called a late invoice "Overdue", the other "Past Due".
 */

/** Is this row in that state today? The one question the tabs and pills ask. */
const is = (r: LedgerRow, today: string, status: PaymentStatus) =>
  paymentStateOf(r, today).status === status;

/*
 * One tab per status, and every one of them asks payment-status the same
 * question the pill on the row asks.
 *
 * They used to carry their own copy of the rules - "owed and due within seven
 * days" written out again here - so a tab could count a row the pill beside it
 * called something else. Delegating makes that disagreement impossible rather
 * than unlikely.
 */
type TabKey =
  | "all"
  | "scheduled"
  | "invoiced"
  | "coming"
  | "overdue"
  | "partial"
  | "paid"
  | "cancelled";

const TABS: {
  key: TabKey;
  label: string;
  test: (r: LedgerRow, today: string) => boolean;
}[] = [
  { key: "all", label: "All", test: () => true },
  { key: "invoiced", label: "Invoiced", test: (r, today) => is(r, today, "Invoiced") },
  { key: "coming", label: "Coming Due", test: (r, today) => is(r, today, "Coming Due") },
  { key: "overdue", label: "Past Due", test: (r, today) => is(r, today, "Past Due") },
  { key: "partial", label: "Partially paid", test: (r, today) => is(r, today, "Partially paid") },
  { key: "paid", label: "Paid", test: (r, today) => is(r, today, "Paid") },
  // kept as a record, never deleted - an initial, a rental or a charge that was
  // voided still has to be findable when somebody asks what happened to it
  { key: "cancelled", label: "Cancelled", test: (r, today) => is(r, today, "Cancelled") },
  // rent made ahead - listed apart, never counted as owed until its billing day
  { key: "scheduled", label: "Scheduled", test: () => true },
];

/* ---------------- sorting ---------------- */

type SortKey = "number" | "date" | "resident" | "amount" | "outstanding";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** The running number in INV/RP/00002; older dated numbers sort by their last group. */
const runningNumber = (number: string) => Number(/(\d+)\D*$/.exec(number)?.[1] ?? 0);

const SORTERS: Record<SortKey, (a: LedgerRow, b: LedgerRow) => number> = {
  number: (a, b) => runningNumber(a.number) - runningNumber(b.number),
  date: (a, b) => a.date.localeCompare(b.date),
  resident: (a, b) => a.residentName.localeCompare(b.residentName),
  amount: (a, b) => a.total - b.total,
  outstanding: (a, b) => a.outstanding - b.outstanding,
};

const PAGE_SIZES = [30, 50, 100];

/** Who an invoice belongs to, as one key - a resident, or a booking not yet a resident. */
const personKey = (r: LedgerRow) =>
  r.residentId ? `r:${r.residentId}` : r.enquiryId ? `b:${r.enquiryId}` : `n:${r.residentName}`;

/**
 * Collections - every invoice on one page, to see what is owed and act on it.
 *
 * Listed by invoice, the way the accountant checks it: the number carries its
 * category (INV/RP/00002), then the date, who it is for, what it is for, and the
 * money. Tabs split it by where the money stands; the filters narrow it by date,
 * resident, category and search. Each row opens underneath with its lines,
 * payments and receipts - the same view as the resident's Payments tab - and its
 * menu does the rest: download, edit, add a payment, a receipt, cancel.
 */
function CollectionsPage() {
  const { rows, scheduled, isLoading } = useBillingLedger();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [person, setPerson] = useState("all");
  const [category, setCategory] = useState<InvoiceCategory | "all">("all");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);

  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);
  const [editing, setEditing] = useState<BillingInvoice | null>(null);
  const [cancelling, setCancelling] = useState<LedgerRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; fileName: string; url: string } | null>(
    null,
  );

  const today = new Date().toISOString().slice(0, 10);
  // everyone with an invoice, for the resident filter
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of [...rows, ...scheduled]) {
      if (!seen.has(personKey(r))) seen.set(personKey(r), r.residentName || "Booking");
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, scheduled]);

  // every filter but the tab - so each tab's count is what it would show
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = (r: LedgerRow) =>
      (category === "all" || categoryOf(r.type) === category) &&
      (person === "all" || personKey(r) === person) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (!needle ||
        `${invoiceRef(r.number, r.type)} ${r.residentName} ${r.residentCode} ${r.quickbooksId}`
          .toLowerCase()
          .includes(needle));
    return { billed: rows.filter(keep), scheduled: scheduled.filter(keep) };
  }, [rows, scheduled, category, person, from, to, q]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [
          t.key,
          t.key === "scheduled"
            ? filtered.scheduled.length
            : filtered.billed.filter((r) => t.test(r, today)).length,
        ]),
      ) as Record<TabKey, number>,
    [filtered, today],
  );

  const sorted = useMemo(() => {
    const current = TABS.find((t) => t.key === tab)!;
    const list =
      tab === "scheduled"
        ? filtered.scheduled
        : filtered.billed.filter((r) => current.test(r, today));
    const by = SORTERS[sort.key];
    return [...list].sort((a, b) => (sort.dir === "asc" ? by(a, b) : by(b, a)));
  }, [filtered, tab, sort, today]);

  // a new view starts on its first page
  useEffect(() => setPage(1), [tab, q, from, to, person, category, pageSize]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount);
  const shown = sorted.slice((current - 1) * pageSize, current * pageSize);

  const filtering = Boolean(q || from || to || person !== "all" || category !== "all");
  const resetFilters = () => {
    setQ("");
    setFrom("");
    setTo("");
    setPerson("all");
    setCategory("all");
  };

  /*
   * A cancelled invoice is listed but counted in nothing. It never became money
   * owed, so adding its total to Billed would inflate the figure the whole page
   * is read for - and the percentage collected against it would quietly drop
   * every time an invoice was voided.
   */
  const live = rows.filter((r) => !r.cancelled);
  const billed = sumBy(live, "total");
  const collected = sumBy(live, "paid");
  const outstanding = sumBy(rows, "outstanding");
  const overdueCount = rows.filter((r) => paymentStateOf(r, today).status === "Past Due").length;

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "resident" ? "asc" : "desc" },
    );

  /* ---------------- actions ---------------- */

  async function loadInvoice(r: LedgerRow) {
    try {
      return await queryClient.fetchQuery({
        queryKey: ["resident-billing", "invoice", r.invoiceId],
        queryFn: () => getInvoiceBilling({ data: { invoiceId: r.invoiceId } }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the invoice");
      return null;
    }
  }

  const payFor = (r: LedgerRow) =>
    setPaying({
      id: r.invoiceId,
      number: invoiceRef(r.number, r.type),
      outstanding: r.outstanding,
      owner: proofOwner(r.residentId, r.enquiryId),
      label: r.residentName,
    });

  async function download(r: LedgerRow) {
    const inv = await loadInvoice(r);
    if (!inv) return;
    try {
      const { downloadInvoice } = await import("@/lib/invoice-pdf");
      await downloadInvoice({ ...inv.doc, number: invoiceRef(inv.number, inv.type) });
    } catch {
      toast.error("Could not download the invoice");
    }
  }

  async function edit(r: LedgerRow) {
    // a booking's invoice is changed where it was made, with its whole calculation
    if (categoryOf(r.type) === "initial" && r.enquiryId) {
      void navigate({
        to: "/admin/bookings/$id/invoice",
        params: { id: r.enquiryId },
        search: { invoice: r.invoiceId },
      });
      return;
    }
    const inv = await loadInvoice(r);
    if (inv) setEditing(inv);
  }

  /** The latest receipt on the invoice, shown to view or download. */
  async function receipt(r: LedgerRow) {
    const inv = await loadInvoice(r);
    const last = inv?.receipts.at(-1);
    if (!inv || !last) {
      toast.error("No payment has been recorded on this invoice yet");
      return;
    }
    const pay = inv.payments.find((p) => p.id === last.paymentId);
    try {
      const { receiptPdfUrl } = await import("@/lib/invoice-pdf");
      const url = await receiptPdfUrl({
        number: last.number,
        issued_at: last.issuedAt,
        invoiceNumber: invoiceRef(inv.number, inv.type),
        full_name: inv.doc.full_name,
        ...(inv.doc.resident_code ? { resident_code: inv.doc.resident_code } : {}),
        amount: last.amount,
        balance_after: last.balanceAfter,
        method: pay?.method ?? "",
        reference: pay?.reference ?? "",
        paid_on: pay?.paidOn ?? null,
        description: pay?.description ?? "",
        paid_to_date: last.paidToDate,
      });
      setPreview({ title: `Receipt ${last.number}`, fileName: `Brachtia-${last.number}.pdf`, url });
    } catch {
      toast.error("Could not make the receipt");
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    setCancelBusy(true);
    try {
      await cancelInvoice({ data: { invoiceId: cancelling.invoiceId } });
      toast.success(`Invoice ${invoiceRef(cancelling.number, cancelling.type)} cancelled`);
      if (openInvoice === cancelling.invoiceId) setOpenInvoice(null);
      setCancelling(null);
      await refreshMoney(queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the invoice");
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* the whole picture: four numbers, and how much of it is in */}
      <Panel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Billed" value={money(billed)} />
          <Figure label="Collected" value={money(collected)} tone="done" />
          <Figure
            label="Outstanding"
            value={money(outstanding)}
            tone={outstanding > 0 ? "due" : undefined}
          />
          <Figure
            label="Overdue"
            value={String(overdueCount)}
            tone={overdueCount > 0 ? "late" : undefined}
          />
        </div>
        <CollectedBar billed={billed} collected={collected}>
          {rows.length ? `${rows.length} invoice${rows.length === 1 ? "" : "s"}` : "No billing yet"}
        </CollectedBar>
      </Panel>

      <Panel className="overflow-hidden p-0">
        {/* where the money stands */}
        <div
          role="tablist"
          aria-label="Invoice status"
          className="flex gap-6 overflow-x-auto border-b border-border px-5"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-3 text-sm transition-colors ${
                  t.key === "scheduled" ? "ml-auto" : ""
                } ${
                  active
                    ? "border-brand-deep font-semibold text-brand-deep"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${
                    active ? "bg-brand-deep/10 text-brand-deep" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* narrowing it down */}
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3 px-5 py-4">
          <FilterField label="Date">
            <div className="flex h-9 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
                className="h-full w-[8.25rem] bg-transparent px-2.5 text-sm outline-none"
              />
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
                className="h-full w-[8.25rem] bg-transparent px-2.5 text-sm outline-none"
              />
            </div>
          </FilterField>
          <FilterField label="Search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice no., name or ID"
                aria-label="Search invoices"
                className="h-9 w-56 pl-9"
              />
            </div>
          </FilterField>
          <FilterField label="Resident">
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              aria-label="Resident"
              className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All residents</option>
              {people.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as InvoiceCategory | "all")}
              aria-label="Category"
              className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All categories</option>
              {(Object.keys(INVOICE_CATEGORIES) as InvoiceCategory[]).map((key) => (
                <option key={key} value={key}>
                  {INVOICE_CATEGORIES[key].code} · {INVOICE_CATEGORIES[key].label}
                </option>
              ))}
            </select>
          </FilterField>
          {filtering ? (
            <Button size="sm" variant="ghost" className="h-9" onClick={resetFilters}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          ) : null}
        </div>

        {/* how many, and which page */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {sorted.length
              ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, sorted.length)} of ${
                  sorted.length
                } invoice${sorted.length === 1 ? "" : "s"}`
              : "No invoices"}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[4.5rem] text-center tabular-nums text-foreground">
              {current} / {pageCount}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={current >= pageCount}
              onClick={() => setPage(current + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Invoices per page"
              className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading invoices…
          </div>
        ) : shown.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Receipt}
              title={rows.length || scheduled.length ? "Nothing here" : "Nothing billed yet"}
              hint={
                filtering
                  ? "No invoice matches these filters."
                  : rows.length || scheduled.length
                    ? "No invoice in this view."
                    : "Invoices come from bookings."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <SortHead label="Invoice no." k="number" sort={sort} onSort={toggleSort} first />
                  <SortHead label="Date" k="date" sort={sort} onSort={toggleSort} />
                  <SortHead label="Resident" k="resident" sort={sort} onSort={toggleSort} />
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <SortHead label="Amount" k="amount" sort={sort} onSort={toggleSort} right />
                  <SortHead
                    label="Outstanding"
                    k="outstanding"
                    sort={sort}
                    onSort={toggleSort}
                    right
                  />
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => {
                  const state = paymentStateOf(r, today);
                  const opened = openInvoice === r.invoiceId;
                  const ref = r.scheduled ? "Not billed yet" : invoiceRef(r.number, r.type);
                  const unpaid = r.paid === 0;
                  return (
                    <Fragment key={r.invoiceId}>
                      <tr
                        className={`transition-colors hover:bg-muted/40 ${opened ? "bg-muted/40" : ""}`}
                      >
                        <td className="whitespace-nowrap px-5 py-3">
                          <span
                            className={
                              r.scheduled
                                ? "text-muted-foreground"
                                : "font-semibold tabular-nums text-foreground"
                            }
                          >
                            {ref}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                          {fmtDate(r.date)}
                        </td>
                        <td className="px-3 py-3">
                          <Who row={r} />
                        </td>
                        <td className="px-3 py-3">
                          <CategoryTag type={r.type} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                          {money(r.total)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${
                            r.outstanding > 0 && !r.scheduled
                              ? `font-medium ${TONE[state.tone].text}`
                              : "text-muted-foreground"
                          }`}
                        >
                          {r.outstanding > 0 && !r.scheduled ? money(r.outstanding) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <TonePill tone={state.tone}>{state.status}</TonePill>
                          <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                            {r.scheduled
                              ? `Bills ${fmtDate(r.billOn)}`
                              : r.outstanding > 0 && r.dueDate
                                ? `Due ${fmtDate(r.dueDate)}`
                                : r.lastPaidOn
                                  ? `Paid ${fmtDate(r.lastPaidOn)}`
                                  : ""}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 min-w-[3.75rem]"
                              aria-expanded={opened}
                              onClick={() => setOpenInvoice(opened ? null : r.invoiceId)}
                            >
                              {opened ? "Hide" : "View"}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="size-8"
                                  aria-label={`More actions for ${ref}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onSelect={() => void download(r)}>
                                  <Download className="size-4" /> Download PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!unpaid} onSelect={() => void edit(r)}>
                                  <Pencil className="size-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={r.scheduled || r.outstanding === 0}
                                  onSelect={() => payFor(r)}
                                >
                                  <Plus className="size-4" /> Add payment
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!r.lastPaidOn}
                                  onSelect={() => void receipt(r)}
                                >
                                  <Receipt className="size-4" /> Generate receipt
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!unpaid || r.scheduled}
                                  onSelect={() => setCancelling(r)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <XCircle className="size-4" /> Cancel invoice
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {opened ? (
                        <tr>
                          <td colSpan={8} className="bg-muted/20 p-0">
                            <LedgerInvoice invoiceId={r.invoiceId} onPay={() => payFor(r)} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <RecordPaymentDialog
        key={paying?.id ?? "none"}
        invoice={paying}
        onClose={() => setPaying(null)}
      />

      {editing ? (
        <ResidentInvoiceDialog
          key={editing.id}
          open
          startAs={editing.type === "rental" ? "rental" : "charge"}
          editing={editing}
          residentId={ledgerResident(rows, scheduled, editing.id)}
          details={detailsFrom(editing)}
          lastRentEnd=""
          onClose={() => setEditing(null)}
          onCreated={() => undefined}
        />
      ) : null}

      <PdfPreviewDialog
        title={preview?.title ?? ""}
        fileName={preview?.fileName ?? ""}
        url={preview?.url ?? null}
        onClose={() => setPreview(null)}
      />

      <AlertDialog open={Boolean(cancelling)} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel {cancelling ? invoiceRef(cancelling.number, cancelling.type) : "invoice"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling?.residentName
                ? `${cancelling.residentName} will no longer owe `
                : "Nobody will owe "}
              {cancelling ? money(cancelling.total) : ""} on it. The invoice is kept as a cancelled
              record and its number is not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Keep invoice</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmCancel();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelBusy ? "Cancelling…" : "Cancel invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
  right = false,
  first = false,
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  right?: boolean;
  first?: boolean;
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2.5 font-medium ${first ? "px-5" : "px-3"} ${right ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        } ${right ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className={`size-3.5 ${active ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}

/** The category's code, then its name - the code is what the invoice number carries. */
function CategoryTag({ type }: { type: string }) {
  const { code, label } = INVOICE_CATEGORIES[categoryOf(type)];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
      <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-deep">
        {code}
      </span>
      {label}
    </span>
  );
}

/**
 * One invoice opened: its lines, payments with their proofs, and receipts.
 * Read when opened, and refreshed with the rest of the money after a payment.
 */
function LedgerInvoice({ invoiceId, onPay }: { invoiceId: string; onPay: () => void }) {
  const { data, isLoading } = useQuery<BillingInvoice | null>({
    queryKey: ["resident-billing", "invoice", invoiceId],
    queryFn: () => getInvoiceBilling({ data: { invoiceId } }),
  });
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading invoice…
      </div>
    );
  }
  if (!data) return <p className="px-5 py-4 text-sm text-muted-foreground">Invoice not found.</p>;
  return <InvoiceDetail invoice={data} onPay={onPay} />;
}

/** A resident links to their page; a booking not yet a resident links to the booking. */
function Who({ row }: { row: LedgerRow }) {
  const name = row.residentName || (row.residentId ? "Untitled resident" : "Booking");
  const link = "font-medium text-brand-deep underline-offset-2 hover:underline";
  return (
    <div className="min-w-0">
      {row.residentId ? (
        <Link to="/admin/residents/$id" params={{ id: row.residentId }} className={link}>
          {name}
        </Link>
      ) : row.enquiryId ? (
        <Link to="/admin/bookings/$id" params={{ id: row.enquiryId }} className={link}>
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      <p className="text-xs text-muted-foreground">
        {row.residentId ? row.residentCode || "No resident ID yet" : "Booking"}
      </p>
    </div>
  );
}

/** The resident an invoice in the ledger belongs to. */
function ledgerResident(rows: LedgerRow[], scheduled: LedgerRow[], invoiceId: string) {
  return [...rows, ...scheduled].find((r) => r.invoiceId === invoiceId)?.residentId ?? "";
}

/** Who the invoice is for and their stay, as the invoice itself has them - for editing it. */
function detailsFrom(inv: BillingInvoice): ResidentDetails {
  const d = inv.doc;
  return {
    residentCode: d.resident_code ?? "",
    fullName: d.full_name,
    email: d.email,
    phone: d.phone,
    university: d.university ?? "",
    nationality: d.nationality ?? "",
    residenceName: d.residence_name,
    roomName: d.room_name,
    occupancy: d.occupancy,
    tenancyStart: d.tenancy_start ?? "",
    tenancyEnd: d.tenancy_end ?? "",
    monthlyRent: d.monthly_rent,
    paymentFrequency: d.payment_frequency,
  };
}
