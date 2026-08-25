import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Check, MessageCircle, Ruler } from "lucide-react";
import {
  formatDate,
  getProperty,
  getRoomType,
  getRoomTypes,
  whatsappUrl,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import EnquireDialog from "@/components/site/EnquireDialog";
import RoomTypeCard, { statusLabel } from "@/components/site/RoomTypeCard";
import StayCalculator, { type StayState } from "@/components/site/StayCalculator";

export const Route = createFileRoute("/properties/$slug/rooms/$typeId")({
  loader: ({ params }) => {
    const property = getProperty(params.slug);
    const room = getRoomType(params.slug, params.typeId);
    if (!property || !room) throw notFound();
    return { property, room };
  },
  head: ({ loaderData }) => {
    const room = loaderData?.room;
    const title = room
      ? `${room.name} | ${loaderData?.property.name} — Brachtia Homes`
      : "Room type | Brachtia Homes";
    const description = room
      ? `${room.description.slice(0, 150)}`
      : "Student room details at Brachtia Homes Cyberjaya.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: RoomTypePage,
});

function RoomTypePage() {
  const { property, room } = Route.useLoaderData();
  const [photo, setPhoto] = useState(room.gallery[0] ?? room.image);

  const others = getRoomTypes(property.slug).filter((r) => r.id !== room.id);
  const message = `Hi Brachtia Homes, I'm interested in the ${room.name} at ${property.name}.`;

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
          <span className="text-foreground">{room.name}</span>
        </nav>

        <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-3xl">
              <img
                src={photo}
                alt={room.name}
                width={1600}
                height={1000}
                className="h-60 w-full object-cover sm:h-96"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {room.gallery.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPhoto(g)}
                  className={`overflow-hidden rounded-2xl border-2 transition-colors ${
                    photo === g ? "border-brand" : "border-transparent hover:border-border"
                  }`}
                >
                  <img
                    src={g}
                    alt={`${room.name} photo`}
                    loading="lazy"
                    width={600}
                    height={400}
                    className="h-20 w-full object-cover sm:h-24"
                  />
                </button>
              ))}
            </div>

            <div className="mt-8">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  room.status === "limited"
                    ? "bg-accent-warm/20 text-foreground"
                    : "bg-brand-soft text-brand-deep"
                }`}
              >
                {statusLabel(room)}
              </span>
              <span className="ml-2 rounded-full bg-brand px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                {room.tag}
              </span>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
                {room.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {room.unitType} · {property.name}
              </p>
              <p className="mt-4 text-muted-foreground">{room.description}</p>

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-4 text-brand" /> Available from{" "}
                  {formatDate(room.availableFrom)}
                </span>
                {room.sizeLabel && (
                  <span className="inline-flex items-center gap-2">
                    <Ruler className="size-4 text-brand" /> {room.sizeLabel}
                  </span>
                )}
              </div>

              <h2 className="mt-8 font-display text-xl font-semibold text-brand-deep">
                What's in this room
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {room.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {f}
                  </li>
                ))}
              </ul>

              <h2 className="mt-8 font-display text-xl font-semibold text-brand-deep">
                Good to know
              </h2>
              <ul className="mt-3 space-y-2">
                {property.terms.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <StayCalculator
              property={property}
              room={room}
              actions={(s: StayState) => (
                <>
                  <EnquireDialog
                    property={property}
                    room={room}
                    term={s.term}
                    occupancy={s.occupancy}
                    moveIn={s.moveIn}
                    moveOut={s.moveOut}
                    trigger={
                      <Button size="lg" className="h-13 w-full rounded-full text-base">
                        Enquire now
                      </Button>
                    }
                  />
                  <Button asChild size="lg" variant="outline" className="w-full rounded-full">
                    <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" /> WhatsApp us
                    </a>
                  </Button>
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    Admin confirms your unit after reviewing preferences.
                  </p>
                </>
              )}
            />
          </aside>

        </div>
      </section>

      {others.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold text-brand-deep">
            Other room options at {property.name}
          </h2>
          <div className="mt-5 space-y-4">
            {others.map((r) => (
              <RoomTypeCard key={r.id} property={property} room={r} />
            ))}
          </div>
        </section>
      )}

      <div className="sticky bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{room.name}</p>
            <p className="font-display text-lg font-semibold text-brand-deep">
              {rent ? `${formatRM(rent)}/mo` : "On request"}
            </p>
          </div>
          <EnquireDialog
            property={property}
            room={room}
            term={activeTerm}
            occupancy={occupancy}
            trigger={<Button size="lg">Enquire now</Button>}
          />
        </div>
      </div>
    </>
  );
}
