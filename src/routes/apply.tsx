import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileCheck2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { company, properties, roomTypes, whatsappUrl } from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const title = "Apply for a Room | Brachtia Homes Cyberjaya";
const description =
  "Apply online for a student room in Cyberjaya. Share your details, preferred room and move-in date and our team will send the tenancy pack.";

const steps = [
  "Submit this application with your preferred room and move-in date.",
  "We confirm availability and send your tenancy agreement and payment summary.",
  "Pay the booking fee to secure the room, then settle the upfront costs before move-in.",
  "Collect your access card and keys on arrival — warden support is available 24/7.",
];

export const Route = createFileRoute("/apply")({
  validateSearch: (search: Record<string, unknown>): { property?: string; room?: string } => ({
    ...(typeof search["property"] === "string" ? { property: search["property"] } : {}),
    ...(typeof search["room"] === "string" ? { room: search["room"] } : {}),
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const search = Route.useSearch();
  const [propertySlug, setPropertySlug] = useState(search.property ?? properties[0]?.slug ?? "");
  const [roomId, setRoomId] = useState(search.room ?? "");
  const roomOptions = roomTypes.filter(
    (r) => r.propertySlug === propertySlug && r.status !== "occupied",
  );

  return (
    <>
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
            <FileCheck2 className="size-3.5" /> Takes about 3 minutes
          </span>
          <h1 className="mt-4 text-3xl font-bold text-brand-deep sm:text-4xl">
            Apply for a room
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Send us your details and we'll reserve your room while the paperwork is prepared. A
            booking fee of {company.bookingFee} secures the room and is offset against your first
            payment.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <form
              className="space-y-5 rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                toast.success("Application received", {
                  description: "We'll email your tenancy pack shortly.",
                });
                (e.target as HTMLFormElement).reset();
              }}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" name="name" required placeholder="As per passport / IC" />
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
                  <Label htmlFor="university">University / college</Label>
                  <Input id="university" name="university" placeholder="e.g. MMU Cyberjaya" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="property">Residence</Label>
                  <select
                    id="property"
                    name="property"
                    value={propertySlug}
                    onChange={(e) => {
                      setPropertySlug(e.target.value);
                      setRoomId("");
                    }}
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
                  <Label htmlFor="room">Preferred room type</Label>
                  <select
                    id="room"
                    name="room"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">No preference</option>
                    {roomOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.unitType}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moveIn">Move-in date</Label>
                  <Input id="moveIn" name="moveIn" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="term">Stay length</Label>
                  <select
                    id="term"
                    name="term"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="long">12 months</option>
                    <option value="short">Short-term (under 6 months)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={4} placeholder="Anything else we should know?" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg">
                  Submit application
                </Button>
                <Button asChild type="button" size="lg" variant="outline">
                  <a
                    href={whatsappUrl("Hi Brachtia Homes, I'd like to apply for a room.")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> Apply via WhatsApp
                  </a>
                </Button>
              </div>
            </form>

            <aside className="rounded-3xl border border-border/70 bg-card p-6">
              <h2 className="text-lg font-bold text-brand-deep">How it works</h2>
              <ol className="mt-4 space-y-4">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-deep">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>
    </>
  );
}
