# Settings → Templates tab

## What you'll get
1. **Templates tab** in Settings with a "Document Templates" table (Template, Category, Version, Last Updated, Status, Manage), grouped by Agreement / Access Card / Checkout. Seeded with the 6 templates in your spec. The Checkout Statement template is stored now but not used until checkout is built.
2. **+ Add Template**: you enter a name, pick a category, upload a Word (.docx) file and list any starting placeholders. This saves Version 1 as a Draft.
3. **Template workspace** (opens from Manage), in 3 columns:
   - **Left:** name, category, current version, status and version history (e.g. v4 Draft / v3 Active / v2 Archived). Click any version to preview it.
   - **Centre:** a preview of the uploaded document with `{{placeholders}}` highlighted, plus Upload/Replace file, Insert placeholder, Save as Draft, Test Mapping and Activate Version. Editing an Active version always makes a new Draft first; Archived versions are read-only.
   - **Right:** each placeholder found in the file, what it's linked to (Resident / Booking / Homes-Room / Tenancy), and a red flag on any it doesn't recognise. You can't activate a version while it has unrecognised placeholders.
4. **Test Mapping**: search for a resident by name or ID, then the page switches to Test Mode. A banner reads "Testing with: Name · ID" with Change Resident and Exit buttons. The preview fills in that resident's real details, and the right column shows each placeholder as Mapped, Missing Value or Unmapped. Test Mode is only a preview: it saves nothing, creates no Agreement No. and doesn't touch the resident's records.
5. **Versions**: each template has only one Active version. Activating a Draft archives the old Active version, and old versions are always kept.
6. **Link to document generation**: every document generated from the Tenancy tab records which template version it used. Documents already generated never change.

## Technical details
- Tables: `document_templates` (id, name, category, doc_key tying it to agreement / schedule_a / b / c / access_card / checkout) and `template_versions` (template_id, version, status draft/active/archived, file_path, detected placeholders, created/activated dates). A partial unique index allows only one active version per template. Add a nullable `template_version_id` to `agreement_documents` and `access_card_forms`. RLS is on with service_role grants and the migration can safely run twice. The two sample Checkout/Agreement rows use a separate seed insert.
- Files go in a private `document-templates` storage bucket. On the server, `mammoth` turns each .docx into HTML for the preview, and a `{{key}}` regex finds the placeholders.
- A central placeholder list in `src/lib/tenancy-docs.ts` gives each key its source and a way to look up its value. The spec's names are added alongside the current ones (`resident_full_name`, `passport_no`, `unit_no`, `room_no`, …).
- Server functions in `src/lib/templates.functions.ts`: list, create, upload version, save draft, activate (in one transaction), and testMapping (read-only: gathers the resident, booking, room and tenancy details and returns the filled-in preview plus each placeholder's result).
- New route `admin.settings.templates.$id.tsx` for the workspace; a Templates tab added in `admin.settings.tsx`.
- `generateDocumentPack` / `reviseSchedule` record the active version's id. The document-pack prep screen shows the active template's filled-in preview instead of the placeholder.
- Per the project rules: the migration runs on the test database first, then the SQL is logged in `docs/PENDING-ON-LOVABLE.md` for Lav.
