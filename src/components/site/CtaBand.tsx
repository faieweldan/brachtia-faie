import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";
import { company, whatsappUrl } from "@/data/properties";
import { Button } from "@/components/ui/button";

export default function CtaBand({
  title = "Ready to find your room?",
  description = "Book a viewing, apply online, or message us on WhatsApp — our student team replies fast.",
  message = "Hi Brachtia Homes, I'd like to enquire about student accommodation in Cyberjaya.",
}: {
  title?: string;
  description?: string;
  message?: string;
}) {
  return (
    <section className="bg-brand py-14 text-primary-foreground sm:py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm text-primary-foreground/80">{description}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-primary-foreground/80">
            <Phone className="size-4" /> {company.phones.join(" · ")}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-3 md:w-auto">
          <Button asChild size="lg" variant="secondary" className="flex-1 md:flex-none">
            <Link to="/book-viewing">Book a Viewing</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="flex-1 border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground md:flex-none"
          >
            <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
