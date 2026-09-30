import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { SignatoryTab } from "@/components/admin/SignatoryTab";
import { TemplatesTab } from "@/components/admin/TemplatesTab";

const TABS = [
  { key: "templates", label: "Templates" },
  { key: "signatory", label: "Signatory" },
] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("templates");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Settings</h1>
        <p className="text-sm text-muted-foreground">Portal-wide configuration.</p>
      </div>
      {/* the same underlined tabs as Residents */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-brand-deep text-brand-deep" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "templates" ? <TemplatesTab /> : <SignatoryTab />}
    </div>
  );
}
