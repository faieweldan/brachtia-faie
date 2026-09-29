import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fmtDay, VersionStatus } from "@/components/admin/TemplatesTab";
import { MARK_CSS, Paper } from "@/components/admin/TemplatePaper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { docxToHtml, fileToBase64 } from "@/lib/docx-client";
import {
  describeMapping,
  detectPlaceholders,
  FIELD_SOURCES,
  formulaUnknownTokens,
  mappingFor,
  renderTemplate,
  TEMPLATE_FIELDS,
  unmapped,
  type Mapping,
  type MappingResult,
  type Mappings,
} from "@/lib/template-fields";
import {
  activateVersion,
  listTemplates,
  saveDraft,
  saveMappings,
  searchResidents,
  testMapping,
  type DocTemplate,
} from "@/lib/templates.functions";

export const Route = createFileRoute("/admin/settings_/templates/$id")({
  head: () => ({
    meta: [
      { title: "Template workspace — Brachtia Admin" },
      { name: "description", content: "Edit, test and activate a document template version." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TemplateWorkspace,
});

type TestState = { resident: { id: string; name: string; code: string }; results: MappingResult[] } | null;

function TemplateWorkspace() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const list = useServerFn(listTemplates);
  const save = useServerFn(saveDraft);
  const activate = useServerFn(activateVersion);
  const runTest = useServerFn(testMapping);
  const { data } = useQuery({ queryKey: ["doc-templates"], queryFn: () => list() });
  const tpl = data?.find((t) => t.id === id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const [picker, setPicker] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<Mappings>({});
  const saveMaps = useServerFn(saveMappings);
  const mapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = tpl?.versions.find((v) => v.id === selectedId) ?? tpl?.versions.find((v) => v.status === "draft") ?? tpl?.versions.find((v) => v.status === "active") ?? tpl?.versions[0];
  const active = tpl?.versions.find((v) => v.status === "active");

  useEffect(() => {
    if (editing && editorRef.current) editorRef.current.innerHTML = draftHtml;
    // only when entering edit mode / file replaced
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, pendingFile]);

  const html = editing ? draftHtml : (selected?.contentHtml ?? "");
  const placeholders = useMemo(() => detectPlaceholders(html), [html]);
  const bad = unmapped(placeholders, maps);
  const selKey = selected?.id;
  useEffect(() => { setMaps(selected?.mappings ?? {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selKey]);
  const canMap = selected?.status === "draft" || editing;

  function setMap(ph: string, m: Mapping | null) {
    const next = { ...maps };
    if (m) next[ph] = m; else delete next[ph];
    setMaps(next);
    if (selected?.status === "draft" && !editing) {
      if (mapTimer.current) clearTimeout(mapTimer.current);
      mapTimer.current = setTimeout(() => {
        saveMaps({ data: { versionId: selected.id, mappings: next } })
          .then(() => qc.invalidateQueries({ queryKey: ["doc-templates"] }))
          .catch((e) => toast.error(e instanceof Error ? e.message : "Could not save mapping"));
      }, 600);
    }
  }

  if (!tpl) {
    return <p className="p-6 text-sm text-muted-foreground">{data ? "Template not found." : "Loading…"}</p>;
  }
  if (!selected) {
    return <EmptyTemplate tpl={tpl} onDone={() => qc.invalidateQueries({ queryKey: ["doc-templates"] })} />;
  }

  function startEdit() {
    setDraftHtml(selected!.contentHtml);
    setEditing(true);
  }

  async function onFile(f: File) {
    try {
      const h = await docxToHtml(f);
      setPendingFile(f);
      setDraftHtml(h);
      if (!editing) setEditing(true);
      else if (editorRef.current) editorRef.current.innerHTML = h;
      toast.success("File loaded — save as draft to keep it");
    } catch {
      toast.error("Could not read that file. Upload a Word .docx file.");
    }
  }

  function insert(key: string) {
    if (!editing) { toast.message("Click Edit / New draft first"); return; }
    editorRef.current?.focus();
    document.execCommand("insertText", false, `{{${key}}}`);
    setDraftHtml(editorRef.current?.innerHTML ?? draftHtml);
  }

  async function doSave() {
    setBusy(true);
    try {
      const res = await save({
        data: {
          templateId: tpl!.id,
          fromVersionId: selected!.id,
          contentHtml: editorRef.current?.innerHTML ?? draftHtml,
          ...(pendingFile ? { file: { name: pendingFile.name, base64: await fileToBase64(pendingFile) } } : {}),
        },
      });
      await saveMaps({ data: { versionId: res.versionId, mappings: maps } });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      setSelectedId(res.versionId);
      setEditing(false);
      setPendingFile(null);
      toast.success("Saved as draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function doActivate() {
    if (bad.length) { toast.error("Map every placeholder first"); return; }
    setBusy(true);
    try {
      // activate what is on screen: a pending or failed auto-save would
      // otherwise leave the server checking an older set of mappings
      if (mapTimer.current) clearTimeout(mapTimer.current);
      await saveMaps({ data: { versionId: selected!.id, mappings: maps } });
      await activate({ data: { versionId: selected!.id } });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success(`v${selected!.version} is now Active`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not activate");
    } finally {
      setBusy(false);
    }
  }

  async function pickResident(rid: string) {
    setPicker(false);
    try {
      setTest(await runTest({ data: { residentId: rid, placeholders, mappings: maps } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  }

  const resultsByKey = test ? Object.fromEntries(test.results.map((r) => [r.key, r])) : undefined;
  const previewHtml = renderTemplate(html, resultsByKey, maps);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/admin/settings" search={{ tab: "templates" }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Templates
          </Link>
          <h1 className="text-xl font-bold text-brand-deep">{tpl.name}</h1>
        </div>
      </div>

      {test && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm">
          <span>
            <FlaskConical className="mr-1.5 inline h-4 w-4 text-primary" />
            <b>Test Mode</b> · Testing with: <b>{test.resident.name}</b> · {test.resident.code || "no ID yet"}
            <span className="ml-2 text-xs text-muted-foreground">Preview only — nothing is saved or generated.</span>
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicker(true)}>Change Resident</Button>
            <Button size="sm" variant="outline" onClick={() => setTest(null)}>Exit Test Mode</Button>
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_340px]">
        {/* LEFT */}
        <aside className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
          <dl className="space-y-2">
            <div><dt className="text-xs text-muted-foreground">Template</dt><dd className="font-medium">{tpl.name}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{tpl.category}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Current version</dt><dd>{active ? `v${active.version}` : "None active"}</dd></div>
          </dl>
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-deep">Version history</p>
            <ul className="space-y-1">
              {tpl.versions.map((v) => (
                <li key={v.id}>
                  <button
                    disabled={editing}
                    onClick={() => setSelectedId(v.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left ${v.id === selected.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <span>v{v.version}<span className="ml-1 text-[11px] text-muted-foreground">{fmtDay(v.updatedAt)}</span></span>
                    <VersionStatus status={v.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* CENTRE */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">v{selected.version}</span>
            <VersionStatus status={editing && selected.status !== "draft" ? "draft" : selected.status} />
            {selected.fileName && <span className="text-xs text-muted-foreground">{selected.fileName}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Upload className="mr-1 h-3.5 w-3.5" /> {selected.fileName || pendingFile ? "Replace file" : "Upload file"}
                <input type="file" accept=".docx" className="hidden" disabled={!!test} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              </label>
              {!editing ? (
                <Button size="sm" variant="outline" disabled={!!test} onClick={startEdit}>
                  {selected.status === "draft" ? "Edit draft" : "New draft from this"}
                </Button>
              ) : (
                <>
                  <select
                    value=""
                    onMouseDown={() => editorRef.current?.focus()}
                    onChange={(e) => { if (e.target.value) insert(e.target.value); }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Insert field…</option>
                    {FIELD_SOURCES.map((src) => (
                      <optgroup key={src} label={src}>
                        {TEMPLATE_FIELDS.filter((f) => f.source === src).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPendingFile(null); }}>Cancel</Button>
                  <Button size="sm" disabled={busy} onClick={doSave}>Save as Draft</Button>
                </>
              )}
              <Button size="sm" variant="outline" disabled={editing} onClick={() => setPicker(true)}>
                <FlaskConical className="mr-1 h-3.5 w-3.5" /> Test Mapping
              </Button>
              {selected.status === "draft" && !editing && (
                <Button size="sm" disabled={busy || bad.length > 0} onClick={doActivate}>Activate Version</Button>
              )}
            </div>
          </div>
          {selected.status !== "draft" && !editing && (
            <p className="mb-2 text-xs text-muted-foreground">
              {selected.status === "active" ? "The Active version can't be edited directly — changes become a new draft." : "Archived versions are kept for history and are read-only."}
            </p>
          )}
          <Paper>
            {editing ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setDraftHtml((e.target as HTMLDivElement).innerHTML)}
                className={`min-h-[900px] outline-none ${MARK_CSS}`}
              />
            ) : html ? (
              <div className={MARK_CSS} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p className="py-24 text-center text-sm text-muted-foreground">No content yet — upload a Word file or start a draft.</p>
            )}
          </Paper>
        </section>

        {/* RIGHT */}
        <aside className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
          {test ? (
            <>
              <p className="text-xs font-semibold text-brand-deep">Mapping Test</p>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="pb-1">Placeholder</th><th className="pb-1">Value</th><th className="pb-1">Result</th></tr></thead>
                <tbody>
                  {test.results.map((r) => (
                    <tr key={r.key} className="border-t border-border align-top">
                      <td className="py-1.5 pr-1"><code>{r.key}</code><div className="text-[10px] text-muted-foreground">{r.source}</div></td>
                      <td className="py-1.5 pr-1">{r.value || "—"}</td>
                      <td className="py-1.5 whitespace-nowrap">
                        {r.result === "mapped" ? <span className="text-primary">✓ Mapped</span> : r.result === "missing" ? <span className="text-muted-foreground">⚠ Missing Value</span> : <span className="text-destructive">✕ Unmapped</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs font-semibold text-brand-deep">Field mapping</p>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {canMap ? "Choose where each placeholder gets its value, or type a formula." : "Mappings of Active and Archived versions are read-only — start a new draft to change them."}
                </p>
                {bad.length > 0 && (
                  <p className="mb-3 flex gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {bad.length} not mapped yet — map them before activating.
                  </p>
                )}
                {placeholders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No placeholders found. Placeholders look like {"{{Resident_full_name}}"}.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {placeholders.map((k) => (
                      <MappingRow key={k} ph={k} mapping={mappingFor(k, maps)} disabled={!canMap} onChange={(m) => setMap(k, m)} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <ResidentPicker open={picker} onOpenChange={setPicker} onPick={pickResident} />
    </div>
  );
}

function MappingRow({ ph, mapping, disabled, onChange }: { ph: string; mapping: Mapping | null; disabled: boolean; onChange: (m: Mapping | null) => void }) {
  const value = !mapping ? "" : mapping.kind === "field" ? `field:${mapping.key}` : mapping.kind;
  const ok = mapping && (mapping.kind !== "formula" || mapping.expr.trim());
  const unknown = mapping?.kind === "formula" ? formulaUnknownTokens(mapping.expr) : [];
  return (
    <li className={`rounded-lg border p-2 ${ok ? "border-border" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <code className="truncate text-[11px]" title={ph}>{ph}</code>
        {ok ? <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-primary" />{describeMapping(mapping)}</span> : <span className="shrink-0 text-[10px] text-destructive">Not mapped</span>}
      </div>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(null);
          else if (v === "formula") onChange({ kind: "formula", expr: mapping?.kind === "field" ? `[${mapping.key}]` : "" });
          else if (v === "blank") onChange({ kind: "blank" });
          else onChange({ kind: "field", key: v.slice(6) });
        }}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-70"
      >
        <option value="">Choose a value…</option>
        {FIELD_SOURCES.map((src) => (
          <optgroup key={src} label={src}>
            {TEMPLATE_FIELDS.filter((f) => f.source === src).map((f) => <option key={f.key} value={`field:${f.key}`}>{f.label}</option>)}
          </optgroup>
        ))}
        <optgroup label="Custom">
          <option value="formula">Formula…</option>
          <option value="blank">Leave blank (filled by hand)</option>
        </optgroup>
      </select>
      {mapping?.kind === "formula" && (
        <>
          <Input
            disabled={disabled}
            className="mt-1.5 h-8 font-mono text-xs"
            placeholder="e.g. [unit_no] - [room_no]"
            value={mapping.expr}
            onChange={(e) => onChange({ kind: "formula", expr: e.target.value })}
          />
          <p className={`mt-1 text-[10px] ${unknown.length ? "text-destructive" : "text-muted-foreground"}`}>
            {unknown.length ? `Unknown field: ${unknown.join(", ")}` : "Type text and put field names in [brackets]."}
          </p>
        </>
      )}
    </li>
  );
}

function EmptyTemplate({ tpl, onDone }: { tpl: DocTemplate; onDone: () => void }) {
  const save = useServerFn(saveDraft);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setBusy(true);
    try {
      const html = await docxToHtml(f);
      await save({ data: { templateId: tpl.id, contentHtml: html, file: { name: f.name, base64: await fileToBase64(f) } } });
      toast.success("v1 saved as Draft");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file. Upload a Word .docx file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Link to="/admin/settings" search={{ tab: "templates" }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Templates
      </Link>
      <h1 className="text-xl font-bold text-brand-deep">{tpl.name}</h1>
      <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center">
        <p className="text-sm font-medium">No versions yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Upload the Word file for this template to create v1 as a Draft.</p>
        <label className="mt-4 inline-flex cursor-pointer items-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted">
          <Upload className="mr-1.5 h-4 w-4" /> {busy ? "Uploading…" : "Upload .docx"}
          <input type="file" accept=".docx" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}

function ResidentPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (id: string) => void }) {
  const search = useServerFn(searchResidents);
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["tpl-resident-search", q], queryFn: () => search({ data: { q } }), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Select Test Resident</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Search by name or Resident ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(data ?? []).map((r: { id: string; name: string; code: string }) => (
            <li key={r.id}>
              <button onClick={() => onPick(r.id)} className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span>{r.name}</span><span className="text-xs text-muted-foreground">{r.code || "—"}</span>
              </button>
            </li>
          ))}
          {data && data.length === 0 && <li className="text-sm text-muted-foreground">No residents found.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
