/* eslint-disable @typescript-eslint/no-explicit-any */
import { CHECKIN_TYPE, checkInStatus, type CheckInStatus } from "@/lib/checkin";

/**
 * When a resident checks in - read from their check-in appointment (Dani,
 * 10 Oct 2026).
 *
 * The time used to be read from residents.checkin_on / checkin_slot: what the
 * student picked on their form. The form also books an appointment, and admin
 * reschedules the appointment - so after a reschedule the resident page still
 * showed the student's first pick. One fact, two places, and they drifted.
 *
 * The appointment is now the record: it is what admin moves, confirms and
 * completes. The resident's own fields are only read for an older resident
 * with no appointment, and for "remind me" (asked for, but no time chosen).
 *
 * Server only - handed the service-role client.
 */
export type CheckIn = { status: CheckInStatus; on: string; slot: string; appointmentId: string };

const KL = "Asia/Kuala_Lumpur";
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: KL });
const slotOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: KL, hour: "2-digit", minute: "2-digit", hour12: false });

export async function checkInsFor(sb: any, residentIds: string[]): Promise<Map<string, CheckIn>> {
  const out = new Map<string, CheckIn>();
  if (!residentIds.length) return out;
  const [{ data: appts }, { data: residents }] = await Promise.all([
    sb
      .from("appointments")
      .select("id, resident_id, starts_at, status, updated_at")
      .eq("type_slug", CHECKIN_TYPE)
      .in("resident_id", residentIds)
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false }),
    sb.from("residents").select("id, checkin_on, checkin_slot, checkin_remind").in("id", residentIds),
  ]);
  for (const a of (appts ?? []) as any[]) {
    if (out.has(a.resident_id) || !a.starts_at) continue;
    out.set(a.resident_id, { status: "booked", on: dayOf(a.starts_at), slot: slotOf(a.starts_at), appointmentId: String(a.id) });
  }
  for (const r of (residents ?? []) as any[]) {
    if (out.has(r.id)) continue;
    // no appointment: an older pick, or "remind me"
    out.set(r.id, {
      status: checkInStatus({ on: r.checkin_on, slot: r.checkin_slot, remind: r.checkin_remind }),
      on: String(r.checkin_on ?? ""),
      slot: String(r.checkin_slot ?? ""),
      appointmentId: "",
    });
  }
  return out;
}

export async function checkInFor(sb: any, residentId: string): Promise<CheckIn> {
  return (await checkInsFor(sb, [residentId])).get(residentId) ?? { status: "none", on: "", slot: "", appointmentId: "" };
}
