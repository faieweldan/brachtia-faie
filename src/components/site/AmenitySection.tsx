import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { facilityIcon } from "@/lib/facility-icons";

interface AmenitySectionProps {
  title: string;
  items: string[];
  note?: string | undefined;
  footnote?: string | undefined;
  iconMode?: "check" | "facility";
  defaultOpen?: boolean;
  collapseThreshold?: number;
}

const DEFAULT_VISIBLE = 6;

export default function AmenitySection({
  title,
  items,
  note,
  footnote,
  iconMode = "check",
  defaultOpen = true,
  collapseThreshold = 6,
}: AmenitySectionProps) {
  const shouldCollapse = items.length > collapseThreshold;
  const [isOpen, setIsOpen] = useState(defaultOpen || !shouldCollapse);
  const visibleItems = shouldCollapse && !isOpen ? items.slice(0, collapseThreshold) : items;

  return (
    <div className="border-b border-border pb-8 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={() => shouldCollapse && setIsOpen((v) => !v)}
        className={`flex w-full items-center justify-between text-left ${shouldCollapse ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={shouldCollapse ? isOpen : undefined}
      >
        <h2 className="text-2xl font-bold text-brand-deep">{title}</h2>
        {shouldCollapse && (
          <ChevronDown
            className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
          />
        )}
      </button>

      <ul className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = iconMode === "facility" ? facilityIcon(item) : Check;
          return (
            <li key={item} className="flex items-start gap-4">
              <Icon className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-brand" />
              <span className="text-[15px] leading-snug text-foreground">{item}</span>
            </li>
          );
        })}
      </ul>

      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="mt-4 text-sm font-medium text-brand hover:underline"
        >
          {isOpen ? "Show less" : `Show more (${items.length - collapseThreshold})`}
        </button>
      )}

      {note && <p className="mt-5 text-sm text-muted-foreground">{note}</p>}
      {footnote && <p className="mt-2 text-sm text-muted-foreground">*{footnote}</p>}
    </div>
  );
}
