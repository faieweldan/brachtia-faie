import { Link } from "@tanstack/react-router";
import { Bath, Check, Eye, Ruler } from "lucide-react";
import {
  formatRM,
  lowestRent,
  type Property,
  type RoomType,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import EnquireDialog from "./EnquireDialog";
import RoomGallery from "./RoomGallery";

export function statusLabel(room: RoomType) {
  if (room.status === "occupied") return "Waitlist";
  if (room.status === "limited") return `${room.spotsLeft ?? 1} spots left`;
  return "Available";
}

export default function RoomTypeCard({
  property,
  room,
  selected,
  onSelect,
}: {
  property: Property;
  room: RoomType;
  selected?: boolean;
  onSelect?: (room: RoomType) => void;
}) {
  const from = lowestRent(room);
  const detail = { slug: property.slug, typeId: room.id };
  const showStatus = room.status !== "available";

  const meta = [
    room.sizeLabel && { icon: Ruler, label: room.sizeLabel },
    { icon: Bath, label: room.bathroom === "ensuite" ? "Private ensuite" : "Shared bathroom" },
    { icon: Eye, label: room.hasView ? "With view" : "Internal facing" },
  ].filter(Boolean) as { icon: typeof Ruler; label: string }[];

  return (
    <article
      className={`group grid overflow-hidden rounded-[1.75rem] bg-card transition-shadow sm:grid-cols-[minmax(0,48%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,52%)_minmax(0,1fr)] ${
        selected
          ? "shadow-lift ring-2 ring-brand"
          : "shadow-card ring-1 ring-border/60 hover:shadow-lift"
      }`}
    >
      <div className="relative">
        <RoomGallery
          images={room.gallery.length ? room.gallery : [room.image]}
          alt={`${room.name} at ${property.name}`}
          className="h-64 w-full sm:h-full sm:min-h-[20rem]"
        />
        {showStatus && (
          <span className="absolute left-4 top-4 rounded-full bg-card/95 px-3 py-1 text-xs font-semibold text-brand-deep shadow-sm">
            {statusLabel(room)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-snug text-brand-deep sm:text-xl lg:text-2xl">
                {room.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{room.unitType}</p>
            </div>

            {onSelect && (
              <button
                type="button"
                onClick={() => onSelect(room)}
                aria-pressed={!!selected}
                aria-label={`Calculate cost for ${room.name}`}
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition ${
                  selected
                    ? "border-brand bg-brand text-primary-foreground"
                    : "border-border text-transparent hover:border-brand hover:text-brand/40"
                }`}
              >
                <Check className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {meta.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1.5">
                <m.icon className="size-4 text-brand/70" /> {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-border/60 pt-5">
          <div>
            <p className="text-[1.75rem] font-bold leading-none text-brand-deep">
              {formatRM(from)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /mo{room.occupancies.includes("twin") && from === room.rent.long.twin
                  ? " per pax"
                  : ""}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {room.rent.short.single || room.rent.short.twin
                ? "12-month & short-term available"
                : "12-month stays"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <EnquireDialog
              property={property}
              room={room}
              trigger={<Button size="sm" className="rounded-full px-5">Enquire</Button>}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
