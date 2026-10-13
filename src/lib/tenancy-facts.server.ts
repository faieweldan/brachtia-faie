import { rentOn, readRentSteps } from "@/lib/rent-schedule.server";
import type { RentStep } from "@/lib/rental-schedule";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A stay's official dates, and the rent in force on a day - each decided here,
 * once (14 Oct 2026). Update Tenancy, the tenancy documents and the Tenancy
 * tab's summaries read them from here, so none of them prefers a copy.
 *
 * The dates:
 *   - a tenancy (a paid stay, or one made on Create tenancy): tenancies
 *     start_date / end_date. Nothing else - place_stay, move_stay_dates and
 *     extend_stay are what change them
 *   - a booking with no tenancy yet: the dates its room is held for
 *     (placement_holds), else the booking's own move-in and move-out
 * The rent: the rent terms (rental_schedules) with the rent changes from their
 * days (rentOn). The copies stay where they are for the screens that print
 * them - beds, residents, enquiries - and an invoice keeps the dates and rent
 * it was issued with; none of them is read here.
 *
 * Server only - handed the service-role client.
 */

const day = (v: unknown) => String(v ?? "").slice(0, 10);

export type OfficialStay = {
  /** where the dates came from: a tenancy, a booking not paid yet, or nothing */
  source: "tenancy" | "booking" | "none";
  tenancyId: string | null;
  enquiryId: string | null;
  /** yyyy-mm-dd, "" when not known */
  start: string;
  end: string;
  /** the tenancy row itself, for what a document prints besides the dates */
  tenancy: Record<string, any> | null;
};

const NONE: OfficialStay = {
  source: "none",
  tenancyId: null,
  enquiryId: null,
  start: "",
  end: "",
  tenancy: null,
};

/** The rule, on rows already read - a tenancy wins; a booking's hold before its own dates. */
export function pickStay(r: {
  tenancy?: Record<string, any> | null;
  hold?: { start_date?: unknown; end_date?: unknown } | null;
  enquiry?: { id?: unknown; move_in?: unknown; move_out?: unknown } | null;
}): OfficialStay {
  if (r.tenancy)
    return {
      source: "tenancy",
      tenancyId: String(r.tenancy["id"]),
      enquiryId: r.tenancy["enquiry_id"]
        ? String(r.tenancy["enquiry_id"])
        : r.enquiry?.id
          ? String(r.enquiry.id)
          : null,
      start: day(r.tenancy["start_date"]),
      end: day(r.tenancy["end_date"]),
      tenancy: r.tenancy,
    };
  if (r.enquiry || r.hold)
    return {
      source: "booking",
      tenancyId: null,
      enquiryId: r.enquiry?.id ? String(r.enquiry.id) : null,
      start: day(r.hold?.start_date) || day(r.enquiry?.move_in),
      end: day(r.hold?.end_date) || day(r.enquiry?.move_out),
      tenancy: null,
    };
  return NONE;
}

/**
 * The official dates of a resident's stay, or a booking's. With `tenancyId`,
 * that tenancy - and only when it is this resident's. Otherwise their latest
 * tenancy (a renewal is the newest), else their booking.
 */
export async function officialStay(
  sb: any,
  who: { residentId?: string | null; enquiryId?: string | null; tenancyId?: string | null },
): Promise<OfficialStay> {
  const residentId = who.residentId || "";
  let tenancy: Record<string, any> | null = null;
  if (who.tenancyId) {
    const { data, error } = await sb
      .from("tenancies")
      .select("*")
      .eq("id", who.tenancyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // somebody else's tenancy is not this stay
    tenancy = data && (!residentId || String(data.resident_id ?? "") === residentId) ? data : null;
    if (!tenancy) return NONE;
  } else if (residentId) {
    const { data, error } = await sb
      .from("tenancies")
      .select("*")
      .eq("resident_id", residentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    tenancy = data ?? null;
  }
  if (!tenancy && who.enquiryId) {
    const { data, error } = await sb
      .from("tenancies")
      .select("*")
      .eq("enquiry_id", who.enquiryId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    tenancy = data ?? null;
  }
  if (tenancy) return pickStay({ tenancy });

  // not paid yet: the booking - the resident's own, when only the resident is known
  let enquiryId = who.enquiryId || "";
  if (!enquiryId && residentId) {
    const { data } = await sb
      .from("residents")
      .select("enquiry_id")
      .eq("id", residentId)
      .maybeSingle();
    enquiryId = String(data?.enquiry_id ?? "");
  }
  if (!enquiryId) return NONE;
  const [{ data: enquiry }, { data: hold }] = await Promise.all([
    sb.from("enquiries").select("id, move_in, move_out").eq("id", enquiryId).maybeSingle(),
    sb
      .from("placement_holds")
      .select("start_date, end_date")
      .eq("enquiry_id", enquiryId)
      .maybeSingle(),
  ]);
  return pickStay({ enquiry: enquiry ?? null, hold: hold ?? null });
}

export type RentInForce = {
  /** the monthly rent on the day asked - 0 when there are no rent terms and no rent change */
  rent: number;
  /** the tenancy has rent terms (rental_schedules) */
  hasSchedule: boolean;
};

/** The rule, on rows already read: the rent changes from their days, the rent terms' rent before the first. */
export function rentInForceFrom(
  schedule: { monthly_rent?: unknown } | null,
  steps: RentStep[],
  on: string,
): RentInForce {
  return { rent: rentOn(steps, on, Number(schedule?.monthly_rent ?? 0)), hasSchedule: !!schedule };
}

/** The rent of a tenancy in force on `on` (yyyy-mm-dd). */
export async function rentInForce(
  sb: any,
  residentId: string,
  tenancyId: string | null | undefined,
  on: string,
): Promise<RentInForce> {
  if (!tenancyId) return { rent: 0, hasSchedule: false };
  const { data: schedule, error } = await sb
    .from("rental_schedules")
    .select("monthly_rent")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { steps } = await readRentSteps(sb, residentId, tenancyId);
  return rentInForceFrom(schedule ?? null, steps, on);
}
