import { Link } from "@tanstack/react-router";
import { ArrowRight, Bath, CalendarDays, Eye, Ruler } from "lucide-react";
import {
  formatDate,
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
}: {
  property: Property;
  room: RoomType;
}) {
  const from = lowestRent(room);
  const detail = { slug: property.slug, typeId: room.id };

  const chips = [
    room.sizeLabel && { icon: Ruler, label: room.sizeLabel },
    { icon: Bath, label: room.bathroom === "ensuite" ? "Private ensuite" : "Shared bathroom" },
    { icon: Eye, label: room.hasView ? "With view" : "Internal facing" },
  ].filter(Boolean) as { icon: typeof Ruler; label: string }[];

  return (
    <article className="group grid overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card transition-shadow hover:shadow-lift sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <RoomGallery
        images={room.gallery.length ? room.gallery : [room.image]}
        alt={`${room.name} at ${property.name}`}
        className="h-56 w-full sm:h-full sm:min-h-[16rem]"
      />

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                room.status === "available"
                  ? "bg-brand-soft text-brand-deep"
                  : room.status === "limited"
                    ? "bg-accent-warm/20 text-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {statusLabel(room)}
            </span>
            <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
              {room.tag}
            </span>
          </div>

          <h3 className="mt-2 text-lg font-bold text-brand-deep sm:text-xl">
            <Link
              to="/properties/$slug/rooms/$typeId"
              params={detail}
              className="hover:underline"
            >
              {room.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{room.unitType}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-xs text-brand-deep"
              >
                <c.icon className="size-3.5" /> {c.label}
              </span>
            ))}
          </div>

          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" /> Available from {formatDate(room.availableFrom)}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-4">
          <div>
            <p className="text-2xl font-bold text-brand-deep">
              {formatRM(from)}
              <span className="text-sm font-normal text-muted-foreground">
                /mo{room.occupancies.includes("twin") && from === room.rent.long.twin
                  ? " per pax"
                  : ""}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {room.rent.short.single || room.rent.short.twin
                ? "12-month & short-term available"
                : "12-month stays"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/properties/$slug/rooms/$typeId" params={detail}>
                Details <ArrowRight className="size-4" />
              </Link>
            </Button>
            <EnquireDialog
              property={property}
              room={room}
              trigger={<Button size="sm">Enquire</Button>}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
