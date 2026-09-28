import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/admin/ops-ui";
import { findBed, fmtDate, money, useOps } from "@/lib/ops-store";
import {
  DOC_FIELDS,
  DOC_TYPE_LABELS,
  MERGE_FIELDS,
  type AgreementDocType,
} from "@/lib/tenancy-docs";
import { generateDocumentPack } from "@/lib/tenancy-docs.functions";

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

  const fields = DOC_FIELDS[selected]
    .map((key) => MERGE_FIELDS.find((f) => f.key === key)!)
    .filter(Boolean);

  async function generate() {
    if (!resident) return;
    setGenerating(true);
    try {
      const res = await generateDocumentPack({
        data: {
          residentId: resident.id,
          tenancyId: tenancy?.id,
          mergeValues: vals,
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

        {/* CENTRE — preview (placeholder until templates are uploaded in Settings) */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-sm font-semibold text-brand-deep">
            {MENU.flatMap((g) => g.items).find((i) => i.key === selected)?.label}
          </p>
          <div className="aspect-[1/1.3] w-full overflow-y-auto rounded-xl border border-border bg-white p-6 text-[11px] leading-relaxed text-neutral-700 shadow-sm">
            <p className="text-center text-[13px] font-bold uppercase tracking-wide text-neutral-900">
              {MENU.flatMap((g) => g.items).find((i) => i.key === selected)?.label}
            </p>
            <p className="mt-1 text-center text-[10px] text-neutral-400">
              Placeholder preview — the real template is uploaded in Settings
            </p>
            <dl className="mt-5 space-y-2.5">
              {fields.map((f) => (
                <div key={f.key} className="flex gap-2">
                  <dt className="w-32 shrink-0 font-semibold text-neutral-900">{f.label}</dt>
                  <dd className="min-w-0 flex-1 border-b border-dotted border-neutral-300">
                    {f.key === "monthly_rent" || f.key === "deposit"
                      ? vals[f.key]
                        ? money(Number(vals[f.key]))
                        : "—"
                      : f.key.includes("date") || f.key.includes("start") || f.key.includes("end")
                        ? vals[f.key]
                          ? fmtDate(vals[f.key])
                          : "—"
                        : vals[f.key] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* RIGHT — data review */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-brand-deep">Data review</p>
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <Input
                type={f.key.includes("date") || f.key.includes("start") || f.key.includes("end") ? "date" : "text"}
                value={vals[f.key] ?? ""}
                onChange={(e) => setValues({ ...vals, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <Button className="w-full" disabled={generating} onClick={() => void generate()}>
            {generating ? "Generating…" : "Generate Document Pack"}
          </Button>
        </div>
      </div>
    </div>
  );
}
