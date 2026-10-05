import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, ClipboardCheck, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/ops-ui";
import { findBed, useOps } from "@/lib/ops-store";
import {
  DOC_TYPE_LABELS,
  type AgreementDocType,
} from "@/lib/tenancy-docs";
import { generateDocumentPack } from "@/lib/tenancy-docs.functions";
import { createCardFromDraft } from "@/lib/access-card.functions";
import { fillPackDocx, getPackTemplates, listRetiredPackDocs, previewPackPdf } from "@/lib/templates.functions";
import { isDocumentOwn, isTickResult, renderTemplate, type MappingResult } from "@/lib/template-fields";
import { MARK_CSS, Paper } from "@/components/admin/TemplatePaper";
import { DocumentView } from "@/components/admin/DocumentView";
import { TEMPLATE_CATEGORIES } from "@/components/admin/TemplatesTab";
import { DataReview } from "@/components/admin/DataReview";
import { ExactPreviewButton } from "@/components/admin/ExactPreviewButton";

const TEMPLATE_KEY: Record<string, string> = {
  agreement: "tenancy_agreement",
  sched_a: "schedule_a",
  sched_b: "schedule_b",
  sched_c: "schedule_c",
  access_card: "access_card_form",
};

export const Route = createFileRoute("/admin/residents/$id_/document-pack")({
  // ?card=Lost Card - a replacement access card form on its own (Dani, 2 Oct 2026)
  validateSearch: (s: Record<string, unknown>): { card?: string } => (typeof s["card"] === "string" && s["card"] ? { card: s["card"] } : {}),
  component: DocumentPackPage,
});

type DocKey = AgreementDocType | "access_card";

const MENU: { group: string; items: { key: DocKey; label: string }[] }[] = [
  {
    group: "Agreement",
    items: (Object.keys(DOC_TYPE_LABELS) as AgreementDocType[]).map((k) => ({
      key: k,
      label: DOC_TYPE_LABELS[k],
    })),
  },
  {
    group: "Other Documents",
    items: [{ key: "access_card", label: "Access Card Form" }],
  },
];

function DocumentPackPage() {
  const { id } = Route.useParams();
  const { card } = Route.useSearch();
  const navigate = useNavigate();
  const { residents, units, tenancies } = useOps();
  const resident = residents.find((r) => r.id === id);
  const tenancy = tenancies.find((t) => t.residentId === id);
  const placed = resident ? findBed(units, resident.bedId || "") : undefined;

  const [selected, setSelected] = useState<DocKey>(card ? "access_card" : "agreement");
  // the list on the left folds away; remembered on this browser
  const [navOpen, setNavOpen] = useState(() => {
    try {
      return localStorage.getItem("brachtia-pack-nav") !== "folded";
    } catch {
      return true;
    }
  });
  const toggleNav = (open: boolean) => {
    setNavOpen(open);
    try {
      localStorage.setItem("brachtia-pack-nav", open ? "open" : "folded");
    } catch {
      /* not remembered */
    }
  };
  /*
   * Every document is opened before the pack is made (Dani, 2 Oct 2026): its
   * data review read, not a button pressed past. The one open counts as seen.
   */
  const [seen, setSeen] = useState<Set<DocKey>>(() => new Set([card ? "access_card" : "agreement"]));
  /*
   * The resident's IC copy and photo, attached to the access card form - ticked
   * when they are on file, each one can be left out (Dani, 2 Oct 2026).
   */
  const files = (resident?.docs ?? []).filter((d) => (d.key === "id" || d.key === "photo") && d.path);
  const [attach, setAttach] = useState<Record<string, boolean>>({ id: true, photo: true });
  const attachments = files.filter((d) => attach[d.key]).map((d) => d.path!);
  useEffect(() => setSeen((s) => (s.has(selected) ? s : new Set([...s, selected]))), [selected]);
  const [generating, setGenerating] = useState(false);

  const defaults = useMemo<Record<string, string>>(() => {
    if (!resident) return {};
    const today = new Date().toISOString().slice(0, 10);
    const start = tenancy?.start || resident.moveIn || "";
    const end = tenancy?.end || "";
    const rent = tenancy?.rent || placed?.bed.rent || placed?.room.rent || 0;
    return {
      agreement_date: today,
      resident_name: resident.fullName,
      id_number: resident.idNumber,
      residence: placed?.unit.residenceName ?? "",
      unit_no: placed?.unit.unitNo ?? "",
      room: placed ? `Room ${placed.room.letter}` : "",
      bed: placed?.bed.label ?? "",
      tenancy_start: start,
      tenancy_end: end,
      monthly_rent: rent ? String(rent) : "",
      payment_schedule: resident.paySchedule,
      deposit: "",
    };
  }, [resident, tenancy, placed]);

  const [values, setValues] = useState<Record<string, string> | null>(null);
  const vals = values ?? defaults;
  const fetchPack = useServerFn(getPackTemplates);
  const pack = useQuery({
    queryKey: ["pack-templates", id, card ?? ""],
    queryFn: () => fetchPack({ data: { residentId: id, ...(card ? { cardReason: card } : {}) } }),
  });
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const tpl = pack.data?.[TEMPLATE_KEY[selected]!] ?? null;

  /*
   * The left menu is grouped by each template's own category, as set in
   * Settings -> Templates, rather than by fixed headings (30 Sep 2026). A
   * document with no active template yet sits under the category it belongs
   * to by default. Categories follow the order Settings lists them in.
   */
  // documents whose templates are all deactivated in Settings have no tab
  const retiredFn = useServerFn(listRetiredPackDocs);
  const retired = useQuery({ queryKey: ["retired-pack-docs"], queryFn: () => retiredFn() });
  const menu = useMemo(() => {
    const items = MENU.flatMap((g) => g.items)
      .filter((i) => !(retired.data ?? []).includes(TEMPLATE_KEY[i.key]!))
      // a replacement card is the access card form alone
      .filter((i) => !card || i.key === "access_card");
    const categoryOf = (key: DocKey) =>
      pack.data?.[TEMPLATE_KEY[key]!]?.category || (key === "access_card" ? "Access Card" : "Agreement");
    const order = [...TEMPLATE_CATEGORIES, ...items.map((i) => categoryOf(i.key))];
    const groups = [...new Set(order)]
      .map((group) => ({ group, items: items.filter((i) => categoryOf(i.key) === group) }))
      .filter((g) => g.items.length);
    return groups;
  }, [pack.data, retired.data, card]);
  /*
   * Every document in the pack needs its file before the pack is made - a
   * Schedule C with only a template name would be a blank page on the
   * resident's record (Dani, 30 Sep 2026). The server refuses it too.
   */
  const noFile = pack.data
    ? menu.flatMap((g) => g.items).filter((i) => i.key !== "sched_c" && !pack.data?.[TEMPLATE_KEY[i.key]!]?.hasFile)
    : [];
  // what is still to be opened - Schedule C has no data to review, so it is not asked for
  const unseen = menu.flatMap((g) => g.items).filter((i) => i.key !== "sched_c" && !seen.has(i.key));
  // the open document was taken out of use: open the first one still in use
  useEffect(() => {
    const shown = menu.flatMap((g) => g.items);
    if (shown.length && !shown.some((i) => i.key === selected)) setSelected(shown[0]!.key);
  }, [menu, selected]);

  /*
   * The document as it will read, filled inside its own Word file - so the
   * tables, borders, header, footer and signature lines are the template's,
   * not a web page's. A correction typed on the right redraws it, after a
   * short pause so every keystroke is not a trip to the server.
   */
  const [typed, setTyped] = useState<Record<string, string>>({});
  useEffect(() => {
    const t = setTimeout(() => setTyped(overrides), 300);
    return () => clearTimeout(t);
  }, [overrides]);
  const fillDocx = useServerFn(fillPackDocx);
  const docKey = TEMPLATE_KEY[selected] as "tenancy_agreement";
  const pdfFn = useServerFn(previewPackPdf);
  // the exact pages, from a real Word engine; redrawn after typing pauses
  const pdfDoc = useQuery({
    queryKey: ["pack-pdf", id, docKey, typed],
    queryFn: () => pdfFn({ data: { residentId: id, docKey, overrides: typed } }),
    enabled: Boolean(tpl?.hasFile),
    // keep the pages on screen while a changed value redraws them - but only
    // the same document's pages, never the last document's while switching
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === docKey ? prev : undefined),
  });

  /*
   * Every other document in the pack is laid out in the background once this
   * one is showing, so switching tabs is instant instead of a ~2s wait (30 Sep
   * 2026). The server keeps them, so this costs nothing when they are opened.
   */
  const qc = useQueryClient();
  useEffect(() => {
    if (!pdfDoc.data || !pack.data) return;
    for (const [key, t] of Object.entries(pack.data)) {
      if (!t?.hasFile || key === docKey) continue;
      void qc.prefetchQuery({
        queryKey: ["pack-pdf", id, key, typed],
        queryFn: () => pdfFn({ data: { residentId: id, docKey: key as typeof docKey, overrides: typed } }),
        staleTime: 60_000,
      });
    }
    // once per document shown and per set of corrections
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(pdfDoc.data), pack.data, typed]);
  // the approximate view, only where no PDF can be made on this server
  const filledDoc = useQuery({
    queryKey: ["pack-docx", id, docKey, typed],
    queryFn: () => fillDocx({ data: { residentId: id, docKey, overrides: typed } }),
    enabled: Boolean(tpl?.hasFile) && pdfDoc.data?.ok === false,
    placeholderData: (prev) => prev,
  });
  const results = useMemo(() => {
    const out: Record<string, MappingResult> = {};
    for (const r of tpl?.results ?? []) {
      const o = overrides[r.key];
      out[r.key] = o !== undefined ? { ...r, value: o, result: o.trim() ? "mapped" : r.result === "unmapped" ? "unmapped" : "missing" } : r;
    }
    return out;
  }, [tpl, overrides]);

  if (!resident) {
    return (
      <EmptyState
        title="Resident not found"
        hint="This profile may have been removed."
        action={
          <Button asChild size="sm">
            <Link to="/admin/residents">Back to residents</Link>
          </Button>
        }
      />
    );
  }

  async function generate() {
    if (!resident) return;
    setGenerating(true);
    try {
      const filled: Record<string, string> = {};
      // the document's own values, and every tick as admin left it
      for (const t of Object.values(pack.data ?? {}))
        for (const r of t?.results ?? []) filled[r.key] = (isDocumentOwn(r.key) || isTickResult(r) ? overrides[r.key] : undefined) ?? r.value;
      if (card) {
        await createCardFromDraft({ data: { residentId: resident.id, reason: card, values: { ...vals, ...filled }, attachments } });
        toast.success("Access card form made");
        void navigate({ to: "/admin/residents/$id", params: { id: resident.id }, search: { tab: "tenancy" } });
        return;
      }
      const res = await generateDocumentPack({
        data: {
          residentId: resident.id,
          tenancyId: tenancy?.id,
          mergeValues: { ...vals, ...filled },
          periodStart: vals["tenancy_start"],
          periodEnd: vals["tenancy_end"],
          cardAttachments: attachments,
        },
      });
      toast.success(`Document pack generated — ${res.agreementNo}`);
      void navigate({ to: "/admin/residents/$id", params: { id: resident.id }, search: { tab: "tenancy" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the pack");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild size="sm" variant="ghost" className="-ml-2 self-start">
        <Link to="/admin/residents/$id" params={{ id: resident.id }} search={{ tab: "tenancy" }}>
          <ArrowLeft className="mr-1 size-4" /> {resident.fullName || "Resident"}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-brand-deep">{card ? `New Access Card Form - ${card}` : "Create Document Pack"}</h1>
        <p className="text-sm text-muted-foreground">
          Review the values on the right, then generate. Corrections here apply to the documents
          only — they do not change the resident's record.
        </p>
      </div>

      <div className={`grid gap-4 ${navOpen ? "lg:grid-cols-[220px_minmax(0,1fr)_300px]" : "lg:grid-cols-[56px_minmax(0,1fr)_300px]"}`}>
        {/* LEFT — documents menu; folds to a narrow rail to give the preview room (Dani, 2 Oct 2026) */}
        {navOpen ? (
        <nav className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => toggleNav(false)}
            title="Fold the list - more room for the preview"
            className="-mt-1 ml-auto hidden items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
          >
            <PanelLeftClose className="size-4" /> Fold
          </button>
          {menu.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.group}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(item.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selected === item.key
                          ? "bg-brand-tint font-medium text-brand-deep"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        {item.label}
                        {seen.has(item.key) ? <Check className="size-3.5 shrink-0 text-emerald-600" aria-label="Checked" /> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        ) : (
          <nav className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-3">
            <button
              type="button"
              onClick={() => toggleNav(true)}
              title="Show the list of documents"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            {menu
              .flatMap((g) => g.items)
              .map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  onClick={() => setSelected(item.key)}
                  className={`relative flex size-8 items-center justify-center rounded-full text-xs font-semibold ${
                    selected === item.key ? "bg-brand-deep text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-brand-tint"
                  }`}
                >
                  {i + 1}
                  {seen.has(item.key) ? <Check className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-600 p-px text-white" /> : null}
                </button>
              ))}
          </nav>
        )}

        {/* CENTRE — the Active template from Settings, filled in */}
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-deep">
              {MENU.flatMap((g) => g.items).find((i) => i.key === selected)?.label}
              {tpl && <span className="ml-2 text-xs font-normal text-muted-foreground">Template v{tpl.version}</span>}
              {/* a soft hint while the pages redraw - the old ones stay, faded */}
              {tpl?.hasFile && (pdfDoc.isFetching || overrides !== typed) && pdfDoc.data ? (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Updating…
                </span>
              ) : null}
            </p>
            {tpl?.hasFile ? (
              <ExactPreviewButton
                title={`${MENU.flatMap((g) => g.items).find((i) => i.key === selected)?.label ?? "Document"} · ${resident.fullName}`}
                load={() => pdfFn({ data: { residentId: id, docKey, overrides } })}
              />
            ) : null}
          </div>
          {pack.isLoading ? (
            <p className="py-24 text-center text-sm text-muted-foreground">Loading template…</p>
          ) : pack.isError ? (
            <p className="py-24 text-center text-sm text-destructive">Could not load the template.</p>
          ) : selected === "sched_c" ? (
            // a checklist the resident answers - nothing to fill or upload (1 Oct 2026)
            <div className="mx-auto max-w-md space-y-3 py-16 text-center">
              <ClipboardCheck className="mx-auto size-8 text-brand" />
              <p className="text-sm font-semibold text-brand-deep">Filled in by the resident</p>
              <p className="text-sm text-muted-foreground">Schedule C is a checklist on the resident&rsquo;s signing page.</p>
            </div>
          ) : !tpl ? (
            <div className="py-24 text-center text-sm text-muted-foreground">
              <p>No active template for this document yet.</p>
              <Link to="/admin/settings" search={{ tab: "templates" }} className="mt-2 inline-block text-primary underline">
                Upload and activate one in Settings → Templates
              </Link>
            </div>
          ) : tpl.hasFile ? (
            <div className={`transition-opacity duration-200 ${pdfDoc.isPlaceholderData ? "opacity-60" : ""}`}>
              <DocumentView
                // a different document starts on its page 1; the same one keeps its place
                key={docKey}
                pdf={pdfDoc.data}
                pdfLoading={pdfDoc.isFetching}
                docxBase64={filledDoc.data?.base64}
              />
            </div>
          ) : (
            // a template saved before files were kept: only its web copy exists
            <Paper>
              <div className={MARK_CSS} dangerouslySetInnerHTML={{ __html: renderTemplate(tpl.html, results) }} />
            </Paper>
          )}
        </div>

        {/* RIGHT — data review: every placeholder in this template */}
        <DataReview
          residentId={resident.id}
          placeholders={tpl?.placeholders ?? null}
          results={results}
          overrides={overrides}
          onOverride={(key, value) => setOverrides({ ...overrides, [key]: value })}
          footer={
            <div className="space-y-2">
              {noFile.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  <p className="font-semibold">Not ready to generate</p>
                  <ul className="mt-1 list-disc pl-4">
                    {noFile.map((i) => (
                      <li key={i.key}>{i.label} – no file uploaded</li>
                    ))}
                  </ul>
                  <Link to="/admin/settings" className="mt-1 inline-block font-medium underline">
                    Upload in Settings → Templates
                  </Link>
                </div>
              ) : null}
              {selected === "access_card" ? (
                <div className="space-y-1.5 rounded-lg border border-border p-2.5 text-[11px]">
                  <p className="font-semibold text-foreground">Attach to the form</p>
                  {files.length ? (
                    files.map((d) => (
                      <label key={d.key} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-brand"
                          checked={!!attach[d.key]}
                          onChange={(e) => setAttach((a) => ({ ...a, [d.key]: e.target.checked }))}
                        />
                        {d.key === "id" ? "IC / passport copy" : "Passport photo"}
                        <span className="text-muted-foreground">· {d.fileName ?? "on file"}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No IC copy or photo on file - upload them on the resident's profile.</p>
                  )}
                  <p className="text-muted-foreground">Merged after the form, in the PDF given to ARC.</p>
                </div>
              ) : null}
              {unseen.length ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  Open each document and check its data first: {unseen.map((i) => i.label).join(", ")}.
                </p>
              ) : null}
              <Button
                className="w-full"
                disabled={generating || !pack.data || noFile.length > 0 || unseen.length > 0}
                onClick={() => void generate()}
              >
                {generating ? "Generating…" : "Confirm and proceed"}
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
