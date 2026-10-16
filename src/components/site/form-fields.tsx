import CountryCombobox from "@/components/site/CountryCombobox";
import { useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { items } from "@/components/admin/Dropdown";
import { cn } from "@/lib/utils";
import { countryByIso, type Country } from "@/data/countries";
import { joinPhone } from "@/lib/reference-data";

export const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40";

export function FieldError({ msg }: { msg?: string | undefined }) {
  if (!msg) return null;
  return <p className="text-xs font-medium text-destructive">{msg}</p>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/*
 * The site's own dropdown in place of a plain <select> (Dani, 16 Oct 2026): a
 * <select> opens the computer's grey list - a Mac sheet, a Windows box, a
 * phone wheel. This one is drawn in the page. Same props and <option> children
 * as a <select>, so a form moves across by changing the tag name; a hidden
 * input keeps the value in the form for FormData.
 */
export function SiteSelect({
  id,
  name,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  children,
  "data-invalid": invalid,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  className?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  children: ReactNode;
  "data-invalid"?: string | undefined;
  "aria-label"?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const v = value ?? own;
  const list = items(children);
  const placeholder = list.find((o) => o.value === "")?.label ?? "Select";
  return (
    <>
      <Select
        value={v}
        {...(disabled ? { disabled } : {})}
        onValueChange={(next) => {
          const out = next;
          if (value === undefined) setOwn(out);
          onChange?.({ target: { value: out } });
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          data-invalid={invalid}
          className={cn("h-11 rounded-xl text-left shadow-none", className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {list
            .filter((o) => o.value !== "")
            .map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {name ? <input type="hidden" name={name} value={v} /> : null}
    </>
  );
}

export function SelectField({
  id,
  name,
  label,
  options,
  placeholder = "Select",
  error,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
  error?: string | undefined;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const controlled = value !== undefined && onChange !== undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SiteSelect
        id={id}
        name={name}
        className={fieldClass}
        data-invalid={error ? "true" : undefined}
        {...(controlled
          ? { value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) }
          : { defaultValue: "" })}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </SiteSelect>
      <FieldError msg={error} />
    </div>
  );
}

export function PhoneField({
  id,
  name = "mobile",
  label = "Mobile / WhatsApp",
  dialIso,
  onDialChange,
  number,
  onNumberChange,
  error,
}: {
  id: string;
  name?: string;
  label?: string;
  dialIso: string;
  onDialChange: (iso: string) => void;
  number: string;
  onNumberChange: (v: string) => void;
  error?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div
        className={`flex h-11 items-stretch overflow-hidden rounded-xl border ${
          error ? "border-destructive" : "border-input"
        } bg-background focus-within:ring-2 focus-within:ring-brand/40`}
      >
        <CountryCombobox
          value={dialIso}
          variant="dial"
          ariaLabel="Country calling code"
          onChange={(c: Country) => onDialChange(c.iso)}
          className="h-full w-[5.5rem] shrink-0 gap-1 rounded-none border-0 border-r border-input bg-muted/40 px-2 text-sm focus:ring-0"
        />
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          placeholder="12 345 6789"
          maxLength={20}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          data-invalid={error ? "true" : undefined}
          value={number}
          onChange={(e) => onNumberChange(e.target.value.replace(/[^\d\s]/g, "").trimStart())}
        />
      </div>
      <FieldError msg={error} />
      <input
        type="hidden"
        name={name}
        value={number ? joinPhone(countryByIso(dialIso)?.dial ?? "+60", number) : ""}
      />
    </div>
  );
}
