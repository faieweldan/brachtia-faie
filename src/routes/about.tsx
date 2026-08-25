import { createFileRoute } from "@tanstack/react-router";
import { Building2, GraduationCap, Home, Landmark } from "lucide-react";
import CtaBand from "@/components/site/CtaBand";
import students from "@/assets/living-dining.jpg";

const title = "About Brachtia Homes | Property & Student Services";
const description =
  "Established 2009, Brachtia Homes manages 80+ properties and provides off-campus student accommodation, hostel management and global student services in Malaysia.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: AboutPage,
});

const services = [
  {
    icon: Landmark,
    title: "Property sales & leasing",
    text: "Commercial and residential property and land sale and leasing services, guided end to end.",
  },
  {
    icon: Building2,
    title: "Property management",
    text: "Rental property oversight, building management, renovation and interior design services.",
  },
  {
    icon: Home,
    title: "Student hostel management",
    text: "Off-campus student accommodation and in-campus hostel management built around student wellbeing.",
  },
  {
    icon: GraduationCap,
    title: "Global student services",
    text: "Student visa documentation, arrival assistance, ground transport, travel tours and training arrangements.",
  },
];

const team = [
  { name: "PS Valsala Purushothaman", role: "Head of Sales & Strategy" },
  { name: "Syazwani Juhari", role: "Head of Operations" },
  { name: "Lavania Vijyakumar", role: "Project Manager" },
];

function AboutPage() {
  return (
    <>
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Our story</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-brand-deep">
            Property management & global student services
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            At Brachtia Homes, we take pride in offering top-notch property management services
            tailored to meet the diverse needs of our clients. Specialising in both long-term and
            short-term rentals, we cater to students — both local and international — professionals
            and travellers seeking a home away from home. We work with property owners to maximise
            the potential of their investments.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:items-center">
        <img
          src={students}
          alt="Furnished student living and dining area"
          loading="lazy"
          width={1600}
          height={1000}
          className="aspect-[4/3] w-full rounded-2xl object-cover shadow-card"
        />
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "2009", label: "Established" },
            { value: "15", label: "Years in business" },
            { value: "80+", label: "Properties managed" },
          ].map((s) => (
            <div key={s.label} className="rounded-3xl border border-border/70 bg-card p-5 text-center shadow-card">
              <p className="font-display text-2xl font-semibold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
          <p className="col-span-3 text-sm leading-relaxed text-muted-foreground">
            We create comfortable living environments conducive to student success, ensuring
            seamless arrangements and exceptional service for both students and educational
            institutions.
          </p>
        </div>
      </section>

      <section className="bg-secondary/50 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-brand-deep">Our services</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <div key={s.title} className="rounded-3xl border border-border/70 bg-card p-6 shadow-card">
                <s.icon className="size-6 text-brand" />
                <h3 className="mt-3 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-brand-deep">Meet our team</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {team.map((m) => (
            <div key={m.name} className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-card">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand-deep">
                {m.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
              </div>
              <p className="mt-3 font-semibold text-foreground">{m.name}</p>
              <p className="text-sm text-muted-foreground">{m.role}</p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
