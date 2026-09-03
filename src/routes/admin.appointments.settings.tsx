import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  listAppointments,
  listResidenceOptions,
  saveAppointmentType,
  deleteAppointmentType,
  saveAvailabilityRule,
  deleteAvailabilityRule,
  saveBlockedDate,
  deleteBlockedDate,
} from "@/lib/admin.functions";
import { buildSlots, formatSlot } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Route = createFileRoute("/admin/appointments/settings")({
  component: SettingsPage,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const { data: residences = [] } = useQuery({
    queryKey: ["admin", "residence-options"],
    queryFn: () => listResidenceOptions(),
  });

  const types = ((data as any)?.types ?? []) as any[];
  const rules = ((data as any)?.rules ?? []) as any[];
  const blocked = ((data as any)?.blocked ?? []) as any[];

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });

  const typeMut = useMutation({
    mutationFn: (input: { id?: string; values: Record<string, unknown> }) =>
      saveAppointmentType({ data: input }),
    onSuccess: () => {
      toast.success("Appointment type saved");
      refresh();
    },
    onError: () => toast.error("Could not save appointment type"),
  });
  const typeDel = useMutation({
    mutationFn: (id: string) => deleteAppointmentType({ data: { id } }),
    onSuccess: () => {
      toast.success("Appointment type removed");
      refresh();
    },
    onError: () => toast.error("Could not remove appointment type"),
  });
  const ruleMut = useMutation({
    mutationFn: (input: { id?: string; values: Record<string, unknown> }) =>
      saveAvailabilityRule({ data: input }),
    onSuccess: () => {
      toast.success("Availability saved");
      refresh();
    },
    onError: () => toast.error("Could not save availability"),
  });
  const ruleDel = useMutation({
    mutationFn: (id: string) => deleteAvailabilityRule({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule removed");
      refresh();
    },
    onError: () => toast.error("Could not remove rule"),
  });
  const blockAdd = useMutation({
    mutationFn: (input: { blockedOn: string; reason: string }) => saveBlockedDate({ data: input }),
    onSuccess: () => {
      toast.success("Date blocked");
      refresh();
    },
    onError: () => toast.error("Could not block date"),
  });
  const blockDel = useMutation({
    mutationFn: (id: string) => deleteBlockedDate({ data: { id } }),
    onSuccess: () => {
      toast.success("Block removed");
      refresh();
    },
    onError: () => toast.error("Could not remove block"),
  });

  const [newType, setNewType] = useState({ name: "", duration: 30, color: "#0f5132" });
  const [newBlock, setNewBlock] = useState({ date: "", reason: "" });
  const [previewType, setPreviewType] = useState("");
  const [previewDay, setPreviewDay] = useState(1);

  const activePreviewType = previewType || types[0]?.slug || "";
  const previewDuration =
    types.find((t) => t.slug === activePreviewType)?.duration_minutes ?? 30;

  const previewSlots = useMemo(() => {
    const applicable = rules.filter(
      (r) =>
        r.active &&
        r.weekday === previewDay &&
        (!r.type_slug || r.type_slug === activePreviewType),
    );
    // Preview on a far-future date so past-time filtering never hides slots.
    const d = new Date();
    d.setDate(d.getDate() + ((previewDay - d.getDay() + 7) % 7 || 7));
    const date = d.toLocaleDateString("en-CA");
    return buildSlots(date, applicable, [], previewDuration);
  }, [rules, previewDay, activePreviewType, previewDuration]);

  return (
    <div className="space-y-6">
      {/* Appointment types */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Appointment types</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Each type has its own duration and colour. Bookable online types appear on the website
          Book a Viewing page.
        </p>

        <div className="mt-4 space-y-2">
          {types.map((t) => (
            <div
              key={t.id}
              className="grid items-center gap-2 rounded-lg border border-border px-3 py-2 md:grid-cols-[1.4fr_auto_auto_auto_auto_auto]"
            >
              <Input
                defaultValue={t.name}
                onBlur={(e) =>
                  e.target.value !== t.name &&
                  typeMut.mutate({ id: t.id, values: { name: e.target.value } })
                }
              />
              <input
                type="color"
                defaultValue={t.color}
                onBlur={(e) => typeMut.mutate({ id: t.id, values: { color: e.target.value } })}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                title="Colour"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  className="w-20"
                  defaultValue={String(t.duration_minutes)}
                  onBlur={(e) =>
                    Number(e.target.value) !== t.duration_minutes &&
                    typeMut.mutate({
                      id: t.id,
                      values: { duration_minutes: Number(e.target.value) || 30 },
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  defaultChecked={t.bookable_online}
                  onChange={(e) =>
                    typeMut.mutate({ id: t.id, values: { bookable_online: e.target.checked } })
                  }
                />
                Online
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  defaultChecked={t.active}
                  onChange={(e) => typeMut.mutate({ id: t.id, values: { active: e.target.checked } })}
                />
                Active
              </label>
              <Button size="icon" variant="ghost" onClick={() => typeDel.mutate(t.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <Input
            placeholder="New type name"
            className="w-52"
            value={newType.name}
            onChange={(e) => setNewType({ ...newType, name: e.target.value })}
          />
          <input
            type="color"
            value={newType.color}
            onChange={(e) => setNewType({ ...newType, color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
          />
          <Input
            type="number"
            className="w-24"
            value={String(newType.duration)}
            onChange={(e) => setNewType({ ...newType, duration: Number(e.target.value) })}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newType.name.trim()) return;
              typeMut.mutate({
                values: {
                  slug: slugify(newType.name),
                  name: newType.name.trim(),
                  duration_minutes: newType.duration || 30,
                  color: newType.color,
                  sort_order: types.length,
                },
              });
              setNewType({ name: "", duration: 30, color: "#0f5132" });
            }}
          >
            <Plus className="mr-1 size-4" />
            Add type
          </Button>
        </div>
      </section>

      {/* Availability */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Daily availability</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Opening window per weekday. Slot interval and buffer control spacing; the appointment
          type&apos;s duration controls how long each booking runs.
        </p>

        <div className="mt-4 space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability configured yet.</p>
          ) : (
            rules.map((r) => (
              <div
                key={r.id}
                className="grid items-center gap-2 rounded-lg border border-border px-3 py-2 md:grid-cols-[auto_auto_auto_auto_auto_auto_1fr_auto_auto]"
              >
                <select
                  className={selectClass}
                  defaultValue={String(r.weekday)}
                  onChange={(e) =>
                    ruleMut.mutate({ id: r.id, values: { weekday: Number(e.target.value) } })
                  }
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <Input
                  type="time"
                  className="w-28"
                  defaultValue={String(r.start_time).slice(0, 5)}
                  onBlur={(e) => ruleMut.mutate({ id: r.id, values: { start_time: e.target.value } })}
                />
                <Input
                  type="time"
                  className="w-28"
                  defaultValue={String(r.end_time).slice(0, 5)}
                  onBlur={(e) => ruleMut.mutate({ id: r.id, values: { end_time: e.target.value } })}
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-20"
                    defaultValue={String(r.slot_minutes)}
                    onBlur={(e) =>
                      ruleMut.mutate({
                        id: r.id,
                        values: { slot_minutes: Number(e.target.value) || 30 },
                      })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">slot</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-20"
                    defaultValue={String(r.buffer_minutes ?? 0)}
                    onBlur={(e) =>
                      ruleMut.mutate({
                        id: r.id,
                        values: { buffer_minutes: Number(e.target.value) || 0 },
                      })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">buffer</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-16"
                    defaultValue={String(r.capacity)}
                    onBlur={(e) =>
                      ruleMut.mutate({ id: r.id, values: { capacity: Number(e.target.value) || 1 } })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">cap</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className={selectClass}
                    defaultValue={r.type_slug ?? ""}
                    onChange={(e) =>
                      ruleMut.mutate({ id: r.id, values: { type_slug: e.target.value } })
                    }
                  >
                    <option value="">All types</option>
                    {types.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    defaultValue={r.residence_id ?? ""}
                    onChange={(e) =>
                      ruleMut.mutate({
                        id: r.id,
                        values: { residence_id: e.target.value || null },
                      })
                    }
                  >
                    <option value="">All residences</option>
                    {(residences as any[]).map((res) => (
                      <option key={res.id} value={res.id}>
                        {res.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    defaultChecked={r.active}
                    onChange={(e) =>
                      ruleMut.mutate({ id: r.id, values: { active: e.target.checked } })
                    }
                  />
                  Active
                </label>
                <Button size="icon" variant="ghost" onClick={() => ruleDel.mutate(r.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={() =>
            ruleMut.mutate({
              values: {
                weekday: 1,
                start_time: "10:00",
                end_time: "18:00",
                slot_minutes: 30,
                buffer_minutes: 0,
                capacity: 1,
                mode: "any",
                type_slug: "",
                active: true,
              },
            })
          }
        >
          <Plus className="mr-1 size-4" />
          Add availability rule
        </Button>
      </section>

      {/* Slot preview */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Slot preview</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className={selectClass}
            value={activePreviewType}
            onChange={(e) => setPreviewType(e.target.value)}
          >
            {types.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} ({t.duration_minutes} min)
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={String(previewDay)}
            onChange={(e) => setPreviewDay(Number(e.target.value))}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {previewSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots for this combination.</p>
          ) : (
            previewSlots.map((s) => (
              <span
                key={s}
                className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-deep"
              >
                {formatSlot(s)}
              </span>
            ))
          )}
        </div>
      </section>

      {/* Blocked dates */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Blocked dates</h2>
        <div className="mt-3 space-y-2">
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blocked dates.</p>
          ) : (
            blocked.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-foreground">{b.blocked_on}</span>
                  {b.reason ? (
                    <span className="text-muted-foreground"> · {b.reason}</span>
                  ) : null}
                </span>
                <Button size="icon" variant="ghost" onClick={() => blockDel.mutate(b.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <Input
            type="date"
            className="w-44"
            value={newBlock.date}
            onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
          />
          <Input
            placeholder="Reason (optional)"
            className="w-56"
            value={newBlock.reason}
            onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newBlock.date) return;
              blockAdd.mutate({ blockedOn: newBlock.date, reason: newBlock.reason });
              setNewBlock({ date: "", reason: "" });
            }}
          >
            <Plus className="mr-1 size-4" />
            Block date
          </Button>
        </div>
      </section>
    </div>
  );
}
