/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Download, Mail, Phone, Search } from "lucide-react";
import { toast } from "sonner";

import { StageStepper } from "@/components/admin/ops-ui";
import { blankResident, saveResidentRecord, useOps, allBeds } from "@/lib/ops-store";
import { STAFF, SHARING_LABEL, universityAbbr } from "@/data/form-options";
import {
  ACTIONS,
  SLA_TONE,
  STAGES,
  STAGE_ORDER,
  STAGE_PILL,
  actionLabel,
  nextActionFor,
  slaText,
  stageLabel,
  type ActionKey,
} from "@/lib/bookings-pipeline";

import {
  listEnquiries,
  updateEnquiry,
  advanceEnquiryStage,
  listAppointments,
} from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsPage,
});

const CLOSE_REASONS = ["Lost to competitor", "No response", "Budget", "Other"];

const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

const shortDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
    : "—";

function hasSnapshot(row: any) {
  const q = row?.quote_snapshot;
  return Boolean(q && q.property && q.room && q.quote);
}

type SortKey = "quote_id" | "student" | "move_in" | "stage" | "staff" | "sla";

function BookingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ops = useOps();

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "sla", dir: 1 });
  const [open, setOpen] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

  const mutate = useMutation({
    mutationFn: (input: {
      id: string;
      adminNotes?: string;
      assignedStaff?: string;
      residentId?: string;
    }) => updateEnquiry({ data: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: () => toast.error("Could not save changes"),
  });

  const advance = useMutation({
    mutationFn: (input: { id: string; to: any; note?: string; residentId?: string }) =>
      advanceEnquiryStage({ data: input }),
    onSuccess: () => {
      toast.success("Booking updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not update the booking"),
  });

  const beds = useMemo(() => allBeds(ops.units), [ops.units]);

  function roomAssigned(row: any) {
    const hit = beds.find((b) => b.bed.enquiryId === row.id);
    if (!hit) return "—";
    return `${hit.unit.unitNo} ${hit.room.letter}`;
  }

  function upcomingViewing(row: any) {
    return appointments
      .filter((a) => a.enquiry_id === row.id && a.status !== "cancelled")
      .sort((x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime())[0];
  }

  function createResident(row: any) {
    const resident = blankResident({
      enquiryId: row.id,
      fullName: row.full_name ?? "",
      email: row.email ?? "",
      mobile: row.phone ?? "",
      nationality: row.nationality ?? "",
      gender: row.gender ?? "",
      university: row.university ?? "",
    });
    saveResidentRecord(resident);
    mutate.mutate({ id: row.id, residentId: resident.id });
    setOpen(null);
    void navigate({ to: "/admin/residents/$id", params: { id: resident.id } });
  }

  async function downloadQuote(row: any) {
    if (!hasSnapshot(row)) return;
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      await downloadStayQuote({ ...row.quote_snapshot, reference: row.reference });
    } catch (err) {
      console.error(err);
      toast.error("Could not build the quotation");
    } finally {
      setDownloading(false);
    }
  }

  function runAction(row: any, action: ActionKey) {
    switch (action) {
      case "check_availability":
        void navigate({ to: "/admin/homes/units" });
        return;
      case "schedule_viewing":
      case "complete_viewing":
        void navigate({ to: "/admin/appointments" });
        return;
      case "generate_invoice":
        void downloadQuote(row);
        advance.mutate({ id: row.id, to: "awaiting_fee" });
        return;
      case "confirm_payment":
        void navigate({ to: "/admin/residents/payments" });
        return;
      case "create_resident":
        createResident(row);
        return;
      case "view_resident":
        if (row.resident_id)
          void navigate({ to: "/admin/residents/$id", params: { id: row.resident_id } });
        return;
      default:
        setOpen(row);
    }
  }

  const decorated = (data as any[]).map((r) => {
    const viewing = upcomingViewing(r);
    const next = nextActionFor(r, viewing?.starts_at);
    return { row: r, next, sla: slaText(next.due), viewing };
  });

  const counters = [
    {
      label: "New enquiries",
      value: decorated.filter((d) => d.row.status === "open").length,
    },
    {
      label: "Need availability check",
      value: decorated.filter((d) => d.next.action === "check_availability").length,
    },
    {
      label: "Viewings upcoming",
      value: decorated.filter(
        (d) => d.viewing && new Date(d.viewing.starts_at).getTime() > Date.now(),
      ).length,
    },
    {
      label: "Awaiting payment",
      value: decorated.filter((d) => d.row.status === "awaiting_fee").length,
    },
  ];

  const rows = decorated
    .filter(({ row, next }) => {
      if (stageFilter !== "all" && row.status !== stageFilter) return false;
      if (staffFilter !== "all" && (row.assigned_staff || "") !== staffFilter) return false;
      if (actionFilter !== "all" && next.action !== actionFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [row.reference, row.full_name, row.email, row.phone, row.residence_name, row.room_name]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const dir = sort.dir;
      switch (sort.key) {
        case "student":
          return dir * String(a.row.full_name).localeCompare(String(b.row.full_name));
        case "move_in":
          return (
            dir *
            ((a.row.move_in ? new Date(a.row.move_in).getTime() : Infinity) -
              (b.row.move_in ? new Date(b.row.move_in).getTime() : Infinity))
          );
        case "stage":
          return dir * ((STAGE_ORDER[a.row.status] ?? 99) - (STAGE_ORDER[b.row.status] ?? 99));
        case "staff":
          return dir * String(a.row.assigned_staff || "zzz").localeCompare(String(b.row.assigned_staff || "zzz"));
        default:
          return dir * (a.sla.remaining - b.sla.remaining);
      }
    });

  function SortHead({ label, sortKey, className = "" }: { label: string; sortKey: SortKey; className?: string }) {
    const active = sort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() =>
          setSort((s) => (s.key === sortKey ? { key: sortKey, dir: s.dir === 1 ? -1 : 1 } : { key: sortKey, dir: 1 }))
        }
        className={`flex items-center gap-1 text-left uppercase tracking-wide transition-colors hover:text-foreground ${
          active ? "text-brand-deep" : ""
        } ${className}`}
      >
        {label}
        {active ? (
          sort.dir === 1 ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : null}
      </button>
    );
  }

  const SHARING_SHORT: Record<string, string> = {
    single: "Single",
    twin: "Twin",
    unit: "Whole unit",
  };
  const requirements = (r: any) =>
    [universityAbbr(r.university), SHARING_SHORT[r.occupancy] ?? r.occupancy, r.room_name]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Every enquiry with its current stage, owner and next step.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xl font-bold text-brand-deep">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, room..."
            className="pl-9"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All staff</option>
          <option value="">Unassigned</option>
          {STAFF.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All next actions</option>
          {ACTIONS.filter((a) => a.value !== "none").map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[1.1fr_1.3fr_0.7fr_0.9fr_0.9fr_0.9fr_0.7fr_1.1fr] gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <SortHead label="Student" sortKey="student" />
            <span className="uppercase tracking-wide">Requirements</span>
            <SortHead label="Move-in" sortKey="move_in" />
            <span className="uppercase tracking-wide">Room assigned</span>
            <SortHead label="Stage" sortKey="stage" />
            <SortHead label="Staff" sortKey="staff" />
            <SortHead label="SLA" sortKey="sla" />
            <span className="uppercase tracking-wide">Next action</span>
          </div>

          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No enquiries match these filters.</p>
          ) : (
            rows.map(({ row: r, next, sla }) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpen(r)}
                onKeyDown={(e) => e.key === "Enter" && setOpen(r)}
                className="grid cursor-pointer grid-cols-[1.1fr_1.3fr_0.7fr_0.9fr_0.9fr_0.9fr_0.7fr_1.1fr] items-center gap-3 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
                    <span className="truncate">{r.full_name}</span>
                    {r.gender ? (
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          r.gender.charAt(0).toUpperCase() === "M"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-pink-100 text-pink-700"
                        }`}
                      >
                        {r.gender.charAt(0).toUpperCase()}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-brand-deep">{r.reference}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{requirements(r)}</p>
                <p className="text-xs text-foreground">{shortDate(r.move_in)}</p>
                <p className="truncate text-xs text-foreground">{roomAssigned(r)}</p>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    STAGE_PILL[r.status] ?? "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {stageLabel(r.status)}
                </span>
                <select
                  value={r.assigned_staff ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    mutate.mutate({ id: r.id, assignedStaff: e.target.value });
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Unassigned</option>
                  {STAFF.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className={`text-xs font-medium ${SLA_TONE[sla.tone]}`}>{sla.text}</p>
                {next.action === "none" ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction(r, next.action);
                    }}
                    className="flex items-center gap-1 text-left text-xs font-semibold text-brand-deep hover:underline"
                  >
                    {next.label}
                    <ArrowRight className="size-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.full_name}</SheetTitle>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">
                  Ref {open.reference}
                </p>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-xl border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-brand-deep">Pipeline</p>
                  <StageStepper
                    stages={STAGES.map((s) => ({ key: s.value, label: s.label }))}
                    current={open.status}
                  />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Next action:{" "}
                    <span className="font-semibold text-foreground">
                      {actionLabel(nextActionFor(open, upcomingViewing(open)?.starts_at).action)}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advance.mutate({ id: open.id, to: "room_reserved" })}
                    >
                      Room reserved
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advance.mutate({ id: open.id, to: "viewing_scheduled" })}
                    >
                      Viewing scheduled
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advance.mutate({ id: open.id, to: "viewing_completed" })}
                    >
                      Viewing completed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading}
                      onClick={() => {
                        void downloadQuote(open);
                        advance.mutate({ id: open.id, to: "awaiting_fee" });
                      }}
                    >
                      Invoice issued
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advance.mutate({ id: open.id, to: "booked" })}
                    >
                      Booking fee received
                    </Button>
                    <Button size="sm" onClick={() => createResident(open)}>
                      Create resident
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
                          id: open.id,
                          to: "closed",
                          note: `${open.admin_notes ? `${open.admin_notes}\n` : ""}Closed: ${closeReason}`,
                        });
                        setCloseReason("");
                      }}
                    >
                      Close enquiry
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={open.assigned_staff ?? ""}
                    onChange={(e) => mutate.mutate({ id: open.id, assignedStaff: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {STAFF.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${open.email}`}>
                      <Mail className="size-4" /> Email
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://wa.me/${String(open.phone).replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Phone className="size-4" /> WhatsApp
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hasSnapshot(open) || downloading}
                    onClick={() => void downloadQuote(open)}
                  >
                    <Download className="size-4" />
                    {downloading ? "Preparing…" : "Quotation"}
                  </Button>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  {[
                    ["Residence", open.residence_name],
                    ["Room", open.room_name],
                    ["Room assigned", roomAssigned(open)],
                    ["Occupancy", open.occupancy],
                    ["Move in", open.move_in ?? "—"],
                    ["Move out", open.move_out ?? "—"],
                    ["Rate", open.term === "short" ? "Short term" : "12 month"],
                    ["Monthly rent", money(open.monthly_rent)],
                    ["First payment", money(open.first_payment)],
                    ["Add-ons", (open.addons ?? []).join(", ") || "—"],
                    ["University", universityAbbr(open.university) || "—"],
                    ["Intake", open.intake || "—"],
                    ["Nationality", open.nationality || "—"],
                    ["Gender", open.gender || "—"],
                    ["Phone", open.phone],
                    [
                      "Heard about us",
                      open.heard_about
                        ? open.heard_about === "Other" && open.heard_about_other
                          ? `Other — ${open.heard_about_other}`
                          : open.heard_about
                        : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-medium capitalize text-foreground">{String(v)}</dd>
                    </div>
                  ))}
                </dl>

                {open.message ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Message</p>
                    <p className="mt-1 rounded-lg bg-muted p-3">{open.message}</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Linked viewings</p>
                  {appointments.filter((a) => a.enquiry_id === open.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No viewings tagged yet.</p>
                  ) : (
                    appointments
                      .filter((a) => a.enquiry_id === open.id)
                      .map((a) => (
                        <div
                          key={a.id}
                          className="rounded-lg border border-border px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {new Date(a.starts_at).toLocaleDateString("en-MY", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            · {formatSlot(a.starts_at)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {a.mode === "virtual" ? "Virtual tour" : "In person"} · {a.status}
                          </span>
                        </div>
                      ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Internal notes</p>
                  <Textarea
                    defaultValue={open.admin_notes ?? ""}
                    rows={3}
                    onBlur={(e) =>
                      e.target.value !== (open.admin_notes ?? "") &&
                      mutate.mutate({ id: open.id, adminNotes: e.target.value })
                    }
                  />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
