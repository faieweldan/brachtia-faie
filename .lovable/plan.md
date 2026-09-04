# Unit bulk upload: drop rent, switch to Excel

Two changes to the Unit setup bulk-upload flow, both in `src/routes/admin.homes.units.tsx`.

## 1. Remove rent from the template

Rent already comes from the Website module's room types (the Units panel says so), so asking for it in the upload file contradicts that and lets the two drift apart. Remove the rent column from the template and from the importer; the importer takes rent from the matched room type instead.

## 2. Excel (.xlsx) instead of CSV

- "Template" button downloads `brachtia-units-template.xlsx` — a single sheet named "Units" with a bold header row, sensible column widths and four sample rows.
- "Bulk upload" accepts `.xlsx` (and `.xls`), reads the first sheet, and maps rows by header name exactly as today.
- Same grouping (residence + unit no.), same residence matching, same room-type lookup, same toast summary of imported and skipped units.

Columns: `residence`, `unit_no`, `unit_type`, `room_letter`, `room_type_code`, `occupancy`.

## Technical notes

- Add the `xlsx` (SheetJS) package; it runs client-side, so no server function or migration is needed.
- Template: `XLSX.utils.aoa_to_sheet` → `book_append_sheet` → `XLSX.write(..., { bookType: "xlsx", type: "array" })` → Blob download.
- Import: `file.arrayBuffer()` → `XLSX.read` → `sheet_to_json(sheet, { defval: "" })`, lower-casing/trimming header keys before mapping.
- `importCsv` renamed to `importWorkbook`; the hidden file input's `accept` becomes `.xlsx,.xls`.
- Empty-file and no-matching-residence handling stays as today (error toast / skipped count).

## Out of scope

No changes to the manual unit editor, the room-type lookup, the store, or any other route. The per-room "Rent (RM/mo)" field in the manual editor stays as an override.

## Verification

- `bunx tsgo --noEmit`
- `/admin/homes/units` loads; template downloads and re-uploads cleanly.
