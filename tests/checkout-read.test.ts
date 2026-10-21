import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readStatement } from "../src/lib/checkout.server";

describe("checkout reads used by dashboard money and tasks", () => {
  test("reading statements does not eagerly import the PDF engine", () => {
    const source = readFileSync("src/lib/checkout.server.ts", "utf8");
    expect(source).not.toMatch(/^import\s+.*from\s+["'](?:pdf-lib|@\/lib\/credit-note-pdf)["']/m);
    expect(source).toContain('await import("@/lib/credit-note-pdf")');
  });

  test("reads the saved settlement without generating a PDF", async () => {
    const calls: string[] = [];
    const saved = { number: "CN/CS/00001", settled: { refund: 500, owed: 0 }, versions: [] };
    const sb = {
      storage: {
        from: (bucket: string) => ({
          download: async (path: string) => {
            calls.push(`${bucket}/${path}`);
            return { data: new Blob([JSON.stringify(saved)]) };
          },
        }),
      },
    };
    expect(await readStatement(sb, "resident-1")).toEqual(saved);
    expect(calls).toEqual(["resident-documents/checkout/resident-1/statement.json"]);
  });

  test("a missing statement returns null", async () => {
    const sb = { storage: { from: () => ({ download: async () => ({ data: null }) }) } };
    expect(await readStatement(sb, "resident-1")).toBeNull();
  });
});