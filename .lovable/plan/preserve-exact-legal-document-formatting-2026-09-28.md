# Preserve exact legal-document formatting

## Decision

Keep **Microsoft Word (.docx) as the master template** and produce both:

1. the populated Word document, with placeholders replaced inside the original file; and
2. a PDF rendered by Microsoft Word, used for the fixed-page preview and final PDF download.

Do not use Google Docs or rebuild the file as webpage text. Google Docs can change a Word document during import, while a PDF-only template would make future placeholder and wording changes harder.

## Important page-size check

The uploaded Tenancy Agreement currently declares **US Letter (8.5 × 11 inches)**, not A4. Exact preservation and forced A4 conversion conflict because changing the page size can move text and page breaks.

The system will preserve the template's native page size and clearly flag a non-A4 upload. To satisfy both requirements, the source template must first be set to A4 in Microsoft Word and uploaded again. Schedule A will receive the same validation.

## What will change

### 1. Preserve the original Word file

- Stop treating the converted webpage version as the legal template.
- Keep each uploaded `.docx` as the authoritative version.
- Detect placeholders directly from the Word document, including text split across Word formatting runs.
- Keep the existing field-mapping panel, version history, Draft/Active workflow, and resident test selection.
- Replace placeholder text within the DOCX package without rebuilding paragraphs, tables, headers, footers, or sections.

Example: `{{Resident_full_name}}` will be replaced where it already sits in the Word file. Its surrounding font, bold/italic style, alignment, table cell, spacing, and page position remain unchanged.

### 2. Generate an exact PDF through Microsoft Word

- Link Brachtia's Microsoft Word/OneDrive account to the project.
- After placeholder replacement, temporarily send the populated DOCX to Microsoft Word, request Microsoft's PDF conversion, and return the PDF to the app.
- Save both generated files privately against the agreement document:
  - populated `.docx`
  - matching `.pdf`
- Remove the temporary OneDrive copy after conversion where the service permits it.
- Surface Microsoft conversion failures clearly; never fall back to the current webpage renderer for a legal document.

### 3. Fixed document viewer

Use the generated PDF itself for all legal-document previews:

- neutral grey viewer background
- separate fixed pages with white backgrounds, subtle borders, and shadows
- the source document's page size, margins, fonts, spacing, tables, headers, footers, alignment, and page breaks
- controls: `Page 1 of X`, previous/next page, Zoom Out, percentage, Zoom In, and Fit Page
- no responsive text reflow when the centre panel changes width

The same viewer will be used in:

- Settings → Templates
- Test Mapping
- Create Document Pack
- View generated document

### 4. Template and test previews

- On upload or replacement, generate an unfilled PDF preview from the original DOCX.
- Test Mapping will create a temporary populated DOCX and PDF using the selected resident, then show that PDF in the same viewer.
- Test files will not create an Agreement No., agreement record, or permanent resident document.
- Placeholder highlights and mapping status remain in the right panel rather than being painted over the document itself, preserving an honest representation of the final file.

### 5. Document generation and downloads

- Generate Document Pack will snapshot the chosen values and active template version as it does now.
- It will additionally create and store the real populated DOCX and Microsoft-rendered PDF for every available active template.
- Each generated-document row will offer **View PDF**, **Download PDF**, and **Download Word**.
- Existing generated records without stored files will show that they predate exact-file generation; they will not be silently regenerated from a newer template.

## Technical details

- Replace `mammoth`/generic HTML as the legal rendering path. It currently discards page geometry and reconstructs content as HTML, which causes the layout shown in the screenshots.
- Use a DOCX templating library that edits OOXML text runs while retaining the rest of the package.
- Use the Microsoft Word connector server-side for DOCX upload and PDF conversion; credentials never enter the browser.
- Add private storage paths and generation state/error fields to template versions and generated agreement documents.
- Add secure server functions for template preview generation, test generation, final generation, and authenticated file download.
- Make database changes idempotent, apply them to `test-bratchia`, and record the SQL for Lovable Cloud in `docs/PENDING-ON-LOVABLE.md`.
- Record the Word-as-source/PDF-as-preview architecture in `AGENTS.md`.

## Validation

- Compare every page of both uploaded samples against Microsoft Word/PDF output, including the logo, margins, typography, tables, signatures, headers/footers, and page numbering.
- Confirm long and short mapped values do not alter formatting beyond Word's normal text-flow behaviour.
- Confirm Test Mapping, document-pack review, generated-document viewing, Word download, and PDF download all use the same template version and values.
- Check desktop and mobile viewer controls without resizing document content.
- Confirm private files cannot be opened without an active admin session.
- Verify the app build and the latest error logs before completion.

## Prerequisite

A workspace owner must link a Microsoft Word connection when the connection card is presented during implementation. Without it, the app can preserve and download the populated Word file, but it cannot produce a Microsoft-rendered exact PDF.
