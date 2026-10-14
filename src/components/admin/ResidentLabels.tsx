import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteLabel, listLabels, saveLabel, toggleResidentLabel } from "@/lib/labels.functions";
import { LABEL_COLOR_KEYS, LABEL_COLORS, labelColor, type Label, type LabelColor } from "@/lib/labels";

/**
 * Resident labels (Dani, 13 Oct 2026): admin's own tags, like WhatsApp's chat
 * labels. One list for every admin; a resident can carry several. Read once
 * for the whole app (["admin", "labels"]), so the list and the profile agree.
 */
export function useLabels() {
  return useQuery({ queryKey: ["admin", "labels"], queryFn: () => listLabels() });
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${labelColor(label.color).pill}`}>
      {label.name}
    </span>
  );
}

/** The labels one resident carries, as chips. Nothing when they have none. */
export function LabelChips({ residentId }: { residentId: string }) {
  const { data } = useLabels();
  const ids = data?.byResident[residentId] ?? [];
  const mine = (data?.labels ?? []).filter((l) => ids.includes(l.id));
  if (!mine.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {mine.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
    </span>
  );
}

function ColorDots({ value, onChange }: { value: LabelColor; onChange: (c: LabelColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          title={LABEL_COLORS[c].name}
          aria-label={LABEL_COLORS[c].name}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`size-5 rounded-full ${LABEL_COLORS[c].dot} ${value === c ? "ring-2 ring-brand-deep ring-offset-1" : ""}`}
        />
      ))}
    </div>
  );
}

/** Make a new label, or change one: a name and a colour. */
function LabelForm({ label, onDone }: { label?: Label; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<LabelColor>(label?.color ?? "sky");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await saveLabel({ data: { ...(label ? { id: label.id } : {}), name, color } });
      await queryClient.invalidateQueries({ queryKey: ["admin", "labels"] });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the label");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input
        autoFocus
        value={name}
        maxLength={30}
        placeholder="Label name"
        className="h-8 text-sm"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
      />
      <ColorDots value={color} onChange={setColor} />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={busy || !name.trim()} onClick={() => void save()}>
          {label ? "Save" : "Add label"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The resident's labels with a Labels button: tick to put one on or take it
 * off, make a new one, rename, recolour or delete. Deleting takes it off
 * everyone, so it asks first.
 */
export function ResidentLabelPicker({ residentId }: { residentId: string }) {
  const queryClient = useQueryClient();
  const { data } = useLabels();
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const mine = new Set(data?.byResident[residentId] ?? []);

  async function toggle(label: Label) {
    try {
      await toggleResidentLabel({ data: { residentId, labelId: label.id, on: !mine.has(label.id) } });
      await queryClient.invalidateQueries({ queryKey: ["admin", "labels"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the label");
    }
  }
  async function remove(label: Label) {
    const users = Object.values(data?.byResident ?? {}).filter((ids) => ids.includes(label.id)).length;
    if (!window.confirm(`Delete "${label.name}"? It comes off ${users} resident${users === 1 ? "" : "s"}.`)) return;
    try {
      await deleteLabel({ data: { id: label.id } });
      await queryClient.invalidateQueries({ queryKey: ["admin", "labels"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the label");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <LabelChips residentId={residentId} />
      <Popover onOpenChange={(open) => !open && (setMaking(false), setEditing(null))}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
          >
            <Tag className="size-3" /> Labels
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2 p-3">
          {data && !data.ready ? (
            <p className="text-xs text-muted-foreground">
              Labels are not set up on this database yet. Run <code>20261013120000_resident_labels.sql</code>.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Shared by every admin. Tick to add or remove.</p>
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {(data?.labels ?? []).map((l) =>
                  editing === l.id ? (
                    <li key={l.id}>
                      <LabelForm label={l} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li key={l.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                      <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => void toggle(l)}>
                        <span className={`flex size-4 items-center justify-center rounded border ${mine.has(l.id) ? "border-brand-deep bg-brand-deep text-white" : "border-border"}`}>
                          {mine.has(l.id) ? <Check className="size-3" /> : null}
                        </span>
                        <LabelChip label={l} />
                      </button>
                      <button type="button" aria-label={`Edit ${l.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(l.id)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${l.name}`} className="text-muted-foreground hover:text-red-700" onClick={() => void remove(l)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ),
                )}
                {data?.labels.length === 0 && !making ? <li className="px-1 text-xs text-muted-foreground">No labels yet.</li> : null}
              </ul>
              {making ? (
                <LabelForm onDone={() => setMaking(false)} />
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => setMaking(true)}>
                  <Plus className="mr-1 size-3.5" /> New label
                </Button>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
