import { useState } from "react";
import { Bath, Check, ChevronRight, Eye, Images, Ruler } from "lucide-react";

import {
  availabilityFor,
  filterRoomTypes,
  formatRM,
  viewLabel,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomFilterState,
  type RoomType,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import SegmentedToggle from "./SegmentedToggle";
import RoomDetailDialog from "./RoomDetailDialog";

type Filters = Partial<RoomFilterState>;

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-brand bg-brand text-primary-foreground"
          : "border-border/70 text-muted-foreground hover:border-brand/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function RoomPriceTable({
  property,
  rooms,
  filters,
  onFilterChange,
  onClearFilters,
  moveIn,
  onMoveInChange,
  term,
  onTermChange,
  selectedRoomId,
  onSelect,
}: {
  property: Property;
  rooms: RoomType[];
  filters: Filters;
  onFilterChange: (next: Filters) => void;
  onClearFilters: () => void;
  moveIn: string;
  onMoveInChange: (value: string) => void;
  term: ContractTerm;
  onTermChange: (term: ContractTerm) => void;
  selectedRoomId?: string | undefined;
  onSelect: (room: RoomType, occupancy: Occupancy) => void;
}) {
  const [detailRoom, setDetailRoom] = useState<RoomType | null>(null);

  const occ = (filters.occ ?? "all") as Occupancy | "all";
  const withRate = rooms.filter((r) =>
    r.occupancies.some((o) => r.rent[term][o] != null),
  );
  const visible = filterRoomTypes(withRate, filters);

  const unitTypes = Array.from(new Set(visible.map((r) => r.unitType)));
  const filtersActive =
    (filters.unit ?? "all") !== "all" ||
    (filters.bath ?? "all") !== "all" ||
    (filters.view ?? "all") !== "all" ||
    occ !== "all";

  const allUnitTypes = Array.from(new Set(rooms.map((r) => r.unitType)));

  function rateCell(room: RoomType) {
    const shown: Occupancy[] =
      occ === "all" ? room.occupancies : room.occupancies.filter((o) => o === occ);
    const rows = shown
      .map((o) => ({ o, price: room.rent[term][o] }))
      .filter((r) => r.price != null);
    if (rows.length === 0) return <span className="text-sm text-muted-foreground">On request</span>;
    return (
      <div className="space-y-0.5">
        {rows.map(({ o, price }) => (
          <p key={o} className="text-sm leading-tight">
            <span className="font-bold tabular-nums text-brand-deep">{formatRM(price!)}</span>
            <span className="text-xs text-muted-foreground">
              /mo {o === "single" ? "single" : "per pax twin"}
            </span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Control bar */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="w-full max-w-[15rem] rounded-2xl bg-muted/70 px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
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

          {property.contractTerms.length > 1 && (
            <div className="w-full max-w-xs">
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

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Occupancy
            </span>
            {[
              { v: "all", l: "All" },
              { v: "single", l: "Single" },
              { v: "twin", l: "Twin sharing" },
            ].map((o) => (
              <Pill key={o.v} active={occ === o.v} onClick={() => onFilterChange({ occ: o.v })}>
                {o.l}
              </Pill>
            ))}
          </div>

          {allUnitTypes.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Apartment
              </span>
              <Pill
                active={(filters.unit ?? "all") === "all"}
                onClick={() => onFilterChange({ unit: "all" })}
              >
                All
              </Pill>
              {allUnitTypes.map((u) => (
                <Pill
                  key={u}
                  active={filters.unit === u}
                  onClick={() => onFilterChange({ unit: u })}
                >
                  {u.replace(" Apartment", "")}
                </Pill>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Bathroom
            </span>
            {[
              { v: "all", l: "All" },
              { v: "ensuite", l: "Ensuite" },
              { v: "shared", l: "Shared" },
            ].map((b) => (
              <Pill
                key={b.v}
                active={(filters.bath ?? "all") === b.v}
                onClick={() => onFilterChange({ bath: b.v })}
              >
                {b.l}
              </Pill>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              View
            </span>
            <Pill
              active={(filters.view ?? "all") === "all"}
              onClick={() => onFilterChange({ view: "all" })}
            >
              All
            </Pill>
            <Pill
              active={filters.view === "view"}
              onClick={() => onFilterChange({ view: "view" })}
            >
              With view
            </Pill>
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {visible.length} of {rooms.length} room types
            </span>
            {filtersActive && (
              <button
                type="button"
                onClick={onClearFilters}
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                Clear filters
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

              <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Room</span>
                <span>Details</span>
                <span>Monthly rate</span>
                <span>Availability</span>
                <span className="w-24" />
              </div>

              <ul>
                {list.map((room) => {
                  const availability = availabilityFor(room, moveIn);
                  const selected = selectedRoomId === room.id;
                  const pickOcc: Occupancy =
                    occ !== "all" && room.occupancies.includes(occ)
                      ? occ
                      : (room.occupancies[0] ?? "single");
                  const photos = room.gallery.length || 1;

                  return (
                    <li
                      key={room.id}
                      onClick={() => setDetailRoom(room)}
                      className={`group grid cursor-pointer grid-cols-1 items-center gap-4 border-t border-border/70 px-5 py-4 transition-colors md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] ${
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
                          <p className="truncate font-semibold text-brand-deep">{room.name}</p>
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

                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            availability.tone === "ready"
                              ? "bg-brand/10 text-brand-deep"
                              : availability.tone === "later"
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {availability.label}
                        </span>
                      </div>

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
            <Button variant="outline" className="mt-4" onClick={onClearFilters}>
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
            occ !== "all" && r.occupancies.includes(occ) ? occ : (r.occupancies[0] ?? "single"),
          )
        }
      />
    </div>
  );
}
