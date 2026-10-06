import { Children, isValidElement, type ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/*
 * The app's own dropdown in place of a plain <select> (Dani, 6 Oct 2026): a
 * <select> hands its list to the operating system - a grey Mac sheet, a Windows
 * list - which takes none of the admin styling. This one draws the list in the
 * page, like Choice.
 *
 * It takes the same props and the same <option> children as a <select>, so a
 * page moves across by changing the tag name and nothing else.
 */

type Item = { value: string; label: string; disabled: boolean };

// the list has no empty value of its own, so "" (Unassigned, —) travels as this
const EMPTY = "__empty__";

const text = (n: ReactNode): string =>
  n == null || typeof n === "boolean"
    ? ""
    : typeof n === "string" || typeof n === "number"
      ? String(n)
      : Array.isArray(n)
        ? n.map(text).join("")
        : isValidElement<{ children?: ReactNode }>(n)
          ? text(n.props.children)
          : "";

function items(children: ReactNode): Item[] {
  const out: Item[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c)) return;
    if (c.type === "option") {
      const label = text(c.props.children);
      out.push({ value: String(c.props.value ?? label), label, disabled: !!c.props.disabled });
    } else out.push(...items(c.props.children));
  });
  return out;
}

export function Dropdown({
  value,
  onChange,
  children,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const list = items(children);
  const v = String(value);
  return (
    <Select value={v === "" ? EMPTY : v} {...(disabled ? { disabled } : {})} onValueChange={(next) => onChange({ target: { value: next === EMPTY ? "" : next } })}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-auto gap-2 text-left", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {list.map((o) => (
          <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
