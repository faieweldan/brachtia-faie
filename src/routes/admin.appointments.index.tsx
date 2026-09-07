import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  GraduationCap,
  Info,
  Link2,
  Luggage,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

import {
  listAppointments,
  saveAppointment,
  deleteAppointment,
  listEnquiries,
  listResidenceOptions,
} from "@/lib/admin.functions";
import { fetchDaySlots } from "@/lib/public.functions";
import { formatSlot } from "@/lib/slots";
import { useOps } from "@/lib/ops-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import {
  STAFF,
  SHARING_LABEL,
  SHARING_PREFERENCES,
  UNIVERSITIES,
  GENDERS,
  HEARD_ABOUT,
  ENQUIRY_STATUS,
} from "@/data/form-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Route = createFileRoute("/admin/appointments/")({
  component: AppointmentsPage,
});

const STATUSES = ["pending", "confirmed", "completed", "no_show", "cancelled"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No Show",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-200 text-slate-700",
  no_show: "bg-orange-100 text-orange-800",
  cancelled: "bg-rose-100 text-rose-700",
};

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30";

function localDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function endISO(a: any) {
  return new Date(
    new Date(a.starts_at).getTime() + (a.duration_minutes ?? 30) * 60000,
  ).toISOString();
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

function emptyForm() {
  const now = new Date();
  return {
    id: undefined as string | undefined,
    type_slug: "viewing-in-person",
    residence_slugs: [] as string[],
    move_in: "",
    move_out: "",
    sharing_preference: "",
    mode: "in_person",
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }),
    time: "10:00",
    duration_minutes: 30,
    status: "pending",
    assigned_staff: "",
    full_name: "",
    email: "",
    phone: "",
    university: "",
    nationality: "",
    intake: "",
    gender: "",
    heard_about: "",
    heard_about_other: "",
    enquiry_status: "",
    notes: "",
    admin_notes: "",
    enquiry_id: "" as string,
    resident_id: "" as string,
    history: [] as any[],
    starts_at: "" as string,
  };
}

type FormState = ReturnType<typeof emptyForm>;

type SortKey = "datetime" | "person" | "type" | "residence" | "assigned" | "status";

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-brand-deep ${
        active ? "text-brand-deep" : "text-muted-foreground"
      }`}
    >
      {label}
      <span aria-hidden className="text-[10px]">
        {active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function AppointmentsPage() {
  const queryClient = useQueryClient();
  const ops = useOps();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [residenceFilter, setResidenceFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "datetime", dir: 1 });
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const { data: enquiries = [] } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });
  const { data: residences = [] } = useQuery({
    queryKey: ["admin", "residence-options"],
    queryFn: () => listResidenceOptions(),
  });

  const enquiryById = new Map((enquiries as any[]).map((e) => [e.id, e]));
  const residentById = new Map(ops.residents.map((r) => [r.id, r]));
  const appointments = ((data as any)?.appointments ?? []) as any[];
  const types = ((data as any)?.types ?? []) as any[];
  const typeBySlug = new Map(types.map((t) => [t.slug, t]));

  const save = useMutation({
    mutationFn: (input: { id?: string; values: Record<string, unknown> }) =>
      saveAppointment({ data: input }),
    onSuccess: () => {
      toast.success("Appointment saved");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not save appointment"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAppointment({ data: { id } }),
    onSuccess: () => {
      toast.success("Appointment removed");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not remove appointment"),
  });

  const filtered = useMemo(
    () =>
      appointments.filter((a) => {
        if (typeFilter !== "all" && a.type_slug !== typeFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (residenceFilter !== "all") {
          const slugs: string[] = (a.residence_slugs ?? []).length
            ? a.residence_slugs
            : [a.residence_slug];
          if (!slugs.includes(residenceFilter)) return false;
        }
        if (staffFilter !== "all") {
          if (staffFilter === "unassigned") {
            if (a.assigned_staff) return false;
          } else if (a.assigned_staff !== staffFilter) return false;
        }
        const day = localDate(a.starts_at);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const ref = a.enquiry_id ? (enquiryById.get(a.enquiry_id)?.reference ?? "") : "";
          const hay = [
            a.full_name,
            a.email,
            a.phone,
            ref,
            a.enquiry_id,
            a.resident_id,
            a.resident_id ? `resident ${a.resident_id}` : "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments, typeFilter, statusFilter, residenceFilter, staffFilter, from, to, search],
  );

  const sorted = useMemo(() => {
    const val = (a: any): string => {
      switch (sort.key) {
        case "person":
          return (a.full_name ?? "").toLowerCase();
        case "type":
          return (typeBySlug.get(a.type_slug)?.name ?? a.type_slug ?? "").toLowerCase();
        case "residence":
          return (
            ((a.residence_names ?? []).length
              ? (a.residence_names as string[]).join(", ")
              : a.residence_name || "") as string
          ).toLowerCase();
        case "assigned":
          return (a.assigned_staff ?? "").toLowerCase();
        case "status":
          return (STATUS_LABEL[a.status] ?? a.status ?? "").toLowerCase();
        default:
          return a.starts_at ?? "";
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return (a.starts_at ?? "").localeCompare(b.starts_at ?? "");
      return x < y ? -sort.dir : sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  /* ---- slot loading for reschedule / new ---- */
  useEffect(() => {
    if (!form || !rescheduling) return;
    let cancelled = false;
    setSlotsLoading(true);
    void fetchDaySlots({
      data: {
        residenceSlug: form.residence_slugs[0] ?? "",
        mode: form.mode === "virtual" ? "virtual" : "in_person",
        date: form.date,
      },
    })
      .then((res: any) => {
        if (!cancelled) setSlots((res?.slots ?? []) as string[]);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form?.date, form?.mode, form?.residence_slugs?.[0], rescheduling]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setForm(emptyForm());
    setRescheduling(true);
    setLinkEditing(false);
  }

  function openEdit(a: any) {
    const d = new Date(a.starts_at);
    setForm({
      id: a.id,
      type_slug: a.type_slug ?? "viewing-in-person",
      residence_slugs: ((a.residence_slugs ?? []) as string[]).length
        ? (a.residence_slugs as string[])
        : a.residence_slug
          ? [a.residence_slug as string]
          : [],
      move_in: a.move_in ?? "",
      move_out: a.move_out ?? "",
      sharing_preference: a.sharing_preference ?? "",
      mode: a.mode ?? "in_person",
      date: localDate(a.starts_at),
      time: d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kuala_Lumpur",
      }),
      duration_minutes: a.duration_minutes ?? 30,
      status: a.status ?? "pending",
      assigned_staff: a.assigned_staff ?? "",
      full_name: a.full_name ?? "",
      email: a.email ?? "",
      phone: a.phone ?? "",
      university: a.university ?? "",
      nationality: a.nationality ?? "",
      intake: a.intake ?? "",
      gender: a.gender ?? "",
      heard_about: a.heard_about ?? "",
      heard_about_other: a.heard_about_other ?? "",
      enquiry_status: a.enquiry_status ?? "",
      notes: a.notes ?? "",
      admin_notes: a.admin_notes ?? "",
      enquiry_id: a.enquiry_id ?? "",
      resident_id: a.resident_id ?? "",
      history: Array.isArray(a.history) ? a.history : [],
      starts_at: a.starts_at,
    });
    setRescheduling(false);
    setLinkEditing(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function submit(overrides?: Partial<Record<string, unknown>>) {
    if (!form) return;
    if (!form.full_name.trim()) {
      toast.error("Add a name");
      return;
    }
    const slugs = form.residence_slugs;
    const primarySlug = slugs[0] ?? "";
    const residence = (residences as any[]).find((r) => r.slug === primarySlug);
    const names = slugs.map((s) => (residences as any[]).find((r) => r.slug === s)?.name ?? s);
    const startsAt = new Date(`${form.date}T${form.time}:00+08:00`).toISOString();

    const history = [...form.history];
    if (form.id && form.starts_at && startsAt !== form.starts_at) {
      history.push({
        at: new Date().toISOString(),
        kind: "rescheduled",
        from: form.starts_at,
        to: startsAt,
      });
    }
    if (overrides?.["status"] && overrides["status"] !== form.status) {
      history.push({
        at: new Date().toISOString(),
        kind: "status",
        from: form.status,
        to: overrides["status"],
      });
    }

    save.mutate({
      ...(form.id ? { id: form.id } : {}),
      values: {
        type_slug: form.type_slug,
        residence_id: residence?.id ?? null,
        residence_slug: primarySlug,
        residence_name: residence?.name ?? "",
        residence_slugs: slugs,
        residence_names: names,
        move_in: form.move_in || null,
        move_out: form.move_out || null,
        sharing_preference: form.sharing_preference,
        mode: form.mode,
        starts_at: startsAt,
        duration_minutes: Number(form.duration_minutes) || 30,
        status: form.status,
        assigned_staff: form.assigned_staff,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        university: form.university,
        nationality: form.nationality,
        intake: form.intake,
        gender: form.gender,
        heard_about: form.heard_about,
        heard_about_other: form.heard_about_other,
        enquiry_status: form.enquiry_status,
        notes: form.notes,
        admin_notes: form.admin_notes,
        enquiry_id: form.enquiry_id || null,
        resident_id: form.resident_id,
        history,
        source: form.id ? undefined : "admin",
        ...overrides,
      },
    });
  }

  function copyInvite() {
    if (!form) return;
    const type = typeBySlug.get(form.type_slug);
    const startsAt = new Date(`${form.date}T${form.time}:00+08:00`).toISOString();
    const residenceName =
      (residences as any[]).find((r) => r.slug === form.residence_slugs[0])?.name ?? "";
    const text = `Hi ${form.full_name}, your ${(type?.name ?? "appointment").toLowerCase()} is confirmed for ${longDate(
      startsAt,
    )} at ${formatSlot(startsAt)}${residenceName ? ` at ${residenceName}` : ""}.${
      form.assigned_staff ? ` You'll be meeting ${form.assigned_staff}.` : ""
    } See you then! — Brachtia Homes`;
    void navigator.clipboard.writeText(text);
    toast.success("Invite message copied");
  }

  function downloadIcs() {
    if (!form) return;
    const type = typeBySlug.get(form.type_slug);
    const startsAt = new Date(`${form.date}T${form.time}:00+08:00`).toISOString();
    const ends = new Date(
      new Date(startsAt).getTime() + (Number(form.duration_minutes) || 30) * 60000,
    ).toISOString();
    const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const residenceName =
      (residences as any[]).find((r) => r.slug === form.residence_slugs[0])?.name ?? "";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Brachtia Homes//Appointments//EN",
      "BEGIN:VEVENT",
      `UID:${form.id ?? Date.now()}@brachtiahomes.com`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(startsAt)}`,
      `DTEND:${stamp(ends)}`,
      `SUMMARY:${type?.name ?? "Appointment"} — ${form.full_name}`,
      `LOCATION:${residenceName}`,
      `DESCRIPTION:${form.mode === "virtual" ? "Virtual" : "In person"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointment-${form.id ?? "new"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function linkedLabel(a: any) {
    if (a.enquiry_id && enquiryById.get(a.enquiry_id)) {
      return (
        <Link
          to="/admin/bookings/$id"
          params={{ id: a.enquiry_id }}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-brand-deep hover:underline"
        >
          Booking · {enquiryById.get(a.enquiry_id).reference}
        </Link>
      );
    }
    if (a.resident_id && residentById.get(a.resident_id)) {
      return (
        <Link
          to="/admin/residents/$id"
          params={{ id: a.resident_id }}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-brand-deep hover:underline"
        >
          Resident · {a.resident_id}
        </Link>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  const gridCols = { gridTemplateColumns: "1fr 1.1fr 0.9fr 0.9fr 0.8fr 0.8fr 1.2fr" };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                view === v ? "bg-card text-brand-deep shadow-sm" : "text-muted-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-64 pl-8"
            placeholder="Search name, email, booking or resident ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className={selectClass}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={residenceFilter}
          onChange={(e) => setResidenceFilter(e.target.value)}
        >
          <option value="all">All residences</option>
          {(residences as any[]).map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
        >
          <option value="all">All staff</option>
          {STAFF.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="unassigned">Unassigned</option>
        </select>

        {view === "list" ? (
          <div className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-input bg-background px-2 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">Date range</span>
            <input
              type="date"
              aria-label="From date"
              className="h-7 rounded-md border-0 bg-transparent px-1 text-xs outline-none"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              aria-label="To date"
              className="h-7 rounded-md border-0 bg-transparent px-1 text-xs outline-none"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {from || to ? (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="text-[11px] font-semibold text-muted-foreground hover:text-brand-deep"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        <Button size="sm" className="ml-auto" onClick={openNew}>
          <Plus className="mr-1 size-4" />
          New appointment
        </Button>
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="min-w-[980px]">
            <div
              style={gridCols}
              className="grid gap-3 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <SortHead label="Date & time" sortKey="datetime" sort={sort} onSort={toggleSort} />
              <SortHead label="Person" sortKey="person" sort={sort} onSort={toggleSort} />
              <SortHead label="Type" sortKey="type" sort={sort} onSort={toggleSort} />
              <SortHead label="Residence" sortKey="residence" sort={sort} onSort={toggleSort} />
              <SortHead label="Assigned" sortKey="assigned" sort={sort} onSort={toggleSort} />
              <SortHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
              <span>Linked to</span>
            </div>
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : sorted.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No appointments match these filters.
              </p>
            ) : (
              sorted.map((a) => {
                const type = typeBySlug.get(a.type_slug);
                const residence = (a.residence_names ?? []).length
                  ? (a.residence_names as string[]).join(", ")
                  : a.residence_name || "—";
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(a)}
                    onKeyDown={(e) => e.key === "Enter" && openEdit(a)}
                    style={gridCols}
                    className="grid cursor-pointer items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-muted/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {new Date(a.starts_at).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Asia/Kuala_Lumpur",
                        })}{" "}
                        · {formatSlot(a.starts_at)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.duration_minutes} min
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{a.full_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>
                    </div>
                    <p className="flex items-center gap-1.5 text-foreground">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: type?.color || "#64748b" }}
                      />
                      {type?.name ?? a.type_slug}
                    </p>
                    <p className="truncate text-muted-foreground">{residence}</p>
                    <p className="text-muted-foreground">{a.assigned_staff || "—"}</p>
                    <p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          STATUS_PILL[a.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </p>
                    <p className="truncate text-xs">{linkedLabel(a)}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <CalendarView
          month={month}
          onMonth={setMonth}
          appointments={filtered}
          typeBySlug={typeBySlug}
          onSelect={openEdit}
        />
      )}

      {/* Appointment details */}
      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {form ? (
            <>
              <DialogHeader className="space-y-1">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {form.id ? (form.full_name || "Appointment Details") : "New Appointment"}
                  {form.id ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        STATUS_PILL[form.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[form.status] ?? form.status}
                    </span>
                  ) : null}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {typeBySlug.get(form.type_slug)?.name ?? "Appointment"}
                  {" ("}
                  {form.mode === "virtual" ? "Virtual" : "In Person"}
                  {")"}
                </p>
              </DialogHeader>

              {(() => {
                const linkedBooking = form.enquiry_id
                  ? enquiryById.get(form.enquiry_id)
                  : null;
                const readOnly = Boolean(linkedBooking);
                const startIso = new Date(`${form.date}T${form.time}:00+08:00`).toISOString();
                const initials = (form.full_name || "?")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("");

                return (
                  <div className="space-y-4 text-sm">
                    {/* Appointment card */}
                    <section className="overflow-hidden rounded-xl border border-border">
                      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Appointment
                      </header>
                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Date &amp; Time
                            </p>
                            <p className="text-foreground">
                              {longDate(startIso)} · {formatSlot(startIso)} –{" "}
                              {formatSlot(
                                endISO({
                                  starts_at: startIso,
                                  duration_minutes: Number(form.duration_minutes) || 30,
                                }),
                              )}{" "}
                              <span className="text-muted-foreground">
                                ({Number(form.duration_minutes) || 30} min)
                              </span>
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRescheduling((v) => !v)}
                          >
                            <CalendarDays className="mr-1.5 h-4 w-4" />
                            {rescheduling ? "Close" : "Reschedule"}
                          </Button>
                        </div>

                        {rescheduling ? (
                          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                            <DayPicker
                              mode="single"
                              selected={new Date(`${form.date}T00:00:00`)}
                              onSelect={(d) =>
                                d && setField("date", d.toLocaleDateString("en-CA"))
                              }
                              className="pointer-events-auto rounded-md border border-border bg-background p-2"
                            />
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Available times
                            </p>
                            {slotsLoading ? (
                              <p className="text-xs text-muted-foreground">Loading times…</p>
                            ) : slots.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No open slots for this date — set a custom time below.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {slots.map((iso) => {
                                  const hhmm = new Date(iso).toLocaleTimeString("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "Asia/Kuala_Lumpur",
                                  });
                                  const active = hhmm === form.time;
                                  return (
                                    <button
                                      key={iso}
                                      type="button"
                                      onClick={() => setField("time", hhmm)}
                                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        active
                                          ? "border-brand-deep bg-brand-tint text-brand-deep"
                                          : "border-input bg-background text-foreground hover:bg-muted"
                                      }`}
                                    >
                                      {formatSlot(iso)}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                                Custom time
                                <Input
                                  type="time"
                                  value={form.time}
                                  onChange={(e) => setField("time", e.target.value)}
                                />
                              </label>
                              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                                Duration (min)
                                <Input
                                  type="number"
                                  value={String(form.duration_minutes)}
                                  onChange={(e) =>
                                    setField("duration_minutes", Number(e.target.value))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <FileText className="h-3.5 w-3.5" /> Type
                            </span>
                            <select
                              className={`${selectClass} w-full`}
                              value={form.type_slug}
                              onChange={(e) => {
                                const t = typeBySlug.get(e.target.value);
                                setForm((p) =>
                                  p
                                    ? {
                                        ...p,
                                        type_slug: e.target.value,
                                        duration_minutes:
                                          t?.duration_minutes ?? p.duration_minutes,
                                      }
                                    : p,
                                );
                              }}
                            >
                              {types.map((t) => (
                                <option key={t.slug} value={t.slug}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <MessageCircle className="h-3.5 w-3.5" /> Mode
                            </span>
                            <select
                              className={`${selectClass} w-full`}
                              value={form.mode}
                              onChange={(e) => setField("mode", e.target.value)}
                            >
                              <option value="in_person">In person</option>
                              <option value="virtual">Virtual</option>
                            </select>
                          </label>

                          <div className="space-y-1 sm:col-span-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5" /> Residence
                            </span>
                            <div className="grid gap-1 rounded-md border border-input p-2">
                              {(residences as any[]).map((r) => (
                                <label
                                  key={r.slug}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <input
                                    type="checkbox"
                                    checked={form.residence_slugs.includes(r.slug)}
                                    onChange={(e) =>
                                      setField(
                                        "residence_slugs",
                                        e.target.checked
                                          ? [...form.residence_slugs, r.slug]
                                          : form.residence_slugs.filter((s) => s !== r.slug),
                                      )
                                    }
                                  />
                                  {r.name}
                                </label>
                              ))}
                            </div>
                          </div>

                          <label className="space-y-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <User className="h-3.5 w-3.5" /> Assigned Staff
                            </span>
                            <select
                              className={`${selectClass} w-full`}
                              value={form.assigned_staff}
                              onChange={(e) => setField("assigned_staff", e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {STAFF.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Flag className="h-3.5 w-3.5" /> Status
                            </span>
                            <select
                              className={`${selectClass} w-full`}
                              value={form.status}
                              onChange={(e) => setField("status", e.target.value)}
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="space-y-1 sm:col-span-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Link2 className="h-3.5 w-3.5" /> Linked To
                            </span>
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                              <span className="text-foreground">
                                {linkedBooking ? (
                                  <Link
                                    to="/admin/bookings/$id"
                                    params={{ id: form.enquiry_id }}
                                    className="font-semibold text-brand-deep hover:underline"
                                  >
                                    Booking · {linkedBooking.reference}
                                  </Link>
                                ) : form.resident_id ? (
                                  <Link
                                    to="/admin/residents/$id"
                                    params={{ id: form.resident_id }}
                                    className="font-semibold text-brand-deep hover:underline"
                                  >
                                    Resident · {form.resident_id}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">Not linked</span>
                                )}
                              </span>
                              <span className="flex gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setLinkEditing((v) => !v)}
                                  className="font-medium text-brand-deep underline underline-offset-2"
                                >
                                  {linkEditing
                                    ? "Close"
                                    : form.enquiry_id || form.resident_id
                                      ? "Change"
                                      : "Link Booking / Resident"}
                                </button>
                                {form.enquiry_id || form.resident_id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setField("enquiry_id", "");
                                      setField("resident_id", "");
                                    }}
                                    className="font-medium text-muted-foreground underline underline-offset-2"
                                  >
                                    Unlink
                                  </button>
                                ) : null}
                              </span>
                            </div>
                            {linkEditing ? (
                              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                                  Booking
                                  <select
                                    className={`${selectClass} w-full`}
                                    value={form.enquiry_id}
                                    onChange={(e) => {
                                      setField("enquiry_id", e.target.value);
                                      if (e.target.value) setField("resident_id", "");
                                    }}
                                  >
                                    <option value="">—</option>
                                    {(enquiries as any[]).map((e) => (
                                      <option key={e.id} value={e.id}>
                                        {e.reference} · {e.full_name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                                  Resident
                                  <select
                                    className={`${selectClass} w-full`}
                                    value={form.resident_id}
                                    onChange={(e) => {
                                      setField("resident_id", e.target.value);
                                      if (e.target.value) setField("enquiry_id", "");
                                    }}
                                  >
                                    <option value="">—</option>
                                    {ops.residents.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.id} · {r.fullName}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div
                          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                            readOnly
                              ? "bg-brand-tint text-brand-deep"
                              : "bg-sky-50 text-sky-800"
                          }`}
                        >
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {readOnly
                              ? "This appointment is linked to a booking. Person and stay details are pulled from the booking and are read-only here."
                              : "Unlinked appointment. Person and stay details can be edited here."}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Person */}
                    <section className="overflow-hidden rounded-xl border border-border">
                      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          Person
                        </span>
                        {readOnly ? (
                          <Link
                            to="/admin/bookings/$id"
                            params={{ id: form.enquiry_id }}
                            className="text-xs font-medium text-brand-deep underline underline-offset-2"
                          >
                            Edit in Booking
                          </Link>
                        ) : null}
                      </header>
                      <div className="space-y-4 p-4">
                        {readOnly ? (
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-deep">
                              {initials}
                            </span>
                            <p className="text-base font-semibold text-foreground">
                              {form.full_name || "—"}
                            </p>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Full Name">
                            {readOnly ? (
                              <ReadValue>{form.full_name}</ReadValue>
                            ) : (
                              <Input
                                value={form.full_name}
                                onChange={(e) => setField("full_name", e.target.value)}
                              />
                            )}
                          </Field>
                          <Field label="Mobile Number">
                            {readOnly ? (
                              <ReadValue icon={<Phone className="h-3.5 w-3.5" />}>
                                {formatPhone(form.phone)}
                              </ReadValue>
                            ) : (
                              <Input
                                placeholder="+60 12 345 6789"
                                value={form.phone}
                                onChange={(e) => setField("phone", e.target.value)}
                              />
                            )}
                          </Field>
                          <Field label="Email">
                            {readOnly ? (
                              <ReadValue icon={<Mail className="h-3.5 w-3.5" />}>
                                {form.email}
                              </ReadValue>
                            ) : (
                              <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => setField("email", e.target.value)}
                              />
                            )}
                          </Field>
                          <Field label="University">
                            {readOnly ? (
                              <ReadValue icon={<GraduationCap className="h-3.5 w-3.5" />}>
                                {form.university}
                              </ReadValue>
                            ) : (
                              <select
                                className={`${selectClass} w-full`}
                                value={form.university}
                                onChange={(e) => setField("university", e.target.value)}
                              >
                                <option value="">—</option>
                                {UNIVERSITIES.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            )}
                          </Field>
                          <Field label="Nationality">
                            {readOnly ? (
                              <ReadValue>{form.nationality}</ReadValue>
                            ) : (
                              <Input
                                value={form.nationality}
                                onChange={(e) => setField("nationality", e.target.value)}
                              />
                            )}
                          </Field>
                          <Field label="Intake">
                            {readOnly ? (
                              <ReadValue>{form.intake}</ReadValue>
                            ) : (
                              <Input
                                placeholder="e.g. September 2026"
                                value={form.intake}
                                onChange={(e) => setField("intake", e.target.value)}
                              />
                            )}
                          </Field>
                          <Field label="Gender">
                            {readOnly ? (
                              <ReadValue>{form.gender}</ReadValue>
                            ) : (
                              <select
                                className={`${selectClass} w-full`}
                                value={form.gender}
                                onChange={(e) => setField("gender", e.target.value)}
                              >
                                <option value="">—</option>
                                {GENDERS.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            )}
                          </Field>
                        </div>
                      </div>
                    </section>

                    {/* Enquiry source */}
                    <section className="overflow-hidden rounded-xl border border-border">
                      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Enquiry Details
                      </header>
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        <Field label="Already submitted an availability enquiry?">
                          {readOnly ? (
                            <ReadValue>
                              {ENQUIRY_STATUS.find((s) => s.value === form.enquiry_status)?.label ??
                                form.enquiry_status}
                            </ReadValue>
                          ) : (
                            <select
                              className={`${selectClass} w-full`}
                              value={form.enquiry_status}
                              onChange={(e) => setField("enquiry_status", e.target.value)}
                            >
                              <option value="">—</option>
                              {ENQUIRY_STATUS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="How did you hear about us?">
                          {readOnly ? (
                            <ReadValue>
                              {[form.heard_about, form.heard_about_other]
                                .filter(Boolean)
                                .join(" — ")}
                            </ReadValue>
                          ) : (
                            <select
                              className={`${selectClass} w-full`}
                              value={form.heard_about}
                              onChange={(e) => setField("heard_about", e.target.value)}
                            >
                              <option value="">—</option>
                              {HEARD_ABOUT.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        {!readOnly && form.heard_about === "Other" ? (
                          <Field label="Tell us more">
                            <Input
                              value={form.heard_about_other}
                              onChange={(e) => setField("heard_about_other", e.target.value)}
                            />
                          </Field>
                        ) : null}
                      </div>
                    </section>

                    {/* Stay requirements */}
                    <section className="overflow-hidden rounded-xl border border-border">
                      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
                        <span className="flex items-center gap-2">
                          <Luggage className="h-4 w-4 text-muted-foreground" />
                          Stay Requirements
                        </span>
                        {readOnly ? (
                          <Link
                            to="/admin/bookings/$id"
                            params={{ id: form.enquiry_id }}
                            className="text-xs font-medium text-brand-deep underline underline-offset-2"
                          >
                            View in Booking
                          </Link>
                        ) : null}
                      </header>
                      <div className="grid gap-3 p-4 sm:grid-cols-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Move-in</p>
                          {readOnly ? (
                            <p className="rounded-md bg-muted/50 px-3 py-2 text-foreground">
                              {form.move_in ? longDate(`${form.move_in}T00:00:00+08:00`) : "—"}
                            </p>
                          ) : (
                            <Input
                              type="date"
                              value={form.move_in}
                              onChange={(e) => setField("move_in", e.target.value)}
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Move-out</p>
                          {readOnly ? (
                            <p className="rounded-md bg-muted/50 px-3 py-2 text-foreground">
                              {form.move_out ? longDate(`${form.move_out}T00:00:00+08:00`) : "—"}
                            </p>
                          ) : (
                            <Input
                              type="date"
                              value={form.move_out}
                              onChange={(e) => setField("move_out", e.target.value)}
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Sharing</p>
                          {readOnly ? (
                            <p className="rounded-md bg-muted/50 px-3 py-2 text-foreground">
                              {SHARING_LABEL[form.sharing_preference] ??
                                form.sharing_preference ??
                                "—"}
                            </p>
                          ) : (
                            <select
                              className={`${selectClass} w-full`}
                              value={form.sharing_preference}
                              onChange={(e) => setField("sharing_preference", e.target.value)}
                            >
                              <option value="">—</option>
                              {SHARING_PREFERENCES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {SHARING_LABEL[s.value] ?? s.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Notes */}
                    <section className="overflow-hidden rounded-xl border border-border">
                      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Notes
                      </header>
                      <div className="space-y-3 p-4">
                        <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                          Student notes
                          <Textarea
                            rows={2}
                            value={form.notes}
                            onChange={(e) => setField("notes", e.target.value)}
                          />
                        </label>
                        <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                          Internal notes
                          <Textarea
                            rows={2}
                            placeholder="Add an internal note…"
                            value={form.admin_notes}
                            onChange={(e) => setField("admin_notes", e.target.value)}
                          />
                        </label>
                      </div>
                    </section>

                    {form.history.length ? (
                      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p className="mb-1 font-semibold uppercase tracking-wide">History</p>
                        <ul className="space-y-0.5">
                          {form.history
                            .slice()
                            .reverse()
                            .map((h: any, i: number) => (
                              <li key={i}>
                                {longDate(h.at)} —{" "}
                                {h.kind === "rescheduled"
                                  ? `rescheduled from ${longDate(h.from)} ${formatSlot(
                                      h.from,
                                    )} to ${longDate(h.to)} ${formatSlot(h.to)}`
                                  : `status ${STATUS_LABEL[h.from] ?? h.from} → ${
                                      STATUS_LABEL[h.to] ?? h.to
                                    }`}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </>
          ) : null}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyInvite}>
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Copy Invite
              </Button>
              <Button size="sm" variant="outline" onClick={downloadIcs}>
                <CalendarDays className="mr-1.5 h-4 w-4" />
                Add to Calendar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {form?.id ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => submit({ status: "cancelled" })}
                  >
                    Cancel Appointment
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(form.id!)}>
                    Delete
                  </Button>
                </>
              ) : null}
              <Button size="sm" onClick={() => submit()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : form?.id ? "Save Changes" : "Create appointment"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarView({
  month,
  onMonth,
  appointments,
  typeBySlug,
  onSelect,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  appointments: any[];
  typeBySlug: Map<string, any>;
  onSelect: (a: any) => void;
}) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekday = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const byDay = new Map<string, any[]>();
  for (const a of appointments) {
    const key = localDate(a.starts_at);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
      return d.toLocaleDateString("en-CA");
    }),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-deep">
          {month.toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
        </p>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="min-h-24 bg-card p-1.5 align-top">
            {day ? (
              <>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {Number(day.slice(-2))}
                </p>
                <div className="space-y-1">
                  {(byDay.get(day) ?? []).map((a) => {
                    const type = typeBySlug.get(a.type_slug);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelect(a)}
                        className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium text-white"
                        style={{ backgroundColor: type?.color || "#64748b" }}
                        title={`${a.full_name} · ${type?.name ?? a.type_slug}`}
                      >
                        {formatSlot(a.starts_at)} {a.full_name}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
