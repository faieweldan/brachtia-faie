import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/lib/reference-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Option = { value: string; label: string };

/** Lists longer than this get a search box. Nobody scrolls 90 countries. */
const SEARCH_FROM = 8;

const triggerClass =
  "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/30";

/**
 * A dropdown drawn by the page, not by the phone or the laptop.
 *
 * A native <select> looks different on every device - a wheel on an iPhone, a
 * grey Mac menu on a MacBook - and cannot be searched. This one looks the same
 * everywhere, and long lists can be typed into to find a match.
 */
export function ChoicePicker({
  value,
  onChange,
  options,
  placeholder = "Please choose",
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // a value on record that is not on the list is shown as it is, not blanked
  const shown = selected?.label ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(triggerClass, invalid && "border-destructive")}
        >
          <span className={cn("flex-1 truncate", !shown && "text-muted-foreground")}>
            {shown || placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command>
          {options.length > SEARCH_FROM ? <CommandInput placeholder="Type to search…" /> : null}
          <CommandList className="max-h-64">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value ? <Check className="size-4 text-brand" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The country code in front of a phone number, found by country name or code.
 *
 * "+60" on its own means nothing to a student from Oman, so the list shows the
 * country beside every code, and typing "oman" or "968" both find it.
 */
export function DialPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (dial: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const countries = useMemo(
    () => [COUNTRIES[0]!, ...COUNTRIES.slice(1).sort((a, b) => a.name.localeCompare(b.name))],
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Country code"
          className={cn(triggerClass, "w-28 shrink-0")}
        >
          <span className="flex-1 tabular-nums">{value}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search country or code…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.dial} ${c.dial.slice(1)}`}
                  onSelect={() => {
                    onChange(c.dial);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{c.dial}</span>
                  {c.dial === value ? <Check className="size-4 text-brand" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
