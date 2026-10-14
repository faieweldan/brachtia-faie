/* The words for an occupancy - no imports, so a PDF can read them without the app's store. */

/**
 * An occupancy however it was written - "twin", "Twin", "Twin sharing",
 * "Single (whole room)" - as one key (14 Oct 2026). Invoices kept it as copied
 * text in several spellings, and the PDF compared it to "twin" alone: an
 * Update Tenancy IP saved "Twin" and printed Single for a twin bed.
 */
export const occupancyKey = (v: string | null | undefined): "single" | "twin" | "unit" | "" => {
  const s = String(v ?? "").toLowerCase();
  if (!s) return "";
  if (/unit/.test(s)) return "unit";
  return /twin/.test(s) && !/whole|single/.test(s) ? "twin" : "single";
};

/** an occupancy as an invoice prints it */
export const occupancyPrinted = (v: string | null | undefined) =>
  ({ twin: "Twin sharing (per pax)", unit: "Whole unit", single: "Single", "": "Single" })[occupancyKey(v)];
