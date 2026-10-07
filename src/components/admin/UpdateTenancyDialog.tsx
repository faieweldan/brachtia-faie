import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { costBreakdown, getProperty } from "@/data/properties";
import { allBeds, fmtDate, money, unitAccepts, unitGender, type BedRow, type Resident, type Unit } from "@/lib/ops-store";
import { GenderMark } from "@/components/admin/GenderMark";
import {
  MONEY_ITEMS,
  anyChange,
  bedOccupancy,
  changeFlags,
  compareMoney,
  documentNames,
  documentsFor,
  moneyOf,
  topUpTotal,
  type MoneyKey,
} from "@/lib/tenancy-change";
import { klToday } from "@/lib/kl-date";
import { rentForDays, shiftDate } from "@/lib/rental-schedule";
import { applyTenancyChange, cancelPendingChange, getTenancyChangeBasis } from "@/lib/tenancy-change.functions";

/**
 * Update Tenancy (Dani, 3 Oct 2026) - one button for a room, occupancy or date
 * change. Three steps, each showing what the resident has now; the money
 * compared item by item; the documents each change needs, made once. The
 * rules are in tenancy-change.ts.
 */
const OCCUPANCY_LABEL: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };

export type TenancyChangeResult = {
  /** the bed they move to - null when they stay where they are */
  newBed: BedRow | null;
  newEnd: string;
  newRent: number;
  /** the move is on a later day: the new bed is held until then, the current one kept */
  moveOn?: string;
};

export function UpdateTenancyDialog({
  open,
  onOpenChange,
  residentId,
  units,
  placed,
  tenancy,
  residents,
  gender,
  mergeValuesFor,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  residentId: string;
  units: Unit[];
  placed: BedRow | undefined;
  tenancy: { start: string; end: string; rent: number };
  /** everyone placed - who shares each unit, and its gender */
  residents: Resident[];
  /** the resident's gender: only units that take it are offered */
  gender: string;
  /** the documents' values, with the new bed, dates and rent */
  mergeValuesFor: (r: TenancyChangeResult) => Record<string, string>;
  /** moves the bed and updates the resident card once the server has saved it */
  onApplied: (r: TenancyChangeResult) => Promise<void>;
}) {
  const basis = useQuery({
    queryKey: ["tenancy-change", residentId],
    queryFn: () => getTenancyChangeBasis({ data: { residentId } }),
    enabled: open,
  });
  const oldOcc = placed ? bedOccupancy(placed.bed.label) : "single";
  const oldEnd = basis.data?.tenancy?.end || tenancy.end;
  const oldRent = basis.data?.rent || tenancy.rent;

  // 1 occupancy  2 room  3 dates - each starts at what they have now
  const [occ, setOcc] = useState(oldOcc);
  // the room the resident asks for - A, B, C or D - then only those are listed (Dani, 4 Oct 2026)
  const [letter, setLetter] = useState(placed?.room.letter ?? "");
  const [bedId, setBedId] = useState(placed?.bed.id ?? "");
  const [newEnd, setNewEnd] = useState("");
  const [effective, setEffective] = useState(klToday());
  const [rentTyped, setRentTyped] = useState<string | null>(null);
  const [nextTyped, setNextTyped] = useState<Partial<Record<MoneyKey, string>>>({});
  // the items waived, each on its own (Dani, 5 Oct 2026)
  const [waived, setWaived] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Schedule B's charges, filled in by what changes - each editable or removed (Dani, 7 Oct 2026)
  const [feeTyped, setFeeTyped] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  // each opening starts from what the resident has now - the page may not have had the bed when this first drew
  useEffect(() => {
    if (!open) return;
    setOcc(oldOcc);
    setLetter(placed?.room.letter ?? "");
    setBedId(placed?.bed.id ?? "");
    setNewEnd("");
    setEffective(klToday());
    setRentTyped(null);
    setNextTyped({});
    setWaived([]);
    setFeeTyped({});
    setRemoved([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placed?.bed.id]);

  const free = useMemo(
    () =>
      allBeds(units).filter(
        ({ unit, bed }) =>
          // vacant now, or someone else's whose tenancy ends before ours does - the move then waits for it (Dani, 7 Oct 2026)
          (bed.status === "vacant" || bed.id === placed?.bed.id || (!!bed.residentId && !!bed.tenancyEnd && bed.tenancyEnd.slice(0, 10) < (tenancy.end || "9999"))) &&
          bedOccupancy(bed.label) === occ &&
          // men and women never share a unit - the same rule as a booking's room list
          unitAccepts(unit, residents, gender),
      ),
    [units, occ, placed?.bed.id, residents, gender, tenancy.end],
  );
  const letters = [...new Set(free.map((b) => b.room.letter))].sort();
  const beds = free.filter((b) => b.room.letter === letter);
  const target = beds.find((b) => b.bed.id === bedId) ?? null;
  const end = newEnd || oldEnd;
  // the bed is someone else's until their tenancy ends: the move can only be after it
  const occupiedUntil = target && target.bed.id !== placed?.bed.id && target.bed.residentId ? (target.bed.tenancyEnd ?? "").slice(0, 10) : "";

  const flags = changeFlags({
    oldUnitId: placed?.unit.id ?? "",
    newUnitId: target?.unit.id ?? placed?.unit.id ?? "",
    oldRoomId: placed?.room.id ?? "",
    newRoomId: target?.room.id ?? placed?.room.id ?? "",
    oldOccupancy: oldOcc,
    newOccupancy: occ,
    oldEnd,
    newEnd: end,
  });
  const moved = flags.room || flags.occupancy;
  // a new room is priced at its own rent; a date change at the rate admin types (prevailing)
  // the room type's price - a bed's own rent is what its current occupant agreed to, not ours (Dani, 7 Oct 2026)
  const listRent = moved && target ? priceOf(target, placed?.bed.id ?? "") : oldRent;
  const newRent = rentTyped != null ? Number(rentTyped) || 0 : listRent;

  // the initial payment at the new rent, as the booking quote would price it
  const original = basis.data?.original;
  const priced = useMemo(() => {
    const property = getProperty(target?.unit.residenceSlug ?? placed?.unit.residenceSlug ?? "");
    if (!moved || !property || !newRent) return null;
    return moneyOf(costBreakdown(property, newRent, "long").lines);
  }, [moved, target, placed, newRent]);
  const next = original
    ? (Object.fromEntries(
        MONEY_ITEMS.map((i) => [i.key, nextTyped[i.key] != null ? Number(nextTyped[i.key]) || 0 : (priced?.[i.key] ?? original[i.key])]),
      ) as Record<MoneyKey, number>)
    : null;
  const rows = original && next ? compareMoney(original, next, { original: oldRent, next: newRent }) : [];
  const charges = [
    ...(moved ? [{ key: "change_fee", label: "Resident-requested room/unit change", amount: 100 }] : []),
    ...(flags.unit ? [{ key: "card_change", label: "Additional access card following room/unit change", amount: 20 }] : []),
  ]
    .filter((c) => !removed.includes(c.key))
    .map((c) => ({ ...c, amount: feeTyped[c.key] != null ? Number(feeTyped[c.key]) || 0 : c.amount }));
  const chargesTotal = charges.reduce((n, c) => n + c.amount, 0);
  const due = Math.round((topUpTotal(rows, waived) + chargesTotal) * 100) / 100;
  const waivedTotal = Math.round((topUpTotal(rows) - topUpTotal(rows, waived)) * 100) / 100;
  const plan = documentsFor(flags);
  const changed = anyChange(flags) || Math.abs(newRent - oldRent) > 0.005;
  const pending = basis.data?.pending ?? null;

  const action =
    flags.date === "renewal" ? "Initiate Renewal" : flags.date === "extension" ? "Initiate Extension" : "Confirm and proceed";

  async function confirm() {
    if (!basis.data?.tenancy) return;
    setBusy(true);
    try {
      const later = moved && !!target && effective > klToday();
      const result: TenancyChangeResult = { newBed: moved ? target : null, newEnd: end, newRent, ...(later ? { moveOn: effective } : {}) };
      const res = await applyTenancyChange({
        data: {
          residentId,
          tenancyId: basis.data.tenancy.id,
          change: {
            oldUnitId: placed?.unit.id ?? "",
            newUnitId: target?.unit.id ?? placed?.unit.id ?? "",
            oldRoomId: placed?.room.id ?? "",
            newRoomId: target?.room.id ?? placed?.room.id ?? "",
            oldOccupancy: oldOcc,
            newOccupancy: occ,
            oldEnd,
            newEnd: end,
          },
          newRent,
          next: next ?? {},
          waived,
          effectiveDate: moved ? effective : basis.data.tenancy.start,
          charges: charges.map((c) => ({ label: c.label, amount: c.amount })),
          mergeValues: mergeValuesFor(result),
          moveTo: later && target ? { bedId: target.bed.id, roomId: target.room.id, unitId: target.unit.id, occupancy: target.room.occupancy } : null,
        },
      });
      await onApplied(result);
      toast.success("Tenancy updated", {
        description: [
          "The new documents are on the Tenancy tab.",
          res.invoiceNumber ? `Invoice ${res.invoiceNumber} raised for the deposit difference.` : "",
          res.adjustment ? `${res.adjustment.number} raised: the rest of the billed month at the new rent.` : "",
          later ? `The bed moves on ${fmtDate(effective)}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tenancy");
    } finally {
      setBusy(false);
    }
  }

  // the move month split at the move date, shown as it will be invoiced (Dani, 6 Oct 2026)
  const later = moved && effective > klToday();
  const tooEarly = !!occupiedUntil && effective <= occupiedUntil;
  const rentMoves = moved && Math.abs(newRent - oldRent) > 0.005 && !!effective;
  const split = rentMoves ? moveMonthSplit(effective, oldRent, newRent) : null;
  const kind =
    flags.date === "renewal" ? "Renewal" : flags.date === "extension" ? (moved ? "Extension + room change" : "Extension") : moved ? "Room change" : "";
  const occLabel = (o: string) => OCCUPANCY_LABEL[o] ?? o;
  const bedLabel = (b: BedRow | null | undefined) => (b ? `${b.unit.unitNo} · Room ${b.room.letter} · ${b.bed.label}` : "—");

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="admin-ui flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-bold text-brand-deep">Update Tenancy</DialogTitle>
          <DialogDescription>Change only what the resident asked for. A shorter tenancy is a checkout (Early termination).</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          {/* the steps, top to bottom */}
          <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">
            {pending ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="min-w-0 flex-1">An earlier change is waiting for {pending.invoiceNumber || "its invoice"} to be paid.</span>
                <Button size="sm" variant="ghost" onClick={() => void cancelPendingChange({ data: { residentId } }).then(() => basis.refetch())}>
                  Forget it
                </Button>
              </div>
            ) : null}

            <Step n={1} title="Room" now={`${occLabel(oldOcc)} · ${bedLabel(placed)}`}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Segmented
                  label="Occupancy"
                  value={occ}
                  options={["single", "twin"].map((o) => ({ value: o, label: occLabel(o) }))}
                  onChange={(v) => {
                    setOcc(v);
                    setLetter(v === oldOcc ? (placed?.room.letter ?? "") : "");
                    setBedId(v === oldOcc ? (placed?.bed.id ?? "") : "");
                    setRentTyped(null);
                    setNextTyped({});
                  }}
                />
                {letters.length ? (
                  <Segmented
                    label="Room"
                    value={letter}
                    options={letters.map((l) => ({ value: l, label: l === "Unit" ? "Whole unit" : l }))}
                    onChange={(l) => {
                      setLetter(l);
                      setBedId(l === placed?.room.letter && occ === oldOcc ? (placed?.bed.id ?? "") : "");
                      setRentTyped(null);
                      setNextTyped({});
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">No free {occLabel(occ).toLowerCase()} beds.</p>
                )}
              </div>
              {/* the move date first, above the long room list, where it is seen (Rina and Dani, 7 Oct 2026) */}
              {moved ? (
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <label className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">Moves on</span>
                    <DateInput
                      min={occupiedUntil ? shiftDate(occupiedUntil, { days: 1 }) : klToday()}
                      value={effective}
                      onChange={(e) => setEffective(e.target.value)}
                      className="h-9 w-44"
                    />
                    {later ? <span className="text-xs text-muted-foreground">The current bed stays theirs until then.</span> : null}
                  </label>
                  {occupiedUntil ? (
                    <p className={`text-xs ${tooEarly ? "font-medium text-rose-700" : "text-muted-foreground"}`}>
                      {target?.bed.residentName || "Someone"} is in this bed until {fmtDate(occupiedUntil)}: the move can be from {fmtDate(shiftDate(occupiedUntil, { days: 1 }))}.
                    </p>
                  ) : null}
                  {split ? (
                    <div className="text-xs">
                      <p className="mb-1 font-medium text-foreground">{split.month} rent, split on the move date</p>
                      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums text-muted-foreground">
                        {split.before ? (
                          <>
                            <span>{split.before.range} · previous room ({split.before.days} days at {money(oldRent)})</span>
                            <span className="text-right">{money2(split.before.amount)}</span>
                          </>
                        ) : null}
                        <span>{split.after.range} · new room ({split.after.days} days at {money(newRent)})</span>
                        <span className="text-right">{money2(split.after.amount)}</span>
                        <span className="border-t border-border pt-0.5 font-medium text-foreground">{split.month}</span>
                        <span className="border-t border-border pt-0.5 text-right font-medium text-foreground">{money2(split.total)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {newRent < oldRent
                          ? "Cheaper: if this month is already billed, the difference comes off the next rent invoice."
                          : "If this month is already billed, the rest is invoiced now as a room change adjustment."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {letter ? (
                <RoomList
                  rows={beds}
                  residents={residents}
                  current={placed?.bed.id ?? ""}
                  picked={bedId}
                  onPick={(id) => {
                    setBedId(id);
                    setRentTyped(null);
                    setNextTyped({});
                    // someone else's bed: the move starts the day after their tenancy ends
                    const b = beds.find((x) => x.bed.id === id);
                    const until = b && b.bed.residentId && b.bed.id !== placed?.bed.id ? (b.bed.tenancyEnd ?? "").slice(0, 10) : "";
                    setEffective(until ? shiftDate(until, { days: 1 }) : klToday());
                  }}
                />
              ) : null}
              {flags.unit ? <p className="text-xs text-sky-800">Another unit - a new access card form is made.</p> : null}
            </Step>

            <Step n={2} title="End date" now={oldEnd ? fmtDate(oldEnd) : "—"}>
              <div className="flex flex-wrap items-center gap-3">
                <DateInput min={oldEnd} value={end} onChange={(e) => setNewEnd(e.target.value)} className="h-9 w-44" />
                {flags.date !== "none" ? (
                  <span className="text-xs text-muted-foreground">
                    {flags.date === "renewal" ? "6 months or more later: a renewal at today's rate, with a new agreement." : "Less than 6 months later: an extension on the same terms."}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Leave it to keep the same end date.</span>
                )}
              </div>
            </Step>

            <Step n={3} title="Rent, deposits & charges" now={`Rent ${money(oldRent)} a month`}>
              {changed && rows.length ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1fr_6rem_7rem_6rem_3.5rem] gap-2 bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Item</span>
                    <span className="text-right">Now</span>
                    <span className="text-right">New</span>
                    <span className="text-right">Difference</span>
                    <span className="text-center">Waive</span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.key} className="grid grid-cols-[1fr_6rem_7rem_6rem_3.5rem] items-center gap-2 border-t border-border px-3 py-1.5 text-sm">
                      <span>{r.label}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{money(r.original)}</span>
                      <Input
                        type="number"
                        value={r.key === "rent" ? (rentTyped ?? String(listRent)) : (nextTyped[r.key] ?? String(r.next))}
                        onChange={(e) => (r.key === "rent" ? setRentTyped(e.target.value) : setNextTyped((t) => ({ ...t, [r.key]: e.target.value })))}
                        className="h-8 text-right tabular-nums"
                      />
                      <span className={`text-right tabular-nums ${r.difference > 0 ? "font-medium text-rose-700" : r.difference < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {r.difference ? `${r.difference > 0 ? "+" : "−"} ${money(Math.abs(r.difference))}` : "–"}
                      </span>
                      <span className="flex justify-center">
                        {/* only an initial-payment item that went up can be waived - never the rent */}
                        {r.key !== "rent" && r.difference > 0 ? (
                          <input
                            type="checkbox"
                            aria-label={`Waive the ${r.label.toLowerCase()} difference`}
                            className="size-4 accent-brand"
                            checked={waived.includes(r.key)}
                            onChange={(e) => setWaived((w) => (e.target.checked ? [...w, r.key] : w.filter((k) => k !== r.key)))}
                          />
                        ) : null}
                      </span>
                    </div>
                  ))}
                  <p className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    The rent changes the scheduled rent invoices{basis.data?.hasSchedule ? "" : " - set up the rent terms on Payments first"}.
                    {rows.some((r) => r.key !== "rent" && r.difference < 0) ? " A lower deposit is not paid back now: what is held comes back at checkout." : ""}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing to compare until something changes.</p>
              )}
              {moved || removed.length ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Charges · Schedule B</div>
                  {charges.map((c) => (
                    <div key={c.key} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2 border-t border-border px-3 py-1.5 text-sm">
                      <span>{c.label}</span>
                      <Input
                        type="number"
                        aria-label={`${c.label} amount`}
                        value={feeTyped[c.key] ?? String(c.amount)}
                        onChange={(e) => setFeeTyped((t) => ({ ...t, [c.key]: e.target.value }))}
                        className="h-8 text-right tabular-nums"
                      />
                      <button
                        type="button"
                        title="Remove this charge"
                        aria-label={`Remove ${c.label}`}
                        onClick={() => setRemoved((r) => [...r, c.key])}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {removed.length ? (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      {removed.length} removed at Brachtia's discretion ·{" "}
                      <button type="button" className="underline underline-offset-2" onClick={() => setRemoved([])}>
                        put back
                      </button>
                    </p>
                  ) : null}
                  {!charges.length && !removed.length ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">None.</p> : null}
                </div>
              ) : null}
              {/* what is held now, line by line - so the Now column can be checked (Dani, 5 Oct 2026) */}
              {basis.data?.held.length ? (
                <details className="group rounded-lg border border-border text-sm">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
                    Deposits held · {money(basis.data.held.reduce((n, d) => n + d.amount, 0))} <span className="group-open:hidden">· show lines</span>
                  </summary>
                  {basis.data.held.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
                      <span className="min-w-0">
                        {d.label} <span className="text-xs text-muted-foreground">· {d.invoiceNumber}</span>
                      </span>
                      <span className="tabular-nums">{money(d.amount)}</span>
                    </div>
                  ))}
                </details>
              ) : null}
            </Step>
          </div>

          {/* the summary: now against new, always in view */}
          <aside className="min-h-0 overflow-y-auto border-t border-border bg-muted/30 px-5 py-5 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
            <p className="mt-1 text-base font-semibold text-brand-deep">{kind || "No change yet"}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Compare label="Room" from={bedLabel(placed)} to={moved ? bedLabel(target) : ""} />
              {moved ? <Compare label="Moves on" from="" to={fmtDate(effective)} /> : null}
              <Compare label="End date" from={oldEnd ? fmtDate(oldEnd) : "—"} to={end !== oldEnd ? fmtDate(end) : ""} />
              <Compare label="Rent a month" from={money(oldRent)} to={Math.abs(newRent - oldRent) > 0.005 ? money(newRent) : ""} />
            </dl>
            {changed ? (
              <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Invoiced now</p>
                  <p className="font-semibold tabular-nums">{due > 0 ? money(due) : "Nothing"}</p>
                  {waivedTotal > 0 ? <p className="text-xs text-muted-foreground">{money(waivedTotal)} waived</p> : null}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Documents made on confirm</p>
                  <ul className="mt-1 space-y-0.5">
                    {(documentNames(plan).length ? documentNames(plan) : ["None"]).map((d) => (
                      <li key={d} className="text-sm">{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          {moved && !target ? <span className="mr-auto text-xs text-amber-700">Choose the new bed.</span> : tooEarly ? <span className="mr-auto text-xs text-rose-700">Move date is before the bed is free.</span> : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || !changed || !basis.data?.tenancy || !!pending || (moved && !target) || tooEarly} onClick={() => void confirm()}>
            {busy ? "Saving…" : action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** a numbered step: its title, what the resident has now, then the controls */
function Step({ n, title, now, children }: { n: number; title: string; now: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-deep text-xs font-semibold text-primary-foreground">{n}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="min-w-0 truncate text-xs text-muted-foreground">Now: {now}</span>
      </div>
      <div className="space-y-3 pl-9">{children}</div>
    </section>
  );
}

/** a choice of a few, one tap each */
function Segmented({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-8 min-w-10 rounded-md px-3 text-sm font-medium transition-colors ${value === o.value ? "bg-brand-deep text-primary-foreground" : "text-foreground hover:bg-muted"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** a line of the summary: as it is, and what it becomes - only the new value when it changes */
function Compare({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        {to ? (
          <span className="flex flex-col">
            {from ? <span className="text-xs text-muted-foreground line-through">{from}</span> : null}
            <span className="font-medium text-foreground">{to}</span>
          </span>
        ) : (
          <span className="text-foreground">{from}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * What a bed costs the resident moving in: its room type's price. The rent kept
 * on a bed is the deal of whoever is (or was) in it - A-16-08 showed RM1,100,
 * its occupant's, against Room A's RM1,050 (Dani, 7 Oct 2026). The resident's
 * own bed keeps their rent.
 */
const priceOf = (b: BedRow, current: string) => (b.bed.id === current ? (b.bed.rent ?? b.room.rent) : b.room.rent) ?? 0;

const money2 = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** the move month, split on the move date - each part priced by its real days (Dani, 6 Oct 2026) */
function moveMonthSplit(from: string, oldRent: number, newRent: number) {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const iso = (day: number) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const mon = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const before = d > 1 ? { range: `1–${d - 1} ${mon}`, days: d - 1, amount: rentForDays(iso(1), iso(d - 1), oldRent) } : null;
  const after = { range: `${d}–${last} ${mon}`, days: last - d + 1, amount: rentForDays(iso(d), iso(last), newRent) };
  return { month: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), before, after, total: Math.round(((before?.amount ?? 0) + after.amount) * 100) / 100 };
}

/**
 * The rooms on offer, laid out as a booking's room list (Dani, 4 Oct 2026):
 * each unit once, with who is in it - the unit's gender mark, and on opening
 * it, every bed's resident and their tenancy dates.
 */
function RoomList({
  rows,
  residents,
  current,
  picked,
  onPick,
}: {
  rows: BedRow[];
  residents: Resident[];
  current: string;
  picked: string;
  onPick: (bedId: string) => void;
}) {
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  if (!rows.length) return <p className="text-xs text-muted-foreground">No free beds in this room type for this resident.</p>;
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
      <div className="sticky top-0 grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_auto] gap-2 border-b border-border bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Unit</span>
        <span>Room</span>
        <span>Bed</span>
        <span className="text-right">Rent</span>
        <span className="w-16" aria-hidden />
      </div>
      {rows.map((b, i) => {
        const firstOfUnit = i === 0 || rows[i - 1]!.unit.id !== b.unit.id;
        const lastOfUnit = i === rows.length - 1 || rows[i + 1]!.unit.id !== b.unit.id;
        const open = openUnit === b.unit.id;
        const g = unitGender(b.unit, residents);
        const mine = b.bed.id === picked;
        return (
          <div key={b.bed.id} className={firstOfUnit && i > 0 ? "border-t border-border" : ""}>
            <div className={`grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_auto] items-center gap-2 px-3 py-2 text-xs ${mine ? "bg-brand-tint" : ""}`}>
              {firstOfUnit ? (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenUnit(open ? null : b.unit.id)}
                    className="text-left font-semibold text-foreground underline-offset-2 hover:underline"
                    title="Who is in this unit"
                  >
                    {b.unit.unitNo}
                  </button>
                  <GenderMark gender={g || undefined} title={g ? `${g} unit` : "Empty unit"} />
                </span>
              ) : (
                <span aria-hidden />
              )}
              <span>Room {b.room.letter}</span>
              <span className="text-muted-foreground">
                {b.bed.label}
                {/* someone else's now - free the day after their tenancy ends */}
                {b.bed.residentId && b.bed.id !== current && b.bed.tenancyEnd ? (
                  <span className="block text-[11px] text-amber-700">free from {fmtDate(shiftDate(b.bed.tenancyEnd.slice(0, 10), { days: 1 }))}</span>
                ) : null}
              </span>
              <span className="text-right tabular-nums">{money(priceOf(b, current))}</span>
              <Button size="sm" variant={mine ? "default" : "ghost"} className="w-16" onClick={() => onPick(b.bed.id)}>
                {b.bed.id === current ? "Current" : mine ? "Chosen" : "Select"}
              </Button>
            </div>
            {open && lastOfUnit ? (
              <div className="space-y-1 border-t border-border bg-muted/30 px-3 py-3 text-xs">
                <p className="text-muted-foreground">
                  {[b.unit.unitType, b.unit.block && `Block ${b.unit.block}`, b.unit.floor && `Floor ${b.unit.floor}`, b.unit.gender]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {b.unit.rooms.map((rm) => (
                  <div key={rm.id} className="rounded-md border border-border bg-background p-2">
                    <p className="font-medium text-foreground">
                      Room {rm.letter} · {rm.occupancy === "twin" ? "Twin" : "Single"}
                    </p>
                    {rm.beds.map((bd) => (
                      <p key={bd.id} className="text-muted-foreground">
                        {bd.label}:{" "}
                        {bd.residentName || bd.holdFor
                          ? `${bd.residentName ?? bd.holdFor}${bd.university ? ` · ${bd.university}` : ""}${bd.nationality ? ` · ${bd.nationality}` : ""}${bd.tenancyStart || bd.tenancyEnd ? ` · ${fmtDate(bd.tenancyStart ?? "")} – ${fmtDate(bd.tenancyEnd ?? "")}` : ""}`
                          : "Vacant"}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
