import { useEffect, useState } from "react";
import {
  Bath,
  BedDouble,
  Check,
  ChevronDown,
  CookingPot,
  DoorOpen,
  Gauge,
  KeyRound,
  MessageSquareText,
  Plus,
  Sofa,
  UtensilsCrossed,
  WashingMachine,
  X,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_ITEMS,
  INVENTORY,
  STATUS_LABEL,
  emptyRecord,
  type ExtraItem,
  type InventoryMode,
  type InventoryRecord,
  type InventoryStatus,
} from "@/lib/inventory";

/**
 * Schedule C on the signing page: every item in the unit, checked Present,
 * Defect or Not provided while the resident stands in the room (Dani, 1 Oct
 * 2026) - the paper form handed over at check-in, made into a page.
 *
 * The count can be corrected, an item the list does not name can be added to
 * its room, and the keys and meters are read. At move-out the same list is
 * gone through again, each item showing how it was at move-in.
 *
 * Answers are kept in this browser as they go, so closing the page part-way
 * loses nothing.
 */
/*
 * Each room its own colour and icon, so a long list reads as a walk through
 * the unit rather than one white column (Dani, 1 Oct 2026) - the same idea as
 * the paper form's mock, in the site's own palette.
 */
const AREA_LOOK: Record<string, { icon: LucideIcon; head: string; stripe: string; ink: string }> = {
  foyer: { icon: DoorOpen, head: "bg-teal-50", stripe: "border-l-teal-600", ink: "text-teal-800" },
  living: { icon: Sofa, head: "bg-emerald-50", stripe: "border-l-emerald-600", ink: "text-emerald-800" },
  dining: { icon: UtensilsCrossed, head: "bg-lime-50", stripe: "border-l-lime-600", ink: "text-lime-800" },
  kitchen: { icon: CookingPot, head: "bg-amber-50", stripe: "border-l-amber-500", ink: "text-amber-800" },
  yard: { icon: WashingMachine, head: "bg-sky-50", stripe: "border-l-sky-600", ink: "text-sky-800" },
  room: { icon: BedDouble, head: "bg-indigo-50", stripe: "border-l-indigo-500", ink: "text-indigo-800" },
  bath1: { icon: Bath, head: "bg-cyan-50", stripe: "border-l-cyan-600", ink: "text-cyan-800" },
  bath2: { icon: Bath, head: "bg-cyan-50", stripe: "border-l-cyan-600", ink: "text-cyan-800" },
  other: { icon: KeyRound, head: "bg-rose-50", stripe: "border-l-rose-500", ink: "text-rose-800" },
};
const FALLBACK_LOOK = { icon: DoorOpen, head: "bg-muted/40", stripe: "border-l-brand", ink: "text-brand-deep" };

/** an answered row, tinted by its answer */
const ROW_TINT: Record<string, string> = {
  present: "bg-emerald-50/50",
  defect: "bg-amber-50/70",
  not_provided: "bg-slate-50",
};

export function InventoryChecklist({
  draftKey,
  onChange,
  mode,
  baseline,
  disabled = false,
}: {
  /** where this browser keeps the answers between visits */
  draftKey: string;
  onChange: (r: InventoryRecord) => void;
  mode: InventoryMode;
  /** at move-out: the record signed at move-in, shown beside each item */
  baseline?: InventoryRecord | null;
  disabled?: boolean;
}) {
  const [record, setRecord] = useState<InventoryRecord>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const r = JSON.parse(saved) as Partial<InventoryRecord>;
        return { ...emptyRecord(), ...r, meters: { ...emptyRecord().meters, ...r.meters }, extras: r.extras ?? [] };
      }
    } catch {
      /* no saved draft - start empty */
    }
    return emptyRecord();
  });
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onChange(record);
    try {
      localStorage.setItem(draftKey, JSON.stringify(record));
    } catch {
      /* private window: the answers still work, they just are not kept */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const setAnswer = (id: string, patch: Partial<InventoryRecord["answers"][string]>) =>
    setRecord((r) => ({
      ...r,
      answers: { ...r.answers, [id]: { status: "", remark: "", ...r.answers[id], ...patch } as InventoryRecord["answers"][string] },
    }));
  const setExtra = (id: string, patch: Partial<ExtraItem>) =>
    setRecord((r) => ({ ...r, extras: r.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const addExtra = (areaId: string) =>
    setRecord((r) => ({
      ...r,
      extras: [...r.extras, { id: Math.random().toString(36).slice(2, 9), areaId, name: "", qty: "1", status: "", remark: "" }],
    }));
  const removeExtra = (id: string) => setRecord((r) => ({ ...r, extras: r.extras.filter((e) => e.id !== id) }));
  const setMeter = (k: keyof InventoryRecord["meters"], v: string) =>
    setRecord((r) => ({ ...r, meters: { ...r.meters, [k]: v.slice(0, 30) } }));

  const named = record.extras.filter((e) => e.name.trim());
  const total = ALL_ITEMS.length + named.length;
  const checked = ALL_ITEMS.filter((i) => record.answers[i.id]?.status).length + named.filter((e) => e.status).length;
  const defects =
    ALL_ITEMS.filter((i) => record.answers[i.id]?.status === "defect").length + named.filter((e) => e.status === "defect").length;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const was = (id: string) => baseline?.answers[id];

  return (
    <div className={`space-y-4 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {mode === "in" ? (
            <>
              Walk through the unit room by room and check each item. Mark <b className="text-foreground">Defect</b> if it
              is there but damaged, and say what is wrong — reporting it now protects your deposit later.
            </>
          ) : (
            <>
              Check each item again before you leave. Beside each one is how it was when you moved in, so anything new is
              easy to see.
            </>
          )}
        </p>
      </div>

      {/* stays in view while scrolling a long list, like the form's own counter */}
      <div className="sticky top-16 z-10 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-brand-deep">
            {checked} of {total} checked
          </span>
          <span className={defects ? "font-medium text-amber-700" : "text-muted-foreground"}>
            {defects ? `${defects} defect${defects === 1 ? "" : "s"}` : "No defects"}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${checked === total ? "bg-brand" : "bg-brand-deep"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {INVENTORY.map((area) => {
        const mine = record.extras.filter((e) => e.areaId === area.id);
        const areaTotal = area.items.length + mine.filter((e) => e.name.trim()).length;
        const done = area.items.filter((i) => record.answers[i.id]?.status).length + mine.filter((e) => e.name.trim() && e.status).length;
        const isClosed = closed[area.id];
        const look = AREA_LOOK[area.id] ?? FALLBACK_LOOK;
        const Icon = look.icon;
        return (
          <section key={area.id} className={`overflow-hidden rounded-xl border border-l-4 border-border bg-card ${look.stripe}`}>
            <button
              type="button"
              onClick={() => setClosed((c) => ({ ...c, [area.id]: !c[area.id] }))}
              aria-expanded={!isClosed}
              className={`flex w-full items-center gap-2.5 border-b border-border px-4 py-3 text-left ${look.head}`}
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-white/80 ${look.ink}`}>
                <Icon className="size-4" />
              </span>
              <span className={`flex-1 text-sm font-semibold ${look.ink}`}>{area.name}</span>
              <span className={`text-[11px] font-medium ${done === areaTotal ? "text-emerald-700" : "text-muted-foreground"}`}>
                {done === areaTotal ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3" /> Done
                  </span>
                ) : (
                  `${done} / ${areaTotal}`
                )}
              </span>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${look.ink} ${isClosed ? "-rotate-90" : ""}`} />
            </button>
            {isClosed ? null : (
              <ul className="divide-y divide-border">
                {area.items.map((it) => {
                  const a = record.answers[it.id];
                  const before = was(it.id);
                  return (
                    <li key={it.id} className={`space-y-2 px-4 py-3 transition-colors ${ROW_TINT[a?.status ?? ""] ?? ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{it.name}</p>
                          {before?.status ? (
                            <p className="text-[11px] text-muted-foreground">
                              At move-in: {STATUS_LABEL[before.status as InventoryStatus]}
                              {before.remark ? ` — ${before.remark}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <Qty value={a?.qty ?? it.qty} onChange={(qty) => setAnswer(it.id, { qty })} label={it.name} />
                        <StatusPicker value={a?.status ?? ""} onPick={(status) => setAnswer(it.id, { status })} label={it.name} />
                      </div>
                      {/* the form's "Brand / Model / Serial No." column, where it asks */}
                      {it.detail ? (
                        <DetailPicker
                          hint={it.detail}
                          value={a?.detail ?? ""}
                          onChange={(detail) => setAnswer(it.id, { detail })}
                          label={it.name}
                        />
                      ) : null}
                      {a?.status === "defect" ? (
                        <DefectNote value={a.remark} onChange={(remark) => setAnswer(it.id, { remark })} label={it.name} />
                      ) : null}
                    </li>
                  );
                })}
                {mine.map((e) => (
                  <li key={e.id} className={`space-y-2 px-4 py-3 transition-colors ${ROW_TINT[e.status] ?? ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={e.name}
                        onChange={(ev) => setExtra(e.id, { name: ev.target.value.slice(0, 80) })}
                        placeholder="What is it?"
                        aria-label={`Added item in ${area.name}`}
                        className="h-8 min-w-0 flex-1 text-sm"
                        autoFocus={!e.name}
                      />
                      <Qty value={e.qty} onChange={(qty) => setExtra(e.id, { qty })} label={e.name || "added item"} />
                      <StatusPicker value={e.status} onPick={(status) => setExtra(e.id, { status })} label={e.name || "added item"} />
                      <button
                        type="button"
                        onClick={() => removeExtra(e.id)}
                        title="Remove"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {e.status === "defect" ? (
                      <DefectNote value={e.remark} onChange={(remark) => setExtra(e.id, { remark })} label={e.name} />
                    ) : null}
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => addExtra(area.id)}
                    className={`flex w-full items-center justify-center gap-1 border-t border-dashed border-border px-4 py-2.5 text-xs font-medium hover:bg-muted/40 ${look.ink}`}
                  >
                    <Plus className="size-3.5" /> Add something else in this room
                  </button>
                </li>
              </ul>
            )}
          </section>
        );
      })}

      <section className="overflow-hidden rounded-xl border border-l-4 border-border border-l-slate-500 bg-card">
        <p className="flex items-center gap-2.5 border-b border-border bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
          <span className="flex size-8 items-center justify-center rounded-full bg-white/80">
            <Gauge className="size-4" />
          </span>
          Meter readings
        </p>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {(
            [
              ["water", "Water meter reading", "decimal", false],
              ["electric", "Electric meter reading", "decimal", false],
            ] as const
          ).map(([k, label, mode, required]) => (
            <label key={k} className="space-y-1.5">
              <span className="block text-xs text-muted-foreground">
                {label}
                {required ? "" : " (optional)"}
              </span>
              <Input
                inputMode={mode}
                value={record.meters[k]}
                onChange={(e) => setMeter(k, e.target.value)}
                className={`h-9 text-sm ${required && !record.meters[k].trim() ? "border-amber-400" : ""}`}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-l-4 border-border border-l-brand bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
          <MessageSquareText className="size-4" /> Anything else to add?
        </p>
        <p className="text-xs text-muted-foreground">Cleanliness, marks on walls, anything not listed above.</p>
        <Textarea
          rows={3}
          value={record.generalRemarks}
          onChange={(e) => setRecord((r) => ({ ...r, generalRemarks: e.target.value.slice(0, 2000) }))}
          placeholder="Optional"
          className="text-sm"
        />
      </section>
    </div>
  );
}

/**
 * The form's "Brand / Model / Serial No." column. Where the form lists the
 * choices - "Midea / Panasonic / Toshiba / Sharp" - they are tapped, as the
 * resident ticks what is there (Dani, 1 Oct 2026); where it only says
 * "Brand", the brand is typed. Optional either way; a second tap clears it.
 */
function DetailPicker({ hint, value, onChange, label }: { hint: string; value: string; onChange: (v: string) => void; label: string }) {
  const choices = hint.split("/").map((c) => c.trim()).filter(Boolean);
  // a brand typed in, not one of the buttons
  const typed = !!value && !choices.includes(value);
  const [other, setOther] = useState(typed);
  // sizes and types (Single / Queen / King) are a closed list; brands are not
  const brands = !/single|built in/i.test(hint);
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      on ? "border-brand-deep bg-brand-deep text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"
    }`;
  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label={`Which one - ${label}`} className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{brands ? "Brand" : "Which one?"}</span>
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            onClick={() => {
              setOther(false);
              onChange(value === c ? "" : c);
            }}
            className={chip(value === c)}
          >
            {c}
          </button>
        ))}
        {brands ? (
          <button
            type="button"
            role="radio"
            aria-checked={other}
            onClick={() => {
              setOther(!other);
              if (!other) onChange("");
            }}
            className={chip(other)}
          >
            Other
          </button>
        ) : null}
      </div>
      {other ? (
        <Input
          value={typed ? value : ""}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          placeholder="Which brand?"
          aria-label={`Brand of ${label}`}
          autoFocus
          className="h-8 max-w-56 text-sm"
        />
      ) : null}
    </div>
  );
}

function Qty({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
      Qty
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 12))}
        aria-label={`Quantity of ${label}`}
        className="w-10 border-b border-dashed border-border bg-transparent text-center text-xs font-semibold text-foreground focus:border-brand focus:outline-none"
      />
    </label>
  );
}

function DefectNote({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Textarea
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 500))}
      placeholder="What is wrong with it? e.g. scratch on the left door, remote missing"
      aria-label={`Defect on ${label}`}
      autoFocus={!value}
      className={`border-amber-300 bg-amber-50/60 text-sm ${value.trim() ? "" : "border-amber-500"}`}
    />
  );
}

/** Present · Defect · Not provided - one tap, the choice coloured by what it means. */
function StatusPicker({ value, onPick, label }: { value: InventoryStatus | ""; onPick: (s: InventoryStatus) => void; label: string }) {
  const tone: Record<InventoryStatus, string> = {
    present: "border-brand bg-brand text-primary-foreground",
    defect: "border-amber-500 bg-amber-500 text-white",
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
