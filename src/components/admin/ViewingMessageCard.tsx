import { useState } from "react";

import { MessageCard, useSentOnce } from "@/components/admin/MessageCard";
import { greetingName } from "@/lib/greeting";
import { formatSlot } from "@/lib/slots";

/** The viewing confirmation, laid out to be read at a glance in WhatsApp (Dani, 27 Oct 2026). */
const viewingMessage = (d: { name: string; startsAt: string; virtual: boolean; residence: string; reference: string }) => {
  const day = new Date(d.startsAt).toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return [
    `Hi ${greetingName(d.name)} 👋`,
    [
      "Your viewing is confirmed:",
      `📅 *${day}, ${formatSlot(d.startsAt)}*`,
      `📍 ${d.residence} (${d.virtual ? "virtual tour" : "in person"})`,
      d.reference ? `Booking ID: *${d.reference}*` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "See you then!\nBrachtia Homes 🏡",
  ].join("\n\n");
};

export function ViewingMessageCard({
  viewingId,
  startsAt,
  virtual,
  residence,
  studentName,
  reference,
  phone,
}: {
  viewingId: string;
  startsAt: string;
  virtual: boolean;
  residence: string;
  studentName: string;
  reference: string;
  phone: string;
}) {
  // per viewing and time, so a rescheduled viewing asks to be sent again
  const { sent, markSent, open, setOpen } = useSentOnce(`brachtia-viewing-msg-${viewingId}-${startsAt}`);
  const [message, setMessage] = useState(() =>
    viewingMessage({ name: studentName, startsAt, virtual, residence, reference }),
  );
  return (
    <MessageCard
      title="Viewing confirmation"
      message={message}
      onMessageChange={setMessage}
      phone={phone}
      sent={sent}
      open={open}
      onOpenChange={setOpen}
      onSent={markSent}
      rows={9}
    />
  );
}
