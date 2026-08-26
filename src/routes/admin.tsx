import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Globe, Inbox, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin | Brachtia Homes" },
      { name: "description", content: "Brachtia Homes staff portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});


const NAV: { to: string; label: string; icon: typeof Inbox; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/appointments", label: "Appointment Manager", icon: CalendarDays },
  { to: "/admin/bookings", label: "Bookings", icon: Inbox },
  { to: "/admin/website", label: "Website", icon: Globe },
];



function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });


  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <p className="px-2 text-sm font-bold text-brand-deep">Brachtia Admin</p>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-tint text-brand-deep"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>


      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
