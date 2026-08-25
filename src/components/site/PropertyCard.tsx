import { Link } from "@tanstack/react-router";
import { ArrowRight, BedDouble, MapPin } from "lucide-react";
import { availableCount, formatRM, priceFrom, type Property } from "@/data/properties";
import { Badge } from "@/components/ui/badge";

export default function PropertyCard({ property }: { property: Property }) {
  const available = availableCount(property.slug);

  return (
    <Link
      to="/properties/$slug"
      params={{ slug: property.slug }}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={property.heroImage}
          alt={property.name}
          loading="lazy"
          width={1600}
          height={1000}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <Badge className="absolute left-3 top-3 bg-card text-brand-deep hover:bg-card">
          {available} room type{available === 1 ? "" : "s"} available
        </Badge>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold text-brand-deep">{property.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5" /> {property.location}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{property.summary}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {property.facilities.slice(0, 4).map((f) => (
            <span key={f} className="rounded-full bg-brand-tint px-2.5 py-1 text-xs text-brand-deep">
              {f}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">From</p>
            <p className="font-display text-2xl font-semibold text-brand">
              {formatRM(priceFrom(property.slug))}
              <span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
            <BedDouble className="size-4" /> View rooms <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
