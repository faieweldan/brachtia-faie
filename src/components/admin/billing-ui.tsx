import type { ReactNode } from "react";

import { TONE, collectedPct, type Tone } from "@/lib/billing-tone";

/**
 * The pieces both money pages are built from - a resident's Payments tab and
 * Collections - so the two read as one system and cannot drift apart. The
 * colours and the arithmetic are in billing-tone.ts.
 */

export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone].pill}`}
    >
      {children}
    </span>
  );
}

export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: Tone | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${TONE[tone ?? "idle"].text}`}>
        {value}
      </p>
    </div>
  );
}

/** A thin bar of how much is in. `small` sits under a number in a table row. */
export function PaidBar({ pct, small = false }: { pct: number; small?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-full bg-muted ${small ? "mt-1 h-1 w-20" : "mt-4 h-1.5"}`}
      role="progressbar"
      aria-label="Collected"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** How much of what was billed is in: a bar, a line of context, and the percentage. */
export function CollectedBar({
  billed,
  collected,
  children,
}: {
  billed: number;
  collected: number;
  children?: ReactNode;
}) {
  const pct = collectedPct(billed, collected);
  return (
    <>
      {billed > 0 ? <PaidBar pct={pct} /> : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{children}</span>
        {billed > 0 ? <span className="tabular-nums">{pct}%</span> : null}
      </div>
    </>
  );
}
