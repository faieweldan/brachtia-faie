import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  MailCheck,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sofa,
  Users,
  Headphones,
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
  {
    icon: Users,
    title: "Flexible Living",
    text: "Single or twin-sharing rooms, with short and long-term stays.",
  },
  {
    icon: Smartphone,
    title: "Fully Digital Journey",
    text: "From enquiry and booking to documents and check-in, all handled online.",
  },
  {
    icon: HeartHandshake,
    title: "Personal Welcome",
    text: "Personal check-ins, city briefings and local tours to help you settle in.",
  },
  {
    icon: GraduationCap,
    title: "Close to University",
    text: "Conveniently located residences with easy access to campus.",
  },
  {
    icon: Sofa,
    title: "Move-In Ready",
    text: "Fully furnished units with Wi-Fi and monthly cleaning included.",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Secure",
    text: "24/7 security and controlled access for greater peace of mind.",
  },
  {
    icon: Receipt,
    title: "Easy Utility Splitting",
    text: "Digital utility bills that make sharing costs with housemates simple.",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    text: "A dedicated team available whenever you need help during your stay.",
  },
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
      <section className="relative overflow-hidden py-16 sm:py-20">
        {/* soft peach wash behind headline */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-[120%] -translate-x-1/2 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_oklab,var(--brand-soft)_55%,transparent),transparent_100%)]"
        />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">WHY STUDENTS CHOOSE US</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
              Everything you need to settle in.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              From finding your room to feeling at home.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {perks.map((p) => (
              <div
                key={p.title}
                className="group rounded-3xl border border-border/60 bg-brand-tint/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/20 hover:bg-brand-tint/70 hover:shadow-card"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft transition-transform duration-300 group-hover:scale-105">
                  <p.icon className="size-5 text-brand" />
                </span>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-brand-deep">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative overflow-hidden bg-brand-deep py-20 sm:py-24">
        {/* ambient gradient glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,color-mix(in_oklab,var(--brand)_55%,transparent),transparent_70%),radial-gradient(55%_45%_at_90%_100%,color-mix(in_oklab,var(--brand-soft)_28%,transparent),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-brand/30 blur-3xl animate-float-slow"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-brand-soft/20 blur-3xl animate-float-slow [animation-delay:-6s]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]"
        />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-soft">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-background sm:text-5xl whitespace-nowrap">
              Book your room in 3 simple steps.
            </h2>
            <p className="mt-3 max-w-2xl text-base text-background/70">
              Tell us what you're looking for. We'll check availability and guide you through the rest.
            </p>
          </div>

          <div className="relative mt-14">
            {/* connector line + travelling pulse */}
            <div
              aria-hidden
              className="absolute left-[30px] top-6 bottom-6 w-px overflow-hidden bg-gradient-to-b from-transparent via-background/30 to-transparent md:left-0 md:right-0 md:top-[30px] md:bottom-auto md:h-px md:w-auto md:bg-gradient-to-r"
            >
              <span className="absolute inset-y-0 left-0 hidden w-1/4 bg-gradient-to-r from-transparent via-brand-soft to-transparent animate-flow-x md:block" />
            </div>

            <ol className="relative grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.n}
                  className="group relative rounded-3xl border border-background/12 bg-background/[0.06] p-6 backdrop-blur-xl transition-colors duration-300 hover:border-background/30 hover:bg-background/[0.1]"
                >
                  <span className="relative flex size-15 items-center justify-center rounded-2xl bg-background/10 ring-1 ring-background/20">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-brand-soft/30 animate-pulse-ring"
                      style={{ animationDelay: `${i * 0.9}s` }}
                    />
                    <s.icon className="relative size-6 text-brand-soft" />
                  </span>
                  <p className="mt-5 text-xs font-bold tracking-[0.25em] text-brand-soft/80">{s.n}</p>
                  <h3 className="mt-1.5 text-xl font-bold text-background">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-background/70">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-12 flex flex-col items-start gap-3">
            <Button
              asChild
              size="lg"
              className="h-13 rounded-full bg-background px-8 text-base text-brand-deep hover:bg-background/90"
            >
              <Link to="/apply">
                Check Availability <ArrowRight className="size-5" />
              </Link>
            </Button>
            <p className="text-sm text-background/70">
              No account needed · Takes about 2 minutes · No complicated forms
            </p>
            <p className="text-xs text-background/50">
              *Room offers are subject to availability and complete enquiry details.
            </p>
          </div>
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
