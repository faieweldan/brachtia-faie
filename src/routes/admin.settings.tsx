import { createFileRoute } from "@tanstack/react-router";

import { SettingsHeader } from "@/components/admin/SettingsTabs";
import { SignatoryTab } from "@/components/admin/SignatoryTab";
import { TemplatesTab } from "@/components/admin/TemplatesTab";

export const Route = createFileRoute("/admin/settings")({
  // the tab lives in the link, so Back and a shared link land on the same tab
  validateSearch: (search: Record<string, unknown>): { tab?: "templates" | "signatory" } =>
    search["tab"] === "signatory" ? { tab: "signatory" } : search["tab"] === "templates" ? { tab: "templates" } : {},
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
      {tab === "templates" ? <TemplatesTab /> : <SignatoryTab />}
    </div>
  );
}
