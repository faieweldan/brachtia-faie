import { Link } from "@tanstack/react-router";

/*
 * The Settings header and its tabs, shared by Settings and the Website pages
 * (Dani, 6 Oct 2026): Website moved out of the sidebar into Settings, so its
 * pages show the same header and tabs, with Website underlined.
 */
export type SettingsTab = "templates" | "signatory" | "website";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "templates", label: "Templates" },
  { key: "signatory", label: "Signatory" },
  { key: "website", label: "Website" },
];

export function SettingsHeader({ active }: { active: SettingsTab }) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Settings</h1>
        <p className="text-sm text-muted-foreground">Portal-wide configuration and the content of the public site.</p>
      </div>
      {/* the same underlined tabs as Residents */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const cls = `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.key ? "border-brand-deep text-brand-deep" : "border-transparent text-muted-foreground hover:text-foreground"
          }`;
          return t.key === "website" ? (
            <Link key={t.key} to="/admin/website/residences" className={cls}>{t.label}</Link>
          ) : (
            <Link key={t.key} to="/admin/settings" search={{ tab: t.key }} className={cls}>{t.label}</Link>
          );
        })}
      </div>
    </>
  );
}
