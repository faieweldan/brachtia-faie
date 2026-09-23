import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { Text } from "@/components/admin/ops-ui";
import { Choice } from "@/components/admin/Choice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshMoney } from "@/lib/billing-client";
import type { InvoiceDoc } from "@/lib/invoice-pdf";
import { fmtDate, money } from "@/lib/ops-store";
import { SCHEDULES } from "@/lib/reference-data";
import {
  createResidentInvoice,
  updateResidentInvoice,
  type BillingInvoice,
} from "@/lib/resident-billing.functions";

/**
 * A resident's next invoice, from their Payments tab: rent for a period,
 * utilities, a charge. Filled in from the resident and their stay; admin checks
 * the lines, dates and wording, looks at the PDF, and generates it. Each one is
 * a new invoice with its own number.
 */

/** Who the invoice is for, and their stay - what it is filled in from. */
export type ResidentDetails = {
  /** the ID they go by - their resident ID, or the Brachtia ID they kept */
  residentCode: string;
  fullName: string;
  email: string;
  phone: string;
  university: string;
  nationality: string;
  residenceName: string;
  roomName: string;
  occupancy: string;
  tenancyStart: string;
  tenancyEnd: string;
  monthlyRent: number;
  paymentFrequency: string;
};

/** amount is the price of one; the line is worth quantity x amount. */
type Line = { label: string; kind: string; amount: number; quantity: number };

/** How many of a line there are - never none, and never a fraction of one. */
const qty = (v: unknown) => Math.max(1, Math.round(Number(v) || 1));

const TYPES = [
  { value: "rental", label: "Rental" },
  { value: "utility", label: "Utility" },
  { value: "charge", label: "Additional charge" },
  { value: "other", label: "Other" },
];

// the payment schedules the resident form offers
const FREQUENCIES = SCHEDULES;

const MONTHS: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6 };

const today = () => new Date().toISOString().slice(0, 10);

function shift(iso: string, { days = 0, months = 0 }: { days?: number; months?: number }) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** The next rent: the period after the last one billed, at the rent for that many months. */
function nextRent(details: ResidentDetails, lastPeriodEnd: string, frequency: string) {
  const start = lastPeriodEnd ? shift(lastPeriodEnd, { days: 1 }) : details.tenancyStart || today();
  const months =
    frequency === "full" && details.tenancyEnd
      ? Math.max(
          1,
          Math.round((Date.parse(details.tenancyEnd) - Date.parse(start)) / 2_629_800_000),
        )
      : (MONTHS[frequency] ?? 1);
  let end = shift(start, { months, days: -1 });
  if (details.tenancyEnd && end > details.tenancyEnd) end = details.tenancyEnd;
  return {
    start,
    end,
    line: {
      label: `Rent ${short(start)} – ${short(end)}`,
      kind: "rent",
      amount: details.monthlyRent * months,
      quantity: 1,
    },
  };
}

const firstLine = (kind: string): Line => ({
  label: kind === "utility" ? "Utilities" : "",
  kind: "charge",
  amount: 0,
  quantity: 1,
});

export function ResidentInvoiceDialog({
  open,
  startAs,
  residentId,
  details,
  lastRentEnd,
  preset,
  tenancyId,
  editing,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** rental from "Generate invoice", charge from "Add charge" */
  startAs: "rental" | "charge";
  residentId: string;
  details: ResidentDetails;
  /** where the last rental invoice ended - the next one starts the day after */
  lastRentEnd: string;
  /** a scheduled rent period being issued - its dates, due date and amount */
  preset?: { start: string; end: string; amount: number; due?: string };
  /** the tenancy rent is issued for */
  tenancyId?: string;
  /** an invoice being changed - scheduled rent before it is billed, or one nothing is paid on */
  editing?: BillingInvoice | undefined;
  onClose: () => void;
  onCreated: (type: "rental" | "charge") => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>(startAs);
  const [frequency, setFrequency] = useState(
    editing?.doc.payment_frequency || details.paymentFrequency || "bimonthly",
  );
  const first = preset
    ? {
        start: preset.start,
        end: preset.end,
        line: {
          label: `Rent ${short(preset.start)} – ${short(preset.end)}`,
          kind: "rent",
          amount: preset.amount,
          quantity: 1,
        },
      }
    : nextRent(details, lastRentEnd, frequency);
  const [periodStart, setPeriodStart] = useState(
    editing ? editing.periodStart.slice(0, 10) : startAs === "rental" ? first.start : "",
  );
  const [periodEnd, setPeriodEnd] = useState(
    editing ? editing.periodEnd.slice(0, 10) : startAs === "rental" ? first.end : "",
  );
  const [lines, setLines] = useState<Line[]>(
    editing ? editing.items : startAs === "rental" ? [first.line] : [firstLine(startAs)],
  );
  // a scheduled invoice's date is the day it is billed
  const [invoiceDate, setInvoiceDate] = useState(
    editing ? editing.billOn || editing.doc.invoice_date || today() : today(),
  );
  // rent falls due when its period starts; anything else in 15 days
  const [dueDate, setDueDate] = useState(
    editing
      ? editing.dueDate
      : startAs === "rental" && preset
        ? preset.due || preset.start
        : startAs === "rental" && first.start > today()
          ? first.start
          : shift(today(), { days: 15 }),
  );
  const [notes, setNotes] = useState(editing?.doc.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isRental = kind === "rental";
  const type = isRental ? "rental" : "charge";
  const total = lines.reduce((n, l) => n + Number(l.amount || 0) * qty(l.quantity), 0);

  function changeKind(next: string) {
    setKind(next);
    if (next === "rental") {
      const rent = nextRent(details, lastRentEnd, frequency);
      setPeriodStart(rent.start);
      setPeriodEnd(rent.end);
      setLines([rent.line]);
    } else {
      setLines([firstLine(next)]);
    }
  }

  function changeFrequency(next: string) {
    setFrequency(next);
    const rent = nextRent(details, lastRentEnd, next);
    setPeriodStart(rent.start);
    setPeriodEnd(rent.end);
    setLines([rent.line]);
  }

  const edit = (i: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const values = {
    full_name: details.fullName,
    email: details.email,
    phone: details.phone,
    university: details.university,
    nationality: details.nationality,
    residence_name: details.residenceName,
    room_name: details.roomName,
    occupancy: details.occupancy,
    tenancy_start: details.tenancyStart || null,
    tenancy_end: details.tenancyEnd || null,
    monthly_rent: details.monthlyRent,
  };

  function preview(): InvoiceDoc {
    const days = Math.max(
      0,
      Math.round((Date.parse(dueDate) - Date.parse(invoiceDate)) / 86_400_000),
    );
    return {
      ...values,
      // the preview states it the same way the issued invoice will. It is not in
      // `values` on purpose: that is the row written to invoices, which files a
      // resident by resident_id and has no resident_code column to write to
      ...(details.residentCode ? { resident_code: details.residentCode } : {}),
      number: editing ? editing.number || "Scheduled" : "INV-Draft",
      issued_at: new Date().toISOString(),
      invoice_date: invoiceDate,
      payment_terms: `NET${days}`,
      due_date: dueDate,
      payment_frequency: frequency,
      total,
      deposits_total: 0,
      notes,
      items: lines,
      kind: isRental ? "rental" : "charge",
      heading: isRental ? "Rental" : "Charges",
      ...(isRental && periodStart && periodEnd
        ? { period: `${short(periodStart)} – ${short(periodEnd)}` }
        : {}),
    };
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await updateResidentInvoice({
          data: {
            invoiceId: editing.id,
            invoiceDate,
            dueDate,
            periodStart,
            periodEnd,
            notes: notes.trim(),
            items: lines,
          },
        });
        toast.success(
          editing.scheduled ? "Scheduled invoice updated" : `Invoice ${editing.number} updated`,
        );
        await refreshMoney(queryClient);
        onCreated("rental");
        onClose();
        return;
      }
      const res = await createResidentInvoice({
        data: {
          residentId,
          type,
          invoiceDate,
          dueDate,
          paymentFrequency: frequency,
          notes: notes.trim(),
          values,
          items: lines,
          ...(isRental ? { periodStart, periodEnd } : {}),
          ...(isRental && tenancyId ? { tenancyId } : {}),
        },
      });
      toast.success(`Invoice ${res.number} generated`);
      await refreshMoney(queryClient);
      onCreated(type);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="admin-ui max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">
            {editing
              ? editing.scheduled
                ? "Edit scheduled invoice"
                : `Edit ${editing.number}`
              : "Generate invoice"}
          </DialogTitle>
          <DialogDescription>
            {[details.fullName, details.residenceName, details.roomName]
              .filter(Boolean)
              .join(" · ")}
            {editing?.scheduled
              ? ". Billed on its billing date. Once changed, it keeps your changes when the schedule changes."
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {editing ? null : (
            <>
              <Choice label="Invoice type" value={kind} onChange={changeKind} options={TYPES} />
              {isRental ? (
                <Choice
                  label="Payment frequency"
                  value={frequency}
                  onChange={changeFrequency}
                  options={FREQUENCIES}
                />
              ) : (
                <span className="hidden sm:block" aria-hidden />
              )}
            </>
          )}
          {/*
            A scheduled invoice's dates belong to the schedule, not to this
            form: they are worked out from the tenancy and the payment cycle,
            and typing over one here would put a single invoice out of step with
            every other period. They are shown, not edited - the schedule is
            where they change. A one-off charge still sets its own.
          */}
          <Text
            label={editing?.scheduled ? "Billing date" : "Issue date"}
            type="date"
            value={invoiceDate}
            onChange={setInvoiceDate}
            readOnly={Boolean(editing?.scheduled)}
            display={invoiceDate ? fmtDate(invoiceDate) : "—"}
          />
          <Text
            label="Due date"
            type="date"
            value={dueDate}
            onChange={setDueDate}
            readOnly={Boolean(editing?.scheduled)}
            display={dueDate ? fmtDate(dueDate) : "—"}
          />
          {isRental ? (
            <>
              <Text
                label="Period start"
                type="date"
                value={periodStart}
                onChange={setPeriodStart}
                readOnly={Boolean(editing?.scheduled)}
                display={periodStart ? fmtDate(periodStart) : "—"}
              />
              <Text
                label="Period end"
                type="date"
                value={periodEnd}
                onChange={setPeriodEnd}
                readOnly={Boolean(editing?.scheduled)}
                display={periodEnd ? fmtDate(periodEnd) : "—"}
              />
            </>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Items</p>
            {/*
              What a scheduled invoice charges is the period's rent, worked out
              from the schedule - so there is nothing to add to it or take off
              it here. A one-off charge is built line by line and keeps both.
            */}
            {editing?.scheduled ? null : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setLines((rows) => [
                    ...rows,
                    { label: "", kind: "charge", amount: 0, quantity: 1 },
                  ])
                }
              >
                <Plus className="size-4" /> Add line
              </Button>
            )}
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {/* the boxes below are unlabelled on their own - this names them, so
                nobody types a price into the quantity */}
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">Description</span>
              <span className="w-16 text-right">Qty</span>
              <span className="invisible text-xs" aria-hidden>
                ×
              </span>
              <span className="w-28 text-right">Amount (RM)</span>
              <span className="size-8 shrink-0" aria-hidden />
            </div>
            {lines.map((l, i) =>
              /*
               * Read as a line of the invoice rather than a row of boxes: a
               * scheduled period's rent is the schedule's, and editing it here
               * put one invoice out of step with every other period. Laid out
               * on the same columns as the header above, so the figures still
               * line up under Qty and Amount.
               */
              editing?.scheduled ? (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1">{l.label || "—"}</span>
                  <span className="w-16 text-right tabular-nums">{qty(l.quantity)}</span>
                  <span className="text-xs text-muted-foreground">×</span>
                  <span className="w-28 text-right tabular-nums">
                    {money(Number(l.amount) || 0)}
                  </span>
                  <span className="size-8 shrink-0" aria-hidden />
                </div>
              ) : (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <Input
                    value={l.label}
                    placeholder="Description"
                    className="h-8 flex-1"
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                  {/* how many, then the price of one - the line is worth the two
                      multiplied, which is what the total below adds up */}
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={l.quantity}
                    aria-label="Quantity"
                    className="h-8 w-16 text-right tabular-nums"
                    onChange={(e) => edit(i, { quantity: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="number"
                    value={l.amount}
                    aria-label="Price each"
                    className="h-8 w-28 text-right tabular-nums"
                    onChange={(e) => edit(i, { amount: Number(e.target.value) })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label="Remove line"
                    onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            )}
            <div className="flex items-center justify-between bg-muted px-3 py-2 text-sm font-medium">
              <span>Total</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </div>
        </div>

        {/* the description belongs to the schedule too, for the same reason */}
        {editing?.scheduled ? (
          notes.trim() ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Description on invoice</p>
              <p className="text-sm text-foreground">{notes}</p>
            </div>
          ) : null
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Description on invoice</p>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <PdfPreviewButton
            variant="outline"
            disabled={!lines.length}
            title="Invoice preview"
            fileName="Brachtia-invoice-preview.pdf"
            build={async () => (await import("@/lib/invoice-pdf")).invoicePdfUrl(preview())}
          >
            Preview
          </PdfPreviewButton>
          <Button disabled={saving || !lines.length} onClick={() => void save()}>
            {saving ? "Saving…" : editing ? "Save changes" : "Generate invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
