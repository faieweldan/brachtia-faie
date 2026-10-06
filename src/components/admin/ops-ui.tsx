import { useRef, useState, type ReactNode } from "react";
import { Dropdown } from "@/components/admin/Dropdown";
import { Check, Eye, FileUp, Loader2, Pencil, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateInput, isoToDmy } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BedStatus } from "@/lib/ops-store";

/* ---------- status pill ---------- */

const STATUS_STYLES: Record<string, string> = {
  vacant: "bg-amber-100 text-amber-900 border-amber-200",
  held: "bg-sky-100 text-sky-900 border-sky-200",
  booked: "bg-violet-100 text-violet-900 border-violet-200",
  active: "bg-emerald-100 text-emerald-900 border-emerald-200",
  notice: "bg-rose-100 text-rose-900 border-rose-200",
  due: "bg-amber-100 text-amber-900 border-amber-200",
  paid: "bg-emerald-100 text-emerald-900 border-emerald-200",
  partial: "bg-sky-100 text-sky-900 border-sky-200",
  overdue: "bg-rose-100 text-rose-900 border-rose-200",
  open: "bg-sky-100 text-sky-900 border-sky-200",
  done: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

const STATUS_LABELS: Record<string, string> = {
  vacant: "Vacant",
  held: "Reserved",
  booked: "Booked",
  // the inventory statuses are Vacant, Reserved, Booked and Occupied - a bed
  // still marked "notice" is occupied too
  active: "Occupied",
  notice: "Occupied",
};

export function StatusPill({
  status,
  label,
}: {
  status: BedStatus | string;
  label?: string | undefined;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ---------- empty state ---------- */

export function EmptyState({
  title,
  hint,
  action,
  icon: Icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      {Icon ? <Icon className="size-6 text-muted-foreground" /> : null}
      <p className="text-sm font-semibold text-brand-deep">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------- panel ---------- */

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-brand-deep">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------- stage stepper ---------- */

export function StageStepper({
  stages,
  current,
}: {
  stages: { key: string; label: string }[];
  current: string;
}) {
  const index = Math.max(
    0,
    stages.findIndex((s) => s.key === current),
  );
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {stages.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li
            key={s.key}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              active
                ? "border-brand-deep bg-brand-deep text-white"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {done ? <Check className="size-3" /> : null}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- document row ---------- */

export function DocumentRow({
  label,
  fileName,
  uploadedAt,
  onUpload,
  onClear,
}: {
  label: string;
  fileName?: string | undefined;
  uploadedAt?: string | undefined;
  onUpload: (name: string) => void;
  onClear?: () => void;
}) {
  const id = `doc-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0">
      <FileUp className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {fileName
            ? `${fileName}${uploadedAt ? ` · ${new Date(uploadedAt).toLocaleDateString("en-MY")}` : ""}`
            : "Not uploaded"}
        </p>
      </div>
      <input
        id={id}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f.name);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-1">
        <Button asChild size="sm" variant="outline">
          <label htmlFor={id} className="cursor-pointer">
            <Upload className="mr-1 size-3.5" /> {fileName ? "Replace" : "Upload"}
          </label>
        </Button>
        {fileName && onClear ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One of a resident's documents, with the file behind it.
 *
 * Two buttons and no more: the eye opens what is there, Edit holds everything
 * that changes it. Replace and Remove used to sit side by side on every row,
 * and there was no way to look at the file at all.
 */
export function ResidentDocumentRow({
  label,
  fileName,
  uploadedAt,
  onPreview,
  onUpload,
  onRemove,
}: {
  label: string;
  fileName?: string | undefined;
  uploadedAt?: string | undefined;
  onPreview: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0">
      <FileUp className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {fileName
            ? `${fileName}${uploadedAt ? ` · ${new Date(uploadedAt).toLocaleDateString("en-GB")}` : ""}`
            : "Not uploaded"}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(() => onUpload(f));
        }}
      />
      <div className="flex items-center gap-1">
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!fileName || busy}
          aria-label={`Preview ${label}`}
          title="Preview"
          onClick={() => void run(onPreview)}
        >
          <Eye className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              <Pencil className="mr-1 size-3.5" /> Edit
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => input.current?.click()}>
              <Upload className="mr-2 size-3.5" /> {fileName ? "Replace" : "Upload"}
            </DropdownMenuItem>
            {fileName ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  if (window.confirm(`Remove ${label}? The file is deleted.`)) void run(onRemove);
                }}
              >
                Remove
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ---------- small form helpers ---------- */

/** A saved value shown as text. Same height and spacing as the input it replaces. */
export function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="flex h-9 items-center truncate text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/**
 * A field's label, with the one marker this project uses for "still needed".
 *
 * A dot, never an asterisk - the student's application form has marked required
 * fields this way since it was built, and the admin side was using both. Two
 * marks for one meaning is how somebody ends up wondering what the difference is.
 *
 * It shows only while the box is empty and clears as the field is filled in, so
 * what is left to do stays readable without reading every label.
 */
function FieldLabel({
  label,
  required = false,
  filled,
}: {
  label: string;
  required?: boolean;
  filled: boolean;
}) {
  return (
    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      {required && !filled ? (
        <span aria-hidden title="Still empty" className="size-1.5 rounded-full bg-brand" />
      ) : null}
    </Label>
  );
}

export function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly = false,
  display,
  autoFocus = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** what to show when read-only, if the raw value is not the friendly form */
  display?: string;
  /** the cursor starts here - for the one field a form was opened to fill in */
  autoFocus?: boolean;
  /** marks it with the dot until it has something in it */
  required?: boolean;
}) {
  // a date reads day first here too, typed or shown
  if (readOnly)
    return (
      <ReadOnlyField label={label} value={display ?? (type === "date" ? isoToDmy(value) : value)} />
    );
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} required={required} filled={!!value.trim()} />
      {type === "date" ? (
        <DateInput value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * A field with a list of suggestions that can still be typed into.
 *
 * Staff need the same vocabulary as the student form, but not the same walls.
 * A member of staff who cannot record a real university on a Tuesday afternoon
 * will put it in the remarks box, and it is lost. So the list is the easy path
 * and typing is the escape hatch.
 *
 * `normalise` runs when the field loses focus, so "heriot watt" becomes HWUM
 * without anyone being told off mid-word. Anything it does not recognise is
 * kept exactly as typed and marked, so it can be found later.
 */
export function Combo({
  label,
  value,
  onChange,
  options,
  placeholder,
  readOnly = false,
  normalise,
  display,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  readOnly?: boolean;
  normalise?: (v: string) => { value: string; matched: boolean };
  display?: string;
}) {
  const listId = `combo-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const known = options.some((o) => o.value === value);
  if (readOnly) {
    return <ReadOnlyField label={label} value={display ?? labelFor(options, value)} />;
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        list={listId}
        value={value}
        placeholder={placeholder ?? "Choose or type"}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (!normalise) return;
          const r = normalise(e.target.value);
          if (r.value !== e.target.value) onChange(r.value);
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>
      {value && !known ? (
        <p className="text-[11px] text-amber-600">Not in the standard list - saved as typed.</p>
      ) : null}
    </div>
  );
}

/** The friendly label for a stored code, or the code itself if it is not one. */
function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  readOnly = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  placeholder?: string;
  readOnly?: boolean;
  /** marks it with the dot until something is chosen */
  required?: boolean;
}) {
  if (readOnly) {
    const match = options.find((o) => (typeof o === "string" ? o : o.value) === value);
    const shown = match ? (typeof match === "string" ? match : match.label) : value;
    return <ReadOnlyField label={label} value={shown} />;
  }
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} required={required} filled={!!value} />
      <Dropdown
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value="">{placeholder}</option>
        {/*
          What is already on record, when it is not one of the choices - an older
          answer, or one typed before this became a list. Without it the box reads
          as empty and the next save quietly replaces a real answer with nothing.
        */}
        {value && !options.some((o) => (typeof o === "string" ? o : o.value) === value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </Dropdown>
    </div>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone || "text-brand-deep"}`}>{value}</p>
    </div>
  );
}
