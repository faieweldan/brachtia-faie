import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/website")({
  component: WebsiteLayout,
});

const SUB_TABS = [{ to: "/admin/website/residences", label: "Residences" }];

function WebsiteLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Website</h1>
        <p className="text-sm text-muted-foreground">
          Content shown on the public site.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map((tab) => {
          const active = pathname.startsWith(tab.to);
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
