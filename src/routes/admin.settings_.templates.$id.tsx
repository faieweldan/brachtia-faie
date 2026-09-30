import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Power, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ALL, fmtDay, TEMPLATE_CATEGORIES, VersionStatus } from "@/components/admin/TemplatesTab";
import { Choice } from "@/components/admin/Choice";
import {
  Select as SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentView } from "@/components/admin/DocumentView";
import { PdfBoxEditor } from "@/components/admin/PdfBoxEditor";
import type { PdfBox } from "@/lib/pdf-boxes";
import { docxPlaceholders } from "@/lib/docx-fill";
import { ExactPreviewButton } from "@/components/admin/ExactPreviewButton";
import { MARK_CSS, Paper } from "@/components/admin/TemplatePaper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { docxToHtml, fileToBase64, isPdfFile } from "@/lib/docx-client";
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
  getTemplateDocx,
  previewTemplatePdf,
  deleteTemplateVersion,
  deleteTemplate,
  listTemplateResidences,
  updateTemplateDetails,
  setTemplateActive,
  saveBoxes,
  previewUploadedFile,
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
  /*
   * A file just picked with Replace file, read in the browser so it shows as
   * the document looks straight away - not as the web copy - and its header
   * and footer placeholders are offered for mapping before it is saved.
   */
  const [pending, setPending] = useState<{ base64: string; placeholders: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    if (!pendingFile) {
      setPending(null);
      return;
    }
    void (async () => {
      const bytes = new Uint8Array(await pendingFile.arrayBuffer());
      const placeholders = await docxPlaceholders(bytes).catch(() => [] as string[]);
      const base64 = await fileToBase64(pendingFile);
      if (live) setPending({ base64, placeholders });
    })();
    return () => {
      live = false;
    };
  }, [pendingFile]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const [picker, setPicker] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<Mappings>({});
  const saveMaps = useServerFn(saveMappings);
  const mapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = tpl?.versions.find((v) => v.id === selectedId) ?? tpl?.versions.find((v) => v.status === "draft") ?? tpl?.versions.find((v) => v.status === "active") ?? tpl?.versions[0];

  /*
   * The boxes drawn on a PDF template. Changed on a draft, they save after a
   * short pause, the way mappings do.
   */
  const [boxes, setBoxesState] = useState<PdfBox[]>([]);
  useEffect(() => { setBoxesState(selected?.boxes ?? []); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selected?.id]);
  const saveBoxesFn = useServerFn(saveBoxes);
  const boxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * Boxes can take a long time to draw, so saving them is never silent
   * (30 Sep 2026). Boxes drawn before the database had a place for them
   * failed to save with only a passing message, and a change made just
   * before leaving the page was never sent - so a whole form's worth vanished.
   * Now the state is always on screen, a pending save is sent at once when
   * the page is left, and closing the tab with unsaved boxes asks first.
   */
  const [boxSave, setBoxSave] = useState<"saved" | "pending" | "saving" | "failed">("saved");
  const pendingBoxes = useRef<{ versionId: string; boxes: PdfBox[] } | null>(null);
  function sendBoxes() {
    const job = pendingBoxes.current;
    if (!job) return;
    pendingBoxes.current = null;
    if (boxTimer.current) clearTimeout(boxTimer.current);
    setBoxSave("saving");
    saveBoxesFn({ data: job })
      .then(() => {
        if (!pendingBoxes.current) setBoxSave("saved");
        void qc.invalidateQueries({ queryKey: ["doc-templates"] });
      })
      .catch((e) => {
        // keep the boxes waiting, so Retry sends them again
        pendingBoxes.current ??= job;
        setBoxSave("failed");
        toast.error(e instanceof Error ? e.message : "Could not save boxes");
      });
  }
  function setBoxes(next: PdfBox[]) {
    setBoxesState(next);
    if (selected?.status !== "draft") return;
    pendingBoxes.current = { versionId: selected.id, boxes: next };
    setBoxSave("pending");
    if (boxTimer.current) clearTimeout(boxTimer.current);
    boxTimer.current = setTimeout(sendBoxes, 600);
  }
  // leaving the page sends what is waiting; closing the tab with it asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingBoxes.current) {
        sendBoxes();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      sendBoxes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = tpl?.versions.find((v) => v.status === "active");

  useEffect(() => {
    if (editing && editorRef.current) editorRef.current.innerHTML = draftHtml;
    // only when entering edit mode / file replaced
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, pendingFile]);

  const html = editing ? draftHtml : (selected?.contentHtml ?? "");
  // the version's own Word file: shown as the document looks, and read for the
  // placeholders its header and footer carry that the web copy never had
  const docxFn = useServerFn(getTemplateDocx);
  // an unsaved file, laid out by the same engine as a saved one
  const uploadPdfFn = useServerFn(previewUploadedFile);
  const pendingPdf = useQuery({
    queryKey: ["pending-pdf", pendingFile?.name ?? "", pending?.base64.length ?? 0],
    queryFn: () => uploadPdfFn({ data: { name: pendingFile!.name, base64: pending!.base64 } }),
    enabled: Boolean(editing && pendingFile && pending),
  });
  const pdfFn = useServerFn(previewTemplatePdf);
  const removeVersion = useServerFn(deleteTemplateVersion);
  const removeTemplate = useServerFn(deleteTemplate);
  const navigateAway = useNavigate();
  const residencesFn = useServerFn(listTemplateResidences);
  const { data: residences } = useQuery({ queryKey: ["template-residences"], queryFn: () => residencesFn() });
  const saveDetails = useServerFn(updateTemplateDetails);
  const setActiveFn = useServerFn(setTemplateActive);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  async function setInUse(active: boolean, reason?: string) {
    if (!tpl) return;
    try {
      await setActiveFn({ data: { templateId: tpl.id, active, ...(reason?.trim() ? { reason: reason.trim() } : {}) } });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success(active ? "Template reactivated" : "Template deactivated");
      setDeactivating(false);
      setDeactivateReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function setDetail(patch: { name?: string; category?: string; residenceId?: string | null }) {
    if (!tpl) return;
    try {
      await saveDetails({ data: { templateId: tpl.id, ...patch } });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function doDeleteVersion(versionId: string, version: number) {
    if (!confirm(`Delete v${version}? This cannot be undone.`)) return;
    try {
      await removeVersion({ data: { versionId } });
      if (selectedId === versionId) setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success(`v${version} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function doDeleteTemplate() {
    if (!tpl || !confirm(`Delete the template "${tpl.name}" and all its versions? This cannot be undone.`)) return;
    try {
      await removeTemplate({ data: { templateId: tpl.id } });
      await qc.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success("Template deleted");
      void navigateAway({ to: "/admin/settings", search: { tab: "templates" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }
  // the template as it prints - with the test resident filled in once picked
  const pagePdf = useQuery({
    queryKey: ["template-pdf", selected?.id, test?.resident.id ?? "", test ? maps : null, boxes],
    queryFn: () =>
      pdfFn({
        data: {
          versionId: selected!.id,
          ...(test ? { residentId: test.resident.id, mappings: maps } : {}),
          ...(docx.data?.kind === "pdf" ? { boxes } : {}),
        },
      }),
    enabled: Boolean(selected?.id && selected?.fileName) && !editing,
    placeholderData: (prev) => prev,
  });
  const docx = useQuery({
    queryKey: ["template-docx", selected?.id],
    queryFn: () => docxFn({ data: { versionId: selected!.id } }),
    enabled: Boolean(selected?.id && selected?.fileName),
  });
  const [formUrl, setFormUrl] = useState("");
  const formBase64 = docx.data?.kind === "pdf" ? docx.data.base64 : "";
  // the PDF form as a link the box editor can open, made and thrown away together
  useEffect(() => {
    if (!formBase64) {
      setFormUrl("");
      return;
    }
    const made = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(formBase64), (c) => c.charCodeAt(0))], { type: "application/pdf" }),
    );
    setFormUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [formBase64]);
  const selKey = selected?.id;
  useEffect(() => { setMaps(selected?.mappings ?? {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selKey]);


  const placeholders = useMemo(
    () => [
      ...new Set([
        ...(editing ? (pending?.placeholders ?? []) : (docx.data?.placeholders ?? [])),
        // on a PDF, the boxes as drawn right now, saved or not
        ...(docx.data?.kind === "pdf" && !editing ? boxes.map((b) => b.key) : []),
        ...detectPlaceholders(html),
      ]),
    ],
    [html, editing, docx.data, pending, boxes],
  );
  const bad = unmapped(placeholders, maps);
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
      if (docx.data?.kind === "pdf") {
        if (boxTimer.current) clearTimeout(boxTimer.current);
        await saveBoxesFn({ data: { versionId: selected!.id, boxes } });
      }
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

      {/* minmax(0,1fr): the middle column never grows to fit a zoomed page */}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        {/* LEFT */}
        <aside className="space-y-4 self-start rounded-xl border border-border bg-card p-4 text-sm">
          <dl className="space-y-2">
            {/* name, category and residence can all be changed after the template is made (30 Sep 2026) */}
            <div>
              <dt className="text-xs text-muted-foreground">Template</dt>
              <dd>
                <Input
                  key={tpl.name}
                  className="mt-1 h-8 text-sm font-medium"
                  defaultValue={tpl.name}
                  aria-label="Template name"
                  // saved when the field is left, or on Enter
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) e.target.value = tpl.name;
                    else if (v !== tpl.name) void setDetail({ name: v });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd>
                <Choice
                  className="mt-1 h-8 text-sm"
                  value={tpl.category}
                  onChange={(v) => void setDetail({ category: v })}
                  options={[...new Set([...TEMPLATE_CATEGORIES, tpl.category])]}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Residence</dt>
              <dd>
                <Choice
                  className="mt-1 h-8 text-sm"
                  value={tpl.residenceId ?? ALL}
                  onChange={(v) => void setDetail({ residenceId: v === ALL ? null : v })}
                  options={[{ value: ALL, label: "All residences" }, ...(residences ?? []).map((r) => ({ value: r.id, label: r.name }))]}
                />
              </dd>
            </div>
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
                    <span className="flex items-center gap-1">
                      <VersionStatus status={v.status} />
                      {/* the Active version is what documents are made from, so it
                          has no bin; a used one is refused by the server with why */}
                      {v.status !== "active" && !editing ? (
                        <span
                          role="button"
                          tabIndex={0}
                          title={`Delete v${v.version}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void doDeleteVersion(v.id, v.version);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && void doDeleteVersion(v.id, v.version)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!tpl.docKey || tpl.residenceId ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={editing}
                onClick={() => void doDeleteTemplate()}
              >
                <Trash2 className="mr-1 size-3.5" /> Delete template
              </Button>
            ) : null}
            {/* take the whole template out of use - kept, and reversible */}
            {tpl.deactivatedAt ? (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                <p>
                  Deactivated {fmtDay(tpl.deactivatedAt)}
                  {tpl.deactivationReason ? ` — ${tpl.deactivationReason}` : ""}. Not in any document pack.
                </p>
                <Button size="sm" variant="outline" className="w-full" onClick={() => void setInUse(true)}>
                  Reactivate
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 w-full text-muted-foreground"
                disabled={editing}
                onClick={() => setDeactivating(true)}
              >
                <Power className="mr-1 size-3.5" /> Deactivate template
              </Button>
            )}
            <Dialog open={deactivating} onOpenChange={setDeactivating}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Deactivate {tpl.name}?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  It stops appearing in residents&apos; document packs and is no longer made. Its versions, and the
                  documents already made from it, are kept. You can reactivate it at any time.
                </p>
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Reason (optional)</span>
                  <Input
                    value={deactivateReason}
                    placeholder="e.g. The building no longer asks for this form"
                    onChange={(e) => setDeactivateReason(e.target.value)}
                  />
                </label>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeactivating(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void setInUse(false, deactivateReason)}>Deactivate</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </aside>

        {/* CENTRE */}
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">v{selected.version}</span>
            <VersionStatus status={editing && selected.status !== "draft" ? "draft" : selected.status} />
            {selected.fileName && <span className="text-xs text-muted-foreground">{selected.fileName}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Upload className="mr-1 h-3.5 w-3.5" /> {selected.fileName || pendingFile ? "Replace file" : "Upload file"}
                <input type="file" accept=".docx,.pdf" className="hidden" disabled={!!test} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
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
              {/* exact: filled with the test resident when one is picked */}
              <ExactPreviewButton
                title={test ? `${tpl.name} · ${test.resident.name}` : tpl.name}
                disabled={editing || !selected.fileName}
                load={() =>
                  pdfFn({
                    data: {
                      versionId: selected.id,
                      ...(test ? { residentId: test.resident.id, mappings: maps } : {}),
                    },
                  })
                }
              />
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
          {editing && pendingFile && !pending ? (
            // the moment between picking a file and reading it: never the web copy
            <p className="py-24 text-center text-sm text-muted-foreground">Reading the file…</p>
          ) : editing && pending ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                New file: {pendingFile?.name}.{" "}
                {pendingFile && isPdfFile(pendingFile.name)
                  ? "A PDF form is shown as it is."
                  : "Shown as it will print. Save as Draft to keep it."}
              </p>
              {/* the same engine as after saving, so the pages do not change on save */}
              <DocumentView
                pdf={pendingPdf.data}
                pdfLoading={pendingPdf.isFetching}
                docxBase64={
                  pendingPdf.data?.ok === false && pendingFile && !isPdfFile(pendingFile.name) ? pending.base64 : undefined
                }
              />
            </div>
          ) : !editing && docx.data?.kind === "pdf" && selected.status === "draft" && formUrl ? (
            <PdfBoxEditor
              url={formUrl}
              boxes={boxes}
              onChange={setBoxes}
              saveState={boxSave}
              onRetry={sendBoxes}
              names={[...new Set([...Object.keys(maps), ...boxes.map((b) => b.key)])]}
            />
          ) : !editing && docx.data ? (
            <DocumentView
              pdf={pagePdf.data}
              pdfLoading={pagePdf.isFetching}
              docxBase64={pagePdf.data?.ok === false && docx.data.kind === "docx" ? docx.data.base64 : undefined}
            />
          ) : (
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
          )}
        </section>

        {/* RIGHT - scrolls on its own and stays in view, like the pack's Data
            review, so a long list of fields no longer stretches the page into
            empty space beside the document (30 Sep 2026) */}
        <aside className="space-y-4 self-start rounded-xl border border-border bg-card p-4 text-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
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
      {/* the app's own dropdown, the same on every computer and phone */}
      <SelectRoot
        disabled={disabled}
        // "" shows the placeholder - an unmapped placeholder
        value={value}
        onValueChange={(v) => {
          if (v === "formula") onChange({ kind: "formula", expr: mapping?.kind === "field" ? `[${mapping.key}]` : "" });
          else if (v === "blank") onChange({ kind: "blank" });
          else onChange({ kind: "field", key: v.slice(6) });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Choose a value…" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {FIELD_SOURCES.map((src) => (
            <SelectGroup key={src}>
              <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{src}</SelectLabel>
              {TEMPLATE_FIELDS.filter((f) => f.source === src).map((f) => (
                <SelectItem key={f.key} value={`field:${f.key}`} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Custom</SelectLabel>
            <SelectItem value="formula" className="text-xs">Formula…</SelectItem>
            <SelectItem value="blank" className="text-xs">Leave blank (filled by hand)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </SelectRoot>
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
          <input type="file" accept=".docx,.pdf" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
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
