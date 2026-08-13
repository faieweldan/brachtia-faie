import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  ShieldCheck,
  Sparkles,
  Wifi,
  Users,
  MessageCircle,
} from "lucide-react";
import heroImage from "@/assets/arc-exterior.jpg";
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/site/PropertyCard";
import Reviews from "@/components/site/Reviews";
import CtaBand from "@/components/site/CtaBand";
import { properties, whatsappUrl } from "@/data/properties";

const title = "Brachtia Homes | Student Accommodation in Cyberjaya";
const description =
  "Safe, fully furnished off-campus student accommodation in Cyberjaya. Single and twin-sharing rooms with free Wi-Fi, 24/7 warden support and transparent pricing.";

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
  { value: "2009", label: "Established" },
  { value: "15+", label: "Years in business" },
  { value: "80+", label: "Properties managed" },
  { value: "24/7", label: "Warden support" },
];

const perks = [
  { icon: Building2, title: "Fully furnished units", text: "Move in with just your suitcase — beds, desks, wardrobes and a fully equipped kitchen." },
  { icon: Wifi, title: "Free Wi-Fi at The Arc", text: "Included Wi-Fi and monthly cleaning of bathrooms and common areas." },
  { icon: ShieldCheck, title: "Safety first", text: "24/7 guards, access card entry and CCTV. Gender-segregated, halal and non-smoking units." },
  { icon: Users, title: "Student support 24/7", text: "Dedicated wardens for lock-outs, medical help and roommate matters." },
  { icon: CalendarClock, title: "12-month or short-term", text: "Full academic year contracts or short stays below 6 months at The Arc." },
  { icon: BadgeCheck, title: "No hidden fees", text: "Every deposit and one-time charge is listed before you commit." },
];

function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImage}
          alt="Student accommodation building in Cyberjaya"
          width={1600}
          height={1000}
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-deep/95 via-brand-deep/80 to-brand-deep/40" />
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="max-w-2xl text-primary-foreground">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-foreground/70">
              Where You Belong
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Off-campus student accommodation in Cyberjaya
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
              Fully furnished rooms, clear pricing and 24/7 student support — trusted by local
              and international students since 2009.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/properties">
                  Browse properties <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <a
                  href={whatsappUrl("Hi Brachtia Homes, I'd like to know more about your student rooms in Cyberjaya.")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> Chat on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-brand">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">About us</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl">
              A home away from home, managed properly
            </h2>
            <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                At Brachtia Homes we take pride in offering top-notch property management services
                tailored to the diverse needs of our clients. Specialising in both long-term and
                short-term rentals, we cater to students — local and international — professionals
                and travellers seeking a home away from home.
              </p>
              <p>
                Alongside student hostel management we offer global student services: visa
                documentation, arrival assistance, local ground transport and travel arrangements,
                so students land in Malaysia with everything handled.
              </p>
            </div>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/about">
                More about Brachtia Homes <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {perks.slice(0, 4).map((p) => (
              <div key={p.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p.icon className="size-6 text-brand" />
                <h3 className="mt-3 font-semibold text-foreground">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Our residences</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl">
                Choose your place in Cyberjaya
              </h2>
            </div>
            <Link
              to="/properties"
              className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-brand sm:inline-flex"
            >
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">What's included</p>
        </div>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl">
          Everything a student needs, sorted
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p.icon className="size-6 text-brand" />
              <h3 className="mt-3 font-semibold text-foreground">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-xl border border-brand/20 bg-brand-soft/50 p-4 text-sm text-brand-deep">
          All our units are halal, non-smoking, gender-segregated (no unisex) and must be kept
          clean at all times.
        </p>
      </section>

      <Reviews />
      <CtaBand />
    </>
  );
}
