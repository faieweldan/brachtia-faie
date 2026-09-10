import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  findBedForResident,
  updateBed,
  type Bed,
  type Resident,
  type Unit,
  type UnitRoom,
} from "@/lib/ops-store";

/**
 * Reserve a bed for a resident, the same move the booking flow makes - only
 * from the inventory side, where you are looking at the room rather than the
 * student.
 *
 * The reservation writes the resident's legacy id onto the bed, which is the
 * one record of a placement.
 */
export function ReserveBedDialog({
  open,
  onOpenChange,
  unit,
  room,
  bed,
  residents,
  units,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  room: UnitRoom;
  bed: Bed;
  residents: Resident[];
  units: Unit[];
}) {
  const [q, setQ] = useState("");

  /**
   * Someone who already has a bed can still be chosen - that is a room move -
   * but they are listed apart, because picking them frees their old bed.
   */
  const { waiting, placed } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: Resident) =>
      !needle ||
      `${r.fullName} ${r.legacyId} ${r.email} ${r.university}`.toLowerCase().includes(needle);

    const waiting: { person: Resident; from?: undefined }[] = [];
    const placed: { person: Resident; from: string }[] = [];
    for (const r of residents) {
      if (!match(r)) continue;
      if (r.status && r.status.toLowerCase() === "inactive") continue;
      const row = findBedForResident(units, r);
      if (row) {
        if (row.bed.id === bed.id) continue; // already in this very bed
        placed.push({
          person: r,
          from: `${row.unit.unitNo} · Room ${row.room.letter} · ${row.bed.label}`,
        });
      } else {
        waiting.push({ person: r });
      }
    }
    return { waiting: waiting.slice(0, 40), placed: placed.slice(0, 20) };
  }, [residents, units, q, bed.id]);

  function reserve(person: Resident, from?: string) {
    // a move: empty the bed they are leaving, so nobody is in two places
    const current = findBedForResident(units, person);
    if (current) {
      updateBed(current.bed.id, {
        status: "vacant",
        residentId: undefined,
        residentName: undefined,
        tenancyStart: undefined,
        tenancyEnd: undefined,
        rent: undefined,
      });
    }
    updateBed(bed.id, {
      status: "held",
      residentId: person.legacyId || person.id,
      residentName: person.fullName,
      university: person.university || undefined,
      nationality: person.nationality || undefined,
      gender: person.gender || undefined,
    });
    toast.success(
      from
        ? `${person.fullName || "Resident"} moved from ${from} to ${bed.label}`
        : `${bed.label} reserved for ${person.fullName || "resident"}`,
    );
    onOpenChange(false);
    setQ("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-ui max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">
            Reserve this bed
          </DialogTitle>
          <DialogDescription>
            {unit.residenceName} · {unit.unitNo} ·{" "}
            {room.letter.toLowerCase() === "unit" ? "Whole unit" : `Room ${room.letter}`} ·{" "}
            {bed.label}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ID, email…"
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-auto rounded-xl border border-border">
          {waiting.length === 0 && placed.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No resident matches that search.
            </p>
          ) : (
            <>
              <Group title="Waiting for a bed" rows={waiting} onPick={reserve} />
              <Group
                title="Already placed — moving them frees their bed"
                rows={placed}
                onPick={reserve}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: { person: Resident; from?: string | undefined }[];
  onPick: (person: Resident, from?: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <>
      <p className="sticky top-0 bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <ul className="divide-y divide-border">
        {rows.map(({ person, from }) => (
          <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {person.fullName || "Unnamed resident"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {from
                  ? `Currently in ${from}`
                  : [person.legacyId && `ID ${person.legacyId}`, person.university, person.email]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(person, from)}>
              {from ? "Move here" : "Reserve"}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
