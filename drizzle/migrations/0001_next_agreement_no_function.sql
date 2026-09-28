create or replace function public.next_agreement_no()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.agreement_no_seq')
$$;

revoke all on function public.next_agreement_no() from public, anon, authenticated;
grant execute on function public.next_agreement_no() to service_role;