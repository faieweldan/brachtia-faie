import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-brand-deep">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
  type = "text",
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Input
        type={type}
        value={value === null || value === undefined ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  rows = 3,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Editable list of plain strings. */
export function StringList({
  label,
  items,
  onChange,
  placeholder,
  multiline = false,
  addLabel = "Add item",
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  addLabel?: string;
}) {
  const set = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing added yet.</p>
      ) : null}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              rows={2}
              value={item}
              placeholder={placeholder}
              onChange={(e) => set(i, e.target.value)}
            />
          ) : (
            <Input value={item} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          )}
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)}>
              <ChevronUp className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)}>
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, k) => k !== i))}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="mr-1 size-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

/** Editable list of objects rendered as a repeating row of fields. */
export function RowList<T>({
  label,
  items,
  columns,
  blank,
  onChange,
  addLabel = "Add row",
}: {
  label: string;
  items: T[];
  columns: { key: keyof T & string; label: string; width?: string }[];
  blank: () => T;
  onChange: (next: T[]) => void;
  addLabel?: string;
}) {
  const set = (i: number, key: string, v: string) => {
    const next = items.map((row, k) => (k === i ? { ...row, [key]: v } : row));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {items.map((row, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2">
          {columns.map((c) => (
            <label key={c.key} className={`min-w-[120px] flex-1 space-y-1 ${c.width ?? ""}`}>
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
              <Input
                value={String((row as Record<string, unknown>)[c.key] ?? "")}
                onChange={(e) => set(i, c.key, e.target.value)}
              />
            </label>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, blank()])}>
        <Plus className="mr-1 size-3.5" /> {addLabel}
      </Button>
    </div>
  );
}
