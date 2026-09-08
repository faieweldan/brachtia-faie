import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/residents")({
  component: ResidentsLayout,
});

const SUB_TABS = [
  { to: "/admin/residents", label: "Residents", exact: true },
  
  { to: "/admin/residents/payments", label: "Payments & AR" },
];

function ResidentsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Residents</h1>
        <p className="text-sm text-muted-foreground">
          Student profiles, tenancy agreements, documents and payments.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to as never}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-deep text-brand-deep"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
