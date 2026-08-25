import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wifi,
  Users,
  Wallet,
} from "lucide-react";
import heroImage from "@/assets/room-single.jpg";
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/site/PropertyCard";
import Reviews from "@/components/site/Reviews";
import CtaBand from "@/components/site/CtaBand";
import { properties, reviewsRating, whatsappUrl } from "@/data/properties";

const title = "Student Accommodation in Cyberjaya | Brachtia Homes";
const description =
  "Furnished student rooms in Cyberjaya. Clear pricing, no hidden fees, 24/7 support. Browse two residences and enquire in minutes.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Home,
});

const stats = [
  { value: "Since 2009", label: "Managing student homes" },
  { value: "80+", label: "Properties managed" },
  { value: "24/7", label: "Warden on call" },
  { value: "0", label: "Hidden fees" },
];

const perks = [
  { icon: Wallet, title: "Every cost upfront", text: "Rent, deposits and fees shown before you enquire." },
  { icon: ShieldCheck, title: "Safe by design", text: "CCTV, card access, gender-segregated units." },
  { icon: Wifi, title: "Move in with a suitcase", text: "Furnished rooms, Wi-Fi and monthly cleaning." },
  { icon: Users, title: "Real people, 24/7", text: "Wardens for lock-outs, repairs and emergencies." },
  { icon: MapPin, title: "Minutes from campus", text: "3 min to the bus stop, MRT feeder and shuttle." },
  { icon: BadgeCheck, title: "Flexible stays", text: "12-month or short-term, priced by the day." },
];

const steps = [
  { n: "1", title: "Pick a room", text: "Compare room types and see the exact total." },
  { n: "2", title: "Enquire", text: "Send your dates and preferences in one form." },
  { n: "3", title: "We confirm", text: "Our team replies on WhatsApp with your unit." },
];

function Stars() {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="size-3.5 fill-gold text-gold" />
      ))}
    </div>
  );
}

function Home() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
            <MapPin className="size-3.5" /> Cyberjaya, Malaysia
          </span>

          <h1 className="mt-7 text-center text-4xl font-extrabold leading-[1.08] tracking-tight text-brand-deep sm:text-6xl">
            Student living,
            <br />
            <span className="text-brand">where you belong.</span>
          </h1>
          <p className="mt-5 max-w-xl text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
            Furnished rooms near campus. Clear prices, no hidden fees.
          </p>

          {/* Image card */}
          <div className="mt-10 w-full rounded-[2.5rem] bg-card p-2.5 shadow-lift sm:p-3">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] sm:aspect-[16/9]">
              <img
                src={heroImage}
                alt="Furnished student room in Cyberjaya"
                width={1600}
                height={900}
                className="size-full object-cover"
              />
              <div className="absolute left-4 top-4 flex items-center gap-2.5 rounded-2xl bg-card/95 px-3 py-2 shadow-card backdrop-blur">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-black text-primary-foreground">
                  G
                </span>
                <div>
                  <Stars />
                  <p className="mt-0.5 text-[10px] font-bold text-foreground">
                    {reviewsRating} Google rating
                  </p>
                </div>
              </div>
              <div className="absolute bottom-4 right-4 rounded-xl bg-brand-deep/50 px-3 py-2 backdrop-blur">
                <p className="text-xs font-bold text-primary-foreground">
                  {properties.length} residences available
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-14 w-full rounded-full px-10 text-base sm:w-auto">
              <Link to="/properties">
                <Search className="size-5" /> Explore homes
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-14 w-full rounded-full border-2 px-8 text-base sm:w-auto"
            >
              <a
                href={whatsappUrl("Hi Brachtia Homes, I'm looking for a student room in Cyberjaya.")}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-5" /> WhatsApp us
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border/70 bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-extrabold tracking-tight text-brand">{s.value}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Properties */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Two homes in Cyberjaya
          </h2>
          <Link
            to="/properties"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-bold text-brand sm:inline-flex"
          >
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="bg-brand-tint py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Why students stay</p>
          </div>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Sorted, safe, no surprises
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {perks.map((p) => (
              <div key={p.title} className="rounded-3xl bg-card p-5 shadow-card">
                <p.icon className="size-6 text-brand" />
                <h3 className="mt-3 font-bold text-foreground">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
          Three steps to your room
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-3xl bg-card p-6 shadow-card">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand text-base font-extrabold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold text-brand-deep">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <Reviews />
      <CtaBand />
    </>
  );
}
