# Google Docs legal-document templates

## Decision

Use **Google Docs as the rendering source** and support both ways of creating a template version:

1. **Google Docs link** — recommended when exact Google Docs formatting is required.
2. **Word (.docx) upload** — import the file into Google Docs, then let admin review the imported layout before activation.

Each generated document will be downloadable as both a Google-rendered PDF and an exported Word file.

## Formatting promise

- A Google Docs link preserves the source Google Doc's page size, margins, fonts, spacing, tables, headers, footers, alignment, and page breaks when Google exports it to PDF.
- A Word upload may change slightly during Google's one-time DOCX-to-Google-Docs import. The imported version must be previewed and approved before activation.
- The system will never use the current reconstructed webpage text as the legal preview.

## Template workflow

### Google Docs link

- Admin pastes a Google Docs URL.
- The app reads the document and its placeholders through the Google Docs connection.
- The app stores the source document ID on that template version.
- The PDF exported by Google becomes the fixed-page preview.

### Word upload

- Admin uploads the `.docx` as today.
- The app imports it into the connected Google Drive as a Google Doc.
- The imported Google Doc becomes that template version's source.
- Admin sees the Google-rendered PDF and must approve the layout before activation.
- The original uploaded DOCX remains privately stored for audit/history.

## Placeholder mapping

- Detect placeholders from Google Docs content, including paragraphs, tables, headers, and footers where the API exposes them.
- Keep the existing mapping choices, formulas, missing-value checks, version history, Draft/Active workflow, and resident Test Mapping.
- Fill placeholders by copying the source Google Doc, replacing text in the copy, then exporting the result.
- Never edit the master source document during Test Mapping or document generation.

## Fixed document viewer

Use the actual Google-exported PDF for every preview:

- neutral grey background
- fixed white pages with subtle border/shadow
- no text reflow when the panel changes width
- controls for previous page, next page, `Page 1 of X`, Zoom Out, percentage, Zoom In, and Fit Page

Use the same viewer in Settings → Templates, Test Mapping, Create Document Pack, and View generated document.

## Generation and downloads

- Generate Document Pack copies each active Google Docs template, replaces placeholders with the reviewed resident values, and exports both PDF and DOCX.
- Save both generated files privately against the exact generated-document record and template version.
- Each row offers **View PDF**, **Download PDF**, and **Download Word**.
- Existing generated records without stored files remain marked as older records; they are not silently rebuilt from a newer template.
- Delete temporary Google Drive copies after both exports complete.

## Data and security

- Store the Google document ID, original upload path, preview PDF path, import/review status, generated PDF/DOCX paths, and generation errors.
- Google credentials remain server-side; template and generated files remain private.
- Use the workspace-owned Google Docs and Google Drive connections because this is one Brachtia-controlled template library, not each resident's personal Google account.
- Make migrations repeatable, apply them to `test-bratchia`, and list the same SQL in `docs/PENDING-ON-LOVABLE.md` for the live database.
- Record the Google-Docs-source/PDF-preview architecture in `AGENTS.md`.

## Validation

- Test a native Google Docs link and both uploaded Word samples.
- Compare every exported PDF page with its Google Docs source: logo, margins, typography, tables, signatures, headers/footers, and page numbers.
- Verify Test Mapping and final generation use copies and never alter the source.
- Verify PDF preview, PDF download, and Word download all use the same template version and saved values.
- Verify private files cannot be opened without an active admin session.
- Verify desktop/mobile viewer controls, app build, and current error logs.

## Prerequisite

Link one Brachtia Google account to both **Google Docs** and **Google Drive** when the connection cards appear. Google Docs handles document text replacement; Google Drive handles DOCX import and PDF/DOCX export.
