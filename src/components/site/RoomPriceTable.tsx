import { useState } from "react";
import { Bath, ChevronRight, Eye, Images, Ruler } from "lucide-react";

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
  datesSet,
  selectedRoomId,
  selectedOccupancy,
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
  datesSet: boolean;
  selectedRoomId?: string | undefined;
  selectedOccupancy?: Occupancy | undefined;
  onSelect: (room: RoomType, occupancy: Occupancy) => void;
}) {
  const [detailRoom, setDetailRoom] = useState<RoomType | null>(null);

  const withRate = rooms.filter((r) => r.occupancies.some((o) => r.rent[term][o] != null));
  const visible = filterRoomTypes(withRate, picks);
  const unitTypes = Array.from(new Set(visible.map((r) => r.unitType)));

  const occPicks = picks.filter((p) => p.startsWith("occ:")).map((p) => p.slice(4));

  const options: { token: string; label: string }[] = [
    { token: "bath:ensuite", label: "Ensuite" },
    { token: "view:exterior", label: "Exterior view" },
  ];


  function toggle(token: string) {
    onPicksChange(
      picks.includes(token) ? picks.filter((p) => p !== token) : [...picks, token],
    );
  }

  function fareTile(room: RoomType, occ: Occupancy) {
    const price = room.occupancies.includes(occ) ? room.rent[term][occ] : null;
    const active = selectedRoomId === room.id && selectedOccupancy === occ;
    const occLabel = occ === "single" ? "Single" : "Twin sharing";

    if (price == null) {
      return (
        <div className="flex h-14 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-2 text-center text-[11px] leading-tight text-muted-foreground">
          <span className="md:hidden">{occLabel}</span>
          <span>Not available</span>
        </div>
      );
    }

    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${occLabel} ${formatRM(price)} per month`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(room, occ);
        }}
        className={`flex h-14 w-full flex-col items-center justify-center rounded-xl border px-2 text-center transition-all md:flex-row md:px-3 ${
          active
            ? "border-brand-deep bg-brand-deep text-primary-foreground shadow-sm"
            : "border-border bg-card hover:border-brand hover:shadow-sm"
        }`}
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide md:hidden ${
            active ? "text-primary-foreground/80" : "text-muted-foreground"
          }`}
        >
          {occLabel}
        </span>
        <span className="flex items-baseline gap-1">
          <span
            className={`text-base font-extrabold tabular-nums ${
              active ? "text-primary-foreground" : "text-brand-deep"
            }`}
          >
            {formatRM(price)}
          </span>
          <span
            className={`text-xs font-semibold ${
              active ? "text-primary-foreground/80" : "text-muted-foreground"
            }`}
          >
            /mo
          </span>
        </span>
      </button>
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

          <div className="sm:ml-auto">
            {datesSet ? (
              term === "short" ? (
                <p className="rounded-2xl bg-accent px-3.5 py-2 text-xs font-semibold text-brand-deep">
                  Short-term rental rates shown.
                </p>
              ) : null
            ) : (
              <p className="px-1 text-xs text-muted-foreground">
                Add your dates to calculate your move-in cost.
              </p>
            )}
          </div>
        </div>


        <div className="mt-4 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-sm font-bold text-brand-deep">Filter</span>
            {options.map((o) => {
              const checked = picks.includes(o.token);
              return (
                <button
                  key={o.token}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(o.token)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                    checked
                      ? "border-brand bg-brand-tint text-brand-deep"
                      : "border-border bg-card text-foreground hover:border-brand/50"
                  }`}
                >
                  <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} />
                  {o.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground sm:mt-2">
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

              <div className="hidden grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)_8.5rem_8.5rem] gap-4 bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Room</span>
                <span>Details</span>
                <span>Single</span>
                <span>Twin sharing</span>
              </div>

              <ul>
                {list.map((room) => {
                  const selected = selectedRoomId === room.id;
                  const photos = new Set(
                    [room.image, ...room.gallery].filter(Boolean),
                  ).size;

                  return (
                    <li
                      key={room.id}
                      onClick={() => setDetailRoom(room)}
                      className={`group grid cursor-pointer grid-cols-1 items-center gap-3 border-t border-border/70 px-4 py-3.5 transition-colors sm:px-5 md:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)_8.5rem_8.5rem] md:gap-4 md:py-4 ${
                        selected ? "bg-brand-tint/60" : "hover:bg-muted/40"
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
                          <p className="font-semibold leading-snug text-brand-deep md:truncate">
                            {room.name}
                          </p>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand underline-offset-2 group-hover:underline">
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

                      <div className="grid grid-cols-2 gap-2 md:contents">
                        <div>{fareTile(room, "single")}</div>
                        <div>{fareTile(room, "twin")}</div>
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
