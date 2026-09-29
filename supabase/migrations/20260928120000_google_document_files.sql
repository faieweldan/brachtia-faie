-- Google Docs is the source of truth for legal document formatting.
-- Preview and generated output paths point at private Storage objects.
-- Safe to run again.

alter table public.template_versions
  add column if not exists google_document_id text,
  add column if not exists source_kind text not null default 'legacy_html',
  add column if not exists preview_pdf_path text,
  add column if not exists import_status text not null default 'ready',
  add column if not exists import_error text;

alter table public.agreement_documents
  add column if not exists generated_pdf_path text,
  add column if not exists generated_docx_path text,
  add column if not exists generation_error text;

alter table public.access_card_forms
  add column if not exists generated_pdf_path text,
  add column if not exists generated_docx_path text,
  add column if not exists generation_error text;
