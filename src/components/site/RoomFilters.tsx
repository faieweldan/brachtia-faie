import type { RoomFilterState } from "@/data/properties";

type Group = {
  key: keyof RoomFilterState;
  label: string;
  options: { value: string; label: string }[];
};

export default function RoomFilters({
  unitTypes,
  value,
  onChange,
}: {
  unitTypes: string[];
  value: Partial<RoomFilterState>;
  onChange: (next: Partial<RoomFilterState>) => void;
}) {
  const groups: Group[] = [
    {
      key: "unit",
      label: "Apartment",
      options: [
        { value: "all", label: "All" },
        ...unitTypes.map((u) => ({ value: u, label: u.replace(" Apartment", "") })),
      ],
    },
    {
      key: "bath",
      label: "Bathroom",
      options: [
        { value: "all", label: "All" },
        { value: "ensuite", label: "Ensuite" },
        { value: "shared", label: "Shared" },
      ],
    },
    {
      key: "view",
      label: "View",
      options: [
        { value: "all", label: "All" },
        { value: "view", label: "With view" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-brand-tint/50 p-4 sm:p-5">
      {groups.map((g) => (
        <div
          key={g.key}
          className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center sm:gap-3"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => {
              const active = (value[g.key] ?? "all") === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ [g.key]: o.value })}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-brand text-primary-foreground shadow-card"
                      : "bg-card text-muted-foreground ring-1 ring-border/70 hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
