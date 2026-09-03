import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/appointments")({
  component: AppointmentsLayout,
});

const TABS = [
  { to: "/admin/appointments", label: "Appointments", exact: true },
  { to: "/admin/appointments/settings", label: "Settings", exact: false },
];

function AppointmentsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Appointment Manager</h1>
        <p className="text-sm text-muted-foreground">
          Viewings, check-ins and check-outs — scheduling and availability.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to as never}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-deep text-brand-deep"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
