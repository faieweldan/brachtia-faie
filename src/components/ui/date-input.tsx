import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A date box that reads dd/mm/yyyy, whoever is looking at it.
 *
 * The browser's own date box draws itself in the order of the computer's
 * language setting, so a laptop set to US English showed mm/dd/yyyy on a
 * Malaysian site - 03/10 read as the tenth of March. This one always shows the
 * day first. The date can be typed (the slashes put themselves in) or picked
 * from a calendar, and days before `min` or after `max` cannot be chosen.
 *
 * The value in and out is still yyyy-mm-dd, the same string the browser's box
 * gave, and onChange hands back { target: { value } } like a change event - so
 * a date box can be swapped for this one without touching the code around it.
 */

type DateChange = { target: { value: string } };

export type DateInputProps = {
  /** yyyy-mm-dd, or "" for no date */
  value: string;
  onChange?: ((e: DateChange) => void) | undefined;
  /** when the box is left - forms use it to show what is wrong */
  onBlur?: (() => void) | undefined;
  /** earliest allowed day, yyyy-mm-dd */
  min?: string | undefined;
  /** latest allowed day, yyyy-mm-dd */
  max?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  autoFocus?: boolean | undefined;
  placeholder?: string | undefined;
  "aria-label"?: string | undefined;
  "data-invalid"?: boolean | "true" | "false" | undefined;
  /**
   * For a spot that styled a plain <input> itself: take only the className
   * given, not the standard input look on top of it.
   */
  bare?: boolean | undefined;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd -> dd/mm/yyyy */
export function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** dd/mm/yyyy -> yyyy-mm-dd, or "" when it is not a real day */
export function dmyToIso(dmy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // 31/02 rolls over into March - that is not the day that was typed
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return "";
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Digits typed, laid out as dd/mm/yyyy with the slashes in. */
function withSlashes(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const toLocalDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
const fromLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    value,
    onChange,
    min,
    max,
    id,
    name,
    className,
    disabled,
    readOnly,
    required,
    autoFocus,
    placeholder = "dd/mm/yyyy",
    bare,
    onBlur,
    ...aria
  },
  ref,
) {
  const [text, setText] = React.useState(isoToDmy(value));
  const [open, setOpen] = React.useState(false);

  // a date set from outside - a reset, a prefill - shows as it is
  React.useEffect(() => {
    setText(isoToDmy(value));
  }, [value]);

  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const commit = (iso: string) => onChange?.({ target: { value: iso } });

  const typedIso = dmyToIso(text);
  const badTyping = text.length === 10 && (!typedIso || outOfRange(typedIso));

  return (
    <div
      className={cn(
        bare
          ? ""
          : "flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring md:text-sm",
        "flex items-center gap-2",
        (disabled || readOnly) && "cursor-not-allowed opacity-50",
        className,
      )}
      data-invalid={aria["data-invalid"] ?? (badTyping ? "true" : undefined)}
    >
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={aria["aria-label"]}
        aria-invalid={badTyping || undefined}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onChange={(e) => {
          const next = withSlashes(e.target.value);
          setText(next);
          if (next === "") return commit("");
          const iso = dmyToIso(next);
          // only a whole, real, allowed day is passed on
          if (iso && !outOfRange(iso)) commit(iso);
        }}
        onBlur={() => {
          // a half-typed or refused date goes back to the one on record
          if (text && (!typedIso || outOfRange(typedIso))) setText(isoToDmy(value));
          onBlur?.();
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Choose from a calendar"
            disabled={disabled || readOnly}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
          >
            <CalendarDays className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={toLocalDate(value)}
            defaultMonth={toLocalDate(value) ?? toLocalDate(min ?? "") ?? new Date()}
            startMonth={new Date(new Date().getFullYear() - 100, 0)}
            endMonth={new Date(new Date().getFullYear() + 10, 11)}
            disabled={(day) => outOfRange(fromLocalDate(day))}
            onSelect={(day) => {
              if (!day) return;
              commit(fromLocalDate(day));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
});
