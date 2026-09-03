import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, HeartHandshake, LifeBuoy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import aboutHero from "@/assets/about-hero.jpg.asset.json";
import humanSideAsset from "@/assets/parents-support.jpg.asset.json";
const humanSide = humanSideAsset.url;

const title = "About Brachtia Homes | Student Accommodation in Malaysia";
const description =
  "For over 17 years, Brachtia Homes has helped local and international students find safe, well-managed accommodation in Malaysia — appointed by leading universities.";

export const Route = createFileRoute("/about")({
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
  component: AboutPage,
});

const stats = [
  { value: "17+", label: "Years experience" },
  { value: "100+", label: "Properties managed" },
  { value: "20+", label: "Nationalities" },
  { value: "24/7", label: "Student support" },
];

const partners = [
  { short: "MMU", name: "Multimedia University" },
  { short: "HWUM", name: "Heriot-Watt University Malaysia" },
  { short: "UoC", name: "University of Cyberjaya" },
  { short: "CITY", name: "City University Malaysia" },
];

const differences = [
  {
    icon: ShieldCheck,
    title: "Student housing specialists",
    text: "17+ years in student accommodation — we know what students living away from home need, including first-time arrivals in Malaysia.",
  },
  {
    icon: HeartHandshake,
    title: "A personal welcome",
    text: "We welcome students in person, help with check-in, and run city briefings and local tours so they settle in fast.",
  },
  {
    icon: CalendarCheck,
    title: "Safe & supported living",
    text: "Managed residences with security, wardens and round-the-clock student support — peace of mind for families too.",
  },
  {
    icon: LifeBuoy,
    title: "Here throughout your stay",
    text: "From maintenance and everyday questions to the unexpected, our team stays reachable for the whole tenancy.",
  },
];

function AboutPage() {
  return (
    <>
      {/* Hero — full-bleed beige band, photo fills the right side and fades into the copy on the left */}
      <section className="relative overflow-hidden bg-brand-tint">
        {/* Desktop photo — anchored to the right edge, full height, fading out to the left */}
        <img
          src={aboutHero.url}
          alt="Students together outside a Brachtia Homes residence"
          className="absolute inset-y-0 right-0 hidden h-full w-[56%] object-cover object-center md:block"
          style={{
            maskImage: "linear-gradient(to right, transparent, #000 30%)",
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 30%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="md:w-[52%]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
              About Brachtia Homes
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.08] tracking-tight text-brand-deep sm:text-5xl">
              Designed for students. Trusted by parents and universities.
            </h1>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              For over 17 years, Brachtia Homes has been helping local and international students
              find safe, well-managed accommodation and feel at home while studying in Malaysia.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              As an appointed off-campus accommodation provider for universities and education
              institutions, we support students beyond finding a room — from arrival and check-in
              to everyday living.
            </p>
            <Button asChild size="lg" className="mt-8 h-13 rounded-full px-7 text-base font-bold">
              <Link to="/properties">Explore our residences</Link>
            </Button>
          </div>
        </div>

        {/* Mobile photo */}
        <img
          src={aboutHero.url}
          alt="Students together outside a Brachtia Homes residence"
          className="h-64 w-full object-cover object-center md:hidden"
          style={{
            maskImage: "linear-gradient(to bottom, transparent, #000 18%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 18%)",
          }}
        />
      </section>

      {/* Stats bar — sits between the hero (first section) and university partners (second section) */}
      <div className="bg-background px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border shadow-lift sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card px-6 py-7 text-center">
              <p className="text-2xl font-extrabold tracking-tight text-brand sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* University partners */}
      <section className="bg-background pb-14 pt-16 sm:pb-20 sm:pt-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            Our university partners
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            Appointed by leading universities to house their students.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Official off-campus accommodation partner to:
          </p>

          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4">
            {partners.map((p) => (
              <div key={p.short} className="flex flex-col items-center gap-4">
                <div className="flex h-24 w-full max-w-[180px] items-center justify-center rounded-2xl border border-border/70 bg-card px-4">
                  <span className="text-2xl font-extrabold tracking-tight text-brand-deep">
                    {p.short}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Brachtia difference */}
      <section className="bg-brand-tint py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            The Brachtia difference
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
            More than a place to stay.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Moving away from home is a big step — for students and their families. Our job isn't
            just to hand over the keys. It's to help students settle in and stay supported.
          </p>

          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {differences.map((d) => (
              <div key={d.title} className="border-t border-border pt-5">
                <d.icon className="size-5 text-brand" strokeWidth={1.75} />
                <h3 className="mt-4 text-base font-bold tracking-tight text-brand-deep">
                  {d.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The human side */}
      <section className="bg-background py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 md:items-center">
          <img
            src={humanSide}
            alt="Brachtia Homes team welcoming international students on arrival"
            loading="lazy"
            width={1600}
            height={1200}
            className="aspect-[4/5] w-full rounded-[2.5rem] object-cover shadow-card md:aspect-[4/4.4]"
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
              The human side
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-brand-deep sm:text-4xl">
              Someone to turn to, even when home is far away.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Over the years, we've welcomed students from different countries, cultures and
              backgrounds — many experiencing life away from home for the first time.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              From the day they arrive to the everyday questions that come afterwards, our team is
              here to make student living feel a little easier, safer and more familiar.
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-brand-tint px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-brand-deep px-6 py-10 text-primary-foreground shadow-lift sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-soft/15 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-brand/40 blur-3xl"
            />
            <div className="relative grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div>
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                  Find your home away from home.
                </h2>
                <p className="mt-3 max-w-lg text-base text-primary-foreground/75">
                  Explore our student residences and tell us what you're looking for. We'll help you
                  find a suitable place and get settled.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-13 w-full rounded-full bg-primary-foreground text-base font-bold text-brand-deep hover:bg-primary-foreground/90"
                >
                  <Link to="/properties">Explore residences</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-13 w-full rounded-full border-2 border-primary-foreground/35 bg-transparent text-base font-bold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link to="/book-viewing">Book a Viewing</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
