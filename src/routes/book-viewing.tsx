import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { company, properties, whatsappUrl } from "@/data/properties";
import { SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";

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
import { STATUS_OPTIONS } from "@/lib/reference-data";
import {
  ENQUIRY_STATUS,
  GENDERS,
  HEARD_ABOUT,
  SHARING_PREFERENCES,
  UNIVERSITIES,
  intakeMonths,
} from "@/data/form-options";
import { z } from "zod";

const leadBase = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(7, "Enter your mobile number").max(30),
  nationality: z.string().trim().min(2, "Select your nationality").max(80),
  gender: z.string().trim().min(1, "Select your gender").max(30),
  enquiryStatus: z.string().trim().min(1, "Let us know").max(40),
  heardAbout: z.string().trim().min(1, "Tell us how you heard about us").max(120),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Only what is on the screen is checked - the same rule the enquiry form
 * follows. Someone working is never shown a university or an intake, so
 * requiring them would fail a form they cannot see to fix, which is the
 * commonest way a conditional field goes wrong and is invisible until somebody
 * picks the other answer.
 */
const leadSchemaFor = (status: string, selfEmployed: boolean) =>
  status === "student"
    ? leadBase.extend({
        university: z.string().trim().min(2, "Select your university").max(160),
        intake: z.string().trim().min(1, "Select your intake").max(40),
      })
    : leadBase.extend({
        university: z.string().trim().max(160).optional(),
        intake: z.string().trim().max(40).optional(),
        // nobody freelancing has an organisation to name, so the tick box
        // excuses it - the job title is still asked, and says more
        company: selfEmployed
          ? z.string().trim().max(120).optional()
          : z.string().trim().min(2, "Where do you work?").max(120),
        occupation: z.string().trim().min(2, "What do you do?").max(120),
      });

type Lead = z.infer<typeof leadBase> & {
  university?: string | undefined;
  intake?: string | undefined;
  company?: string | undefined;
  occupation?: string | undefined;
};

const title = "Book a Viewing | Brachtia Homes Student Accommodation";
const description =
  "Pick a date and time to view our Cyberjaya student residences in person or over a live video tour. Instant slot selection, confirmed within 24 hours.";
const canonical = `${SITE_URL}/book-viewing`;

export const Route = createFileRoute("/book-viewing")({
  validateSearch: (search: Record<string, unknown>): { property?: string } =>
    typeof search["property"] === "string" ? { property: search["property"] } : {},
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
  const [showAvailabilityNudge, setShowAvailabilityNudge] = useState(true);
  const [slugs, setSlugs] = useState<string[]>(() => {
    const first = property ?? properties[0]?.slug ?? "";
    return first ? [first] : [];
  });
  const slug = slugs[0] ?? "";
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
  // studying or working - asked first, because it decides what else is asked
  const [status, setStatus] = useState("");
  /*
   * Where they work. Held here rather than read off the form so that ticking
   * self-employed can empty it - a disabled input still submits whatever was
   * typed before it was disabled. Named employerName because `company` in this
   * file is Brachtia's own details, imported at the top.
   */
  const [employerName, setEmployerName] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [heardChoice, setHeardChoice] = useState("");
  const [heardOther, setHeardOther] = useState("");
  const [enquiryStatus, setEnquiryStatus] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [sharing, setSharing] = useState("");
  const needsStayDetails = enquiryStatus === "viewing_first";

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
              href="https://wa.me/60123306815?text=Hi+I+would+like+to+learn+more+about+Brachtia+Homes+before+choosing+my+residence"
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

      {showAvailabilityNudge ? (
        <div className="mt-6 grid gap-3 rounded-2xl border border-brand/30 bg-brand-tint/50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-deep">
              Checked room availability and pricing yet?
            </p>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              Most students pick a room type first — then we tailor the viewing to the rooms you
              actually want. It only takes a minute.
            </p>
            <p className="mt-1 text-xs text-muted-foreground sm:hidden">
              Pick a room type first and we'll tailor the viewing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="rounded-full">
              <Link to="/properties/$slug" params={{ slug }}>
                Check availability <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={() => setShowAvailabilityNudge(false)}
            >
              I'd rather view first
            </Button>
          </div>
        </div>
      ) : null}


      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: choices */}
        <div className="space-y-6 rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
          <div className="grid grid-cols-2 gap-2">

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
                className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors sm:gap-3 sm:p-4 ${
                  mode === o.value
                    ? "border-brand bg-brand-tint/60"
                    : "border-border hover:border-brand/40"
                }`}
              >
                <o.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-brand-deep">{o.label}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{o.hint}</span>
                </span>

              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Residences you'd like to see</Label>
            <p className="text-xs text-muted-foreground">
              Pick one or more — times shown are for {residence?.name ?? "your first choice"}.
            </p>
            <div className="grid gap-2">
              {properties.map((p) => {
                const checked = slugs.includes(p.slug);
                return (
                  <label
                    key={p.slug}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      checked ? "border-brand bg-brand-tint/50" : "border-border hover:border-brand/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--brand)]"
                      checked={checked}
                      onChange={(e) =>
                        setSlugs((prev) =>
                          e.target.checked
                            ? [...prev, p.slug]
                            : prev.filter((s) => s !== p.slug),
                        )
                      }
                    />
                    <span className="font-medium text-brand-deep">{p.name}</span>
                  </label>
                );
              })}
            </div>
            <FieldError msg={errors['residences']} />
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
        <div className="space-y-6 rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
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
              const parsed = leadSchemaFor(status, selfEmployed).safeParse(raw);
              const next: Record<string, string> = {};
              // asked first, and nothing below it makes sense until it is answered
              if (!status) next["currentStatus"] = "Tell us if you are studying or working";
              if (!parsed.success) {
                for (const issue of parsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              }
              if (slugs.length === 0) next['residences'] = "Pick at least one residence";
              if (needsStayDetails) {
                if (!moveIn) next['moveIn'] = "Select your move-in date";
                if (!moveOut) next['moveOut'] = "Select your move-out date";
                else if (moveIn && moveOut <= moveIn)
                  next['moveOut'] = "Move-out must be after move-in";
                if (!sharing) next['sharingPreference'] = "Pick a room sharing preference";
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
              const lead = parsed.success ? (parsed.data as Lead) : null;
              if (!lead) return;
              setSaving(true);
              try {
                const res = await bookAppointment({
                  data: {
                    mode,
                    residenceSlug: slug,
                    residenceName: residence?.name ?? "",
                    residenceSlugs: slugs,
                    residenceNames: slugs.map(
                      (s) => properties.find((p) => p.slug === s)?.name ?? s,
                    ),
                    moveIn: needsStayDetails ? moveIn : "",
                    moveOut: needsStayDetails ? moveOut : "",
                    sharingPreference: needsStayDetails ? sharing : "",
                    startsAt: slot,
                    fullName: lead.name,
                    email: lead.email,
                    phone: lead.mobile,
                    currentStatus: status,
                    /*
                     * Only the side of the form they were actually shown. A
                     * student who first picked Employed and changed their mind
                     * must not arrive carrying a job title nobody asked them
                     * to confirm.
                     */
                    university: status === "student" ? (lead.university ?? "") : "",
                    intake: status === "student" ? (lead.intake ?? "") : "",
                    company: status === "employed" && !selfEmployed ? (lead.company ?? "") : "",
                    occupation: status === "employed" ? (lead.occupation ?? "") : "",
                    nationality: lead.nationality,
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
              <div className="grid gap-4">
                <div className="space-y-1.5">
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

            {/* Current status - asked before anything that depends on it */}
            <section className="space-y-4">
              <SectionLabel>Current status</SectionLabel>
              <div className="space-y-1.5">
                <Label htmlFor="bv-status">Are you studying or working?</Label>
                <select
                  id="bv-status"
                  className={fieldClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  data-invalid={errors["currentStatus"] ? "true" : undefined}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <FieldError msg={errors["currentStatus"]} />
              </div>
            </section>

            {/* Employment details - only once they have said they are working.
                Asking a student for a job title is how a form gets abandoned. */}
            {status === "employed" ? (
              <section className="space-y-4">
                <SectionLabel>Employment details</SectionLabel>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bv-company">Company / Organisation</Label>
                    <Input
                      id="bv-company"
                      name="company"
                      className="h-11 rounded-xl"
                      maxLength={120}
                      value={employerName}
                      disabled={selfEmployed}
                      placeholder={selfEmployed ? "Not needed" : "Where you work"}
                      onChange={(e) => setEmployerName(e.target.value)}
                      data-invalid={errors["company"] ? "true" : undefined}
                    />
                    {/* somebody freelancing has no organisation to name, and
                        inventing one is worse than saying so */}
                    <label className="mt-1 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-brand"
                        checked={selfEmployed}
                        onChange={(e) => {
                          setSelfEmployed(e.target.checked);
                          if (e.target.checked) setEmployerName("");
                        }}
                      />
                      <span className="text-xs text-muted-foreground">
                        I&apos;m self-employed or freelance
                      </span>
                    </label>
                    <FieldError msg={errors["company"]} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bv-occupation">Occupation / Job Title</Label>
                    <Input
                      id="bv-occupation"
                      name="occupation"
                      className="h-11 rounded-xl"
                      maxLength={120}
                      placeholder="e.g. Software engineer"
                      data-invalid={errors["occupation"] ? "true" : undefined}
                    />
                    <FieldError msg={errors["occupation"]} />
                  </div>
                </div>
              </section>
            ) : null}

            {/* Study details - only for a student */}
            {status === "student" ? (
              <section className="space-y-4">
                <SectionLabel>Study details</SectionLabel>
                <div className="grid gap-4 xl:grid-cols-2">
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
                        <option key={u.value} value={u.value}>
                          {u.label}
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
                </div>
              </section>
            ) : null}

            {/* About you - asked of everybody, so it sits outside both of the
                sections above rather than inside the studying one */}
            <section className="space-y-4">
              <SectionLabel>About you</SectionLabel>
              <div className="grid gap-4 xl:grid-cols-2">
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
                  value={enquiryStatus}
                  onChange={setEnquiryStatus}
                />

                {needsStayDetails ? (
                  <div className="grid gap-4 rounded-2xl border border-brand/25 bg-brand-tint/40 p-4">
                    <p className="text-xs text-muted-foreground">
                      Tell us roughly when you'd move in and the room setup you have in mind, so we
                      show you the right rooms.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="bv-movein">Move-in date</Label>
                        <input
                          id="bv-movein"
                          type="date"
                          className={fieldClass}
                          value={moveIn}
                          onChange={(e) => setMoveIn(e.target.value)}
                          data-invalid={errors['moveIn'] ? "true" : undefined}
                        />
                        <FieldError msg={errors['moveIn']} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bv-moveout">Move-out date</Label>
                        <input
                          id="bv-moveout"
                          type="date"
                          className={fieldClass}
                          value={moveOut}
                          onChange={(e) => setMoveOut(e.target.value)}
                          data-invalid={errors['moveOut'] ? "true" : undefined}
                        />
                        <FieldError msg={errors['moveOut']} />
                      </div>
                    </div>
                    <SelectField
                      id="bv-sharing"
                      name="sharingPreference"
                      label="Room sharing preference"
                      options={SHARING_PREFERENCES}
                      error={errors['sharingPreference']}
                      value={sharing}
                      onChange={setSharing}
                    />
                  </div>
                ) : null}


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
