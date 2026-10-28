import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Dropdown } from "@/components/admin/Dropdown";
import { StringList } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A residence's Schedule C - the inventory checklist its residents answer at
 * move-in and move-out (Dani, 28 Oct 2026). Rooms, the items in each, how many
 * there should be, and what the resident gives for an item: its brand (from
 * the brand list below), a serial number, or one of the choices typed here.
 * A check keeps the list it was sent with, so a change here is for the next
 * resident. An item keeps its id when renamed, so answers stay with it.
 */
export type ItemRow = { id: string; name: string; qty: number; details: "brand" | "serial" | string[] | null };
export type AreaRow = { id: string; name: string; items: ItemRow[] };
export type InventoryConfig = { brands?: string[]; areas?: AreaRow[] };

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const KIND = [
  { value: "none", label: "Nothing" },
  { value: "brand", label: "Brand" },
  { value: "serial", label: "Serial no." },
  { value: "choices", label: "Choices" },
];
const kindOf = (d: ItemRow["details"]) => (d === "brand" ? "brand" : d === "serial" ? "serial" : Array.isArray(d) ? "choices" : "none");

export function InventoryEditor({ value, onChange }: { value: InventoryConfig; onChange: (v: InventoryConfig) => void }) {
  const areas = value.areas ?? [];
  const setAreas = (next: AreaRow[]) => onChange({ ...value, areas: next });
  const patchArea = (i: number, p: Partial<AreaRow>) => setAreas(areas.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const move = <T,>(list: T[], i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  };

  return (
    <div className="space-y-5">
      {areas.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Schedule C list yet - residents of this residence cannot do their move-in check until it has one.</p>
      ) : null}
      {areas.map((area, ai) => {
        const patchItem = (ii: number, p: Partial<ItemRow>) =>
          patchArea(ai, { items: area.items.map((it, k) => (k === ii ? { ...it, ...p } : it)) });
        return (
          <div key={area.id} className="rounded-md border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
              <Input
                className="h-8 flex-1 text-sm font-semibold"
                placeholder="Room (e.g. Kitchen)"
                value={area.name}
                onChange={(e) => patchArea(ai, { name: e.target.value })}
              />
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Move room up" onClick={() => setAreas(move(areas, ai, -1))}>
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Move room down" onClick={() => setAreas(move(areas, ai, 1))}>
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Remove room"
                onClick={() => {
                  if (confirm(`Remove ${area.name || "this room"} and its items?`)) setAreas(areas.filter((_, k) => k !== ai));
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_4.5rem_8rem_2rem_2rem] items-center gap-2 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span>
              <span>Qty</span>
              <span>Resident gives</span>
              <span />
              <span />
            </div>
            {area.items.map((it, ii) => {
              const kind = kindOf(it.details);
              return (
                <div key={it.id} className="space-y-1 px-3 py-1.5">
                  <div className="grid grid-cols-[1fr_4.5rem_8rem_2rem_2rem] items-center gap-2">
                    <Input className="h-8 text-xs" value={it.name} onChange={(e) => patchItem(ii, { name: e.target.value })} />
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min={1}
                      value={it.qty || ""}
                      onChange={(e) => patchItem(ii, { qty: Number(e.target.value || 0) })}
                    />
                    <Dropdown
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={kind}
                      onChange={(e) => {
                        const k = e.target.value;
                        patchItem(ii, { details: k === "brand" ? "brand" : k === "serial" ? "serial" : k === "choices" ? [] : null });
                      }}
                    >
                      {KIND.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Dropdown>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Move item up"
                      onClick={() => patchArea(ai, { items: move(area.items, ii, -1) })}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Remove item"
                      onClick={() => patchArea(ai, { items: area.items.filter((_, k) => k !== ii) })}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  {kind === "choices" ? (
                    <Input
                      className="h-8 text-xs"
                      placeholder="Choices, comma separated (e.g. Single, Queen, King)"
                      value={(it.details as string[]).join(", ")}
                      onChange={(e) => patchItem(ii, { details: e.target.value.split(",").map((x) => x.trimStart()) })}
                    />
                  ) : null}
                </div>
              );
            })}
            <div className="px-3 pb-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patchArea(ai, { items: [...area.items, { id: newId(area.id), name: "", qty: 1, details: null }] })}
              >
                <Plus className="mr-1 size-3.5" /> Add item
              </Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setAreas([...areas, { id: newId("area"), name: "", items: [] }])}>
        <Plus className="mr-1 size-3.5" /> Add room
      </Button>
      <StringList
        label='Brands (for items set to "Brand"; "Other" is always offered)'
        items={value.brands ?? []}
        onChange={(v) => onChange({ ...value, brands: v })}
        placeholder="e.g. Panasonic"
      />
    </div>
  );
}
