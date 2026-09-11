import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { ReserveBedDialog } from "@/components/admin/ReserveBedDialog";
import {
  bedBlockedBy,
  type BedRow,
  type Unit,
  type Resident,
  residentForBed,
  GENDERS,
  UNIT_TYPES,
  allBeds,
  fmtDate,
  money,
  updateBed,
  useOps,
  type BedStatus,
  sponsorLabel,
  unitGender,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/homes/")({
  component: InventoryPage,
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

function InventoryPage() {
  const { units, residents } = useOps();
  const [reserving, setReserving] = useState<BedRow | null>(null);
  const [q, setQ] = useState("");
  const [residence, setResidence] = useState("");
  const [block, setBlock] = useState("");
  const [unitType, setUnitType] = useState("");
  const [letter, setLetter] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const residenceOptions = useMemo(
    () => Array.from(new Set(units.map((u) => u.residenceName).filter(Boolean))),
    [units],
  );
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
      if (unitType && unit.unitType !== unitType) return false;
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { bed } of allBeds(units)) c[bed.status] = (c[bed.status] ?? 0) + 1;
    return c;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
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
            label="Residence"
            value={residence}
            onChange={setResidence}
            options={residenceOptions}
            placeholder="All"
          />
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
            options={UNIT_TYPES}
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
                      {unit.code} · {unit.unitType} · {unit.block || "—"} ·
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
                      {sellable.map(({ room, bed }) => (
                        <tr key={bed.id}>
                          <td className="px-4 py-2 font-medium">
                            {room.letter.toLowerCase() === "unit"
                              ? "Whole unit"
                              : `Room ${room.letter}`}
                          </td>
                          <td className="px-4 py-2">{bed.label}</td>
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
                            {money(
                              bed.rent ??
                                (room.letter.toLowerCase() === "unit"
                                  ? unit.wholeUnitRent
                                  : room.rent),
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {bed.status === "vacant" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReserving({ unit, room, bed })}
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
                                    holdFor: undefined,
                                    holdUntil: undefined,
                                    tenancyStart: undefined,
                                    tenancyEnd: undefined,
                                  });
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
        />
      ) : null}
    </div>
  );
}
