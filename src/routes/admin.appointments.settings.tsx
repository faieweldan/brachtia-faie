import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  listAppointments,
  saveAppointmentType,
  deleteAppointmentType,
  saveAvailabilityGrid,
  deleteCapacityGroup,
  saveBlockedDate,
  deleteBlockedDate,
} from "@/lib/admin.functions";
import { formatTime } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Route = createFileRoute("/admin/appointments/settings")({
  component: SettingsPage,
});

const DAYS = [
  { index: 1, label: "Monday" },
  { index: 2, label: "Tuesday" },
  { index: 3, label: "Wednesday" },
  { index: 4, label: "Thursday" },
  { index: 5, label: "Friday" },
  { index: 6, label: "Saturday" },
  { index: 0, label: "Sunday" },
];

const PALETTE = ["#0f5132", "#1f7a5a", "#b45309", "#7c3aed", "#0369a1", "#be123c"];

type Range = { start: string; end: string };
type Grid = Record<number, Range[]>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function emptyGrid(): Grid {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function gridFromRules(rules: any[], group: number): Grid {
  const grid = emptyGrid();
  for (const r of rules) {
    if ((r.capacity_group ?? 1) !== group) continue;
    grid[r.weekday as number]?.push({
      start: String(r.start_time).slice(0, 5),
      end: String(r.end_time).slice(0, 5),
    });
  }
  for (const day of Object.keys(grid))
    grid[Number(day)]!.sort((a, b) => a.start.localeCompare(b.start));
  return grid;
}

function AvailabilityGrid({
  grid,
  onChange,
}: {
  grid: Grid;
  onChange: (grid: Grid) => void;
}) {
  const update = (weekday: number, ranges: Range[]) => onChange({ ...grid, [weekday]: ranges });

  return (
    <div className="mt-4 divide-y divide-border">
      <div className="grid grid-cols-[110px_1fr] gap-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Day</span>
        <span>Available hours</span>
      </div>
      {DAYS.map((day) => {
        const ranges = grid[day.index] ?? [];
        return (
          <div key={day.index} className="grid grid-cols-[110px_1fr] items-center gap-3 py-2.5">
            <span className="text-sm text-foreground">{day.label}</span>
            <div className="flex flex-wrap items-center gap-2">
              {ranges.length === 0 ? (
                <span className="text-sm text-muted-foreground">Unavailable</span>
              ) : (
                ranges.map((range, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                    title={`${formatTime(range.start)} – ${formatTime(range.end)}`}
                  >
                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) =>
                        update(
                          day.index,
                          ranges.map((r, j) => (j === i ? { ...r, start: e.target.value } : r)),
                        )
                      }
                      className="bg-transparent text-xs outline-none"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) =>
                        update(
                          day.index,
                          ranges.map((r, j) => (j === i ? { ...r, end: e.target.value } : r)),
                        )
                      }
                      className="bg-transparent text-xs outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Remove hours"
                      onClick={() => update(day.index, ranges.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))
              )}
              <button
                type="button"
                onClick={() => update(day.index, [...ranges, { start: "09:00", end: "13:00" }])}
                className="text-xs font-medium text-brand-deep hover:underline"
              >
                + Add hours
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });

  const types = ((data as any)?.types ?? []) as any[];
  const rules = ((data as any)?.rules ?? []) as any[];
  const blocked = ((data as any)?.blocked ?? []) as any[];

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });

  const typeMut = useMutation({
    mutationFn: (input: { id?: string; values: Record<string, unknown> }) =>
      saveAppointmentType({ data: input }),
    onSuccess: refresh,
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
  const gridMut = useMutation({
    mutationFn: (input: {
      group: number;
      ranges: { weekday: number; start_time: string; end_time: string }[];
      validFrom?: string | null;
      validTo?: string | null;
    }) => saveAvailabilityGrid({ data: input }),
    onSuccess: () => {
      toast.success("Availability saved");
      refresh();
    },
    onError: () => toast.error("Could not save availability"),
  });
  const groupDel = useMutation({
    mutationFn: (group: number) => deleteCapacityGroup({ data: { group } }),
    onSuccess: () => {
      toast.success("Capacity removed");
      refresh();
    },
    onError: () => toast.error("Could not remove capacity"),
  });
  const blockAdd = useMutation({
    mutationFn: (input: {
      blockedOn: string;
      reason: string;
      startTime?: string | undefined;
      endTime?: string | undefined;
    }) => saveBlockedDate({ data: input }),

    onSuccess: () => {
      toast.success("Block added");
      refresh();
    },
    onError: () => toast.error("Could not add block"),
  });
  const blockDel = useMutation({
    mutationFn: (id: string) => deleteBlockedDate({ data: { id } }),
    onSuccess: refresh,
    onError: () => toast.error("Could not remove block"),
  });

  /* ---- availability + capacities ---- */
  const savedGroups = useMemo(() => {
    const set = new Set<number>([1]);
    for (const r of rules) set.add(r.capacity_group ?? 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [rules]);

  const [groups, setGroups] = useState<number[]>([1]);
  const [grids, setGrids] = useState<Record<number, Grid>>({ 1: emptyGrid() });
  const [dates, setDates] = useState<Record<number, { from: string; to: string }>>({});

  useEffect(() => {
    const next: Record<number, Grid> = {};
    const nextDates: Record<number, { from: string; to: string }> = {};
    for (const g of savedGroups) {
      next[g] = gridFromRules(rules, g);
      const rule = rules.find((r: any) => (r.capacity_group ?? 1) === g);
      nextDates[g] = {
        from: rule?.valid_from ? String(rule.valid_from).slice(0, 10) : "",
        to: rule?.valid_to ? String(rule.valid_to).slice(0, 10) : "",
      };
    }
    setGrids(next);
    setDates(nextDates);
    setGroups(savedGroups);
  }, [rules, savedGroups]);

  /* Drop extra capacities whose applicable period has passed. */
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    for (const g of savedGroups) {
      if (g === 1) continue;
      const rule = rules.find((r: any) => (r.capacity_group ?? 1) === g);
      const to = rule?.valid_to ? String(rule.valid_to).slice(0, 10) : "";
      if (to && to < today) groupDel.mutate(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, savedGroups]);

  const setGrid = (group: number, grid: Grid) => setGrids((prev) => ({ ...prev, [group]: grid }));

  const saveGroup = (group: number) => {
    const grid = grids[group] ?? emptyGrid();
    const ranges = Object.entries(grid).flatMap(([weekday, list]) =>
      list
        .filter((r) => r.start && r.end && r.start < r.end)
        .map((r) => ({ weekday: Number(weekday), start_time: r.start, end_time: r.end })),
    );
    const range = dates[group] ?? { from: "", to: "" };
    gridMut.mutate({
      group,
      ranges,
      validFrom: group === 1 ? null : range.from || null,
      validTo: group === 1 ? null : range.to || null,
    });
  };

  const addCapacity = () => {
    const next = Math.max(...groups) + 1;
    setGroups([...groups, next]);
    setGrids((prev) => ({ ...prev, [next]: emptyGrid() }));
  };

  const removeCapacity = (group: number) => {
    setGroups(groups.filter((g) => g !== group));
    setGrids((prev) => {
      const copy = { ...prev };
      delete copy[group];
      return copy;
    });
    if (savedGroups.includes(group)) groupDel.mutate(group);
  };

  /* ---- new type / new block ---- */
  const [newType, setNewType] = useState({ name: "", duration: "30" });
  const [blockOpen, setBlockOpen] = useState(false);
  const [newBlock, setNewBlock] = useState({
    date: "",
    allDay: true,
    from: "12:00",
    to: "14:00",
    reason: "",
  });

  return (
    <div className="space-y-6">
      {/* 1. Appointment types */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Appointment Types</h2>
        <p className="mt-1 text-xs italic text-muted-foreground">
          Manage appointment types and how long each appointment takes.
        </p>

        <div className="mt-4 divide-y divide-border">
          <div className="grid grid-cols-[1fr_140px_40px] gap-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Appointment type</span>
            <span>Duration (mins)</span>
            <span />
          </div>
          {types.map((t) => (
            <div key={t.id} className="grid grid-cols-[1fr_140px_40px] items-center gap-3 py-2">
              <Input
                defaultValue={t.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== t.name &&
                  typeMut.mutate({ id: t.id, values: { name: e.target.value.trim() } })
                }
              />
              <Input
                type="number"
                min={5}
                defaultValue={String(t.duration_minutes)}
                onBlur={(e) =>
                  Number(e.target.value) !== t.duration_minutes &&
                  typeMut.mutate({
                    id: t.id,
                    values: { duration_minutes: Number(e.target.value) || 30 },
                  })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove appointment type"
                onClick={() => typeDel.mutate(t.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3 py-2">
            <Input
              placeholder="New appointment type"
              value={newType.name}
              onChange={(e) => setNewType({ ...newType, name: e.target.value })}
            />
            <Input
              type="number"
              min={5}
              value={newType.duration}
              onChange={(e) => setNewType({ ...newType, duration: e.target.value })}
            />
            <span />
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => {
            if (!newType.name.trim()) return;
            typeMut.mutate({
              values: {
                slug: slugify(newType.name),
                name: newType.name.trim(),
                duration_minutes: Number(newType.duration) || 30,
                color: PALETTE[types.length % PALETTE.length],
                sort_order: types.length,
              },
            });
            setNewType({ name: "", duration: "30" });
          }}
        >
          <Plus className="mr-1 size-4" />
          Add Appointment Type
        </Button>
      </section>

      {/* 2. Weekly availability */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Weekly Availability</h2>
        <p className="mt-1 text-xs italic text-muted-foreground">
          Set the standard days and times appointments can be scheduled. Add more than one range a
          day to exclude breaks such as lunch.
        </p>
        <AvailabilityGrid grid={grids[1] ?? emptyGrid()} onChange={(g) => setGrid(1, g)} />
        <Button size="sm" className="mt-4" onClick={() => saveGroup(1)}>
          Save Availability
        </Button>
      </section>

      {/* 3. Booking capacity */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Booking Capacity</h2>
        <p className="mt-1 text-xs italic text-muted-foreground">
          Add capacity when more than one appointment can take place at the same time.
        </p>

        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">Capacity 1 — Primary</p>
          <p className="text-xs text-muted-foreground">Uses the standard Weekly Availability.</p>
        </div>

        {groups
          .filter((g) => g > 1)
          .map((group, i) => (
            <div key={group} className="mt-4 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Capacity {i + 2}</p>
                <Button size="sm" variant="ghost" onClick={() => removeCapacity(group)}>
                  Remove
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Applies from
                  </label>
                  <Input
                    type="date"
                    className="mt-1 h-9 w-[160px]"
                    value={dates[group]?.from ?? ""}
                    onChange={(e) =>
                      setDates((prev) => ({
                        ...prev,
                        [group]: { from: e.target.value, to: prev[group]?.to ?? "" },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Until
                  </label>
                  <Input
                    type="date"
                    className="mt-1 h-9 w-[160px]"
                    value={dates[group]?.to ?? ""}
                    onChange={(e) =>
                      setDates((prev) => ({
                        ...prev,
                        [group]: { from: prev[group]?.from ?? "", to: e.target.value },
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to apply with no end date. Removed automatically once the end date has
                  passed.
                </p>
              </div>
              <AvailabilityGrid
                grid={grids[group] ?? emptyGrid()}
                onChange={(g) => setGrid(group, g)}
              />
              <Button size="sm" className="mt-3" onClick={() => saveGroup(group)}>
                Save Capacity {i + 2}
              </Button>
            </div>
          ))}

        <Button size="sm" variant="outline" className="mt-4" onClick={addCapacity}>
          <Plus className="mr-1 size-4" />
          Add Capacity
        </Button>
      </section>

      {/* 4. Blocked dates & times */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Blocked Dates &amp; Times</h2>
        <p className="mt-1 text-xs italic text-muted-foreground">
          Block appointments for a full day or a specific time period.
        </p>

        {blockOpen ? (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-foreground">Date</label>
              <Input
                type="date"
                className="w-44"
                value={newBlock.date}
                onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="radio"
                  checked={newBlock.allDay}
                  onChange={() => setNewBlock({ ...newBlock, allDay: true })}
                />
                Entire day
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="radio"
                  checked={!newBlock.allDay}
                  onChange={() => setNewBlock({ ...newBlock, allDay: false })}
                />
                Specific time
              </label>
            </div>
            {!newBlock.allDay ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">From</span>
                <Input
                  type="time"
                  className="w-32"
                  value={newBlock.from}
                  onChange={(e) => setNewBlock({ ...newBlock, from: e.target.value })}
                />
                <span className="text-sm text-foreground">To</span>
                <Input
                  type="time"
                  className="w-32"
                  value={newBlock.to}
                  onChange={(e) => setNewBlock({ ...newBlock, to: e.target.value })}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Reason (optional)"
                className="w-64"
                value={newBlock.reason}
                onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!newBlock.date) return;
                  blockAdd.mutate({
                    blockedOn: newBlock.date,
                    reason: newBlock.reason,
                    startTime: newBlock.allDay ? undefined : newBlock.from,
                    endTime: newBlock.allDay ? undefined : newBlock.to,
                  });
                  setNewBlock({
                    date: "",
                    allDay: true,
                    from: "12:00",
                    to: "14:00",
                    reason: "",
                  });
                  setBlockOpen(false);
                }}
              >
                Add block
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBlockOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setBlockOpen(true)}>
            <Plus className="mr-1 size-4" />
            Block Date or Time
          </Button>
        )}

        <div className="mt-5 divide-y divide-border">
          <div className="grid grid-cols-[150px_1fr_1fr_40px] gap-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Date</span>
            <span>Blocked</span>
            <span>Reason</span>
            <span />
          </div>
          {blocked.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No blocked dates.</p>
          ) : (
            blocked.map((b) => (
              <div
                key={b.id}
                className="grid grid-cols-[150px_1fr_1fr_40px] items-center gap-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {new Date(`${b.blocked_on}T00:00:00`).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="text-muted-foreground">
                  {b.start_time && b.end_time
                    ? `${formatTime(String(b.start_time).slice(0, 5))} – ${formatTime(String(b.end_time).slice(0, 5))}`
                    : "All day"}
                </span>
                <span className="text-muted-foreground">{b.reason || "—"}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove block"
                  onClick={() => blockDel.mutate(b.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          Available slots are calculated from Weekly Availability plus any additional capacity,
          minus existing appointments and blocked times. The appointment type&apos;s duration
          decides how much time each booking occupies.
        </p>
      </section>
    </div>
  );
}
