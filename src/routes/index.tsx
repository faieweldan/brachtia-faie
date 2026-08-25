import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  MailCheck,
  MapPin,
  ShieldCheck,
  
  Sofa,
  Wallet,
  Headphones,
  SlidersHorizontal,
} from "lucide-react";
import heroImage from "@/assets/hero-students.jpg";
import parentsImage from "@/assets/parents-support.jpg";
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/site/PropertyCard";
import Reviews from "@/components/site/Reviews";
import CtaBand from "@/components/site/CtaBand";
import UniversityStrip from "@/components/site/UniversityStrip";
import { properties } from "@/data/properties";

const title = "Student Accommodation in Cyberjaya | Brachtia Homes";
const description =
  "Student living, made simple. Comfortable, well-managed student accommodation in Cyberjaya with clear pricing and support from enquiry to move-in.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const perks = [
  { icon: Wallet, title: "Clear pricing", text: "No hidden fees" },
  { icon: ShieldCheck, title: "Safe & secure", text: "Secure access" },
  { icon: Sofa, title: "Move-in ready", text: "Fully furnished" },
  { icon: Headphones, title: "24/7 support", text: "Always here" },
  { icon: MapPin, title: "Close to campus", text: "Cyberjaya locations" },
  { icon: SlidersHorizontal, title: "Flexible options", text: "Single or twin" },
];

const steps = [
  {
    n: "01",
    icon: ClipboardList,
    title: "Tell us what you need",
    text: "Choose your preferred residence, room type and move-in date, and tell us a little about yourself.",
  },
  {
    n: "02",
    icon: CalendarCheck,
    title: "We find your match",
    text: "Our team checks current availability and finds a suitable room based on your requirements.",
  },
  {
    n: "03",
    icon: MailCheck,
    title: "Get your room offer",
    text: "Receive your room details, price and next steps directly by email within 24 hours.*",
  },
];

const stats = [
  { value: "100+", label: "Properties Managed" },
  { value: "17+", label: "Years of Experience" },
  { value: "20+", label: "Nationalities" },
  { value: "24/7", label: "Support & Security" },
];

function Home() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-brand-deep sm:text-6xl">
              Student living,
              <br />
              <span className="text-brand">made simple.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Find comfortable, well-managed student accommodation in Cyberjaya — with the support
              you need from enquiry to move-in.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-13 rounded-full px-8 text-base">
                <a href="#residences">
                  Explore Residences <ArrowRight className="size-5" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-13 rounded-full border-2 px-8 text-base">
                <Link to="/apply">Check Availability</Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              Student accommodation for local and international students studying in Cyberjaya.
            </p>
          </div>

          <div className="rounded-[2.5rem] border border-border/70 bg-card p-2.5 shadow-lift">
            <div className="aspect-[4/3] overflow-hidden rounded-[2rem]">
              <img
                src={heroImage}
                alt="Students relaxing together in a Brachtia Homes student residence in Cyberjaya"
                width={1600}
                height={1104}
                className="size-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <UniversityStrip />

      {/* Residences */}
      <section id="residences" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Our residences</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
          Find your place in Cyberjaya.
        </h2>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Explore our student residences and find a living arrangement that works for you.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      {/* Why students stay */}
      <section className="bg-brand-tint py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-2">
            
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Why students stay</p>
          </div>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Everything sorted. Nothing complicated.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {perks.map((p) => (
              <div key={p.title} className="rounded-3xl border border-border/70 bg-card p-6 shadow-card">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft">
                  <p.icon className="size-5 text-brand" />
                </span>
                <h3 className="mt-4 font-bold text-brand-deep">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Find your room in 3 simple steps.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Tell us what you're looking for. We'll check availability, find a suitable option and
            guide you through the rest.
          </p>
        </div>

        <div className="relative mt-12">
          {/* connector line */}
          <div
            aria-hidden
            className="absolute left-[26px] top-4 bottom-4 w-px bg-gradient-to-b from-brand/10 via-brand/35 to-brand/10 md:left-0 md:right-0 md:top-[26px] md:bottom-auto md:h-px md:w-auto md:bg-gradient-to-r"
          />
          <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-5 md:block">
                <span className="relative flex size-13 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-card shadow-card">
                  <s.icon className="size-5 text-brand" />
                </span>
                <div className="md:mt-5">
                  <p className="text-xs font-bold tracking-[0.2em] text-brand">{s.n}</p>
                  <h3 className="mt-1 text-lg font-bold text-brand-deep">{s.title}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 flex flex-col items-start gap-3">
          <Button asChild size="lg" className="h-13 rounded-full px-8 text-base">
            <Link to="/apply">Check Availability</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            No account needed · Takes about 2 minutes · No complicated forms
          </p>
          <p className="text-xs text-muted-foreground/80">
            *Room offers are subject to availability and complete enquiry details.
          </p>
        </div>
      </section>

      {/* Why Brachtia */}
      <section className="border-y border-border/70 bg-brand-tint py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Why Brachtia</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Student accommodation you can count on.
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-4xl font-extrabold tracking-tight text-brand">{s.value}</p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Reviews />

      {/* For parents */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="overflow-hidden rounded-[2rem] border border-border/70 shadow-card">
            <img
              src={parentsImage}
              alt="A student being welcomed at a Brachtia Homes residence while her parents wave goodbye"
              loading="lazy"
              width={1408}
              height={1008}
              className="size-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">For parents</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
              Away from home, but never on their own.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Moving away for university is a big step — especially when studying in another city or
              country.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              With managed residences, secure access, 24/7 support and a dedicated team on the
              ground, we're here to make student living easier for students and give families
              greater peace of mind.
            </p>
            <Button asChild size="lg" variant="outline" className="mt-7 h-13 rounded-full border-2 px-8 text-base">
              <Link to="/about">About Brachtia</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
