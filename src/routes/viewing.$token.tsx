import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, Loader2, MapPin, MessageCircle, Video } from "lucide-react";
import { toast } from "sonner";

import { getViewingLink, confirmViewingFromLink } from "@/lib/public.functions";
import { formatSlot } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";

const title = "Pick your viewing time | Brachtia Homes";
const description = "Choose a date and time for your Brachtia Homes viewing.";

export const Route = createFileRoute("/viewing/$token")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ViewingLinkPage,
});

type Mode = "in_person" | "virtual";

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function ViewingLinkPage() {
  const { token } = Route.useParams();
  const [mode, setMode] = useState<Mode>("in_person");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ slot: string } | null>(null);

  const linkQuery = useQuery({
    queryKey: ["viewing-link", token],
    queryFn: () => getViewingLink({ data: { token } }),
  });

  const booking = linkQuery.data?.ok ? (linkQuery.data.booking as Record<string, string>) : null;
  const slug = booking?.["residence_slug"] ?? "";
  const isoDate = date ? toISODate(date) : "";

  useEffect(() => setSlot(null), [isoDate, mode]);

  const slotsQuery = useQuery({
    queryKey: ["slots", slug, mode, isoDate],
    enabled: Boolean(isoDate && booking),
    queryFn: async () => {
      const { fetchDaySlots } = await import("@/lib/public.functions");
      return fetchDaySlots({ data: { residenceSlug: slug, mode, date: isoDate } });
    },
  });
  const slots = slotsQuery.data?.slots ?? [];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  async function confirm() {
    if (!slot) return;
    setSaving(true);
    try {
      const res = await confirmViewingFromLink({ data: { token, startsAt: slot, mode } });
      if (!res.ok) {
        toast.error("This link is no longer valid");
        return;
      }
      setDone({ slot });
    } catch {
      toast.error("Could not confirm your viewing");
    } finally {
      setSaving(false);
    }
  }

  if (linkQuery.isLoading) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-5 animate-spin" />
      </section>
    );
  }

  if (!booking) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl font-extrabold text-brand-deep">Link not available</h1>
        <p className="mt-3 text-muted-foreground">
          This viewing link has expired or is no longer valid. Message us and we'll sort out a time
          with you.
        </p>
        <Button asChild size="lg" className="mt-8 rounded-full">
          <a
            href="https://wa.me/60123306815?text=Hi+my+viewing+link+is+not+working"
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" /> WhatsApp us
          </a>
        </Button>
      </section>
    );
  }

  if (done) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft">
          <CheckCircle2 className="size-7 text-brand" />
        </div>
        <h1 className="mt-5 text-3xl font-extrabold text-brand-deep">Viewing confirmed</h1>
        <p className="mt-3 text-muted-foreground">
          {mode === "virtual" ? "Video tour" : "Viewing"} on{" "}
          <strong className="text-foreground">
            {new Date(done.slot).toLocaleDateString("en-MY", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </strong>{" "}
          at <strong className="text-foreground">{formatSlot(done.slot)}</strong>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Booking ID {booking["reference"]} · {booking["residence_name"]}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep">
        <CalendarCheck className="size-3.5" /> Booking ID {booking["reference"]}
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-brand-deep sm:text-4xl">
        Pick your viewing time
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Hi {booking["full_name"]?.split(" ")[0]}, choose a date and a time that suits you. Your
        details are already with us — nothing to fill in again.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: static details + date */}
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

          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-brand-deep">Your details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Booking ID" value={booking["reference"]} />
              <Row label="Name" value={booking["full_name"]} />
              <Row label="Email" value={booking["email"]} />
              <Row label="Phone" value={booking["phone"]} />
              <Row label="University" value={booking["university"]} />
              <Row label="Residence" value={booking["residence_name"]} />
              <Row label="Room preference" value={booking["room_name"]} />
              <Row label="Move in" value={booking["move_in"]} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pick a date</Label>
            <div className="rounded-2xl border border-border p-2">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={{ before: today }}
                className="mx-auto pointer-events-auto"
              />
            </div>
          </div>
        </div>

        {/* Right: slots */}
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
                No times available on this date. Try another day or message us on WhatsApp.
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
                        ? "border-brand bg-brand text-white"
                        : "border-border hover:border-brand/50"
                    }`}
                  >
                    {formatSlot(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full rounded-full"
            disabled={!slot || saving}
            onClick={() => void confirm()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Confirm viewing
          </Button>
          <p className="text-xs text-muted-foreground">
            Need help? WhatsApp us on +6012-330 6815.
          </p>
        </div>
      </div>
    </section>
  );
}
