import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, MapPin } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  getProperty,
  getRoomTypes,
  setSiteData,
  termForRange,
  type ContractTerm,
  type Occupancy,
} from "@/data/properties";
import { fetchSiteData } from "@/lib/site-data.functions";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

import { Button } from "@/components/ui/button";
import AmenitySection from "@/components/site/AmenitySection";
import LocationSection from "@/components/site/LocationSection";
import CtaBand from "@/components/site/CtaBand";
import EnquiryDialog from "@/components/site/EnquiryDialog";
import RoomPriceTable from "@/components/site/RoomPriceTable";
import StayCalculator from "@/components/site/StayCalculator";
import MobileCtaBar from "@/components/site/MobileCtaBar";


export const Route = createFileRoute("/properties/$slug/")({
  loader: async ({ params }) => {
    setSiteData(await fetchSiteData());
    const property = getProperty(params.slug);
    if (!property) throw notFound();
    return { property };
  },

  head: ({ loaderData, params }) => {
    const property = loaderData?.property;
    const name = property?.name ?? "Property";
    const title = `${name} | Brachtia Homes Student Accommodation`;
    const description =
      property?.summary ?? "Student accommodation in Cyberjaya by Brachtia Homes.";
    const canonical = `${SITE_URL}/properties/${params.slug}`;
    const ogImage = property?.heroImage ? absoluteUrl(property.heroImage) : undefined;

    const rents = property
      ? getRoomTypes(property.slug)
          .flatMap((room) =>
            Object.values(room.rent).flatMap((byOcc) => Object.values(byOcc)),
          )
          .filter((value): value is number => typeof value === "number" && value > 0)
      : [];

    const scripts = property
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Apartment",
                  name: property.name,
                  description: property.summary,
                  url: canonical,
                  ...(ogImage ? { image: ogImage } : {}),
                  address: {
                    "@type": "PostalAddress",
                    addressLocality: "Cyberjaya",
                    addressRegion: "Selangor",
                    addressCountry: "MY",
                  },
                  geo: {
                    "@type": "GeoCoordinates",
                    latitude: property.coords.lat,
                    longitude: property.coords.lng,
                  },
                  amenityFeature: property.buildingFacilities.map((item) => ({
                    "@type": "LocationFeatureSpecification",
                    name: item,
                    value: true,
                  })),
                  ...(rents.length
                    ? {
                        offers: {
                          "@type": "AggregateOffer",
                          priceCurrency: "MYR",
                          lowPrice: Math.min(...rents),
                          highPrice: Math.max(...rents),
                          offerCount: rents.length,
                          unitText: "MONTH",
                        },
                      }
                    : {}),
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                    {
                      "@type": "ListItem",
                      position: 2,
                      name: "Properties",
                      item: `${SITE_URL}/properties`,
                    },
                    { "@type": "ListItem", position: 3, name: property.name, item: canonical },
                  ],
                },
              ],
            }),
          },
        ]
      : [];

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: canonical },
        ...(ogImage
          ? [
              { property: "og:image", content: ogImage },
              { name: "twitter:image", content: ogImage },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts,
    };
  },
  component: PropertyPage,
});



function plusMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function PropertyPage() {
  const { property } = Route.useLoaderData();
  const [picks, setPicks] = useState<string[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [selectedOccupancy, setSelectedOccupancy] = useState<Occupancy | undefined>(undefined);
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");

  function changeMoveIn(value: string) {
    setMoveIn(value);
    if (value && moveOut && moveOut <= value) setMoveOut(plusMonths(value, 12));
  }

  const rooms = getRoomTypes(property.slug);
  const datesSet = !!moveIn && !!moveOut && moveOut > moveIn;
  const derivedTerm: ContractTerm = datesSet ? termForRange(moveIn, moveOut) : "long";
  const activeTerm = property.contractTerms.includes(derivedTerm) ? derivedTerm : "long";

  const gallery = property.gallery;
  const byCategory = (c: string) =>
    gallery.filter((g) => (g.category ?? "building") === c);
  const galleryGroups: { label: string; items: typeof gallery }[] = [
    { label: "Building amenities", items: byCategory("building") },
    { label: "INSIDE YOUR APARTMENT", items: byCategory("apartment") },
    { label: "INSIDE YOUR ROOM", items: byCategory("room") },
  ].filter((g) => g.items.length > 0);
  const featured = gallery.filter((g) => (g as { featured?: boolean }).featured);
  const preview = (
    featured.length
      ? featured
      : ([
          byCategory("building")[0],
          byCategory("apartment")[0],
          byCategory("room")[0],
          byCategory("room")[1] ?? byCategory("apartment")[1] ?? byCategory("building")[1],
        ].filter(Boolean) as typeof gallery)
  ).slice(0, 4);

  return (
    <>
      <section className="mx-auto max-w-[88rem] px-4 pt-6 sm:px-6">
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
              alt={`${property.name} student accommodation in ${property.location}`}
              width={1600}
              height={1200}
              className="h-64 w-full object-cover sm:h-[30rem]"
            />
          </div>
          <div className="relative hidden grid-cols-2 grid-rows-2 gap-2 sm:grid sm:h-[30rem] lg:gap-3">
            {preview.map((g) => (
              <div key={g.src} className="overflow-hidden rounded-3xl">
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
                <div className="space-y-8">
                  {galleryGroups.map((group) => (
                    <section key={group.label}>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-deep">
                        {group.label}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.items.map((g) => (
                          <figure key={g.src} className="overflow-hidden rounded-2xl">
                            <img
                              src={g.src}
                              alt={`${property.name} — ${g.caption}`}
                              loading="lazy"
                              className="h-56 w-full rounded-2xl object-cover"
                            />
                            <figcaption className="px-1 py-2 text-xs text-muted-foreground">
                              {g.caption}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

      </section>

      <section className="mx-auto mt-8 max-w-[88rem] px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_27rem] xl:grid-cols-[minmax(0,1fr)_31rem]">
          <div className="space-y-10 sm:space-y-12">
            <div>
              <h1 className="text-2xl font-bold text-brand-deep sm:text-4xl">
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


            <div className="space-y-6">
              <AmenitySection
                title="Building Facilities & Amenities"
                items={property.buildingFacilities}
                iconOverrides={property.iconOverrides}
                iconMode="facility"
              />
              <AmenitySection
                title="Included in Your Stay"
                items={property.includedInStay}
                note={property.utilitiesNote}
                iconOverrides={property.iconOverrides}
                iconMode="facility"
              />
              <AmenitySection
                title="Inside Your Apartment"
                items={property.insideApartment}
                footnote={property.apartmentFootnote}
                iconOverrides={property.iconOverrides}
                iconMode="facility"
              />
            </div>



            <div id="rooms" className="scroll-mt-24">
              <h2 className="text-2xl font-bold text-brand-deep">Rooms & pricing</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Set your move-in date, filter by what you need, then click a room to see photos and
                full details. Select one to price it instantly in the calculator.
              </p>

              <div className="mt-5">
                <RoomPriceTable
                  property={property}
                  rooms={rooms}
                  picks={picks}
                  onPicksChange={setPicks}
                  moveIn={moveIn}
                  onMoveInChange={changeMoveIn}
                  moveOut={moveOut}
                  onMoveOutChange={setMoveOut}
                  term={activeTerm}
                  datesSet={datesSet}

                  selectedRoomId={selectedRoomId}
                  selectedOccupancy={selectedOccupancy}
                  onSelect={(room, occ) => {
                    setSelectedRoomId(room.id);
                    setSelectedOccupancy(occ);
                    document
                      .getElementById("stay-calculator")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                />
              </div>
            </div>




            <LocationSection property={property} />
          </div>


          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">



            {rooms.length > 0 && (
              <div id="stay-calculator" className="scroll-mt-24">
              <StayCalculator
                property={property}
                rooms={rooms}
                selectedRoomId={selectedRoomId ?? undefined}
                moveIn={moveIn}
                moveOut={moveOut}
                occupancy={selectedOccupancy}
                actions={(state) => (
                  <>
                    <EnquiryDialog
                      property={property}
                      rooms={rooms}
                      stay={{
                        room: state.room,
                        occupancy: state.occupancy,
                        term: state.term,
                        rent: state.rent,
                        moveIn: state.moveIn,
                        moveOut: state.moveOut,
                        quote: state.quote,
                        paymentTerm: state.paymentTerm,
                      }}
                      onStayChange={(next) => {
                        if (next.roomId !== undefined) {
                          setSelectedRoomId(next.roomId);
                          const room = rooms.find((r) => r.id === next.roomId);
                          setSelectedOccupancy(room?.occupancies[0]);
                        }
                        if (next.occupancy !== undefined) setSelectedOccupancy(next.occupancy);
                        if (next.moveIn !== undefined) changeMoveIn(next.moveIn);
                        if (next.moveOut !== undefined) setMoveOut(next.moveOut);
                      }}
                      trigger={
                        <Button size="lg" className="w-full">
                          Check Availability
                        </Button>
                      }
                    />
                    <Button asChild size="lg" variant="outline" className="w-full">
                      <Link to="/book-viewing">Book a Viewing</Link>
                    </Button>
                  </>
                )}
              />
              </div>
            )}

          </aside>


        </div>
      </section>

      <div className="mt-16">
        <CtaBand
          title={`Interested in ${property.name}?`}
          message={`Hi Brachtia Homes, I'd like to book a viewing at ${property.name}.`}
        />
      </div>

      {rooms.length > 0 && (
        <>
          <div className="h-24 md:hidden" aria-hidden />
          <MobileCtaBar
            label="See your move-in cost"
            hint="Pick a room and rate to price your stay"
            message={`Hi Brachtia Homes, I'd like to check availability at ${property.name}.`}
          />
        </>
      )}
    </>
  );

}
