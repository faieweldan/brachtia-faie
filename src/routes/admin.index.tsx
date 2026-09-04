import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Inbox } from "lucide-react";

import { adminOverview } from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { useOps } from "@/lib/ops-store";

const TASK_LABEL: Record<string, string> = {
  agreement: "Agreements",
  checkin: "Check-ins",
  stamping: "Stamping",
  payment: "Payments",
  hold: "Room holds",
};

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminOverview(),
  });
  const ops = useOps();
  const openTasks = ops.tasks.filter((t) => t.status === "open");
  const byType = openTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Today at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/bookings"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand/40"
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Inbox className="size-4" /> Open enquiries
          </p>
          <p className="mt-2 text-3xl font-bold text-brand-deep">
            {isLoading ? "—" : ((data as any)?.newEnquiries ?? 0)}
          </p>
        </Link>
        <Link
          to="/admin/appointments"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand/40"
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" /> Pending appointments
          </p>
          <p className="mt-2 text-3xl font-bold text-brand-deep">
            {isLoading ? "—" : ((data as any)?.pendingAppointments ?? 0)}
          </p>
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Next appointments</h2>
        <div className="mt-3 divide-y divide-border text-sm">
          {((data as any)?.upcoming ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nothing scheduled yet.</p>
          ) : (
            ((data as any)?.upcoming ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{a.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.residence_name} · {a.mode === "virtual" ? "Virtual" : "In person"}
                  </p>
                </div>
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(a.starts_at).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatSlot(a.starts_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
