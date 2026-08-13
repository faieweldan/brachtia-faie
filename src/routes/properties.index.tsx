import { createFileRoute } from "@tanstack/react-router";
import PropertyCard from "@/components/site/PropertyCard";
import CtaBand from "@/components/site/CtaBand";
import { properties } from "@/data/properties";

const title = "Student Properties in Cyberjaya | Brachtia Homes";
const description =
  "Browse Brachtia Homes student accommodation in Cyberjaya — The Arc shared units and Solstice Residence private apartments, with live room availability and pricing.";

export const Route = createFileRoute("/properties/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: PropertiesPage,
});

function PropertiesPage() {
  return (
    <>
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Properties</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-brand-deep">
            Student accommodation in Cyberjaya
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Two managed residences, both minutes from campus and public transport. Pick a property
            to see photos, facilities, room pricing and what's available right now.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
