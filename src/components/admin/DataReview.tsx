import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, PencilLine } from "lucide-react";

import { Input } from "@/components/ui/input";
import { isDocumentOwn, type MappingResult } from "@/lib/template-fields";

/**
 * What a document will say, checked before it is generated.
 *
 * Read-only, apart from the few values that belong to the document itself
 * (Dani and Lav, 30 Sep 2026). A resident's name, IC, address and room belong
 * to their record: corrected here they would be right on this document and
 * still wrong on the application, the invoice and the next agreement. So those
 * are shown, and the way to change them is the resident's profile.
 */

/** Where a value comes from, as a heading, in the order the documents read. */
const GROUPS: { title: string; sources: string[] }[] = [
  { title: "This document", sources: [] },
  { title: "Resident", sources: ["Resident Record"] },
  { title: "Premises", sources: ["Room Record"] },
  { title: "Tenancy", sources: ["Tenancy Record", "Booking Record"] },
  { title: "Payments", sources: ["Initial Payment"] },
  { title: "Signatures and other", sources: [] },
];

const pretty = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const rows = useMemo(
    () =>
      (placeholders ?? []).map((key) => {
        const r = results[key];
        const own = isDocumentOwn(key);
        const blankByHand = r?.source === "Left blank";
        const issuedLater = key.toLowerCase().startsWith("agreement_id") && !r?.value;
        const missing = !blankByHand && !issuedLater && (r?.result !== "mapped" || !r.value.trim());
        return { key, r, own, blankByHand, issuedLater, missing, edited: overrides[key] !== undefined };
      }),
    [placeholders, results, overrides],
  );

  const grouped = GROUPS.map((g, i) => ({
    ...g,
    rows: rows.filter((row) => {
      if (row.own) return i === 0;
      if (i === 0) return false;
      const src = row.r?.source ?? "";
      const home = GROUPS.findIndex((x) => x.sources.includes(src));
      return home === -1 ? i === GROUPS.length - 1 : home === i;
    }),
  })).filter((g) => g.rows.length);

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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!placeholders ? (
          <p className="text-xs text-muted-foreground">Nothing to review until a template is active.</p>
        ) : !rows.length ? (
          <p className="text-xs text-muted-foreground">This template has no placeholders.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => {
              const shown = onlyIssues ? g.rows.filter((r) => r.missing) : g.rows;
              if (!shown.length) return null;
              const isClosed = closed[g.title];
              return (
                <section key={g.title}>
                  <button
                    type="button"
                    onClick={() => setClosed({ ...closed, [g.title]: !isClosed })}
                    className="mb-1.5 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {g.title}
                    <ChevronDown className={`size-3.5 transition-transform ${isClosed ? "-rotate-90" : ""}`} />
                  </button>
                  {isClosed ? null : (
                    <dl className="divide-y divide-border/70 rounded-lg border border-border/70">
                      {shown.map((row) => (
                        <div key={row.key} className="px-3 py-2">
                          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {pretty(row.key)}
                            {row.own ? <PencilLine className="size-3 text-brand" aria-label="Can be set here" /> : null}
                          </dt>
                          {row.own ? (
                            <Input
                              className="mt-1 h-8 text-sm"
                              value={row.r?.value ?? ""}
                              onChange={(e) => onOverride(row.key, e.target.value)}
                            />
                          ) : (
                            <dd
                              className={`mt-0.5 break-words text-sm ${
                                row.missing ? "text-amber-700" : row.blankByHand || row.issuedLater ? "text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {row.blankByHand
                                ? "Left blank — filled by hand"
                                : row.issuedLater
                                  ? "Issued when generated"
                                  : row.r?.result === "unmapped"
                                    ? "Not mapped in the template"
                                    : row.r?.value?.trim() || "Missing — add it in the resident's profile"}
                            </dd>
                          )}
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* always in reach, however long the list */}
      <div className="border-t border-border p-4">{footer}</div>
    </div>
  );
}
