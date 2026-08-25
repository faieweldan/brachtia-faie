import type { RoomFilterState } from "@/data/properties";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Group = {
  key: keyof RoomFilterState;
  label: string;
  options: { value: string; label: string }[];
};

export default function RoomFilters({
  unitTypes,
  value,
  onChange,
  onClear,
  resultLabel,
}: {
  unitTypes: string[];
  value: Partial<RoomFilterState>;
  onChange: (next: Partial<RoomFilterState>) => void;
  onClear?: () => void;
  resultLabel?: string;
}) {
  const groups: Group[] = [
    {
      key: "unit",
      label: "Apartment",
      options: [
        { value: "all", label: "Any apartment" },
        ...unitTypes.map((u) => ({ value: u, label: u.replace(" Apartment", "") })),
      ],
    },
    {
      key: "bath",
      label: "Bathroom",
      options: [
        { value: "all", label: "Any bathroom" },
        { value: "ensuite", label: "Ensuite" },
        { value: "shared", label: "Shared" },
      ],
    },
    {
      key: "view",
      label: "View",
      options: [
        { value: "all", label: "Any view" },
        { value: "view", label: "With view" },
      ],
    },
  ];

  const active = groups.some((g) => (value[g.key] ?? "all") !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((g) => {
        const current = value[g.key] ?? "all";
        return (
          <Select
            key={g.key}
            value={current}
            onValueChange={(v) => onChange({ [g.key]: v })}
          >
            <SelectTrigger
              aria-label={g.label}
              className={`h-10 w-auto min-w-[9.5rem] rounded-full border-border/70 bg-card px-4 text-sm font-medium ${
                current !== "all" ? "border-brand text-brand-deep ring-1 ring-brand/30" : ""
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {g.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
        {resultLabel && <span>{resultLabel}</span>}
        {active && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
