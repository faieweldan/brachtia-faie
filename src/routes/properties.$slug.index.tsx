import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, MapPin, MessageCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  availableCount,
  formatRM,
  getProperty,
  getRoomTypes,
  priceFrom,
  whatsappUrl,
  type ContractTerm,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import AmenitySection from "@/components/site/AmenitySection";
import CtaBand from "@/components/site/CtaBand";
import EnquireDialog from "@/components/site/EnquireDialog";
import RoomTypeCard from "@/components/site/RoomTypeCard";
import SegmentedToggle from "@/components/site/SegmentedToggle";

export const Route = createFileRoute("/properties/$slug/")({
  loader: ({ params }) => {
    const property = getProperty(params.slug);
    if (!property) throw notFound();
    return { property };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.property.name ?? "Property";
    const title = `${name} | Brachtia Homes Student Accommodation`;
    const description =
      loaderData?.property.summary ?? "Student accommodation in Cyberjaya by Brachtia Homes.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: PropertyPage,
});

function PropertyPage() {
  const { property } = Route.useLoaderData();
  const [term, setTerm] = useState<ContractTerm>("long");
  const rooms = getRoomTypes(property.slug);
  const activeTerm = property.contractTerms.includes(term) ? term : "long";
  const tables = property.pricing[activeTerm];
  const gallery = property.gallery;

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <nav className="text-sm text-muted-foreground">
          <Link to="/properties" className="hover:text-brand">
            Properties
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground">{property.name}</span>
        </nav>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:gap-3">
          <div className="overflow-hidden rounded-3xl">
            <img
              src={property.heroImage}
              alt={property.name}
              width={1600}
              height={1200}
              className="h-64 w-full object-cover sm:h-[30rem]"
            />
          </div>
          <div className="relative hidden grid-cols-2 grid-rows-2 gap-2 sm:grid sm:h-[30rem] lg:gap-3">
            {gallery.slice(0, 4).map((g) => (
              <div key={g.caption} className="overflow-hidden rounded-3xl">
                <img
                  src={g.src}
                  alt={`${property.name} — ${g.caption}`}
                  loading="lazy"
                  width={800}
                  height={600}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute bottom-4 right-4 gap-2 rounded-full bg-card shadow-lift hover:bg-card"
                >
                  <LayoutGrid className="size-4" /> Show all photos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{property.name} — photos</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  {gallery.map((g) => (
                    <figure key={g.caption} className="overflow-hidden rounded-2xl">
                      <img
                        src={g.src}
                        alt={`${property.name} — ${g.caption}`}
                        loading="lazy"
                        className="h-56 w-full object-cover"
                      />
                      <figcaption className="px-1 py-2 text-xs text-muted-foreground">
                        {g.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

      </section>

      <section className="mx-auto mt-8 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-12">
            <div>
              <h1 className="text-3xl font-bold text-brand-deep sm:text-4xl">
                {property.name}
              </h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" /> {property.location}
              </p>
              <p className="mt-4 max-w-2xl text-muted-foreground">{property.tagline}</p>
              {property.description.map((p) => (
                <p key={p} className="mt-3 max-w-2xl text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>

            <div className="space-y-10">
              <AmenitySection
                title="Building Facilities & Amenities"
                items={property.buildingFacilities}
                iconMode="facility"
              />
              <AmenitySection
                title="Included in Your Stay"
                items={property.includedInStay}
                note={property.utilitiesNote}
                iconMode="check"
              />
              <AmenitySection
                title="Inside Your Apartment"
                items={property.insideApartment}
                footnote={property.apartmentFootnote}
                iconMode="check"
              />
            </div>

            <div id="rooms">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-brand-deep">Room options</h2>
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
                  {availableCount(property.slug)} room types available
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Choose the room type that suits you — enquire with your preferences and our team
                will confirm the exact unit and availability with you.
              </p>
              <div className="mt-5 space-y-4">
                {rooms.map((room) => (
                  <RoomTypeCard key={room.id} property={property} room={room} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-brand-deep">
                Full price list
              </h2>
              {property.contractTerms.length > 1 && (
                <div className="mt-4 max-w-sm">
                  <SegmentedToggle
                    value={activeTerm}
                    onChange={setTerm}
                    options={property.contractTerms.map((t) => ({
                      value: t,
                      label: t === "long" ? "12-month stay" : "Short-term",
                    }))}
                  />
                </div>
              )}
              <div className="mt-5 space-y-6">
                {tables.map((table) => (
                  <div
                    key={table.unitType}
                    className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
                  >
                    <div className="border-b border-border px-5 py-3">
                      <p className="font-medium text-brand-deep">{table.unitType}</p>
                      {table.blocks && (
                        <p className="text-xs text-muted-foreground">{table.blocks}</p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-5 py-2 font-medium">Room</th>
                            <th className="px-5 py-2 font-medium">Single</th>
                            <th className="px-5 py-2 font-medium">Twin sharing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row) => (
                            <tr key={row.roomType} className="border-t border-border">
                              <td className="px-5 py-3">
                                <span className="font-medium text-foreground">{row.roomType}</span>
                                {row.note && (
                                  <span className="block text-xs text-muted-foreground">
                                    {row.note}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {row.single ? `${formatRM(row.single)}/mo` : "—"}
                              </td>
                              <td className="px-5 py-3">
                                {row.twin ? `${formatRM(row.twin)}/mo per pax` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {tables.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Short-term stays are not offered at this residence.
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Rooms from</p>
              <p className="text-3xl font-bold text-brand-deep">
                {formatRM(priceFrom(property.slug))}
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{property.paymentCycle}</p>
              <div className="mt-4 space-y-2">
                <EnquireDialog
                  property={property}
                  trigger={
                    <Button size="lg" className="w-full">
                      Enquire now
                    </Button>
                  }
                />
                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link to="/book-viewing" search={{ property: property.slug }}>
                    Book a viewing
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="w-full">
                  <a
                    href={whatsappUrl(`Hi Brachtia Homes, I'm interested in ${property.name}.`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              </div>
            </div>


            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
              <h3 className="text-lg font-bold text-brand-deep">What's nearby</h3>
              <ul className="mt-3 space-y-2">
                {property.nearby.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand" /> {n}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href={property.wazeUrl} target="_blank" rel="noreferrer">
                  Open in Waze
                </a>
              </Button>
            </div>
          </aside>
        </div>
      </section>

      <div className="mt-16">
        <CtaBand
          title={`Interested in ${property.name}?`}
          message={`Hi Brachtia Homes, I'd like to book a viewing at ${property.name}.`}
        />
      </div>
    </>
  );
}
