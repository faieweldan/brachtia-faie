import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Check, MessageCircle, User, Users } from "lucide-react";
import {
  costBreakdown,
  formatDate,
  formatRM,
  getProperty,
  getRoom,
  getRoomsForProperty,
  whatsappUrl,
  type ContractTerm,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RoomCard, { statusLabel } from "@/components/site/RoomCard";

export const Route = createFileRoute("/properties/$slug/rooms/$roomId")({
  loader: ({ params }) => {
    const property = getProperty(params.slug);
    const room = getRoom(params.slug, params.roomId);
    if (!property || !room) throw notFound();
    return { property, room };
  },
  head: ({ loaderData }) => {
    const room = loaderData?.room;
    const title = room
      ? `${room.roomLabel} · ${room.unitLabel} | ${loaderData?.property.name}`
      : "Room | Brachtia Homes";
    const description = room
      ? `${room.occupancy === "single" ? "Single occupancy" : "Twin sharing"} room from ${formatRM(
          room.rentLong,
        )} per month, available from ${formatDate(room.availableFrom)}.`
      : "Student room details at Brachtia Homes.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: RoomPage,
});

function RoomPage() {
  const { property, room } = Route.useLoaderData();
  const hasShort = property.contractTerms.includes("short") && !!room.rentShort;
  const [term, setTerm] = useState<ContractTerm>("long");
  const activeTerm: ContractTerm = hasShort ? term : "long";
  const rent = activeTerm === "short" ? room.rentShort ?? room.rentLong : room.rentLong;
  const { lines, total } = costBreakdown(property, rent, activeTerm);
  const others = getRoomsForProperty(property.slug).filter(
    (r) => r.id !== room.id && r.status !== "occupied",
  );

  const message = `Hi Brachtia Homes, I'm interested in ${room.roomLabel} (${room.roomName}) at ${room.unitLabel}, ${property.name}.`;

  return (
    <>
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <nav className="text-sm text-muted-foreground">
            <Link to="/properties" className="hover:text-brand">
              Properties
            </Link>
            <span className="px-1.5">/</span>
            <Link to="/properties/$slug" params={{ slug: property.slug }} className="hover:text-brand">
              {property.name}
            </Link>
            <span className="px-1.5">/</span>
            <span className="text-foreground">{room.roomLabel}</span>
          </nav>

          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-2xl">
                <img
                  src={room.image}
                  alt={`${room.roomLabel} — ${room.roomName}`}
                  width={1600}
                  height={1000}
                  className="h-56 w-full object-cover sm:h-80"
                />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Badge className="bg-brand-soft text-brand-deep">{statusLabel(room)}</Badge>
                <span className="text-sm text-muted-foreground">
                  {room.unitLabel} · {room.unitType} · {room.block}, {room.floor} · {room.gender} unit
                </span>
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold text-brand-deep">
                {room.roomLabel} — {room.roomName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {room.occupancy === "single" ? (
                    <User className="size-4" />
                  ) : (
                    <Users className="size-4" />
                  )}
                  {room.occupancy === "single" ? "Single occupancy" : "Twin sharing"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" /> Available from {formatDate(room.availableFrom)}
                </span>
                {room.sizeLabel && <span>Size {room.sizeLabel}</span>}
              </div>

              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {room.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {h}
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-xl border border-border bg-card p-5">
                <h2 className="font-display text-xl font-semibold text-brand-deep">
                  Upfront costs & deposits
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Based on {formatRM(rent)} per month · {property.paymentCycle.toLowerCase()}
                </p>
                <ul className="mt-4 divide-y divide-border">
                  {lines.map((line) => (
                    <li key={line.label} className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-muted-foreground">
                        {line.label}
                        {line.kind === "refundable" && (
                          <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand-deep">
                            refundable
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatRM(line.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="font-medium text-brand-deep">Total payable upfront</span>
                  <span className="font-display text-xl font-semibold text-brand">
                    {formatRM(total)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  A booking fee of {"RM500"} secures the room and is offset against your first
                  payment. Water and electricity are billed separately.
                </p>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                {hasShort && (
                  <div className="mb-4 inline-flex w-full rounded-lg border border-border p-1">
                    {(["long", "short"] as ContractTerm[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTerm(t)}
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                          activeTerm === t
                            ? "bg-brand text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t === "long" ? "12-month" : "Short-term"}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Monthly rent</p>
                <p className="font-display text-3xl font-semibold text-brand">
                  {formatRM(rent)}
                  <span className="text-base font-normal text-muted-foreground">
                    /month{room.occupancy === "twin" ? " per pax" : ""}
                  </span>
                </p>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between">
                    <span>Occupancy</span>
                    <span className="text-foreground">
                      {room.occupancy === "single" ? "Single" : "Twin sharing"}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span>Available from</span>
                    <span className="text-foreground">{formatDate(room.availableFrom)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Upfront total</span>
                    <span className="text-foreground">{formatRM(total)}</span>
                  </p>
                </div>
                <div className="mt-5 space-y-2">
                  <Button asChild className="w-full" size="lg">
                    <Link to="/apply" search={{ property: property.slug, room: room.id }}>
                      Apply for this room
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full" size="lg">
                    <Link to="/book-viewing" search={{ property: property.slug }}>
                      Book a Viewing
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full" size="lg">
                    <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" /> WhatsApp us
                    </a>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {others.length > 0 && (
          <section className="mx-auto mt-14 max-w-6xl px-4 pb-16 sm:px-6">
            <h2 className="font-display text-2xl font-semibold text-brand-deep">
              Other rooms at {property.name}
            </h2>
            <div className="mt-5 space-y-4">
              {others.slice(0, 3).map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </div>
          </section>
        )}
    </>
  );
}
