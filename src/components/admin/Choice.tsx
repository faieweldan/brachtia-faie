import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ReadOnlyField } from "@/components/admin/ops-ui";

/**
 * A dropdown the app draws itself.
 *
 * The plain <select> in ops-ui hands the list to the browser, which hands it to
 * the operating system - so the same field is a grey Mac sheet on one machine, a
 * Windows list on another, and a full-height wheel on a phone. None of them take
 * the admin styling, and none of them can be made to.
 *
 * This one is rendered inside the page, so it looks the same everywhere and
 * matches the rest of the admin UI. Same contract as ops-ui's Select - value,
 * onChange, options, readOnly - so a field can be moved across by swapping the
 * component name.
 */
export function Choice({
  label,
  value,
  // a read-only field has nothing to hand back, so it need not be given one
  onChange = () => {},
  options,
  placeholder = "Select",
  readOnly = false,
  className = "",
}: {
  label?: string;
  value: string;
  onChange?: (v: string) => void;
  options: (string | { value: string; label: string })[];
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const valueOf = (o: string | { value: string; label: string }) =>
    typeof o === "string" ? o : o.value;
  const labelOf = (o: string | { value: string; label: string }) =>
    typeof o === "string" ? o : o.label;

  if (readOnly) {
    const match = options.find((o) => valueOf(o) === value);
    return <ReadOnlyField label={label ?? ""} value={match ? labelOf(match) : value} />;
  }

  /*
   * What is already on record, when it is not one of the choices - an older
   * answer, or one written before this became a list. Without it the box reads
   * as empty and the next save quietly replaces a real answer with nothing.
   */
  const offList = value && !options.some((o) => valueOf(o) === value);

  return (
    <div className="space-y-1.5">
      {label ? <Label className="text-xs text-muted-foreground">{label}</Label> : null}
      <SelectRoot value={value} onValueChange={onChange}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {offList ? <SelectItem value={value}>{value}</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={valueOf(o)} value={valueOf(o)}>
              {labelOf(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}
