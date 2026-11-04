import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, PenLine, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/admin/ops-ui";
import { getStaffSettings, saveStaffMember } from "@/lib/staff.functions";

type Row = { name: string; title: string; active: boolean; image: string };

/**
 * Settings → Staff (Dani, 4 Nov 2026) - was Signatory, one person for every
 * document.
 *
 * Everyone who can be chosen in a staff dropdown, each with their own
 * signature. The person chosen as Prepared by, Approved by or Issued by signs
 * what they make, wherever a template has {{Admin_signature}}. A new signature
 * never replaces an old one on documents already made. Nobody is deleted: old
 * records name them, so someone who has left is marked so and drops out of
 * the dropdowns.
 */
export function StaffTab() {
  const { data, isLoading } = useQuery({ queryKey: ["staff-settings"], queryFn: () => getStaffSettings() });
  // the row open for editing: a name, "new" for Add staff, or none
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      title="Staff"
      description="Everyone who can be chosen in Assign staff, Prepared by, Approved by, Issued by and Record payment. The person chosen signs what they prepare, approve or issue, with the signature saved here."
      action={
        <Button type="button" size="sm" variant="outline" disabled={open === "new"} onClick={() => setOpen("new")}>
          <Plus className="mr-1 size-4" /> Add staff
        </Button>
      }
    >
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_6rem] gap-3 bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Title</span>
            <span>Signature</span>
            <span />
          </div>
          {(data ?? []).map((s) =>
            open === s.name ? (
              <StaffForm key={s.name} row={s} onClose={() => setOpen(null)} />
            ) : (
              <div
                key={s.name}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_6rem] ${s.active ? "" : "text-muted-foreground"}`}
              >
                <span className="min-w-0 truncate font-medium">
                  {s.name}
                  {s.active ? null : <span className="ml-2 text-xs font-normal">No longer working here</span>}
                </span>
                <span className="order-3 min-w-0 truncate text-xs text-muted-foreground sm:order-none sm:text-sm">{s.title || "—"}</span>
                <span className="order-4 sm:order-none">
                  {s.image ? (
                    <img src={s.image} alt={`${s.name}'s signature`} className="h-9 max-w-[9rem] object-contain" />
                  ) : (
                    <span className="text-xs text-amber-700">No signature yet</span>
                  )}
                </span>
                <span className="order-2 text-right sm:order-none">
                  <Button type="button" size="sm" variant="ghost" disabled={open !== null} onClick={() => setOpen(s.name)}>
                    Edit
                  </Button>
                </span>
              </div>
            ),
          )}
          {open === "new" ? <StaffForm onClose={() => setOpen(null)} /> : null}
        </div>
      )}
    </Panel>
  );
}

/** One person, being added or changed: the name only when added - it never changes after. */
function StaffForm({ row, onClose }: { row?: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(row?.name ?? "");
  const [title, setTitle] = useState(row?.title ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [drawing, setDrawing] = useState(false);
  // a new signature, drawn or uploaded, not yet saved: a PNG as base64
  const [pending, setPending] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveStaffMember({
        data: { ...(row ? { original: row.name } : {}), name: name.trim(), title: title.trim(), active, ...(pending ? { png: pending } : {}) },
      });
      // every dropdown reads the same list
      await Promise.all([qc.invalidateQueries({ queryKey: ["staff-settings"] }), qc.invalidateQueries({ queryKey: ["staff"] })]);
      toast.success(row ? `${row.name} saved` : `${name.trim()} added`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    try {
      setPending(await toPng(file));
      setDrawing(false);
    } catch {
      toast.error("That file could not be read as a picture.");
    }
  }

  const shown = pending ? `data:image/png;base64,${pending}` : (row?.image ?? "");
  const changed = !row || title.trim() !== row.title || active !== row.active || !!pending;

  return (
    <div className="grid gap-6 border-t border-border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name</Label>
          {row ? (
            <p className="text-sm font-medium">{row.name}</p>
          ) : (
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Norfadirah" autoFocus />
          )}
          <p className="text-[11px] text-muted-foreground">
            {row ? "Kept as it is: old records say this name." : "As it shows in the dropdowns and on documents ({{Admin_name}}). It cannot be changed later."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Admin" />
          <p className="text-[11px] text-muted-foreground">For templates with {"{{Admin_title}}"}.</p>
        </div>
        {row ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            Still working here
          </label>
        ) : null}
        {row && !active ? (
          <p className="text-[11px] text-muted-foreground">Not offered in the dropdowns any more. Records already made by {row.name} keep the name.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Signature</Label>
        {drawing ? (
          <SignaturePad
            onDone={(png) => {
              setPending(png);
              setDrawing(false);
            }}
            onCancel={() => setDrawing(false)}
          />
        ) : (
          <>
            <div className="flex h-36 items-center justify-center rounded-lg border border-border bg-white">
              {shown ? (
                <img src={shown} alt="Signature" className="max-h-28 max-w-[85%] object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No signature yet</span>
              )}
            </div>
            {pending ? <p className="text-[11px] text-amber-700">New signature — not saved yet.</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setDrawing(true)}>
                <PenLine className="mr-1 size-4" /> Draw
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
                  <Upload className="mr-1 size-4" /> Upload picture
                </span>
              </label>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4 md:col-span-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!changed || saving || name.trim().length < 2} onClick={() => void save()}>
          {saving ? "Saving…" : row ? "Save" : "Add staff"}
        </Button>
      </div>
    </div>
  );
}

/** Drawing a signature with a mouse, finger or pen; handed back cropped, as a transparent PNG. */
function SignaturePad({ onDone, onCancel }: { onDone: (png: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // sharp on a high-density screen
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d1a59"; // dark blue, like a pen
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setInked(false);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        className="h-36 w-full touch-none rounded-lg border border-dashed border-brand/50 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = at(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = at(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
          setInked(true);
        }}
        onPointerUp={() => (last.current = null)}
        onPointerLeave={() => (last.current = null)}
      />
      <p className="text-[11px] text-muted-foreground">Sign inside the box.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!inked} onClick={() => onDone(cropped(canvas.current!))}>
          Use this signature
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          <Eraser className="mr-1 size-4" /> Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The inked part of a canvas, with a little margin, as base64 PNG. */
function cropped(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const pad = 8;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png").split(",")[1]!;
}

/** Any picture as a PNG no wider than 900px, as base64. */
async function toPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const k = Math.min(1, 900 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1]!;
  } finally {
    URL.revokeObjectURL(url);
  }
}
