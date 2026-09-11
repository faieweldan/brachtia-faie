-- ===========================================================================
-- Addresses for the resident and for whoever pays.
--
-- The emergency contact already had these; personal and payor did not. None of
-- them come from the master list, so they arrive through the profile form or an
-- admin filling them in.
-- ===========================================================================

alter table public.residents
  add column if not exists address         text not null default '',
  add column if not exists postcode        text not null default '',
  add column if not exists state           text not null default '',
  add column if not exists country         text not null default '',

  add column if not exists payer_address   text not null default '',
  add column if not exists payer_postcode  text not null default '',
  add column if not exists payer_state     text not null default '',
  add column if not exists payer_country   text not null default '';
