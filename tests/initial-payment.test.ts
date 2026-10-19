import { describe, expect, test } from "bun:test";

import { initialPaymentOf } from "@/lib/migration/import-plan";
import type { MigrationPreviewRow } from "@/lib/migration/sheet3";

/*
 * A migrated initial invoice that is not fully paid (Dani, 19 Oct 2026). The
 * amounts are the real cases' totals; nothing else about them is here. One
 * rule (initialPaymentOf) for the upload preview and the import.
 */
function row(lines: number, totalPaid: number, balanceDue = 0): MigrationPreviewRow {
  return {
    charges: { proratedRent: 0, advanceRent: lines, securityDeposit: 0, utilitiesDeposit: 0, accessCardDeposit: 0, residentCardCharges: 0, adminAgreementCharges: 0 },
    record: { starterPack: 0, totalPaid, balanceDue } as any,
  } as unknown as MigrationPreviewRow;
}

describe("a migrated initial payment that is not fully paid", () => {
  test.each([
    ["00991", 4316.88, 4185.17, 131.71],
    ["00916", 5005.0, 4774.56, 230.44],
    ["00912", 4407.9, 4251.54, 156.36],
  ])("%s owes the rest: issued, paid what came in", (_qb, lines, paidIn, owed) => {
    const p = initialPaymentOf(row(lines, paidIn, owed));
    expect(p).toMatchObject({ total: lines, owed, paid: paidIn, status: "issued", unexplained: 0 });
  });

  test("00994: the team's 57.94 is what is owed", () => {
    const p = initialPaymentOf(row(4000, 3942.06, 57.94));
    expect(p).toMatchObject({ owed: 57.94, paid: 3942.06, status: "issued" });
  });

  test.each([
    ["00952", 4000, 4011.16],
    ["00993", 4000, 4003.18],
  ])("%s paid more than the lines: paid in full, no credit", (_qb, lines, paidIn) => {
    const p = initialPaymentOf(row(lines, paidIn));
    expect(p).toMatchObject({ owed: 0, paid: lines, status: "paid", unexplained: 0 });
  });

  test("00721 running account, cleared by the team: paid", () => {
    expect(initialPaymentOf(row(4000, 4500)).status).toBe("paid");
  });

  test("1 sen or less is not a debt", () => {
    expect(initialPaymentOf(row(4000, 3999.99, 0.01)).status).toBe("paid");
  });

  test("owed is never more than the invoice", () => {
    expect(initialPaymentOf(row(100, 0, 500))).toMatchObject({ owed: 100, paid: 0, status: "issued" });
  });

  test("paid less but no Initial Balance Due: paid, and flagged for the team", () => {
    const p = initialPaymentOf(row(4316.88, 4185.17));
    expect(p).toMatchObject({ status: "paid", owed: 0, unexplained: 131.71 });
  });
});
