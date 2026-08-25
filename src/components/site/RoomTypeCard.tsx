import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Ruler } from "lucide-react";
import {
  formatDate,
  formatRM,
  lowestRent,
  type Property,
  type RoomType,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import EnquireDialog from "./EnquireDialog";

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

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card transition-shadow hover:shadow-lift sm:flex-row">
      <Link
        to="/properties/$slug/rooms/$typeId"
        params={{ slug: property.slug, typeId: room.id }}
        className="block w-full shrink-0 overflow-hidden sm:w-56"
      >
        <img
          src={room.image}
          alt={room.name}
          loading="lazy"
          width={800}
          height={600}
          className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-full"
        />
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
            <span className="text-xs text-muted-foreground">{room.unitType}</span>
          </div>

          <h3 className="mt-2 text-lg font-bold text-brand-deep">
            <Link
              to="/properties/$slug/rooms/$typeId"
              params={{ slug: property.slug, typeId: room.id }}
              className="hover:underline"
            >
              {room.name}
            </Link>
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> From {formatDate(room.availableFrom)}
            </span>
            {room.sizeLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Ruler className="size-4" /> {room.sizeLabel}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.features.slice(0, 3).map((f) => (
              <span
                key={f}
                className="rounded-full bg-brand-tint px-2.5 py-1 text-xs text-brand-deep"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">From</p>
          <p className="text-2xl font-bold text-brand-deep">
            {formatRM(from)}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
            <EnquireDialog
              property={property}
              room={room}
              trigger={<Button size="sm">Enquire</Button>}
            />
            <Button asChild size="sm" variant="outline">
              <Link
                to="/properties/$slug/rooms/$typeId"
                params={{ slug: property.slug, typeId: room.id }}
              >
                Details <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
