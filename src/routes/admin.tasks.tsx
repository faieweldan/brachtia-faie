import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckSquare, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { deleteTask, fmtDate, toggleTask, useOps } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/tasks")({
  component: TasksPage,
});

const TYPE_LABELS: Record<string, string> = {
  agreement: "Agreement",
  checkin: "Check-in",
  stamping: "Stamping",
  payment: "Payment",
  hold: "Hold",
};

function TasksPage() {
  const { tasks } = useOps();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(
    () =>
      tasks.filter((t) => {
        if (type && t.type !== type) return false;
        if (status && t.status !== status) return false;
        if (overdueOnly && !(t.status === "open" && t.dueDate && t.dueDate < today)) return false;
        return true;
      }),
    [tasks, type, status, overdueOnly, today],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Work the system generates for you — agreements to sign, check-ins to prepare, payments to chase.
        </p>
      </div>

      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="All"
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
            ]}
            placeholder="All"
          />
          <label className="flex items-end gap-2 pb-1 text-sm">
            <Checkbox checked={overdueOnly} onCheckedChange={(v) => setOverdueOnly(!!v)} />
            Overdue only
          </label>
        </div>
      </Panel>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          hint="Tasks appear automatically as you hold beds, generate agreements, schedule check-ins and raise invoices."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No tasks match these filters" />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((t) => {
            const overdue = t.status === "open" && t.dueDate && t.dueDate < today;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleTask(t.id)} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      t.status === "done" ? "text-muted-foreground line-through" : "text-brand-deep"
                    }`}
                  >
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {TYPE_LABELS[t.type] ?? t.type} · {t.refLabel} · due {fmtDate(t.dueDate)}
                  </p>
                </div>
                <StatusPill status={overdue ? "overdue" : t.status} label={overdue ? "Overdue" : undefined} />
                {t.link ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={t.link as never}>Open</Link>
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => deleteTask(t.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
