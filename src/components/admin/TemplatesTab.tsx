import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Choice } from "@/components/admin/Choice";
import { Panel } from "@/components/admin/ops-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { docxToHtml, fileToBase64 } from "@/lib/docx-client";
import { createTemplate, listTemplateResidences, listTemplates, type DocTemplate } from "@/lib/templates.functions";

export const TEMPLATE_CATEGORIES = ["Agreement", "Access Card", "Checkout"];

/*
 * Templates kept in the database but not listed yet, because the feature that
 * uses them is not built (Dani, 30 Sep 2026). Checkout Statement waits for the
 * checkout flow. Nothing is deleted: take a key out of here to list it again.
 */
const HIDDEN_DOC_KEYS = new Set(["checkout_statement"]);

/** What the app's own dropdown uses for "none" / "all residences" - it cannot hold an empty value. */
export const ALL = "all";
const NONE = "none";

/** The documents a pack looks templates up by, for a template made for one residence. */
const PACK_DOCUMENTS: { key: string; label: string }[] = [
  { key: NONE, label: "Not part of the document pack" },
  { key: "tenancy_agreement", label: "Tenancy Agreement" },
  { key: "schedule_a", label: "Schedule A – Particulars" },
  { key: "schedule_b", label: "Schedule B – House Rules" },
  { key: "schedule_c", label: "Schedule C – Inventory" },
  { key: "access_card_form", label: "Access Card Form" },
];

/** The residences, by id, for showing which one a template is for. */
function useResidenceNames() {
  const fn = useServerFn(listTemplateResidences);
  const { data } = useQuery({ queryKey: ["template-residences"], queryFn: () => fn() });
  return { list: data ?? [], nameOf: (id: string | null) => (id ? (data ?? []).find((r) => r.id === id)?.name ?? "—" : "All residences") };
}

export const fmtDay = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function VersionStatus({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-primary/10 text-primary border-primary/30"
      : status === "draft"
        ? "bg-accent text-accent-foreground border-border"
        : "bg-muted text-muted-foreground border-border";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>{status}</span>;
}

export function TemplatesTab() {
  const list = useServerFn(listTemplates);
  const { data: all, isLoading } = useQuery({ queryKey: ["doc-templates"], queryFn: () => list() });
  const data = all?.filter((t) => !HIDDEN_DOC_KEYS.has(t.docKey));
  const [adding, setAdding] = useState(false);
  const residences = useResidenceNames();

  const cats = [...new Set([...TEMPLATE_CATEGORIES, ...(data ?? []).map((t) => t.category)])];

  return (
    <Panel
      title="Document Templates"
      description="Manage the templates used to generate tenancy and resident documents."
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Template
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No templates yet. Use <span className="font-medium text-foreground">Add Template</span> to upload your first one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Template</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Residence</th>
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">Last Updated</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            {cats.map((cat) => {
              // set up = has a file uploaded; the rest are listed apart below
              const rows = (data ?? []).filter((t) => t.category === cat && t.versions.length > 0);
              if (!rows.length) return null;
              return (
                <tbody key={cat}>
                  <tr>
                    <td colSpan={7} className="bg-muted/60 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-deep">
                      {cat}
                    </td>
                  </tr>
                  {rows.map((t) => (
                    <TemplateRow key={t.id} t={t} residence={residences.nameOf(t.residenceId)} />
                  ))}
                </tbody>
              );
            })}
            {/*
              A template with nothing uploaded has not been set up, so it shows
              no category or residence rather than defaults that read as chosen
              (30 Sep 2026). They are set in Manage when its file is added.
            */}
            {(data ?? []).some((t) => !t.versions.length) ? (
              <tbody>
                <tr>
                  <td colSpan={7} className="bg-muted/60 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Not set up yet
                  </td>
                </tr>
                {(data ?? [])
                  .filter((t) => !t.versions.length)
                  .map((t) => (
                    <TemplateRow key={t.id} t={t} residence="" />
                  ))}
              </tbody>
            ) : null}
          </table>
        </div>
      )}
      <AddTemplateDialog open={adding} onOpenChange={setAdding} />
    </Panel>
  );
}

function TemplateRow({ t, residence }: { t: DocTemplate; residence: string }) {
  const active = t.versions.find((v) => v.status === "active");
  const shown = active ?? t.versions[0];
  const hasDraft = t.versions.some((v) => v.status === "draft");
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-3 font-medium text-brand-deep">{t.name}</td>
      <td className="py-2.5 pr-3 text-muted-foreground">{t.versions.length ? t.category : "—"}</td>
      <td className="py-2.5 pr-3 text-muted-foreground">{t.versions.length ? residence : "—"}</td>
      <td className="py-2.5 pr-3">{shown ? `v${shown.version}` : "—"}</td>
      <td className="py-2.5 pr-3 text-muted-foreground">{fmtDay(shown?.updatedAt)}</td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1.5">
          {shown ? <VersionStatus status={shown.status} /> : <span className="text-[11px] text-muted-foreground">No versions</span>}
          {active && hasDraft && <span className="text-[11px] text-muted-foreground">+ draft</span>}
        </div>
      </td>
      <td className="py-2.5">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/settings/templates/$id" params={{ id: t.id }}>
            Manage
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function AddTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useServerFn(createTemplate);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Agreement");
  const [file, setFile] = useState<File | null>(null);
  const [initial, setInitial] = useState("");
  const [residenceId, setResidenceId] = useState(ALL);
  const [docKey, setDocKey] = useState(NONE);
  const residences = useResidenceNames();
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Enter a template name"); return; }
    setBusy(true);
    try {
      let html = file ? await docxToHtml(file) : "";
      const extra = initial
        .split(/[\s,]+/)
        .map((s) => s.replace(/[{}]/g, "").trim())
        .filter(Boolean);
      if (extra.length) html += `<p>${extra.map((k) => `{{${k}}}`).join(" ")}</p>`;
      const res = await create({
        data: {
          name: name.trim(),
          category,
          contentHtml: html,
          residenceId: residenceId === ALL ? null : residenceId,
          docKey: docKey === NONE ? "" : docKey,
          ...(file ? { file: { name: file.name, base64: await fileToBase64(file) } } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      onOpenChange(false);
      toast.success("Template created as v1 Draft");
      navigate({ to: "/admin/settings/templates/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add template</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Only for a completely new document type. To update an existing template, open it with Manage.
        </p>
        <div className="space-y-3">
          <div>
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Choice label="Category" value={category} onChange={setCategory} options={TEMPLATE_CATEGORIES} />
          <Choice
            label="Residence"
            value={residenceId}
            onChange={setResidenceId}
            options={[{ value: ALL, label: "All residences" }, ...residences.list.map((r) => ({ value: r.id, label: r.name }))]}
          />
          {residenceId !== ALL ? (
            <div className="space-y-1">
              <Choice
                label="Used in the document pack as"
                value={docKey}
                onChange={setDocKey}
                options={PACK_DOCUMENTS.filter((d) => !HIDDEN_DOC_KEYS.has(d.key)).map((d) => ({ value: d.key, label: d.label }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Residents of this residence get this one instead of the one for all residences.
              </p>
            </div>
          ) : null}
          <div>
            <Label>Template file (Word .docx, or a PDF form)</Label>
            <Input type="file" accept=".docx,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Initial placeholders (optional)</Label>
            <Textarea
              placeholder="resident_full_name, passport_no, unit_no"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create v1 Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
