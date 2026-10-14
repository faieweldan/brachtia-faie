import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { templateHeaders } from "../src/lib/migration/upload-template";
import { isSheet3Grid, previewSheet3Grid } from "../src/lib/migration/sheet3";

describe("bulk upload template", () => {
  test("Bulk upload recognises the blank template as its own file", () => {
    // the template's header row, read back the way Bulk upload reads a file
    const sheet = XLSX.utils.aoa_to_sheet([templateHeaders()]);
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(isSheet3Grid(grid)).toBe(true);
  });

  test("every column the upload requires is in the template", () => {
    const grid = [templateHeaders()];
    expect(previewSheet3Grid(grid, { units: [], residents: [] }).missingHeaders).toEqual([]);
  });

  test("no column is listed twice", () => {
    const keys = templateHeaders().map((h) => h.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
