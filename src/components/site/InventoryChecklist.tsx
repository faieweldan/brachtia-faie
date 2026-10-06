import { useEffect, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  Camera,
  Check,
  ChevronDown,
  CookingPot,
  DoorOpen,
  KeyRound,
  Loader2,
  Minus,
  MessageSquareText,
  Plus,
  Sofa,
  UtensilsCrossed,
  WashingMachine,
  X,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_ITEMS,
  INVENTORY,
  MAX_PHOTOS,
  OTHER,
  SERIAL,
  STATUS_LABEL,
  VERDICT_LABEL,
  emptyRecord,
  inventoryGaps,
  type DefectDecision,
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
 * Each room its own coloured header and icon, so a long list reads as a walk through
 * the unit rather than one white column (Dani, 1 Oct 2026) - the same idea as
 * the paper form's mock, in the site's own palette.
 */
const AREA_LOOK: Record<string, { icon: LucideIcon; head: string; ink: string }> = {
  foyer: { icon: DoorOpen, head: "bg-teal-50", ink: "text-teal-800" },
  living: { icon: Sofa, head: "bg-emerald-50", ink: "text-emerald-800" },
  dining: { icon: UtensilsCrossed, head: "bg-lime-50", ink: "text-lime-800" },
  kitchen: { icon: CookingPot, head: "bg-amber-50", ink: "text-amber-800" },
  yard: { icon: WashingMachine, head: "bg-sky-50", ink: "text-sky-800" },
  room: { icon: BedDouble, head: "bg-indigo-50", ink: "text-indigo-800" },
  bath1: { icon: Bath, head: "bg-cyan-50", ink: "text-cyan-800" },
  bath2: { icon: Bath, head: "bg-cyan-50", ink: "text-cyan-800" },
  other: { icon: KeyRound, head: "bg-rose-50", ink: "text-rose-800" },
};
const FALLBACK_LOOK = { icon: DoorOpen, head: "bg-muted/40", ink: "text-brand-deep" };

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
  initial,
  decisions,
  photos,
  disabled = false,
  locked = false,
}: {
  /** where this browser keeps the answers between visits */
  draftKey: string;
  onChange: (r: InventoryRecord) => void;
  mode: InventoryMode;
  /** at move-out: the record signed at move-in, shown beside each item */
  baseline?: InventoryRecord | null;
  /** once Brachtia has answered: the check as answered, to start from */
  initial?: InventoryRecord;
  /** Brachtia's answer to each defect, shown under it while it is unchanged */
  decisions?: Record<string, DefectDecision>;
  /** a defect's photos: save one, and the links to show them */
  photos: PhotoProps;
  disabled?: boolean;
  /** sent to Brachtia already: shown, not changed */
  locked?: boolean;
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
    return initial ?? emptyRecord();
  });
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  /*
   * A room closes by itself once every row in it is answered in full - status,
   * brand, and a described, pictured defect - and the next room comes up, so a
   * phone is not one endless scroll (Dani, 2 Oct 2026). Only when a room
   * becomes complete: one opened again by hand stays open.
   */
  const complete = (areaId: string) => {
    const ids = new Set([
      ...(INVENTORY.find((x) => x.id === areaId)?.items.map((i) => i.id) ?? []),
      ...record.extras.filter((e) => e.areaId === areaId && e.name.trim()).map((e) => e.id),
    ]);
    return !inventoryGaps(record).some((g) => g.rows.some((r) => ids.has(r)));
  };
  const wasComplete = useRef<Record<string, boolean> | null>(null);
  useEffect(() => {
    const now = Object.fromEntries(INVENTORY.map((x) => [x.id, complete(x.id)]));
    const before = wasComplete.current;
    wasComplete.current = now;
    // the first look - a draft reopened - closes nothing
    if (!before) return;
    const done = INVENTORY.find((x) => now[x.id] && !before[x.id]);
    if (!done) return;
    const i = INVENTORY.indexOf(done);
    setClosed((c) => ({ ...c, [done.id]: true, ...(INVENTORY[i + 1] ? { [INVENTORY[i + 1]!.id]: false } : {}) }));
    const next = INVENTORY[i + 1];
    if (next) setTimeout(() => document.getElementById(`inventory-area-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // a "take me there" from the list of what is missing: open the room, then go
  useEffect(() => {
    const go = (ev: Event) => {
      const id = (ev as CustomEvent<string>).detail;
      const area = INVENTORY.find((x) => x.items.some((i) => i.id === id))?.id ?? record.extras.find((e) => e.id === id)?.areaId;
      if (area) setClosed((c) => ({ ...c, [area]: false }));
      setTimeout(() => {
        const el = document.getElementById(rowId(id));
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-inset", "ring-amber-500");
        setTimeout(() => el.classList.remove("ring-2", "ring-inset", "ring-amber-500"), 2200);
      }, 60);
    };
    window.addEventListener("inventory-goto", go);
    return () => window.removeEventListener("inventory-goto", go);
  }, [record.extras]);

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
    <div className={`space-y-4 ${disabled ? "pointer-events-none opacity-60" : locked ? "pointer-events-none" : ""}`}>
      {locked ? (
        <p className="pointer-events-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Your check as you sent it - view only. If something is not right, contact Brachtia.
        </p>
      ) : null}
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
          <section key={area.id} id={`inventory-area-${area.id}`} className="scroll-mt-40 overflow-hidden rounded-xl border border-border bg-card">
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
              <div className="divide-y divide-border">
                {/* the form's own columns (Dani, 1 Oct 2026) - on a phone each row stacks */}
                <div className={`hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid ${GRID}`}>
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Details</span>
                  <span>Status</span>
                </div>
                {area.items.map((it) => {
                  const a = record.answers[it.id];
                  const before = was(it.id);
                  return (
                    <Row
                      key={it.id}
                      id={it.id}
                      tint={ROW_TINT[a?.status ?? ""] ?? ""}
                      showRemarks={a?.status === "defect" || !!a?.remark?.trim()}
                      item={
                        <>
                          <p className="text-sm">{it.name}</p>
                          {before?.status ? (
                            <p className="text-[11px] text-muted-foreground">
                              At move-in: {STATUS_LABEL[before.status as InventoryStatus]}
                              {before.remark ? ` — ${before.remark}` : ""}
                            </p>
                          ) : null}
                        </>
                      }
                      qty={<Qty value={a?.qty ?? String(it.qty)} onChange={(qty) => setAnswer(it.id, { qty })} label={it.name} />}
                      details={
                        // not there: nothing to name - no brand, no serial number (Dani, 2 Oct 2026)
                        a?.status === "not_provided" ? (
                          <span className="hidden text-sm text-muted-foreground md:inline">—</span>
                        ) : it.details === SERIAL ? (
                          <Input
                            value={a?.detail ?? ""}
                            onChange={(ev) => setAnswer(it.id, { detail: ev.target.value.slice(0, 40) })}
                            placeholder="Serial No."
                            aria-label={`Serial number of ${it.name}`}
                            className={`h-8 text-sm ${a?.status && !a.detail?.trim() ? "border-amber-500" : ""}`}
                          />
                        ) : it.details ? (
                          <DetailSelect
                            options={it.details}
                            value={a?.detail ?? ""}
                            needed={!!a?.status}
                            onChange={(detail) => setAnswer(it.id, { detail })}
                            label={it.name}
                          />
                        ) : (
                          <span className="hidden text-sm text-muted-foreground md:inline">—</span>
                        )
                      }
                      status={
                        <StatusPicker
                          value={a?.status ?? ""}
                          // marked not there: a brand or serial number given before goes with it
                          onPick={(status) => setAnswer(it.id, status === "not_provided" ? { status, detail: "" } : { status })}
                          label={it.name}
                        />
                      }
                      remarks={
                        <>
                          <Remark defect={a?.status === "defect"} value={a?.remark ?? ""} onChange={(remark) => setAnswer(it.id, { remark })} label={it.name} />
                          {a?.status === "defect" ? (
                            <Photos {...photos} item={it.id} value={a.photos ?? []} onChange={(p) => setAnswer(it.id, { photos: p })} />
                          ) : null}
                          {a?.status === "defect" ? <Verdict d={decisions?.[it.id]} remark={a.remark} /> : null}
                        </>
                      }
                    />
                  );
                })}
                {mine.map((e) => (
                  <Row
                    key={e.id}
                    id={e.id}
                    tint={ROW_TINT[e.status] ?? ""}
                    showRemarks={e.status === "defect" || !!e.remark.trim()}
                    item={
                      <div className="flex items-center gap-1">
                        <Input
                          value={e.name}
                          onChange={(ev) => setExtra(e.id, { name: ev.target.value.slice(0, 80) })}
                          placeholder="What is it?"
                          aria-label={`Added item in ${area.name}`}
                          className="h-8 min-w-0 flex-1 text-sm"
                          autoFocus={!e.name}
                        />
                        <button
                          type="button"
                          onClick={() => removeExtra(e.id)}
                          title="Remove"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    }
                    qty={<Qty value={e.qty} onChange={(qty) => setExtra(e.id, { qty })} label={e.name || "added item"} />}
                    details={<span className="hidden text-sm text-muted-foreground md:inline">—</span>}
                    status={<StatusPicker value={e.status} onPick={(status) => setExtra(e.id, { status })} label={e.name || "added item"} />}
                    remarks={
                      <>
                        <Remark defect={e.status === "defect"} value={e.remark} onChange={(remark) => setExtra(e.id, { remark })} label={e.name} />
                        {e.status === "defect" ? (
                          <Photos {...photos} item={e.id} value={e.photos ?? []} onChange={(p) => setExtra(e.id, { photos: p })} />
                        ) : null}
                        {e.status === "defect" ? <Verdict d={decisions?.[e.id]} remark={e.remark} /> : null}
                      </>
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() => addExtra(area.id)}
                  className={`flex w-full items-center justify-center gap-1 border-dashed px-4 py-2.5 text-xs font-medium hover:bg-muted/40 ${look.ink}`}
                >
                  <Plus className="size-3.5" /> Add something else in this room
                </button>
              </div>
            )}
          </section>
        );
      })}

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
          <MessageSquareText className="size-4" /> Anything else you'd like to let us know about the unit / room condition?
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

const rowId = (id: string) => `inventory-row-${id}`;

/**
 * Take the resident to a row that still needs something (Dani, 2 Oct 2026):
 * its room is opened, the page scrolls to it and it is outlined for a moment.
 */
export function goToInventoryRow(id: string) {
  window.dispatchEvent(new CustomEvent("inventory-goto", { detail: id }));
}

/** Item · Qty · Details · Status · Remarks - the form's columns, on a wide screen */
/*
 * Item · Qty · Details · Status. No Remarks column (Dani, 4 Oct 2026): an empty
 * column read as something to fill in on every row. A defect opens its remark
 * and photos on a line of their own under the row.
 */
const GRID = "md:grid-cols-[minmax(0,1.4fr)_88px_minmax(0,1.1fr)_236px] md:gap-4";

/** One row of the table; on a phone it stacks - the item and its count, then the rest. */
function Row({
  id,
  tint,
  item,
  qty,
  details,
  status,
  remarks,
  showRemarks,
}: {
  id: string;
  tint: string;
  item: React.ReactNode;
  qty: React.ReactNode;
  details: React.ReactNode;
  status: React.ReactNode;
  remarks: React.ReactNode;
  /** a defect (or a remark written before): the remark line shows */
  showRemarks: boolean;
}) {
  return (
    <div id={rowId(id)} className={`grid scroll-mt-40 gap-2 px-4 py-3 transition-colors md:items-center ${GRID} ${tint}`}>
      <div className="flex items-start justify-between gap-2 md:contents">
        <div className="min-w-0">{item}</div>
        <div>{qty}</div>
      </div>
      <div className="min-w-0">{details}</div>
      <div>{status}</div>
      {showRemarks ? (
        <div className="min-w-0 space-y-2 rounded-lg border border-amber-200 bg-white/70 p-2.5 md:col-span-4">{remarks}</div>
      ) : null}
    </div>
  );
}

/**
 * The form's "Brand / Model / Serial No." column, as a list to pick from
 * (Dani, 1 Oct 2026). Required unless the item is not there. "Other" asks
 * for the name.
 */
function DetailSelect({
  options,
  value,
  needed,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  needed: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  // a name typed in after "Other"
  const typed = !!value && !options.includes(value);
  const picked = typed ? OTHER : value;
  const missing = needed && (!value.trim() || value === OTHER);
  return (
    <div className="space-y-1.5">
      {/* our own list, not the phone's or the Mac's - the same everywhere (Dani, 4 Oct 2026) */}
      <Select value={picked} onValueChange={onChange}>
        <SelectTrigger
          aria-label={`Details of ${label}`}
          className={`h-8 w-full text-sm ${missing ? "border-amber-500" : "border-border"} ${picked ? "" : "text-muted-foreground"}`}
        >
          <SelectValue placeholder={options.includes("Midea") ? "Choose brand…" : "Choose…"} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {picked === OTHER ? (
        <Input
          value={typed ? value : ""}
          onChange={(e) => onChange(e.target.value.slice(0, 80) || OTHER)}
          placeholder="Which brand?"
          aria-label={`Brand of ${label}`}
          autoFocus
          className="h-8 text-sm"
        />
      ) : null}
    </div>
  );
}

/** The count, as − 1 + - a number only (Dani, 1 Oct 2026). */
function Qty({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const n = Number.parseInt(value, 10);
  const now = Number.isFinite(n) ? n : 1;
  const step = (d: number) => onChange(String(Math.min(99, Math.max(0, now + d))));
  const btn = "flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground";
  return (
    <div className="inline-flex shrink-0 items-center rounded-full bg-muted" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={() => step(-1)} className={btn} aria-label="One fewer">
        <Minus className="size-3" />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{now}</span>
      <button type="button" onClick={() => step(1)} className={btn} aria-label="One more">
        <Plus className="size-3" />
      </button>
    </div>
  );
}

/**
 * Remarks - only on a defect, where it says what is wrong (Dani, 2 Oct 2026:
 * a box on every row made residents think each one needed a remark). A
 * remark written before stays visible.
 */
function Remark({ defect, value, onChange, label }: { defect: boolean; value: string; onChange: (v: string) => void; label: string }) {
  if (!defect && !value.trim()) return null;
  return (
    <Textarea
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 500))}
      placeholder={defect ? "What is wrong with it?" : "Remarks (optional)"}
      aria-label={`Remarks on ${label}`}
      className={`min-h-8 py-1.5 text-sm ${defect ? `bg-amber-50/60 ${value.trim() ? "border-amber-300" : "border-amber-500"}` : ""}`}
    />
  );
}

export type PhotoProps = {
  upload: (item: string, file: File) => Promise<string | null>;
  urls: Record<string, string>;
};

/**
 * A defect's photos (Dani, 1 Oct 2026): the form asks for "supporting
 * image(s)" with every defect. Taken with the phone's camera or picked from
 * its photos; each is saved as soon as it is added.
 */
function Photos({ upload, urls, item, value, onChange }: PhotoProps & { item: string; value: string[]; onChange: (p: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let next = value;
    for (const f of [...files].slice(0, MAX_PHOTOS - value.length)) {
      const path = await upload(item, f);
      if (path) next = [...next, path];
    }
    onChange(next);
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((p) => (
        <span key={p} className="relative size-14 overflow-hidden rounded-lg border border-amber-300 bg-muted">
          {urls[p] ? <img src={urls[p]} alt="Defect photo" className="size-full object-cover" /> : null}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== p))}
            title="Remove photo"
            className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {value.length < MAX_PHOTOS ? (
        <label
          className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium ${
            value.length ? "border-border text-muted-foreground" : "border-amber-500 bg-amber-50 text-amber-900"
          }`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          {busy ? "Saving…" : value.length ? "Add another" : "Add a photo"}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => void add(e.target.files)} />
        </label>
      ) : null}
    </div>
  );
}

/** Brachtia's answer under a defect - only while the defect reads as it did when answered. */
function Verdict({ d, remark }: { d: DefectDecision | undefined; remark: string }) {
  if (!d || d.remark.trim() !== remark.trim()) return null;
  return (
    <p className={`text-xs font-medium ${d.verdict === "resolved" ? "text-emerald-800" : "text-slate-700"}`}>
      Brachtia: {VERDICT_LABEL[d.verdict]}
    </p>
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
