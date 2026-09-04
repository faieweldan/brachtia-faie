import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { listResidences } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState, Panel, Select, Text } from "@/components/admin/ops-ui";
import {
  GENDERS,
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

function UnitSetupPage() {
  const { units } = useOps();
  const [draft, setDraft] = useState<Unit | null>(null);

  const { data } = useQuery({ queryKey: ["admin", "residences"], queryFn: () => listResidences() });
  const residences: any[] = (data as any)?.residences ?? [];
  const roomTypes: any[] = (data as any)?.rooms ?? [];

  const typesForResidence = useMemo(
    () => (draft ? roomTypes.filter((r) => r.residence_id === draft.residenceId) : []),
    [draft, roomTypes],
  );

  function patch(p: Partial<Unit>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function patchRoom(roomId: string, p: Partial<UnitRoom>) {
    setDraft((d) =>
      d ? { ...d, rooms: d.rooms.map((r) => (r.id === roomId ? { ...r, ...p } : r)) } : d,
    );
  }

  function applyType(unitType: string) {
    const count = roomCountFor(unitType);
    setDraft((d) => {
      if (!d) return d;
      const rooms = Array.from({ length: count }, (_, i) => d.rooms[i] ?? blankRoom(LETTERS[i] ?? String(i + 1)));
      return { ...d, unitType, rooms };
    });
  }

  function applyRoomType(roomId: string, code: string) {
    const rt = roomTypes.find((r) => r.code === code);
    const occ: "single" | "twin" =
      rt?.occupancies?.length === 1 && rt.occupancies[0] === "twin" ? "twin" : "single";
    const rent = rt?.rent?.long?.[occ] ?? rt?.rent?.long?.single ?? 0;
    patchRoom(roomId, {
      roomTypeCode: code,
      occupancy: occ,
      rent: Number(rent) || 0,
      beds: bedsFor(occ),
    });
  }

  function save() {
    if (!draft) return;
    if (!draft.residenceId || !draft.unitNo.trim()) {
      toast.error("Pick a residence and enter a unit number");
      return;
    }
    saveUnit(draft);
    toast.success("Unit saved");
    setDraft(null);
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Units"
        description="Residence and room type options come from the Website module, so pricing stays in one place."
        action={
          <Button size="sm" onClick={() => setDraft(blankUnit(nextUnitCode(units)))}>
            <Plus className="mr-1 size-4" /> Add unit
          </Button>
        }
      >
        {units.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No units yet"
            hint="Add your first unit to start building the inventory. Rooms and beds are generated from the unit type."
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
                    {u.code} · {u.unitType || "No type"} · {u.gender || "Any"} ·{" "}
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
                patch({
                  residenceId: v,
                  residenceName: r?.name ?? "",
                  residenceSlug: r?.slug ?? "",
                  rooms: draft.rooms.map((room) => ({ ...room, roomTypeCode: "" })),
                });
              }}
              options={residences.map((r) => ({ value: r.id, label: r.name }))}
              placeholder={residences.length ? "Select residence" : "Add a residence in Website first"}
            />
            <Text label="Unit number" value={draft.unitNo} onChange={(v) => patch({ unitNo: v })} placeholder="A-07-01" />
            <Select label="Unit type" value={draft.unitType} onChange={applyType} options={UNIT_TYPES} />
            <Text label="Block / tower" value={draft.block} onChange={(v) => patch({ block: v })} placeholder="Block A" />
            <Text label="Floor" value={draft.floor} onChange={(v) => patch({ floor: v })} placeholder="7" />
            <Select label="Gender designation" value={draft.gender} onChange={(v) => patch({ gender: v })} options={GENDERS} />
          </div>

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
                <div key={room.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-4">
                  <Text label="Room letter" value={room.letter} onChange={(v) => patchRoom(room.id, { letter: v })} />
                  <Select
                    label="Room type (from Website)"
                    value={room.roomTypeCode}
                    onChange={(v) => applyRoomType(room.id, v)}
                    options={typesForResidence.map((t) => ({
                      value: t.code,
                      label: `${t.room_code ? `${t.room_code} · ` : ""}${t.name}`,
                    }))}
                    placeholder={typesForResidence.length ? "Select room type" : "No room types set up"}
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
                  <p className="text-xs text-muted-foreground sm:col-span-4">
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
