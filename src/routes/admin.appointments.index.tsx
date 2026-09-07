import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  listAppointments,
  saveAppointment,
  deleteAppointment,
  listEnquiries,
  listResidenceOptions,
} from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ENQUIRY_STATUS,
  HEARD_ABOUT,
  SHARING_LABEL,
  SHARING_PREFERENCES,
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

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30";

function localDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function emptyForm() {
  const now = new Date();
  return {
    id: undefined as string | undefined,
    type_slug: "viewing-in-person",
    residence_slug: "",
    residence_slugs: [] as string[],
    move_in: "",
    move_out: "",
    sharing_preference: "",
    mode: "in_person",
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }),
    time: "10:00",
    duration_minutes: 30,
    status: "confirmed",
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
  };
}

type FormState = ReturnType<typeof emptyForm>;

function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [residenceFilter, setResidenceFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [form, setForm] = useState<FormState | null>(null);

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
        const day = localDate(a.starts_at);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [appointments, typeFilter, statusFilter, residenceFilter, from, to],
  );

  function openNew() {
    setForm(emptyForm());
  }

  function openEdit(a: any) {
    const d = new Date(a.starts_at);
    setForm({
      id: a.id,
      type_slug: a.type_slug ?? "viewing-in-person",
      residence_slug: a.residence_slug ?? "",
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
    });
  }

  function submit() {
    if (!form) return;
    if (!form.full_name.trim()) {
      toast.error("Add a name");
      return;
    }
    const slugs = form.residence_slugs.length
      ? form.residence_slugs
      : form.residence_slug
        ? [form.residence_slug]
        : [];
    const primarySlug = slugs[0] ?? "";
    const residence = (residences as any[]).find((r) => r.slug === primarySlug);
    const names = slugs.map(
      (s) => (residences as any[]).find((r) => r.slug === s)?.name ?? s,
    );
    const startsAt = new Date(`${form.date}T${form.time}:00+08:00`).toISOString();
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
        source: form.id ? undefined : "admin",
      },
    });
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

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
            <option key={s} value={s} className="capitalize">
              {s.replace("_", "-")}
            </option>
          ))}
        </select>

        {view === "list" ? (
          <>
            <input
              type="date"
              className={selectClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              className={selectClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        ) : null}

        <Button size="sm" className="ml-auto" onClick={openNew}>
          <Plus className="mr-1 size-4" />
          New appointment
        </Button>
      </div>

      {/* Type legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {types.map((t) => (
          <span key={t.slug} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: t.color || "#64748b" }}
            />
            {t.name} · {t.duration_minutes} min
          </span>
        ))}
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No appointments match these filters.</p>
          ) : (
            filtered.map((a) => {
              const type = typeBySlug.get(a.type_slug);
              return (
                <div
                  key={a.id}
                  className="grid gap-2 border-b border-border px-4 py-3 text-sm last:border-0 md:grid-cols-[1.1fr_1.3fr_0.8fr_auto] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium text-foreground">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: type?.color || "#64748b" }}
                      />
                      {a.full_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.email} · {a.phone}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="text-foreground">
                      {new Date(a.starts_at).toLocaleDateString("en-MY", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {formatSlot(a.starts_at)} · {a.duration_minutes} min
                    </p>
                    <p>
                      {type?.name ?? a.type_slug}
                      {a.residence_name ? ` · ${a.residence_name}` : ""}
                    </p>
                    {a.enquiry_id && enquiryById.get(a.enquiry_id) ? (
                      <p className="mt-1 inline-flex rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                        Enquiry {enquiryById.get(a.enquiry_id).reference} ·{" "}
                        {enquiryById.get(a.enquiry_id).full_name}
                      </p>
                    ) : null}
                  </div>
                  <select
                    value={a.status}
                    onChange={(e) =>
                      save.mutate({ id: a.id, values: { status: e.target.value } })
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", "-")}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
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

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit appointment" : "New appointment"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Type
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
                            duration_minutes: t?.duration_minutes ?? p.duration_minutes,
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
              <div className="space-y-1 text-xs font-medium text-muted-foreground">
                Residences
                <div className="grid gap-1 rounded-md border border-input p-2">
                  {(residences as any[]).map((r) => (
                    <label key={r.slug} className="flex items-center gap-2 text-sm text-foreground">
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
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Move-in date
                <Input
                  type="date"
                  value={form.move_in}
                  onChange={(e) => setField("move_in", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Move-out date
                <Input
                  type="date"
                  value={form.move_out}
                  onChange={(e) => setField("move_out", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Room sharing preference
                <select
                  className={`${selectClass} w-full`}
                  value={form.sharing_preference}
                  onChange={(e) => setField("sharing_preference", e.target.value)}
                >
                  <option value="">—</option>
                  {SHARING_PREFERENCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Date
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Time
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
                  onChange={(e) => setField("duration_minutes", Number(e.target.value))}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Mode
                <select
                  className={`${selectClass} w-full`}
                  value={form.mode}
                  onChange={(e) => setField("mode", e.target.value)}
                >
                  <option value="in_person">In person</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Status
                <select
                  className={`${selectClass} w-full`}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", "-")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Name
                <Input
                  value={form.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Email
                <Input value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Phone
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                University
                <Input
                  value={form.university}
                  onChange={(e) => setField("university", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Nationality
                <Input
                  value={form.nationality}
                  onChange={(e) => setField("nationality", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Intake
                <Input value={form.intake} onChange={(e) => setField("intake", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Gender
                <Input value={form.gender} onChange={(e) => setField("gender", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Already enquired?
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
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                How did you hear about us?
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
              </label>
              {form.heard_about === "Other" ? (
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Heard about us — details
                  <Input
                    value={form.heard_about_other}
                    onChange={(e) => setField("heard_about_other", e.target.value)}
                  />
                </label>
              ) : null}

              <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notes
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
                Internal notes
                <Textarea
                  rows={2}
                  value={form.admin_notes}
                  onChange={(e) => setField("admin_notes", e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            {form?.id ? (
              <Button variant="ghost" onClick={() => remove.mutate(form.id!)}>
                Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save appointment"}
            </Button>
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
