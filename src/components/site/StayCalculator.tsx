import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import {
  addMonths,
  company,
  formatRM,
  stayQuote,
  termForRange,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomType,
} from "@/data/properties";
import SegmentedToggle from "./SegmentedToggle";

export type StayState = {
  occupancy: Occupancy;
  term: ContractTerm;
  rent: number | null;
  moveIn: string;
  moveOut: string;
};

function defaultMoveIn(room: RoomType) {
  const today = new Date().toISOString().slice(0, 10);
  return room.availableFrom > today ? room.availableFrom : today;
}

export default function StayCalculator({
  property,
  room,
  actions,
}: {
  property: Property;
  room: RoomType;
  actions?: (state: StayState) => ReactNode;
}) {
  const [occupancy, setOccupancy] = useState<Occupancy>(room.occupancies[0] ?? "single");
  const [moveIn, setMoveIn] = useState(() => defaultMoveIn(room));
  const [moveOut, setMoveOut] = useState(() => addMonths(defaultMoveIn(room), 12));

  const valid = moveOut > moveIn;
  const term: ContractTerm = valid ? termForRange(moveIn, moveOut) : "long";
  const rent = room.rent[term][occupancy] ?? room.rent[term === "long" ? "short" : "long"][occupancy];
  const rateAvailable = room.rent[term][occupancy] != null;

  const quote = useMemo(
    () => (valid && rateAvailable && rent ? stayQuote(property, rent, term, moveIn, moveOut) : null),
    [property, rent, term, moveIn, moveOut, valid, rateAvailable],
  );

  const state: StayState = { occupancy, term, rent: rateAvailable ? rent : null, moveIn, moveOut };

  return (
    <div className="rounded-3xl bg-card p-5 shadow-card ring-1 ring-border/60">
      <p className="text-sm font-bold text-brand-deep">Your stay</p>

      {room.occupancies.length > 1 && (
        <SegmentedToggle
          className="mt-3"
          value={occupancy}
          onChange={setOccupancy}
          options={room.occupancies.map((o) => ({
            value: o,
            label: o === "single" ? "Single" : "Twin sharing",
          }))}
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="rounded-2xl bg-muted/70 px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Move in
          </span>
          <input
            type="date"
            value={moveIn}
            min={room.availableFrom}
            onChange={(e) => setMoveIn(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-foreground outline-none"
          />
        </label>
        <label className="rounded-2xl bg-muted/70 px-3 py-2">
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
            <div className="mt-3 flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand-deep">
              <CalendarDays className="size-3.5 text-brand" />
              {quote.term === "long" ? "12-month rate" : "Short-term rate"} ·{" "}
              {formatRM(quote.rent)}/mo · {quote.days} days
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Rent schedule
              </p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {quote.schedule.map((s) => (
                    <tr key={s.label}>
                      <td className="py-1 pr-3 text-muted-foreground">
                        {s.label}
                        {!s.full && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-brand">
                            {s.days}/{s.daysInMonth} days
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right font-semibold text-foreground">
                        {formatRM(s.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="pt-2 font-semibold text-brand-deep">Total rent for stay</td>
                    <td className="pt-2 text-right font-bold text-brand-deep">
                      {formatRM(quote.totalStay)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl bg-brand-tint p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Due before move-in
              </p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {quote.firstPayment.map((l) => (
                    <tr key={l.label} className="align-top">
                      <td className="py-1 pr-3 text-muted-foreground">
                        {l.label}
                        {l.kind === "refundable" && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-brand">
                            refundable
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right font-semibold text-foreground">
                        {formatRM(l.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="pt-2 font-bold text-brand-deep">Total to pay now</td>
                    <td className="whitespace-nowrap pt-2 text-right text-lg font-extrabold text-brand">
                      {formatRM(quote.totalUpfront)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Then {formatRM(quote.monthlyAfter)}/month. Booking fee {company.bookingFee} is
                offset against your first payment.
              </p>
            </div>
          </>
        )
      )}

      {actions && <div className="mt-4 space-y-2">{actions(state)}</div>}
    </div>
  );
}
