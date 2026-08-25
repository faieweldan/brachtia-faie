import { useState } from "react";
import { Bike, Bus, ChevronDown, Footprints, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaceNearby, Property } from "@/data/properties";

const VISIBLE = 3;

function TravelTimes({ place }: { place: PlaceNearby }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Footprints className="size-3.5 text-brand" /> {place.walk}
      </span>
      <span className="inline-flex items-center gap-1">
        <Bike className="size-3.5 text-brand" /> {place.bike}
      </span>
      <span className="inline-flex items-center gap-1">
        <Bus className="size-3.5 text-brand" /> {place.transit}
      </span>
    </div>
  );
}

function PlaceList({
  title,
  places,
  numbered,
}: {
  title: string;
  places: PlaceNearby[];
  numbered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const collapsible = places.length > VISIBLE;
  const shown = collapsible && !open ? places.slice(0, VISIBLE) : places;

  return (
    <div>
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={`flex w-full items-center justify-between border-b border-border pb-3 text-left ${
          collapsible ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={collapsible ? open : undefined}
      >
        <h3 className="text-base font-bold text-brand-deep">{title}</h3>
        {collapsible && (
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      <ul className="divide-y divide-border">
        {shown.map((place, i) => (
          <li key={place.name} className="flex items-start gap-3 py-3">
            <span
              className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                numbered ? "bg-brand-soft text-brand-deep" : "bg-brand/10 text-brand"
              }`}
            >
              {numbered ? i + 1 : <GraduationCap className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{place.name}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{place.distance}</span>
              </div>
              <TravelTimes place={place} />
            </div>
          </li>
        ))}
      </ul>

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-sm font-medium text-brand hover:underline"
        >
          {open ? "Show less" : `Show more (${places.length - VISIBLE})`}
        </button>
      )}
    </div>
  );
}

export default function LocationSection({ property }: { property: Property }) {
  const { lat, lng } = property.coords;
  const d = 0.015;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <div className="border-b border-border pb-8 last:border-b-0 last:pb-0">
      <h2 className="text-2xl font-bold text-brand-deep">Where you'll be</h2>
      <p className="mt-2 text-sm text-muted-foreground">{property.location}</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-muted">
        <iframe
          title={`Map of ${property.name}`}
          src={mapSrc}
          loading="lazy"
          className="h-[320px] w-full sm:h-[380px]"
        />
      </div>

      <Button asChild variant="outline" className="mt-4">
        <a href={property.wazeUrl} target="_blank" rel="noreferrer">
          Open in Waze
        </a>
      </Button>

      <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-10">
        <PlaceList title="Nearby universities" places={property.nearbyUniversities} />
        <PlaceList title="Points of interest" places={property.pointsOfInterest} numbered />
      </div>
    </div>
  );
}
