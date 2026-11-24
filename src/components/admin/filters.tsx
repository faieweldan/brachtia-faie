import type { ReactNode } from "react";
import { ArrowRight, CalendarRange, ChevronDown, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";

/*
 * A list's filters (Dani, 14 Oct 2026) - Collections drew them in its own page;
 * Payables needs the same. One set, so the two read and behave alike: a label
 * over each filter, a from -> to date box that reads day first, a search box,
 * and Reset only while something is narrowed.
 */

export function FilterField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/**
 * A filter's label that is also its switch - "Due date ▾" over a date box picks
 * which date the box filters by, without a second control (Dani, 24 Nov 2026).
 */
export function LabelSwitch<K extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: K;
  options: readonly { key: K; label: string }[];
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <span className="relative inline-flex items-center gap-0.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as K)}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-3.5 text-xs font-medium text-muted-foreground underline decoration-dashed underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 size-3 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** from -> to, yyyy-mm-dd in and out; each end limits the other */
export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
      <DateInput
        bare
        value={from}
        max={to || undefined}
        onChange={(e) => onFrom(e.target.value)}
        aria-label="From date"
        className="h-full w-[8.25rem] bg-transparent px-2.5 text-sm outline-none"
      />
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <DateInput
        bare
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        aria-label="To date"
        className="h-full w-[8.25rem] bg-transparent px-2.5 text-sm outline-none"
      />
      <MonthPick from={from} onPick={(f, t) => (onFrom(f), onTo(t))} />
    </div>
  );
}

/**
 * A whole month in one click (Dani, 24 Nov 2026): the icon opens the browser's
 * month picker and fills the box with its first and last day. The box still
 * takes any range typed by hand. Take this out and the box works as before.
 */
function MonthPick({ from, onPick }: { from: string; onPick: (from: string, to: string) => void }) {
  return (
    <label className="relative mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
      <CalendarRange className="size-4" aria-hidden />
      <input
        type="month"
        aria-label="Pick a whole month"
        value={from.slice(0, 7)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        onChange={(e) => {
          const [y, m] = e.target.value.split("-").map(Number);
          if (!y || !m) return;
          const last = new Date(y, m, 0).getDate();
          const mm = String(m).padStart(2, "0");
          onPick(`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, "0")}`);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

export function SearchFilter({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** read by a screen reader */
  label: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-56 pl-9"
      />
    </div>
  );
}

export function ResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-9" onClick={onReset}>
      <RotateCcw className="size-4" /> Reset
    </Button>
  );
}

/**
 * Where the money stands, as tabs over a list (Collections: Due, Overdue,
 * Paid...; Payables: To pay, Paid out, All). Each tab shows its count, and
 * `note` (an amount) when given. A view, not a type - the type is a filter.
 */
export function StatusTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: string; count: number; note?: string | undefined; alignRight?: boolean | undefined }[];
  value: K;
  onChange: (key: K) => void;
  /** read by a screen reader: "Invoice status" */
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-border px-5">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-3 text-sm transition-colors ${
              t.alignRight ? "ml-auto" : ""
            } ${
              active
                ? "border-brand-deep font-semibold text-brand-deep"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${
                active ? "bg-brand-deep/10 text-brand-deep" : "bg-muted text-muted-foreground"
              }`}
            >
              {t.count}
            </span>
            {t.note ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{t.note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
