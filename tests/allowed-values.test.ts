import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";

import {
  MARITAL_OPTIONS,
  RACE_OPTIONS,
  REFERRAL_OPTIONS,
  RELIGION_OPTIONS,
  YES_NO_OPTIONS,
} from "../src/lib/reference-data";

/**
 * The Excel and the system accept the same answers (Dani, 13 Oct 2026): the
 * "Allowed values" tab the converter checks Sheet3 against must hold exactly
 * the system's dropdown values - nothing the system takes is refused in the
 * Excel, and nothing the Excel lets through is unknown to the system.
 */
const FILE = "references/Data Labelling.xlsx";

describe.skipIf(!existsSync(FILE))("Allowed values tab = the system's lists", () => {
  const wb = XLSX.read(readFileSync(FILE));
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Allowed values"]!, { header: 1 });
  const listed = (field: string) =>
    new Set(rows.slice(3).filter((r) => r[0] === field && r[1] != null && r[1] !== "").map((r) => String(r[1])));
  const system = (options: { value: string }[]) => new Set(options.map((o) => o.value));

  for (const [field, options] of [
    ["Marital status", MARITAL_OPTIONS],
    ["Race", RACE_OPTIONS],
    ["Religion", RELIGION_OPTIONS],
    ["Referral source", REFERRAL_OPTIONS],
    ["Medical condition", YES_NO_OPTIONS],
  ] as const) {
    test(field, () => expect(listed(field)).toEqual(system(options)));
  }
});
