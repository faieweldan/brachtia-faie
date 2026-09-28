import { greetingName } from "@/lib/greeting";
import { useEffect, useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateViewingToken } from "@/lib/admin.functions";
import { waDigits } from "@/lib/reference-data";

/**
 * The reply a student gets after their enquiry is checked: their room is
 * available, or it is not. Written for WhatsApp and for email.
 *
 * Which one is picked follows the room assignment - a reserved room is the
 * "available" message, no room the "not available" one - and staff can switch
 * it when the booking says otherwise. Both carry the student's own booking link,
 * where they schedule a viewing or go ahead with the booking. The same link
 * "Generate booking link" makes, reused while it stands.
 *
 * The wording is Brachtia's. Only the names, the room type, the residence and
 * the link are filled in; staff can edit before sending.
 */

type Outcome = "available" | "unavailable";
type Channel = "whatsapp" | "email";

type Details = {
  student: string;
  staff: string;
  roomType: string;
  residence: string;
  link: string;
};

const SUBJECT = "Your Brachtia Homes Enquiry";

const lines = (...rows: (string | false)[]) => rows.filter((r) => r !== false).join("\n");

function whatsappMessage(outcome: Outcome, d: Details) {
  const intro = `Hi ${d.student}, this is ${d.staff} from Brachtia Homes 😊`;
  if (outcome === "available") {
    return lines(
      intro,
      `We received your accommodation enquiry and have checked the availability. We have a ${d.roomType} at ${d.residence} available for your preferred move-in date.`,
      "You can choose to schedule a viewing or proceed with the booking here:",
      !!d.link && d.link,
      "Feel free to reply here if you have any questions!",
    );
  }
  return lines(
    intro,
    `We received your accommodation enquiry. Unfortunately, your preferred ${d.roomType} isn’t available for your move-in date.`,
    "We do have a few other options that might suit you. Would you like me to share them with you?",
    "We can also arrange a viewing or virtual tour if you'd like.",
  );
}

function emailMessage(outcome: Outcome, d: Details) {
  const signOff = lines("Best,", d.staff !== TEAM && d.staff, "Brachtia Homes");
  if (outcome === "available") {
    return lines(
      `Hi ${d.student},`,
      "",
      `Thank you for your enquiry with Brachtia Homes. Good news — your preferred ${d.roomType} at ${d.residence} is available for your move-in date.`,
      "",
      "We’ve reserved it for you for now. You can choose to schedule a viewing or proceed with your booking using the link below:",
      !!d.link && d.link,
      "",
      "If you have any questions, just reply to this email and we’ll be happy to help.",
      "",
      signOff,
    );
  }
  return lines(
    `Hi ${d.student},`,
    "",
    `Thank you for your enquiry with Brachtia Homes. Unfortunately, your preferred ${d.roomType} isn’t available for your move-in date.`,
    "",
    "We’d be happy to help you find another suitable option. Our team will be in touch to share other available rooms with you.",
    "",
    "In the meantime, if you’d like to visit the residence, you can schedule a viewing or virtual tour using the link below:",
    !!d.link && d.link,
    "",
    "If you have any questions, simply reply to this email and we’ll be happy to help.",
    "",
    signOff,
  );
}

/** Said when no staff member is assigned yet. */
const TEAM = "the team";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "available", label: "Room available" },
  { value: "unavailable", label: "Not available" },
];

const CHANNELS: { value: Channel; label: string; icon: typeof Mail }[] = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "email", label: "Email", icon: Mail },
];

export function RoomMessageCard({
  enquiryId,
  studentName,
  staffName,
  residenceName,
  roomType,
  phone,
  email,
  roomReserved,
}: {
  enquiryId: string;
  studentName: string;
  staffName: string;
  residenceName: string;
  /** what the student asked for - "Room A Ensuite" */
  roomType: string;
  phone: string;
  email: string;
  /** a room is reserved for the booking - picks the "available" message */
  roomReserved: boolean;
}) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(true);
  // staff's own pick; until then it follows the room assignment
  const [picked, setPicked] = useState<Outcome | null>(null);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  // what staff typed, per channel and message - switching away and back keeps it
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // ready without a click: the link is made (or reused) as soon as it is needed
  useEffect(() => {
    let live = true;
    setLoading(true);
    generateViewingToken({ data: { enquiryId } })
      .then(({ token }) => live && setLink(`${window.location.origin}/viewing/${token}`))
      .catch(() => live && toast.error("Could not create the booking link"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [enquiryId]);

  const auto: Outcome = roomReserved ? "available" : "unavailable";
  const outcome = picked ?? auto;
  const details: Details = {
    // the name they answer to, the same as every other message Brachtia sends
    student: greetingName(studentName),
    staff: staffName.trim() || TEAM,
    roomType: roomType.trim() || "room",
    residence: residenceName.trim() || "Brachtia Homes",
    link,
  };

  const bodyKey = `${channel}:${outcome}`;
  const subjectKey = `subject:${outcome}`;
  const body =
    drafts[bodyKey] ??
    (channel === "whatsapp" ? whatsappMessage(outcome, details) : emailMessage(outcome, details));
  const subject = drafts[subjectKey] ?? SUBJECT;
  const setDraft = (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value }));

  const digits = waDigits(phone);

  async function copy() {
    const text = channel === "email" ? `Subject: ${subject}\n\n${body}` : body;
    await navigator.clipboard.writeText(text);
    toast.success(channel === "email" ? "Email copied" : "Message copied", {
      description: channel === "email" ? "Paste it into your email." : "Paste it into WhatsApp.",
    });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-deep">Message to resident</p>
          <p className="text-xs text-muted-foreground">
            {picked && picked !== auto
              ? "Changed by you"
              : roomReserved
                ? "Picked for you · a room is reserved"
                : "Picked for you · no room reserved yet"}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Which message"
          className="inline-flex h-8 overflow-hidden rounded-md border border-input text-xs"
        >
          {OUTCOMES.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={outcome === o.value}
              onClick={() => setPicked(o.value === auto ? null : o.value)}
              className={`px-3 font-medium transition-colors ${i > 0 ? "border-l border-input" : ""} ${
                outcome === o.value
                  ? "bg-brand-deep text-white"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tablist" aria-label="Send by" className="flex gap-4 border-b border-border">
        {CHANNELS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={channel === value}
            onClick={() => setChannel(value)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-xs font-medium transition-colors ${
              channel === value
                ? "border-brand-deep text-brand-deep"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Preparing the message…</p>
      ) : (
        <div role="tabpanel" className="space-y-3">
          {channel === "email" ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Subject</p>
              <Input
                value={subject}
                onChange={(e) => setDraft(subjectKey, e.target.value)}
                aria-label="Email subject"
                className="h-9"
              />
            </div>
          ) : null}
          {/* editable, so a staff member can add a line before sending */}
          <Textarea
            value={body}
            onChange={(e) => setDraft(bodyKey, e.target.value)}
            rows={channel === "email" ? 12 : 7}
            aria-label={channel === "email" ? "Email message" : "WhatsApp message"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void copy()}>
              <Copy className="size-4" /> {channel === "email" ? "Copy email" : "Copy message"}
            </Button>
            {channel === "whatsapp" && digits ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={`https://wa.me/${digits}?text=${encodeURIComponent(body)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" /> Open in WhatsApp
                </a>
              </Button>
            ) : null}
            {channel === "email" && email ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                >
                  <Mail className="size-4" /> Open in email
                </a>
              </Button>
            ) : null}
            {drafts[bodyKey] !== undefined || drafts[subjectKey] !== undefined ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDrafts((d) => {
                    const { [bodyKey]: _body, [subjectKey]: _subject, ...rest } = d;
                    return rest;
                  })
                }
              >
                Reset wording
              </Button>
            ) : null}
            {(channel === "whatsapp" && !digits) || (channel === "email" && !email) ? (
              <span className="text-xs text-muted-foreground">
                No {channel === "email" ? "email address" : "phone number"} on this booking
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
