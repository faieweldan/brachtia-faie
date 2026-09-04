import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { company } from "@/data/properties";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-brand-deep text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9 text-primary-foreground" />
            <span className="text-lg font-bold">Brachtia Homes</span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-primary-foreground/70">
            Off-campus student accommodation and property management in Cyberjaya since 2009.
            Safe, clean, fully furnished homes with 24/7 student support.
          </p>
          <p className="mt-4 text-xs text-primary-foreground/50">
            {company.legalName} · {company.registration}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Explore</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-primary-foreground/70">
            <li><Link to="/properties" className="hover:text-primary-foreground">Properties</Link></li>
            <li><Link to="/about" className="hover:text-primary-foreground">About us</Link></li>
            <li><Link to="/book-viewing" className="hover:text-primary-foreground">Book a viewing</Link></li>
            <li><Link to="/properties" className="hover:text-primary-foreground">Check availability</Link></li>
            <li><Link to="/contact" className="hover:text-primary-foreground">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Get in touch</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-primary-foreground/70">
            {company.phones.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <a href={`tel:${p.replace(/[^+\d]/g, "")}`} className="hover:text-primary-foreground">{p}</a>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" />
              <a href={`mailto:${company.email}`} className="hover:text-primary-foreground">{company.email}</a>
            </li>
            <li className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{company.address}</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-primary-foreground/10 py-5 text-center text-xs text-primary-foreground/50 sm:flex-row sm:justify-center sm:gap-4">
        <span>
          © {new Date().getFullYear()} {company.legalName}. All rights reserved.
        </span>
        <span className="hidden sm:inline">·</span>
        <div className="flex gap-4">
          <Link to="/privacy-policy" className="hover:text-primary-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms-and-conditions" className="hover:text-primary-foreground">
            Terms & Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
}
