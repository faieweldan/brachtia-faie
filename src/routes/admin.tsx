import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CheckSquare,
  Globe,
  Inbox,
  LayoutDashboard,
  Lock,
  Settings,
  Users,
} from "lucide-react";

import { isAdminUnlocked, lockAdmin } from "@/lib/admin-gate.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    // The gate check is a network call; a transient failure must not blank the screen.
    let unlocked = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        unlocked = (await isAdminUnlocked()).unlocked;
        break;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
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
  { to: "/admin/bookings", label: "Bookings", icon: Inbox },
  { to: "/admin/homes", label: "Homes", icon: Building2 },
  { to: "/admin/residents", label: "Residents", icon: Users },
  { to: "/admin/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/admin/appointments", label: "Appointment Manager", icon: CalendarDays },
  { to: "/admin/website", label: "Website", icon: Globe },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  async function handleLock() {
    await lockAdmin();
    await router.navigate({ to: "/admin-unlock", replace: true });
  }

  return (
    <div className="admin-ui flex h-screen overflow-hidden bg-background">
      {/* fixed rail: the shell is exactly one screen tall, so the nav cannot
          scroll away - only the pane on the right moves */}
      <aside className="admin-rail hidden h-full w-60 shrink-0 flex-col overflow-y-auto p-4 text-white/70 md:flex">
        <p className="px-2 text-sm font-bold text-white">Brachtia Admin</p>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                data-active={active}
                className="admin-nav-item flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium"
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="admin-rail flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                data-active={active}
                className="admin-nav-item whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium"
              >
                {item.label}
              </Link>
            );
          })}
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
