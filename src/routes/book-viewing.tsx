import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { company, properties, whatsappUrl } from "@/data/properties";
import { fetchDaySlots, bookAppointment } from "@/lib/public.functions";
import { formatSlot } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import CountryCombobox from "@/components/site/CountryCombobox";
import {
  FieldError,
  PhoneField,
  SectionLabel,
  SelectField,
  fieldClass,
} from "@/components/site/form-fields";
import { countryByIso, type Country } from "@/data/countries";
import {
  ENQUIRY_STATUS,
  GENDERS,
  HEARD_ABOUT,
  UNIVERSITIES,
  intakeMonths,
} from "@/data/form-options";
import { z } from "zod";

const leadSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(7, "Enter your mobile number").max(30),
  university: z.string().trim().min(2, "Select your university").max(160),
  intake: z.string().trim().min(1, "Select your intake").max(40),
  nationality: z.string().trim().min(2, "Select your nationality").max(80),
  gender: z.string().trim().min(1, "Select your gender").max(30),
  enquiryStatus: z.string().trim().min(1, "Let us know").max(40),
  heardAbout: z.string().trim().min(1, "Tell us how you heard about us").max(120),
  notes: z.string().trim().max(1000).optional(),
});

const title = "Book a Viewing | Brachtia Homes Student Accommodation";
const description =
  "Pick a date and time to view our Cyberjaya student residences in person or over a live video tour. Instant slot selection, confirmed within 24 hours.";

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

type Mode = "in_person" | "virtual";

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function BookViewingPage() {
  const { property } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("in_person");
  const [slug, setSlug] = useState(property ?? properties[0]?.slug ?? "");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ slot: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dialIso, setDialIso] = useState("MY");
  const [mobileNumber, setMobileNumber] = useState("");
  const [nationalityIso, setNationalityIso] = useState<string | undefined>(undefined);
  const [universityChoice, setUniversityChoice] = useState("");
  const [universityOther, setUniversityOther] = useState("");
  const [heardChoice, setHeardChoice] = useState("");
  const [heardOther, setHeardOther] = useState("");

  const intakes = useMemo(() => intakeMonths(), []);
  const nationality = nationalityIso ? (countryByIso(nationalityIso)?.name ?? "") : "";
  const universityValue =
    universityChoice === "Other" ? universityOther.trim() : universityChoice;
  const heardValue = heardChoice === "Other" ? heardOther.trim() || "Other" : heardChoice;

  const residence = properties.find((p) => p.slug === slug);
  const isoDate = date ? toISODate(date) : "";

  useEffect(() => setSlot(null), [isoDate, mode, slug]);

  const slotsQuery = useQuery({
    queryKey: ["slots", slug, mode, isoDate],
    enabled: Boolean(isoDate),
    queryFn: () => fetchDaySlots({ data: { residenceSlug: slug, mode, date: isoDate } }),
  });

  const slots = slotsQuery.data?.slots ?? [];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  if (done) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft">
          <CheckCircle2 className="size-7 text-brand" />
        </div>
        <h1 className="mt-5 text-3xl font-extrabold text-brand-deep">Viewing requested</h1>
        <p className="mt-3 text-muted-foreground">
          {mode === "virtual" ? "Video tour" : "Viewing"} on{" "}
          <strong className="text-foreground">
            {new Date(done.slot).toLocaleDateString("en-MY", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </strong>{" "}
          at <strong className="text-foreground">{formatSlot(done.slot)}</strong>. We'll confirm by
          email and WhatsApp within 24 hours.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline" size="lg" className="rounded-full">
            <a
              href={whatsappUrl("Hi Brachtia Homes, I just requested a viewing.")}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-4" /> WhatsApp us
            </a>
          </Button>
          <Button size="lg" className="rounded-full" onClick={() => setDone(null)}>
            Book another slot
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
        <CalendarCheck className="size-3.5" /> Free, no obligation
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
        Book a viewing
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Choose a residence, pick a time that suits you, and we'll confirm within 24 hours. Overseas?
        Take a live video tour instead.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: choices */}
        <div className="space-y-6 rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "in_person", label: "In person", icon: MapPin, hint: "At the residence" },
                { value: "virtual", label: "Virtual tour", icon: Video, hint: "Live video call" },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  mode === o.value
                    ? "border-brand bg-brand-tint/60"
                    : "border-border hover:border-brand/40"
                }`}
              >
                <o.icon className="mt-0.5 size-5 text-brand" />
                <span>
                  <span className="block text-sm font-semibold text-brand-deep">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="residence">Residence</Label>
            <select
              id="residence"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              {properties.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Pick a date</Label>
            <div className="rounded-2xl border border-border p-2">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={{ before: today }}
                className="mx-auto"
              />
            </div>
          </div>
        </div>

        {/* Right: slots + details */}
        <div className="space-y-6 rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Available times
            </h2>
            {!isoDate ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Select a date to see available times.
              </p>
            ) : slotsQuery.isLoading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading times…
              </p>
            ) : slots.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No slots left on this date. Try another day or message us on WhatsApp.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
                      slot === s
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-border text-foreground hover:border-brand/50"
                    }`}
                  >
                    {formatSlot(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="space-y-6 border-t border-border pt-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
              const parsed = leadSchema.safeParse(raw);
              const next: Record<string, string> = {};
              if (!parsed.success) {
                for (const issue of parsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              }
              if (Object.keys(next).length > 0) {
                setErrors(next);
                requestAnimationFrame(() => {
                  const first = form.querySelector<HTMLElement>("[data-invalid='true']");
                  first?.scrollIntoView({ behavior: "smooth", block: "center" });
                  first?.focus?.();
                });
                return;
              }
              setErrors({});
              if (!slot) {
                toast.error("Pick a date and time first");
                return;
              }
              const lead = parsed.success ? parsed.data : null;
              if (!lead) return;
              setSaving(true);
              try {
                const res = await bookAppointment({
                  data: {
                    mode,
                    residenceSlug: slug,
                    residenceName: residence?.name ?? "",
                    startsAt: slot,
                    fullName: lead.name,
                    email: lead.email,
                    phone: lead.mobile,
                    university: lead.university,
                    nationality: lead.nationality,
                    intake: lead.intake,
                    gender: lead.gender,
                    heardAbout: heardChoice,
                    heardAboutOther: heardChoice === "Other" ? heardOther.trim() : "",
                    enquiryStatus: lead.enquiryStatus,
                    notes: lead.notes ?? "",
                  },
                });
                if (!res.ok) throw new Error("failed");
                setDone({ slot });
              } catch {
                toast.error("Couldn't book that slot", {
                  description: "Please try another time or message us on WhatsApp.",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {/* Your details */}
            <section className="space-y-4">
              <SectionLabel>Your details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bv-name">Full name</Label>
                  <Input
                    id="bv-name"
                    name="name"
                    placeholder="Aisha Rahman"
                    maxLength={100}
                    className="h-11 rounded-xl"
                    data-invalid={errors['name'] ? "true" : undefined}
                  />
                  <FieldError msg={errors['name']} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bv-email">Email</Label>
                  <Input
                    id="bv-email"
                    name="email"
                    type="email"
                    placeholder="you@email.com"
                    maxLength={255}
                    className="h-11 rounded-xl"
                    data-invalid={errors['email'] ? "true" : undefined}
                  />
                  <FieldError msg={errors['email']} />
                </div>

                <PhoneField
                  id="bv-mobile"
                  dialIso={dialIso}
                  onDialChange={setDialIso}
                  number={mobileNumber}
                  onNumberChange={setMobileNumber}
                  error={errors['mobile']}
                />
              </div>
            </section>

            {/* Study details */}
            <section className="space-y-4">
              <SectionLabel>Study details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bv-uni">University</Label>
                  <select
                    id="bv-uni"
                    className={fieldClass}
                    value={universityChoice}
                    onChange={(e) => setUniversityChoice(e.target.value)}
                    data-invalid={errors['university'] ? "true" : undefined}
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {UNIVERSITIES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {universityChoice === "Other" && (
                    <Input
                      className="mt-2 h-11 rounded-xl"
                      placeholder="Your university"
                      maxLength={120}
                      value={universityOther}
                      onChange={(e) => setUniversityOther(e.target.value)}
                    />
                  )}
                  <input type="hidden" name="university" value={universityValue} />
                  <FieldError msg={errors['university']} />
                </div>

                <SelectField
                  id="bv-intake"
                  name="intake"
                  label="Intake"
                  placeholder="Select month & year"
                  options={intakes}
                  error={errors['intake']}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="bv-nat">Nationality</Label>
                  <CountryCombobox
                    id="bv-nat"
                    value={nationalityIso}
                    placeholder="Search your country"
                    onChange={(c: Country) => setNationalityIso(c.iso)}
                    className="w-full"
                    invalid={Boolean(errors['nationality'])}
                  />
                  <input type="hidden" name="nationality" value={nationality} />
                  <FieldError msg={errors['nationality']} />
                </div>

                <SelectField
                  id="bv-gender"
                  name="gender"
                  label="Gender"
                  options={GENDERS}
                  error={errors['gender']}
                />
              </div>
            </section>

            {/* Viewing details */}
            <section className="space-y-4">
              <SectionLabel>Viewing details</SectionLabel>
              <div className="grid gap-4">
                <SelectField
                  id="bv-status"
                  name="enquiryStatus"
                  label="Have you already submitted an availability enquiry?"
                  options={ENQUIRY_STATUS}
                  error={errors['enquiryStatus']}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="bv-heard">How did you hear about us?</Label>
                  <select
                    id="bv-heard"
                    className={fieldClass}
                    value={heardChoice}
                    onChange={(e) => setHeardChoice(e.target.value)}
                    data-invalid={errors['heardAbout'] ? "true" : undefined}
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    {HEARD_ABOUT.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {heardChoice === "Other" && (
                    <Input
                      className="mt-2 h-11 rounded-xl"
                      placeholder="Tell us more"
                      maxLength={120}
                      value={heardOther}
                      onChange={(e) => setHeardOther(e.target.value)}
                    />
                  )}
                  <input type="hidden" name="heardAbout" value={heardValue} />
                  <FieldError msg={errors['heardAbout']} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bv-notes">Anything we should know? (optional)</Label>
                  <Textarea
                    id="bv-notes"
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    className="rounded-xl"
                    placeholder="Room type, budget, move-in date..."
                  />
                </div>
              </div>
            </section>

            <Button type="submit" size="lg" className="w-full rounded-full" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {slot ? `Request ${formatSlot(slot)} slot` : "Request viewing"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Prefer to call? {company.phones[0]} · {company.email}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
