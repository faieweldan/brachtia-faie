import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Charge } from "@/lib/charge-list";
import { getResidentCharges } from "@/lib/charges.functions";

/** the Schedule B list of the residence the resident is in - one query per resident */
export function useResidentCharges(residentId: string): Charge[] {
  const q = useQuery({
    queryKey: ["resident-charges", residentId],
    queryFn: () => getResidentCharges({ data: { residentId } }),
    enabled: !!residentId,
  });
  return q.data?.charges ?? [];
}

/**
 * A line's description, with Schedule B's charges as its own dropdown (Dani,
 * 2 Oct 2026) - the resident's residence's list (Website › Residences, 28 Oct 2026): the list opens under the box, picking one writes over the box
 * and fills the price where the schedule gives one, and both stay editable -
 * "Damage or missing items" becomes "Missing item (watch), kitchen". Our own
 * list, not the browser's, so it looks the same on every computer.
 */
export function ChargeInput({
  value,
  charges,
  onChange,
  onPick,
  placeholder = "Description",
  disabled = false,
}: {
  value: string;
  /** the residence's Schedule B list */
  charges: Charge[];
  onChange: (label: string) => void;
  onPick: (label: string, amount: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // typing narrows the list; a description already picked shows the whole list again
  const typed = value.trim().toLowerCase();
  const exact = charges.some((c) => c.label.toLowerCase() === typed);
  const shown = !typed || exact ? charges : charges.filter((c) => c.label.toLowerCase().includes(typed));
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div data-charge-anchor className="relative min-w-0 flex-1">
          <Input
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            className="h-8 pr-8"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Choose a charge from Schedule B"
            onClick={() => setOpen((o) => !o)}
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="admin-ui max-h-72 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-y-auto p-1"
        // the box keeps the cursor, so typing carries on while the list is open
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement).closest("[data-charge-anchor]")) e.preventDefault();
        }}
      >
        {shown.length ? (
          shown.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                onPick(c.label, c.amount);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="min-w-0">{c.label}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{c.amount != null ? `RM${c.amount}` : "you set"}</span>
            </button>
          ))
        ) : (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {charges.length ? "Not on Schedule B - it stays as you typed it." : "No Schedule B charges for this residence yet - set them in Website › Residences."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
