import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Check, MapPin, MessageCircle, Sparkles, X } from "lucide-react";
import {
  formatRM,
  getProperty,
  getRoomsForProperty,
  whatsappUrl,
  type ContractTerm,
} from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import CtaBand from "@/components/site/CtaBand";
import RoomCard from "@/components/site/RoomCard";

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
      loaderData?.property.summary ??
      "Student accommodation in Cyberjaya by Brachtia Homes.";
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
  const rooms = getRoomsForProperty(property.slug);
  const activeTerm = property.contractTerms.includes(term) ? term : "long";
  const tables = property.pricing[activeTerm];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <nav className="text-sm text-muted-foreground">
            <Link to="/properties" className="hover:text-brand">
              Properties
            </Link>
            <span className="px-1.5">/</span>
            <span className="text-foreground">{property.name}</span>
          </nav>
          <div className="mt-4 overflow-hidden rounded-2xl">
            <img
              src={property.heroImage}
              alt={property.name}
              width={1600}
              height={900}
              className="h-56 w-full object-cover sm:h-80 md:h-96"
            />
          </div>
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold text-brand-deep sm:text-4xl">
                {property.name}
              </h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" /> {property.location}
              </p>
              <p className="mt-3 max-w-2xl text-muted-foreground">{property.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/book-viewing" search={{ property: property.slug }}>
                  Book a Viewing
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
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
        </section>

        <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-10 lg:col-span-2">
              <div>
                <h2 className="font-display text-2xl font-semibold text-brand-deep">
                  About this residence
                </h2>
                {property.description.map((p) => (
                  <p key={p} className="mt-3 text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>

              <div>
                <h2 className="font-display text-2xl font-semibold text-brand-deep">Photos</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {property.gallery.map((g) => (
                    <figure key={g.caption} className="overflow-hidden rounded-xl border border-border">
                      <img
                        src={g.src}
                        alt={`${property.name} — ${g.caption}`}
                        loading="lazy"
                        width={800}
                        height={600}
                        className="h-32 w-full object-cover sm:h-40"
                      />
                      <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">
                        {g.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display text-2xl font-semibold text-brand-deep">
                  Facilities & amenities
                </h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {property.facilities.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-display text-lg font-semibold text-brand-deep">
                    What's included
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {property.included.map((i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {i}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-display text-lg font-semibold text-brand-deep">
                    Not included
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {property.excluded.map((i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {i}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="font-display text-2xl font-semibold text-brand-deep">
                  Room pricing
                </h2>
                <div className="mt-4 inline-flex rounded-lg border border-border bg-card p-1">
                  {property.contractTerms.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerm(t)}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        activeTerm === t
                          ? "bg-brand text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "long" ? "12-month stay" : "Short-term (under 6 months)"}
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-6">
                  {tables.map((table) => (
                    <div
                      key={table.unitType}
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      <div className="border-b border-border px-4 py-3">
                        <p className="font-medium text-brand-deep">{table.unitType}</p>
                        {table.blocks && (
                          <p className="text-xs text-muted-foreground">{table.blocks}</p>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2 font-medium">Room</th>
                              <th className="px-4 py-2 font-medium">Single</th>
                              <th className="px-4 py-2 font-medium">Twin sharing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row) => (
                              <tr key={row.roomType} className="border-t border-border">
                                <td className="px-4 py-3">
                                  <span className="font-medium text-foreground">{row.roomType}</span>
                                  {row.note && (
                                    <span className="block text-xs text-muted-foreground">
                                      {row.note}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {row.single ? `${formatRM(row.single)}/mo` : "—"}
                                </td>
                                <td className="px-4 py-3">
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

            <aside className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold text-brand-deep">Good to know</h3>
                <ul className="mt-3 space-y-2">
                  {property.terms.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold text-brand-deep">
                  What's nearby
                </h3>
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

        <section id="rooms" className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-brand-deep">
              Available units & rooms
            </h2>
            <Badge className="bg-brand-soft text-brand-deep">
              {rooms.filter((r) => r.status !== "occupied").length} rooms open
            </Badge>
          </div>
          <div className="mt-5 space-y-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </section>

        <div className="mt-16">
          <CtaBand
            title={`Interested in ${property.name}?`}
            message={`Hi Brachtia Homes, I'd like to book a viewing at ${property.name}.`}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
