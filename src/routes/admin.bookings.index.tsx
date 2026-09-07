/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Search } from "lucide-react";

import { useOps, allBeds } from "@/lib/ops-store";
import { STAFF, universityAbbr } from "@/data/form-options";
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
import { listEnquiries, listAppointments } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/bookings/")({
  component: BookingsTable,
});

type SortKey = "quote_id" | "student" | "move_in" | "stage" | "staff" | "sla";

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" }) : "—";

function BookingsTable() {
  const navigate = useNavigate();
  const ops = useOps();

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "quote_id", dir: -1 });

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

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

  function runAction(row: any, action: ActionKey) {
    switch (action) {
      case "check_availability":
      case "schedule_viewing":
      case "complete_viewing":
      case "generate_invoice":
      case "confirm_payment":
      case "create_resident":
      case "view_resident":
        void navigate({ to: "/admin/bookings/$id", params: { id: row.id } });
        return;
      default:
        void navigate({ to: "/admin/bookings/$id", params: { id: row.id } });
    }
  }

  const decorated = (data as any[]).map((r) => {
    const viewing = upcomingViewing(r);
    const next = nextActionFor(r, viewing?.starts_at);
    return { row: r, next, sla: slaText(next.due), viewing };
  });

  const counters = [
    { label: "New enquiries", value: decorated.filter((d) => d.row.status === "open").length },
    {
      label: "Overdue actions",
      value: decorated.filter((d) => d.sla.tone === "over").length,
    },
    {
      label: "Viewings upcoming",
      value: decorated.filter(
        (d) => d.viewing && new Date(d.viewing.starts_at).getTime() > Date.now(),
      ).length,
    },
    { label: "Awaiting payment", value: decorated.filter((d) => d.row.status === "awaiting_fee").length },
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
        case "quote_id":
          return (
            dir *
            ((a.row.created_at ? new Date(a.row.created_at).getTime() : 0) -
              (b.row.created_at ? new Date(b.row.created_at).getTime() : 0))
          );
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
        {active ? (sort.dir === 1 ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : null}
      </button>
    );
  }

  const SHARING_SHORT: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };
  const requirements = (r: any) => {
    const line1 = [universityAbbr(r.university), SHARING_SHORT[r.occupancy] ?? r.occupancy]
      .filter(Boolean)
      .join(" · ");
    const line2 = r.room_name || "";
    return { line1: line1 || "—", line2 };
  };

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
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[0.7fr_1.5fr_1.4fr_0.7fr_0.9fr_0.9fr_0.5fr_0.7fr_1.1fr] gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <SortHead label="Quote ID" sortKey="quote_id" />
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
                onClick={() => navigate({ to: "/admin/bookings/$id", params: { id: r.id } })}
                onKeyDown={(e) => e.key === "Enter" && navigate({ to: "/admin/bookings/$id", params: { id: r.id } })}
                className="grid cursor-pointer grid-cols-[0.7fr_1.5fr_1.4fr_0.7fr_0.9fr_0.9fr_0.5fr_0.7fr_1.1fr] items-center gap-3 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-brand-deep">{r.reference || "—"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
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
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-xs text-muted-foreground">
                    {(() => {
                      const req = requirements(r);
                      return req.line1;
                    })()}
                  </p>
                  {(() => {
                    const req = requirements(r);
                    return req.line2 ? (
                      <p className="truncate text-xs text-foreground">{req.line2}</p>
                    ) : null;
                  })()}
                </div>
                <p className="text-xs text-foreground">{shortDate(r.move_in)}</p>
                <p className="truncate text-xs text-foreground">{roomAssigned(r)}</p>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    STAGE_PILL[r.status] ?? "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {stageLabel(r.status)}
                </span>
                <p className="truncate text-xs text-foreground">
                  {r.assigned_staff ? (
                    <span className="truncate">{r.assigned_staff}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
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
    </div>
  );
}
