import { formatRM } from "@/data/properties";
import { DraftEye } from "@/components/admin/PdfPreview";
import { fmtDate } from "@/lib/ops-store";
import { MONEY_LABEL } from "@/lib/tenancy-change";
import type { previewTenancyChange } from "@/lib/tenancy-change.functions";

/**
 * Update Tenancy's money preview on Review (Dani, 15 Oct 2026). Everything
 * here is the server's (previewTenancyChange) - nothing is added up in the
 * browser, so the screen says what Confirm saves. Three things kept apart,
 * never netted: the Initial Payment invoice, the account credit, the rent.
 * A fee paid by credit is the fee, then the credit, then the balance.
 */
export type ChangePreview = Awaited<ReturnType<typeof previewTenancyChange>>;

const L = MONEY_LABEL;

function Section({
  title,
  eye,
  children,
}: {
  title: string;
  eye?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {eye}
      </div>
      <div className="space-y-0.5 rounded-lg bg-muted/40 px-3 py-2 text-xs tabular-nums">
        {children}
      </div>
    </div>
  );
}

function Figure({
  label,
  amount,
  strong = false,
  note,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  note?: string | undefined;
}) {
  return (
    <div className={strong ? "font-semibold text-foreground" : "text-foreground"}>
      <div className="flex justify-between gap-3">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0">{amount}</span>
      </div>
      {note ? <p className="text-[11px] font-normal text-muted-foreground">{note}</p> : null}
    </div>
  );
}

const minus = (n: number) => `−${formatRM(n)}`;

/** one event's money: its Initial Payment invoice, the credit it gives, its rent */
export function EventMoney({
  preview,
  index,
  today,
}: {
  preview: ChangePreview;
  index: number;
  today: string;
}) {
  const e = preview.events[index];
  if (!e) return null;
  const given = preview.credit.given.filter((g) => g.event === index);
  const rentMoves = Math.abs(e.rent - e.rentBefore) > 0.005;
  if (e.ip.total <= 0 && !given.length && !e.adjustment)
    return (
      <div className="space-y-1 text-xs">
        {rentMoves ? (
          <Figure
            label={L.contractualRent}
            amount={`${formatRM(e.rentBefore)} → ${formatRM(e.rent)}`}
          />
        ) : null}
        <p className="text-muted-foreground">
          No payment is required and no account credit arises.
        </p>
      </div>
    );
  const invoice = e.invoice;
  return (
    <div className="space-y-3">
      {e.ip.total > 0 ? (
        <Section
          title={L.initialPayment}
          eye={
            invoice ? (
              <DraftEye
                what="Initial Payment invoice"
                build={async () => (await import("@/lib/invoice-pdf")).invoicePdfUrl(invoice)}
              />
            ) : null
          }
        >
          {e.ip.lines.map((l) => (
            <Figure key={l.label} label={l.label} amount={formatRM(l.amount)} />
          ))}
          {e.ip.creditApplied > 0 ? (
            <Figure
              label={L.creditApplied}
              amount={minus(e.ip.creditApplied)}
              note={
                e.ip.fromEvents.length
                  ? `Arising from ${e.ip.fromEvents.map((f) => `Event ${f.n}, ${f.name}, ${fmtDate(f.date)}`).join("; ")}`
                  : undefined
              }
            />
          ) : null}
          <Figure label={L.balanceDue} amount={formatRM(e.ip.balanceDue)} strong />
          <p className="pt-0.5 text-[11px] text-muted-foreground">
            {e.ip.balanceDue <= 0
              ? "Paid by account credit on confirmation."
              : e.billOn <= today
                ? "Billed on confirmation."
                : `Billed on ${fmtDate(e.billOn)}.`}
          </p>
        </Section>
      ) : null}
      {given.length ? (
        <Section title={L.accountCredit}>
          {given.map((g) => (
            <Figure key={g.label} label={g.label} amount={formatRM(g.amount)} />
          ))}
        </Section>
      ) : null}
      {rentMoves || e.adjustment ? (
        <Section title={L.rent}>
          {rentMoves ? (
            <Figure
              label={L.contractualRent}
              amount={`${formatRM(e.rentBefore)} → ${formatRM(e.rent)}`}
            />
          ) : null}
          {e.adjustment ? (
            <Figure
              label={e.adjustment.label}
              amount={formatRM(e.adjustment.amount)}
              note="Raised once the Initial Payment is settled. The billed rent invoice is not changed."
            />
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

/** where the account credit goes after every event, and the credit note when some is left */
export function CreditOutcome({ preview }: { preview: ChangePreview }) {
  const c = preview.credit;
  if (c.totalGiven <= 0.005) return null;
  const onIps = preview.events.filter((e) => e.ip.creditApplied > 0);
  const note = preview.creditNote;
  return (
    <section className="space-y-3 rounded-xl border border-border px-4 py-3">
      <Section title={`${L.accountCredit} after this change`}>
        {c.given.map((g) => (
          <Figure key={`${g.event}-${g.label}`} label={g.label} amount={formatRM(g.amount)} />
        ))}
        <Figure label={L.totalCredit} amount={formatRM(c.totalGiven)} strong />
        {onIps.map((e) => (
          <Figure
            key={e.date + e.name}
            label={L.appliedTo(`${L.initialPayment}, ${e.name}`)}
            amount={minus(e.ip.creditApplied)}
          />
        ))}
        {c.credited.map((x) => (
          <Figure
            key={x.label}
            label={L.appliedTo(x.label)}
            amount={minus(x.credit)}
            note={`${formatRM(x.owing)}, ${x.after > 0 ? `${formatRM(x.after)} still to pay` : "paid in full by credit"}`}
          />
        ))}
        <Figure label={L.remainingCredit} amount={formatRM(c.leftover)} strong />
        {c.onward ? (
          <p className="pt-0.5 text-[11px] text-muted-foreground">
            {c.onward.from} onward: {formatRM(c.onward.rent)} a month.
          </p>
        ) : null}
      </Section>
      {note ? (
        <Section
          title={L.creditNote}
          eye={
            <DraftEye
              what="credit note"
              build={async () => (await import("@/lib/credit-note-pdf")).creditNotePdfUrl(note)}
            />
          }
        >
          <Figure
            label={`Credit not applicable to any invoice as at ${fmtDate(preview.asAt)}`}
            amount={formatRM(c.leftover)}
            strong
          />
          <p className="text-[11px] text-muted-foreground">
            Category: {note.subtitle}. To be issued through Payables. The amount is confirmed on the
            date of issue.
          </p>
        </Section>
      ) : null}
    </section>
  );
}
