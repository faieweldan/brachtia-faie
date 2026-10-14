import type { ReactNode } from "react";
import { ArrowRight, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";

/*
 * A list's filters (Dani, 14 Oct 2026) - Collections drew them in its own page;
 * Payables needs the same. One set, so the two read and behave alike: a label
 * over each filter, a from -> to date box that reads day first, a search box,
 * and Reset only while something is narrowed.
 */

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
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
    </div>
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
