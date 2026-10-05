import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const free = useMemo(
    () =>
      allBeds(units).filter(
        ({ unit, bed }) =>
          (bed.status === "vacant" || bed.id === placed?.bed.id) &&
          bedOccupancy(bed.label) === occ &&
          // men and women never share a unit - the same rule as a booking's room list
          unitAccepts(unit, residents, gender),
      ),
    [units, occ, placed?.bed.id, residents, gender],
  );
  const letters = [...new Set(free.map((b) => b.room.letter))].sort();
  const beds = free.filter((b) => b.room.letter === letter);
  const target = beds.find((b) => b.bed.id === bedId) ?? null;
  const end = newEnd || oldEnd;

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
  const listRent = moved && target ? (target.bed.rent ?? target.room.rent) : oldRent;
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
  const due = topUpTotal(rows, waived);
  const waivedTotal = Math.round((topUpTotal(rows) - due) * 100) / 100;
  const plan = documentsFor(flags);
  const changed = anyChange(flags) || Math.abs(newRent - oldRent) > 0.005;
  const pending = basis.data?.pending ?? null;

  const action =
    flags.date === "renewal" ? "Initiate Renewal" : flags.date === "extension" ? "Initiate Extension" : "Confirm and proceed";

  async function confirm() {
    if (!basis.data?.tenancy) return;
    setBusy(true);
    try {
      const result: TenancyChangeResult = { newBed: moved ? target : null, newEnd: end, newRent };
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
          mergeValues: mergeValuesFor(result),
        },
      });
      await onApplied(result);
      toast.success("Tenancy updated", {
        description:
          res.invoiceNumber
            ? `The new documents are on the Tenancy tab. Invoice ${res.invoiceNumber} raised for the difference.`
            : "The new documents are on the Tenancy tab.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tenancy");
    } finally {
      setBusy(false);
    }
  }

  const step = "space-y-1.5 rounded-xl border border-border p-3";
  const now = (v: string) => <p className="text-xs text-muted-foreground">Current: {v}</p>;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="admin-ui flex max-h-[90vh] max-w-2xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">Update Tenancy</DialogTitle>
          <DialogDescription>Change what is needed - the rest stays as it is. A shorter tenancy is a checkout (Early termination).</DialogDescription>
        </DialogHeader>

        <div className="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-4 [scrollbar-gutter:stable]">
          {pending ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="min-w-0 flex-1">
                An earlier change is waiting for {pending.invoiceNumber || "its invoice"} to be paid. Its documents are made then.
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void cancelPendingChange({ data: { residentId } }).then(() => basis.refetch())}
              >
                Forget it
              </Button>
            </div>
          ) : null}

          <div className={step}>
            <p className="text-sm font-semibold">1. Occupancy</p>
            {now(OCCUPANCY_LABEL[oldOcc] ?? oldOcc)}
            <Select
              value={occ}
              onValueChange={(v) => {
                setOcc(v);
                setLetter(v === oldOcc ? (placed?.room.letter ?? "") : "");
                setBedId(v === oldOcc ? (placed?.bed.id ?? "") : "");
                setRentTyped(null);
                setNextTyped({});
              }}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="admin-ui">
                {["single", "twin"].map((o) => (
                  <SelectItem key={o} value={o}>
                    {OCCUPANCY_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={step}>
            <p className="text-sm font-semibold">2. Room</p>
            {now(placed ? `${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}` : "no bed")}
            <div className="flex flex-wrap gap-1.5">
              {letters.length ? (
                letters.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setLetter(l);
                      setBedId(l === placed?.room.letter && occ === oldOcc ? (placed?.bed.id ?? "") : "");
                      setRentTyped(null);
                      setNextTyped({});
                    }}
                    className={`h-8 min-w-12 rounded-md border px-3 text-sm font-medium ${
                      letter === l ? "border-brand-deep bg-brand-deep text-primary-foreground" : "border-border hover:bg-muted"
                    }`}
                  >
                    {l === "Unit" ? "Whole unit" : `Room ${l}`}
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No free {OCCUPANCY_LABEL[occ]?.toLowerCase()} beds.</p>
              )}
            </div>
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
                }}
              />
            ) : null}
            {flags.unit ? <p className="text-xs text-sky-800">Another unit - a new access card form is made.</p> : null}
            {moved ? (
              <label className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                Moves on
                <DateInput value={effective} onChange={(e) => setEffective(e.target.value)} className="h-8 w-40" />
              </label>
            ) : null}
          </div>

          <div className={step}>
            <p className="text-sm font-semibold">3. Tenancy end date</p>
            {now(oldEnd ? fmtDate(oldEnd) : "—")}
            <DateInput min={oldEnd} value={end} onChange={(e) => setNewEnd(e.target.value)} className="h-9 w-48" />
            {flags.date !== "none" ? (
              <p className="text-xs font-medium text-brand-deep">
                {flags.date === "renewal"
                  ? "6 months or more later - a renewal at the prevailing rate: a new agreement."
                  : "Less than 6 months later - an extension on the same terms: a revised Schedule A."}
              </p>
            ) : null}
          </div>

          {changed && rows.length ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1fr_6rem_7rem_6rem_4rem] gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Original</span>
                <span className="text-right">New</span>
                <span className="text-right">Difference</span>
                <span className="text-center">Waive</span>
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[1fr_6rem_7rem_6rem_4rem] items-center gap-2 border-t border-border px-3 py-1.5 text-sm">
                  <span>{r.label}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{money(r.original)}</span>
                  <Input
                    type="number"
                    value={r.key === "rent" ? (rentTyped ?? String(listRent)) : (nextTyped[r.key] ?? String(r.next))}
                    onChange={(e) =>
                      r.key === "rent" ? setRentTyped(e.target.value) : setNextTyped((t) => ({ ...t, [r.key]: e.target.value }))
                    }
                    className="h-8 text-right tabular-nums"
                  />
                  <span className={`text-right tabular-nums ${r.difference > 0 ? "font-medium text-red-700" : r.difference < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {r.difference ? `${r.difference > 0 ? "+" : "-"}${money(Math.abs(r.difference))}` : "-"}
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
              <div className="space-y-1 border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p>The monthly rent changes the scheduled rent invoices{basis.data?.hasSchedule ? "" : " - set up the rent terms on Payments first"}.</p>
                {rows.some((r) => r.key !== "rent" && r.difference < 0) ? (
                  <p>A lower amount is not paid back now: what is held comes back at checkout.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {changed && (due > 0 || waivedTotal > 0) ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              {due > 0 ? (
                <p>
                  Invoiced now: <b>{money(due)}</b>{" "}
                  <span className="text-xs text-muted-foreground">- an initial-payment difference invoice</span>
                </p>
              ) : null}
              {waivedTotal > 0 ? (
                <p>
                  Waived: <b>{money(waivedTotal)}</b> <span className="text-xs text-muted-foreground">- recorded with the change</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {changed ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              <p className="font-semibold">Documents - made when you confirm</p>
              <p>{documentNames(plan).join(" · ") || "None"}</p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !changed || !basis.data?.tenancy || !!pending || (moved && !target)}
            onClick={() => void confirm()}
          >
            {busy ? "Saving…" : action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
              <span className="text-muted-foreground">{b.bed.label}</span>
              <span className="text-right tabular-nums">{money(b.bed.rent ?? b.room.rent)}</span>
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
