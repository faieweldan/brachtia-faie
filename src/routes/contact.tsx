import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Handshake,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  School,
  Store,
} from "lucide-react";
import { company, whatsappUrl } from "@/data/properties";
import { SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";

import { Button } from "@/components/ui/button";

const title = "Contact Brachtia Homes | Student Housing Partnerships in Cyberjaya";
const description =
  "Partner with Brachtia Homes — universities, property developers, agents, homeowners, students, parents and Cyberjaya businesses. Reach us on WhatsApp, call or email.";
const canonical = `${SITE_URL}/contact`;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:image", content: SOCIAL_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: SOCIAL_IMAGE },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "@id": `${SITE_URL}/#localbusiness`,
          name: company.name,
          url: canonical,
          email: company.email,
          telephone: company.phones,
          address: {
            "@type": "PostalAddress",
            streetAddress:
              "Level 15 D'Pulze, Lingkaran Cyber Point Timur, Cyber 12",
            addressLocality: "Cyberjaya",
            addressRegion: "Selangor",
            postalCode: "63000",
            addressCountry: "MY",
          },
          areaServed: "Cyberjaya, Selangor, Malaysia",
        }),
      },
    ],
  }),
  component: ContactPage,
});

type Audience = {
  icon: typeof School;
  title: string;
  blurb: string;
  message: string;
  cta: string;
};

const audiences: Audience[] = [
  {
    icon: School,
    title: "Universities & Institutions",
    blurb:
      "Reliable, vetted student housing near your campus. Let's house your students with onboarding, safety standards and dedicated support.",
    message:
      "Hi Brachtia Homes, I'm from a university/institution and would like to discuss student housing partnerships.",
    cta: "Partner for student housing",
  },
  {
    icon: Building2,
    title: "Property Developers",
    blurb:
      "Looking for a trusted operator to fill and manage your student residence? We bring demand, marketing and end-to-end tenant care.",
    message:
      "Hi Brachtia Homes, I represent a property developer and would like to explore operating a student residence.",
    cta: "Operate my residence",
  },
  {
    icon: Handshake,
    title: "Agents & Partners",
    blurb:
      "Refer students or co-list properties with us. We handle viewings, contracts and move-in while you stay connected to your clients.",
    message:
      "Hi Brachtia Homes, I'm an agent and would like to refer students or co-list properties.",
    cta: "Refer & co-list",
  },
  {
    icon: Home,
    title: "Homeowners",
    blurb:
      "Own a unit near campus? We manage it end-to-end — tenanting, maintenance, rent collection and reporting — so you earn stress-free.",
    message:
      "Hi Brachtia Homes, I own a unit near campus and would like you to manage it. Please share details.",
    cta: "Manage my property",
  },
  {
    icon: Store,
    title: "Students & Parents",
    blurb:
      "Find the right room, check availability and pricing, or book a viewing. We help you move in with confidence.",
    message:
      "Hi Brachtia Homes, I'd like to find a room and check availability and pricing.",
    cta: "Find a room",
  },
  {
    icon: Store,
    title: "Cyberjaya Businesses",
    blurb:
      "Run a café, service or event for students? Let's collaborate on perks, packages and reach across our resident community.",
    message:
      "Hi Brachtia Homes, I run a business in Cyberjaya and would like to collaborate with your resident community.",
    cta: "Collaborate with us",
  },
];

function ContactPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Header */}
      <div className="max-w-2xl">
        <span className="text-sm font-semibold uppercase tracking-wide text-brand">
          Let's work together
        </span>
        <h1 className="mt-2 text-3xl font-bold text-brand-deep sm:text-4xl">
          Contact us
        </h1>
        <p className="mt-3 text-muted-foreground">
          Brachtia Homes works with universities, developers, agents, homeowners,
          students, parents and businesses across Cyberjaya. Whatever brings you
          here — the fastest way to reach us is WhatsApp, and we reply within a
          few hours.
        </p>
      </div>

      {/* Contact methods — single, clean strip */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href={whatsappUrl("Hi Brachtia Homes, I'd like to get in touch.")}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition hover:border-brand/40 hover:shadow-sm"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white">
            <MessageCircle className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">WhatsApp</span>
            <span className="block truncate text-sm font-semibold text-brand-deep">
              {company.phones[0]}
            </span>
          </span>
        </a>
        <a
          href={`mailto:${company.email}`}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition hover:border-brand/40 hover:shadow-sm"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
            <Mail className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Email</span>
            <span className="block truncate text-sm font-semibold text-brand-deep">
              {company.email}
            </span>
          </span>
        </a>
        <a
          href={`tel:${company.phones[0].replace(/[^+\d]/g, "")}`}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition hover:border-brand/40 hover:shadow-sm"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
            <Phone className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Call</span>
            <span className="block truncate text-sm font-semibold text-brand-deep">
              {company.phones[0]}
            </span>
          </span>
        </a>
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
            <MapPin className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Office</span>
            <span className="block text-sm font-semibold text-brand-deep">
              Cyberjaya, Selangor
            </span>
          </span>
        </div>
      </div>

      {/* Company detail line */}
      <div className="mt-4 rounded-2xl bg-brand-soft/60 p-4 text-sm text-brand-deep/80">
        <span className="font-semibold text-brand-deep">{company.legalName}</span>{" "}
        · {company.registration} · {company.address}
      </div>

      {/* Audiences */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-brand-deep">
          Who we work with
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Choose the option that fits you — each opens a WhatsApp chat with the
          right starting message so our team can help you faster.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => (
            <div
              key={a.title}
              className="flex flex-col rounded-2xl border border-border/70 bg-card p-6 transition hover:shadow-md"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
                <a.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-brand-deep">
                {a.title}
              </h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                {a.blurb}
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-5 w-full border-brand/30 text-brand-deep hover:bg-brand-soft"
              >
                <a
                  href={whatsappUrl(a.message)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> {a.cta}
                </a>
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Resident support note */}
      <div className="mt-10 rounded-2xl border border-border/70 bg-card p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="sm:flex-1">
          <h3 className="text-lg font-bold text-brand-deep">
            Already a resident?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintenance and technical requests are answered within 24–48 hours.
            Message the warden line on WhatsApp any time, day or night.
          </p>
        </div>
        <Button asChild className="mt-4 sm:mt-0" variant="outline">
          <a
            href={whatsappUrl(
              "Hi Brachtia Homes, I'm a resident and need maintenance/support.",
            )}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" /> Resident support
          </a>
        </Button>
      </div>
    </section>
  );
}
