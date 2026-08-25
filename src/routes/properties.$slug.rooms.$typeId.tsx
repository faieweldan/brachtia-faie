import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Check, MessageCircle, Ruler } from "lucide-react";
import {
  costBreakdown,
  formatDate,
  formatRM,
  getProperty,
  getRoomType,
  getRoomTypes,
  termsFor,
  whatsappUrl,
  type ContractTerm,
  type Occupancy,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import EnquireDialog from "@/components/site/EnquireDialog";
import RoomTypeCard, { statusLabel } from "@/components/site/RoomTypeCard";
import SegmentedToggle from "@/components/site/SegmentedToggle";

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
  const availableTerms = termsFor(room, property);
  const [term, setTerm] = useState<ContractTerm>(availableTerms[0] ?? "long");
  const [occupancy, setOccupancy] = useState<Occupancy>(room.occupancies[0] ?? "single");
  const [photo, setPhoto] = useState(room.gallery[0] ?? room.image);

  const activeTerm = availableTerms.includes(term) ? term : (availableTerms[0] ?? "long");
  const rent = room.rent[activeTerm][occupancy];
  const breakdown = rent ? costBreakdown(property, rent, activeTerm) : null;

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
              <h1 className="mt-3 font-display text-3xl font-semibold text-brand-deep sm:text-4xl">
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
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
              {availableTerms.length > 1 && (
                <SegmentedToggle
                  value={activeTerm}
                  onChange={setTerm}
                  options={availableTerms.map((t) => ({
                    value: t,
                    label: t === "long" ? "12-month stay" : "Short-term",
                  }))}
                />
              )}
              {room.occupancies.length > 1 && (
                <SegmentedToggle
                  className="mt-2"
                  size="sm"
                  value={occupancy}
                  onChange={setOccupancy}
                  options={room.occupancies.map((o) => ({
                    value: o,
                    label: o === "single" ? "Single occupancy" : "Twin sharing",
                    disabled: room.rent[activeTerm][o] == null,
                  }))}
                />
              )}

              <div className="mt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Monthly rent {occupancy === "twin" ? "per person" : ""}
                </p>
                <p className="font-display text-3xl font-semibold text-brand-deep">
                  {rent ? formatRM(rent) : "On request"}
                  {rent && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{property.paymentCycle}</p>
              </div>

              {breakdown && (
                <div className="mt-5 rounded-2xl bg-brand-tint p-4">
                  <p className="text-sm font-semibold text-brand-deep">Upfront costs & deposits</p>
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      {breakdown.lines.map((l) => (
                        <tr key={l.label} className="align-top">
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {l.label}
                            {l.kind === "refundable" && (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-brand">
                                refundable
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right font-medium text-foreground">
                            {formatRM(l.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td className="pt-2.5 font-semibold text-brand-deep">Total payable</td>
                        <td className="pt-2.5 text-right font-display text-lg font-semibold text-brand-deep">
                          {formatRM(breakdown.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Booking fee {company_bookingFee} secures the room and is offset against your
                    first payment. Deposits are refundable at the end of tenancy, less any damages.
                  </p>
                </div>
              )}

              <div className="mt-5 space-y-2">
                <EnquireDialog
                  property={property}
                  room={room}
                  term={activeTerm}
                  occupancy={occupancy}
                  trigger={
                    <Button size="lg" className="w-full">
                      Enquire now
                    </Button>
                  }
                />
                <Button asChild size="lg" variant="outline" className="w-full">
                  <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp us
                  </a>
                </Button>
                <Button asChild size="lg" variant="ghost" className="w-full">
                  <Link to="/book-viewing" search={{ property: property.slug }}>
                    Book a viewing
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Admin confirms the exact unit with you after reviewing your preferences.
              </p>
            </div>
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
