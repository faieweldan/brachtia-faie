import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICON_CHOICES, ICON_LABELS, facilityIcon } from "@/lib/facility-icons";

export default function IconPicker({
  label,
  value,
  onChange,
}: {
  /** The list item text — used to preview the automatic icon */
  label: string;
  value?: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const Current = facilityIcon(label, value ? { [label]: value } : undefined);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.keys(ICON_CHOICES).filter(
      (key) =>
        !q ||
        key.toLowerCase().includes(q) ||
        (ICON_LABELS[key] ?? "").toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={value ? `Icon: ${ICON_LABELS[value] ?? value}` : "Icon: automatic"}
          aria-label="Choose icon"
          className={value ? "border-brand/40 text-brand" : "text-muted-foreground"}
        >
          <Current className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="mt-3 grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
          {entries.map((key) => {
            const Icon = ICON_CHOICES[key]!;
            const selected = key === value;
            return (
              <button
                key={key}
                type="button"
                title={ICON_LABELS[key] ?? key}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex size-9 items-center justify-center rounded-md border transition ${
                  selected
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-transparent text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          {entries.length === 0 ? (
            <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
              No icons match.
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-xs"
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          <RotateCcw className="mr-1.5 size-3.5" /> Use automatic icon
        </Button>
      </PopoverContent>
    </Popover>
  );
}
