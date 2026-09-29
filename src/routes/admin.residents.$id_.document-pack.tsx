import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/admin/ops-ui";
import { findBed, useOps } from "@/lib/ops-store";
import {
  DOC_TYPE_LABELS,
  type AgreementDocType,
} from "@/lib/tenancy-docs";
import { generateDocumentPack } from "@/lib/tenancy-docs.functions";
import { fillPackDocx, getPackTemplates, previewPackPdf } from "@/lib/templates.functions";
import { renderTemplate, type MappingResult } from "@/lib/template-fields";
import { MARK_CSS, Paper } from "@/components/admin/TemplatePaper";
import { DocumentView } from "@/components/admin/DocumentView";
import { ExactPreviewButton } from "@/components/admin/ExactPreviewButton";

const TEMPLATE_KEY: Record<string, string> = {
  agreement: "tenancy_agreement",
  sched_a: "schedule_a",
  sched_b: "schedule_b",
  sched_c: "schedule_c",
  access_card: "access_card_form",
};
const pretty = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const Route = createFileRoute("/admin/residents/$id_/document-pack")({
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
  const navigate = useNavigate();
  const { residents, units, tenancies } = useOps();
  const resident = residents.find((r) => r.id === id);
  const tenancy = tenancies.find((t) => t.residentId === id);
  const placed = resident ? findBed(units, resident.bedId || "") : undefined;

  const [selected, setSelected] = useState<DocKey>("agreement");
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
    queryKey: ["pack-templates", id],
    queryFn: () => fetchPack({ data: { residentId: id } }),
  });
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const tpl = pack.data?.[TEMPLATE_KEY[selected]!] ?? null;

  /*
   * The document as it will read, filled inside its own Word file - so the
   * tables, borders, header, footer and signature lines are the template's,
   * not a web page's. A correction typed on the right redraws it, after a
   * short pause so every keystroke is not a trip to the server.
   */
  const [typed, setTyped] = useState<Record<string, string>>({});
  useEffect(() => {
    const t = setTimeout(() => setTyped(overrides), 500);
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
    placeholderData: (prev) => prev,
  });
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
      for (const t of Object.values(pack.data ?? {})) for (const r of t?.results ?? []) filled[r.key] = overrides[r.key] ?? r.value;
      const res = await generateDocumentPack({
        data: {
          residentId: resident.id,
          tenancyId: tenancy?.id,
          mergeValues: { ...vals, ...filled },
          periodStart: vals["tenancy_start"],
          periodEnd: vals["tenancy_end"],
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
        <h1 className="text-2xl font-bold text-brand-deep">Create Document Pack</h1>
        <p className="text-sm text-muted-foreground">
          Review the values on the right, then generate. Corrections here apply to the documents
          only — they do not change the resident's record.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_300px]">
        {/* LEFT — documents menu */}
        <nav className="space-y-4 rounded-2xl border border-border bg-card p-4">
          {MENU.map((g) => (
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
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* CENTRE — the Active template from Settings, filled in */}
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-deep">
              {MENU.flatMap((g) => g.items).find((i) => i.key === selected)?.label}
              {tpl && <span className="ml-2 text-xs font-normal text-muted-foreground">Template v{tpl.version}</span>}
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
          ) : !tpl ? (
            <div className="py-24 text-center text-sm text-muted-foreground">
              <p>No active template for this document yet.</p>
              <Link to="/admin/settings" search={{ tab: "templates" }} className="mt-2 inline-block text-primary underline">
                Upload and activate one in Settings → Templates
              </Link>
            </div>
          ) : tpl.hasFile ? (
            <DocumentView
              pdf={pdfDoc.data}
              pdfLoading={pdfDoc.isFetching}
              docxBase64={filledDoc.data?.base64}
            />
          ) : (
            // a template saved before files were kept: only its web copy exists
            <Paper>
              <div className={MARK_CSS} dangerouslySetInnerHTML={{ __html: renderTemplate(tpl.html, results) }} />
            </Paper>
          )}
        </div>

        {/* RIGHT — data review: every placeholder in this template */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-brand-deep">Data review</p>
          {tpl ? (
            tpl.placeholders.length ? (
              tpl.placeholders.map((key) => {
                const r = results[key];
                return (
                  <div key={key} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {pretty(key)}
                      {r?.result === "unmapped" && <span className="ml-1 text-destructive">· not mapped</span>}
                      {key.toLowerCase().startsWith("agreement_id") && !r?.value && <span className="ml-1">· issued on generate</span>}
                    </p>
                    <Input
                      value={r?.value ?? ""}
                      placeholder={r?.source === "Left blank" ? "Left blank (filled by hand)" : ""}
                      onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">This template has no placeholders.</p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Nothing to review until a template is active.</p>
          )}
          <Button className="w-full" disabled={generating} onClick={() => void generate()}>
            {generating ? "Generating…" : "Generate Document Pack"}
          </Button>
        </div>
      </div>
    </div>
  );
}
