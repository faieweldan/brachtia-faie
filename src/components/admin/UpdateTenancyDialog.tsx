import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { costBreakdown, getProperty } from "@/data/properties";
import { allBeds, fmtDate, money, unitAccepts, unitGender, type BedRow, type Resident, type Unit } from "@/lib/ops-store";
import { GenderMark } from "@/components/admin/GenderMark";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { bedRent, type SiteRoomType } from "@/lib/room-types";
import {
  DEPOSIT_KEYS,
  anyChange,
  bedOccupancy,
  changeFlags,
  depositsOf,
  documentNames,
  documentsFor,
  eventDeposits,
  eventInvoice,
  eventName,
  fixedCharges,
  ipBillOn,
  isMove,
  moneyOf,
  nextDay,
  planEvents,
  type DepositKey,
  type Deposits,
} from "@/lib/tenancy-change";
import { klToday } from "@/lib/kl-date";
import { rentForDays, shiftDate } from "@/lib/rental-schedule";
import { applyTenancyChange, getTenancyChangeBasis } from "@/lib/tenancy-change.functions";

/**
 * Update Tenancy (Dani, 3 Oct 2026; events since 7 Oct) - one window for a
 * room, occupancy or date change. Admin picks what the resident asked for;
 * the request becomes one or two EVENTS, each with its own date, rent,
 * deposits, Initial Payment (IP) and documents. The rules are in
 * tenancy-change.ts.
 */
const OCCUPANCY_LABEL: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };

export type TenancyChangeResult = {
  /** the bed they move to - null when they stay where they are */
  newBed: BedRow | null;
  newEnd: string;
  /** a renewal's new agreement starts on its own day, not the old start */
  newStart?: string;
  /** the rent in force today */
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
  invoiceFor,
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
  /** the documents' values, with the bed, end date and rent of one event */
  mergeValuesFor: (r: TenancyChangeResult) => Record<string, string>;
  /** moves the bed and updates the resident card once the server has saved it */
  onApplied: (r: TenancyChangeResult) => Promise<void>;
  /** who the invoice is for, for its preview */
  invoiceFor?: { fullName: string; email: string; phone: string; residentCode: string; university: string; nationality: string };
}) {
  const basis = useQuery({
    queryKey: ["tenancy-change", residentId],
    queryFn: () => getTenancyChangeBasis({ data: { residentId } }),
    enabled: open,
  });
  const oldOcc = placed ? bedOccupancy(placed.bed.label) : "single";
  const oldEnd = basis.data?.tenancy?.end || tenancy.end;
  const oldRent = basis.data?.rent || tenancy.rent;
  const roomTypes = (basis.data?.roomTypes ?? []) as SiteRoomType[];
  const today = klToday();

  const [occ, setOcc] = useState(oldOcc);
  // the room the resident asks for - A, B, C or D - then only those are listed (Dani, 4 Oct 2026)
  const [letter, setLetter] = useState(placed?.room.letter ?? "");
  const [bedId, setBedId] = useState(placed?.bed.id ?? "");
  const [newEnd, setNewEnd] = useState("");
  const [moveOn, setMoveOn] = useState(today);
  // admin's own figures, per event: the rent, a required deposit, a charge - and what is waived or removed
  const [rentTyped, setRentTyped] = useState<Record<number, string>>({});
  const [requiredTyped, setRequiredTyped] = useState<Record<string, string>>({});
  const [waived, setWaived] = useState<string[]>([]);
  const [feeTyped, setFeeTyped] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const resetMoney = () => {
    setRentTyped({});
    setRequiredTyped({});
    setWaived([]);
  };
  // each opening starts from what the resident has now - the page may not have had the bed when this first drew
  useEffect(() => {
    if (!open) return;
    setOcc(oldOcc);
    setLetter(placed?.room.letter ?? "");
    setBedId(placed?.bed.id ?? "");
    setNewEnd("");
    setMoveOn(klToday());
    resetMoney();
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
  const moved = isMove(flags);
  const websiteRate = (b: BedRow) => bedRent(roomTypes, b.unit, b.room, {}, false, "long");

  /*
   * The events, each priced from the state the one before leaves (agreed 7 Oct
   * 2026): the rent, the deposits it requires, the IP and its billing day.
   */
  const events = useMemo(() => {
    const held0 = basis.data?.held ?? null;
    if (!held0) return [];
    let rent = oldRent;
    let held: Deposits = held0;
    let bed: BedRow | null = placed ?? null;
    return planEvents(flags, moveOn, oldEnd).map((p, i) => {
      const movesHere = isMove(p.flags);
      if (movesHere && target) bed = target;
      // a new room: its Website rate; a renewal: the Website rate of the room then; an extension: the rent it has
      const proposed = movesHere || p.flags.date === "renewal" ? (bed ? websiteRate(bed) : rent) : rent;
      const r = rentTyped[i] != null ? Number(rentTyped[i]) || 0 : proposed;
      // the required deposit follows the rent, never the length of the tenancy
      const property = getProperty(bed?.unit.residenceSlug ?? "");
      const byFormula = property && r && Math.abs(r - rent) > 0.005 ? depositsOf(moneyOf(costBreakdown(property, r, "long").lines)) : held;
      const required = Object.fromEntries(
        DEPOSIT_KEYS.map((k) => [k, k === "card_deposit" ? held.card_deposit : requiredTyped[`${i}:${k}`] != null ? Number(requiredTyped[`${i}:${k}`]) || 0 : byFormula[k]]),
      ) as Deposits;
      const d = eventDeposits(held, required, waived.filter((w) => w.startsWith(`${i}:`)).map((w) => w.slice(2)));
      const charges = fixedCharges(p.flags)
        .filter((c) => !removed.includes(`${i}:${c.key}`))
        .map((c) => ({ ...c, amount: feeTyped[`${i}:${c.key}`] != null ? Number(feeTyped[`${i}:${c.key}`]) || 0 : c.amount }));
      const ip = eventInvoice(d.ipLines, charges, d.credit);
      const ev = {
        i,
        date: p.date,
        flags: p.flags,
        name: eventName(p.flags),
        rentBefore: rent,
        rent: r,
        proposed,
        bed,
        // a room event before a renewal ends with the tenancy as it was
        periodEnd: p.flags.date !== "none" ? end : oldEnd,
        deposits: d,
        charges,
        allCharges: fixedCharges(p.flags),
        ip,
        billOn: ip.total > 0 ? ipBillOn(p.date, today) : "",
        docs: documentNames(documentsFor(p.flags)),
      };
      rent = r;
      held = d.heldAfter;
      return ev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis.data, flags.room, flags.unit, flags.occupancy, flags.date, moveOn, oldEnd, end, target, placed, oldRent, rentTyped, requiredTyped, waived, removed, feeTyped, today]);

  const changed = anyChange(flags);
  const pending = basis.data?.pending ?? [];
  const pendingMove = basis.data?.pendingMove ?? null;
  const tooEarly = !!occupiedUntil && moveOn <= occupiedUntil;
  const moveAfterEnd = moved && moveOn > end;
  const lastRent = events.at(-1)?.rent ?? oldRent;
  const rentToday = events.filter((e) => e.date <= today).at(-1)?.rent ?? oldRent;
  const blocked = busy || !changed || !basis.data?.tenancy || !!pending.length || !!pendingMove || (moved && !target) || tooEarly || moveAfterEnd;
  const action = flags.date === "renewal" ? "Initiate Renewal" : flags.date === "extension" ? "Initiate Extension" : "Confirm and proceed";

  async function confirm() {
    if (!basis.data?.tenancy) return;
    setBusy(true);
    try {
      const later = moved && !!target && moveOn > today;
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
          moveOn: moved ? moveOn : "",
          moveTo: later && target ? { bedId: target.bed.id, roomId: target.room.id, unitId: target.unit.id, occupancy: target.room.occupancy } : null,
          events: events.map((e) => ({
            date: e.date,
            rent: e.rent,
            required: { security: e.deposits.rows[0]!.required, utility: e.deposits.rows[1]!.required, card_deposit: e.deposits.rows[2]!.required },
            waived: waived.filter((w) => w.startsWith(`${e.i}:`)).map((w) => w.slice(2)),
            charges: e.charges.map((c) => ({ label: c.label, amount: c.amount })),
            mergeValues: mergeValuesFor({
              newBed: e.bed && e.bed.bed.id !== placed?.bed.id ? e.bed : null,
              newEnd: e.periodEnd,
              newRent: e.rent,
              ...(e.flags.date === "renewal" ? { newStart: e.date } : {}),
            }),
            periodEnd: e.periodEnd,
            roomName: e.bed ? `${e.bed.unit.unitNo} · Room ${e.bed.room.letter}` : "",
            occupancy: OCCUPANCY_LABEL[e.bed ? bedOccupancy(e.bed.bed.label) : occ] ?? "",
          })),
        },
      });
      await onApplied({ newBed: moved ? target : null, newEnd: end, newRent: rentToday, ...(later ? { moveOn } : {}) });
      toast.success("Tenancy updated", {
        description: res.events
          .map((e) =>
            [
              `${e.name}, ${fmtDate(e.date)}:`,
              e.total > 0 ? (e.invoiceNumber ? `IP ${e.invoiceNumber} billed.` : `IP scheduled, billed ${fmtDate(e.billOn)}.`) : "no IP.",
              e.adjustment ? `RP adjustment ${e.adjustment}.` : "",
              e.credit ? `${money2(e.credit)} account credit.` : "",
              e.documents === "made" ? "Documents made." : "Documents once the IP is settled.",
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join("\n"),
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tenancy");
    } finally {
      setBusy(false);
    }
  }

  const occLabel = (o: string) => OCCUPANCY_LABEL[o] ?? o;
  const bedLabel = (b: BedRow | null | undefined) => (b ? `${b.unit.unitNo} · Room ${b.room.letter} · ${b.bed.label}` : "—");
  const moveEvent = events.find((e) => isMove(e.flags));
  const split = moveEvent && Math.abs(moveEvent.rent - moveEvent.rentBefore) > 0.005 ? moveMonthSplit(moveEvent.date, moveEvent.rentBefore, moveEvent.rent) : null;
  const dateEvent = events.find((e) => e.flags.date !== "none");
  const kind = events.map((e) => e.name).join(", then ");

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="admin-ui flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-bold text-brand-deep">Update Tenancy</DialogTitle>
          <DialogDescription>Change only what the resident asked for. A shorter tenancy is a checkout (Early termination).</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">
            {pending.length || pendingMove ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {pending.length
                  ? `An earlier change is in progress: ${pending.map((p) => `${p.name}, ${fmtDate(p.date)}${p.invoiceNumber ? ` (${p.invoiceNumber})` : ""}`).join("; ")}. Its documents are made once its IP is settled.`
                  : `An earlier move is due on ${fmtDate(pendingMove!.from ?? "")}.`}{" "}
                A new change can be made after it.
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
                    resetMoney();
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
                      resetMoney();
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
                    <span className="font-medium">Effective date</span>
                    <DateInput
                      min={occupiedUntil ? shiftDate(occupiedUntil, { days: 1 }) : today}
                      max={end}
                      value={moveOn}
                      onChange={(e) => setMoveOn(e.target.value)}
                      className="h-9 w-44"
                    />
                    {moveOn > today ? <span className="text-xs text-muted-foreground">The current bed stays theirs until then.</span> : null}
                  </label>
                  {occupiedUntil ? (
                    <p className={`text-xs ${tooEarly ? "font-medium text-rose-700" : "text-muted-foreground"}`}>
                      {target?.bed.residentName || "Someone"} is in this bed until {fmtDate(occupiedUntil)}: the move can be from {fmtDate(shiftDate(occupiedUntil, { days: 1 }))}.
                    </p>
                  ) : null}
                  {split ? (
                    <div className="text-xs">
                      <p className="mb-1 font-medium text-foreground">{split.month} rental, pro-rated by day</p>
                      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums text-muted-foreground">
                        {split.before ? (
                          <>
                            <span>{split.before.range} · previous room ({split.before.days} days at {money(moveEvent!.rentBefore)})</span>
                            <span className="text-right">{money2(split.before.amount)}</span>
                          </>
                        ) : null}
                        <span>{split.after.range} · new room ({split.after.days} days at {money(moveEvent!.rent)})</span>
                        <span className="text-right">{money2(split.after.amount)}</span>
                        <span className="border-t border-border pt-0.5 font-medium text-foreground">{split.month}</span>
                        <span className="border-t border-border pt-0.5 text-right font-medium text-foreground">{money2(split.total)}</span>
                      </div>
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
                  rateOf={(b) => (b.bed.id === placed?.bed.id ? oldRent : websiteRate(b))}
                  onPick={(id) => {
                    setBedId(id);
                    resetMoney();
                    // someone else's bed: the move starts the day after their tenancy ends
                    const b = beds.find((x) => x.bed.id === id);
                    const until = b && b.bed.residentId && b.bed.id !== placed?.bed.id ? (b.bed.tenancyEnd ?? "").slice(0, 10) : "";
                    setMoveOn(until ? shiftDate(until, { days: 1 }) : today);
                  }}
                />
              ) : null}
            </Step>

            <Step n={2} title="End date" now={oldEnd ? fmtDate(oldEnd) : "—"}>
              <div className="flex flex-wrap items-center gap-3">
                <DateInput min={oldEnd} value={end} onChange={(e) => setNewEnd(e.target.value)} className="h-9 w-44" />
                {flags.date !== "none" ? (
                  <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium text-brand-deep">
                    {flags.date === "renewal" ? "Renewal" : "Extension"} from {fmtDate(nextDay(oldEnd))}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Unchanged</span>
                )}
              </div>
              {flags.date !== "none" ? (
                <p className="text-xs text-muted-foreground">
                  {flags.date === "renewal" ? "6 months or more: new agreement, Website rate." : "Under 6 months: same agreement, same rent."}
                </p>
              ) : null}
              {moved && dateEvent && events.length === 2 ? (
                <p className="text-xs text-sky-800">
                  Two events: {events.map((e) => `${e.name.toLowerCase()} on ${fmtDate(e.date)}`).join(" and ")}. Set the effective date to {fmtDate(dateEvent.date)} to make one event.
                </p>
              ) : null}
            </Step>

            <Step n={3} title="Financial adjustment" now={`Rental ${money(oldRent)} a month`}>
              {changed && events.length ? (
                <div className="space-y-4">
                  {events.map((e) => (
                    <EventMoney
                      key={e.i}
                      e={e}
                      numbered={events.length > 1}
                      rentValue={rentTyped[e.i] ?? String(e.proposed)}
                      onRent={(v) => setRentTyped((t) => ({ ...t, [e.i]: v }))}
                      requiredValue={(k) => requiredTyped[`${e.i}:${k}`]}
                      onRequired={(k, v) => setRequiredTyped((t) => ({ ...t, [`${e.i}:${k}`]: v }))}
                      waived={waived}
                      onWaive={(k, on) => setWaived((w) => (on ? [...w, `${e.i}:${k}`] : w.filter((x) => x !== `${e.i}:${k}`)))}
                      feeValue={(k) => feeTyped[`${e.i}:${k}`]}
                      onFee={(k, v) => setFeeTyped((t) => ({ ...t, [`${e.i}:${k}`]: v }))}
                      onRemove={(k) => setRemoved((r) => [...r, `${e.i}:${k}`])}
                      removedCount={removed.filter((r) => r.startsWith(`${e.i}:`)).length}
                      onPutBack={() => setRemoved((r) => r.filter((x) => !x.startsWith(`${e.i}:`)))}
                      preview={() =>
                        import("@/lib/invoice-pdf").then((m) =>
                          m.invoicePdfUrl({
                            number: "INV-Draft",
                            issued_at: new Date().toISOString(),
                            invoice_date: e.billOn || today,
                            payment_terms: "NET7",
                            full_name: invoiceFor?.fullName ?? "",
                            resident_code: invoiceFor?.residentCode ?? "",
                            email: invoiceFor?.email ?? "",
                            phone: invoiceFor?.phone ?? "",
                            university: invoiceFor?.university ?? "",
                            nationality: invoiceFor?.nationality ?? "",
                            residence_name: e.bed?.unit.residenceName ?? "",
                            room_name: e.bed ? `${e.bed.unit.unitNo} · Room ${e.bed.room.letter}` : "",
                            occupancy: occLabel(e.bed ? bedOccupancy(e.bed.bed.label) : occ),
                            tenancy_start: basis.data?.tenancy?.start ?? null,
                            tenancy_end: e.periodEnd,
                            monthly_rent: e.rent,
                            payment_frequency: "",
                            kind: "charge",
                            heading: "Initial Payment",
                            total: e.ip.total,
                            deposits_total: e.ip.lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0),
                            notes: `Initial payment difference - ${e.name} ${fmtDate(e.date)}`,
                            items: e.ip.lines,
                          }),
                        )
                      }
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {basis.data?.hasSchedule ? "" : "Set up the rent schedule on Payments first. "}
                    A billed Rental Payment (RP) is never changed: a higher rent is an RP adjustment, a lower one account credit. Old-room inspection charges go on Payments → Add charge.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing to compare until something changes.</p>
              )}
              {/* what is held now, line by line - so Held can be checked (Dani, 5 Oct 2026) */}
              {basis.data?.heldLines.length ? (
                <details className="group rounded-lg border border-border text-sm">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
                    Deposits held · {money(basis.data.heldLines.reduce((n, d) => n + d.amount, 0))}
                    {basis.data.accountCredit ? ` · Account credit ${money2(basis.data.accountCredit)}` : ""} <span className="group-open:hidden">· show lines</span>
                  </summary>
                  {basis.data.heldLines.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
                      <span className="min-w-0">
                        {d.label} {d.invoiceNumber ? <span className="text-xs text-muted-foreground">· {d.invoiceNumber}</span> : null}
                      </span>
                      <span className="tabular-nums">{money2(d.amount)}</span>
                    </div>
                  ))}
                </details>
              ) : null}
            </Step>
          </div>

          {/* the summary: now against new, then each event - always in view */}
          <aside className="min-h-0 overflow-y-auto border-t border-border bg-muted/30 px-5 py-5 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
            <p className="mt-1 text-base font-semibold text-brand-deep">{kind || "No change yet"}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Compare label="Room" from={bedLabel(placed)} to={moved ? bedLabel(target) : ""} />
              <Compare label="End date" from={oldEnd ? fmtDate(oldEnd) : "—"} to={end !== oldEnd ? fmtDate(end) : ""} />
              <Compare label="Rental a month" from={money(oldRent)} to={Math.abs(lastRent - oldRent) > 0.005 ? money(lastRent) : ""} />
            </dl>
            {changed ? (
              <ol className="mt-5 space-y-4 border-t border-border pt-4 text-sm">
                {events.map((e) => (
                  <li key={e.i} className="space-y-1">
                    <p className="font-medium text-foreground">
                      {fmtDate(e.date)} · {e.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      IP{" "}
                      {e.ip.total > 0
                        ? `${money2(e.ip.payable)}${e.ip.creditApplied ? ` (after ${money2(e.ip.creditApplied)} credit)` : ""} · ${e.billOn <= today ? "billed today" : `billed ${fmtDate(e.billOn)}`}`
                        : "none"}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.docs.length ? e.docs.join(", ") : "No documents"}</p>
                  </li>
                ))}
                <li className="text-xs text-muted-foreground">Each event's documents are made once its IP is settled.</li>
              </ol>
            ) : null}
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          {moved && !target ? (
            <span className="mr-auto text-xs text-amber-700">Choose the new bed.</span>
          ) : tooEarly ? (
            <span className="mr-auto text-xs text-rose-700">The effective date is before the bed is free.</span>
          ) : moveAfterEnd ? (
            <span className="mr-auto text-xs text-rose-700">The effective date is after the tenancy ends.</span>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={blocked} onClick={() => void confirm()}>
            {busy ? "Saving…" : action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PricedEvent = {
  i: number;
  date: string;
  name: string;
  rentBefore: number;
  rent: number;
  flags: { date: string };
  deposits: ReturnType<typeof eventDeposits>;
  charges: { key: string; label: string; amount: number }[];
  ip: ReturnType<typeof eventInvoice>;
  billOn: string;
};

/**
 * One event's money (agreed 7 Oct 2026): the rental from its day, the
 * deposits held against required, and its Initial Payment (IP) laid out as
 * the invoice editor lays it out.
 */
function EventMoney({
  e,
  numbered,
  rentValue,
  onRent,
  requiredValue,
  onRequired,
  waived,
  onWaive,
  feeValue,
  onFee,
  onRemove,
  removedCount,
  onPutBack,
  preview,
}: {
  e: PricedEvent;
  numbered: boolean;
  rentValue: string;
  onRent: (v: string) => void;
  requiredValue: (k: DepositKey) => string | undefined;
  onRequired: (k: DepositKey, v: string) => void;
  waived: string[];
  onWaive: (k: DepositKey, on: boolean) => void;
  feeValue: (k: string) => string | undefined;
  onFee: (k: string, v: string) => void;
  onRemove: (k: string) => void;
  removedCount: number;
  onPutBack: () => void;
  preview: () => Promise<string>;
}) {
  const today = klToday();
  const rentLabel = e.flags.date === "renewal" ? "Renewal rate" : e.flags.date === "extension" ? "Extension rate" : "New rental";
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/50 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">
          {numbered ? `Event ${e.i + 1} · ` : ""}
          {e.name}
        </p>
        <p className="text-xs text-muted-foreground">Effective {fmtDate(e.date)}</p>
      </header>

      {/* rental charges: from the event's day, never before it */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-sm">
        <span className="w-28 text-xs text-muted-foreground">Rental charges</span>
        <span className="tabular-nums text-muted-foreground">{money(e.rentBefore)}</span>
        <span className="text-muted-foreground">→</span>
        <Input type="number" aria-label={rentLabel} value={rentValue} onChange={(x) => onRent(x.target.value)} className="h-8 w-28 text-right tabular-nums" />
        <span className="text-xs text-muted-foreground">a month · {rentLabel.toLowerCase()}</span>
      </div>

      {/* deposits: held against required */}
      <div className="border-t border-border">
        <div className="grid grid-cols-[1fr_5.5rem_6.5rem_5.5rem_3rem] gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Deposit</span>
          <span className="text-right">Held</span>
          <span className="text-right">Required</span>
          <span className="text-right">Difference</span>
          <span className="text-center">Waive</span>
        </div>
        {e.deposits.rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_5.5rem_6.5rem_5.5rem_3rem] items-center gap-2 px-3 py-1 text-sm">
            <span>{r.label}</span>
            <span className="text-right tabular-nums text-muted-foreground">{money(r.held)}</span>
            {r.key === "card_deposit" ? (
              <span className="text-right tabular-nums text-muted-foreground">{money(r.required)}</span>
            ) : (
              <Input
                type="number"
                aria-label={`${r.label} required`}
                value={requiredValue(r.key) ?? String(r.required)}
                onChange={(x) => onRequired(r.key, x.target.value)}
                className="h-8 text-right tabular-nums"
              />
            )}
            <span className={`text-right tabular-nums ${r.difference > 0 ? "font-medium text-rose-700" : r.difference < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
              {r.difference ? `${r.difference > 0 ? "+" : "−"} ${money(Math.abs(r.difference))}` : "–"}
            </span>
            <span className="flex justify-center">
              {r.difference > 0 ? (
                <input
                  type="checkbox"
                  aria-label={`Waive the ${r.label.toLowerCase()} difference`}
                  className="size-4 accent-brand"
                  checked={waived.includes(`${e.i}:${r.key}`)}
                  onChange={(x) => onWaive(r.key, x.target.checked)}
                />
              ) : null}
            </span>
          </div>
        ))}
        {e.deposits.credit > 0 ? (
          <p className="px-3 pb-2 text-xs text-emerald-800">{money2(e.deposits.credit)} lower deposit becomes account credit.</p>
        ) : null}
      </div>

      {/* the Initial Payment, as the invoice editor lays it out */}
      <div className="border-t border-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Initial Payment (IP)</span>
          <PdfPreviewButton
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Preview the IP"
            title="IP preview"
            disabled={!e.ip.lines.length}
            fileName="Brachtia-IP-preview.pdf"
            downloadable={false}
            downloadHint="Confirm to make the IP, then download it"
            build={preview}
          >
            <Eye className="size-4" />
          </PdfPreviewButton>
        </div>
        {e.deposits.ipLines.map((l) => (
          <div key={l.label} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="flex-1">{l.label}</span>
            <span className="w-24 text-right tabular-nums">{money2(l.amount)}</span>
            <span className="size-8 shrink-0" aria-hidden />
          </div>
        ))}
        {/* Schedule B's fixed charges - the amount editable, removed at Brachtia's discretion */}
        {e.charges.map((c) => (
          <div key={c.key} className="flex items-center gap-2 px-3 py-1">
            <span className="flex-1 text-sm">{c.label}</span>
            <Input
              type="number"
              aria-label={`${c.label} amount`}
              value={feeValue(c.key) ?? String(c.amount)}
              onChange={(x) => onFee(c.key, x.target.value)}
              className="h-8 w-24 text-right tabular-nums"
            />
            <Button size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground" aria-label={`Remove ${c.label}`} onClick={() => onRemove(c.key)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {!e.ip.lines.length ? <p className="px-3 py-1.5 text-xs text-muted-foreground">No IP for this event.</p> : null}
        {e.ip.creditApplied > 0 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-800">
            <span className="flex-1">Less account credit</span>
            <span className="w-24 text-right tabular-nums">− {money2(e.ip.creditApplied)}</span>
            <span className="size-8 shrink-0" aria-hidden />
          </div>
        ) : null}
        <div className="flex items-center gap-2 bg-muted px-3 py-2 text-sm font-medium">
          <span className="flex-1">
            Payable
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {e.ip.total > 0 ? (e.billOn <= today ? "billed today, due in 7 days" : `scheduled, billed ${fmtDate(e.billOn)}`) : ""}
            </span>
          </span>
          <span className="w-24 text-right tabular-nums">{money2(e.ip.payable)}</span>
          <span className="size-8 shrink-0" aria-hidden />
        </div>
        {e.ip.creditLeft > 0 ? <p className="px-3 py-1.5 text-xs text-emerald-800">{money2(e.ip.creditLeft)} account credit left for the next RP.</p> : null}
        {removedCount ? (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            {removedCount} charge{removedCount === 1 ? "" : "s"} removed ·{" "}
            <button type="button" className="underline underline-offset-2" onClick={onPutBack}>
              put back
            </button>
          </p>
        ) : null}
      </div>
    </section>
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
  rateOf,
  onPick,
}: {
  rows: BedRow[];
  residents: Resident[];
  current: string;
  picked: string;
  /** what the bed costs them: their own rent, or the Website rate - never another occupant's deal (Dani, 7 Oct 2026) */
  rateOf: (b: BedRow) => number;
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
              <span className="text-right tabular-nums">{money(rateOf(b))}</span>
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
