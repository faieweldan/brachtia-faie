import { useMemo, useRef, useState, type ReactNode } from "react";
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
  type PaymentTerm,
  type Property,
  type RoomType,
  type StayQuote,
} from "@/data/properties";
import { countryByIso, type Country } from "@/data/countries";
import CountryCombobox from "@/components/site/CountryCombobox";
import { checkEnquiryDuplicate, submitEnquiry, type EnquiryInput } from "@/lib/public.functions";
import { STATUS_OPTIONS } from "@/lib/reference-data";
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

import { GENDERS, HEARD_ABOUT, UNIVERSITIES, intakeMonths } from "@/data/form-options";
import { fieldClass } from "@/components/site/form-fields";

const staySchema = z.object({
  roomId: z.string().min(1, "Select a room type"),
  occupancy: z.string().min(1, "Select occupancy"),
  moveIn: z.string().min(1, "Select your move-in date"),
  moveOut: z.string().min(1, "Select your move-out date"),
});

const leadBase = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  nationality: z.string().trim().min(2, "Select your nationality").max(60),
  gender: z.string().trim().min(1, "Select your gender").max(30),
  heardAbout: z.string().trim().min(1, "Tell us how you heard about us").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(9, "Enter a valid mobile number").max(30),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Only what is on the screen is checked.
 *
 * Someone working is never shown a university or an intake, so requiring them
 * would fail a form they cannot see to fix - the commonest way a conditional
 * field goes wrong, and invisible until somebody picks the other answer.
 */
const leadSchemaFor = (status: string, selfEmployed: boolean) =>
  status === "student"
    ? leadBase.extend({
        university: z.string().trim().min(2, "Select your university").max(120),
        intake: z.string().trim().min(4, "Select your intake").max(20),
      })
    : leadBase.extend({
        university: z.string().trim().max(120).optional(),
        intake: z.string().trim().max(40).optional(),
        // nobody freelancing has an organisation to name, so the tick box excuses
        // it - the job title is still asked, and says more than a blank company
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

export type EnquiryStay = {
  room?: RoomType | undefined;
  occupancy?: Occupancy | undefined;
  term?: ContractTerm | undefined;
  rent?: number | null | undefined;
  moveIn: string;
  moveOut: string;
  quote?: StayQuote | null | undefined;
  paymentTerm?: PaymentTerm | undefined;
  /** the add-ons chosen, by name */
  addons?: string[] | undefined;
};

/**
 * The mark on a field that has to be answered. Read out to screen readers as
 * "required", so the star is not the only thing that says so.
 */
function Req() {
  return (
    <span className="ml-0.5 text-destructive">
      <span aria-hidden>*</span>
      <span className="sr-only"> (required)</span>
    </span>
  );
}

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
  const [lead, setLead] = useState<Lead | null>(null);
  // studying or working - asked first, because it decides what else is asked
  const [status, setStatus] = useState("");
  /*
   * Where they work. `company` is held here rather than read off the form so
   * that ticking self-employed can empty it - a disabled input still submits
   * whatever was typed before it was disabled.
   */
  const [company, setCompany] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  /*
   * A repeat is warned about, never blocked. The notice is what the student is
   * shown; the payload beside it is the submission they already filled in, held
   * so that "Send it anyway" does not make them fill it in again.
   */
  const [dupNotice, setDupNotice] = useState("");
  const [pending, setPending] = useState<EnquiryInput | null>(null);
  const [sending, setSending] = useState(false);
  /*
   * One key for one submission, kept across a warning and a retry. The unique
   * index on it in the database is what actually stops a double-click becoming
   * two enquiries - a disabled button cannot stop a request that was already
   * sent, or a tab that was refreshed mid-flight.
   */
  const submissionKey = useRef("");
  // the quote exactly as it was saved with the enquiry, for the student's copy
  const savedSnapshot = useRef<Record<string, unknown> | null>(null);
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
  const universityValue = universityChoice === "Other" ? universityOther.trim() : universityChoice;
  const heardValue = heardChoice === "Other" ? heardOther.trim() || "Other" : heardChoice;

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
      setStatus("");
      setCompany("");
      setSelfEmployed(false);
      setDupNotice("");
      setPending(null);
      setSending(false);
      // a fresh dialog is a fresh submission, so it gets its own key
      submissionKey.current = "";
    }
  }

  /**
   * Send it. Split out of the form handler so that "Send it anyway" can post
   * the very same payload after the warning, rather than validating and
   * rebuilding it a second time and risking the two drifting apart.
   */
  async function send(payload: EnquiryInput) {
    setSending(true);
    try {
      const res = await submitEnquiry({ data: payload });
      // only tell the student it is sent once it really is
      if (!res?.ok) {
        toast.error("Could not send your enquiry", {
          description: "Please try again, or WhatsApp us.",
        });
        return;
      }
      if (res.reference) setReference(res.reference);
      setDupNotice("");
      setPending(null);
      setSubmitted(true);
      toast.success("Enquiry sent", {
        description: "We'll confirm availability within 24 hours.",
      });
    } catch (err: unknown) {
      console.error(err);
      toast.error("Could not send your enquiry", {
        description: err instanceof Error ? err.message : "Please try again, or WhatsApp us.",
      });
    } finally {
      setSending(false);
    }
  }

  async function downloadQuote() {
    const snapshot = savedSnapshot.current;
    if (!snapshot) return;
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      const { quoteSnapshotFor } = await import("@/lib/booking-quote");
      // the same reader admin's copy is built with, from the snapshot that was
      // saved - so the student's paper and staff's are one document
      await downloadStayQuote({
        ...(quoteSnapshotFor({ quote_snapshot: snapshot }) as any),
        ...(reference ? { reference } : {}),
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
                <a
                  href="https://wa.me/60123306815?text=Hi+I+would+like+to+learn+more+about+Brachtia+Homes+before+choosing+my+residence"
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> WhatsApp us
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex max-h-[92vh] flex-col"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
              const next: Record<string, string> = {};

              const stayParsed = staySchema.safeParse(raw);
              if (!stayParsed.success) {
                for (const issue of stayParsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              } else if (stayParsed.data.moveOut <= stayParsed.data.moveIn) {
                next["moveOut"] = "Move-out must be after move-in";
              }

              // what is asked depends on the answer above, so the rules do too
              if (!status) next["currentStatus"] = "Tell us if you are studying or working";

              const leadParsed = leadSchemaFor(status, selfEmployed).safeParse(raw);
              if (!leadParsed.success) {
                for (const issue of leadParsed.error.issues)
                  next[String(issue.path[0])] = issue.message;
              }

              if (Object.keys(next).length > 0) {
                setErrors(next);
                if (next["roomId"] || next["occupancy"] || next["moveIn"] || next["moveOut"]) {
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
              // typed as Lead, not left to inference: the schema is a union of a
              // student's and a worker's, so the fields only one of them carries
              // are optional here rather than absent from half the union
              const leadData: Lead | null = leadParsed.success ? leadParsed.data : null;
              setLead(leadData);
              if (leadData) {
                // one key for this submission, made once and kept through a
                // warning and any retry
                if (!submissionKey.current) {
                  submissionKey.current =
                    globalThis.crypto?.randomUUID?.() ??
                    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                }
                // nothing stale: someone working sends no university and no
                // intake, whatever a hidden field held before they switched
                const studying = status === "student";
                const uni = studying ? (leadData.university ?? "") : "";
                const intake = studying ? (leadData.intake ?? "") : "";

                const payload: EnquiryInput = {
                  residenceSlug: property.slug,
                  residenceName: property.name,
                  roomCode: room?.id ?? raw["roomId"] ?? "",
                  roomName: room?.name ?? "",
                  unitType: room?.unitType ?? "",
                  occupancy: occupancy ?? raw["occupancy"] ?? "single",
                  moveIn: stay.moveIn,
                  moveOut: stay.moveOut,
                  term: stay.term ?? "long",
                  paymentTerm: stay.paymentTerm ?? "bimonthly",
                  monthlyRent: quote?.monthlyAfter ?? 0,
                  firstPayment: quote?.totalUpfront ?? 0,
                  addons: stay.addons ?? [],
                  fullName: leadData.name,
                  email: leadData.email,
                  phone: leadData.mobile,
                  nationality: leadData.nationality,
                  currentStatus: status,
                  // only what applies: a student sends no employer, and somebody
                  // freelancing sends no company
                  company: studying || selfEmployed ? "" : (leadData.company ?? ""),
                  occupation: studying ? "" : (leadData.occupation ?? ""),
                  university: uni,
                  intake,
                  gender: leadData.gender,
                  heardAbout: heardChoice,
                  heardAboutOther: heardChoice === "Other" ? heardOther.trim() : "",
                  message: leadData.message ?? "",
                  idempotencyKey: submissionKey.current,
                  quoteSnapshot: {
                    addons: stay.addons ?? [],
                    paymentTerm: stay.paymentTerm ?? "bimonthly",
                    property,
                    room,
                    occupancy: occupancy ?? raw["occupancy"] ?? "single",
                    term: stay.term ?? "long",
                    moveIn: stay.moveIn,
                    moveOut: stay.moveOut,
                    quote,
                    lead: {
                      name: leadData.name,
                      // studying or working, so the quote can say which -
                      // including self-employed, which a blank company alone
                      // cannot tell from a missing answer
                      currentStatus: status,
                      university: uni,
                      intake,
                      // and the employer, on the same terms as the university
                      // above. Only the student half was kept here, so staff's
                      // copy of an employed applicant's quote named nobody
                      // while the applicant's own download named their employer
                      company: studying || selfEmployed ? "" : (leadData.company ?? ""),
                      occupation: studying ? "" : (leadData.occupation ?? ""),
                      nationality: leadData.nationality,
                      gender: leadData.gender,
                      email: leadData.email,
                      mobile: leadData.mobile,
                    },
                  },
                };

                savedSnapshot.current = payload.quoteSnapshot as Record<string, unknown>;

                /*
                 * Enquired already today? They are told once and it stops here.
                 * They decide - "Send it anyway" posts this very payload, and a
                 * lookup that fails never costs anyone their enquiry.
                 */
                const seen = await checkEnquiryDuplicate({
                  data: { email: leadData.email, phone: leadData.mobile },
                }).catch(() => ({ duplicate: false as const, notice: "" }));
                if (seen.duplicate) {
                  setDupNotice(seen.notice);
                  setPending(payload);
                  return;
                }

                await send(payload);
              }
            }}
          >
            <DialogHeader className="border-b px-6 py-5 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                <CalendarCheck className="size-5 text-brand" /> Check availability
              </DialogTitle>
              <DialogDescription>
                Takes about 2 minutes. We reply within 24 hours with availability and your
                quotation. Fields marked <span className="text-destructive">*</span> are required.
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
                      {room?.name} · {occupancy === "single" ? "Single occupancy" : "Twin sharing"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(stay.moveIn)} — {formatDate(stay.moveOut)}
                    </p>
                    {quote && (
                      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-card px-3.5 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          {stay.term === "short" ? "Short-term rate" : "Standard rate"} ·{" "}
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
                      <Label htmlFor="en-room">
                        Room type
                        <Req />
                      </Label>
                      <select
                        id="en-room"
                        name="roomId"
                        className={fieldClass}
                        data-invalid={errors["roomId"] ? "true" : undefined}
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
                      <FieldError msg={errors["roomId"]} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-occ">
                        Occupancy
                        <Req />
                      </Label>
                      <select
                        id="en-occ"
                        name="occupancy"
                        className={fieldClass}
                        data-invalid={errors["occupancy"] ? "true" : undefined}
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
                      <FieldError msg={errors["occupancy"]} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-movein">
                        Move-in date
                        <Req />
                      </Label>
                      <Input
                        id="en-movein"
                        name="moveIn"
                        type="date"
                        className="h-11 rounded-xl"
                        data-invalid={errors["moveIn"] ? "true" : undefined}
                        value={stay.moveIn}
                        onChange={(e) => onStayChange({ moveIn: e.target.value })}
                      />
                      <FieldError msg={errors["moveIn"]} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-moveout">
                        Move-out date
                        <Req />
                      </Label>
                      <Input
                        id="en-moveout"
                        name="moveOut"
                        type="date"
                        className="h-11 rounded-xl"
                        data-invalid={errors["moveOut"] ? "true" : undefined}
                        value={stay.moveOut}
                        onChange={(e) => onStayChange({ moveOut: e.target.value })}
                      />
                      <FieldError msg={errors["moveOut"]} />
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
                    <Label htmlFor="en-name">
                      Full name
                      <Req />
                    </Label>
                    <Input
                      id="en-name"
                      name="name"
                      placeholder="Aisha Rahman"
                      maxLength={100}
                      className="h-11 rounded-xl"
                      data-invalid={errors["name"] ? "true" : undefined}
                    />
                    <FieldError msg={errors["name"]} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-email">
                      Email
                      <Req />
                    </Label>
                    <Input
                      id="en-email"
                      name="email"
                      type="email"
                      placeholder="you@email.com"
                      maxLength={255}
                      className="h-11 rounded-xl"
                      data-invalid={errors["email"] ? "true" : undefined}
                    />
                    <FieldError msg={errors["email"]} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-mobile-number">
                      Mobile / WhatsApp
                      <Req />
                    </Label>
                    <div
                      className={`flex h-11 items-stretch overflow-hidden rounded-xl border ${
                        errors["mobile"] ? "border-destructive" : "border-input"
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
                        data-invalid={errors["mobile"] ? "true" : undefined}
                        value={mobileNumber}
                        onChange={(e) =>
                          setMobileNumber(e.target.value.replace(/[^\d\s]/g, "").trimStart())
                        }
                      />
                      <input type="hidden" name="mobile" value={mobileCombined} />
                    </div>
                    <FieldError msg={errors["mobile"]} />
                  </div>
                </div>
              </section>

              {/* Current status - asked before anything about study, because it
                  decides whether there is anything to ask */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Current status
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="en-status">
                    Are you studying or working?
                    <Req />
                  </Label>
                  <select
                    id="en-status"
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

                {/* Where they work. Only once they have said they are working -
                    asking a student for a job title is how a form gets abandoned. */}
                {status === "employed" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="en-company">
                        Company / Organisation
                        {/* self-employed people have no company to name */}
                        {selfEmployed ? null : <Req />}
                      </Label>
                      <Input
                        id="en-company"
                        name="company"
                        className="h-11 rounded-xl"
                        maxLength={120}
                        value={company}
                        disabled={selfEmployed}
                        placeholder={selfEmployed ? "Not needed" : "Where you work"}
                        onChange={(e) => setCompany(e.target.value)}
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
                            if (e.target.checked) setCompany("");
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          I&apos;m self-employed or freelance
                        </span>
                      </label>
                      <FieldError msg={errors["company"]} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="en-occupation">
                        Occupation / Job Title
                        <Req />
                      </Label>
                      <Input
                        id="en-occupation"
                        name="occupation"
                        className="h-11 rounded-xl"
                        maxLength={120}
                        placeholder="e.g. Software engineer"
                        data-invalid={errors["occupation"] ? "true" : undefined}
                      />
                      <FieldError msg={errors["occupation"]} />
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Study details, for a student. Nationality, gender and how they
                  heard of us are asked of everybody, so they stay either way. */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {status === "student" ? "Study details" : "About you"}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {status === "student" ? (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="en-uni">
                          University
                          <Req />
                        </Label>
                        <select
                          id="en-uni"
                          className={fieldClass}
                          value={universityChoice}
                          onChange={(e) => setUniversityChoice(e.target.value)}
                          data-invalid={errors["university"] ? "true" : undefined}
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {universities.map((u) => (
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
                        <FieldError msg={errors["university"]} />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="en-intake">
                          Intake
                          <Req />
                        </Label>
                        <select
                          id="en-intake"
                          name="intake"
                          className={fieldClass}
                          defaultValue=""
                          data-invalid={errors["intake"] ? "true" : undefined}
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
                        <FieldError msg={errors["intake"]} />
                      </div>
                    </>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="en-nat">
                      Nationality
                      <Req />
                    </Label>
                    <CountryCombobox
                      id="en-nat"
                      value={nationalityIso}
                      placeholder="Search your country"
                      onChange={(c: Country) => setNationalityIso(c.iso)}
                      className="w-full"
                      invalid={Boolean(errors["nationality"])}
                    />
                    <input type="hidden" name="nationality" value={nationality} />
                    <FieldError msg={errors["nationality"]} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-gender">
                      Gender
                      <Req />
                    </Label>
                    <select
                      id="en-gender"
                      name="gender"
                      className={fieldClass}
                      defaultValue=""
                      data-invalid={errors["gender"] ? "true" : undefined}
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
                    <FieldError msg={errors["gender"]} />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="en-heard">
                      How did you hear about us?
                      <Req />
                    </Label>
                    <select
                      id="en-heard"
                      className={fieldClass}
                      value={heardChoice}
                      onChange={(e) => setHeardChoice(e.target.value)}
                      data-invalid={errors["heardAbout"] ? "true" : undefined}
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
                    <FieldError msg={errors["heardAbout"]} />
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
              {/* a warning, not a wall - they are told, and they decide */}
              {dupNotice ? (
                <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-amber-900">{dupNotice}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={sending}
                      onClick={() => pending && void send(pending)}
                    >
                      {sending ? "Sending…" : "Continue anyway"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={sending}
                      onClick={() => {
                        setDupNotice("");
                        setPending(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Submit enquiry"}
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
