import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { COMMON_ISO, COUNTRIES, flagFor, type Country } from "@/data/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Props = {
  value: string | undefined;
  onChange: (country: Country) => void;
  /** "name" shows flag + country name, "dial" shows flag + dial code only. */
  variant?: "name" | "dial";
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  invalid?: boolean;
};

export default function CountryCombobox({
  value,
  onChange,
  variant = "name",
  placeholder = "Select country",
  id,
  ariaLabel,
  className,
  invalid,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => COUNTRIES.find((c) => c.iso === value), [value]);
  const common = useMemo(
    () => COMMON_ISO.map((iso) => COUNTRIES.find((c) => c.iso === iso)).filter(Boolean) as Country[],
    [],
  );
  const rest = useMemo(
    () =>
      [...COUNTRIES]
        .filter((c) => !COMMON_ISO.includes(c.iso))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  function renderItem(c: Country) {
    return (
      <CommandItem
        key={c.iso + c.dial}
        value={`${c.name} ${c.dial} ${c.iso}`}
        onSelect={() => {
          onChange(c);
          setOpen(false);
        }}
        className="gap-2.5"
      >
        <span className="w-7 shrink-0 text-[10px] font-bold tracking-wide text-muted-foreground">
          {c.iso}
        </span>

        <span className="flex-1 truncate">{c.name}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{c.dial}</span>
        {selected?.iso === c.iso && <Check className="size-4 text-brand" />}
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-brand/40",
            invalid && "border-destructive",
            className,
          )}
        >
          {selected ? (
            <>
              <span className="text-base leading-none">{flagFor(selected.iso)}</span>
              <span className="truncate">
                {variant === "dial" ? selected.dial : selected.name}
              </span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2.5rem))] p-0">
        <Command>
          <CommandInput placeholder="Search country or code…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup heading="Common">{common.map(renderItem)}</CommandGroup>
            <CommandGroup heading="All countries">{rest.map(renderItem)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
