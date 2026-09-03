import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePercent,
  GraduationCap,
  HeartHandshake,
  Receipt,
  ShieldCheck,
  Sofa,
  Users,
  Headphones,
  Star,
} from "lucide-react";
import heroAsset from "@/assets/hero-cover.png.asset.json";
import parentsImageAsset from "@/assets/parents-support.jpg.asset.json";
const parentsImage = parentsImageAsset.url;
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/site/PropertyCard";
import Reviews from "@/components/site/Reviews";
import CtaBand from "@/components/site/CtaBand";
import UniversityStrip from "@/components/site/UniversityStrip";
import HowItWorks from "@/components/site/HowItWorks";
import { properties } from "@/data/properties";
import { reviewSummary } from "@/data/reviews";

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
    icon: BadgePercent,
    title: "Transparent Pricing",
    text: "Know your rent, deposits and fees upfront, with no unexpected surprises.",
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
    text: "Digital utility bill calculator that makes sharing costs with housemates simple.",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    text: "A dedicated team available whenever you need help during your stay.",
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
      <section className="relative overflow-hidden">
        {/* soft warm wash tying both columns together */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(80%_100%_at_75%_0%,color-mix(in_oklab,var(--brand-soft)_60%,transparent),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-40 size-96 rounded-full bg-brand/5 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="min-w-0">
              <h1 className="text-[2.6rem] font-extrabold leading-[1.03] tracking-tight text-brand-deep sm:text-6xl">
                Student living,
                <br />
                <span className="text-brand">made simple.</span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                Comfortable, well-managed student accommodation — with the support you need from
                enquiry to move-in.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 rounded-full px-8 text-base shadow-lift">
                  <a href="#residences">
                    Explore Residences <ArrowRight className="size-5" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-full border-2 px-8 text-base">
                  <Link to="/properties">Check Availability</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border/70 pt-6">
                {[
                  { value: "17+", label: "Years managing homes" },
                  { value: "20+", label: "Nationalities hosted" },
                  { value: "24/7", label: "Support & security" },
                ].map((s) => (
                  <div key={s.label} className="min-w-0">
                    <p className="text-2xl font-extrabold tracking-tight text-brand-deep">{s.value}</p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Image */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -right-6 -top-6 hidden h-40 w-40 rounded-[2rem] bg-brand-soft lg:block"
              />
              <div className="relative overflow-hidden rounded-[2rem] shadow-lift ring-1 ring-border/70">
                <img
                  src={heroAsset.url}
                  alt="Students relaxing together in a Brachtia Homes student residence in Cyberjaya"
                  width={1600}
                  height={1200}
                  className="aspect-[4/3.4] size-full object-cover sm:aspect-[4/3]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-deep/45 to-transparent"
                />
              </div>

              {/* rating chip */}
              <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl border border-white/30 bg-white/20 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:left-6 sm:gap-3.5 sm:py-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                  <svg viewBox="0 0 24 24" className="size-5">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold leading-none text-white">{reviewSummary.average}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="size-3.5 fill-amber-400 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.6)]" />
                      ))}
                    </div>
                  </div>
                  <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/70">Google Rating</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-14 text-sm text-muted-foreground sm:mt-16">
            Student accommodation for local and international students studying in Cyberjaya.
          </p>
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

      {/* How it works */}
      <HowItWorks />

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
