-- ===========================================================================
-- Reference-number sequences need permission granted explicitly.
--
-- Row level security does not cover sequences, so a table whose reference is
-- generated - enquiries, invoices, receipts - fails on insert with
-- "permission denied for sequence" until this is granted. It works in a project
-- where the sequence happened to be created with the right owner, and fails in
-- any project set up from these migrations, which is the harder case to spot.
--
-- The default privileges line matters more than the grant: it covers every
-- sequence added from now on, so this does not have to be rediscovered.
-- ===========================================================================

grant usage, select on all sequences in schema public to service_role, authenticated;

alter default privileges in schema public
  grant usage, select on sequences to service_role, authenticated;
