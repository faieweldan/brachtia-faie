import { CalendarPlus, Download } from "lucide-react";

import { downloadIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/calendar";

/**
 * Two ways to keep an appointment: Google Calendar, which opens straight into
 * the app on Android and in the browser, and a calendar file, which is what an
 * iPhone or Outlook opens. The same pair wherever a student is told when to
 * come, so every confirmation offers the same thing.
 */
export function AddToCalendar({
  event,
  fileName,
  className = "",
}: {
  event: CalendarEvent;
  fileName: string;
  className?: string;
}) {
  const pill =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted";
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={pill}>
        <CalendarPlus className="size-3.5" /> Google Calendar
      </a>
      <button type="button" onClick={() => downloadIcs(event, fileName)} className={pill}>
        <Download className="size-3.5" /> Apple / Outlook
      </button>
    </div>
  );
}

/** A viewing as a calendar entry, from its start and length. */
export function viewingEvent(opts: {
  uid: string;
  startsAt: string;
  minutes?: number;
  virtual: boolean;
  where: string;
}): CalendarEvent {
  const end = new Date(new Date(opts.startsAt).getTime() + (opts.minutes ?? 30) * 60000);
  return {
    uid: opts.uid,
    title: `${opts.virtual ? "Video tour" : "Viewing"} — Brachtia Homes`,
    startsAt: new Date(opts.startsAt).toISOString(),
    endsAt: end.toISOString(),
    location: opts.virtual ? "Video call - Brachtia Homes will send the link" : opts.where,
    details: opts.virtual
      ? "Your video tour with Brachtia Homes. We will send the call link before it starts."
      : `Your viewing with Brachtia Homes${opts.where ? ` at ${opts.where}` : ""}. We will confirm it with you by email and WhatsApp.`,
  };
}
