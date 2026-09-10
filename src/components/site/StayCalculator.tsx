import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Info, MousePointerClick } from "lucide-react";
import Logo from "./Logo";

import {
  addonsFor,
  company,
  formatDate,
  formatRM,
  paymentTermLabel,
  stayQuote,
  termForRange,
  type ContractTerm,
  type Occupancy,
  type PaymentTerm,
  type Addon,
  type Property,
  type RoomType,
  type StayQuote,
} from "@/data/properties";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SegmentedToggle from "./SegmentedToggle";

export type StayState = {
  occupancy: Occupancy | undefined;
  term: ContractTerm;
  rent: number | null;
  moveIn: string;
  moveOut: string;
  room: RoomType | undefined;
  quote: StayQuote | null;
  paymentTerm: PaymentTerm;
};


function durationLabel(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (b < a) return "—";
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  const anchor = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + months, a.getUTCDate()));
  if (anchor > b) {
    months -= 1;
    anchor.setUTCMonth(anchor.getUTCMonth() - 1);
  }
  const days = Math.round((b.getTime() - anchor.getTime()) / 86400000);
  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  return parts.join(" ") || "0 days";
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-sm font-bold text-brand-deep">{value}</span>
    </div>
  );
}

export default function StayCalculator({
  property,
  rooms,
  selectedRoomId,
  occupancy: occupancyProp,
  moveIn,
  moveOut,
  actions,
}: {
  property: Property;
  rooms: RoomType[];
  selectedRoomId?: string | undefined;
  occupancy?: Occupancy | undefined;
  moveIn: string;
  moveOut: string;
  actions?: (state: StayState) => ReactNode;
}) {
  const selected = rooms.find((r) => r.id === selectedRoomId);
  const occupancy: Occupancy =
    occupancyProp && selected?.occupancies.includes(occupancyProp)
      ? occupancyProp
      : (selected?.occupancies[0] ?? "single");

  const datesFilled = !!moveIn && !!moveOut;
  const valid = !!selected && datesFilled && moveOut > moveIn;
  const term: ContractTerm = valid ? termForRange(moveIn, moveOut) : "long";

  const rent = selected ? selected.rent[term][occupancy] : null;
  const rateAvailable = rent != null;

  const offeredTerms = useMemo<PaymentTerm[]>(() => {
    const all: PaymentTerm[] = ["bimonthly", "quarterly", "full"];
    const offered = all.filter((t) => (property.paymentTerms ?? all).includes(t));
    return offered.length > 0 ? offered : ["full"];
  }, [property.paymentTerms]);

  const [paymentTermRaw, setPaymentTerm] = useState<PaymentTerm>("bimonthly");
  const paymentTerm: PaymentTerm = offeredTerms.includes(paymentTermRaw)
    ? paymentTermRaw
    : offeredTerms[0]!;
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const effectiveTerm: PaymentTerm = term === "short" ? "full" : paymentTerm;

  const addonOptions = useMemo<Addon[]>(
    () => (selected ? addonsFor(property, occupancy) : []),
    [property, occupancy, selected],
  );
  const chosenAddons = useMemo(
    () => addonOptions.filter((a) => addonIds.includes(a.id)),
    [addonOptions, addonIds],
  );
  const toggleAddon = (addonId: string) =>
    setAddonIds((ids) => (ids.includes(addonId) ? ids.filter((x) => x !== addonId) : [...ids, addonId]));

  const quote = useMemo(
    () =>
      valid && rent
        ? stayQuote(property, rent, term, moveIn, moveOut, effectiveTerm, chosenAddons)
        : null,
    [property, rent, term, moveIn, moveOut, valid, effectiveTerm, chosenAddons],
  );

  const state: StayState = {
    occupancy: selected ? occupancy : undefined,
    term,
    rent: rateAvailable ? rent : null,
    moveIn,
    moveOut,
    room: selected,
    quote,
    paymentTerm: effectiveTerm,
  };


  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-lift ring-1 ring-brand-soft">
      <div className="bg-gradient-to-br from-brand-deep to-brand px-5 py-4 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <Logo className="size-6 shrink-0" />
          <p className="text-base font-bold">See your move-in cost</p>
        </div>
        <p className="mt-1 text-xs text-primary-foreground/80">
          Pick a room and rate above — we'll show exactly what you pay upfront.
        </p>
      </div>

      <div className="p-5">
        {!selected ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
            <MousePointerClick className="mx-auto size-6 text-brand" />
            <p className="mt-2 text-sm font-semibold text-brand-deep">
              Pick a room and rate above to see your move-in cost.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap a single or twin-sharing price in the table.
            </p>
          </div>
        ) : (
          <>
            {/* Static context */}
            <div className="rounded-2xl bg-muted/50 px-4 py-2">
              <SummaryRow
                label="Unit type"
                value={`${selected.unitType.replace(" Apartment", "")} · ${selected.name}`}
              />
              <SummaryRow
                label="Occupancy"
                value={occupancy === "single" ? "Single" : "Twin sharing"}
              />
              <div className="my-1 border-t border-border/60" />
              <SummaryRow label="Move in" value={moveIn ? formatDate(moveIn) : "—"} />
              <SummaryRow label="Move out" value={moveOut ? formatDate(moveOut) : "—"} />
              <SummaryRow
                label="Duration"
                value={datesFilled ? durationLabel(moveIn, moveOut) : "—"}
              />
            </div>

            {!datesFilled ? (
              <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                Add your move-in and move-out dates above to calculate your costs.
              </p>
            ) : !valid ? (
              <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Move-out must be after move-in.
              </p>

            ) : !rateAvailable ? (
              <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                No published rate for this combination — enquire and we'll quote you.
              </p>
            ) : (
              quote && (
                <>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Monthly rental
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {term === "long" ? "12-month rate" : "Short-term rate"} · {quote.days} days
                        {quote.monthlyAfter > quote.rent && (
                          <> · incl. {formatRM(quote.monthlyAfter - quote.rent)} add-ons</>
                        )}
                      </p>
                    </div>
                    <p className="text-2xl font-extrabold tabular-nums text-brand-deep">
                      {formatRM(quote.monthlyAfter)}
                      <span className="text-xs font-semibold text-muted-foreground">/mo</span>
                    </p>

                  </div>

                  {/* Payment terms */}
                  <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Payment terms
                    </p>
                    <SegmentedToggle
                      size="sm"
                      value={effectiveTerm}
                      onChange={setPaymentTerm}
                      options={offeredTerms.map((t) => ({
                        value: t,
                        label: paymentTermLabel[t],
                        disabled: term === "short" && t !== "full",
                      }))}
                    />
                    {term === "short" && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Short-term stays are paid in full upfront — bi-monthly may be allowed in
                        special cases.
                      </p>
                    )}
                  </div>

                  {/* Optional add-ons */}
                  {addonOptions.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-card p-3.5">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Optional add-ons
                      </p>
                      <div className="space-y-2">
                        {addonOptions.map((a) => {
                          const on = addonIds.includes(a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleAddon(a.id)}
                              className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                                on
                                  ? "border-brand bg-brand-tint"
                                  : "border-border/70 hover:border-brand/50"
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="block text-sm font-bold text-brand-deep">
                                  {a.label}
                                </span>
                                {a.items.length > 0 && (
                                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                    {a.items.join(" · ")}
                                  </span>
                                )}
                              </div>
                              <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-brand">
                                {on && <Check className="size-3.5" />}
                                {formatRM(a.price)}
                                {a.chargeType === "monthly" && (
                                  <span className="text-[10px] font-semibold text-muted-foreground">
                                    /mo
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Due before move-in */}
                  <div className="mt-4 rounded-2xl border border-border/70 bg-card">
                    <div className="border-b border-border/70 px-4 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Due before move-in
                      </p>
                    </div>

                    <table className="w-full text-sm">
                      <tbody>
                        {quote.firstPayment.map((l) => (
                          <tr key={l.label} className="align-top">
                            <td className="py-1.5 pl-4 pr-3 text-muted-foreground">
                              {l.label}
                              {l.kind === "refundable" && (
                                <span className="ml-1.5 rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                                  refundable
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-4 text-right font-medium tabular-nums text-foreground">
                              {formatRM(l.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-1.5 flex items-end justify-between gap-3 border-t border-border/70 px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-brand-deep">Your first-time payment</p>
                        <p className="text-xs text-muted-foreground">
                          Then {formatRM(quote.monthlyAfter)}/month
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-2xl font-extrabold tabular-nums text-brand">
                        {formatRM(quote.totalUpfront)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2.5 flex gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-brand" />
                    <span>
                      A booking fee of {company.bookingFee} secures your room once availability is
                      confirmed — offset against your first payment. No hidden fees.{" "}
                      {property.terms.length > 0 && (
                        <Dialog>
                          <DialogTrigger className="font-semibold text-brand underline underline-offset-2 hover:text-brand-deep">
                            Terms &amp; conditions
                          </DialogTrigger>
                          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Terms &amp; conditions</DialogTitle>
                            </DialogHeader>
                            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                              {property.terms.map((t) => (
                                <li key={t}>{t}</li>
                              ))}
                            </ol>
                          </DialogContent>
                        </Dialog>
                      )}
                    </span>
                  </p>

                  <Collapsible className="mt-3 rounded-2xl bg-muted/60">
                    <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <span className="text-sm font-semibold text-brand-deep">
                        Monthly rent breakdown
                      </span>
                      <span className="flex items-center gap-2 text-sm font-bold tabular-nums text-brand-deep">
                        {formatRM(quote.totalStay)}
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <table className="w-full pb-3 text-sm">
                        <tbody>
                          {quote.schedule.map((s) => (
                            <tr key={s.label}>
                              <td className="py-1 pl-4 pr-3 text-muted-foreground">
                                {s.label}
                                {!s.full && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide text-brand">
                                    {s.days}/{s.daysInMonth} days
                                  </span>
                                )}
                              </td>
                              <td className="py-1 pr-4 text-right font-semibold tabular-nums text-foreground">
                                {formatRM(s.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td className="pb-3 pl-4 pr-3 pt-2 font-semibold text-brand-deep">
                              Total rent for stay
                            </td>
                            <td className="pb-3 pr-4 pt-2 text-right font-bold tabular-nums text-brand-deep">
                              {formatRM(quote.totalStay)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )
            )}

          </>
        )}

        {actions && <div className="mt-4 space-y-2">{actions(state)}</div>}
      </div>

    </div>
  );
}
