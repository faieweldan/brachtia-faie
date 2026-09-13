import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { listResidences } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { ReserveBedDialog } from "@/components/admin/ReserveBedDialog";
import {
  SOLD_AS_SINGLE,
  bedBlockedBy,
  type BedRow,
  type Unit,
  type Resident,
  residentForBed,
  GENDERS,
  allBeds,
  roomCountFor,
  fmtDate,
  money,
  updateBed,
  useOps,
  type BedStatus,
  sponsorLabel,
  unitGender,
} from "@/lib/ops-store";

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
  }),
});

const STATUSES: { value: BedStatus; label: string }[] = [
  { value: "vacant", label: "Vacant" },
  { value: "held", label: "Reserved" },
  { value: "booked", label: "Booked" },
  { value: "active", label: "Active" },
  { value: "notice", label: "Notice / expiring" },
];

function UnitGenderChip({ unit, residents }: { unit: Unit; residents: Resident[] }) {
  const g = unitGender(unit, residents);
  if (!g) return <span>{unit.gender || "Any"}</span>;
  if (g === "Mixed") {
    return (
      <span className="rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-700">
        Mixed
      </span>
    );
  }
  const letter = g === "Male" ? "M" : "F";
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        letter === "M" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
      }`}
      title={`${g} - set by the first resident to move in`}
    >
      {letter}
    </span>
  );
}

/**
 * What one bed costs, by the prices set in Website.
 *
 * A room carries two rates: the whole room to one person, and the per-bed rate
 * when it is shared. The stored room rent is a single number and could only
 * ever hold one of them, so every vacant twin was showing the single rate -
 * RM1,050 against a bed that is sold at RM550.
 *
 * The bed's own rent wins when it has one, because that is a real tenancy at an
 * agreed price (including anything bulk-uploaded) and must not move when the
 * price list changes. A vacant bed has no such promise, so it quotes today's
 * configured rate.
 */
/** Only the part of a Website room type a price is read from. */
type SiteRoomType = {
  code: string;
  residence_id?: string | undefined;
  unit_type?: string | undefined;
  occupancies?: string[] | undefined;
  rent?: { long?: { single?: number | null; twin?: number | null } } | undefined;
};

/**
 * An empty twin room, offered as a single.
 *
 * While both beds are free the room can still be sold whole to one person, so
 * it is listed once as "Single" at the single rate. The moment either bed is
 * taken that choice is gone, and the room goes back to being twin beds at the
 * twin rate. Nothing is stored: the rows follow who is actually in the room.
 *
 * The admin keeps the last word. Reserving the single row reserves the first
 * bed, so a student who asked for a twin can be put in it and the room simply
 * becomes twin again.
 */
function collapseSingles(
  rows: BedRow[],
  roomTypes: SiteRoomType[],
): (BedRow & { asSingle: boolean })[] {
  const byRoom = new Map<string, BedRow[]>();
  for (const r of rows) byRoom.set(r.room.id, [...(byRoom.get(r.room.id) ?? []), r]);

  const out: (BedRow & { asSingle: boolean })[] = [];
  for (const group of byRoom.values()) {
    const room = group[0]!.room;
    const rt = roomTypes.find((t) => t.code === room.roomTypeCode);
    const offersSingle = (rt?.occupancies ?? []).includes("single");

    // already let to one person: that is one let, so it is one row. The bed
    // held to keep the room empty is not a thing anybody can act on, and
    // listing it only invites someone to release it by mistake.
    const blocked = group.filter((g) => g.bed.holdFor === SOLD_AS_SINGLE);
    if (blocked.length) {
      const taken = group.find((g) => g.bed.holdFor !== SOLD_AS_SINGLE);
      if (taken) out.push({ ...taken, asSingle: true });
      else for (const g of group) out.push({ ...g, asSingle: false });
      continue;
    }

    const wholeRoomFree = group.length > 1 && group.every((g) => g.bed.status === "vacant");
    if (offersSingle && wholeRoomFree && room.letter.toLowerCase() !== "unit") {
      out.push({ ...group[0]!, asSingle: true });
    } else {
      for (const g of group) out.push({ ...g, asSingle: false });
    }
  }
  return out;
}

function bedRent(
  roomTypes: SiteRoomType[],
  unit: Unit,
  room: { letter: string; occupancy: string; rent: number; roomTypeCode: string },
  bed: { rent?: number | undefined },
  asSingle = false,
) {
  if (bed.rent != null) return bed.rent;
  if (room.letter.toLowerCase() === "unit") return unit.wholeUnitRent;
  const rt = roomTypes.find((r) => r.code === room.roomTypeCode);
  // a whole empty room quoted as a single is priced as one, whatever the room
  // is normally sold as
  const want = asSingle ? "single" : room.occupancy === "twin" ? "twin" : "single";
  const rate = rt?.rent?.long?.[want];
  return Number(rate) || room.rent;
}

function InventoryPage() {
  const { units, residents } = useOps();
  // the price list lives in Website; inventory quotes it rather than keeping
  // its own copy
  const { data: site } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });
  const roomTypes: SiteRoomType[] = (site as { rooms?: SiteRoomType[] } | undefined)?.rooms ?? [];
  const [reserving, setReserving] = useState<(BedRow & { asSingle?: boolean }) | null>(null);
  const [q, setQ] = useState("");
  const { residence } = Route.useSearch();
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
    return Array.from(
      new Set(list.map((r) => String(r.unit_type ?? "").trim()).filter(Boolean)),
    ).sort();
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
      if (status && bed.status !== status) return false;
      if (from && bed.tenancyEnd && bed.tenancyEnd < from) return false;
      if (to && bed.tenancyStart && bed.tenancyStart > to) return false;
      if (q) {
        const hay =
          `${unit.code} ${unit.unitNo} ${room.letter} ${bed.label} ${bed.residentName ?? ""} ${
            bed.university ?? ""
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

  // the pills count the residence being looked at, not every bed Brachtia owns
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { unit, bed } of allBeds(units)) {
      if (residence && unit.residenceName !== residence) continue;
      c[bed.status] = (c[bed.status] ?? 0) + 1;
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
          All · {STATUSES.reduce((n, s) => n + (counts[s.value] ?? 0), 0)}
        </button>
        {STATUSES.map((s) => (
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
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">to</p>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
            <div key={unitId} className="overflow-hidden rounded-2xl border border-border bg-card">
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
                    {unit.residenceName} · {unit.unitNo}
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
                  {sellable.filter((r) => r.room.letter.toLowerCase() !== "unit").length} beds
                  {sellable.some((r) => r.room.letter.toLowerCase() === "unit")
                    ? " · lettable whole"
                    : ""}
                </span>
              </button>

              {expanded ? (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Room</th>
                        <th className="px-4 py-2 font-medium">Bed</th>
                        <th className="px-4 py-2 font-medium">Status</th>
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
                            {room.letter.toLowerCase() === "unit"
                              ? "Whole unit"
                              : `Room ${room.letter}`}
                          </td>
                          <td className="px-4 py-2">{asSingle ? "Single" : bed.label}</td>
                          <td className="px-4 py-2">
                            <StatusPill status={bed.status} />
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
                                </Link>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {bed.university ?? "—"}
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
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  updateBed(bed.id, {
                                    status: "vacant",
                                    residentId: undefined,
                                    residentName: undefined,
                                    // the student's own details leave with the
                                    // student - an empty bed has no university
                                    studentId: undefined,
                                    university: undefined,
                                    nationality: undefined,
                                    gender: undefined,
                                    holdFor: undefined,
                                    holdUntil: undefined,
                                    tenancyStart: undefined,
                                    tenancyEnd: undefined,
                                    rent: undefined,
                                  });
                                  // the room was let whole, so the bed it was
                                  // blocking goes back on sale with it
                                  for (const other of room.beds) {
                                    if (other.id !== bed.id && other.holdFor === SOLD_AS_SINGLE) {
                                      updateBed(other.id, {
                                        status: "vacant",
                                        holdFor: undefined,
                                        holdUntil: undefined,
                                      });
                                    }
                                  }
                                  toast.success("Bed released");
                                }}
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
          asSingle={!!reserving.asSingle}
          singleRent={bedRent(roomTypes, reserving.unit, reserving.room, reserving.bed, true)}
          twinRent={bedRent(roomTypes, reserving.unit, reserving.room, reserving.bed, false)}
        />
      ) : null}
    </div>
  );
}
