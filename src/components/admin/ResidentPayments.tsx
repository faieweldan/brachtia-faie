import { loadProofFile } from "@/lib/payment-proof";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronDown,
  DoorOpen,
  Eye,
  Loader2,
  Plus,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/admin/ops-ui";
import { CollectedBar, Figure, TonePill } from "@/components/admin/billing-ui";
import { paymentStateOf } from "@/lib/payment-status";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import {
  ResidentInvoiceDialog,
  type ResidentDetails,
} from "@/components/admin/ResidentInvoiceDialog";
import { TONE, sumBy, type Tone } from "@/lib/billing-tone";
import { invoiceRef } from "@/lib/invoice-category";
import { getResidentRent } from "@/lib/rental-schedule.functions";
import { RentalScheduleDialog } from "@/components/admin/RentalScheduleDialog";
import { fmtDate, money } from "@/lib/ops-store";
import { getResidentBilling, type BillingInvoice } from "@/lib/resident-billing.functions";
import {
  ProofLink,
  ReplaceProofButton,
  StaffTag,
  RecordPaymentDialog,
  type PayableInvoice,
} from "@/components/admin/RecordPaymentDialog";
import { CheckoutStatement } from "@/components/admin/CheckoutStatement";

/**
 * A resident's money, shown the way an admin thinks about it.
 *
 * The totals and how much of it is in, then four lines in the order they come
 * up over a tenancy: moving in, rent, anything extra, checkout. Each line says
 * its state with a colour before any word is read, and opens only when there is
 * more to see.
 *
 * Nothing accounting-shaped on the surface - no ageing, no debit and credit.
 * That detail lives one click down, inside the invoice.
 */

export function ResidentPayments({
  openCheckout = 0,
  cardCharge = null,
  focusInvoice = null,
  onCardChargeOpened,
  onInactive,
  residentId,
  quickbooksId,
  tenancyEnd,
  details,
}: {
  /** counts up each time the resident card's Checkout button is pressed */
  openCheckout?: number;
  /** a lost or damaged access card's charge, to open as a new invoice (n: each request) */
  cardCharge?: { label: string; amount: number; n: number } | null;
  /** an invoice to bring into view - from the Access Card panel's link (n: each request) */
  focusInvoice?: { number: string; n: number } | null;
  /** the charge invoice above has opened - the page forgets it */
  onCardChargeOpened?: () => void;
  /** checkout settled: the resident becomes Inactive and their bed is freed */
  onInactive?: () => Promise<void>;
  residentId: string;
  quickbooksId?: string;
  tenancyEnd?: string;
  /** who they are and their stay - a new invoice is filled in from it */
  details: ResidentDetails;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["resident-billing", residentId, quickbooksId],
    queryFn: () =>
      getResidentBilling({ data: { residentId, ...(quickbooksId ? { quickbooksId } : {}) } }),
  });

  const [open, setOpen] = useState<Record<string, boolean>>({});
  /*
   * Outline what a link brought admin to, for a few seconds: drawn inside the
   * edge, with a tint - an outline outside it was cut off by the group (Dani, 6 Oct 2026)
   */
  const flash = (el: Element) => {
    el.classList.add("bg-amber-50", "ring-2", "ring-inset", "ring-amber-400", "rounded-xl", "transition-colors", "duration-700");
    window.setTimeout(() => el.classList.remove("bg-amber-50", "ring-2", "ring-inset", "ring-amber-400"), 4000);
  };
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  // from the Checkout button: open the settlement and bring it into view
  // Payments is still loading when it opens - the section is looked for until it is there (Dani, 6 Oct 2026)
  const checkoutAsked = useRef(0);
  useEffect(() => {
    if (!openCheckout || isLoading || checkoutAsked.current === openCheckout) return;
    checkoutAsked.current = openCheckout;
    setOpen((o) => ({ ...o, checkout: true }));
    let tries = 0;
    const find = () => {
      const el = document.getElementById("checkout-settlement");
      if (!el) {
        if (tries++ < 40) window.setTimeout(find, 150);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // the statement is still loading and grows - scroll once more when it has
      window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 900);
      // said and shown where it landed, like an invoice link (Dani, 6 Oct 2026)
      flash(el);
      toast.info("Payments tab · Checkout settlement", { description: "The checkout statement is below, outlined." });
    };
    window.setTimeout(find, 200);
  }, [openCheckout, isLoading]);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);
  // a new invoice: rent or a charge
  const [raising, setRaising] = useState<{ as: "rental" | "charge"; card?: { label: string; amount: number } } | null>(null);
  // from the Access Card panel: the charge invoice opens, filled at Schedule B's price
  /*
   * Bring one invoice into view, outlined for a moment: from the Access Card
   * panel's link, or the invoice just generated (Dani, 6 Oct 2026). A new one
   * appears once the list reloads, so it is looked for a few times.
   */
  const [justMade, setJustMade] = useState<string | null>(null);
  const target = justMade ?? focusInvoice?.number ?? null;
  useEffect(() => {
    if (!target || isLoading) return;
    setOpen((o) => ({ ...o, initial: true, rental: true, charge: true, checkout: true }));
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-invoice="${CSS.escape(target)}"]`);
      if (!el) {
        if (tries++ < 40) window.setTimeout(find, 150);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      flash(el);
      if (!justMade) toast.info(`Payments tab · ${target}`, { description: "The invoice is outlined below." });
      setJustMade(null);
    };
    window.setTimeout(find, 200);
  }, [target, isLoading, focusInvoice?.n]);
  // opened once, then let go - else every visit to Payments opened it again (Dani, 4 Oct 2026)
  useEffect(() => {
    if (!cardCharge) return;
    setRaising({ as: "charge", card: { label: cardCharge.label, amount: cardCharge.amount } });
    onCardChargeOpened?.();
  }, [cardCharge, onCardChargeOpened]);
  // a scheduled rent invoice being changed before it is billed
  const [editingRent, setEditingRent] = useState<BillingInvoice | null>(null);
  // the rent terms admin confirmed for the current tenancy - none means setup is needed
  const { data: rent } = useQuery({
    queryKey: ["resident-rent", residentId],
    queryFn: () => getResidentRent({ data: { residentId } }),
  });
  const [settingSchedule, setSettingSchedule] = useState(false);
  const pay = (inv: BillingInvoice) =>
    setPaying({ id: inv.id, number: inv.number, outstanding: inv.outstanding, owner: residentId });

  const frequency = useMemo(() => {
    const f = data?.paymentFrequency ?? "";
    const named: Record<string, string> = {
      bimonthly: "Bi-monthly",
      quarterly: "Quarterly",
      semiannual: "Semi-annually",
      full: "Full term",
      monthly: "Monthly",
    };
    return named[f] ?? (f ? f[0]!.toUpperCase() + f.slice(1) : "");
  }, [data]);

  if (isLoading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading payments…
        </div>
      </Panel>
    );
  }

  const b = data;
  const initial = b?.groups.initial ?? [];
  const rental = b?.groups.rental ?? [];
  const charges = b?.groups.charge ?? [];
  const checkout = b?.groups.checkout ?? [];

  const billed = b?.billed ?? 0;
  const collected = b?.collected ?? 0;
  const outstanding = b?.outstanding ?? 0;

  const initialDue = sumBy(initial, "outstanding");
  const rentalDue = sumBy(rental, "outstanding");
  const chargeDue = sumBy(charges, "outstanding");
  const initialCredit = sumBy(initial, "credit");

  // what the resident page does not know is read off their first invoice
  const first = initial[0]?.doc;
  const invoiceDetails: ResidentDetails = {
    ...details,
    residentCode: details.residentCode || first?.resident_code || "",
    residenceName: details.residenceName || first?.residence_name || "",
    roomName: details.roomName || first?.room_name || "",
    occupancy: details.occupancy || first?.occupancy || "",
    tenancyStart: details.tenancyStart || first?.tenancy_start || "",
    tenancyEnd: details.tenancyEnd || first?.tenancy_end || "",
    monthlyRent: details.monthlyRent || b?.monthlyRent || 0,
    paymentFrequency: details.paymentFrequency || b?.paymentFrequency || "bimonthly",
  };
  const lastRentEnd =
    rental
      .map((i) => i.periodEnd)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";

  // rent: the invoices billed for this tenancy, then the ones made ahead that are
  // not billed yet - every one to the end of the tenancy, each billed on its own day
  const today = new Date().toISOString().slice(0, 10);
  const schedule = rent?.schedule ?? null;
  const tenancyId = rent?.tenancy?.id ?? "";
  const forTenancy = (i: BillingInvoice) => !i.tenancyId || !tenancyId || i.tenancyId === tenancyId;
  const issuedRent = rental.filter(forTenancy);
  const scheduledRent = (b?.scheduled ?? []).filter((i) => i.type === "rental").filter(forTenancy);
  // Update Tenancy IPs made ahead - listed with the initial payment, owed on their billing day
  const scheduledIp = (b?.scheduled ?? []).filter((i) => i.type === "initial");
  const lastIssuedEnd =
    issuedRent
      .map((i) => i.periodEnd.slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  const rentRows = [...issuedRent, ...scheduledRent].sort((x, y) =>
    (x.periodStart || x.issuedAt).localeCompare(y.periodStart || y.issuedAt),
  );
  const nextRent = rentRows.find((r) => r.scheduled || r.outstanding > 0);
  // "Past Due" is the word the status model uses; this read "Overdue" until the
  // five states landed, which would have left the count silently empty for ever
  const overdue = rentRows.filter((r) => rentState(r, today).label === "Past Due");
  const nextDue = nextRent ? nextRent.dueDate : (b?.nextDue ?? "");

  const chargeBilled = sumBy(charges, "total");
  const chargeCollected = sumBy(charges, "paid");

  return (
    <div className="space-y-4">
      {/* the whole picture: three numbers, and how much of it is in */}
      <Panel>
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            <Figure label="Billed" value={money(billed)} />
            <Figure label="Collected" value={money(collected)} tone="done" />
            <Figure
              label="Outstanding"
              value={money(outstanding)}
              tone={outstanding > 0 ? "due" : undefined}
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setRaising({ as: "rental" })}>
            <Plus className="size-4" /> Generate invoice
          </Button>
        </div>

        <CollectedBar billed={billed} collected={collected}>
          {[
            b?.monthlyRent ? `${money(b.monthlyRent)} / month` : null,
            frequency || null,
            nextDue ? `Next ${fmtDate(nextDue)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No billing yet"}
        </CollectedBar>

        {(b?.accountCredit?.given ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Account credit {money(b!.accountCredit.balance)} available · {money(b!.accountCredit.used)} applied to invoices
          </p>
        ) : null}
        {(b?.credit ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {money(b!.credit)} in credit
          </p>
        ) : null}
      </Panel>

      {/* the four stages of a tenancy's money, one line each */}
      <Panel className="overflow-hidden p-0">
        <div className="divide-y divide-border">
          <Row
            icon={Wallet}
            title="Initial payment"
            tone={initial.length === 0 ? "idle" : initialDue > 0 ? "due" : "done"}
            status={
              initial.length === 0
                ? "Not raised"
                : initialDue > 0
                  ? `${money(initialDue)} due`
                  : "Completed"
            }
            detail={
              initial.length
                ? `${money(sumBy(initial, "total"))} billed · ${money(sumBy(initial, "paid"))} collected${
                    initialCredit > 0 ? ` · ${money(initialCredit)} credit` : ""
                  }${scheduledIp.length ? ` · ${scheduledIp.length} scheduled` : ""}`
                : scheduledIp.length
                  ? `${scheduledIp.length} scheduled`
                  : ""
            }
            open={!!open["initial"]}
            onToggle={initial.length || scheduledIp.length ? () => toggle("initial") : undefined}
          >
            {[...initial, ...scheduledIp].map((inv) => (
              <InvoiceDetail key={inv.id} invoice={inv} onPay={() => pay(inv)} />
            ))}
          </Row>

          <Row
            icon={CalendarClock}
            title="Rental payments"
            tone={
              overdue.length
                ? "late"
                : !schedule || rentalDue > 0
                  ? "due"
                  : rentRows.length
                    ? "done"
                    : "idle"
            }
            status={
              overdue.length
                ? `${overdue.length} overdue`
                : !schedule
                  ? "Setup required"
                  : rentalDue > 0
                    ? `${money(rentalDue)} due`
                    : scheduledRent.length
                      ? "Scheduled"
                      : rentRows.length
                        ? "Up to date"
                        : "Not started"
            }
            detail={
              !schedule
                ? "The rent, payment schedule or tenancy dates are missing"
                : nextRent
                  ? `Next: ${spanLabel(
                      nextRent.periodStart.slice(0, 10),
                      nextRent.periodEnd.slice(0, 10),
                    )} · Due ${fmtDate(nextRent.dueDate)}${
                      nextRent.scheduled ? ` · Bills ${fmtDate(nextRent.billOn)}` : ""
                    }`
                  : ""
            }
            open={!!open["rental"]}
            onToggle={rentRows.length ? () => toggle("rental") : undefined}
            action={
              <Button
                size="sm"
                variant={schedule ? "ghost" : "outline"}
                className="h-8 shrink-0"
                onClick={() => setSettingSchedule(true)}
              >
                {schedule ? "Edit schedule" : "Set payment schedule"}
              </Button>
            }
          >
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {/* headings kept to one line and no wider than their own data -
                      eight columns of generous padding pushed Period off the
                      left edge, so the first thing you needed was the first
                      thing you could not see */}
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Period</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Amount</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Invoiced</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Due</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Invoice no.</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Overdue</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rentRows.map((inv) => {
                  const state = rentState(inv, today);
                  return (
                    <tr key={inv.id}>
                      <td className="whitespace-nowrap px-3 py-2">
                        {spanLabel(inv.periodStart.slice(0, 10), inv.periodEnd.slice(0, 10))}
                        {inv.edited ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">edited</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {money(inv.total)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {inv.scheduled ? "—" : fmtDate(inv.issuedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {fmtDate(inv.dueDate)}
                      </td>
                      {/* the number opens the invoice - staff were reading it off
                          the row and hunting for the document somewhere else */}
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {inv.scheduled ? (
                          `Bills ${fmtDate(inv.billOn)}`
                        ) : (
                          <PdfPreviewButton
                            variant="ghost"
                            className="h-7 px-1.5 text-xs font-medium text-brand-deep"
                            title={`Invoice ${inv.number}`}
                            fileName={`Brachtia-${inv.number}.pdf`}
                            build={async () =>
                              (await import("@/lib/invoice-pdf")).invoicePdfUrl(inv.doc)
                            }
                          >
                            {invoiceRef(inv.number, inv.type)}
                          </PdfPreviewButton>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <TonePill tone={state.tone}>{state.label}</TonePill>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                        {state.daysOverdue > 0 ? `${state.daysOverdue} days` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {inv.scheduled ? (
                          <Button size="sm" variant="outline" onClick={() => setEditingRent(inv)}>
                            Edit
                          </Button>
                        ) : inv.outstanding > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => pay(inv)}>
                            Record payment
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Row>

          <Row
            icon={Receipt}
            title="Additional charges"
            tone={chargeDue > 0 ? "due" : charges.length ? "done" : "idle"}
            status={chargeDue > 0 ? `${money(chargeDue)} due` : charges.length ? "Settled" : "None"}
            detail={
              charges.length
                ? `${charges.length} charge${charges.length === 1 ? "" : "s"} · ${money(
                    chargeBilled,
                  )} billed · ${money(chargeCollected)} collected · ${money(chargeDue)} outstanding`
                : "No additional charges"
            }
            open={!!open["charge"]}
            onToggle={charges.length ? () => toggle("charge") : undefined}
            action={
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => setRaising({ as: "charge" })}
                aria-label="Add charge"
              >
                <Plus className="size-4" />
              </Button>
            }
          >
            {charges.map((inv) => (
              <InvoiceDetail key={inv.id} invoice={inv} onPay={() => pay(inv)} />
            ))}
          </Row>

          <Row
            icon={DoorOpen}
            title="Checkout settlement"
            tone="idle"
            // what it ends as - a refund or a balance owed - is shown on the statement itself
            status="Checkout"
            detail={[
              tenancyEnd ? `Ends ${fmtDate(tenancyEnd)}` : null,
              (b?.depositsHeld ?? 0) > 0 ? `${money(b!.depositsHeld)} deposits held` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            open={!!open["checkout"]}
            onToggle={() => toggle("checkout")}
          >
            {/* older checkout invoices, from before the statement (2 Oct 2026) */}
            {checkout.map((inv) => (
              <InvoiceDetail key={inv.id} invoice={inv} onPay={() => pay(inv)} />
            ))}
            {/* wraps the statement, so the outline from the Checkout button has something to draw round */}
            <div id="checkout-settlement" className="scroll-mt-24 p-1">
              <CheckoutStatement residentId={residentId} phone={details.phone} onInactive={onInactive} />
            </div>
          </Row>
        </div>
      </Panel>

      <RecordPaymentDialog
        key={paying?.id ?? "none"}
        invoice={paying}
        onClose={() => setPaying(null)}
      />

      {raising ? (
        <ResidentInvoiceDialog
          open
          startAs={raising.as}
          {...(raising.card ? { accessCard: raising.card } : {})}
          {...(tenancyId ? { tenancyId } : {})}
          residentId={residentId}
          details={invoiceDetails}
          lastRentEnd={lastRentEnd}
          onClose={() => setRaising(null)}
          onCreated={(type, number) => {
            setOpen((o) => ({ ...o, [type]: true }));
            // straight to the invoice just generated
            if (number) setJustMade(number);
          }}
        />
      ) : null}

      {editingRent ? (
        <ResidentInvoiceDialog
          key={editingRent.id}
          open
          startAs="rental"
          editing={editingRent}
          residentId={residentId}
          details={invoiceDetails}
          lastRentEnd={lastRentEnd}
          onClose={() => setEditingRent(null)}
          onCreated={() => setOpen((o) => ({ ...o, rental: true }))}
        />
      ) : null}

      {settingSchedule ? (
        <RentalScheduleDialog
          residentId={residentId}
          tenancy={rent?.tenancy ?? null}
          schedule={schedule}
          details={details}
          lastIssuedEnd={lastIssuedEnd}
          advance={rent?.advance ?? { amount: 0, rent: 0 }}
          onClose={() => setSettingSchedule(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Where a rent invoice's money stands, in the five words staff use for it.
 *
 * The rules live in payment-status so that this table, and anything else that
 * shows a status, cannot drift apart - and so the edges (paid after its due
 * date, due in exactly a week) are covered by tests rather than by reading.
 */
function rentState(inv: BillingInvoice, today: string) {
  const state = paymentStateOf(inv, today);
  return { label: state.status, tone: state.tone, daysOverdue: state.daysOverdue };
}

function spanLabel(start: string, end: string) {
  if (!start) return "—";
  const short = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return end ? `${short(start)} – ${short(end)}` : short(start);
}

function periodLabel(inv: BillingInvoice) {
  if (!inv.periodStart) return inv.number || "—";
  const short = (d: string) =>
    new Date(d).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  return inv.periodEnd
    ? `${short(inv.periodStart)} – ${short(inv.periodEnd)}`
    : short(inv.periodStart);
}

/** One of the four. Its colour says the state; it opens only when there is more. */
function Row({
  icon: Icon,
  title,
  status,
  tone,
  detail,
  open,
  onToggle,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  tone: Tone;
  detail: string;
  open: boolean;
  onToggle?: (() => void) | undefined;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE[tone].icon}`}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-deep">{title}</p>
          {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <TonePill tone={tone}>{status}</TonePill>
        {action}
        {onToggle ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Hide ${title}` : `Show ${title}`}
          >
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        ) : (
          // keeps the pills lined up down the list
          <span className="size-8 shrink-0" aria-hidden />
        )}
      </div>
      {open && children ? (
        <div className="border-t border-border bg-muted/30">
          <div className="overflow-x-auto">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/** The accounting, one level down, only when asked for - the resident tab and Collections both open it. */
export function InvoiceDetail({ invoice, onPay }: { invoice: BillingInvoice; onPay: () => void }) {
  // its own, because this is exported and drawn outside the page that holds one
  const state = paymentStateOf(invoice, new Date().toISOString().slice(0, 10));
  return (
    <div className="scroll-mt-24 space-y-3 p-5" data-invoice={invoice.number}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-brand-deep">
          {invoice.scheduled ? "Not billed yet" : invoiceRef(invoice.number, invoice.type)}
        </p>
        <PdfPreviewButton
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`View invoice ${invoice.number}`}
          title={`Invoice ${invoice.number}`}
          fileName={`Brachtia-${invoice.number}.pdf`}
          build={async () => (await import("@/lib/invoice-pdf")).invoicePdfUrl(invoice.doc)}
        >
          <Eye className="size-4" />
        </PdfPreviewButton>
        {/* the same five words as the rental table and Collections - this said
            "Unpaid" where they said "Invoiced" for the very same invoice */}
        <TonePill tone={state.tone}>{state.status}</TonePill>
        {invoice.scheduled ? (
          <span className="text-xs text-muted-foreground">
            Bills {fmtDate(invoice.billOn)} · Due {fmtDate(invoice.dueDate)}
          </span>
        ) : invoice.issuedAt ? (
          <span className="text-xs text-muted-foreground">Issued {fmtDate(invoice.issuedAt)}</span>
        ) : null}
        {/* an IP can be paid before its billing day; rent cannot (agreed 7 Oct 2026) */}
        {invoice.outstanding > 0 && (!invoice.scheduled || invoice.type === "initial") ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onPay}>
            Record payment
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {invoice.items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums">{money(item.amount)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between bg-muted px-4 py-2 text-sm font-medium">
          <span>Total</span>
          <span className="tabular-nums">{money(invoice.total)}</span>
        </li>
      </ul>

      {invoice.payments.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {invoice.payments.map((p) => {
            const receipt = invoice.receipts.find((r) => r.paymentId === p.id);
            return (
              <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <span>
                    {p.description ? `${p.description} · ` : ""}
                    {fmtDate(p.paidOn)}
                    {p.method ? ` · ${p.method}` : ""}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {receipt ? ` · ${receipt.number}` : ""}
                  </span>
                  {/* who recorded it, beside the receipt it made (Dani, 1 Oct 2026) */}
                  <StaffTag name={p.recordedBy} />
                </span>
                <span className="flex items-center gap-3">
                  <ProofLink path={p.proofPath} />
                  {p.proofPath ? <ReplaceProofButton paymentId={p.id} oldPath={p.proofPath} /> : null}
                  <span className="tabular-nums text-emerald-700">{money(p.amount)}</span>
                  {receipt ? (
                    <PdfPreviewButton
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`View receipt ${receipt.number}`}
                      title={`Receipt ${receipt.number}`}
                      fileName={`Brachtia-${receipt.number}.pdf`}
                      /* one document to download and send: the receipt, then
                         the slip it was paid with on the pages after it */
                      build={async () =>
                        (await import("@/lib/invoice-pdf")).receiptPdfUrl(
                          {
                            number: receipt.number,
                            issued_at: receipt.issuedAt,
                            invoiceNumber: invoice.number,
                            full_name: invoice.doc.full_name,
                            ...(invoice.doc.resident_code
                              ? { resident_code: invoice.doc.resident_code }
                              : {}),
                            amount: receipt.amount,
                            balance_after: receipt.balanceAfter,
                            method: p.method,
                            reference: p.reference,
                            paid_on: p.paidOn,
                            description: p.description,
                            paid_to_date: receipt.paidToDate,
                          },
                          await loadProofFile(String(p.proofPath ?? "")),
                        )
                      }
                    >
                      <Eye className="size-4" />
                    </PdfPreviewButton>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {invoice.credit > 0 ? (
        <p className="text-xs text-sky-900">{money(invoice.credit)} paid beyond this invoice</p>
      ) : null}

      {invoice.depositsHeld > 0 ? (
        <p className="text-xs text-muted-foreground">
          {money(invoice.depositsHeld)} refundable deposits held
        </p>
      ) : null}
    </div>
  );
}
