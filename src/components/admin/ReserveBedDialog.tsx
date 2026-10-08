import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { placeStay } from "@/lib/homes.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenderMark, UnitGenderMark } from "@/components/admin/GenderMark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  findBedForResident,
  isUnitSlot,
  money,
  refreshUnits,
  unitAccepts,
  type Bed,
  type Resident,
  type Unit,
  type UnitRoom,
  residentIdOf,
} from "@/lib/ops-store";

/**
 * Reserve a bed for a resident, the same move the booking flow makes - only
 * from the inventory side, where you are looking at the room rather than the
 * student.
 *
 * The reservation writes the resident's QuickBooks id onto the bed, which is the
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
  asSingle = false,
  singleRent = 0,
  twinRent = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  room: UnitRoom;
  bed: Bed;
  residents: Resident[];
  units: Unit[];
  /** the room is empty and was listed as a single, so the choice is still open */
  asSingle?: boolean;
  singleRent?: number;
  twinRent?: number;
}) {
  const [q, setQ] = useState("");
  /**
   * Whole room or one bed - the same click means both, so it is asked here.
   *
   * The row said "Single", but a student who wanted a twin can be put in the
   * same room; the admin only knows which at this moment. Whole room blocks the
   * other bed, one bed leaves it for sale.
   */
  const [mode, setMode] = useState<"single" | "twin">("single");
  const others = room.beds.filter((b) => b.id !== bed.id);

  /**
   * Someone who already has a bed can still be chosen - that is a room move -
   * but they are listed apart, because picking them frees their old bed.
   */
  const { waiting, placed } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: Resident) =>
      !needle ||
      `${r.fullName} ${r.residentCode} ${r.quickbooksId} ${r.email} ${r.university}`
        .toLowerCase()
        .includes(needle);

    const waiting: { person: Resident; from?: undefined }[] = [];
    const placed: { person: Resident; from: string }[] = [];
    for (const r of residents) {
      if (!match(r)) continue;
      if (r.status && r.status.toLowerCase() === "inactive") continue;
      // men and women never share a unit, so only those this unit can take are offered
      if (!unitAccepts(unit, residents, r.gender)) continue;
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
  }, [residents, units, unit, q, bed.id]);

  /**
   * Placed by the server, the same operation the booking's room picker uses
   * (9 Oct 2026): it leaves their old bed, checks this one for their dates,
   * and writes both in one go - or says no, and nothing changes.
   */
  async function reserve(person: Resident, from?: string) {
    // let whole: the other bed stops being sellable, because it was sold too
    const whole = asSingle && mode === "single";
    const res = await placeStay({
      data: {
        residentId: person.id,
        ...(person.enquiryId ? { enquiryId: person.enquiryId } : {}),
        bedId: bed.id,
        whole,
      },
    }).catch((err: unknown) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : "The room could not be reserved.",
      detail: "",
    }));
    await refreshUnits();
    if (!res.ok) {
      toast.error(res.error, res.detail ? { description: res.detail } : undefined);
      return;
    }
    const what = whole ? `Room ${room.letter}` : bed.label;
    toast.success(
      from
        ? `${person.fullName || "Resident"} moved from ${from} to ${what}`
        : `${what} reserved for ${person.fullName || "resident"}${whole ? " as a single" : ""}`,
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
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {unit.residenceName} · {unit.unitNo} ·{" "}
              {isUnitSlot(room) ? "Whole unit" : `Room ${room.letter}`} · {bed.label}
            </span>
            {/* the unit's gender, to match against the students below */}
            <UnitGenderMark unit={unit} residents={residents} />
          </DialogDescription>
        </DialogHeader>

        {/* the price says which is which - no sentence needed */}
        {asSingle ? (
          <div className="flex gap-2">
            {(
              [
                { value: "single", label: "Single", rent: singleRent },
                { value: "twin", label: "Twin", rent: twinRent },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={`flex-1 rounded-xl border px-3 py-2 text-center transition-colors ${
                  mode === o.value
                    ? "border-brand-deep bg-brand-deep text-white"
                    : "border-border bg-card"
                }`}
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs opacity-70">{money(o.rent)}</span>
              </button>
            ))}
          </div>
        ) : null}

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
              <Group title="Waiting for a bed" rows={waiting} onPick={(p, f) => void reserve(p, f)} />
              <Group
                title="Already placed — moving them frees their bed"
                rows={placed}
                onPick={(p, f) => void reserve(p, f)}
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
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <GenderMark gender={person.gender} />
                <span className="truncate">
                  {from
                    ? `Currently in ${from}`
                    : [
                        residentIdOf(person) && `ID ${residentIdOf(person)}`,
                        person.university,
                        person.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
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
