import CountryCombobox from "@/components/site/CountryCombobox";
import { Label } from "@/components/ui/label";
import { countryByIso, type Country } from "@/data/countries";

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
      <select
        id={id}
        name={name}
        className={fieldClass}
        data-invalid={error ? "true" : undefined}
        {...(controlled
          ? { value, onChange: (e) => onChange(e.target.value) }
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
      </select>
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
        value={number ? `${countryByIso(dialIso)?.dial ?? "+60"} ${number}`.trim() : ""}
      />
    </div>
  );
}
