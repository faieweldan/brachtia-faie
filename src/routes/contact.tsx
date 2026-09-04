import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { company, whatsappUrl } from "@/data/properties";
import { SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";

import { Button } from "@/components/ui/button";

const title = "Contact Brachtia Homes | Cyberjaya Student Housing Team";
const description =
  "Talk to the Brachtia Homes student team about rooms, viewings and move-in support in Cyberjaya. WhatsApp, call or email us — we reply fast.";
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
            streetAddress: "Level 15 D'Pulze, Lingkaran Cyber Point Timur, Cyber 12",
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


function ContactPage() {
  return (
    <>
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-bold text-brand-deep sm:text-4xl">
            Contact us
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Our student team is available 24/7 for residents and replies to new enquiries within a
            few hours. The fastest way to reach us is WhatsApp — send us a message and we'll get
            straight back to you.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-3xl border border-border/70 bg-card p-6">
                <h2 className="text-lg font-bold text-brand-deep">
                  {company.legalName}
                </h2>
                <p className="text-xs text-muted-foreground">{company.registration}</p>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand" /> {company.address}
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Phone className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span>
                      {company.phones.join(" · ")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Mail className="mt-0.5 size-4 shrink-0 text-brand" /> {company.email}
                  </li>
                </ul>
                <Button asChild className="mt-5 w-full" size="lg">
                  <a
                    href={whatsappUrl("Hi Brachtia Homes, I have a question about student housing.")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> Chat on WhatsApp
                  </a>
                </Button>
              </div>
              <div className="rounded-2xl bg-brand-soft p-6">
                <h3 className="text-lg font-bold text-brand-deep">
                  Already a resident?
                </h3>
                <p className="mt-2 text-sm text-brand-deep/80">
                  Maintenance and technical requests are answered within 24–48 hours. Message the
                  warden line on WhatsApp any time, day or night.
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-3xl bg-brand-soft p-8 sm:p-12">
              <MessageCircle className="size-10 text-brand-deep" />
              <h2 className="mt-4 text-2xl font-bold text-brand-deep">
                Message us on WhatsApp
              </h2>
              <p className="mt-3 text-sm text-brand-deep/80">
                For room availability, pricing, viewings or anything else — chat with our team on
                WhatsApp and we'll reply within a few hours.
              </p>
              <Button asChild className="mt-6 w-full sm:w-auto" size="lg">
                <a
                  href={whatsappUrl("Hi Brachtia Homes, I have a question about student housing.")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> Chat on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </section>
    </>
  );
}
