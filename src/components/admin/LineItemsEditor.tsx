import type { ReactNode } from "react";
import { Dropdown } from "@/components/admin/Dropdown";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChargeInput } from "@/components/admin/ChargePicker";
import type { Charge } from "@/lib/charge-list";
import { lineQty } from "@/lib/invoices";
import { formatRM } from "@/data/properties";

/**
 * The lines of an invoice, edited - ONE editor for every money document
 * (Dani, 12 Oct 2026). The booking's invoice generator, a resident's invoice
 * and the checkout statement (a credit note or an invoice) each had their own
 * table, Add line and total, and they drifted apart in look and in behaviour.
 *
 * What differs between them is passed in, not copied:
 *   kinds      a Type column (the booking invoice: advance rent, refundable…)
 *   quantity   Price x Qty columns (a resident's charge)
 *   describe   how a line's description is typed: free text, Schedule B's
 *              charge list, or fixed (a forfeit the checkout kind decides)
 *   extra      what sits under a line (the statement's photos)
 *   action     a button beside a line (the statement's camera)
 *
 * Figures are written as the PDFs write them (formatRM, with sen) - not the
 * rounded `money` of the lists, which showed RM12.50 as "RM 13".
 *
 * A new money screen uses this. See docs/MISTAKES-TO-AVOID.md 3b.
 */
/** `id`, when a line has one, keeps its row (and its photos) when a line above is removed */
export type EditableLine = { id?: string; label: string; amount: number; quantity?: number; kind?: string };

export type Describe = "text" | "charge" | "fixed";

export function LineItemsEditor<T extends EditableLine>({
  title,
  lines,
  onChange,
  newLine,
  kinds,
  quantity = false,
  describe = () => "text",
  charges = [],
  readOnly = false,
  extra,
  action,
  headerActions,
  totalLabel = "Total",
  negative = false,
  empty = "No lines yet - add the first one.",
  placeholder = "Description",
}: {
  title: string;
  lines: T[];
  onChange: (next: T[]) => void;
  /** the blank line Add line appends */
  newLine: () => T;
  /** a Type column, when the document's lines have kinds */
  /** negative: a type that takes off (Contra) - its amount is always minus */
  kinds?: { value: string; label: string; negative?: boolean }[];
  /** Price and Qty columns; otherwise one Amount per line */
  quantity?: boolean;
  describe?: (line: T, i: number) => Describe;
  /** the residence's Schedule B list, for a line described "charge" */
  charges?: Charge[];
  /** shown, not edited - an issued or scheduled document */
  readOnly?: boolean;
  extra?: (line: T, i: number) => ReactNode;
  action?: (line: T, i: number) => ReactNode;
  /** beside Add line - e.g. the booking invoice's Recalculate */
  headerActions?: ReactNode;
  totalLabel?: string;
  /** the lines are taken off (a statement's deductions): figures print "- RM…" */
  negative?: boolean;
  empty?: string;
  placeholder?: string;
}) {
  const worth = (l: T) => (Number(l.amount) || 0) * lineQty(l.quantity);
  const total = lines.reduce((n, l) => n + worth(l), 0);
  const sign = negative ? "- " : "";
  // a Contra line deducts: whatever is typed, its amount is minus (Dani, 23 Oct 2026)
  const takesOff = (kind?: string) => !!kinds?.find((k) => k.value === kind)?.negative;
  const signed = (kind: string | undefined, v: number) => (takesOff(kind) ? -Math.abs(v) : Math.abs(v));
  const edit = (i: number, patch: Partial<EditableLine>) =>
    onChange(
      lines.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...patch };
        return { ...next, amount: signed(next.kind, Number(next.amount) || 0) };
      }),
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{title}</p>
        <div className="flex items-center gap-1">
          {headerActions}
          {readOnly ? null : (
            <Button size="sm" variant="ghost" onClick={() => onChange([...lines, newLine()])}>
              <Plus className="size-4" /> Add line
            </Button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {/* the boxes below are unlabelled on their own - this names them */}
        <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">Description</span>
          {kinds && !readOnly ? <span className="w-36">Type</span> : null}
          {quantity && !readOnly ? (
            <>
              <span className="w-24 text-right">Price (RM)</span>
              <span className="w-16 text-right">Qty</span>
            </>
          ) : null}
          <span className="w-28 text-right">Amount (RM)</span>
          {readOnly ? null : <span className={action ? "w-16 shrink-0" : "w-8 shrink-0"} aria-hidden />}
        </div>
        {lines.length ? null : <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>}
        {lines.map((l, i) => {
          const how = describe(l, i);
          return (
            <div key={l.id ?? i} className="space-y-2 px-3 py-2">
              {readOnly ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{l.label || "—"}</span>
                  <span className="w-28 text-right tabular-nums">
                    {sign}
                    {formatRM(worth(l))}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {how === "charge" ? (
                    <ChargeInput
                      value={l.label}
                      charges={charges}
                      placeholder={placeholder}
                      onChange={(label) => edit(i, { label })}
                      onPick={(label, amount) => edit(i, { label, ...(amount != null ? { amount } : {}) })}
                    />
                  ) : (
                    <Input
                      value={l.label}
                      placeholder={placeholder}
                      disabled={how === "fixed"}
                      className="h-8 flex-1"
                      onChange={(e) => edit(i, { label: e.target.value })}
                    />
                  )}
                  {kinds ? (
                    <Dropdown
                      value={l.kind ?? ""}
                      aria-label="Type"
                      onChange={(e) => edit(i, { kind: e.target.value })}
                      className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {kinds.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Dropdown>
                  ) : null}
                  {quantity ? (
                    <>
                      <Input
                        type="number"
                        value={l.amount}
                        aria-label="Price"
                        className="h-8 w-24 text-right tabular-nums"
                        onChange={(e) => edit(i, { amount: Number(e.target.value) || 0 })}
                      />
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={lineQty(l.quantity)}
                        aria-label="Quantity"
                        className="h-8 w-16 text-right tabular-nums"
                        onChange={(e) => edit(i, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                      />
                      <span className="w-28 text-right text-sm tabular-nums">{formatRM(worth(l))}</span>
                    </>
                  ) : (
                    <Input
                      type="number"
                      value={l.amount}
                      aria-label="Amount"
                      className="h-8 w-28 text-right tabular-nums"
                      // one amount per line: the quantity goes back to 1
                      onChange={(e) =>
                        edit(i, { amount: Number(e.target.value) || 0, ...(l.quantity != null ? { quantity: 1 } : {}) })
                      }
                    />
                  )}
                  {action?.(l, i)}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label="Remove line"
                    onClick={() => onChange(lines.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
              {extra?.(l, i)}
            </div>
          );
        })}
        <div className="flex items-center justify-between bg-muted px-3 py-2 text-sm font-medium">
          <span>{totalLabel}</span>
          <span className="tabular-nums">
            {sign}
            {formatRM(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
