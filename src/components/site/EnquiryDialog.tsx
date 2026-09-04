import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  CalendarCheck,
  CheckCircle2,
  Download,
  MessageCircle,
  Pencil,
  ShieldCheck,
} from "lucide-react";

import {
  formatDate,
  formatRM,
  whatsappUrl,
  type ContractTerm,
  type Occupancy,
  type Property,
  type RoomType,
  type StayQuote,
} from "@/data/properties";
import { countryByIso, type Country } from "@/data/countries";
import CountryCombobox from "@/components/site/CountryCombobox";
import { submitEnquiry } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  GENDERS,
  HEARD_ABOUT,
  UNIVERSITIES,
  intakeMonths,
} from "@/data/form-options";
import { fieldClass } from "@/components/site/form-fields";

const staySchema = z.object({
  roomId: z.string().min(1, "Select a room type"),
  occupancy: z.string().min(1, "Select occupancy"),
  moveIn: z.string().min(1, "Select your move-in date"),
  moveOut: z.string().min(1, "Select your move-out date"),
});

const leadSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  university: z.string().trim().min(2, "Select your university").max(120),
  intake: z.string().trim().min(4, "Select your intake").max(20),
  nationality: z.string().trim().min(2, "Select your nationality").max(60),
  gender: z.string().trim().min(1, "Select your gender").max(30),
  heardAbout: z.string().trim().min(1, "Tell us how you heard about us").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(9, "Enter a valid mobile number").max(30),
  message: z.string().trim().max(1000).optional(),
});

export type EnquiryStay = {
  room?: RoomType | undefined;
  occupancy?: Occupancy | undefined;
  term?: ContractTerm | undefined;
  rent?: number | null | undefined;
  moveIn: string;
  moveOut: string;
  quote?: StayQuote | null | undefined;
};

function FieldError({ msg }: { msg?: string | undefined }) {
  if (!msg) return null;
  return <p className="text-xs font-medium text-destructive">{msg}</p>;
}

export default function EnquiryDialog({
  property,
  rooms,
  stay,
  onStayChange,
  trigger,
}: {
  property: Property;
  rooms: RoomType[];
  stay: EnquiryStay;
  onStayChange: (next: {
    roomId?: string;
    occupancy?: Occupancy;
    moveIn?: string;
    moveOut?: string;
  }) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [lead, setLead] = useState<z.infer<typeof leadSchema> | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reference, setReference] = useState("");
  const [dialIso, setDialIso] = useState("MY");
  const [mobileNumber, setMobileNumber] = useState("");
  const [nationalityIso, setNationalityIso] = useState<string | undefined>(undefined);
  const [editStay, setEditStay] = useState(false);
  const [universityChoice, setUniversityChoice] = useState("");
  const [universityOther, setUniversityOther] = useState("");
  const [heardChoice, setHeardChoice] = useState("");
  const [heardOther, setHeardOther] = useState("");

  const room = stay.room;
  const occupancies = room?.occupancies ?? [];
  const occupancy = stay.occupancy;
  const quote = stay.quote ?? null;

  const dial = countryByIso(dialIso)?.dial ?? "+60";
  const mobileCombined = mobileNumber ? `${dial} ${mobileNumber}`.trim() : "";
  const nationality = nationalityIso ? (countryByIso(nationalityIso)?.name ?? "") : "";

  const stayComplete = Boolean(room && occupancy && stay.moveIn && stay.moveOut);
  const showStayFields = editStay || !stayComplete;

  const universities = UNIVERSITIES;
  const intakes = useMemo(() => intakeMonths(), []);
  const universityValue =
    universityChoice === "Other" ? universityOther.trim() : universityChoice;
  const heardValue = heardChoice === "Other" ? (heardOther.trim() || "Other") : heardChoice;

  const summaryMessage = `Hi Brachtia Homes, I'd like to check availability at ${property.name}${
    room ? ` — ${room.name}` : ""
  }${occupancy ? ` (${occupancy === "single" ? "single" : "twin sharing"})` : ""}${
    stay.moveIn && stay.moveOut ? `, ${stay.moveIn} to ${stay.moveOut}` : ""
  }.`;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setErrors({});
      setSubmitted(false);
      setReference("");
      setEditStay(false);
      setDialIso("MY");
      setMobileNumber("");
      setNationalityIso(undefined);
      setUniversityChoice("");
      setUniversityOther("");
      setHeardChoice("");
      setHeardOther("");
    }
  }

  async function downloadQuote() {
    if (!quote || !room || !occupancy || !lead) return;
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      await downloadStayQuote({
        property,
        room,
        occupancy,
        term: stay.term ?? "long",
        moveIn: stay.moveIn,
        moveOut: stay.moveOut,
        quote,
        ...(reference ? { reference } : {}),
        lead: {
          name: lead.name,
          university: lead.university,
          intake: lead.intake,
          nationality: lead.nationality,
          gender: lead.gender,
          email: lead.email,
          mobile: lead.mobile,
        },
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {submitted ? (
          <div className="p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-tint">
              <CheckCircle2 className="size-7 text-brand" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-brand-deep">Enquiry sent</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              We'll confirm availability for {room ? room.name : "your room"} at {property.name}{" "}
              within 24 hours by email or WhatsApp.
            </p>
            {reference ? (
              <p className="mx-auto mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold tracking-wide text-foreground">
                Reference {reference}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {quote && (
                <Button size="lg" className="flex-1" onClick={downloadQuote} disabled={downloading}>
                  <Download className="size-4" />
                  {downloading ? "Preparing…" : "Download quotation (PDF)"}
                </Button>
              )}
              <Button asChild variant="outline" size="lg" className="flex-1">
                <a href="https://wa.me/60123306815?text=Hi+I+would+like+to+learn+more+about+Brachtia+Homes+before+choosing+my+residence" target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp us
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex max-h-[92vh] flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
              const next: Record<string, string> = {};

              const stayParsed = staySchema.safeParse(raw);
              if (!stayParsed.success) {
                for (const issue of stayParsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              } else if (stayParsed.data.moveOut <= stayParsed.data.moveIn) {
                next['moveOut'] = "Move-out must be after move-in";
              }

              const leadParsed = leadSchema.safeParse(raw);
              if (!leadParsed.success) {
                for (const issue of leadParsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              }

              if (Object.keys(next).length > 0) {
                setErrors(next);
                if (next['roomId'] || next['occupancy'] || next['moveIn'] || next['moveOut']) {
                  setEditStay(true);
                }
                const form = e.currentTarget;
                requestAnimationFrame(() => {
                  const first = form.querySelector<HTMLElement>("[data-invalid='true']");
                  first?.scrollIntoView({ behavior: "smooth", block: "center" });
                  first?.focus?.();
                });
                return;
              }

              setErrors({});
              const leadData = leadParsed.success ? leadParsed.data : null;
              setLead(leadData);
              setSubmitted(true);
              toast.success("Enquiry sent", {
                description: "We'll confirm availability within 24 hours.",
              });
              if (leadData) {
                void submitEnquiry({
                  data: {
                    residenceSlug: property.slug,
                    residenceName: property.name,
                    roomCode: room?.id ?? raw['roomId'] ?? "",
                    roomName: room?.name ?? "",
                    occupancy: occupancy ?? raw['occupancy'] ?? "single",
                    moveIn: stay.moveIn,
                    moveOut: stay.moveOut,
                    term: stay.term ?? "long",
                    monthlyRent: quote?.monthlyAfter ?? 0,
                    firstPayment: quote?.totalUpfront ?? 0,
                    fullName: leadData.name,
                    email: leadData.email,
                    phone: leadData.mobile,
                    nationality: leadData.nationality,
                    university: leadData.university,
                    intake: leadData.intake,
                    gender: leadData.gender,
                    heardAbout: heardChoice,
                    heardAboutOther: heardChoice === "Other" ? heardOther.trim() : "",
                    message: leadData.message ?? "",
                    quoteSnapshot: {
                      property,
                      room,
                      occupancy: occupancy ?? raw['occupancy'] ?? "single",
                      term: stay.term ?? "long",
                      moveIn: stay.moveIn,
                      moveOut: stay.moveOut,
                      quote,
                      lead: {
                        name: leadData.name,
                        university: leadData.university,
                        intake: leadData.intake,
                        nationality: leadData.nationality,
                        gender: leadData.gender,
                        email: leadData.email,
                        mobile: leadData.mobile,
                      },
                    },
                  },
                })
                  .then((res) => {
                    if (res?.ok && res.reference) setReference(res.reference);
                  })
                  .catch((err: unknown) => console.error(err));
              }

            }}
          >
            <DialogHeader className="border-b px-6 py-5 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                <CalendarCheck className="size-5 text-brand" /> Check availability
              </DialogTitle>
              <DialogDescription>
                Takes about 2 minutes. We reply within 24 hours with availability and your
                quotation.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              {/* Your stay */}
              <section className="rounded-2xl border border-brand/15 bg-brand-tint/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
                    Your stay · {property.name}
                  </p>
                  {stayComplete && (
                    <button
                      type="button"
                      onClick={() => setEditStay((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
                    >
                      <Pencil className="size-3" />
                      {editStay ? "Done" : "Edit"}
                    </button>
                  )}
                </div>

                {!showStayFields ? (
                  <div className="mt-3 space-y-2">
                    <input type="hidden" name="roomId" value={room?.id ?? ""} />
                    <input type="hidden" name="occupancy" value={occupancy ?? ""} />
                    <input type="hidden" name="moveIn" value={stay.moveIn} />
                    <input type="hidden" name="moveOut" value={stay.moveOut} />

                    <p className="text-sm font-bold text-brand-deep">
                      {room?.name} ·{" "}
                      {occupancy === "single" ? "Single occupancy" : "Twin sharing"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(stay.moveIn)} — {formatDate(stay.moveOut)}
                    </p>
                    {quote && (
                      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-card px-3.5 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          {stay.term === "short" ? "Short-term rate" : "12-month rate"} ·{" "}
                          {formatRM(quote.monthlyAfter)}/month
                        </span>
                        <span className="text-sm font-extrabold tabular-nums text-brand-deep">
                          {formatRM(quote.totalUpfront)} first payment
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="en-room">Room type</Label>
                      <select
                        id="en-room"
                        name="roomId"
                        className={fieldClass}
                        data-invalid={errors['roomId'] ? "true" : undefined}
                        value={room?.id ?? ""}
                        onChange={(e) => onStayChange({ roomId: e.target.value })}
                      >
                        <option value="" disabled>
                          Select a room
                        </option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <FieldError msg={errors['roomId']} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-occ">Occupancy</Label>
                      <select
                        id="en-occ"
                        name="occupancy"
                        className={fieldClass}
                        data-invalid={errors['occupancy'] ? "true" : undefined}
                        value={occupancy ?? ""}
                        disabled={!room}
                        onChange={(e) => onStayChange({ occupancy: e.target.value as Occupancy })}
                      >
                        <option value="" disabled>
                          Select occupancy
                        </option>
                        {occupancies.map((o) => (
                          <option key={o} value={o}>
                            {o === "single" ? "Single" : "Twin sharing"}
                          </option>
                        ))}
                      </select>
                      <FieldError msg={errors['occupancy']} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-movein">Move-in date</Label>
                      <Input
                        id="en-movein"
                        name="moveIn"
                        type="date"
                        className="h-11 rounded-xl"
                        data-invalid={errors['moveIn'] ? "true" : undefined}
                        value={stay.moveIn}
                        onChange={(e) => onStayChange({ moveIn: e.target.value })}
                      />
                      <FieldError msg={errors['moveIn']} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-moveout">Move-out date</Label>
                      <Input
                        id="en-moveout"
                        name="moveOut"
                        type="date"
                        className="h-11 rounded-xl"
                        data-invalid={errors['moveOut'] ? "true" : undefined}
                        value={stay.moveOut}
                        onChange={(e) => onStayChange({ moveOut: e.target.value })}
                      />
                      <FieldError msg={errors['moveOut']} />
                    </div>
                  </div>
                )}
              </section>

              {/* Contact details */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Your details
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="en-name">Full name</Label>
                    <Input
                      id="en-name"
                      name="name"
                      placeholder="Aisha Rahman"
                      maxLength={100}
                      className="h-11 rounded-xl"
                      data-invalid={errors['name'] ? "true" : undefined}
                    />
                    <FieldError msg={errors['name']} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-email">Email</Label>
                    <Input
                      id="en-email"
                      name="email"
                      type="email"
                      placeholder="you@email.com"
                      maxLength={255}
                      className="h-11 rounded-xl"
                      data-invalid={errors['email'] ? "true" : undefined}
                    />
                    <FieldError msg={errors['email']} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-mobile-number">Mobile / WhatsApp</Label>
                    <div
                      className={`flex h-11 items-stretch overflow-hidden rounded-xl border ${
                        errors['mobile'] ? "border-destructive" : "border-input"
                      } bg-background focus-within:ring-2 focus-within:ring-brand/40`}
                    >
                      <CountryCombobox
                        value={dialIso}
                        variant="dial"
                        ariaLabel="Country calling code"
                        onChange={(c: Country) => setDialIso(c.iso)}
                        className="h-full w-[7.25rem] shrink-0 rounded-none border-0 border-r border-input bg-muted/40 px-2.5 focus:ring-0"
                      />
                      <input
                        id="en-mobile-number"
                        type="tel"
                        inputMode="numeric"
                        placeholder="12 345 6789"
                        maxLength={20}
                        className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                        data-invalid={errors['mobile'] ? "true" : undefined}
                        value={mobileNumber}
                        onChange={(e) =>
                          setMobileNumber(e.target.value.replace(/[^\d\s]/g, "").trimStart())
                        }
                      />
                      <input type="hidden" name="mobile" value={mobileCombined} />
                    </div>
                    <FieldError msg={errors['mobile']} />
                  </div>
                </div>
              </section>

              {/* Study details */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Study details
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="en-uni">University</Label>
                    <select
                      id="en-uni"
                      className={fieldClass}
                      value={universityChoice}
                      onChange={(e) => setUniversityChoice(e.target.value)}
                      data-invalid={errors['university'] ? "true" : undefined}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {universities.map((u) => (
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

                  <div className="space-y-1.5">
                    <Label htmlFor="en-intake">Intake</Label>
                    <select
                      id="en-intake"
                      name="intake"
                      className={fieldClass}
                      defaultValue=""
                      data-invalid={errors['intake'] ? "true" : undefined}
                    >
                      <option value="" disabled>
                        Select month & year
                      </option>
                      {intakes.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <FieldError msg={errors['intake']} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-nat">Nationality</Label>
                    <CountryCombobox
                      id="en-nat"
                      value={nationalityIso}
                      placeholder="Search your country"
                      onChange={(c: Country) => setNationalityIso(c.iso)}
                      className="w-full"
                      invalid={Boolean(errors['nationality'])}
                    />
                    <input type="hidden" name="nationality" value={nationality} />
                    <FieldError msg={errors['nationality']} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-gender">Gender</Label>
                    <select
                      id="en-gender"
                      name="gender"
                      className={fieldClass}
                      defaultValue=""
                      data-invalid={errors['gender'] ? "true" : undefined}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <FieldError msg={errors['gender']} />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="en-heard">How did you hear about us?</Label>
                    <select
                      id="en-heard"
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

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="en-message">Anything else? (optional)</Label>
                    <Textarea
                      id="en-message"
                      name="message"
                      rows={3}
                      maxLength={1000}
                      className="rounded-xl"
                      placeholder="Preferences, questions or special requests."
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="border-t bg-card px-6 py-4">
              <Button type="submit" size="lg" className="w-full">
                Submit enquiry
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-brand" />
                Free to enquire — no payment yet. Quotation available right after you submit.
              </p>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
