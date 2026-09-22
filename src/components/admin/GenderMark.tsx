import type { ReactNode } from "react";

import { unitGender, type Resident, type Unit } from "@/lib/ops-store";

/**
 * M or F in a coloured circle.
 *
 * The same mark sits on a unit and on a student, so matching a student to a
 * unit is a glance rather than a read - men and women never share a unit.
 * Nothing is drawn when the gender is not known.
 */
export function GenderMark({ gender, title }: { gender?: string | undefined; title?: string }) {
  const letter = (gender ?? "").trim().charAt(0).toUpperCase();
  if (letter !== "M" && letter !== "F") return null;
  const word = letter === "M" ? "Male" : "Female";
  return (
    <span
      role="img"
      aria-label={word}
      title={title ?? word}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        letter === "M" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
      }`}
    >
      {letter}
    </span>
  );
}

/**
 * A unit's gender: whoever lives in it or holds a bed there, or failing that the
 * gender it is reserved for. A unit that is somehow already mixed is flagged,
 * so it can be found and put right. `empty` is shown when there is neither.
 */
export function UnitGenderMark({
  unit,
  residents,
  empty = null,
}: {
  unit: Unit;
  residents: Resident[];
  empty?: ReactNode;
}) {
  const taken = unitGender(unit, residents);
  if (taken === "Mixed") {
    return (
      <span className="rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-700">
        Mixed
      </span>
    );
  }
  const gender = taken || unit.gender;
  if (!/^[MF]/i.test((gender ?? "").trim())) return <>{empty}</>;
  return (
    <GenderMark
      gender={gender}
      title={taken ? `${taken} - set by who lives here` : `Reserved for ${unit.gender}`}
    />
  );
}
