-- The legacy Google Form records how each resident heard about Brachtia.
-- Keep it on the resident so the Batch 1 migration does not discard that answer.
alter table public.residents
  add column if not exists referral_source text not null default '';
