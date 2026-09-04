import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Globe, Inbox, LayoutDashboard, Lock } from "lucide-react";

import { isAdminUnlocked, lockAdmin } from "@/lib/admin-gate.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { unlocked } = await isAdminUnlocked();
    if (!unlocked) throw redirect({ to: "/admin-unlock" });
  },
  head: () => ({
    meta: [
      { title: "Admin | Brachtia Homes" },
      { name: "description", content: "Brachtia Homes staff portal." },
      { name: "robots", content: "noindex, nofollow" },
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
  const router = useRouter();

  async function handleLock() {
    await lockAdmin();
    await router.navigate({ to: "/admin-unlock", replace: true });
  }




  return (
    <div className="admin-ui flex min-h-screen bg-background">
      <aside className="admin-rail hidden w-60 shrink-0 flex-col p-4 text-white/70 md:flex">
        <p className="px-2 text-sm font-bold text-white">Brachtia Admin</p>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-admin-emerald text-[#0B3A2E]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}

              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={handleLock}
          className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/8 hover:text-white"
        >
          <Lock className="size-4" />
          Lock portal
        </button>
      </aside>



      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-rail flex items-center gap-2 overflow-x-auto px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
