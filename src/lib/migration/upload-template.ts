import contract from "@/lib/migration/sheet3-contract.json";

/**
 * The blank bulk-upload file (Dani, 13 Oct 2026). Built from the upload
 * contract - the same column list Bulk upload reads - so the template and the
 * importer cannot drift apart. tests/upload-template.test.ts checks every column
 * the upload requires is in it.
 *
 *   Residents  the header row, in Sheet3's order, ready to fill in
 *   Guide      one line per column: required or not, and what goes in it
 */
type Column = { sheet3: string; required?: boolean; validation?: string; notes?: string };

const columns = (contract.columns as Column[]).map((c) => ({ ...c, sheet3: c.sheet3.trim() }));

export const templateHeaders = () => columns.map((c) => c.sheet3);

export const templateGuide = () =>
  columns.map((c) => ({
    Column: c.sheet3,
    Required: c.required ? "Yes" : "",
    "What goes in it": c.validation ?? "",
    Notes: c.notes ?? "",
  }));

export async function downloadUploadTemplate() {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([templateHeaders()]), "Residents");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(templateGuide()), "Guide");
  XLSX.writeFile(book, "brachtia-resident-upload-template.xlsx");
}
