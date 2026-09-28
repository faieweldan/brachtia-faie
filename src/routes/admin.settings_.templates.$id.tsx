import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fmtDay, VersionStatus } from "@/components/admin/TemplatesTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { docxToHtml, fileToBase64 } from "@/lib/docx-client";
import {
  detectPlaceholders,
  FIELD_BY_KEY,
  renderTemplate,
  TEMPLATE_FIELDS,
  type MappingResult,
} from "@/lib/template-fields";
import {
  activateVersion,
  listTemplates,
  saveDraft,
  searchResidents,
  testMapping,
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

const MARK_CSS =
  "[&_mark]:rounded [&_mark]:px-0.5 [&_mark[data-ph=ph]]:bg-primary/15 [&_mark[data-ph=ph]]:text-primary [&_mark[data-ph=ok]]:bg-primary/10 [&_mark[data-ph=unmapped]]:bg-destructive/15 [&_mark[data-ph=unmapped]]:text-destructive [&_mark[data-ph=missing]]:bg-accent [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-center [&_h2]:text-base [&_h2]:font-bold [&_p]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-1";

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

  const selected = tpl?.versions.find((v) => v.id === selectedId) ?? tpl?.versions.find((v) => v.status === "draft") ?? tpl?.versions.find((v) => v.status === "active") ?? tpl?.versions[0];
  const active = tpl?.versions.find((v) => v.status === "active");

  useEffect(() => {
    if (editing && editorRef.current) editorRef.current.innerHTML = draftHtml;
    // only when entering edit mode / file replaced
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, pendingFile]);

  const html = editing ? draftHtml : (selected?.contentHtml ?? "");
  const placeholders = useMemo(() => detectPlaceholders(html), [html]);
  const bad = placeholders.filter((k) => !FIELD_BY_KEY.has(k));

  if (!tpl || !selected) {
    return <p className="p-6 text-sm text-muted-foreground">{data ? "Template not found." : "Loading…"}</p>;
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
    if (!editing) return toast.message("Click Edit / New draft first");
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
    if (bad.length) return toast.error("Fix the unrecognised placeholders first");
    setBusy(true);
    try {
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
      setTest(await runTest({ data: { residentId: rid, placeholders } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  }

  const resultsByKey = test ? Object.fromEntries(test.results.map((r) => [r.key, r])) : undefined;
  const previewHtml = renderTemplate(html, resultsByKey);

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
          <div className="mx-auto max-w-[680px] rounded-lg border border-border bg-background p-8 shadow-sm">
            {editing ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setDraftHtml((e.target as HTMLDivElement).innerHTML)}
                className={`min-h-[500px] text-sm leading-relaxed outline-none ${MARK_CSS}`}
              />
            ) : html ? (
              <div className={`min-h-[500px] text-sm leading-relaxed ${MARK_CSS}`} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p className="py-24 text-center text-sm text-muted-foreground">No content yet — upload a Word file or start a draft.</p>
            )}
          </div>
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
                <p className="mb-2 text-xs font-semibold text-brand-deep">Placeholders in this version</p>
                {bad.length > 0 && (
                  <p className="mb-2 flex gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {bad.length} unrecognised — fix before activating.
                  </p>
                )}
                {placeholders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None found.</p>
                ) : (
                  <ul className="space-y-1">
                    {placeholders.map((k) => {
                      const f = FIELD_BY_KEY.get(k);
                      return (
                        <li key={k} className="flex items-center justify-between gap-2 text-xs">
                          <code className={f ? "" : "text-destructive"}>{`{{${k}}}`}</code>
                          {f ? <span className="flex items-center gap-1 text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-primary" />{f.source}</span> : <span className="text-destructive">Unrecognised</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-brand-deep">Insert a placeholder</p>
                <p className="mb-2 text-[11px] text-muted-foreground">{editing ? "Click in the document, then pick a field." : "Start a draft to insert fields."}</p>
                {(["Resident", "Booking", "Homes / Room", "Tenancy"] as const).map((src) => (
                  <div key={src} className="mb-2">
                    <p className="text-[11px] text-muted-foreground">{src}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {TEMPLATE_FIELDS.filter((f) => f.source === src && !f.label.includes("old name")).map((f) => (
                        <button key={f.key} disabled={!editing} title={f.label} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f.key)} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] hover:border-primary disabled:opacity-50">
                          {f.key}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      <ResidentPicker open={picker} onOpenChange={setPicker} onPick={pickResident} />
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
          {(data ?? []).map((r) => (
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
