import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Text } from "@/components/admin/ops-ui";
import { Choice } from "@/components/admin/Choice";
import type { ResidentDetails } from "@/components/admin/ResidentInvoiceDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtDate, money } from "@/lib/ops-store";
import { SCHEDULES } from "@/lib/reference-data";
import {
  BILL_LEAD_DAYS,
  buildPeriods,
  dueFor,
  firstRentPeriod,
  shiftDate,
  type ScheduleTerms,
} from "@/lib/rental-schedule";
import {
  saveRentalSchedule,
  type AdvanceRent,
  type SavedSchedule,
  type TenancyTerms,
} from "@/lib/rental-schedule.functions";

/**
 * Setting a tenancy's rent schedule - or changing it.
 *
 * Admin confirms four things: the monthly rent, the payment schedule, and when
 * the tenancy starts and ends - filled in from the resident's own record, each
 * shown as text with a pencil until admin opens it. Everything else is worked
 * out: rent starts the day after the advance rent on the initial invoice runs
 * out, then goes a whole cycle at a time, the last one pro-rated when the
 * tenancy ends part-way. Each period is due on its last day and billed
 * BILL_LEAD_DAYS before. Saving lists every period as a scheduled invoice. The
 * saved schedule is a snapshot and never changes the resident's record. Rent
 * already billed never changes.
 */

/** A form field with a quiet line under it saying where the value came from. */
function Sourced({
  hint,
  onEdit,
  children,
}: {
  hint: string;
  onEdit?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="relative">
        {children}
        {onEdit ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute bottom-0 right-0 size-9 text-muted-foreground hover:text-brand-deep"
            aria-label="Edit"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RentalScheduleDialog({
  residentId,
  tenancy,
  schedule,
  details,
  lastIssuedEnd,
  advance,
  onClose,
}: {
  residentId: string;
  tenancy: TenancyTerms | null;
  schedule: SavedSchedule | null;
  /** the resident's own fields */
  details: ResidentDetails;
  /** the end of the last rent period already issued - periods up to it stay */
  lastIssuedEnd: string;
  /** the advance rent the initial invoice took - rent starts after it */
  advance: AdvanceRent;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // what the resident's record says - the confirmed schedule wins when editing
  const knownRent = schedule
    ? String(schedule.monthlyRent)
    : details.monthlyRent
      ? String(details.monthlyRent)
      : "";
  const knownSchedule =
    schedule?.frequency ??
    (SCHEDULES.some((s) => s.value === details.paymentFrequency) ? details.paymentFrequency : "");
  const knownStart = details.tenancyStart || tenancy?.start || "";
  const knownEnd = schedule?.tenancyEnd ?? (details.tenancyEnd || tenancy?.end || "");

  const [rent, setRent] = useState(knownRent);
  const [frequency, setFrequency] = useState(knownSchedule);
  const [tenancyStart, setTenancyStart] = useState(knownStart);
  const [tenancyEnd, setTenancyEnd] = useState(knownEnd);
  const [finalAmount, setFinalAmount] = useState(
    schedule?.finalAmount != null ? String(schedule.finalAmount) : "",
  );
  const [saving, setSaving] = useState(false);

  /*
   * The rent terms are the record's, not this dialog's. Rent, cycle and the
   * tenancy dates are what every period below is built from, so typing over
   * one here rebuilt the whole schedule from a figure the tenancy never
   * agreed to. They are shown, and changed where they are kept.
   *
   * What is still BLANK stays typable, because a schedule cannot be built
   * without all four - which is also why `missing` below reads these values
   * rather than these locks.
   */
  const locked = (known: string) => Boolean(known);
  const hint = (known: string, value: string, source: string, blank: string) =>
    !known
      ? blank
      : value !== known
        ? "Changed for this schedule only"
        : schedule
          ? "Confirmed"
          : source;

  // worked out, never typed: from the day the advance rent runs out
  const first =
    frequency && tenancyStart && tenancyEnd
      ? firstRentPeriod(
          tenancyStart,
          tenancyEnd,
          frequency,
          advance.amount,
          advance.rent || Number(rent) || 0,
        )
      : { start: "", end: "" };
  const terms: ScheduleTerms = {
    monthlyRent: Number(rent) || 0,
    frequency,
    firstPeriodStart: first.start,
    firstPeriodEnd: first.end,
    // the same day the engine works out, so the saved figure cannot disagree
    // with the dates listed beside it
    firstDueDate: dueFor(first.end),
    tenancyEnd,
    finalAmount: null,
  };
  const draft = buildPeriods(terms, lastIssuedEnd);
  // only when the tenancy does not end on a whole cycle
  const short = draft.find((p) => p.final && p.prorated !== null) ?? null;
  const finalValue = short ? (finalAmount !== "" ? Number(finalAmount) : short.prorated) : null;
  const periods = short
    ? buildPeriods({ ...terms, finalAmount: finalValue }, lastIssuedEnd)
    : draft;
  const total = periods.reduce((n, p) => n + p.amount, 0);

  const missing = [
    !(Number(rent) > 0) && "monthly rent",
    !frequency && "payment schedule",
    !tenancyStart && "tenancy start",
    !tenancyEnd && "tenancy end",
  ].filter(Boolean) as string[];
  const status = missing.length
    ? `Still needed: ${missing.join(", ")}`
    : !periods.length
      ? "Nothing to schedule"
      : `${periods.length} period${periods.length === 1 ? "" : "s"} ready to schedule`;
  const ready = missing.length === 0 && periods.length > 0;

  async function save() {
    setSaving(true);
    try {
      await saveRentalSchedule({
        data: {
          ...terms,
          finalAmount: finalValue,
          residentId,
          ...(tenancy ? { tenancyId: tenancy.id } : { tenancyStart }),
        },
      });
      toast.success("Payment schedule saved");
      await Promise.all(
        [["resident-rent"], ["resident-billing"], ["billing-ledger"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="admin-ui max-h-[92vh] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">
            {schedule ? "Edit payment schedule" : "Set payment schedule"}
          </DialogTitle>
          <DialogDescription>
            {schedule
              ? "Invoices already billed stay as they are. Scheduled ones are rebuilt from these terms, except any you edited."
              : `Confirm the rent terms. Every rent invoice is listed as Scheduled and billed ${BILL_LEAD_DAYS} days before its period starts.`}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rent terms
          </p>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <Sourced hint={hint(knownRent, rent, "From the stay", "Not recorded")}>
              <Text
                label="Monthly rent (RM)"
                type="number"
                value={rent}
                onChange={setRent}
                readOnly={locked(knownRent)}
                display={money(Number(rent) || 0)}
              />
            </Sourced>
            <Sourced
              hint={hint(knownSchedule, frequency, "From payor details", "Not set on the profile")}
            >
              <Choice
                label="Payment schedule"
                value={frequency}
                onChange={setFrequency}
                options={SCHEDULES}
                readOnly={locked(knownSchedule)}
              />
            </Sourced>
            <Sourced hint={hint(knownStart, tenancyStart, "From the stay", "Not recorded")}>
              <Text
                label="Tenancy start"
                type="date"
                value={tenancyStart}
                onChange={setTenancyStart}
                readOnly={locked(knownStart)}
                display={tenancyStart ? fmtDate(tenancyStart) : ""}
              />
            </Sourced>
            <Sourced hint={hint(knownEnd, tenancyEnd, "From the stay", "Not recorded")}>
              <Text
                label="Tenancy end"
                type="date"
                value={tenancyEnd}
                onChange={setTenancyEnd}
                readOnly={locked(knownEnd)}
                display={tenancyEnd ? fmtDate(tenancyEnd) : ""}
              />
            </Sourced>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Schedule
            </p>
            {periods.length ? (
              <p className="text-xs text-muted-foreground">
                {periods.length} period{periods.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium tabular-nums text-foreground">{money(total)}</span>
              </p>
            ) : null}
          </div>
          {first.start ? (
            <p className="text-[11px] text-muted-foreground">
              Automatic ·{" "}
              {advance.amount > 0
                ? `${money(advance.amount)} advance rent on the initial invoice covers the stay until ${fmtDate(
                    shiftDate(first.start, { days: -1 }),
                  )}, so rent starts ${fmtDate(first.start)}.`
                : `rent starts with the tenancy on ${fmtDate(first.start)}.`}{" "}
              Each period is due on the 5th of the month after it ends, and billed {BILL_LEAD_DAYS}
              days before it starts.
              {lastIssuedEnd ? ` Rent billed up to ${fmtDate(lastIssuedEnd)} stays as it is.` : ""}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border">
            {periods.length ? (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {periods.map((p) =>
                  p.final && p.prorated !== null ? (
                    // the tenancy ends part-way through a cycle: admin confirms what it costs
                    <li
                      key={p.start}
                      className="border-l-2 border-amber-400 bg-amber-50/50 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {fmtDate(p.start)} – {fmtDate(p.end)}
                          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Shorter final period
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">Due {fmtDate(p.due)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">RM</span>
                          <Input
                            type="number"
                            value={finalAmount}
                            placeholder={String(p.prorated)}
                            className="h-8 w-28 bg-background text-right tabular-nums"
                            onChange={(e) => setFinalAmount(e.target.value)}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Pro-rated by days: {money(p.prorated)}
                        </span>
                      </div>
                    </li>
                  ) : (
                    <li key={p.start} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex-1">
                        {fmtDate(p.start)} – {fmtDate(p.end)}
                      </span>
                      <span className="w-28 text-xs text-muted-foreground">
                        Due {fmtDate(p.due)}
                      </span>
                      <span className="w-24 text-right tabular-nums">{money(p.amount)}</span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {missing.length
                  ? "The periods appear here once the rent terms are filled in."
                  : frequency === "full"
                    ? "Full term is paid on the initial invoice - there is nothing to schedule."
                    : "No rent periods are left in this tenancy."}
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p
            className={`flex items-center gap-1.5 text-xs ${
              ready ? "text-emerald-700" : "text-muted-foreground"
            }`}
          >
            {ready ? <Check className="size-3.5" /> : null}
            {status}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving || !ready} onClick={() => void save()}>
              {saving ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
