import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Plus, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import type { ImportReport } from "@/lib/residents.functions";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { completeness } from "@/lib/resident-fields";
import { rowsFromGrid } from "@/lib/master-list";
import { useBillingLedger } from "@/lib/billing-client";
import {
  blankResident,
  findBedForResident,
  fmtDate,
  money,
  refreshResidents,
  refreshUnits,
  saveResidentRecord,
  stayDates,
  useOps,
} from "@/lib/ops-store";
import { universityAbbr } from "@/data/form-options";

export const Route = createFileRoute("/admin/residents/")({
  component: ResidentsListPage,
});

function ResidentsListPage() {
  const navigate = useNavigate();
  const { residents, units, tenancies } = useOps();
  // what each resident owes, from the same invoices as Collections
  const { rows: ledger } = useBillingLedger();
  const owed = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of ledger) {
      if (l.residentId && l.outstanding > 0) {
        m.set(l.residentId, (m.get(l.residentId) ?? 0) + l.outstanding);
      }
    }
    return m;
  }, [ledger]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "inactive" | "all">("active");
  const [university, setUniversity] = useState("");
  const [residence, setResidence] = useState("");

  const universities = useMemo(
    () => Array.from(new Set(residents.map((r) => universityAbbr(r.university)).filter(Boolean))),
    [residents],
  );
  const residences = useMemo(
    () => Array.from(new Set(units.map((u) => u.residenceName).filter(Boolean))),
    [units],
  );

  /**
   * Former residents are kept, never deleted - Malaysian record-keeping runs to
   * seven years - so the list defaults to current residents and keeps the rest
   * one click away.
   */
  const isInactive = (r: (typeof residents)[number]) =>
    (r.status || "").toLowerCase() === "inactive";

  const counts = {
    active: residents.filter((r) => !isInactive(r)).length,
    inactive: residents.filter(isInactive).length,
  };

  const rows = residents.filter((r) => {
    if (view === "active" && isInactive(r)) return false;
    if (view === "inactive" && !isInactive(r)) return false;
    if (university && universityAbbr(r.university) !== university) return false;
    if (residence) {
      const placed = findBedForResident(units, r);
      if (placed?.unit.residenceName !== residence) return false;
    }
    // the Brachtia id and mobile are how staff actually look people up
    const haystack =
      `${r.fullName} ${r.residentCode} ${r.quickbooksId} ${r.email} ${r.studentId} ${r.mobile} ${r.idNumber}`.toLowerCase();
    if (q && !haystack.includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  /**
   * Reads the Brachtia master list as-is - one row per bed - and hands it to the
   * server, which upserts each student on their StudentID and stamps them onto
   * the matching bed.
   */
  async function importMasterList(file: File) {
    setImporting(true);
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = book.SheetNames[0];
      const sheet = sheetName ? book.Sheets[sheetName] : undefined;
      const grid: unknown[][] = sheet
        ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][])
        : [];
      // read the same way the dry run reads it (scripts/check-master-list.ts)
      const parsed = rowsFromGrid(grid);
      if (!parsed) {
        toast.error("No StudentID column found - is this the master list?");
        return;
      }
      const withData = parsed.map((p) => p.row);
      if (!withData.length) {
        toast.error("That file has no rows");
        return;
      }

      const { importResidents } = await import("@/lib/residents.functions");
      const report = await importResidents({ data: { rows: withData, filename: file.name } });
      setReport(report);
      await refreshResidents();
      await refreshUnits();

      toast.success(
        `${report.residents} resident${report.residents === 1 ? "" : "s"} imported · ` +
          `${report.placed} placed · ${report.cleared} beds cleared` +
          (report.duplicates ? ` · ${report.duplicates} duplicate rows` : ""),
      );
      if (report.problems.length) {
        console.warn("[import] problems", report.problems);
        toast.warning(`${report.problems.length} rows need attention - see the browser console`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  /** Open an empty form. The row is created when it is saved, not before. */
  function addResident() {
    void navigate({ to: "/admin/residents/$id", params: { id: "new" } });
  }

  function downloadProblems() {
    if (!report?.problems.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      report.problems.map((p) => ({ Row: p.row, StudentID: p.quickbooksId, Problem: p.reason })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Problems");
    const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const url = URL.createObjectURL(
      new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-problems.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {report ? (
        <Panel
          title="Last import"
          description="Rows the import could not place are listed here, with their spreadsheet row number."
          action={
            <div className="flex items-center gap-2">
              {report.problems.length ? (
                <Button size="sm" variant="outline" onClick={downloadProblems}>
                  <Download className="mr-1 size-4" /> Export list
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setReport(null)}>
                Dismiss
              </Button>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              { label: "Residents", value: report.residents },
              { label: "Placed in a bed", value: report.placed },
              { label: "Beds cleared", value: report.cleared },
              { label: "Needs attention", value: report.problems.length },
            ].map((s) => (
              <div key={s.label} className="bg-card px-4 py-3">
                <p className="text-lg font-semibold tabular-nums text-brand-deep">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {report.problems.length ? (
            <div className="max-h-80 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-4 py-2 font-medium">StudentID</th>
                    <th className="px-4 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.problems.map((p, i) => (
                    <tr key={`${p.row}-${i}`}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{p.row}</td>
                      <td className="px-4 py-2 font-medium">{p.quickbooksId || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Every row imported cleanly.</p>
          )}
        </Panel>
      ) : null}

      <Panel
        title="Residents"
        description="Profiles built from the student housing application form."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-4" /> {importing ? "Importing…" : "Bulk upload"}
            </Button>
            <Button size="sm" onClick={addResident}>
              <Plus className="mr-1 size-4" /> Add resident
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importMasterList(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        {residents.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No residents yet"
            hint="Create a resident profile from a booked enquiry, or add one manually to test the flow."
            action={
              <Button size="sm" onClick={addResident}>
                Add resident
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  { key: "active", label: "Current", count: counts.active },
                  { key: "inactive", label: "Former", count: counts.inactive },
                  { key: "all", label: "All", count: residents.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    view === t.key
                      ? "border-brand-deep bg-brand-deep text-white"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.label} · {t.count}
                </button>
              ))}
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Search</p>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, resident ID, email, mobile"
                />
              </div>
              <Select
                label="University"
                value={university}
                onChange={setUniversity}
                options={universities}
                placeholder="All"
              />
              <Select
                label="Residence"
                value={residence}
                onChange={setResidence}
                options={residences}
                placeholder="All"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Resident</th>
                    <th className="px-3 py-2 font-medium">Resident ID</th>
                    <th className="px-3 py-2 font-medium">QuickBooks ID</th>
                    <th className="px-3 py-2 text-center font-medium">Placement</th>
                    <th className="px-3 py-2 font-medium">University</th>
                    <th className="px-3 py-2 font-medium">Tenancy</th>
                    <th className="px-3 py-2 font-medium">Profile</th>
                    <th className="px-3 py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const placed = findBedForResident(units, r);
                    const stay = stayDates(
                      tenancies.find((t) => t.residentId === r.id),
                      placed,
                      r,
                    );
                    const balance = owed.get(r.id) ?? 0;
                    const pct = completeness(r).pct;
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <Link
                            to="/admin/residents/$id"
                            params={{ id: r.id }}
                            className="font-medium text-brand-deep underline-offset-2 hover:underline"
                          >
                            {r.fullName || "Untitled resident"}
                          </Link>
                        </td>
                        {/* The two IDs are kept apart, each in its own column: the
                            resident ID this system gives, and the QuickBooks ID an
                            older resident came in with. Shown side by side because
                            one resident can hold both and staff are asked for
                            whichever the other system knows them by. Neither is the
                            university's student ID. */}
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                          {r.residentCode || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                          {r.quickbooksId || "—"}
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">
                          {placed ? (
                            // where they are on top, how the room is sold underneath - and a
                            // way straight to that unit in Homes
                            <Link
                              to="/admin/homes"
                              search={{
                                residence: placed.unit.residenceName,
                                unit: placed.unit.id,
                              }}
                              className="group inline-flex flex-col items-center leading-tight"
                            >
                              <span className="whitespace-nowrap text-foreground underline-offset-2 group-hover:text-brand-deep group-hover:underline">
                                {placed.unit.unitNo} · Room {placed.room.letter}
                              </span>
                              <span className="text-xs">{placed.bed.label}</span>
                            </Link>
                          ) : (
                            "Unassigned"
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {universityAbbr(r.university) || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {stay.start || stay.end ? (
                            <span className="whitespace-nowrap">
                              {fmtDate(stay.start)} → {fmtDate(stay.end)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={pct === 100 ? "paid" : "due"} label={`${pct}%`} />
                        </td>
                        <td className="px-3 py-2">{balance ? money(balance) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
