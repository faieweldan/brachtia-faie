import { useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Download, MessageCircle } from "lucide-react";

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

const GENDERS = ["Female", "Male", "Prefer not to say"];

const COUNTRIES = [
  { name: "Malaysia", code: "+60" },
  { name: "China", code: "+86" },
  { name: "India", code: "+91" },
  { name: "Indonesia", code: "+62" },
  { name: "Bangladesh", code: "+880" },
  { name: "Pakistan", code: "+92" },
  { name: "Nigeria", code: "+234" },
  { name: "Egypt", code: "+20" },
  { name: "Saudi Arabia", code: "+966" },
  { name: "United Arab Emirates", code: "+971" },
  { name: "Kuwait", code: "+965" },
  { name: "Qatar", code: "+974" },
  { name: "Oman", code: "+968" },
  { name: "Bahrain", code: "+973" },
  { name: "Singapore", code: "+65" },
  { name: "Thailand", code: "+66" },
  { name: "Vietnam", code: "+84" },
  { name: "Philippines", code: "+63" },
  { name: "Myanmar", code: "+95" },
  { name: "Cambodia", code: "+855" },
  { name: "Laos", code: "+856" },
  { name: "Brunei", code: "+673" },
  { name: "Hong Kong", code: "+852" },
  { name: "Taiwan", code: "+886" },
  { name: "South Korea", code: "+82" },
  { name: "Japan", code: "+81" },
  { name: "Australia", code: "+61" },
  { name: "United Kingdom", code: "+44" },
  { name: "United States", code: "+1" },
  { name: "Canada", code: "+1" },
  { name: "South Africa", code: "+27" },
  { name: "Kenya", code: "+254" },
  { name: "Ghana", code: "+233" },
  { name: "Uganda", code: "+256" },
  { name: "Tanzania", code: "+255" },
  { name: "Zimbabwe", code: "+263" },
  { name: "Zambia", code: "+260" },
  { name: "Rwanda", code: "+250" },
  { name: "Ethiopia", code: "+251" },
  { name: "Morocco", code: "+212" },
  { name: "Algeria", code: "+213" },
  { name: "Tunisia", code: "+216" },
  { name: "Libya", code: "+218" },
  { name: "Sudan", code: "+249" },
  { name: "Jordan", code: "+962" },
  { name: "Lebanon", code: "+961" },
  { name: "Iraq", code: "+964" },
  { name: "Iran", code: "+98" },
  { name: "Turkey", code: "+90" },
  { name: "Yemen", code: "+967" },
  { name: "Syria", code: "+963" },
  { name: "Afghanistan", code: "+93" },
  { name: "Sri Lanka", code: "+94" },
  { name: "Nepal", code: "+977" },
  { name: "Maldives", code: "+960" },
  { name: "Mongolia", code: "+976" },
  { name: "Kazakhstan", code: "+7" },
  { name: "Uzbekistan", code: "+998" },
  { name: "Russia", code: "+7" },
  { name: "Ukraine", code: "+380" },
  { name: "France", code: "+33" },
  { name: "Germany", code: "+49" },
  { name: "Italy", code: "+39" },
  { name: "Spain", code: "+34" },
  { name: "Netherlands", code: "+31" },
  { name: "Sweden", code: "+46" },
  { name: "Norway", code: "+47" },
  { name: "Denmark", code: "+45" },
  { name: "Finland", code: "+358" },
  { name: "Ireland", code: "+353" },
  { name: "Belgium", code: "+32" },
  { name: "Switzerland", code: "+41" },
  { name: "Austria", code: "+43" },
  { name: "Portugal", code: "+351" },
  { name: "Greece", code: "+30" },
  { name: "Poland", code: "+48" },
  { name: "Czech Republic", code: "+420" },
  { name: "Hungary", code: "+36" },
  { name: "Romania", code: "+40" },
  { name: "Bulgaria", code: "+359" },
  { name: "Croatia", code: "+385" },
  { name: "Serbia", code: "+381" },
  { name: "Slovakia", code: "+421" },
  { name: "Slovenia", code: "+386" },
  { name: "Lithuania", code: "+370" },
  { name: "Latvia", code: "+371" },
  { name: "Estonia", code: "+372" },
  { name: "Belarus", code: "+375" },
  { name: "Moldova", code: "+373" },
  { name: "Azerbaijan", code: "+994" },
  { name: "Georgia", code: "+995" },
  { name: "Armenia", code: "+374" },
  { name: "Kyrgyzstan", code: "+996" },
  { name: "Tajikistan", code: "+992" },
  { name: "Turkmenistan", code: "+993" },
  { name: "North Macedonia", code: "+389" },
  { name: "Bosnia and Herzegovina", code: "+387" },
  { name: "Albania", code: "+355" },
  { name: "Montenegro", code: "+382" },
  { name: "Cyprus", code: "+357" },
  { name: "Malta", code: "+356" },
  { name: "Iceland", code: "+354" },
  { name: "Luxembourg", code: "+352" },
  { name: "Monaco", code: "+377" },
  { name: "Andorra", code: "+376" },
  { name: "Liechtenstein", code: "+423" },
  { name: "San Marino", code: "+378" },
  { name: "Vatican City", code: "+379" },
  { name: "Brazil", code: "+55" },
  { name: "Mexico", code: "+52" },
  { name: "Argentina", code: "+54" },
  { name: "Colombia", code: "+57" },
  { name: "Chile", code: "+56" },
  { name: "Peru", code: "+51" },
  { name: "Venezuela", code: "+58" },
  { name: "Ecuador", code: "+593" },
  { name: "Bolivia", code: "+591" },
  { name: "Paraguay", code: "+595" },
  { name: "Uruguay", code: "+598" },
  { name: "Guyana", code: "+592" },
  { name: "Suriname", code: "+597" },
  { name: "New Zealand", code: "+64" },
  { name: "Fiji", code: "+679" },
  { name: "Papua New Guinea", code: "+675" },
  { name: "Solomon Islands", code: "+677" },
  { name: "Vanuatu", code: "+678" },
  { name: "Samoa", code: "+685" },
  { name: "Tonga", code: "+676" },
  { name: "Kiribati", code: "+686" },
  { name: "Tuvalu", code: "+688" },
  { name: "Nauru", code: "+674" },
  { name: "Palau", code: "+680" },
  { name: "Marshall Islands", code: "+692" },
  { name: "Micronesia", code: "+691" },
];

const selectClass =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40";

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
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(7, "Enter a valid mobile number").max(30),
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
  const [countryCode, setCountryCode] = useState("+60");
  const [mobileNumber, setMobileNumber] = useState("");

  const mobileCombined = `${countryCode} ${mobileNumber}`.trim();

  const room = stay.room;
  const occupancies = room?.occupancies ?? [];
  const occupancy = stay.occupancy;
  const quote = stay.quote ?? null;

  const universities = [...property.nearbyUniversities.map((u) => u.name), "Other"];
  const now = new Date();
  const intakes = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  });

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
      setCountryCode("+60");
      setMobileNumber("");
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        {submitted ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-tint">
              <CheckCircle2 className="size-7 text-brand" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-brand-deep">Enquiry sent</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              We'll confirm availability for {room ? room.name : "your room"} at {property.name}{" "}
              within 24 hours by email or WhatsApp.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {quote && (
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={downloadQuote}
                  disabled={downloading}
                >
                  <Download className="size-4" />
                  {downloading ? "Preparing…" : "Download quotation (PDF)"}
                </Button>
              )}
              <Button asChild variant="outline" size="lg" className="flex-1">
                <a href={whatsappUrl(summaryMessage)} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp us
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-brand-deep">
                <CalendarCheck className="size-5 text-brand" /> Check availability
              </DialogTitle>
              <DialogDescription>
                Confirm your stay and details — we'll reply within 24 hours with availability and
                your quotation.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-5"
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
                  return;
                }

                setErrors({});
                setLead(leadParsed.success ? leadParsed.data : null);
                setSubmitted(true);
                toast.success("Enquiry sent", {
                  description: "We'll confirm availability within 24 hours.",
                });
              }}
            >
              {/* Your stay */}
              <section className="rounded-2xl bg-brand-tint/60 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
                  Your stay · {property.name}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="en-room">Room type</Label>
                    <select
                      id="en-room"
                      name="roomId"
                      className={selectClass}
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
                    {errors['roomId'] && (
                      <p className="text-xs text-destructive">{errors['roomId']}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-occ">Occupancy</Label>
                    <select
                      id="en-occ"
                      name="occupancy"
                      className={selectClass}
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
                    {errors['occupancy'] && (
                      <p className="text-xs text-destructive">{errors['occupancy']}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-movein">Move-in date</Label>
                    <Input
                      id="en-movein"
                      name="moveIn"
                      type="date"
                      value={stay.moveIn}
                      onChange={(e) => onStayChange({ moveIn: e.target.value })}
                    />
                    {errors['moveIn'] && (
                      <p className="text-xs text-destructive">{errors['moveIn']}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="en-moveout">Move-out date</Label>
                    <Input
                      id="en-moveout"
                      name="moveOut"
                      type="date"
                      value={stay.moveOut}
                      onChange={(e) => onStayChange({ moveOut: e.target.value })}
                    />
                    {errors['moveOut'] && (
                      <p className="text-xs text-destructive">{errors['moveOut']}</p>
                    )}
                  </div>
                </div>

                {quote && room && (
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-card px-3.5 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {stay.term === "short" ? "Short-term rate" : "12-month rate"} ·{" "}
                      {formatRM(quote.monthlyAfter)}/month · from {formatDate(stay.moveIn)}
                    </span>
                    <span className="text-sm font-extrabold tabular-nums text-brand-deep">
                      {formatRM(quote.totalUpfront)} first payment
                    </span>
                  </div>
                )}
              </section>

              {/* Your details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="en-name">Full name</Label>
                  <Input id="en-name" name="name" placeholder="Aisha Rahman" maxLength={100} />
                  {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-uni">University</Label>
                  <select id="en-uni" name="university" className={selectClass} defaultValue="">
                    <option value="" disabled>
                      Select
                    </option>
                    {universities.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {errors['university'] && (
                    <p className="text-xs text-destructive">{errors['university']}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-intake">Intake</Label>
                  <select id="en-intake" name="intake" className={selectClass} defaultValue="">
                    <option value="" disabled>
                      Select month & year
                    </option>
                    {intakes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {errors['intake'] && (
                    <p className="text-xs text-destructive">{errors['intake']}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-nat">Nationality</Label>
                  <Input id="en-nat" name="nationality" placeholder="Malaysian" maxLength={60} />
                  {errors['nationality'] && (
                    <p className="text-xs text-destructive">{errors['nationality']}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-gender">Gender</Label>
                  <select id="en-gender" name="gender" className={selectClass} defaultValue="">
                    <option value="" disabled>
                      Select
                    </option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  {errors['gender'] && (
                    <p className="text-xs text-destructive">{errors['gender']}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-email">Email</Label>
                  <Input
                    id="en-email"
                    name="email"
                    type="email"
                    placeholder="you@email.com"
                    maxLength={255}
                  />
                  {errors['email'] && <p className="text-xs text-destructive">{errors['email']}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="en-mobile">Mobile / WhatsApp</Label>
                  <Input id="en-mobile" name="mobile" placeholder="+60..." maxLength={25} />
                  {errors['mobile'] && (
                    <p className="text-xs text-destructive">{errors['mobile']}</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="en-message">Anything else? (optional)</Label>
                  <Textarea
                    id="en-message"
                    name="message"
                    rows={3}
                    maxLength={1000}
                    placeholder="Preferences, questions or special requests."
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full">
                Submit enquiry
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Free to enquire — no payment yet. Your quotation is available right after you
                submit.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
