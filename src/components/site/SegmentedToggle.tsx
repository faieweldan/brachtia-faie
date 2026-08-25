export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="group"
      className={`inline-flex w-full rounded-full bg-muted p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-full font-medium transition-all ${
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
            } ${
              active
                ? "bg-card text-brand-deep shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
