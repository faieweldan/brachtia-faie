import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readableValue } from "@/lib/signatory";
import { isDocumentOwn, isTickResult, type MappingResult } from "@/lib/template-fields";

// "yes" ticks it, empty or "no" leaves it - the same rule as the PDF (pdf-boxes.ts)
const ticked = (v: string | null | undefined) => !["", "no", "false", "0"].includes(String(v ?? "").trim().toLowerCase());

/**
 * What a document will say, checked before it is generated.
 *
 * Read-only, apart from the few values that belong to the document itself
 * (Dani and Lav, 30 Sep 2026). A resident's name, IC, address and room belong
 * to their record: corrected here they would be right on this document and
 * still wrong on the application, the invoice and the next agreement. So those
 * are shown, and the way to change them is the resident's profile.
 */

export function DataReview({
  residentId,
  placeholders,
  results,
  overrides,
  onOverride,
  footer,
}: {
  residentId: string;
  /** null while no template is active */
  placeholders: string[] | null;
  results: Record<string, MappingResult>;
  overrides: Record<string, string>;
  onOverride: (key: string, value: string) => void;
  footer: ReactNode;
}) {
  const [onlyIssues, setOnlyIssues] = useState(false);

  const rows = useMemo(
    () =>
      (placeholders ?? []).map((key) => {
        const r = results[key];
        const own = isDocumentOwn(key);
        const blankByHand = r?.source === "Left blank";
        const issuedLater = key.toLowerCase().startsWith("agreement_id") && !r?.value;
        // an unticked box is a choice, not a gap
        const missing = !blankByHand && !issuedLater && !isTickResult(r) && (r?.result !== "mapped" || !r.value.trim());
        return { key, r, own, blankByHand, issuedLater, missing, edited: overrides[key] !== undefined };
      }),
    [placeholders, results, overrides],
  );


  const missingCount = rows.filter((r) => r.missing).length;
  const editedCount = rows.filter((r) => r.edited).length;

  return (
    <div className="flex max-h-[calc(100vh-2rem)] flex-col rounded-2xl border border-border bg-card lg:sticky lg:top-4">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-deep">Data review</p>
          <Link
            to="/admin/residents/$id"
            params={{ id: residentId }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
          >
            Edit resident <ExternalLink className="size-3" />
          </Link>
        </div>
        {placeholders ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              {rows.length - missingCount} filled
              {missingCount ? <span className="text-amber-700"> · {missingCount} missing</span> : null}
              {editedCount ? <span> · {editedCount} set here</span> : null}
            </p>
            {missingCount ? (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-brand"
                  checked={onlyIssues}
                  onChange={(e) => setOnlyIssues(e.target.checked)}
                />
                Show only what is missing
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {/*
        The same table as Settings' Mapping Test - each placeholder, where its
        value comes from, and the value - without the Result column: this is
        the last look before generating, a "confirm this is right" (Dani and
        Lav, 30 Sep 2026). The document's own values are edited in place.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!placeholders ? (
          <p className="pt-4 text-xs text-muted-foreground">Nothing to review until a template is active.</p>
        ) : !rows.length ? (
          <p className="pt-4 text-xs text-muted-foreground">This template has no placeholders.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Field</th>
                <th className="py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {(onlyIssues ? rows.filter((r) => r.missing) : rows).map((row) => (
                <tr key={row.key} className="border-t border-border align-top">
                  {/* the field's name first - what admin checks the value against - then the box it fills (Dani, 2 Oct 2026) */}
                  <td className="py-2 pr-2">
                    <div className="text-xs font-medium text-foreground">{row.own ? "Set here" : row.r?.label || row.r?.source || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      <code className="break-all">{row.key}</code>
                      {!row.own && row.r?.source && row.r.source !== row.r.label ? ` · ${row.r.source}` : ""}
                    </div>
                  </td>
                  <td className="py-2">
                    {/* a tick box: ticked by the system where it can tell, changed here by hand (Dani, 2 Oct 2026) */}
                    {isTickResult(row.r) ? (
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          aria-label={row.r?.label ?? row.key}
                          checked={ticked(row.r?.value)}
                          onChange={(e) => onOverride(row.key, e.target.checked ? "yes" : "")}
                        />
                        <span className="text-muted-foreground">{ticked(row.r?.value) ? "Ticked" : "Not ticked"}</span>
                      </label>
                    ) : row.own && /date/i.test(row.key) && toIso(row.r?.value ?? "") !== null ? (
                      // a date set here: picked from the calendar, printed as "1 Nov 2026" (Dani, 6 Oct 2026)
                      <DateInput
                        value={toIso(row.r?.value ?? "") ?? ""}
                        onChange={(e) => onOverride(row.key, e.target.value ? fromIso(e.target.value) : "")}
                        className="h-9 w-40"
                      />
                    ) : row.own ? (
                      <LongField label={row.r?.label ?? row.key} value={row.r?.value ?? ""} onChange={(v) => onOverride(row.key, v)} />
                    ) : (
                      <span
                        className={`break-words ${
                          row.missing ? "text-amber-700" : row.blankByHand || row.issuedLater ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {row.blankByHand
                          ? "Left blank"
                          : row.issuedLater
                            ? "On generate"
                            : row.r?.result === "unmapped"
                              ? "Not mapped"
                              : readableValue(row.r?.value).trim() || "Missing"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* always in reach, however long the list */}
      <div className="border-t border-border p-4">{footer}</div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Nov 2026" (as the document prints it) or "2026-11-01" to yyyy-mm-dd; "" stays ""; anything else is null */
function toIso(v: string): string | null {
  const t = v.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2}) ([A-Za-z]{3,})\.? (\d{4})$/.exec(t);
  const mi = m ? MONTHS.findIndex((x) => m[2]!.toLowerCase().startsWith(x.toLowerCase())) : -1;
  return m && mi >= 0 ? `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
};

/**
 * A document's own text - inclusions, exclusions - is long, and the box in the
 * list showed a few words of it (Dani, 6 Oct 2026). Clicking it opens a big box
 * to read and edit the whole of it.
 */
function LongField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Input
        className="h-7 cursor-pointer text-xs"
        aria-label={label}
        value={value}
        readOnly
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        title="Click to read and edit in full"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="admin-ui max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">{label}</DialogTitle>
          </DialogHeader>
          <Textarea autoFocus value={value} onChange={(e) => onChange(e.target.value)} rows={14} className="text-sm leading-relaxed" />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
