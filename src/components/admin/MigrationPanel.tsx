import { useMemo, useState } from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/admin/ops-ui";
import { fmtDate, money } from "@/lib/ops-store";
import { initialLines, initialPaymentOf } from "@/lib/migration/import-plan";
import { SCHEDULES } from "@/lib/reference-data";
import type { MigrationPreview, MigrationPreviewRow } from "@/lib/migration/sheet3";
import type { ImportOutcome } from "@/lib/migration/import.server";

/**
 * Migration 1 - check, then import (Dani, 12 Oct 2026).
 *
 * The four counts are the filter: click Blocked and only blocked people are
 * listed, the field at fault marked. Each person is one line; opening it shows
 * what the import will write - who pays, the unit, the TA and invoice copies
 * and the initial payment line by line, and the next rent - so nothing is
 * imported unseen. Import runs only with nothing blocked.
 */

type Filter = "all" | "ready" | "warning" | "blocked";

export const MIGRATION_STATUS = {
  ready: { label: "Ready", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  warning: { label: "Check first", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  blocked: { label: "Blocked", tone: "border-rose-200 bg-rose-50 text-rose-800" },
} as const;

export function MigrationPanel({
  preview,
  today,
  onExport,
  onDismiss,
  onImport,
  onDone,
}: {
  preview: MigrationPreview;
  today: string;
  onExport: () => void;
  onDismiss: () => void;
  /** imports one resident and says what happened - called once per resident, so progress can be shown */
  onImport: (row: MigrationPreviewRow) => Promise<ImportOutcome>;
  /** after the last one: refresh the screens that show residents */
  onDone: () => Promise<void> | void;
}) {
  const { totals } = preview;
  // start where the attention is: blocked, then check first, else everyone
  const [filter, setFilter] = useState<Filter>(totals.blocked ? "blocked" : totals.warning ? "warning" : "all");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
  // where the import is: "12 of 44 · name"
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);

  const shown = useMemo(
    () => preview.rows.filter((r) => filter === "all" || r.status === filter),
    [preview.rows, filter],
  );
  const importable = preview.rows.filter((r) => r.status !== "blocked");
  const canImport = !preview.missingHeaders.length && totals.blocked === 0 && importable.length > 0;

  const boxes: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: "all", label: "All", value: totals.residents, tone: "text-brand-deep" },
    { key: "ready", label: "Ready", value: totals.ready, tone: "text-emerald-700" },
    { key: "warning", label: "Check first", value: totals.warning, tone: "text-amber-700" },
    { key: "blocked", label: "Blocked", value: totals.blocked, tone: "text-rose-700" },
  ];

  async function runImport() {
    if (!canImport || busy) return;
    if (!window.confirm(`Import ${importable.length} residents? Each gets a profile, tenancy, paid initial invoice, rent schedule and bed.`)) return;
    setBusy(true);
    const result: ImportOutcome[] = [];
    // closing the page halfway is safe: the ones done stay done, a re-run skips them
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    try {
      for (const [i, row] of importable.entries()) {
        setProgress({ done: i, total: importable.length, name: row.residentName });
        result.push(await onImport(row));
      }
      setProgress({ done: importable.length, total: importable.length, name: "" });
      await onDone();
      setOutcomes(result);
      const done = result.filter((o) => o.result === "imported").length;
      const failed = result.filter((o) => o.result === "failed").length;
      if (failed) toast.error(`${done} imported · ${failed} failed - see the list`);
      else toast.success(`${done} residents imported`);
    } catch (err) {
      setOutcomes(result);
      toast.error(
        `${err instanceof Error ? err.message : "The import stopped"}. ${result.length} were handled before it stopped - import again to carry on; those are skipped.`,
      );
    } finally {
      window.removeEventListener("beforeunload", warn);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Panel
      title="Migration 1"
      description={outcomes ? "Imported. The list below says what happened to each resident." : "Checked against Homes. Nothing is saved until you import."}
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download className="mr-1 size-4" /> Export review
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      }
    >
      {/* the counts are the filter */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {boxes.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilter(b.key)}
            aria-pressed={filter === b.key}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              filter === b.key ? "border-brand-deep bg-muted" : "border-border bg-card hover:bg-muted/60"
            }`}
          >
            <p className={`text-lg font-semibold tabular-nums ${b.tone}`}>{b.value}</p>
            <p className="text-xs text-muted-foreground">{b.label}</p>
          </button>
        ))}
      </div>

      {preview.missingHeaders.length ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">The file cannot be imported yet.</p>
          <p className="mt-1 text-xs">Missing columns: {preview.missingHeaders.join(", ")}</p>
        </div>
      ) : null}

      {progress ? (
        <div className="mb-3 rounded-xl border border-border bg-card px-4 py-3" role="status" aria-live="polite">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">
              Importing {Math.min(progress.done + 1, progress.total)} of {progress.total}
              {progress.name ? ` · ${progress.name}` : ""}
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand-deep transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Keep this page open. Each resident is saved on their own as it goes.</p>
        </div>
      ) : null}

      {outcomes ? <Outcomes outcomes={outcomes} /> : null}

      <p className="mb-2 text-xs text-muted-foreground">
        Showing {MIGRATION_STATUS[filter as keyof typeof MIGRATION_STATUS]?.label ?? "everyone"} ({shown.length}). Open a resident to see what will be saved.
      </p>
      <div className="divide-y divide-border rounded-xl border border-border">
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nobody here.</p>
        ) : null}
        {shown.map((row) => (
          <ResidentLine
            key={`${row.sourceRow}-${row.quickbooksId}`}
            row={row}
            today={today}
            open={open === row.sourceRow}
            onToggle={() => setOpen(open === row.sourceRow ? null : row.sourceRow)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {totals.blocked
            ? `${totals.blocked} blocked - fix them in the master file and check again before importing.`
            : `${importable.length} will be created. A QuickBooks ID already in the system is skipped.`}
        </p>
        <Button onClick={runImport} disabled={!canImport || busy || !!outcomes}>
          {busy ? "Importing…" : outcomes ? "Imported" : `Import ${importable.length} residents`}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * One resident as the check sees them: the line, and opened, what the import
 * will write. Shared by the bulk upload's list and Add existing resident's
 * preview (14 Oct 2026), so both show a resident the same way.
 */
export function ResidentLine({ row, today, open, onToggle }: { row: MigrationPreviewRow; today: string; open: boolean; onToggle: () => void }) {
  const status = MIGRATION_STATUS[row.status];
  const r = row.record;
  const bad = new Set(row.issues.map((i) => i.field.toLowerCase()));
  // a field at fault is marked where it is shown
  const mark = (...fields: string[]) =>
    fields.some((f) => bad.has(f.toLowerCase())) ? "rounded bg-rose-100 px-1 text-rose-900" : "";
  const lines = initialLines(row);
  // the same rule the import uses (import-plan)
  const pay = initialPaymentOf(row);

  return (
    <div className="text-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50" aria-expanded={open}>
        <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{row.sourceRow}</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{row.residentName || "Unnamed resident"}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {row.quickbooksId} · {r.unitNo} · Room {r.room} · {row.wholeRoom ? "Whole room" : row.place.split(" · ").at(-1)}
          </span>
        </span>
        {row.issues.length ? (
          <span className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:inline">{row.issues[0]!.field}</span>
        ) : null}
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${status.tone}`}>{status.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-3 bg-muted/30 px-4 pb-4 pt-1">
          {row.issues.length ? (
            <ul className="space-y-1">
              {row.issues.map((i, n) => (
                <li key={n} className={`rounded-md px-2 py-1 text-xs ${i.level === "blocked" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
                  <span className="font-semibold">{i.field}:</span> {i.message}
                </li>
              ))}
            </ul>
          ) : null}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <Field label="Email"><span className={mark("Email")}>{row.email || "—"}</span></Field>
            <Field label="Mobile"><span className={mark("Country Code", "Mobile Number")}>{r.dial} {r.mobile}</span></Field>
            <Field label={r.nric ? "NRIC" : "Passport"}>{r.nric || r.passport || "—"}</Field>
            <Field label="Nationality · University">{r.nationality} · {r.university || "—"}</Field>
            <Field label="Paid by">{r.paidBy}{r.payorName ? ` · ${r.payorName}` : ""}</Field>
            <Field label="Unit">{r.unitType || "—"} · {r.occupancy || "—"}</Field>
            <Field label="Tenancy">
              <span className={mark("Tenancy dates", "Tenancy End", "Tenancy Start")}>
                {fmtDate(row.tenancyStart)} – {fmtDate(row.tenancyEnd)} · {row.stayDuration}
              </span>
            </Field>
            <Field label="Rent">
              <span className={mark("Monthly rent", "Payment frequency")}>
                {money(r.monthlyRent)} / month · {SCHEDULES.find((x) => x.value === r.schedule)?.label ?? r.schedule}
              </span>
            </Field>
            <Field label="Agreement No.">
              <span className="tabular-nums">{r.agreementNo || "Made by the system on import"}</span>
            </Field>
            <Field label="TA copy">
              <DocLink url={r.taUrl} marked={mark("Copy of Tenancy Agreement")} />
            </Field>
            <Field label="Invoice copy">
              <DocLink url={r.invoiceUrl} marked={mark("Copy of Invoice")} />
            </Field>
            <Field label="Internal note">
              <span className="whitespace-pre-wrap">{r.internalNotes || "—"}</span>
            </Field>
          </dl>

          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <div className="mb-1 flex justify-between font-medium">
              <span>Initial payment</span>
              <span className={`tabular-nums ${pay.owed ? "text-amber-800" : ""}`}>
                {money(pay.total)} · {/* nothing paid is Unpaid, not Part paid (00715, 21 Oct 2026) */}
                {pay.owed ? (pay.paid > 0.005 ? `Part paid - owes ${money(pay.owed)}` : `Unpaid - owes ${money(pay.owed)}`) : "Paid"}
              </span>
            </div>
            <ul className="text-muted-foreground">
              {lines.map((l) => (
                <li key={l.label} className="flex justify-between">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className={`mt-1.5 flex justify-between border-t border-border pt-1.5 ${mark("Next billing period")}`}>
              <span className="text-muted-foreground">Next rent (paid up to {fmtDate(today)}'s period)</span>
              <span className="tabular-nums">
                {row.nextPaymentDue
                  ? `${row.nextBillingPeriod} · due ${fmtDate(row.nextPaymentDue)} · ${money(row.nextPaymentAmount ?? 0)}`
                  : row.nextBillingPeriod || "—"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function DocLink({ url, marked }: { url: string; marked: string }) {
  if (!url) return <span className={marked || "text-muted-foreground"}>Missing</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline ${marked}`}>
      Open <ExternalLink className="size-3" />
    </a>
  );
}

function Outcomes({ outcomes }: { outcomes: ImportOutcome[] }) {
  const failed = outcomes.filter((o) => o.result === "failed");
  const skipped = outcomes.filter((o) => o.result === "skipped");
  const done = outcomes.length - failed.length - skipped.length;
  return (
    <div className="mb-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <p className="font-medium">
        {done} imported{skipped.length ? ` · ${skipped.length} skipped` : ""}{failed.length ? ` · ${failed.length} failed` : ""}
      </p>
      {[...failed, ...skipped].map((o) => (
        <p key={o.sourceRow} className="mt-1 text-xs text-muted-foreground">
          Row {o.sourceRow} · {o.name} ({o.quickbooksId}): {"reason" in o ? o.reason : ""}
        </p>
      ))}
      {failed.length ? <p className="mt-2 text-xs">A failed resident was fully undone - fix the cause and import again; the ones already imported are skipped.</p> : null}
    </div>
  );
}
