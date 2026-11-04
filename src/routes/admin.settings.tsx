import { createFileRoute } from "@tanstack/react-router";

import { SettingsHeader } from "@/components/admin/SettingsTabs";
import { StaffTab } from "@/components/admin/StaffTab";
import { TemplatesTab } from "@/components/admin/TemplatesTab";

export const Route = createFileRoute("/admin/settings")({
  // the tab lives in the link, so Back and a shared link land on the same tab
  // "signatory" was the tab's name before Settings → Staff (4 Nov 2026) - an old link still lands on it
  validateSearch: (search: Record<string, unknown>): { tab?: "templates" | "staff" } =>
    search["tab"] === "staff" || search["tab"] === "signatory" ? { tab: "staff" } : search["tab"] === "templates" ? { tab: "templates" } : {},
  head: () => ({
    meta: [
      { title: "Settings — Brachtia Admin" },
      { name: "description", content: "Portal settings and document templates." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const tab = Route.useSearch().tab ?? "templates";
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SettingsHeader active={tab} />
      {tab === "templates" ? <TemplatesTab /> : <StaffTab />}
    </div>
  );
}
