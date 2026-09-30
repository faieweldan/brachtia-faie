import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

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
        const missing = !blankByHand && !issuedLater && (r?.result !== "mapped" || !r.value.trim());
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
                <th className="py-2 pr-2 font-medium">Placeholder</th>
                <th className="py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {(onlyIssues ? rows.filter((r) => r.missing) : rows).map((row) => (
                <tr key={row.key} className="border-t border-border align-top">
                  <td className="py-2 pr-2">
                    <code className="break-all text-[11px]">{row.key}</code>
                    <div className="text-[10px] text-muted-foreground">
                      {row.own ? "Set here" : (row.r?.source ?? "—")}
                    </div>
                  </td>
                  <td className="py-2">
                    {row.own ? (
                      <Input
                        className="h-7 text-xs"
                        aria-label={row.key}
                        value={row.r?.value ?? ""}
                        onChange={(e) => onOverride(row.key, e.target.value)}
                      />
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
                              : row.r?.value?.trim() || "Missing"}
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
