import { createFileRoute } from "@tanstack/react-router";

import { TemplatesTab } from "@/components/admin/TemplatesTab";

export const Route = createFileRoute("/admin/settings")({
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
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Settings</h1>
        <p className="text-sm text-muted-foreground">Portal-wide configuration.</p>
      </div>
      <TemplatesTab />
    </div>
  );
}
