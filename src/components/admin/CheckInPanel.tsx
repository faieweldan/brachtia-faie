import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, ClipboardCheck, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { getCheckInContext, setCheckInTask } from "@/lib/admin.functions";
import { CHECKIN_TASKS } from "@/lib/checkin-tasks";

const day = (iso: string) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });

/**
 * The part of an appointment window only a check-in has: who is arriving,
 * where they are going, and what has to be done before they walk away with
 * keys.
 *
 * Looked up fresh each time the window opens rather than copied onto the
 * appointment, because a bed or a tenancy can change after the slot was asked
 * for, and staff must see where the student is going now.
 */
export function CheckInPanel({ appointmentId }: { appointmentId: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "checkin", appointmentId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getCheckInContext({ data: { appointmentId } }),
  });
  const [saving, setSaving] = useState("");

  async function toggle(taskKey: string, done: boolean) {
    setSaving(taskKey);
    try {
      const res = await setCheckInTask({ data: { appointmentId, key: taskKey, done } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      queryClient.setQueryData(key, (prev: any) => (prev ? { ...prev, tasks: res.tasks } : prev));
    } finally {
      setSaving("");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-border p-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading check-in details…
      </section>
    );
  }

  const doneCount = CHECKIN_TASKS.filter((t) => data.tasks[t.key]?.done).length;

  return (
    <>
      {/* who is arriving, and where to */}
      <section className="overflow-hidden rounded-xl border border-border">
        <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
          <BedDouble className="h-4 w-4 text-muted-foreground" />
          Resident &amp; room
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Resident</p>
            {data.resident ? (
              <Link
                to="/admin/residents/$id"
                params={{ id: data.resident.id }}
                className="mt-0.5 inline-flex items-center gap-1 text-base font-semibold text-brand-deep underline-offset-2 hover:underline"
              >
                {data.resident.name || "—"}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">Not linked to a resident</p>
            )}
            {data.resident?.code ? (
              <p className="text-xs text-muted-foreground">Resident ID {data.resident.code}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Room</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {data.place || "No bed held yet"}
            </p>
            {data.residenceName ? (
              <p className="text-xs text-muted-foreground">{data.residenceName}</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Tenancy</p>
            <p className="mt-0.5 text-sm text-foreground">
              {data.tenancy
                ? `${day(data.tenancy.start)} → ${day(data.tenancy.end)}`
                : "No tenancy on record yet"}
            </p>
          </div>
        </div>
      </section>

      {/* what has to be done before the keys go */}
      <section className="overflow-hidden rounded-xl border border-border">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            Check-in tasks
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {doneCount} of {CHECKIN_TASKS.length} done
          </span>
        </header>
        {!data.tasksReady ? (
          <p className="p-4 text-xs text-muted-foreground">
            The task list is waiting for a database update before it can be used.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {CHECKIN_TASKS.map((t) => {
              const state = data.tasks[t.key];
              const done = Boolean(state?.done);
              return (
                <li key={t.key}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                      checked={done}
                      disabled={saving === t.key}
                      onChange={(e) => void toggle(t.key, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
                      >
                        {t.label}
                      </span>
                      {state?.at ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {done ? "Done" : "Unticked"} by {state.by} · {stamp(state.at)}
                        </span>
                      ) : null}
                    </span>
                    {saving === t.key ? (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
