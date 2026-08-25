import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "./Logo";

import {
  addMonths,
  company,
  formatRM,
  lowestRent,
  stayQuote,
  termForRange,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomType,
} from "@/data/properties";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import SegmentedToggle from "./SegmentedToggle";

export type StayState = {
  occupancy: Occupancy;
  term: ContractTerm;
  rent: number | null;
  moveIn: string;
  moveOut: string;
  room: RoomType;
};

const ADD_ONS: { id: string; label: string; price: number; recurring: boolean; note: string }[] = [
  { id: "carpark", label: "Car park", price: 150, recurring: true, note: "per month" },
  {
    id: "starter",
    label: "Starter pack",
    price: 150,
    recurring: false,
    note: "bed sheet + comforter set · one-time",
  },
];

function defaultMoveIn(room: RoomType) {
  const today = new Date().toISOString().slice(0, 10);
  return room.availableFrom > today ? room.availableFrom : today;
}


export default function StayCalculator({
  property,
  room,
  rooms,
  selectedRoomId,
  onRoomChange,
  actions,
}: {
  property: Property;
  room?: RoomType;
  rooms?: RoomType[];
  selectedRoomId?: string | undefined;
  onRoomChange?: (id: string) => void;
  actions?: (state: StayState) => ReactNode;
}) {
  const options = rooms && rooms.length > 0 ? rooms : room ? [room] : [];
  const initial =
    room ??
    [...options].sort((a, b) => (lowestRent(a) ?? Infinity) - (lowestRent(b) ?? Infinity))[0]!;

  const [internalId, setInternalId] = useState(initial.id);
  const currentId = selectedRoomId ?? internalId;
  const selected = options.find((r) => r.id === currentId) ?? initial;
  const showSelector = !room && options.length > 1;

  const [occupancy, setOccupancy] = useState<Occupancy>(initial.occupancies[0] ?? "single");
  const [moveIn, setMoveIn] = useState(() => defaultMoveIn(initial));
  const [moveOut, setMoveOut] = useState(() => addMonths(defaultMoveIn(initial), 12));

  useEffect(() => {
    if (!selected.occupancies.includes(occupancy)) {
      setOccupancy(selected.occupancies[0] ?? "single");
    }
    const from = defaultMoveIn(selected);
    if (moveIn < from) {
      setMoveIn(from);
      setMoveOut(addMonths(from, 12));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  function selectRoom(id: string) {
    if (!options.some((r) => r.id === id)) return;
    setInternalId(id);
    onRoomChange?.(id);
  }

  const valid = moveOut > moveIn;
  const term: ContractTerm = valid ? termForRange(moveIn, moveOut) : "long";
  const rent =
    selected.rent[term][occupancy] ??
    selected.rent[term === "long" ? "short" : "long"][occupancy];
  const rateAvailable = selected.rent[term][occupancy] != null;

  const baseQuote = useMemo(
    () => (valid && rateAvailable && rent ? stayQuote(property, rent, term, moveIn, moveOut) : null),
    [property, rent, term, moveIn, moveOut, valid, rateAvailable],
  );

  const [addOns, setAddOns] = useState<string[]>([]);
  const toggleAddOn = (id: string) =>
    setAddOns((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  const quote = useMemo(() => {
    if (!baseQuote) return null;
    if (addOns.length === 0) return baseQuote;
    const extras = ADD_ONS.filter((a) => addOns.includes(a.id));
    const lines = [
      ...baseQuote.firstPayment,
      ...extras.map((a) => ({
        label: a.recurring ? `${a.label} (first month)` : a.label,
        amount: a.price,
        kind: "onetime" as const,
      })),
    ];
    const monthlyExtra = extras
      .filter((a) => a.recurring)
      .reduce((s, a) => s + a.price, 0);
    return {
      ...baseQuote,
      firstPayment: lines,
      totalUpfront: lines.reduce((s, l) => s + l.amount, 0),
      monthlyAfter: baseQuote.monthlyAfter + monthlyExtra,
    };
  }, [baseQuote, addOns]);

  const state: StayState = {
    occupancy,
    term,
    rent: rateAvailable ? rent : null,
    moveIn,
    moveOut,
    room: selected,
  };

  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!quote) return;
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      await downloadStayQuote({
        property,
        room: selected,
        occupancy,
        term,
        moveIn,
        moveOut,
        quote,
      });
    } finally {
      setDownloading(false);
    }
  }


  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-lift ring-1 ring-brand-soft">
      <div className="bg-gradient-to-br from-brand-deep to-brand px-5 py-4 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <Logo className="size-6 shrink-0" />
          <p className="text-base font-bold">See your move-in cost</p>
        </div>
        <p className="mt-1 text-xs text-primary-foreground/80">
          Pick a room and your dates — we'll show exactly what you pay upfront.
        </p>
      </div>

      <div className="p-5">
        {showSelector && (
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Room type
            </span>
            <Select value={currentId} onValueChange={selectRoom}>
              <SelectTrigger className="mt-1 h-12 rounded-2xl bg-muted/70 text-sm font-semibold focus:ring-2 focus:ring-brand/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.unitType.replace(" Apartment", "")} · {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selected.unitType.toLowerCase().includes("4-bedroom") && (
          <p className="mt-2.5 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              4-Bedroom apartments are available on 12-month stays only — short-term isn't offered
              here.
            </span>
          </p>
        )}


        {selected.occupancies.length > 1 && (
          <SegmentedToggle
            className="mt-3"
            value={occupancy}
            onChange={setOccupancy}
            options={selected.occupancies.map((o) => ({
              value: o,
              label: o === "single" ? "Single" : "Twin sharing",
            }))}
          />
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="rounded-2xl bg-muted/70 px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Move in
            </span>
            <input
              type="date"
              value={moveIn}
              min={selected.availableFrom}
              onChange={(e) => setMoveIn(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-foreground outline-none"
            />
          </label>
          <label className="rounded-2xl bg-muted/70 px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Move out
            </span>
            <input
              type="date"
              value={moveOut}
              min={moveIn}
              onChange={(e) => setMoveOut(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-foreground outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add-ons
          </span>
          {ADD_ONS.map((a) => {
            const on = addOns.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                title={a.note}
                onClick={() => toggleAddOn(a.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on
                    ? "border-brand bg-brand-tint text-brand-deep"
                    : "border-border/70 text-muted-foreground hover:border-brand/40"
                }`}
              >
                {on && <Check className="size-3.5 text-brand" />}
                {a.label} · {formatRM(a.price)}
                {a.recurring ? "/mo" : ""}
              </button>
            );
          })}
        </div>



        {!valid ? (
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
              <p className="mt-2 text-xs text-muted-foreground">
                {quote.term === "long" ? "12-month rate" : "Short-term rate"} ·{" "}
                {formatRM(quote.rent)}/mo · {quote.days} days
              </p>

              <div className="mt-4 rounded-2xl border border-border/70 bg-card">
                <div className="border-b border-border/70 px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Due before move-in
                  </p>
                </div>

                <table className="w-full px-4 text-sm">
                  <tbody>
                    {quote.firstPayment.map((l) => (
                      <tr key={l.label} className="align-top">
                        <td className="py-1.5 pl-4 pr-3 text-muted-foreground">
                          {l.label}
                          {l.kind === "refundable" && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
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
                  confirmed — offset against your first payment. No hidden fees.
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
                  <table className="w-full px-4 pb-3 text-sm">
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

        {actions && <div className="mt-4 space-y-2">{actions(state)}</div>}

        {quote && (
          <>
            <Button
              variant="outline"
              size="lg"
              className="mt-2 w-full"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="size-4" />
              {downloading ? "Preparing quote…" : "Download quote (PDF)"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Free to enquire — no payment yet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

