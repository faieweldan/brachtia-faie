import { Link } from "@tanstack/react-router";
import { Clock, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/data/properties";
import { Button } from "@/components/ui/button";

export default function CtaBand({
  title = "Ready to find your room?",
  description = "Book a viewing or message us on WhatsApp — our student team replies fast.",
  message = "Hi Brachtia Homes, I'd like to enquire about student accommodation in Cyberjaya.",
}: {
  title?: string;
  description?: string;
  message?: string;
}) {
  return (
    <section className="bg-brand-tint px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-brand-deep px-6 py-10 text-primary-foreground shadow-lift sm:px-12 sm:py-14">
          {/* soft depth */}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-foreground/60">
                Next step
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                {title}
              </h2>
              <p className="mt-3 max-w-lg text-base text-primary-foreground/75">{description}</p>

            </div>

            <div className="flex flex-col gap-3">
              <Button
                asChild
                size="lg"
                className="h-13 w-full rounded-full bg-primary-foreground text-base font-bold text-brand-deep hover:bg-primary-foreground/90"
              >
                <Link to="/book-viewing">Book a Viewing</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 w-full rounded-full border-2 border-primary-foreground/35 bg-transparent text-base font-bold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
              <p className="inline-flex items-center justify-center gap-2 text-xs text-primary-foreground/65">
                <Clock className="size-3.5" /> Replies within 24 hours
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
