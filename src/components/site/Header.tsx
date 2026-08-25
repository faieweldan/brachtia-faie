import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, MessageCircle, ChevronDown } from "lucide-react";
import { company, properties, whatsappUrl } from "@/data/properties";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Logo from "./Logo";

const linkClass =
  "text-sm font-medium text-foreground/75 transition-colors hover:text-brand";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo className="h-9 w-9 text-brand" />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-brand-deep">
              Brachtia Homes
            </span>
            <span className="block text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {company.tagline}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <Link to="/" className={linkClass} activeProps={{ className: "text-brand" }} activeOptions={{ exact: true }}>
            Home
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className={`inline-flex items-center gap-1 outline-none ${linkClass}`}>
              Residences <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-2xl">
              {properties.map((p) => (
                <DropdownMenuItem key={p.slug} asChild className="rounded-xl">
                  <Link to="/properties/$slug" params={{ slug: p.slug }}>
                    <span>
                      <span className="block text-sm font-semibold text-brand-deep">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.location}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/about" className={linkClass} activeProps={{ className: "text-brand" }}>
            About
          </Link>
          <Link to="/contact" className={linkClass} activeProps={{ className: "text-brand" }}>
            Contact
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="outline" size="sm">
            <Link to="/book-viewing">Book a Viewing</Link>
          </Button>
          <Button asChild size="sm">
            <a href={whatsappUrl("Hi Brachtia Homes, I'd like to enquire about student accommodation.")} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
        </div>

        <button
          className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="border-b border-border/60 py-3 text-sm font-medium text-foreground/80"
              activeProps={{ className: "text-brand" }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>

            <div className="border-b border-border/60 py-3">
              <p className="text-sm font-medium text-foreground/80">Residences</p>
              <div className="mt-2 flex flex-col gap-2 pl-3">
                {properties.map((p) => (
                  <Link
                    key={p.slug}
                    to="/properties/$slug"
                    params={{ slug: p.slug }}
                    onClick={() => setOpen(false)}
                    className="text-sm text-muted-foreground"
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>

            <Link
              to="/about"
              onClick={() => setOpen(false)}
              className="border-b border-border/60 py-3 text-sm font-medium text-foreground/80"
              activeProps={{ className: "text-brand" }}
            >
              About
            </Link>
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="border-b border-border/60 py-3 text-sm font-medium text-foreground/80"
              activeProps={{ className: "text-brand" }}
            >
              Contact
            </Link>

            <div className="flex gap-2 py-3">
              <Button asChild variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                <Link to="/book-viewing">Book a Viewing</Link>
              </Button>
              <Button asChild className="flex-1">
                <a href={whatsappUrl("Hi Brachtia Homes, I'd like to enquire about student accommodation.")} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
