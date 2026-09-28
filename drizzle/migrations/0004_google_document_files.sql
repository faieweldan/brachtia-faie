ALTER TABLE public.template_versions
  ADD COLUMN IF NOT EXISTS google_document_id text,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'legacy_html',
  ADD COLUMN IF NOT EXISTS preview_pdf_path text,
  ADD COLUMN IF NOT EXISTS import_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS import_error text;

ALTER TABLE public.agreement_documents
  ADD COLUMN IF NOT EXISTS generated_pdf_path text,
  ADD COLUMN IF NOT EXISTS generated_docx_path text,
  ADD COLUMN IF NOT EXISTS generation_error text;

ALTER TABLE public.access_card_forms
  ADD COLUMN IF NOT EXISTS generated_pdf_path text,
  ADD COLUMN IF NOT EXISTS generated_docx_path text,
  ADD COLUMN IF NOT EXISTS generation_error text;