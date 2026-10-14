import type { ReactNode } from "react";

/**
 * A list's stages in one row, each with its count - click one to show only
 * those, click it again for all (Dani, 14 Oct 2026). Replaces boxes of
 * counts that could not be clicked and named stages of their own. The stages,
 * their names and colours are the caller's - the same list its table's pills
 * and stage filter read - so the strip and the rows cannot disagree.
 *
 * `alert`, when given, sits above the stages: what needs doing now.
 */
export type StripStage = { value: string; label: string; count: number; pill: string };

export function StageStrip({
  stages,
  value,
  onChange,
  alert,
}: {
  stages: StripStage[];
  /** the stage shown, or "all" */
  value: string;
  onChange: (value: string) => void;
  alert?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {alert ? <div className="border-b border-border">{alert}</div> : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
        {stages.map((s) => {
          const on = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? "all" : s.value)}
              className={`flex flex-col items-start gap-1 border-b border-r border-border px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/40 lg:border-b-0 ${
                on ? "bg-muted/60" : ""
              }`}
            >
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  s.count ? s.pill : "border-border bg-transparent text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
              <span className={`text-xl font-bold ${s.count ? "text-brand-deep" : "text-muted-foreground/60"}`}>
                {s.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
