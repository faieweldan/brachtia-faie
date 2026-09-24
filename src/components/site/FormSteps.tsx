import { Check, type LucideIcon } from "lucide-react";

/**
 * Where you are in a form that comes in parts.
 *
 * One long page let a student reach the declaration before saying who they
 * were, and sign for a tenancy whose details were still blank. Broken into
 * steps, each one has to be finished before the next is offered - and the row
 * along the top answers the question a long form never does, which is how much
 * is left.
 *
 * Drawn as marks on a line rather than as boxes. Boxes of equal weight read as
 * three buttons; a line reads as a journey, which is what it is - and the line
 * between two marks is what carries the sense of one following the other.
 *
 * A step already finished can be gone back to. A typo in a legal name is worth
 * more than the tidiness of a one-way form.
 */

export type FormStep = { n: number; label: string; icon: LucideIcon };

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
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const done = s.n < furthest;
        const here = s.n === at;
        const reachable = s.n <= furthest;
        const Icon = s.icon;
        return (
          <li key={s.n} className="flex min-w-0 flex-1 items-start">
            <button
              type="button"
              disabled={!reachable}
              aria-current={here ? "step" : undefined}
              onClick={() => reachable && onGo(s.n)}
              className={`group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-1 py-1 text-center ${
                reachable ? "cursor-pointer" : "cursor-not-allowed"
              }`}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  here
                    ? "border-brand-deep bg-brand-deep text-primary-foreground"
                    : done
                      ? "border-brand bg-brand text-primary-foreground"
                      : "border-border bg-background text-muted-foreground group-hover:border-brand/40"
                }`}
              >
                {done ? <Check className="size-5" /> : <Icon className="size-5" />}
              </span>
              <span
                className={`text-xs leading-tight ${
                  here
                    ? "font-semibold text-brand-deep"
                    : reachable
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </button>
            {/* the line belongs between two marks, level with them, and is not
                a step of its own - so it sits outside the button and takes no
                click */}
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={`mt-5 h-0.5 w-6 shrink-0 rounded-full sm:w-10 ${
                  done ? "bg-brand" : "bg-border"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
