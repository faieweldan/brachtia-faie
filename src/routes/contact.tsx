import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { company, whatsappUrl } from "@/data/properties";
import { SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
            few hours.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <form
              className="space-y-5 rounded-3xl border border-border/70 bg-card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                toast.success("Message sent", { description: "We'll get back to you shortly." });
                (e.target as HTMLFormElement).reset();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@email.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone / WhatsApp</Label>
                <Input id="phone" name="phone" placeholder="+60..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" name="message" rows={5} required placeholder="How can we help?" />
              </div>
              <Button type="submit" size="lg" className="w-full sm:w-auto">
                Send message
              </Button>
            </form>

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
                      <span className="block">Office {company.office}</span>
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
          </div>
        </section>
    </>
  );
}
