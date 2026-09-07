/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Download,
  Link2,
  Mail,
  Phone,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { StageStepper } from "@/components/admin/ops-ui";
import {
  blankResident,
  saveResidentRecord,
  useOps,
  allBeds,
  updateBed,
  convertRoomOccupancy,
  bedFreeForPeriod,
  fmtDate,
  type BedRow,
} from "@/lib/ops-store";

type Candidate = { row: BedRow; convert: boolean; blocked?: string };

import { STAFF, SHARING_PREFERENCES, GENDERS, HEARD_ABOUT, universityAbbr } from "@/data/form-options";
import {
  ACTIONS,
  SLA_TONE,
  STAGES,
  STAGE_PILL,
  actionLabel,
  nextActionFor,
  slaText,
  stageLabel,
  type ActionKey,
} from "@/lib/bookings-pipeline";
import {
  getEnquiry,
  listAppointments,
  listResidenceOptions,
  updateEnquiry,
  advanceEnquiryStage,
} from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/bookings/$id")({
  component: BookingDetail,
});

const CLOSE_REASONS = ["Lost to competitor", "No response", "Budget", "Other"];

const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

const fullDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const fullDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function hasSnapshot(row: any) {
  const q = row?.quote_snapshot;
  return Boolean(q && q.property && q.room && q.quote);
}

function genderChip(gender?: string) {
  if (!gender) return null;
  const m = gender.charAt(0).toUpperCase() === "M";
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        m ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
      }`}
    >
      {gender.charAt(0).toUpperCase()}
    </span>
  );
}

function monthsBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return "—";
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "—";
  const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y}y` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "—";
}

function BookingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ops = useOps();

  const [editingStudent, setEditingStudent] = useState(false);
  const [editingStay, setEditingStay] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);


  const { data: row, isLoading } = useQuery({
    queryKey: ["admin", "enquiry", id],
    queryFn: () => getEnquiry({ data: { id } }),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

  const { data: resOptions } = useQuery({
    queryKey: ["admin", "residence-options"],
    queryFn: () => listResidenceOptions(),
  });

  const mutate = useMutation({
    mutationFn: (input: Record<string, unknown>) => updateEnquiry({ data: { id, ...input } as any }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: () => toast.error("Could not save changes"),
  });

  const advance = useMutation({
    mutationFn: (input: { to: any; note?: string; residentId?: string }) =>
      advanceEnquiryStage({ data: { id, ...input } }),
    onSuccess: () => {
      toast.success("Booking updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not update the booking"),
  });

  const beds = useMemo(() => allBeds(ops.units), [ops.units]);
  const linkedBeds = useMemo(() => beds.filter((b) => b.bed.enquiryId === id), [beds, id]);
  const assignedBed = linkedBeds[0];

  const viewing = appointments
    .filter((a) => a.enquiry_id === id && a.status !== "cancelled")
    .sort((x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime())[0];

  const next = row ? nextActionFor(row, viewing?.starts_at) : null;
  const sla = next ? slaText(next.due) : null;

  if (isLoading || !row) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Loading booking…</div>
    );
  }

  // Non-null alias so closures defined below keep the narrowed type.
  const r = row;

  async function downloadQuote(r: any) {
    if (!hasSnapshot(r)) {
      toast.error("No quote snapshot on this enquiry");
      return;
    }
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      await downloadStayQuote({ ...r.quote_snapshot, reference: r.reference });
    } catch (err) {
      console.error(err);
      toast.error("Could not build the quotation");
    } finally {
      setDownloading(false);
    }
  }

  function createResident(r: any) {
    const resident = blankResident({
      enquiryId: r.id,
      fullName: r.full_name ?? "",
      email: r.email ?? "",
      mobile: r.phone ?? "",
      nationality: r.nationality ?? "",
      gender: r.gender ?? "",
      university: r.university ?? "",
      moveIn: r.move_in ?? "",
    });
    saveResidentRecord(resident);
    mutate.mutate({ residentId: resident.id });
    void navigate({ to: "/admin/residents/$id", params: { id: resident.id } });
  }

  function copyBookingLink(r: any) {
    const url = new URL("/book-viewing", window.location.origin);
    url.searchParams.set("residence", r.residence_slug ?? "");
    url.searchParams.set("name", r.full_name ?? "");
    url.searchParams.set("email", r.email ?? "");
    url.searchParams.set("phone", r.phone ?? "");
    void navigator.clipboard.writeText(url.toString());
    toast.success("Booking link copied");
  }

  function runPrimary(action: ActionKey) {
    switch (action) {
      case "check_availability":
      case "schedule_viewing":
      case "complete_viewing":
        void navigate({ to: "/admin/appointments" });
        return;
      case "generate_invoice":
        void downloadQuote(row);
        advance.mutate({ to: "awaiting_fee" });
        return;
      case "confirm_payment":
        void navigate({ to: "/admin/residents/payments" });
        return;
      case "create_resident":
        createResident(r);
        return;
      case "view_resident":
        if (r.resident_id)
          void navigate({ to: "/admin/residents/$id", params: { id: r.resident_id } });
        return;
      default:
        return;
    }
  }

  function assignRoom(c: Candidate) {
    const b = c.row;
    let bedId = b.bed.id;
    if (c.convert) {
      convertRoomOccupancy(b.room.id, "twin");
      // the preserved first bed keeps its id and becomes "Twin 1"
      bedId = b.room.beds[0]?.id ?? b.bed.id;
    }
    updateBed(bedId, {
      enquiryId: id,
      status: "held",
      holdFor: r.full_name,
      holdUntil: r.move_in ?? undefined,
      gender: r.gender ?? undefined,
      university: universityAbbr(r.university) || undefined,
      nationality: r.nationality || undefined,
    });
    advance.mutate({ to: "room_reserved" });
    toast.success(
      c.convert
        ? `${b.unit.unitNo} · Room ${b.room.letter} reconfigured to Twin — 1 of 2 reserved`
        : `Room ${b.unit.unitNo} · ${b.room.letter} reserved`,
    );
    setShowPicker(false);
    setOpenUnitId(null);
  }

  function clearRoom() {
    if (!assignedBed) return;
    const { room } = assignedBed;
    updateBed(assignedBed.bed.id, {
      enquiryId: undefined,
      status: "vacant",
      holdFor: undefined,
      holdUntil: undefined,
    });
    // revert an auto-converted twin back to single when nobody else is in it
    if (room.occupancy === "twin" && room.beds.every((b) => b.id === assignedBed.bed.id || b.status === "vacant")) {
      convertRoomOccupancy(room.id, "single");
    }
    toast.success("Room released");
  }

  const wantedOcc = (r.occupancy || "single") as string;
  const studentGender = (r.gender || "").toLowerCase();

  const candidates: Candidate[] = [];
  for (const b of beds) {
    const roomBeds = b.room.beds;
    const bedFree = bedFreeForPeriod(b.bed, r.move_in, r.move_out);
    const roomEmpty = roomBeds.every((x) => bedFreeForPeriod(x, r.move_in, r.move_out));
    const unitEmpty = b.unit.rooms.every((rm) =>
      rm.beds.every((x) => bedFreeForPeriod(x, r.move_in, r.move_out)),
    );

    if (showAllRooms) {
      if (!bedFree) continue;
      if (roomBeds[0]?.id !== b.bed.id && b.room.occupancy === "single") continue;
      // honour the student's sharing preference even in override mode
      let convert = false;
      let blocked: string | undefined;
      if (wantedOcc === "twin") {
        if (b.room.occupancy === "single") {
          if (roomEmpty) convert = true;
          else blocked = "Single room already occupied — change the sharing preference to Single first";
        }
      } else if (wantedOcc === "single") {
        if (b.room.occupancy === "twin")
          blocked = "Twin room — change the sharing preference to Twin first";
      } else if (wantedOcc === "unit" && !unitEmpty) {
        blocked = "Unit not fully empty — change the sharing preference first";
      }
      candidates.push({ row: b, convert, ...(blocked ? { blocked } : {}) });
      continue;
    }


    if (!bedFree) continue;
    // one entry per room: only consider the first free bed of the room
    const firstFree = roomBeds.find((x) => bedFreeForPeriod(x, r.move_in, r.move_out));
    if (firstFree?.id !== b.bed.id) continue;

    if (r.residence_slug && b.unit.residenceSlug !== r.residence_slug) continue;
    if (r.room_code && b.room.roomTypeCode && b.room.roomTypeCode !== r.room_code) continue;

    const unitGender = (b.unit.gender || "any").toLowerCase();
    if (unitGender !== "any" && studentGender && unitGender !== studentGender) continue;

    if (wantedOcc === "unit") {
      if (!unitEmpty) continue;
      candidates.push({ row: b, convert: false });
    } else if (wantedOcc === "twin") {
      if (b.room.occupancy === "twin") candidates.push({ row: b, convert: false });
      else if (roomEmpty) candidates.push({ row: b, convert: true });
    } else {
      if (b.room.occupancy === "single") candidates.push({ row: b, convert: false });
    }
  }

  const matches = candidates.filter((c) => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return true;
    return `${c.row.unit.unitNo} ${c.row.room.letter} ${c.row.unit.residenceName}`
      .toLowerCase()
      .includes(q);
  });


  const SHARING_SHORT: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };

  const studentFields = [
    ["full_name", "Name", "text"],
    ["gender", "Gender", "gender"],
    ["phone", "Phone", "text"],
    ["email", "Email", "text"],
    ["nationality", "Nationality", "text"],
    ["university", "University", "text"],
    ["intake", "Intake", "text"],
    ["heard_about", "Heard about us", "heard"],
  ] as const;

  const stayFields = [
    ["residence_name", "Residence", "residence"],
    ["occupancy", "Occupancy", "sharing"],
    ["room_name", "Room preference", "text"],
    ["move_in", "Move in", "date"],
    ["move_out", "Move out", "date"],
    ["term", "Term", "term"],
    ["monthly_rent", "Monthly rent (RM)", "number"],
    ["first_payment", "First payment (RM)", "number"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/bookings" })}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-deep hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to Bookings
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-brand-deep">{row.full_name}</h1>
            {genderChip(row.gender)}
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                STAGE_PILL[row.status] ?? "border-border bg-muted text-muted-foreground"
              }`}
            >
              {stageLabel(row.status)}
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">
            {row.reference}
          </p>
          <p className="text-xs text-muted-foreground">Submitted {fullDateTime(row.created_at)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{universityAbbr(row.university) || "—"}</span>
            <span>·</span>
            <span>Move in {fullDate(row.move_in)}</span>
            <span>·</span>
            <span>{SHARING_SHORT[row.occupancy] ?? row.occupancy}</span>
            <span>·</span>
            <span className="truncate">{row.room_name || "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={row.assigned_staff ?? ""}
            onChange={(e) => mutate.mutate({ assignedStaff: e.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Unassigned</option>
            {STAFF.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${row.email}`}>
              <Mail className="size-4" /> Email
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a
              href={`https://wa.me/${String(row.phone).replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Phone className="size-4" /> WhatsApp
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasSnapshot(row) || downloading}
            onClick={() => void downloadQuote(row)}
          >
            <Download className="size-4" />
            {downloading ? "Preparing…" : "Quote"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-5">
          {/* Student details */}
          <EditableCard
            title="Student Details"
            editing={editingStudent}
            onEdit={() => setEditingStudent(true)}
            onCancel={() => setEditingStudent(false)}
            onSave={() => setEditingStudent(false)}
            fields={studentFields}
            row={row}
            onSaveField={(k, v) => mutate.mutate({ [k]: v })}
            resOptions={resOptions ?? []}
          />

          {/* Stay details */}
          <EditableCard
            title="Stay Details"
            editing={editingStay}
            onEdit={() => setEditingStay(true)}
            onCancel={() => setEditingStay(false)}
            onSave={() => setEditingStay(false)}
            fields={stayFields}
            row={row}
            onSaveField={(k, v) => mutate.mutate({ [k]: v })}
            resOptions={resOptions ?? []}
            extra={[
              ["Stay duration", monthsBetween(row.move_in, row.move_out)],
              ["Add-ons", ((r.addons as any[]) ?? []).join(", ") || "—"],
            ]}
          />

          {row.message ? (
            <Card title="Student Message">
              <p className="rounded-lg bg-muted p-3 text-sm">{row.message}</p>
            </Card>
          ) : null}

          {/* Room assignment */}
          <Card title="Room Assignment">
            {assignedBed && !showPicker ? (
              <div>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">{assignedBed.unit.residenceName}</p>
                    <p className="font-medium text-foreground">
                      Unit {assignedBed.unit.unitNo} · Room {assignedBed.room.letter}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assignedBed.room.occupancy === "twin" ? "Twin sharing" : "Single"} ·{" "}
                      {assignedBed.bed.label}
                    </p>
                    <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      RESERVED
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Reserved {row.stage_changed_at ? fullDate(row.stage_changed_at) : "—"} by{" "}
                      {row.assigned_staff || "staff"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={clearRoom}>
                    Change Room
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {assignedBed ? (
                  <p className="text-sm text-muted-foreground">
                    Currently {assignedBed.unit.unitNo} · {assignedBed.room.letter} — pick a different room below.
                  </p>
                ) : null}
                <p className="text-sm italic text-muted-foreground">
                  Showing rooms that match the student&apos;s residence, room type, tenancy period,
                  gender and sharing preference.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      placeholder="Search Unit / Room ID..."
                      className="pl-9"
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {matches.length} {matches.length === 1 ? "match" : "matches"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setShowAllRooms((v) => !v)}>
                    {showAllRooms ? "Show matching rooms" : "Show all rooms"}
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1.6fr_1.2fr_0.6fr] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Room</span>
                    <span>Current config</span>
                    <span>Action</span>
                  </div>
                  {matches.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground">
                      No rooms match this student&apos;s residence, room type, stay dates, gender and
                      sharing preference. Use “Show all rooms” to override.
                    </p>
                  ) : (
                    matches.map((c) => {
                      const b = c.row;
                      const taken = b.room.beds.filter((x) => x.status !== "vacant").length;
                      const open = openUnitId === b.unit.id;
                      return (
                        <div key={b.bed.id} className="border-b border-border last:border-0">
                          <div className="grid grid-cols-[1.6fr_1.2fr_0.6fr] items-center gap-2 px-3 py-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setOpenUnitId(open ? null : b.unit.id)}
                              className="text-left font-semibold text-foreground underline-offset-2 hover:underline"
                            >
                              {b.unit.unitNo} · Room {b.room.letter}
                            </button>
                            <span className="text-muted-foreground">
                              {c.convert
                                ? "Single → Twin"
                                : b.room.occupancy === "twin"
                                  ? `Twin · ${taken + 1}/2`
                                  : "Single"}
                              {c.blocked ? (
                                <span className="block text-[10px] text-amber-600">{c.blocked}</span>
                              ) : null}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!!c.blocked}
                              title={c.blocked ?? ""}
                              onClick={() => assignRoom(c)}
                            >
                              Select
                            </Button>

                          </div>
                          {open ? (
                            <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-3 text-xs">
                              <p className="font-semibold text-foreground">
                                {b.unit.residenceName} · Unit {b.unit.unitNo}
                              </p>
                              <p className="text-muted-foreground">
                                {[b.unit.unitType, b.unit.block && `Block ${b.unit.block}`,
                                  b.unit.floor && `Floor ${b.unit.floor}`, b.unit.gender]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {b.unit.notes ? (
                                <p className="text-muted-foreground">{b.unit.notes}</p>
                              ) : null}
                              <div className="space-y-1">
                                {b.unit.rooms.map((rm) => (
                                  <div key={rm.id} className="rounded-md border border-border bg-background p-2">
                                    <p className="font-medium text-foreground">
                                      Room {rm.letter} · {rm.occupancy === "twin" ? "Twin" : "Single"}
                                    </p>
                                    {rm.beds.map((bd) => (
                                      <p key={bd.id} className="text-muted-foreground">
                                        {bd.label}:{" "}
                                        {bd.residentName || bd.holdFor
                                          ? `${bd.residentName ?? bd.holdFor}${bd.university ? ` · ${bd.university}` : ""}${bd.nationality ? ` · ${bd.nationality}` : ""}${bd.tenancyStart || bd.tenancyEnd ? ` · ${fmtDate(bd.tenancyStart)} – ${fmtDate(bd.tenancyEnd)}` : ""}`
                                          : "Vacant"}
                                      </p>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              <Button size="sm" disabled={!!c.blocked} onClick={() => assignRoom(c)}>
                                {c.blocked ? c.blocked : `Select Room ${b.room.letter}`}
                              </Button>

                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {assignedBed ? (
                  <Button size="sm" variant="ghost" onClick={() => setShowPicker(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            )}
          </Card>

          {/* Viewing */}
          <Card title="Viewing">
            <div className="flex items-center justify-between">
              {viewing ? (
                <div className="flex items-center gap-3">
                  <Calendar className="size-5 text-brand-deep" />
                  <div>
                    <p className="font-medium text-foreground">
                      {new Date(viewing.starts_at).toLocaleDateString("en-MY", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {formatSlot(viewing.starts_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {viewing.mode === "virtual" ? "Virtual tour" : "In person"} · {viewing.status}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Calendar className="size-5" />
                  <p className="text-sm">No viewing scheduled yet</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/admin/appointments" })}>
                  Book a Time
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyBookingLink(row)}>
                  <Link2 className="size-4" /> Booking Link
                </Button>
              </div>
            </div>
          </Card>

          {/* Documents */}
          <Card title="Documents">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Quote</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasSnapshot(row) ? "Generated" : "Not generated"}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={!hasSnapshot(row) || downloading}
                  onClick={() => void downloadQuote(row)}
                >
                  <Download className="size-4" /> Download
                </Button>
              </div>
              <div className="rounded-lg border border-border p-3 opacity-60">
                <p className="text-sm font-medium text-foreground">Invoice</p>
                <p className="mt-1 text-xs text-muted-foreground">Coming soon</p>
                <Button size="sm" className="mt-2" disabled>
                  Generate
                </Button>
              </div>
              <div className="rounded-lg border border-border p-3 opacity-60">
                <p className="text-sm font-medium text-foreground">Payment Receipt</p>
                <p className="mt-1 text-xs text-muted-foreground">Coming soon</p>
                <Button size="sm" className="mt-2" disabled>
                  Generate
                </Button>
              </div>
            </div>
          </Card>

          {/* Internal notes */}
          <Card title="Internal Notes">
            <Textarea
              defaultValue={row.admin_notes ?? ""}
              rows={4}
              placeholder="Add a note..."
              onBlur={(e) =>
                e.target.value !== (row.admin_notes ?? "") &&
                mutate.mutate({ adminNotes: e.target.value })
              }
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Close reason…</option>
                {CLOSE_REASONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!closeReason) {
                    toast.error("Pick a reason to close this enquiry");
                    return;
                  }
                  advance.mutate({
                    to: "closed",
                    note: `${row.admin_notes ? `${row.admin_notes}\n` : ""}Closed: ${closeReason}`,
                  });
                  setCloseReason("");
                }}
              >
                Close enquiry
              </Button>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Next action */}
          <div className="rounded-xl border border-brand-deep/30 bg-brand-deep/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">Next Action</p>
            {next && next.action !== "none" ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm font-medium text-foreground">{next.label}</p>
                {sla && next.due ? (
                  <p className={`text-xs font-medium ${SLA_TONE[sla.tone]}`}>{sla.text}</p>
                ) : null}
                <div className="space-y-2">
                  <Button size="sm" className="w-full" onClick={() => runPrimary(next.action)}>
                    {next.label} <ArrowRight className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => copyBookingLink(row)}>
                    <Link2 className="size-4" /> Generate Booking Link
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No outstanding action.</p>
            )}
          </div>

          {/* Booking progress */}
          <Card title="Booking Progress">
            <ProgressTimeline row={row} />
          </Card>

          {/* Recent activity */}
          <Card title="Recent Activity">
            <ActivityFeed row={row} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-brand-deep">{title}</p>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function EditableCard({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
  fields,
  row,
  onSaveField,
  resOptions,
  extra,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  fields: readonly (readonly [string, string, string])[];
  row: any;
  onSaveField: (key: string, value: unknown) => void;
  resOptions: { id: string; slug: string; name: string }[];
  extra?: [string, React.ReactNode][];
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  function startEdit() {
    const d: Record<string, string> = {};
    for (const [k, , kind] of fields) {
      d[k] = String(row[k] ?? "");
      if (kind === "heard") d[`${k}_other`] = String(row[`${k}_other`] ?? "");
    }
    setDraft(d);
    onEdit();
  }

  function save() {
    for (const [k] of fields) {
      if (draft[k] !== String(row[k] ?? "")) onSaveField(k, draft[k]);
    }
    // save the paired "Other" free-text for heard fields
    for (const [k, , kind] of fields) {
      if (kind === "heard") {
        const otherKey = `${k}_other`;
        if ((draft[otherKey] ?? "") !== String(row[otherKey] ?? ""))
          onSaveField(otherKey, draft[otherKey] ?? "");
      }
    }
    onSave();
  }

  const SHARING_SHORT: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-deep">{title}</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save}>
              <Check className="size-4" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="size-4" /> Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={startEdit}>
            <Pencil className="size-4" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(([k, label, kind]) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground">{label}</label>
              {kind === "gender" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : kind === "sharing" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {SHARING_PREFERENCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : kind === "term" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="long">Long term</option>
                  <option value="short">Short term</option>
                </select>
              ) : kind === "residence" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {resOptions.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : kind === "heard" ? (
                <div className="mt-1 space-y-1">
                  <select
                    value={draft[k] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">—</option>
                    {HEARD_ABOUT.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {draft[k] === "Other" ? (
                    <Input
                      value={draft[`${k}_other`] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [`${k}_other`]: e.target.value }))}
                      placeholder="Please specify"
                      className="h-9"
                    />
                  ) : null}
                </div>
              ) : (
                <Input
                  type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(([k, label, kind]) => (
            <FieldRow
              key={k}
              label={label}
              value={
                kind === "sharing"
                  ? SHARING_SHORT[row[k] as string] ?? row[k]
                  : kind === "term"
                    ? row[k] === "short"
                      ? "Short term"
                      : "Long term"
                    : kind === "number"
                      ? money(Number(row[k] ?? 0))
                      : row[k] || "—"
              }
            />
          ))}
          {extra?.map(([label, value]) => (
            <FieldRow key={label} label={label} value={value} />
          ))}
        </dl>
      )}
    </div>
  );
}

function ProgressTimeline({ row }: { row: any }) {
  const steps = [
    { label: "Enquiry submitted", at: row.created_at, done: true },
    { label: "Room reserved", at: row.stage_changed_at, done: ["room_reserved", "viewing_scheduled", "awaiting_fee", "booked"].includes(row.status) },
    { label: "Viewing", at: row.viewing_completed_at, done: !!row.viewing_completed_at },
    { label: "Invoice", at: row.invoice_issued_at, done: !!row.invoice_issued_at },
    { label: "Payment", at: row.fee_received_at, done: !!row.fee_received_at },
    { label: "Resident created", at: row.resident_id ? row.updated_at : null, done: !!row.resident_id },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const isCurrent = i === currentIndex;
        return (
          <div key={s.label} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex flex-col items-center">
              {s.done ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-3" />
                </span>
              ) : isCurrent ? (
                <span className="size-5 rounded-full border-2 border-brand-deep bg-brand-deep/10" />
              ) : (
                <span className="size-5 rounded-full border border-border" />
              )}
              {i < steps.length - 1 ? (
                <span className={`mt-0.5 h-5 w-px ${s.done ? "bg-emerald-200" : "bg-border"}`} />
              ) : null}
            </div>
            <div>
              <p className={`text-sm ${s.done ? "font-medium text-foreground" : isCurrent ? "font-semibold text-brand-deep" : "text-muted-foreground"}`}>
                {s.label}
              </p>
              {s.at ? (
                <p className="text-xs text-muted-foreground">{fullDate(s.at)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Not yet</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityFeed({ row }: { row: any }) {
  const events: { at: string; text: string }[] = [];
  if (row.created_at) events.push({ at: row.created_at, text: "Enquiry submitted" });
  if (row.stage_changed_at && row.status !== "open")
    events.push({ at: row.stage_changed_at, text: `Stage changed to ${stageLabel(row.status)}` });
  if (row.viewing_completed_at)
    events.push({ at: row.viewing_completed_at, text: "Viewing completed" });
  if (row.invoice_issued_at)
    events.push({ at: row.invoice_issued_at, text: "Invoice issued" });
  if (row.fee_received_at)
    events.push({ at: row.fee_received_at, text: "Booking fee received" });
  if (row.resident_id) events.push({ at: row.updated_at, text: "Resident created" });
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (events.length === 0)
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-3">
      {events.map((e, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-deep/40" />
          <div>
            <p className="text-sm text-foreground">{e.text}</p>
            <p className="text-xs text-muted-foreground">{fullDateTime(e.at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
