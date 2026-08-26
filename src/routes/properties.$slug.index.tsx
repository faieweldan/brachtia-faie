import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, MapPin } from "lucide-react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

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
  type ContractTerm,
  type Occupancy,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import AmenitySection from "@/components/site/AmenitySection";
import LocationSection from "@/components/site/LocationSection";
import CtaBand from "@/components/site/CtaBand";
import EnquireDialog from "@/components/site/EnquireDialog";
import RoomPriceTable from "@/components/site/RoomPriceTable";
import StayCalculator from "@/components/site/StayCalculator";

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


function plusMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function PropertyPage() {
  const { property } = Route.useLoaderData();
  const [picks, setPicks] = useState<string[]>([]);
  const [term, setTerm] = useState<ContractTerm>("long");
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [selectedOccupancy, setSelectedOccupancy] = useState<Occupancy | undefined>(undefined);
  const [moveIn, setMoveIn] = useState(() => new Date().toISOString().slice(0, 10));
  const [moveOut, setMoveOut] = useState(() =>
    plusMonths(new Date().toISOString().slice(0, 10), 12),
  );

  function changeMoveIn(value: string) {
    setMoveIn(value);
    if (moveOut <= value) setMoveOut(plusMonths(value, term === "short" ? 3 : 12));
  }

  const rooms = getRoomTypes(property.slug);
  const activeTerm = property.contractTerms.includes(term) ? term : "long";
  const gallery = property.gallery;

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

      <section className="mx-auto mt-8 max-w-[88rem] px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_27rem] xl:grid-cols-[minmax(0,1fr)_31rem]">
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

            <div className="space-y-6">
              <AmenitySection
                title="Building Facilities & Amenities"
                items={property.buildingFacilities}
                iconMode="facility"
              />
              <AmenitySection
                title="Included in Your Stay"
                items={property.includedInStay}
                note={property.utilitiesNote}
                iconMode="facility"
              />
              <AmenitySection
                title="Inside Your Apartment"
                items={property.insideApartment}
                footnote={property.apartmentFootnote}
                iconMode="facility"
              />
            </div>



            <div id="rooms">
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
                  onTermChange={setTerm}
                  selectedRoomId={selectedRoomId}
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
              <div id="stay-calculator">
              <StayCalculator
                property={property}
                rooms={rooms}
                selectedRoomId={selectedRoomId ?? undefined}
                onRoomChange={setSelectedRoomId}
                moveIn={moveIn}
                moveOut={moveOut}
                occupancy={selectedOccupancy}
                actions={(state) => (
                  <EnquireDialog
                    property={property}
                    room={state.room}
                    term={state.term}
                    occupancy={state.occupancy}
                    moveIn={state.moveIn}
                    moveOut={state.moveOut}
                    trigger={
                      <Button size="lg" className="w-full">
                        Reserve with these dates
                      </Button>
                    }
                  />
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
    </>
  );
}
