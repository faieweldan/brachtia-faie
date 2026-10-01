import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_ITEMS,
  INVENTORY,
  STATUS_LABEL,
  emptyRecord,
  type InventoryRecord,
  type InventoryStatus,
} from "@/lib/inventory";

/**
 * Schedule C on the signing page: every item in the unit, ticked Present,
 * Defect or Not provided while the resident stands in the room (Dani, 1 Oct
 * 2026). A defect asks what is wrong, because the form says a defect must be
 * "described under Remarks".
 *
 * Answers are kept in this browser as they go, so closing the page part-way
 * loses nothing - they have 48 hours, and may not finish in one go.
 */
export function InventoryChecklist({
  draftKey,
  onChange,
  disabled = false,
}: {
  /** where this browser keeps the answers between visits */
  draftKey: string;
  onChange: (r: InventoryRecord) => void;
  disabled?: boolean;
}) {
  const [record, setRecord] = useState<InventoryRecord>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) return { ...emptyRecord(), ...(JSON.parse(saved) as InventoryRecord) };
    } catch {
      /* no saved draft - start empty */
    }
    return emptyRecord();
  });

  useEffect(() => {
    onChange(record);
    try {
      localStorage.setItem(draftKey, JSON.stringify(record));
    } catch {
      /* private window: the answers still work, they just are not kept */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const setAnswer = (id: string, patch: Partial<{ status: InventoryStatus; remark: string }>) =>
    setRecord((r) => ({
      ...r,
      answers: { ...r.answers, [id]: { status: "", remark: "", ...r.answers[id], ...patch } as InventoryRecord["answers"][string] },
    }));
  const setOther = (i: number, patch: Partial<InventoryRecord["others"][number]>) =>
    setRecord((r) => ({ ...r, others: r.others.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const checked = ALL_ITEMS.filter((i) => record.answers[i.id]?.status).length;
  const pct = Math.round((checked / ALL_ITEMS.length) * 100);

  return (
    <div className={`space-y-4 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Walk through the unit and check each item. Mark <b className="text-foreground">Defect</b> if it is there but
          damaged, and say what is wrong — a defect not reported within 48 hours of check-in may not be recognised as
          existing before you moved in.
        </p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-medium text-brand-deep">
            {checked} of {ALL_ITEMS.length} checked
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand-deep transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {INVENTORY.map((area) => {
        const done = area.items.filter((i) => record.answers[i.id]?.status).length;
        return (
          <section key={area.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
              <p className="text-sm font-semibold text-brand-deep">{area.name}</p>
              <span className={`text-[11px] font-medium ${done === area.items.length ? "text-emerald-700" : "text-muted-foreground"}`}>
                {done === area.items.length ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3" /> Done
                  </span>
                ) : (
                  `${done} / ${area.items.length}`
                )}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {area.items.map((it) => {
                const a = record.answers[it.id];
                return (
                  <li key={it.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-sm">
                        {it.name}
                        {it.qty ? <span className="ml-1.5 text-xs text-muted-foreground">× {it.qty}</span> : null}
                      </p>
                      <StatusPicker value={a?.status ?? ""} onPick={(status) => setAnswer(it.id, { status })} label={it.name} />
                    </div>
                    {a?.status === "defect" ? (
                      <Textarea
                        rows={2}
                        value={a.remark}
                        onChange={(e) => setAnswer(it.id, { remark: e.target.value.slice(0, 500) })}
                        placeholder="What is wrong with it? e.g. scratch on the left door"
                        aria-label={`Defect on ${it.name}`}
                        className={`text-sm ${a.remark.trim() ? "" : "border-amber-400"}`}
                      />
                    ) : null}
                  </li>
                );
              })}
              {area.id === "other"
                ? record.others.map((o, i) => (
                    <li key={`other-${i}`} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Input
                          value={o.name}
                          onChange={(e) => setOther(i, { name: e.target.value.slice(0, 80) })}
                          placeholder="Other item (optional)"
                          aria-label={`Other item ${i + 1}`}
                          className="h-8 max-w-56 text-sm"
                        />
                        {o.name.trim() ? (
                          <StatusPicker value={o.status} onPick={(status) => setOther(i, { status })} label={o.name} />
                        ) : null}
                      </div>
                      {o.name.trim() && o.status === "defect" ? (
                        <Textarea
                          rows={2}
                          value={o.remark}
                          onChange={(e) => setOther(i, { remark: e.target.value.slice(0, 500) })}
                          placeholder="What is wrong with it?"
                          aria-label={`Defect on ${o.name}`}
                          className={`text-sm ${o.remark.trim() ? "" : "border-amber-400"}`}
                        />
                      ) : null}
                    </li>
                  ))
                : null}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-brand-deep">General remarks</p>
        <Textarea
          rows={3}
          value={record.generalRemarks}
          onChange={(e) => setRecord((r) => ({ ...r, generalRemarks: e.target.value.slice(0, 2000) }))}
          placeholder="Anything else about the unit (optional)"
          className="text-sm"
        />
      </section>
    </div>
  );
}

/** Present · Defect · Not provided - one tap, the choice coloured by what it means. */
function StatusPicker({ value, onPick, label }: { value: InventoryStatus | ""; onPick: (s: InventoryStatus) => void; label: string }) {
  const tone: Record<InventoryStatus, string> = {
    present: "border-brand bg-brand text-primary-foreground",
    defect: "border-amber-500 bg-amber-100 text-amber-900",
    not_provided: "border-slate-600 bg-slate-600 text-white",
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border">
      {(["present", "defect", "not_provided"] as InventoryStatus[]).map((s, i) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onPick(s)}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i ? "border-l border-border" : ""} ${
            value === s ? tone[s] : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
