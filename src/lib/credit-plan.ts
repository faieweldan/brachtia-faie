/**
 * Where a resident's account credit will go (Dani, 13 Oct 2026): onto the
 * next invoice to pay, the rest onto the one after, and so on - the order
 * applyAccountCredit uses on the day each is billed. What no invoice can take
 * is the leftover: that, and only that, may become a credit note and be paid
 * back. A resident who paid the whole term up front has nothing left to bill,
 * so all of it is leftover.
 *
 * Pure, so the screen's preview and the server's credit note use one rule.
 */
export type CreditTarget = { id: string; owing: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function planCredit(balance: number, targets: CreditTarget[]) {
  let left = r2(Math.max(0, balance));
  const plan: { id: string; owing: number; credit: number; after: number }[] = [];
  for (const t of targets) {
    const owing = r2(Math.max(0, t.owing));
    if (owing <= 0.005) continue;
    const credit = r2(Math.min(owing, left));
    left = r2(left - credit);
    plan.push({ id: t.id, owing, credit, after: r2(owing - credit) });
  }
  return { plan, leftover: left };
}
