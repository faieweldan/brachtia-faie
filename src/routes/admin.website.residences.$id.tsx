import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteResidence,
  deleteRoomType,
  listResidences,
  saveResidence,
  saveRoomType,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AreaField, Field, RowList, Section, StringList, TextField } from "@/components/admin/fields";
import { GalleryEditor, ImageList } from "@/components/admin/GalleryEditor";
import { ImageField } from "@/components/admin/ImageUploader";

export const Route = createFileRoute("/admin/website/residences/$id")({
  component: ResidenceEditor,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

type Place = { name: string; distance: string; walk: string; bike: string; transit: string };
const blankPlace = (): Place => ({ name: "", distance: "", walk: "", bike: "", transit: "" });

const FEE_FIELDS: { key: string; label: string }[] = [
  { key: "advanceMonths", label: "Advance months" },
  { key: "utilitiesMonths", label: "Utilities deposit (months)" },
  { key: "securityMonths", label: "Security deposit (months)" },
  { key: "accessCardDeposit", label: "Access card deposit (RM)" },
  { key: "accessCardCharge", label: "Access card charge (RM)" },
  { key: "adminFee", label: "Admin fee (RM)" },
];

const EDITABLE_KEYS = [
  "name",
  "slug",
  "location",
  "tagline",
  "summary",
  "description",
  "published",
  "sort_order",
  "hero_image",
  "gallery",
  "building_facilities",
  "included_in_stay",
  "utilities_note",
  "inside_apartment",
  "apartment_footnote",
  "coords",
  "waze_url",
  "nearby_universities",
  "points_of_interest",
  "payment_cycle",
  "payment_terms",
  "contract_terms",
  "terms",
  "single_bed_options",
  "fee_config",
];

const NAV = [
  { id: "basics", label: "Basics" },
  { id: "photos", label: "Photos" },
  { id: "facilities", label: "Facilities" },
  { id: "location", label: "Location" },
  { id: "terms", label: "Terms & fees" },
  { id: "rooms", label: "Room types" },
];

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function ResidenceEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });

  const residence: any = useMemo(
    () => ((data as any)?.residences ?? []).find((r: any) => r.id === id),
    [data, id],
  );
  const rooms: any[] = useMemo(
    () => ((data as any)?.rooms ?? []).filter((r: any) => r.residence_id === id),
    [data, id],
  );

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (residence) setForm((f: any) => f ?? JSON.parse(JSON.stringify(residence)));
  }, [residence]);

  const set = (key: string, value: unknown) => setForm((f: any) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => saveResidence({ data: { id, values } }),
    onSuccess: () => {
      toast.success("Changes saved");
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
    },
    onError: () => toast.error("Could not save"),
  });

  const remove = useMutation({
    mutationFn: () => deleteResidence({ data: { id } }),
    onSuccess: () => {
      toast.success("Residence deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
      void navigate({ to: "/admin/website/residences" });
    },
    onError: () => toast.error("Could not delete"),
  });

  const dirty = useMemo(() => {
    if (!form || !residence) return false;
    return EDITABLE_KEYS.some(
      (k) => JSON.stringify(form[k] ?? null) !== JSON.stringify(residence[k] ?? null),
    );
  }, [form, residence]);

  const saveAll = () => {
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    EDITABLE_KEYS.forEach((k) => (values[k] = form[k]));
    save.mutate(values);
  };

  if (isLoading || !form) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const fees = form.fee_config ?? {};
  const folder = `residences/${id}`;

  return (
    <div className="pb-28">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs">
            <Link to="/admin/website/residences">
              <ArrowLeft className="mr-1 size-3.5" /> All residences
            </Link>
          </Button>
          <h1 className="truncate text-xl font-semibold text-brand-deep">{form.name || "Residence"}</h1>
          <p className="text-xs text-muted-foreground">/{form.slug}</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={!!form.published} onCheckedChange={(v) => set("published", v)} />
            Published
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("Delete this residence and all its rooms?")) remove.mutate();
            }}
          >
            <Trash2 className="mr-1 size-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Section nav */}
        <nav className="sticky top-6 hidden h-fit w-44 shrink-0 flex-col gap-0.5 lg:flex">
          {NAV.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-brand-deep"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex gap-1 overflow-x-auto lg:hidden">
            {NAV.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
              >
                {s.label}
              </a>
            ))}
          </div>

          <div className="space-y-8">
            {/* Basics */}
            <Section id="basics" title="Basics">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" value={form.name} onChange={(v) => set("name", v)} />
                <TextField label="Slug (URL)" value={form.slug} onChange={(v) => set("slug", v)} />
                <TextField label="Location" value={form.location} onChange={(v) => set("location", v)} />
                <TextField label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
              </div>
              <AreaField label="Summary" value={form.summary ?? ""} onChange={(v) => set("summary", v)} />
              <StringList
                label="Description paragraphs"
                items={form.description ?? []}
                multiline
                onChange={(v) => set("description", v)}
                addLabel="Add paragraph"
              />
              <TextField
                label="Sort order"
                type="number"
                value={form.sort_order}
                onChange={(v) => set("sort_order", Number(v || 0))}
                className="w-36"
              />
            </Section>

            {/* Photos */}
            <Section
              id="photos"
              title="Photos"
              description="Upload directly. The hero photo shows first on the residence page; gallery photos are grouped by category."
            >
              <ImageField
                label="Hero photo"
                value={form.hero_image ?? ""}
                folder={folder}
                onChange={(v) => set("hero_image", v)}
              />
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Gallery</span>
                <GalleryEditor
                  items={form.gallery ?? []}
                  folder={folder}
                  onChange={(v) => set("gallery", v)}
                />
              </div>
            </Section>

            {/* Facilities */}
            <Section id="facilities" title="Facilities & amenities">
              <div className="grid gap-6 lg:grid-cols-2">
                <StringList
                  label="Building facilities"
                  items={form.building_facilities ?? []}
                  onChange={(v) => set("building_facilities", v)}
                />
                <StringList
                  label="Included in your stay"
                  items={form.included_in_stay ?? []}
                  onChange={(v) => set("included_in_stay", v)}
                />
                <StringList
                  label="Inside your apartment"
                  items={form.inside_apartment ?? []}
                  onChange={(v) => set("inside_apartment", v)}
                />
                <div className="space-y-4">
                  <AreaField
                    label="Utilities note"
                    value={form.utilities_note ?? ""}
                    onChange={(v) => set("utilities_note", v)}
                  />
                  <TextField
                    label="Apartment footnote"
                    value={form.apartment_footnote ?? ""}
                    onChange={(v) => set("apartment_footnote", v)}
                  />
                </div>
              </div>
            </Section>

            {/* Location */}
            <Section id="location" title="Where you'll be">
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Latitude"
                  value={form.coords?.lat}
                  onChange={(v) => set("coords", { ...(form.coords ?? {}), lat: Number(v || 0) })}
                />
                <TextField
                  label="Longitude"
                  value={form.coords?.lng}
                  onChange={(v) => set("coords", { ...(form.coords ?? {}), lng: Number(v || 0) })}
                />
                <TextField label="Waze link" value={form.waze_url} onChange={(v) => set("waze_url", v)} />
              </div>
              <RowList<Place>
                label="Nearby universities"
                items={form.nearby_universities ?? []}
                columns={[
                  { key: "name", label: "Name" },
                  { key: "distance", label: "Distance" },
                  { key: "walk", label: "Walk" },
                  { key: "bike", label: "Bike" },
                  { key: "transit", label: "Transit" },
                ]}
                blank={blankPlace}
                onChange={(v) => set("nearby_universities", v)}
              />
              <RowList<Place>
                label="Points of interest"
                items={form.points_of_interest ?? []}
                columns={[
                  { key: "name", label: "Name" },
                  { key: "distance", label: "Distance" },
                  { key: "walk", label: "Walk" },
                  { key: "bike", label: "Bike" },
                  { key: "transit", label: "Transit" },
                ]}
                blank={blankPlace}
                onChange={(v) => set("points_of_interest", v)}
              />
            </Section>

            {/* Terms & fees */}
            <Section id="terms" title="Terms & fees">
              <div className="grid gap-6 sm:grid-cols-2">
                <Field
                  label="Contract lengths offered"
                  hint="Which stay lengths students can price on the website."
                >
                  <div className="flex gap-4 pt-1">
                    {(["long", "short"] as const).map((t) => {
                      const on = (form.contract_terms ?? []).includes(t);
                      return (
                        <label key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch
                            checked={on}
                            onCheckedChange={(v) =>
                              set(
                                "contract_terms",
                                v
                                  ? [...(form.contract_terms ?? []), t]
                                  : (form.contract_terms ?? []).filter((x: string) => x !== t),
                              )
                            }
                          />
                          {t === "long" ? "12-month" : "Short-term"}
                        </label>
                      );
                    })}
                  </div>
                </Field>
                <Field
                  label="Payment frequencies offered"
                  hint="Shown as choices in the student's move-in cost calculator. Short-term stays are always paid in full."
                >
                  <div className="flex flex-wrap gap-4 pt-1">
                    {PAYMENT_TERMS.map((t) => {
                      const list: string[] = form.payment_terms ?? [];
                      const on = list.includes(t.key);
                      return (
                        <label
                          key={t.key}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Switch
                            checked={on}
                            onCheckedChange={(v) =>
                              set(
                                "payment_terms",
                                v
                                  ? [...list, t.key]
                                  : list.filter((x) => x !== t.key),
                              )
                            }
                          />
                          {t.label}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Payment cycle note"
                  value={form.payment_cycle}
                  onChange={(v) => set("payment_cycle", v)}
                  placeholder="e.g. Rental payable bi-monthly"
                  hint="Free-text line shown on the residence terms — not a selectable option."
                />
              </div>

              {/* Fee table */}
              <div className="overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Fee</span>
                  <span>12-month</span>
                  <span>Short-term</span>
                </div>
                {FEE_FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                    {(["long", "short"] as const).map((term) => (
                      <Input
                        key={term}
                        type="number"
                        className="h-8 text-xs"
                        value={fees?.[term]?.[f.key] ?? ""}
                        onChange={(e) =>
                          set("fee_config", {
                            ...fees,
                            [term]: { ...(fees?.[term] ?? {}), [f.key]: Number(e.target.value || 0) },
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <StringList
                  label="Terms & conditions"
                  items={form.terms ?? []}
                  multiline
                  onChange={(v) => set("terms", v)}
                />
                <StringList
                  label="Single bed options"
                  items={form.single_bed_options ?? []}
                  onChange={(v) => set("single_bed_options", v)}
                />
              </div>
            </Section>

            <RoomsSection residenceId={id} rooms={rooms} />
          </div>
        </div>
      </div>

      {/* Sticky save bar */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <p className="text-xs text-muted-foreground">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm(JSON.parse(JSON.stringify(residence)))}
              >
                Discard
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={saveAll}>
                {save.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Rooms ---------------- */

function blankRoom(residenceId: string, sortOrder: number) {
  return {
    residence_id: residenceId,
    code: `room-${Date.now().toString().slice(-5)}`,
    tag: "",
    room_code: "",
    name: "New room type",
    unit_type: "",
    description: "",
    size_sqft: null,
    size_label: "",
    bathroom: "shared",
    has_view: false,
    view_type: "",
    public_visible: true,
    image: "",
    gallery: [],
    features: [],
    occupancies: ["single"],
    rent: { long: { single: null, twin: null }, short: { single: null, twin: null } },
    status: "available",
    beds: {},
    furnishing: [],
    sort_order: sortOrder,
  };
}

function RoomsSection({ residenceId, rooms }: { residenceId: string; rooms: any[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);

  const save = useMutation({
    mutationFn: (input: { id?: string; values: Record<string, unknown> }) =>
      saveRoomType({ data: input }),
    onSuccess: () => {
      toast.success("Room saved");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
    },
    onError: () => toast.error("Could not save room"),
  });

  const remove = useMutation({
    mutationFn: (rid: string) => deleteRoomType({ data: { id: rid } }),
    onSuccess: () => {
      toast.success("Room deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "residences"] });
    },
    onError: () => toast.error("Could not delete room"),
  });

  const rate = (r: any, term: string, occ: string) => r?.rent?.[term]?.[occ] ?? null;
  const set = (key: string, value: unknown) => setEditing((e: any) => ({ ...e, [key]: value }));
  const setRent = (term: string, occ: string, v: string) =>
    setEditing((e: any) => ({
      ...e,
      rent: { ...(e.rent ?? {}), [term]: { ...(e.rent?.[term] ?? {}), [occ]: num(v) } },
    }));

  return (
    <Section
      id="rooms"
      title="Room types & pricing"
      description="Blank rate means that option is not offered."
      action={
        <Button size="sm" onClick={() => setEditing(blankRoom(residenceId, rooms.length))}>
          <Plus className="mr-1 size-4" /> Add room type
        </Button>
      }
    >
      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No room types yet.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {rooms.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-deep">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.unit_type || "—"} · {r.bathroom} bathroom ·{" "}
                  {r.public_visible ? "Visible" : "Hidden"}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>12-mo: {rate(r, "long", "single") ?? "—"} / {rate(r, "long", "twin") ?? "—"}</p>
                <p>Short: {rate(r, "short", "single") ?? "—"} / {rate(r, "short", "twin") ?? "—"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...r })}>
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Delete ${r.name}?`)) remove.mutate(r.id);
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit room type" : "New room type"}</DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" value={editing.name} onChange={(v) => set("name", v)} />
                <TextField label="Unit type" value={editing.unit_type} onChange={(v) => set("unit_type", v)} />
                <TextField label="Room code (A, B…)" value={editing.room_code} onChange={(v) => set("room_code", v)} />
                <TextField label="Admin tag" value={editing.tag} onChange={(v) => set("tag", v)} />
                <TextField label="Internal code (unique)" value={editing.code} onChange={(v) => set("code", v)} />
                <TextField
                  label="Sort order"
                  type="number"
                  value={editing.sort_order}
                  onChange={(v) => set("sort_order", Number(v || 0))}
                />
              </div>

              <AreaField
                label="Description"
                value={editing.description ?? ""}
                onChange={(v) => set("description", v)}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Size (sqft)"
                  type="number"
                  value={editing.size_sqft ?? ""}
                  onChange={(v) => set("size_sqft", num(v))}
                />
                <TextField label="Size label" value={editing.size_label ?? ""} onChange={(v) => set("size_label", v)} />
                <Field label="Bathroom">
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={editing.bathroom}
                    onChange={(e) => set("bathroom", e.target.value)}
                  >
                    <option value="shared">Shared</option>
                    <option value="ensuite">Ensuite</option>
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={!!editing.has_view} onCheckedChange={(v) => set("has_view", v)} />
                  Has a view
                </label>
                <Input
                  className="w-48"
                  placeholder="View type (e.g. Exterior)"
                  value={editing.view_type ?? ""}
                  onChange={(e) => set("view_type", e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={editing.public_visible !== false}
                    onCheckedChange={(v) => set("public_visible", v)}
                  />
                  Visible on the website
                </label>
              </div>

              <div className="rounded-md border border-border p-3">
                <p className="mb-2 text-xs font-semibold text-brand-deep">Monthly rent per person (RM)</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(["long", "short"] as const).map((term) =>
                    (["single", "twin"] as const).map((occ) => (
                      <TextField
                        key={`${term}-${occ}`}
                        label={`${term === "long" ? "12-month" : "Short"} · ${occ === "single" ? "Single" : "Twin"}`}
                        type="number"
                        value={editing.rent?.[term]?.[occ] ?? ""}
                        onChange={(v) => setRent(term, occ, v)}
                      />
                    )),
                  )}
                </div>
              </div>

              <Field label="Occupancies offered">
                <div className="flex gap-6 pt-2">
                  {(["single", "twin"] as const).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={(editing.occupancies ?? []).includes(o)}
                        onCheckedChange={(v) =>
                          set(
                            "occupancies",
                            v
                              ? [...(editing.occupancies ?? []), o]
                              : (editing.occupancies ?? []).filter((x: string) => x !== o),
                          )
                        }
                      />
                      {o === "single" ? "Single" : "Twin sharing"}
                    </label>
                  ))}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Bed setup — single"
                  value={editing.beds?.single ?? ""}
                  onChange={(v) => set("beds", { ...(editing.beds ?? {}), single: v })}
                />
                <TextField
                  label="Bed setup — twin"
                  value={editing.beds?.twin ?? ""}
                  onChange={(v) => set("beds", { ...(editing.beds ?? {}), twin: v })}
                />
              </div>

              <ImageField
                label="Main photo"
                value={editing.image ?? ""}
                folder={`residences/${residenceId}/rooms`}
                onChange={(v) => set("image", v)}
              />
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Gallery photos</span>
                <ImageList
                  items={editing.gallery ?? []}
                  folder={`residences/${residenceId}/rooms`}
                  onChange={(v) => set("gallery", v)}
                />
              </div>
              <StringList label="Features" items={editing.features ?? []} onChange={(v) => set("features", v)} />
              <StringList
                label="Furnishing"
                items={editing.furnishing ?? []}
                onChange={(v) => set("furnishing", v)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => {
                const { id: rid, created_at: _c, updated_at: _u, ...values } = editing;
                save.mutate(rid ? { id: rid, values } : { values });
              }}
            >
              Save room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
