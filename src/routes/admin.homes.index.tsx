import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { listResidences } from "@/lib/admin.functions";
import { releaseBookingFor } from "@/lib/billing-client";
import {
  NO_ROOM_TYPES,
  bedRent,
  collapseSingles,
  unitTypeNames,
  type SiteRoomType,
} from "@/lib/room-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { ReserveBedDialog } from "@/components/admin/ReserveBedDialog";
import { UnitGenderMark } from "@/components/admin/GenderMark";
import {
  bedBlockedBy,
  type BedRow,
  type Unit,
  type Resident,
  residentForBed,
  GENDERS,
  allBeds,
  isUnitSlot,
  roomCountFor,
  fmtDate,
  money,
  useOps,
  vacateBed,
  type BedStatus,
  sponsorLabel,
  residentIdOf,
} from "@/lib/ops-store";
import { DateInput } from "@/components/ui/date-input";

/**
 * Which residence is open lives in the address, not in memory.
 *
 * Refreshing used to throw you back to the residence list, which is maddening
 * halfway through checking a unit. The URL survives a refresh and the back
 * button, and a link to one residence can be sent to someone else - none of
 * which a cached value would give, and there is no stale copy to go wrong.
 */
export const Route = createFileRoute("/admin/homes/")({
  component: InventoryPage,
  validateSearch: (search: Record<string, unknown>) => ({
    residence: typeof search["residence"] === "string" ? search["residence"] : "",
    // the unit to open at - how a resident's placement links straight to their bed
    ...(typeof search["unit"] === "string" && search["unit"] ? { unit: search["unit"] } : {}),
  }),
});

const STATUSES: { value: BedStatus; label: string }[] = [
  { value: "vacant", label: "Vacant" },
  { value: "held", label: "Reserved" },
  { value: "booked", label: "Booked" },
  // checked in and living there. A bed still marked "notice" is occupied too
  { value: "active", label: "Occupied" },
];

/**
 * The status pills. Vacant is also split by room, because "a free twin bed" and
 * "a free single room" are different questions - "vacant:twin" is a vacant bed
 * in a twin room.
 *
 * All three splits are listed, so they add up to Vacant. Whole-unit beds were
 * left out and their vacancies belonged to no split, which made the splits look
 * wrong against the total rather than incomplete.
 */
const PILLS: { value: string; label: string }[] = [
  { value: "vacant", label: "Vacant" },
  { value: "vacant:single", label: "Vacant single" },
  { value: "vacant:twin", label: "Vacant twin" },
  { value: "vacant:unit", label: "Vacant whole unit" },
  ...STATUSES.slice(1),
];

/** The four inventory statuses: a bed still marked "notice" counts as occupied. */
const inventoryStatus = (status: BedStatus) => (status === "notice" ? "active" : status);

function UnitGenderChip({ unit, residents }: { unit: Unit; residents: Resident[] }) {
  return <UnitGenderMark unit={unit} residents={residents} empty={<span>Any</span>} />;
}

function InventoryPage() {
  const { units, residents } = useOps();
  const queryClient = useQueryClient();

  /**
   * A bed held for a booking follows the booking rule: a student who has paid
   * keeps the bed until they are moved, and an unpaid booking loses its invoice
   * along with the room. A bed with no booking behind it is simply emptied.
   */
  async function release(bed: {
    id: string;
    enquiryId?: string | undefined;
    residentId?: string | undefined;
  }) {
    if (bed.enquiryId) {
      const released = await releaseBookingFor(
        queryClient,
        bed.enquiryId,
        "This resident has paid, so the bed is kept. To move them, Reserve another bed and pick them there.",
      );
      if (!released) return;
    } else if (bed.residentId) {
      /*
       * A resident with no booking behind the bed. The paid check above reads
       * the booking, so a bed whose booking had been dropped - a move used to
       * do exactly that - fell past it to vacateBed and the student lost their
       * room. Somebody in a bed is moved, never swept.
       */
      toast.error(
        "Somebody is in this bed. To move them, Reserve another bed and pick them there.",
      );
      return;
    }
    vacateBed(bed.id);
    toast.success("Bed released");
  }
  // the price list lives in Website; inventory quotes it rather than keeping
  // its own copy
  const { data: site } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });
  const roomTypes = (site as { rooms?: SiteRoomType[] } | undefined)?.rooms ?? NO_ROOM_TYPES;
  const [reserving, setReserving] = useState<(BedRow & { asSingle: boolean }) | null>(null);
  const [q, setQ] = useState("");
  const { residence, unit: focusUnit } = Route.useSearch();
  const navigate = useNavigate();
  const setResidence = (v: string) =>
    void navigate({ to: "/admin/homes", search: { residence: v } });
  const [block, setBlock] = useState("");
  const [unitType, setUnitType] = useState("");
  const [letter, setLetter] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  /**
   * The unit types this residence has, as Website describes them.
   *
   * The filter used to list four names written in the code. It now offers what
   * is actually configured, and matches on the number of bedrooms so an
   * imported "3-bedroom" is still found by "3-Bedroom Apartment".
   */
  const unitTypeOptions = useMemo(() => {
    const residenceId = units.find((u) => u.residenceName === residence)?.residenceId;
    const list = residenceId ? roomTypes.filter((r) => r.residence_id === residenceId) : roomTypes;
    return unitTypeNames(list).sort();
  }, [units, residence, roomTypes]);

  const blockOptions = useMemo(
    () => Array.from(new Set(units.map((u) => u.block).filter(Boolean))),
    [units],
  );
  const letterOptions = useMemo(
    () => Array.from(new Set(units.flatMap((u) => u.rooms.map((r) => r.letter)).filter(Boolean))),
    [units],
  );

  const rows = useMemo(() => {
    return allBeds(units).filter(({ unit, room, bed }) => {
      if (residence && unit.residenceName !== residence) return false;
      if (block && unit.block !== block) return false;
      // an imported "3-bedroom" and a configured "3-Bedroom Apartment" are the
      // same thing, so they are compared by how many bedrooms they have
      if (unitType && roomCountFor(unit.unitType) !== roomCountFor(unitType)) return false;
      if (letter && room.letter !== letter) return false;
      if (occupancy && room.occupancy !== occupancy) return false;
      if (gender && unit.gender !== gender) return false;
      const [wantStatus, wantOccupancy] = status.split(":");
      if (wantStatus && inventoryStatus(bed.status) !== wantStatus) return false;
      if (wantOccupancy && room.occupancy !== wantOccupancy) return false;
      if (from && bed.tenancyEnd && bed.tenancyEnd < from) return false;
      if (to && bed.tenancyStart && bed.tenancyStart > to) return false;
      if (q) {
        const hay =
          `${unit.code} ${unit.unitNo} ${room.letter} ${bed.label} ${bed.residentName ?? ""} ${
            bed.status === "vacant" ? "" : (bed.university ?? "")
          }`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [units, residence, block, unitType, letter, occupancy, gender, status, from, to, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.unit.id) ?? [];
      arr.push(r);
      map.set(r.unit.id, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  /**
   * Arriving from a resident's placement: open where their unit is.
   *
   * The router puts a new page at the top once it has drawn, so a scroll made
   * straight away is undone - it waits a moment, then jumps (no animation to be
   * interrupted). Once per unit, so working on the page does not keep pulling it back.
   */
  const scrolledTo = useRef("");
  const focusDrawn = grouped.some(([unitId]) => unitId === focusUnit);
  useEffect(() => {
    if (!focusUnit || !focusDrawn || scrolledTo.current === focusUnit) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`unit-${focusUnit}`)?.scrollIntoView({ block: "center" });
      scrolledTo.current = focusUnit;
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusUnit, focusDrawn]);

  // the pills count the residence being looked at, not every bed Brachtia owns
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { unit, room, bed } of allBeds(units)) {
      if (residence && unit.residenceName !== residence) continue;
      c["all"] = (c["all"] ?? 0) + 1;
      const s = inventoryStatus(bed.status);
      c[s] = (c[s] ?? 0) + 1;
      // every vacant bed falls in one split, whatever its room is sold as, so
      // the splits add up to Vacant
      if (bed.status === "vacant" && room.occupancy) {
        const key = `vacant:${room.occupancy}`;
        c[key] = (c[key] ?? 0) + 1;
      }
    }
    return c;
  }, [units, residence]);

  /**
   * One card per residence, with what is in it.
   *
   * Inventory used to open on every bed Brachtia owns, with a residence filter
   * buried among seven others. With two residences that was already hard to
   * read; with ten it would be useless. A residence is the first thing anyone
   * has in mind ("what is free at The Arc?"), so it is the first thing asked.
   */
  const residenceCards = useMemo(() => {
    const map = new Map<string, { units: number; beds: number; vacant: number }>();
    for (const unit of units) {
      const name = unit.residenceName || "Unnamed residence";
      const card = map.get(name) ?? { units: 0, beds: 0, vacant: 0 };
      card.units += 1;
      for (const room of unit.rooms) {
        for (const bed of room.beds) {
          if (bedBlockedBy(unit, room, bed)) continue;
          card.beds += 1;
          if (bed.status === "vacant") card.vacant += 1;
        }
      }
      map.set(name, card);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [units]);

  if (units.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No inventory yet"
        hint="Set up your first unit and its rooms — beds appear here with their occupancy and tenancy status."
        action={
          <Button asChild size="sm">
            <Link to="/admin/homes/units">Go to unit setup</Link>
          </Button>
        }
      />
    );
  }

  // nothing picked yet: choose a residence before looking at any bed
  if (!residence) {
    return (
      <div className="space-y-3">
        {residenceCards.map(([name, c]) => (
          <button
            key={name}
            type="button"
            onClick={() => setResidence(name)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-brand-deep"
          >
            <Building2 className="size-5 shrink-0 text-brand-deep" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-brand-deep">{name}</p>
              <p className="text-xs text-muted-foreground">
                {c.units} unit{c.units === 1 ? "" : "s"} · {c.beds} bed{c.beds === 1 ? "" : "s"} ·{" "}
                {c.vacant} vacant
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setResidence("")}
        className="flex items-center gap-1.5 text-sm font-medium text-brand-deep hover:underline"
      >
        <ChevronLeft className="size-4" /> All residences
      </button>
      <h2 className="text-lg font-bold text-brand-deep">{residence}</h2>

      <div className="flex flex-wrap gap-2">
        {/* the way back to everything, without hunting for the pressed pill */}
        <button
          type="button"
          onClick={() => setStatus("")}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            status === "" ? "border-brand-deep bg-brand-deep text-white" : "border-border bg-card"
          }`}
        >
          All · {counts["all"] ?? 0}
        </button>
        {PILLS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatus(status === s.value ? "" : s.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              status === s.value
                ? "border-brand-deep bg-brand-deep text-white"
                : "border-border bg-card"
            }`}
          >
            {s.label} · {counts[s.value] ?? 0}
          </button>
        ))}
      </div>

      <Panel>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Search</p>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Unit, room, resident…"
            />
          </div>
          <Select
            label="Block / floor"
            value={block}
            onChange={setBlock}
            options={blockOptions}
            placeholder="All"
          />
          <Select
            label="Unit type"
            value={unitType}
            onChange={setUnitType}
            options={unitTypeOptions}
            placeholder="All"
          />
          <Select
            label="Room"
            value={letter}
            onChange={setLetter}
            options={letterOptions}
            placeholder="All"
          />
          <Select
            label="Occupancy"
            value={occupancy}
            onChange={setOccupancy}
            options={[
              { value: "single", label: "Single" },
              { value: "twin", label: "Twin" },
            ]}
            placeholder="All"
          />
          <Select
            label="Gender"
            value={gender}
            onChange={setGender}
            options={GENDERS}
            placeholder="All"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Available from</p>
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">to</p>
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        {grouped.length === 0 ? (
          <EmptyState title="No beds match these filters" hint="Try clearing a filter." />
        ) : null}
        {grouped.map(([unitId, unitRows]) => {
          const unit = unitRows[0]!.unit;
          // a slot that cannot be sold is not shown at all - letting the whole
          // unit hides its rooms, exactly as a single room hides its twins
          const sellable = unitRows.filter(({ unit: u, room, bed }) => !bedBlockedBy(u, room, bed));
          const expanded = open[unitId] !== false;
          return (
            <div
              key={unitId}
              id={`unit-${unitId}`}
              className={`overflow-hidden rounded-2xl border bg-card ${
                unitId === focusUnit ? "border-brand ring-2 ring-brand/30" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [unitId]: !expanded }))}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-deep">
                    {/* the residence is named at the top of the page */}
                    {unit.unitNo}
                  </p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <span className="truncate">
                      {/* block and floor are already in the unit number above */}
                      {unit.code} · {unit.unitType} ·
                    </span>
                    <UnitGenderChip unit={unit} residents={residents} />
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {sellable.filter((r) => !isUnitSlot(r.room)).length} beds
                  {sellable.some((r) => isUnitSlot(r.room)) ? " · lettable whole" : ""}
                </span>
              </button>

              {expanded ? (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Room</th>
                        <th className="px-4 py-2 font-medium">Bed</th>
                        <th className="px-4 py-2 font-medium">Inventory status</th>
                        <th className="px-4 py-2 font-medium">Resident</th>
                        <th className="px-4 py-2 font-medium">University</th>
                        <th className="px-4 py-2 font-medium">Sponsor</th>
                        <th className="px-4 py-2 font-medium">Tenancy</th>
                        <th className="px-4 py-2 font-medium">Rent</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {collapseSingles(sellable, roomTypes).map(({ room, bed, asSingle }) => (
                        <tr key={bed.id}>
                          <td className="px-4 py-2 font-medium">
                            {isUnitSlot(room) ? "Whole unit" : `Room ${room.letter}`}
                          </td>
                          <td className="px-4 py-2">{asSingle ? "Single" : bed.label}</td>
                          <td className="px-4 py-2">
                            <StatusPill
                              status={inventoryStatus(bed.status)}
                              label={
                                inventoryStatus(bed.status) === "active" ? "Occupied" : undefined
                              }
                            />
                            {bed.status === "held" && bed.holdUntil ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                till {fmtDate(bed.holdUntil)}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2">
                            {(() => {
                              const person = residentForBed(residents, bed);
                              if (!person) return bed.residentName || bed.holdFor || "—";
                              return (
                                <Link
                                  to="/admin/residents/$id"
                                  params={{ id: person.id }}
                                  className="text-brand-deep underline-offset-2 hover:underline"
                                >
                                  {person.fullName || bed.residentName}
                                  {residentIdOf(person) ? (
                                    <span className="block text-xs tabular-nums text-muted-foreground">
                                      {residentIdOf(person)}
                                    </span>
                                  ) : null}
                                </Link>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {/* a vacant bed has nobody to study anywhere - nothing left over shows */}
                            {bed.status === "vacant"
                              ? "—"
                              : residentForBed(residents, bed)?.university || bed.university || "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {(() => {
                              const person = residentForBed(residents, bed);
                              if (!person) return "—";
                              return sponsorLabel(person.payerName || person.sponsor);
                            })()}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {bed.tenancyStart
                              ? `${fmtDate(bed.tenancyStart)} → ${fmtDate(bed.tenancyEnd)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-2">
                            {money(bedRent(roomTypes, unit, room, bed, asSingle))}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {bed.status === "vacant" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReserving({ unit, room, bed, asSingle })}
                              >
                                Reserve
                              </Button>
                            ) : (
                              /*
                               * An occupied bed holds a resident, and release()
                               * only guards a booking hold - an occupied bed with
                               * no enquiry went straight to vacateBed and the
                               * person lost their room. Moving somebody out is a
                               * checkout, not a release, so the button is shown
                               * and refused rather than hidden: hiding it looks
                               * like a bug to whoever went looking for it.
                               */
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={inventoryStatus(bed.status) === "active"}
                                title={
                                  inventoryStatus(bed.status) === "active"
                                    ? "Someone lives here - end their tenancy to free the bed"
                                    : undefined
                                }
                                onClick={() => void release(bed)}
                              >
                                Release
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {residents.length} resident{residents.length === 1 ? "" : "s"} on record.
      </p>
      {reserving ? (
        <ReserveBedDialog
          open
          onOpenChange={(v) => !v && setReserving(null)}
          unit={reserving.unit}
          room={reserving.room}
          bed={reserving.bed}
          residents={residents}
          units={units}
          asSingle={reserving.asSingle}
          singleRent={bedRent(roomTypes, reserving.unit, reserving.room, reserving.bed, true)}
          twinRent={bedRent(roomTypes, reserving.unit, reserving.room, reserving.bed, false)}
        />
      ) : null}
    </div>
  );
}
