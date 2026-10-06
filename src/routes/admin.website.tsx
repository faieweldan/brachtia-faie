import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsHeader } from "@/components/admin/SettingsTabs";

export const Route = createFileRoute("/admin/website")({
  component: WebsiteLayout,
});

// Website is a tab of Settings (Dani, 6 Oct 2026); its pages keep their own links
function WebsiteLayout() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SettingsHeader active="website" />
      <Outlet />
    </div>
  );
}
