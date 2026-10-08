import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { costBreakdown, getProperty } from "@/data/properties";
import { allBeds, fmtDate, money, unitAccepts, unitGender, type BedRow, type Resident, type Unit } from "@/lib/ops-store";
import { GenderMark } from "@/components/admin/GenderMark";
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
  type ChangeFlags,
  type Deposits,
} from "@/lib/tenancy-change";
import { klToday } from "@/lib/kl-date";
import { dayBefore } from "@/lib/placement";
import { rentForDays, shiftDate } from "@/lib/rental-schedule";
import { applyTenancyChange, getTenancyChangeBasis } from "@/lib/tenancy-change.functions";

/**
 * Update Tenancy (Dani, 3 Oct 2026; four steps since the 7 Oct review):
 *   1 What is changing   room / occupancy, the end date, or both
 *   2 Details            only the fields for what was picked - the room list
 *                        opens on "Choose room"
 *   3 Review             the events: one card each, with its IP, billing day
 *                        and documents. The calculation and any overrides are
 *                        folded away
 *   4 Confirm            what will happen, said once
 * The rules are in tenancy-change.ts; after confirm the events live on the
 * server (tenancy-events.server.ts) and show on the Tenancy tab.
 */
const OCCUPANCY_LABEL: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };
const STEPS = ["What is changing", "Details", "Review", "Confirm"] as const;

export type TenancyChangeResult = {
  /** the bed they move to - null when they stay where they are */
  newBed: BedRow | null;
  newEnd: string;
  /** a renewal's new agreement starts on its own day, not the old start */
  newStart?: string;
  newRent: number;
};

type PricedEvent = {
  i: number;
  date: string;
  flags: ChangeFlags;
  name: string;
  rentBefore: number;
  rent: number;
  proposed: number;
  bedBefore: BedRow | null;
  bed: BedRow | null;
  periodEnd: string;
  deposits: ReturnType<typeof eventDeposits>;
  fees: { key: string; label: string; amount: number; waived: boolean }[];
  ip: ReturnType<typeof eventInvoice>;
  billOn: string;
  docs: string[];
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
  /** the documents' values, with the bed, end date and rent of one event */
  mergeValuesFor: (r: TenancyChangeResult) => Record<string, string>;
  /** once the server has scheduled the events */
  onApplied: () => Promise<void>;
  /** kept for the caller; the IP preview moved to Payments once it exists */
  invoiceFor?: unknown;
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

  const [step, setStep] = useState(1);
  const [wantRoom, setWantRoom] = useState(false);
  const [wantDate, setWantDate] = useState(false);
  const [occ, setOcc] = useState(oldOcc);
  const [bedId, setBedId] = useState("");
  const [picking, setPicking] = useState(false);
  const [newEnd, setNewEnd] = useState("");
  const [moveOn, setMoveOn] = useState(today);
  // both picked: the room changes with the renewal / extension unless admin asks for its own date (7 Oct 2026)
  const [ownDate, setOwnDate] = useState(false);
  // admin's own figures, per event - behind "Adjust amounts"
  const [rentTyped, setRentTyped] = useState<Record<number, string>>({});
  const [requiredTyped, setRequiredTyped] = useState<Record<string, string>>({});
  const [waived, setWaived] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const resetMoney = () => {
    setRentTyped({});
    setRequiredTyped({});
    setWaived([]);
  };
  // each opening starts from what the resident has now
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setWantRoom(false);
    setWantDate(false);
    setOcc(oldOcc);
    setBedId("");
    setNewEnd("");
    setMoveOn(klToday());
    setOwnDate(false);
    resetMoney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placed?.bed.id]);

  const claimedIds = new Set((basis.data?.claimed ?? []).map((c) => c.bedId));
  const free = useMemo(
    () =>
      allBeds(units).filter(
        ({ unit, bed }) =>
          // vacant now, or someone else's whose tenancy ends before ours does - the move then waits for it (Dani, 7 Oct 2026)
          bed.id !== placed?.bed.id &&
          // reserved for another resident's room change
          !claimedIds.has(bed.id) &&
          (bed.status === "vacant" || (!!bed.residentId && !!bed.tenancyEnd && bed.tenancyEnd.slice(0, 10) < (tenancy.end || "9999"))) &&
          bedOccupancy(bed.label) === occ &&
          // men and women never share a unit - the same rule as a booking's room list
          unitAccepts(unit, residents, gender),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, occ, placed?.bed.id, residents, gender, tenancy.end, basis.data?.claimed],
  );
  const target = wantRoom ? (free.find((b) => b.bed.id === bedId) ?? null) : null;
  const end = wantDate && newEnd ? newEnd : oldEnd;
  // the renewal / extension start: the day after the tenancy ends
  const dateStart = oldEnd ? nextDay(oldEnd) : "";
  const together = wantRoom && wantDate && end > oldEnd && !ownDate;
  const effectiveMove = together ? dateStart : moveOn;
  // the bed is someone else's until their tenancy ends: the move can only be after it
  const occupiedUntil = target?.bed.residentId ? (target.bed.tenancyEnd ?? "").slice(0, 10) : "";

  const flags = changeFlags({
    oldUnitId: placed?.unit.id ?? "",
    newUnitId: target?.unit.id ?? placed?.unit.id ?? "",
    oldRoomId: placed?.room.id ?? "",
    newRoomId: target?.room.id ?? placed?.room.id ?? "",
    oldOccupancy: oldOcc,
    newOccupancy: target ? occ : oldOcc,
    oldEnd,
    newEnd: end,
  });
  const moved = isMove(flags);
  const websiteRate = (b: BedRow) => bedRent(roomTypes, b.unit, b.room, {}, false, "long");

  /*
   * The events, each priced from the state the one before leaves (agreed 7 Oct
   * 2026), with the account credit already there applied in order - IP 1
   * first, then IP 2 - exactly as confirm applies it.
   */
  const events: PricedEvent[] = useMemo(() => {
    const held0 = basis.data?.held ?? null;
    if (!held0) return [];
    let rent = oldRent;
    let held: Deposits = held0;
    let bed: BedRow | null = placed ?? null;
    let credit = basis.data?.accountCredit ?? 0;
    return planEvents(flags, effectiveMove, oldEnd).map((p, i) => {
      const bedBefore = bed;
      if (isMove(p.flags) && target) bed = target;
      // a new room: its Website rate; a renewal: the Website rate of the room then; an extension: the rent it has
      const proposed = isMove(p.flags) || p.flags.date === "renewal" ? (bed ? websiteRate(bed) : rent) : rent;
      const r = rentTyped[i] != null ? Number(rentTyped[i]) || 0 : proposed;
      // the required deposit follows the rent, never the length of the tenancy
      const property = getProperty(bed?.unit.residenceSlug ?? "");
      const byFormula = property && r && Math.abs(r - rent) > 0.005 ? depositsOf(moneyOf(costBreakdown(property, r, "long").lines)) : held;
      const required = Object.fromEntries(
        DEPOSIT_KEYS.map((k) => [k, k === "card_deposit" ? held.card_deposit : requiredTyped[`${i}:${k}`] != null ? Number(requiredTyped[`${i}:${k}`]) || 0 : byFormula[k]]),
      ) as Deposits;
      const d = eventDeposits(held, required, waived.filter((w) => w.startsWith(`${i}:dep:`)).map((w) => w.split(":")[2]!));
      // RM100 and RM20 are fixed; an exception is an explicit waiver
      const fees = fixedCharges(p.flags).map((c) => ({ ...c, waived: waived.includes(`${i}:fee:${c.key}`) }));
      credit += d.credit;
      const ip = eventInvoice(d.ipLines, fees.filter((f) => !f.waived), credit);
      credit = ip.creditLeft;
      const ev: PricedEvent = {
        i,
        date: p.date,
        flags: p.flags,
        name: eventName(p.flags),
        rentBefore: rent,
        rent: r,
        proposed,
        bedBefore,
        bed,
        // a room event before a renewal ends with the tenancy as it was
        periodEnd: p.flags.date !== "none" ? end : oldEnd,
        deposits: d,
        fees,
        ip,
        billOn: ip.total > 0 ? ipBillOn(p.date, today) : "",
        docs: documentNames(documentsFor(p.flags)),
      };
      rent = r;
      held = d.heldAfter;
      return ev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis.data, flags.room, flags.unit, flags.occupancy, flags.date, effectiveMove, oldEnd, end, target, placed, oldRent, rentTyped, requiredTyped, waived, today]);

  /*
   * Somebody has a room booked next (8 Oct 2026): an extension, or staying on
   * until a later move, must not run into their dates. Neither is overwritten -
   * they are moved first, through the booking's own room picker, then this is
   * tried again. The server checks the same before it saves.
   */
  const stayUntil = moved && effectiveMove ? dayBefore(effectiveMove) : end;
  const nextHere = placed?.bed.upcoming?.find((u) => u.start && u.start <= stayUntil) ?? null;
  const nextThere = moved
    ? (target?.bed.upcoming?.find((u) => u.start && u.start <= end && (u.end || "9999-12-31") >= effectiveMove) ?? null)
    : null;
  const clash = nextHere ?? nextThere;
  const who = residents.find((r) => r.id === residentId)?.fullName || "This resident";
  const clashText = clash
    ? `${who}'s ${flags.date !== "none" && !nextThere ? `${flags.date === "renewal" ? "renewal" : "extension"} to ${fmtDate(end)}` : "change"} overlaps ${clash.name}'s confirmed reservation from ${fmtDate(clash.start)}.`
    : "";

  const openEvents = basis.data?.open ?? [];
  const tooEarly = !!occupiedUntil && effectiveMove <= occupiedUntil;
  const moveAfterEnd = moved && effectiveMove > end;
  // what stops each step going on - said where the Next button is
  const stop =
    step === 1
      ? !wantRoom && !wantDate
        ? "Pick what is changing."
        : ""
      : step === 2
        ? clashText
          ? clashText
          : wantRoom && !target
          ? "Choose the new room."
          : tooEarly
            ? "The effective date is before the bed is free."
            : moveAfterEnd
              ? "The effective date is after the tenancy ends."
              : wantDate && flags.date === "none"
                ? "Choose an end date after the current one."
                : !anyChange(flags)
                  ? "Nothing has changed."
                  : ""
        : "";
  const dateWord = flags.date === "renewal" ? "Renewal" : flags.date === "extension" ? "Extension" : "";
  const action = dateWord && moved ? `Initiate ${dateWord} + Room Change` : dateWord ? `Initiate ${dateWord}` : "Initiate Room Change";

  async function confirm() {
    if (!basis.data?.tenancy) return;
    setBusy(true);
    try {
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
            newOccupancy: target ? occ : oldOcc,
            oldEnd,
            newEnd: end,
          },
          moveOn: moved ? effectiveMove : "",
          moveTo: moved && target ? { bedId: target.bed.id, roomId: target.room.id, unitId: target.unit.id, occupancy: target.room.occupancy } : null,
          events: events.map((e) => ({
            date: e.date,
            rent: e.rent,
            required: { security: e.deposits.rows[0]!.required, utility: e.deposits.rows[1]!.required, card_deposit: e.deposits.rows[2]!.required },
            waived: waived.filter((w) => w.startsWith(`${e.i}:dep:`)).map((w) => w.split(":")[2]!),
            waivedFees: e.fees.filter((f) => f.waived).map((f) => f.key),
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
      await onApplied();
      toast.success(res.events.length > 1 ? "2 events scheduled" : "Tenancy change scheduled", {
        description: "Follow it on the Tenancy tab. The IP is on Payments.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tenancy");
    } finally {
      setBusy(false);
    }
  }

  const occLabel = (o: string) => OCCUPANCY_LABEL[o] ?? o;
  const bedLabel = (b: BedRow | null | undefined) => (b ? `${b.unit.residenceName} · ${b.unit.unitNo} · Room ${b.room.letter} · ${b.bed.label}` : "—");

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="admin-ui flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b border-border px-6 py-4">
          <div>
            <DialogTitle className="text-lg font-bold text-brand-deep">Update Tenancy</DialogTitle>
            <DialogDescription>A shorter tenancy is a checkout (Early termination).</DialogDescription>
          </div>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      n < step ? "bg-brand-deep text-primary-foreground" : n === step ? "bg-brand-tint text-brand-deep ring-1 ring-brand-deep" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {n < step ? <Check className="size-3" /> : n}
                  </span>
                  <span className={n === step ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
                  {n < STEPS.length ? <span className="mx-1 h-px w-4 bg-border" aria-hidden /> : null}
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {openEvents.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Still scheduled: {openEvents.map((o) => `${o.name}, ${fmtDate(o.date)}`).join("; ")}. A new change can be made once it is effective.
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                icon={BedDouble}
                title="Room / occupancy"
                now={`${occLabel(oldOcc)} · ${bedLabel(placed)}`}
                on={wantRoom}
                onToggle={() => {
                  setWantRoom((v) => !v);
                  resetMoney();
                }}
              />
              <ChoiceCard
                icon={CalendarDays}
                title="Tenancy end date"
                now={oldEnd ? `Ends ${fmtDate(oldEnd)}` : "—"}
                on={wantDate}
                onToggle={() => {
                  setWantDate((v) => !v);
                  resetMoney();
                }}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {wantRoom ? (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">Room / occupancy</p>
                  <Segmented
                    label="Occupancy"
                    value={occ}
                    options={["single", "twin"].map((o) => ({ value: o, label: occLabel(o) }))}
                    onChange={(v) => {
                      setOcc(v);
                      setBedId("");
                      resetMoney();
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-24 text-xs text-muted-foreground">New room</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{target ? `${bedLabel(target)} · ${money(websiteRate(target))}` : "None chosen"}</span>
                    <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
                      {target ? "Change" : "Choose room"}
                    </Button>
                  </div>
                  {together ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground">Effective date</span>
                      <span className="text-sm">
                        Room change and {dateWord.toLowerCase()} happen together on <span className="font-medium">{fmtDate(dateStart)}</span>.
                      </span>
                      <button type="button" className="text-xs text-brand-deep underline underline-offset-2" onClick={() => setOwnDate(true)}>
                        Use a different room-change date
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground">Effective date</span>
                      <DateInput
                        min={occupiedUntil ? shiftDate(occupiedUntil, { days: 1 }) : today}
                        max={end}
                        value={moveOn}
                        onChange={(e) => setMoveOn(e.target.value)}
                        className="h-9 w-44"
                      />
                      {wantDate && ownDate ? (
                        <button type="button" className="text-xs text-brand-deep underline underline-offset-2" onClick={() => setOwnDate(false)}>
                          Move with the {dateWord.toLowerCase() || "date change"} instead
                        </button>
                      ) : null}
                    </label>
                  )}
                  {/* the bed is not free on the date: never moved silently - admin chooses */}
                  {occupiedUntil && tooEarly ? (
                    <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      This bed is free from {fmtDate(shiftDate(occupiedUntil, { days: 1 }))}, not {fmtDate(effectiveMove)}. Choose another room, or{" "}
                      <button
                        type="button"
                        className="font-medium underline underline-offset-2"
                        onClick={() => {
                          setOwnDate(true);
                          setMoveOn(shiftDate(occupiedUntil, { days: 1 }));
                        }}
                      >
                        move on {fmtDate(shiftDate(occupiedUntil, { days: 1 }))}
                      </button>
                      {wantDate ? " (a separate event)." : "."}
                    </div>
                  ) : occupiedUntil ? (
                    <p className="text-xs text-muted-foreground">Occupied until {fmtDate(occupiedUntil)} - free from {fmtDate(shiftDate(occupiedUntil, { days: 1 }))}.</p>
                  ) : null}
                </section>
              ) : null}
              {wantDate ? (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">Tenancy end date</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-24 text-xs text-muted-foreground">Current</span>
                    <span className="text-sm">{oldEnd ? fmtDate(oldEnd) : "—"}</span>
                  </div>
                  <label className="flex flex-wrap items-center gap-3">
                    <span className="w-24 text-xs text-muted-foreground">New end date</span>
                    <DateInput min={oldEnd} value={newEnd || oldEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-9 w-44" />
                  </label>
                  {flags.date !== "none" ? (
                    <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-brand-deep">
                      <span className="font-semibold">{flags.date === "renewal" ? "Renewal" : "Extension"}</span> from {fmtDate(nextDay(oldEnd))} ·{" "}
                      {flags.date === "renewal" ? "6 months or more · Website rate · new agreement" : "under 6 months · same agreed rent · Schedule A"}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {events.length > 1
                  ? "Two dates, two events - each with its own IP and documents. One effective date makes one event."
                  : wantRoom && wantDate
                    ? "One effective date - one combined event, one IP, one document set."
                    : "One event."}
              </p>
              {events.map((e) => (
                <EventCard
                  key={e.i}
                  e={e}
                  numbered={events.length > 1}
                  today={today}
                  bedLabel={bedLabel}
                  waived={waived}
                  onWaive={(key, on) => setWaived((w) => (on ? [...w, `${e.i}:${key}`] : w.filter((x) => x !== `${e.i}:${key}`)))}
                  rentValue={rentTyped[e.i] ?? String(e.proposed)}
                  onRent={(v) => setRentTyped((t) => ({ ...t, [e.i]: v }))}
                  requiredValue={(k) => requiredTyped[`${e.i}:${k}`]}
                  onRequired={(k, v) => setRequiredTyped((t) => ({ ...t, [`${e.i}:${k}`]: v }))}
                  position={basis.data ? { cash: basis.data.heldCash, waived: basis.data.waivedHeld } : null}
                />
              ))}
              {basis.data && !basis.data.hasSchedule ? <p className="text-xs text-amber-700">Set up the rent schedule on Payments first.</p> : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <ul className="divide-y divide-border rounded-xl border border-border">
                {events.map((e) => (
                  <li key={e.i} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{fmtDate(e.date)}</span> · {e.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">IP {e.ip.total > 0 ? money2(e.ip.payable) : "none"}</span>
                  </li>
                ))}
              </ul>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">On confirm</p>
                <ul className="space-y-1.5 text-sm">
                  {[
                    ...(moved ? ["The room change will not take effect until its IP is fully paid. The new bed is reserved now; the resident stays in the current one."] : []),
                    "Each IP is created now as scheduled, and billed 14 days before its event. It can be paid early; account credit counts.",
                    "Until the IP is fully paid: no new agreement, no Schedule A or C, no access card form - room, rent and end date stay as they are.",
                    "Once paid: the documents are made, and the event is Paid · Scheduled.",
                    "On the effective date: the room, rent and tenancy end change. Paid late: a new effective date is set - nothing is backdated.",
                    "Earlier document versions are kept as Superseded.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Old-room inspection charges are added later on Payments → Add charge.</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-6 py-3">
          {stop ? (
            <span className="mr-auto text-xs text-amber-700">
              {stop}
              {clash?.enquiryId && stop === clashText ? (
                <a
                  href={`/admin/bookings/${clash.enquiryId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 font-semibold text-brand-deep underline"
                >
                  Move {clash.name.split(" ")[0]}
                </a>
              ) : null}
            </span>
          ) : (
            <span className="mr-auto" />
          )}
          <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : onOpenChange(false))} disabled={busy}>
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          {step < 4 ? (
            <Button disabled={!!stop || !basis.data?.tenancy || (step === 3 && !events.length)} onClick={() => setStep(step + 1)}>
              Next <ArrowRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button disabled={busy || !!openEvents.length || !events.length} onClick={() => void confirm()}>
              {busy ? "Saving…" : action}
            </Button>
          )}
        </div>
      </DialogContent>

      {/* the room list, only when asked for */}
      <RoomPicker
        open={picking}
        onOpenChange={setPicking}
        rows={free}
        residents={residents}
        picked={bedId}
        homeResidence={placed?.unit.residenceId ?? ""}
        occupancy={occLabel(occ)}
        rateOf={websiteRate}
        onPick={(b) => {
          setBedId(b.bed.id);
          resetMoney();
          // someone else's bed: the move starts the day after their tenancy ends
          const until = b.bed.residentId ? (b.bed.tenancyEnd ?? "").slice(0, 10) : "";
          if (!together) setMoveOn(until ? shiftDate(until, { days: 1 }) : today);
          setPicking(false);
        }}
      />
    </Dialog>
  );
}

/** step 1: one thing that can change, picked or not */
function ChoiceCard({ icon: Icon, title, now, on, onToggle }: { icon: typeof BedDouble; title: string; now: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${on ? "border-brand-deep bg-brand-tint" : "border-border hover:bg-muted/50"}`}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${on ? "text-brand-deep" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{now}</span>
      </span>
      <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${on ? "border-brand-deep bg-brand-deep text-primary-foreground" : "border-border"}`}>
        {on ? <Check className="size-3.5" /> : null}
      </span>
    </button>
  );
}

/**
 * Step 3: one event, compact - date, room, rental, IP, documents. The
 * calculation and the overrides are folded away (7 Oct 2026 review).
 */
function EventCard({
  e,
  numbered,
  today,
  bedLabel,
  waived,
  onWaive,
  rentValue,
  onRent,
  requiredValue,
  onRequired,
  position,
}: {
  position: { cash: Record<string, number>; waived: Record<string, number> } | null;
  e: PricedEvent;
  numbered: boolean;
  today: string;
  bedLabel: (b: BedRow | null | undefined) => string;
  waived: string[];
  onWaive: (key: string, on: boolean) => void;
  rentValue: string;
  onRent: (v: string) => void;
  requiredValue: (k: string) => string | undefined;
  onRequired: (k: string, v: string) => void;
}) {
  const [show, setShow] = useState<"" | "calc" | "adjust">("");
  // the first event starts from what is held now: cash and earlier waivers apart; a later one from the first's requirement
  const cashOf = (k: string, covered: number) => (e.i === 0 && position ? (position.cash as Record<string, number>)[k] ?? covered : covered);
  const waivedOf = (k: string) => (e.i === 0 && position ? (position.waived as Record<string, number>)[k] ?? 0 : 0);
  const moves = isMove(e.flags);
  const split = moves && Math.abs(e.rent - e.rentBefore) > 0.005 ? moveMonthSplit(e.date, e.rentBefore, e.rent) : null;
  const rentLabel = e.flags.date === "renewal" ? "Renewal rate" : e.flags.date === "extension" ? "Extension rate" : "New rental";
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-sm font-semibold text-foreground">
          {numbered ? `Event ${e.i + 1} · ` : ""}
          {e.name}
        </p>
        <p className="text-xs text-muted-foreground">Effective {fmtDate(e.date)}</p>
      </header>
      <dl className="space-y-1.5 px-4 py-3 text-sm">
        {moves ? <Row label="Room" value={`${bedLabel(e.bedBefore)} → ${bedLabel(e.bed)}`} /> : null}
        {moves && e.bed && e.bedBefore && e.bed.unit.residenceName !== e.bedBefore.unit.residenceName ? (
          <Row label="Residence" value={`${e.bedBefore.unit.residenceName} → ${e.bed.unit.residenceName}`} />
        ) : null}
        <Row label="Rental" value={Math.abs(e.rent - e.rentBefore) > 0.005 ? `${money(e.rentBefore)} → ${money(e.rent)} a month` : `${money(e.rent)} a month, unchanged`} />
        <Row
          label="IP payable"
          value={
            e.ip.total > 0
              ? `${money2(e.ip.payable)}${e.ip.creditApplied ? ` (after ${money2(e.ip.creditApplied)} account credit)` : ""} · ${e.billOn <= today ? "billed today" : `billed ${fmtDate(e.billOn)}`}`
              : "None"
          }
          strong
        />
        <Row label="Documents" value={e.docs.join(", ") || "None"} />
      </dl>
      <div className="flex gap-1 border-t border-border px-2 py-1">
        {(["calc", "adjust"] as const).map((k) => (
          <Button key={k} size="sm" variant="ghost" className="text-xs" onClick={() => setShow(show === k ? "" : k)}>
            {k === "calc" ? "View calculation" : "Adjust amounts"}
            <ChevronDown className={`ml-1 size-3.5 transition-transform ${show === k ? "rotate-180" : ""}`} />
          </Button>
        ))}
      </div>

      {show === "calc" ? (
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3 text-xs">
          <table className="w-full tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Deposit</th>
                <th className="py-1 text-right font-medium">Cash held</th>
                <th className="py-1 text-right font-medium">Waived</th>
                <th className="py-1 text-right font-medium">Required</th>
                <th className="py-1 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {e.deposits.rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-0.5">{r.label}</td>
                  <td className="py-0.5 text-right">{money(cashOf(r.key, r.held))}</td>
                  <td className="py-0.5 text-right text-muted-foreground">{waivedOf(r.key) ? money(waivedOf(r.key)) : "–"}</td>
                  <td className="py-0.5 text-right">{money(r.required)}</td>
                  <td className={`py-0.5 text-right ${r.difference > 0 ? "text-rose-700" : r.difference < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {r.difference ? `${r.difference > 0 ? "+" : "−"} ${money(Math.abs(r.difference))}` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.deposits.rows.some((r) => waivedOf(r.key)) ? (
            <p className="text-muted-foreground">A waived difference counts towards the requirement but is not money: only cash held is refundable at checkout.</p>
          ) : null}
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">IP</p>
            {e.ip.lines.map((l) => (
              <Line key={l.label} label={l.label} amount={money2(l.amount)} />
            ))}
            {e.fees.filter((f) => f.waived).map((f) => (
              <Line key={f.key} label={`${f.label} - waived`} amount={money2(0)} muted />
            ))}
            {e.ip.creditApplied ? <Line label="Less account credit" amount={`− ${money2(e.ip.creditApplied)}`} /> : null}
            <Line label="Payable" amount={money2(e.ip.payable)} strong />
            {e.deposits.credit ? <p className="pt-1 text-emerald-800">{money2(e.deposits.credit)} of deposit becomes account credit.</p> : null}
            {e.ip.creditLeft ? <p className="text-emerald-800">{money2(e.ip.creditLeft)} account credit carried to the next invoice.</p> : null}
          </div>
          {split ? (
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">{split.month} rental, pro-rated by day</p>
              {split.before ? <Line label={`${split.before.range} · previous room (${split.before.days} days)`} amount={money2(split.before.amount)} /> : null}
              <Line label={`${split.after.range} · new room (${split.after.days} days)`} amount={money2(split.after.amount)} />
              <Line label={split.month} amount={money2(split.total)} strong />
            </div>
          ) : null}
          <p className="text-muted-foreground">A billed Rental Payment is never changed: higher rent becomes an RP adjustment, lower rent account credit.</p>
        </div>
      ) : null}

      {show === "adjust" ? (
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3 text-sm">
          <label className="flex items-center gap-3">
            <span className="w-36 text-xs text-muted-foreground">{rentLabel}</span>
            <Input type="number" value={rentValue} onChange={(x) => onRent(x.target.value)} className="h-8 w-28 text-right tabular-nums" />
            <span className="text-xs text-muted-foreground">a month</span>
          </label>
          {e.deposits.rows
            .filter((r) => r.key !== "card_deposit")
            .map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-3">
                <span className="w-36 text-xs text-muted-foreground">{r.label} required</span>
                <Input
                  type="number"
                  value={requiredValue(r.key) ?? String(r.required)}
                  onChange={(x) => onRequired(r.key, x.target.value)}
                  className="h-8 w-28 text-right tabular-nums"
                />
                {r.difference > 0 ? (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" className="size-4 accent-brand" checked={waived.includes(`${e.i}:dep:${r.key}`)} onChange={(x) => onWaive(`dep:${r.key}`, x.target.checked)} />
                    Waive difference
                  </label>
                ) : null}
              </div>
            ))}
          {e.fees.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-xs">
              <span className="w-36 text-muted-foreground">{f.label}</span>
              <span className="w-28 text-right tabular-nums">{money2(f.amount)}</span>
              <span className="flex items-center gap-1.5">
                <input type="checkbox" className="size-4 accent-brand" checked={f.waived} onChange={(x) => onWaive(`fee:${f.key}`, x.target.checked)} />
                Waive fee
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function Line({ label, amount, strong = false, muted = false }: { label: string; amount: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 tabular-nums ${strong ? "font-medium text-foreground" : muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span>{amount}</span>
    </div>
  );
}

/** the room list, in its own window - searchable by unit, then by room letter */
function RoomPicker({
  open,
  onOpenChange,
  rows,
  residents,
  picked,
  occupancy,
  rateOf,
  onPick,
  homeResidence,
}: {
  homeResidence: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: BedRow[];
  residents: Resident[];
  picked: string;
  occupancy: string;
  rateOf: (b: BedRow) => number;
  onPick: (b: BedRow) => void;
}) {
  const [q, setQ] = useState("");
  const [letter, setLetter] = useState("");
  const letters = [...new Set(rows.filter((b) => b.unit.residenceId === homeResidence).map((b) => b.room.letter))].sort();
  const residences = [...new Map(rows.map((b) => [b.unit.residenceId, b.unit.residenceName])).entries()];
  const [residence, setResidence] = useState(homeResidence);
  const inResidence = rows.filter((b) => !residence || b.unit.residenceId === residence);
  const shown = inResidence.filter((b) => (!letter || b.room.letter === letter) && (!q || b.unit.unitNo.toLowerCase().includes(q.toLowerCase())));
  // another residence: not yet - its agreement and access card templates are not set up (7 Oct 2026)
  const elsewhere = residence && residence !== homeResidence;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-ui flex max-h-[85vh] max-w-3xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">Choose room · {occupancy}</DialogTitle>
          <DialogDescription>Website rate shown. Beds whose tenant leaves first show the day they are free.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit, e.g. B-08" className="h-9 pl-8" />
          </div>
          {letters.length > 1 ? (
            <Segmented label="Room" value={letter} options={[{ value: "", label: "All" }, ...letters.map((l) => ({ value: l, label: l === "Unit" ? "Whole unit" : l }))]} onChange={setLetter} />
          ) : null}
        </div>
        {residences.length > 1 ? (
          <Segmented label="Residence" value={residence} options={residences.map(([id, name]) => ({ value: id, label: name }))} onChange={setResidence} />
        ) : null}
        {elsewhere ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Unavailable - {residences.find(([id]) => id === residence)?.[1]} tenancy agreement and access-card templates are not configured yet. Room and unit changes within the same residence still work.
          </p>
        ) : null}
        <div className={`min-h-0 flex-1 overflow-y-auto ${elsewhere ? "pointer-events-none opacity-50" : ""}`}>
          <RoomList rows={shown} residents={residents} current="" picked={picked} rateOf={rateOf} onPick={(id) => onPick(rows.find((b) => b.bed.id === id)!)} />
        </div>
      </DialogContent>
    </Dialog>
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
