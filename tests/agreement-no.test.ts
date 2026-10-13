import { describe, expect, test } from "bun:test";

import { agreementNo, nextAgreementNo } from "../src/lib/agreement-no";

/** TA + Resident ID + agreement sequence (Dani, 12 Oct 2026). */
describe("agreement number", () => {
  test("TA-26IF0042-01 is the resident's first agreement", () => {
    expect(agreementNo("26IF0042", 1)).toBe("TA-26IF0042-01");
    expect(agreementNo("26if0042 ", 3)).toBe("TA-26IF0042-03");
  });

  const db = (code: string, taken: string[]) => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === "residents"
            ? { maybeSingle: async () => ({ data: { resident_code: code } }) }
            : Promise.resolve({ data: taken.map((agreement_no) => ({ agreement_no })) }),
      }),
    }),
  });

  test("the next one counts the resident's own agreements", async () => {
    expect(await nextAgreementNo(db("26IF0042", []), "r")).toBe("TA-26IF0042-01");
    expect(await nextAgreementNo(db("26IF0042", ["TA-26IF0042-01"]), "r")).toBe("TA-26IF0042-02");
  });

  test("an older-style number does not stop the sequence", async () => {
    expect(await nextAgreementNo(db("26IF0042", ["TA-0040"]), "r")).toBe("TA-26IF0042-02");
  });

  test("no Resident ID yet: refused with the reason", async () => {
    await expect(nextAgreementNo(db("", []), "r")).rejects.toThrow(/Resident ID/);
  });
});
