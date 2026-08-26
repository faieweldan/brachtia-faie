import { useState } from "react";
import { Bath, Check, ChevronRight, Eye, Images, Ruler, User, Users } from "lucide-react";

import {
  filterRoomTypes,
  formatRM,
  viewLabel,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomFilterToken,
  type RoomType,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import SegmentedToggle from "./SegmentedToggle";
import RoomDetailDialog from "./RoomDetailDialog";

export default function RoomPriceTable({
  property,
  rooms,
  picks,
  onPicksChange,
  moveIn,
  onMoveInChange,
  moveOut,
  onMoveOutChange,
  term,
  onTermChange,
  selectedRoomId,
  onSelect,
}: {
  property: Property;
  rooms: RoomType[];
  picks: RoomFilterToken[];
  onPicksChange: (next: RoomFilterToken[]) => void;
  moveIn: string;
  onMoveInChange: (value: string) => void;
  moveOut: string;
  onMoveOutChange: (value: string) => void;
  term: ContractTerm;
  onTermChange: (term: ContractTerm) => void;
  selectedRoomId?: string | undefined;
  onSelect: (room: RoomType, occupancy: Occupancy) => void;
}) {
  const [detailRoom, setDetailRoom] = useState<RoomType | null>(null);

  const withRate = rooms.filter((r) => r.occupancies.some((o) => r.rent[term][o] != null));
  const visible = filterRoomTypes(withRate, picks);
  const unitTypes = Array.from(new Set(visible.map((r) => r.unitType)));
  const allUnitTypes = Array.from(new Set(rooms.map((r) => r.unitType)));

  const occPicks = picks.filter((p) => p.startsWith("occ:")).map((p) => p.slice(4));

  const options: { token: string; label: string }[] = [
    { token: "occ:single", label: "Single" },
    { token: "occ:twin", label: "Twin sharing" },
    ...allUnitTypes.map((u) => ({
      token: `unit:${u}`,
      label: u.replace(" Apartment", ""),
    })),
    { token: "bath:ensuite", label: "Ensuite" },
    { token: "view:exterior", label: "Exterior view" },
    { token: "view:corridor", label: "Corridor view" },
  ];

  function toggle(token: string) {
    onPicksChange(
      picks.includes(token) ? picks.filter((p) => p !== token) : [...picks, token],
    );
  }

  function rateCell(room: RoomType) {
    const shown: Occupancy[] =
      occPicks.length > 0
        ? room.occupancies.filter((o) => occPicks.includes(o))
        : room.occupancies;
    const rows = shown
      .map((o) => ({ o, price: room.rent[term][o] }))
      .filter((r) => r.price != null);
    if (rows.length === 0) return <span className="text-sm text-muted-foreground">On request</span>;
    return (
      <div className="space-y-1">
        {rows.map(({ o, price }) => {
          const Icon = o === "single" ? User : Users;
          return (
            <p key={o} className="flex items-center gap-2 leading-tight">
              <Icon
                className="size-4 shrink-0 text-brand"
                aria-label={o === "single" ? "Single occupancy" : "Twin sharing"}
              />
              <span className="text-sm font-bold tabular-nums text-brand-deep">
                {formatRM(price!)}
              </span>
            </p>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Control bar */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="w-full rounded-2xl bg-muted/70 px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-brand/40 sm:max-w-[13rem]">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Move-in date
            </span>
            <input
              type="date"
              value={moveIn}
              onChange={(e) => onMoveInChange(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-foreground outline-none"
            />
          </label>

          <label className="w-full rounded-2xl bg-muted/70 px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-brand/40 sm:max-w-[13rem]">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Move-out date
            </span>
            <input
              type="date"
              value={moveOut}
              min={moveIn}
              onChange={(e) => onMoveOutChange(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-foreground outline-none"
            />
          </label>

          {property.contractTerms.length > 1 && (
            <div className="w-full sm:ml-auto sm:max-w-xs">
              <SegmentedToggle
                size="sm"
                value={term}
                onChange={onTermChange}
                options={property.contractTerms.map((t) => ({
                  value: t,
                  label: t === "long" ? "12-month stay" : "Short-term",
                }))}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border/60 pt-4">
          {options.map((o) => {
            const checked = picks.includes(o.token);
            return (
              <label
                key={o.token}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(o.token)} />
                {o.label}
              </label>
            );
          })}

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {visible.length} of {rooms.length} room types
            </span>
            {picks.length > 0 && (
              <button
                type="button"
                onClick={() => onPicksChange([])}
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="mt-6 space-y-6">
        {unitTypes.map((unitType) => {
          const list = visible.filter((r) => r.unitType === unitType);
          return (
            <div
              key={unitType}
              className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
                <p className="font-bold text-brand-deep">{unitType}</p>
                <p className="text-xs text-muted-foreground">
                  {list.length} room{list.length > 1 ? "s" : ""}
                </p>
              </div>

              <div className="hidden grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Room</span>
                <span>Details</span>
                <span>Monthly rate</span>
                <span className="w-24" />
              </div>

              <ul>
                {list.map((room) => {
                  const selected = selectedRoomId === room.id;
                  const pickOcc: Occupancy =
                    (occPicks.find((o) => room.occupancies.includes(o as Occupancy)) as
                      | Occupancy
                      | undefined) ?? (room.occupancies[0] ?? "single");
                  const photos = room.gallery.length || 1;

                  return (
                    <li
                      key={room.id}
                      onClick={() => setDetailRoom(room)}
                      className={`group grid cursor-pointer grid-cols-1 items-center gap-4 border-t border-border/70 px-5 py-4 transition-colors md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] ${
                        selected ? "bg-brand-tint/60" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                          <img
                            src={room.image}
                            alt={room.name}
                            loading="lazy"
                            width={160}
                            height={160}
                            className="size-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                            <Images className="size-2.5" />
                            {photos}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug text-brand-deep">{room.name}</p>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline-offset-2 group-hover:underline">
                            View details <ChevronRight className="size-3" />
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {room.sizeLabel && (
                          <span className="inline-flex items-center gap-1">
                            <Ruler className="size-3.5 text-brand/70" /> {room.sizeLabel}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Bath className="size-3.5 text-brand/70" />
                          {room.bathroom === "ensuite" ? "Ensuite" : "Shared"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5 text-brand/70" /> {viewLabel(room)}
                        </span>
                      </div>

                      <div>{rateCell(room)}</div>

                      <div className="md:w-28">
                        <Button
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          className="w-full rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(room, pickOcc);
                          }}
                        >
                          {selected ? (
                            <>
                              <Check className="size-4" /> Selected
                            </>
                          ) : (
                            "Select"
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <p className="font-medium text-brand-deep">No rooms match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try widening your search — or enquire and we'll suggest the closest option.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => onPicksChange([])}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <RoomDetailDialog
        property={property}
        room={detailRoom}
        moveIn={moveIn}
        open={!!detailRoom}
        onOpenChange={(o) => !o && setDetailRoom(null)}
        onUseInCalculator={(r) =>
          onSelect(
            r,
            (occPicks.find((o) => r.occupancies.includes(o as Occupancy)) as
              | Occupancy
              | undefined) ?? (r.occupancies[0] ?? "single"),
          )
        }
      />
    </div>
  );
}
