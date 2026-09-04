import type { ReactNode } from "react";
import { Check, FileUp, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  held: "Held",
  booked: "Booked",
  active: "Active",
  notice: "Notice",
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
  const index = Math.max(0, stages.findIndex((s) => s.key === current));
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

/* ---------- small form helpers ---------- */

export function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
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
