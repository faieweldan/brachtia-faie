import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { company, properties, whatsappUrl } from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";

const title = "Book a Viewing | Brachtia Homes Student Accommodation";
const description =
  "Schedule a viewing of our Cyberjaya student residences. Pick a date, tell us what you need and our student team will confirm within 24 hours.";

export const Route = createFileRoute("/book-viewing")({
  validateSearch: (search: Record<string, unknown>): { property?: string } =>
    typeof search["property"] === "string" ? { property: search["property"] } : {},
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: BookViewingPage,
});

function BookViewingPage() {
  const { property } = Route.useSearch();
  const [selected, setSelected] = useState(property ?? properties[0]?.slug ?? "");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
            <CalendarCheck className="size-3.5" /> Free, no obligation
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold text-brand-deep sm:text-4xl">
            Book a viewing
          </h1>
          <p className="mt-3 text-muted-foreground">
            Tell us when you'd like to visit and we'll confirm your slot within 24 hours. Virtual
            viewings over video call are available for students still overseas.
          </p>

          <form
            className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Viewing request sent", {
                description: "Our student team will confirm your slot within 24 hours.",
              });
              (e.target as HTMLFormElement).reset();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
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
                <Input id="phone" name="phone" required placeholder="+60..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Preferred date</Label>
                <Input id="date" name="date" type="date" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="property">Residence</Label>
              <select
                id="property"
                name="property"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {properties.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Anything we should know?</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="Move-in date, room type, budget, university..."
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="lg">
                Request viewing
              </Button>
              <Button asChild type="button" size="lg" variant="outline">
                <a
                  href={whatsappUrl("Hi Brachtia Homes, I'd like to book a viewing.")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> WhatsApp instead
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Prefer to call? {company.phones[0]} · {company.email}
            </p>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
