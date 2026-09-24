import { Check } from "lucide-react";

/**
 * Where you are in a form that comes in parts.
 *
 * One long page let a student reach the declaration before saying who they
 * were, and sign for a tenancy whose details were still blank. Broken into
 * steps, each one has to be finished before the next is offered - and the row
 * along the top answers the question a long form never does, which is how much
 * is left.
 *
 * A step already finished can be gone back to. A typo in a legal name is worth
 * more than the tidiness of a one-way form.
 */

export type FormStep = { n: number; label: string };

export function FormSteps({
  steps,
  at,
  furthest,
  onGo,
}: {
  steps: FormStep[];
  /** the step being shown */
  at: number;
  /** the deepest step reached - anything up to here can be returned to */
  furthest: number;
  onGo: (n: number) => void;
}) {
  return (
    <ol className="flex items-stretch gap-1 sm:gap-2">
      {steps.map((s, i) => {
        const done = s.n < furthest;
        const here = s.n === at;
        const reachable = s.n <= furthest;
        return (
          <li key={s.n} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              disabled={!reachable}
              aria-current={here ? "step" : undefined}
              onClick={() => reachable && onGo(s.n)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors sm:px-3 ${
                here
                  ? "bg-brand-deep text-primary-foreground"
                  : reachable
                    ? "bg-background text-foreground hover:bg-muted"
                    : "bg-background text-muted-foreground"
              } ${reachable && !here ? "cursor-pointer" : ""} ${reachable ? "" : "cursor-not-allowed"}`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  here
                    ? "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground"
                    : done
                      ? "border-brand-deep bg-brand-deep text-primary-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-3.5" /> : s.n}
              </span>
              {/* the name of the step is for the step you are on and the ones
                  you can go back to; on a phone only the current one has room */}
              <span className={`truncate text-xs font-medium ${here ? "" : "hidden sm:inline"}`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 ? (
              <span aria-hidden className="hidden h-px w-3 shrink-0 bg-border sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
