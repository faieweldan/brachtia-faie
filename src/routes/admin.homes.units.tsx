import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { listResidences } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState, Panel, Select, Text } from "@/components/admin/ops-ui";
import {
  UNIT_TYPES,
  bedsFor,
  blankRoom,
  deleteUnit,
  money,
  nextUnitCode,
  roomCountFor,
  saveUnit,
  uid,
  useOps,
  type Unit,
  type UnitRoom,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/homes/units")({
  component: UnitSetupPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const TEMPLATE_HEADERS = "residence,unit_no,unit_type,room_letter,room_type_code,occupancy,rent";
const TEMPLATE_ROWS = [
  "The Arc Cyberjaya,A-12-10,4-bedroom,A,A,twin,1050",
  "The Arc Cyberjaya,A-12-10,4-bedroom,B,B,single,850",
  "The Arc Cyberjaya,A-12-10,4-bedroom,C,C,single,750",
  "The Arc Cyberjaya,A-12-10,4-bedroom,D,D,single,750",
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

  const { data } = useQuery({ queryKey: ["admin", "residences"], queryFn: () => listResidences() });
  const residences: any[] = (data as any)?.residences ?? [];
  const roomTypes: any[] = (data as any)?.rooms ?? [];

  const typesForResidence = useMemo(
    () => (draft ? roomTypes.filter((r) => r.residence_id === draft.residenceId) : []),
    [draft, roomTypes],
  );

  function typeInfo(list: any[], code: string) {
    const rt = list.find((r) => r.code === code || r.room_code === code);
    const occ: "single" | "twin" =
      rt?.occupancies?.length === 1 && rt.occupancies[0] === "twin" ? "twin" : "single";
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
    return Array.from({ length: count }, (_, i) => {
      const letter = LETTERS[i] ?? String(i + 1);
      const match =
        list.find((r) => (r.room_code ?? r.code) === letter) ?? list[i] ?? null;
      const room = blankRoom(letter);
      if (!match) return room;
      const { occ, rent } = typeInfo(list, match.code);
      return { ...room, roomTypeCode: match.code, occupancy: occ, rent, beds: bedsFor(occ) };
    });
  }

  function applyType(unitType: string) {
    setDraft((d) => (d ? { ...d, unitType, rooms: buildRooms(unitType, typesForResidence) } : d));
  }

  function applyRoomType(roomId: string, code: string) {
    const { occ, rent } = typeInfo(typesForResidence, code);
    patchRoom(roomId, { roomTypeCode: code, occupancy: occ, rent, beds: bedsFor(occ) });
  }

  function save() {
    if (!draft) return;
    if (!draft.residenceId || !draft.unitNo.trim()) {
      toast.error("Pick a residence and enter a unit number");
      return;
    }
    saveUnit({ ...draft, gender: derivedGender(draft) });
    toast.success("Unit saved");
    setDraft(null);
  }

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "brachtia-units-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("That file has no rows");
      return;
    }
    const head = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    const col = (row: string[], key: string) => (row[head.indexOf(key)] ?? "").trim();

    const groups = new Map<string, string[][]>();
    for (const line of lines.slice(1)) {
      const row = line.split(",");
      const key = `${col(row, "residence")}|${col(row, "unit_no")}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    let created = 0;
    let skipped = 0;
    let index = units.length;

    for (const rows of groups.values()) {
      const first = rows[0]!;
      const residenceName = col(first, "residence");
      const res = residences.find(
        (r) => String(r.name).toLowerCase() === residenceName.toLowerCase(),
      );
      if (!res) {
        skipped += 1;
        continue;
      }
      const list = roomTypes.filter((r) => r.residence_id === res.id);
      const unitType = col(first, "unit_type");
      const unit = blankUnit(`U${String(++index).padStart(3, "0")}`);
      unit.residenceId = res.id;
      unit.residenceName = res.name;
      unit.residenceSlug = res.slug ?? "";
      unit.unitNo = col(first, "unit_no");
      unit.unitType = unitType;
      unit.rooms = rows.map((row, i) => {
        const letter = col(row, "room_letter") || LETTERS[i] || String(i + 1);
        const code = col(row, "room_type_code");
        const info = typeInfo(list, code);
        const occRaw = col(row, "occupancy").toLowerCase();
        const occ: "single" | "twin" = occRaw === "twin" ? "twin" : occRaw === "single" ? "single" : info.occ;
        const rentRaw = Number(col(row, "rent"));
        return {
          ...blankRoom(letter),
          roomTypeCode: info.rt?.code ?? code,
          occupancy: occ,
          rent: Number.isFinite(rentRaw) && rentRaw > 0 ? rentRaw : info.rent,
          beds: bedsFor(occ),
        };
      });
      if (!unit.rooms.length) unit.rooms = buildRooms(unitType, list);
      saveUnit(unit);
      created += 1;
    }

    toast.success(
      `${created} unit${created === 1 ? "" : "s"} imported${skipped ? ` · ${skipped} skipped (residence not found)` : ""}`,
    );
  }

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
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 size-4" /> Bulk upload
            </Button>
            <Button size="sm" onClick={() => setDraft(blankUnit(nextUnitCode(units)))}>
              <Plus className="mr-1 size-4" /> Add unit
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        {units.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No units yet"
            hint="Add a unit or bulk upload with the CSV template. Rooms, beds and rent fill in automatically from the unit type."
          />
        ) : (
          <div className="divide-y divide-border">
            {units.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-deep">
                    {u.residenceName} · {u.unitNo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.code} · {u.unitType || "No type"} · {derivedGender(u) || "Gender not set"} ·{" "}
                    {u.wholeUnit
                      ? `Whole unit ${money(u.wholeUnitRent)}`
                      : `${u.rooms.length} rooms / ${u.rooms.reduce((n, r) => n + r.beds.length, 0)} beds`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDraft(u)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deleteUnit(u.id);
                    toast.success("Unit removed");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {draft ? (
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
              placeholder={residences.length ? "Select residence" : "Add a residence in Website first"}
            />
            <Text label="Unit number" value={draft.unitNo} onChange={(v) => patch({ unitNo: v })} placeholder="A-07-01" />
            <Select label="Unit type" value={draft.unitType} onChange={applyType} options={UNIT_TYPES} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Gender designation:{" "}
            <span className="font-medium text-foreground">{derivedGender(draft) || "Set automatically from the first resident"}</span>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted p-3">
            <Switch checked={draft.wholeUnit} onCheckedChange={(v) => patch({ wholeUnit: v })} id="whole-unit" />
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
                <div key={room.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
                  <Select
                    label="Room"
                    value={room.roomTypeCode}
                    onChange={(v) => applyRoomType(room.id, v)}
                    options={typesForResidence.map((t) => ({
                      value: t.code,
                      label: `Room ${room.letter} · ${t.name}`,
                    }))}
                    placeholder={typesForResidence.length ? `Room ${room.letter}` : "No room types set up"}
                  />
                  <Select
                    label="Occupancy"
                    value={room.occupancy}
                    onChange={(v) =>
                      patchRoom(room.id, {
                        occupancy: v as "single" | "twin",
                        beds: bedsFor(v as "single" | "twin"),
                      })
                    }
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
      ) : null}
    </div>
  );
}
