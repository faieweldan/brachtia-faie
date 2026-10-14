import { Link } from "@tanstack/react-router";

import { StatusPill } from "@/components/admin/ops-ui";
import { fmtDate, type Resident, type Unit } from "@/lib/ops-store";
import { PERSON_LABEL, bedStays, bedsForPeople, roomShapeLabel, soldBedLabel } from "@/lib/placement";

/**
 * Who is in a unit, room by room (Dani, 14 Oct 2026) - for the room pickers
 * (a booking's Room assignment, Update Tenancy's room change). Each bed lists
 * the person living there and every Reserved or Booked stay to come, from
 * bedStays - the reader Homes uses - so a picker never calls a held bed
 * Vacant. A twin room let whole reads as the single it was sold as.
 */
export function UnitBeds({ unit, residents }: { unit: Unit; residents: Resident[] }) {
  return (
    <div className="space-y-1.5">
      {unit.rooms.map((rm) => {
        // as sold - a room let whole is one single; its other bed only carries the mark
        const beds = bedsForPeople(rm);
        return (
          <div key={rm.id} className="rounded-md border border-border bg-background p-2">
            <p className="font-medium text-foreground">
              Room {rm.letter} · {roomShapeLabel(rm)}
            </p>
            {beds.map((bd) => {
              const stays = bedStays(bd, residents);
              return (
                <div key={bd.id} className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2">
                  <span className="pt-0.5 text-muted-foreground">{soldBedLabel(rm, bd)}</span>
                  <div className="space-y-1">
                    {stays.length ? (
                      stays.map((st) => (
                        <div key={st.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <StatusPill status={st.status} label={PERSON_LABEL[st.status]} />
                          <span className="text-foreground">
                            {st.later ? <span className="text-muted-foreground">Next · </span> : null}
                            {st.residentId ? (
                              <Link to="/admin/residents/$id" params={{ id: st.residentId }} className="underline-offset-2 hover:underline">
                                {st.name}
                              </Link>
                            ) : st.enquiryId ? (
                              <Link to="/admin/bookings/$id" params={{ id: st.enquiryId }} className="underline-offset-2 hover:underline">
                                {st.name}
                              </Link>
                            ) : (
                              st.name
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {[st.reference, st.university, st.nationality].filter(Boolean).join(" · ")}
                            {st.start ? ` · ${fmtDate(st.start)} → ${fmtDate(st.end)}` : ""}
                          </span>
                        </div>
                      ))
                    ) : (
                      <StatusPill status="vacant" label="Vacant" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
