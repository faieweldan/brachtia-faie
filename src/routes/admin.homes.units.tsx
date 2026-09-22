import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { listResidences } from "@/lib/admin.functions";
import { GenderMark } from "@/components/admin/GenderMark";
import { NO_ROOM_TYPES, typesOfUnitType, unitTypeNames } from "@/lib/room-types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState, Panel, Select, Text } from "@/components/admin/ops-ui";
import {
  bedsFor,
  blankRoom,
  money,
  nextUnitCode,
  roomCountFor,
  saveUnit,
  uid,
  useOps,
  type Occupancy,
  type Unit,
  type UnitRoom,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/homes/units")({
  component: UnitSetupPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const TEMPLATE_HEADERS = [
  "residence",
  "unit_no",
  "unit_type",
  "room_letter",
  "room_type_code",
  "occupancy",
];
/*
 * One row per room, and a unit is its rows together - they are grouped by
 * residence and unit_no. The residence has to be written the way Website names
 * it, or the rows are skipped. The last unit here is let whole: room_letter
 * "Unit" is how the master list records a unit taken by one party, and it needs
 * no room rows of its own.
 */
const TEMPLATE_ROWS = [
  ["The Arc, Cyberjaya", "A-12-10", "4-bedroom", "A", "A", "twin"],
  ["The Arc, Cyberjaya", "A-12-10", "4-bedroom", "B", "B", "single"],
  ["The Arc, Cyberjaya", "A-12-10", "4-bedroom", "C", "C", "single"],
  ["The Arc, Cyberjaya", "A-12-10", "4-bedroom", "D", "D", "single"],
  ["The Arc, Cyberjaya", "A-15-09", "3-bedroom", "Unit", "", "unit"],
];

function blankUnit(code: string): Unit {
  return {
    id: uid(),
    code,
    residenceId: "",
    residenceName: "",
    residenceSlug: "",
    unitNo: "",
    block: "",
    floor: "",
    unitType: "",
    gender: "",
    wholeUnit: false,
    wholeUnitRent: 0,
    notes: "",
    rooms: [],
  };
}

/** Gender designation is derived from the first resident placed in the unit. */
function derivedGender(unit: Unit) {
  for (const room of unit.rooms) {
    for (const bed of room.beds) {
      if (bed.residentName && bed.gender) return bed.gender;
    }
  }
  return "";
}

function UnitSetupPage() {
  const { units } = useOps();
  const [draft, setDraft] = useState<Unit | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  // the editor renders under the list, which is far off-screen once there are
  // dozens of units, so bring it into view when it opens
  const draftId = draft?.id;
  useEffect(() => {
    if (draftId) draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [draftId]);

  const { data } = useQuery({ queryKey: ["admin", "residences"], queryFn: () => listResidences() });
  const residences: any[] = (data as any)?.residences ?? [];
  const roomTypes: any[] = (data as any)?.rooms ?? NO_ROOM_TYPES;

  const [openRes, setOpenRes] = useState<Record<string, boolean>>({});

  const byResidence = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of units) {
      const key = u.residenceName || "Unassigned";
      map.set(key, [...(map.get(key) ?? []), u]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [units]);

  const totals = useMemo(
    () => ({
      ...statsFor(units),
      residences: new Set(units.map((u) => u.residenceName).filter(Boolean)).size,
    }),
    [units],
  );

  const typesForResidence = useMemo(
    () => (draft ? roomTypes.filter((r) => r.residence_id === draft.residenceId) : []),
    [draft, roomTypes],
  );

  /**
   * The unit types this residence actually has, taken from its room types in
   * Website.
   *
   * The list used to be four fixed strings - 4-bedroom, 3-bedroom, 2-bedroom,
   * Studio - written in the code. A residence with no 2-bedrooms still offered
   * one, and a residence with something else could not be described at all.
   * Website is where Brachtia says what a residence has, so it decides.
   */
  const unitTypeOptions = useMemo(
    () => unitTypeNames(typesForResidence).sort(),
    [typesForResidence],
  );

  /**
   * An imported unit type, answered with the configured one.
   *
   * The spreadsheet wrote "3-bedroom"; Website calls the same thing
   * "3-Bedroom Apartment". Left alone, both appear in the list and staff can
   * pick the one nothing is priced against. Matching on the number of bedrooms
   * swaps the old spelling for the configured one the moment a unit is opened,
   * so the settings win and the legacy name is never offered again.
   */
  function withConfiguredType(u: Unit): Unit {
    const names = unitTypeNames(roomTypes.filter((r) => r.residence_id === u.residenceId));
    if (!u.unitType || names.includes(u.unitType)) return u;
    const match = names.find((n) => roomCountFor(n) === roomCountFor(u.unitType));
    return match ? { ...u, unitType: match } : u;
  }

  /**
   * The room types belonging to the unit type being edited.
   *
   * The Arc has a Room A in its 3-bedroom and another Room A in its 4-bedroom,
   * at different prices. Offering both inside one unit invites picking the
   * wrong one, and the rent follows the choice.
   */
  const typesForUnitType = useMemo(
    () => typesOfUnitType(typesForResidence, draft?.unitType),
    [typesForResidence, draft?.unitType],
  );

  /**
   * A room type carries two prices: the whole room as a single, and the per-bed
   * rate when it is shared. Which one applies depends on how the room is being
   * let, so the caller passes that in - reading the default here priced every
   * twin bed at the whole-room rate.
   */
  function typeInfo(list: any[], code: string, want?: Occupancy) {
    const rt = list.find((r) => r.code === code || r.room_code === code);
    const fallback: "single" | "twin" =
      rt?.occupancies?.length === 1 && rt.occupancies[0] === "twin" ? "twin" : "single";
    const occ: "single" | "twin" = want === "twin" || want === "single" ? want : fallback;
    const rent = rt?.rent?.long?.[occ] ?? rt?.rent?.long?.single ?? 0;
    return { rt, occ, rent: Number(rent) || 0 };
  }

  function patch(p: Partial<Unit>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function patchRoom(roomId: string, p: Partial<UnitRoom>) {
    setDraft((d) =>
      d ? { ...d, rooms: d.rooms.map((r) => (r.id === roomId ? { ...r, ...p } : r)) } : d,
    );
  }

  /** Rooms (and their room types) are generated from the unit type. */
  function buildRooms(unitType: string, list: any[]): UnitRoom[] {
    const count = roomCountFor(unitType);
    // only the room types belonging to this unit type - a 3-bedroom unit must
    // not pick up Room A of the 4-bedroom, which is a different room at a
    // different price
    const pool = typesOfUnitType(list, unitType);
    return Array.from({ length: count }, (_, i) => {
      const letter = LETTERS[i] ?? String(i + 1);
      const match = pool.find((r) => (r.room_code ?? r.code) === letter) ?? pool[i] ?? null;
      const room = blankRoom(letter);
      if (!match) return room;
      const { occ, rent } = typeInfo(list, match.code);
      return { ...room, roomTypeCode: match.code, occupancy: occ, rent, beds: bedsFor(occ) };
    });
  }

  function applyType(unitType: string) {
    // a whole unit keeps its one Unit bed whatever the type says
    setDraft((d) =>
      d
        ? { ...d, unitType, rooms: d.wholeUnit ? d.rooms : buildRooms(unitType, typesForResidence) }
        : d,
    );
  }

  /**
   * A unit is let whole or by room, never both. Turning "Rent as whole unit" on
   * replaces the rooms with one Unit bed; turning it off brings the rooms back
   * from the unit type. Refused while someone is in a bed that would go.
   */
  function setWholeUnit(on: boolean) {
    if (!draft) return;
    const isSlot = (r: UnitRoom) => r.letter.toLowerCase() === "unit";
    const leaving = draft.rooms.filter((r) => (on ? !isSlot(r) : isSlot(r)));
    const taken = leaving.some((r) =>
      r.beds.some((b) => b.residentId || b.enquiryId || b.status !== "vacant"),
    );
    if (taken) {
      toast.error(
        on
          ? "Someone is in a room here - release them before letting the unit whole."
          : "Someone holds the whole unit - release them before letting it by room.",
      );
      return;
    }
    patch({
      wholeUnit: on,
      rooms: on
        ? [draft.rooms.find(isSlot) ?? blankRoom("Unit")]
        : buildRooms(draft.unitType, typesForResidence),
    });
  }

  function applyRoomType(roomId: string, code: string) {
    const room = draft?.rooms.find((r) => r.id === roomId);
    const { occ, rent } = typeInfo(typesForResidence, code, room?.occupancy);
    patchRoom(roomId, { roomTypeCode: code, occupancy: occ, rent, beds: bedsFor(occ) });
  }

  async function save() {
    if (!draft) return;
    if (!draft.residenceId || !draft.unitNo.trim()) {
      toast.error("Pick a residence and enter a unit number");
      return;
    }
    try {
      await saveUnit({ ...draft, gender: derivedGender(draft) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save unit");
      return;
    }
    toast.success("Unit saved");
    setDraft(null);
  }

  function writeUnitsFile(rows: string[][], fileName: string) {
    const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
    sheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
    for (let c = 0; c < TEMPLATE_HEADERS.length; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true } };
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Units");
    const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const url = URL.createObjectURL(
      new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** The blank form: the shape of the file, with a few rows showing how it reads. */
  function downloadTemplate() {
    writeUnitsFile(TEMPLATE_ROWS, "brachtia-units-template.xlsx");
  }

  /**
   * Every unit as it stands, in the same six columns.
   *
   * A unit is upserted on its residence and unit number, so this file can be
   * edited and uploaded back to change units that already exist - which a blank
   * template cannot do once there are 74 of them. A unit's rooms are rewritten
   * from the file, so a room left out of it is removed from that unit.
   */
  function downloadUnits() {
    const rows = units.flatMap((u) =>
      (u.rooms.length ? u.rooms : [null]).map((room) => [
        u.residenceName ?? "",
        u.unitNo ?? "",
        u.unitType ?? "",
        room?.letter ?? "Unit",
        room?.roomTypeCode ?? "",
        room?.occupancy ?? "unit",
      ]),
    );
    if (!rows.length) {
      toast.error("No units to export yet");
      return;
    }
    writeUnitsFile(rows, `brachtia-units-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${units.length} unit${units.length === 1 ? "" : "s"} exported`);
  }

  async function importWorkbook(file: File) {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = book.SheetNames[0];
    const sheet = sheetName ? book.Sheets[sheetName] : undefined;
    const raw: any[] = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
    const rows = raw.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r))
        out[String(k).trim().toLowerCase()] = String(v ?? "").trim();
      return out;
    });
    if (!rows.length) {
      toast.error("That file has no rows");
      return;
    }

    const groups = new Map<string, Record<string, string>[]>();
    for (const row of rows) {
      const key = `${row["residence"] ?? ""}|${row["unit_no"] ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    // one batch row per upload, so a bad import can be traced and undone
    let batchId: string | undefined;
    try {
      const { createImportBatch } = await import("@/lib/homes.functions");
      batchId = (
        await createImportBatch({
          data: { kind: "units", filename: file.name, rowCount: rows.length },
        })
      ).id;
    } catch {
      /* the import still works without a batch record */
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;
    let index = units.length;

    for (const group of groups.values()) {
      const first = group[0]!;
      const residenceName = first["residence"] ?? "";
      const res = residences.find(
        (r) => String(r.name).toLowerCase() === residenceName.toLowerCase(),
      );
      if (!res) {
        skipped += 1;
        continue;
      }
      const list = roomTypes.filter((r) => r.residence_id === res.id);
      // only this unit type's own room types. "4-bedroom" in the file and "4-Bedroom
      // Apartment" in Website are the same unit, so they are matched by bedrooms -
      // looking a letter up across the whole residence gave a 4-bedroom unit the
      // 3-bedroom's Room A
      const fileType = first["unit_type"] ?? "";
      const ownTypes = list.filter(
        (r) => roomCountFor(String(r.unit_type ?? "")) === roomCountFor(fileType),
      );
      const typesForUnit = ownTypes.length ? ownTypes : list;
      // and the unit is saved under the name Website uses for it
      const unitType = ownTypes.length
        ? String(ownTypes[0]!.unit_type ?? "") || fileType
        : fileType;
      const unit = blankUnit(`U${String(++index).padStart(3, "0")}`);
      unit.residenceId = res.id;
      unit.residenceName = res.name;
      unit.residenceSlug = res.slug ?? "";
      unit.unitNo = first["unit_no"] ?? "";
      unit.unitType = unitType;
      unit.rooms = group.map((row, i) => {
        const letter = row["room_letter"] || LETTERS[i] || String(i + 1);
        const code = row["room_type_code"] ?? "";
        const occRaw = (row["occupancy"] ?? "").toLowerCase();
        // "unit" marks the whole-unit letting, which the master list records as
        // Room "Unit" / Bed "Unit"
        const occ: Occupancy =
          occRaw === "unit" || letter.toLowerCase() === "unit"
            ? "unit"
            : occRaw === "twin"
              ? "twin"
              : occRaw === "single"
                ? "single"
                : typeInfo(typesForUnit, code).occ;
        // price for the way this room is actually let, not the type's default
        const info = typeInfo(typesForUnit, code, occ);
        return {
          ...blankRoom(letter),
          roomTypeCode: info.rt?.code ?? code,
          occupancy: occ,
          rent: info.rent,
          beds: bedsFor(occ),
        };
      });
      if (!unit.rooms.length) unit.rooms = buildRooms(unitType, typesForUnit);
      // a unit is let whole or by room, never both. A file that gives a unit
      // only a "Unit" row makes it a whole unit. One that gives it rooms as well
      // is carrying an old whole-unit letting from the master list's history
      // (a unit files built from every row, Inactive ones included, did exactly
      // that) - so the rooms win and the stray Unit row is dropped
      const wholeRows = unit.rooms.filter((r) => r.letter.toLowerCase() === "unit");
      const roomRows = unit.rooms.filter((r) => r.letter.toLowerCase() !== "unit");
      unit.rooms = roomRows.length ? roomRows : wholeRows.slice(0, 1);
      unit.wholeUnit = !roomRows.length && wholeRows.length > 0;
      try {
        await saveUnit(unit, batchId);
        created += 1;
      } catch {
        failed += 1;
      }
    }

    toast.success(
      `${created} unit${created === 1 ? "" : "s"} imported` +
        (skipped ? ` · ${skipped} skipped (residence not found)` : "") +
        (failed ? ` · ${failed} failed` : ""),
    );
  }

  const editor = draft ? (
    <div ref={draftRef}>
      <Panel title={`Unit ${draft.code}`} description="Unit details and bed configuration.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Residence"
            value={draft.residenceId}
            onChange={(v) => {
              const r = residences.find((x) => x.id === v);
              const list = roomTypes.filter((t) => t.residence_id === v);
              patch({
                residenceId: v,
                residenceName: r?.name ?? "",
                residenceSlug: r?.slug ?? "",
                rooms: draft.unitType ? buildRooms(draft.unitType, list) : [],
              });
            }}
            options={residences.map((r) => ({ value: r.id, label: r.name }))}
            placeholder={
              residences.length ? "Select residence" : "Add a residence in Website first"
            }
          />
          <Text
            label="Unit number"
            value={draft.unitNo}
            onChange={(v) => patch({ unitNo: v })}
            placeholder="A-07-01"
          />
          <Select
            label="Unit type"
            value={draft.unitType}
            onChange={applyType}
            options={unitTypeOptions}
            placeholder={
              unitTypeOptions.length ? "Select" : "Add room types for this residence in Website"
            }
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Gender designation:{" "}
          <span className="font-medium text-foreground">
            {derivedGender(draft) || "Set automatically from the first resident"}
          </span>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted p-3">
          <Switch checked={draft.wholeUnit} onCheckedChange={setWholeUnit} id="whole-unit" />
          <Label htmlFor="whole-unit" className="text-sm">
            Rent as whole unit
          </Label>
          {draft.wholeUnit ? (
            <div className="w-40">
              <Text
                label="Whole unit rent (RM/mo)"
                type="number"
                value={String(draft.wholeUnitRent || "")}
                onChange={(v) => patch({ wholeUnitRent: Number(v) || 0 })}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Off — beds are rented individually.</p>
          )}
        </div>

        {!draft.wholeUnit ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-brand-deep">Bed configuration</p>
            {draft.rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground">Choose a unit type to generate rooms.</p>
            ) : null}
            {draft.rooms.map((room) => (
              <div key={room.id} className="rounded-xl border border-border p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-brand-deep">
                    {room.letter}
                  </span>
                  <p className="text-sm font-medium text-brand-deep">Room {room.letter}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    label="Room type"
                    value={room.roomTypeCode}
                    onChange={(v) => applyRoomType(room.id, v)}
                    options={typesForUnitType.map((t) => ({
                      value: t.code,
                      label: t.name,
                    }))}
                    placeholder={
                      typesForUnitType.length ? "Select room type" : "No room types set up"
                    }
                  />

                  <Select
                    label="Occupancy"
                    value={room.occupancy}
                    onChange={(v) => {
                      // the rate follows the way the room is let
                      const { rent } = typeInfo(
                        typesForResidence,
                        room.roomTypeCode,
                        v as Occupancy,
                      );
                      patchRoom(room.id, {
                        occupancy: v as Occupancy,
                        rent,
                        beds: bedsFor(v as "single" | "twin"),
                      });
                    }}
                    options={[
                      { value: "single", label: "Single" },
                      { value: "twin", label: "Twin sharing" },
                    ]}
                  />
                  <Text
                    label="Rent (RM/mo)"
                    type="number"
                    value={String(room.rent || "")}
                    onChange={(v) => patchRoom(room.id, { rent: Number(v) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    Beds: {room.beds.map((b) => b.label).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button size="sm" onClick={save}>
            Save unit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <Panel
        title="Units"
        description="Room types, occupancy and rent come from the Website module, so pricing stays in one place."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="mr-1 size-4" /> Template
            </Button>
            <Button size="sm" variant="outline" onClick={downloadUnits}>
              <Download className="mr-1 size-4" /> Export units
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 size-4" /> Bulk upload
            </Button>
            <Button size="sm" onClick={() => setDraft(blankUnit(nextUnitCode(units)))}>
              <Plus className="mr-1 size-4" /> Add unit
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importWorkbook(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        {units.length > 0 ? (
          // every residence together
          <StatStrip
            className="mb-4 sm:grid-cols-5"
            items={[
              { label: "Units", value: totals.units },
              { label: "Rooms", value: totals.rooms },
              { label: "Beds", value: totals.beds },
              { label: "Whole unit", value: totals.whole },
              { label: "Residences", value: totals.residences },
            ]}
          />
        ) : null}

        {units.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No units yet"
            hint="Add a unit or bulk upload with the Excel template. Rooms, beds and rent fill in automatically from the unit type."
          />
        ) : (
          <div className="space-y-2">
            {byResidence.map(([residence, list]) => {
              const open = openRes[residence] ?? byResidence.length === 1;
              return (
                <div key={residence} className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenRes((o) => ({ ...o, [residence]: !open }))}
                    className="flex w-full items-center gap-3 bg-muted px-4 py-3 text-left"
                  >
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                    <span className="flex-1 truncate text-sm font-semibold text-brand-deep">
                      {residence}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {list.length} unit{list.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {open ? (
                    <div className="divide-y divide-border px-4">
                      {/* this residence on its own */}
                      <div className="py-3">
                        {(() => {
                          const s = statsFor(list);
                          return (
                            <StatStrip
                              className="sm:grid-cols-4"
                              items={[
                                { label: "Units", value: s.units },
                                { label: "Rooms", value: s.rooms },
                                { label: "Beds", value: s.beds },
                                { label: "Whole unit", value: s.whole },
                              ]}
                            />
                          );
                        })()}
                      </div>
                      {list.map((u) => (
                        <div key={u.id}>
                          <div className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-deep">
                                {/* the residence is the dropdown it sits in */}
                                <span className="truncate">{u.unitNo}</span>
                                {/* who is in it, said the way every other page says it */}
                                <GenderMark
                                  gender={derivedGender(u)}
                                  title={`${derivedGender(u)} unit`}
                                />
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {u.code} · {u.unitType || "No type"} ·{" "}
                                {u.wholeUnit
                                  ? `Whole unit ${money(u.wholeUnitRent)}`
                                  : `${u.rooms.length} rooms / ${u.rooms.reduce((n, r) => n + r.beds.length, 0)} beds`}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDraft(withConfiguredType(u))}
                            >
                              Edit
                            </Button>
                          </div>
                          {draft?.id === u.id ? <div className="pb-4">{editor}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* a brand new unit has no row to sit under, so it opens below the list */}
      {draft && !units.some((u) => u.id === draft.id) ? <div ref={draftRef}>{editor}</div> : null}
    </div>
  );
}

/** Units, rooms, beds and whole-unit lets in a set of units - all of them, or one residence. */
function statsFor(list: Unit[]) {
  const lettable = list.flatMap((u) => u.rooms).filter((r) => r.letter.toLowerCase() !== "unit");
  return {
    units: list.length,
    rooms: lettable.length,
    beds: lettable.reduce((n, r) => n + r.beds.length, 0),
    whole: list.filter((u) => u.wholeUnit).length,
  };
}

/** The row of counts shown above the units, and inside each residence. */
function StatStrip({
  items,
  className = "",
}: {
  items: { label: string; value: number }[];
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border ${className}`}
    >
      {items.map((s) => (
        <div key={s.label} className="bg-card px-4 py-3">
          <p className="text-lg font-semibold tabular-nums text-brand-deep">{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
