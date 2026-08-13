import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, User, Users } from "lucide-react";
import { formatDate, formatRM, type Room } from "@/data/properties";
import { Badge } from "@/components/ui/badge";

const statusStyles: Record<Room["status"], string> = {
  available: "bg-brand-soft text-brand-deep",
  limited: "bg-gold/25 text-foreground",
  occupied: "bg-muted text-muted-foreground",
};

export function statusLabel(room: Room) {
  if (room.status === "occupied") return "Fully occupied";
  if (room.status === "limited") return `${room.bedsLeft ?? 1} bed left`;
  return "Available";
}

export default function RoomCard({ room }: { room: Room }) {
  const disabled = room.status === "occupied";

  const content = (
    <>
      <div className="relative w-full shrink-0 overflow-hidden sm:w-44">
        <img
          src={room.image}
          alt={`${room.roomLabel} — ${room.roomName}`}
          loading="lazy"
          width={1600}
          height={1000}
          className="h-40 w-full object-cover sm:h-full"
        />
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${statusStyles[room.status]} hover:${statusStyles[room.status]}`}>
            {statusLabel(room)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {room.unitLabel} · {room.unitType} · {room.gender} unit
          </span>
        </div>
        <h3 className="mt-2 font-display text-lg font-semibold text-brand-deep">
          {room.roomLabel} — {room.roomName}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {room.occupancy === "single" ? <User className="size-4" /> : <Users className="size-4" />}
            {room.occupancy === "single" ? "Single occupancy" : "Twin sharing"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" /> Available from {formatDate(room.availableFrom)}
          </span>
          {room.sizeLabel && <span>Size {room.sizeLabel}</span>}
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
          <p className="font-display text-xl font-semibold text-brand">
            {formatRM(room.rentLong)}
            <span className="text-sm font-normal text-muted-foreground">/month</span>
          </p>
          {!disabled && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
              View room <ArrowRight className="size-4" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (disabled) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card opacity-60 sm:flex-row">
        {content}
      </div>
    );
  }

  return (
    <Link
      to="/properties/$slug/rooms/$roomId"
      params={{ slug: room.propertySlug, roomId: room.id }}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:flex-row"
    >
      {content}
    </Link>
  );
}
