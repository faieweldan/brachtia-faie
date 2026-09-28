/**
 * An event somebody can put in their own calendar.
 *
 * Two ways in, because students use both: a Google Calendar link opens straight
 * into the app on Android and in the browser, and a .ics file is what an iPhone
 * or Outlook opens. Both are built from the same event so they cannot disagree.
 */

export type CalendarEvent = {
  /** stable across downloads, so a second download updates rather than duplicates */
  uid: string;
  title: string;
  /** ISO timestamps */
  startsAt: string;
  endsAt: string;
  location?: string;
  details?: string;
};

/** 2026-09-30T02:00:00.000Z -> 20260930T020000Z, the form both formats expect */
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Commas, semicolons and line breaks mean something in .ics, so they are escaped. */
const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}`,
    ctz: "Asia/Kuala_Lumpur",
  });
  if (e.location) q.set("location", e.location);
  if (e.details) q.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function icsFile(e: CalendarEvent): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Brachtia Homes//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@brachtiahomes.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    e.location ? `LOCATION:${icsText(e.location)}` : "",
    e.details ? `DESCRIPTION:${icsText(e.details)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Hand the .ics to the browser as a download. */
export function downloadIcs(e: CalendarEvent, filename: string) {
  const url = URL.createObjectURL(new Blob([icsFile(e)], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
