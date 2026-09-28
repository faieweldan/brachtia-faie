create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Agreement',
  doc_key text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
grant all on public.document_templates to service_role;
alter table public.document_templates enable row level security;

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  content_html text not null default '',
  file_path text not null default '',
  file_name text not null default '',
  placeholders text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (template_id, version)
);
grant all on public.template_versions to service_role;
alter table public.template_versions enable row level security;
create unique index if not exists template_versions_one_active on public.template_versions(template_id) where status = 'active';

alter table public.agreement_documents add column if not exists template_version_id uuid references public.template_versions(id);
alter table public.access_card_forms add column if not exists template_version_id uuid references public.template_versions(id);

create or replace function public.activate_template_version(_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select template_id into t from public.template_versions where id = _version_id;
  if t is null then raise exception 'version not found'; end if;
  update public.template_versions set status = 'archived', updated_at = now() where template_id = t and status = 'active';
  update public.template_versions set status = 'active', activated_at = now(), updated_at = now() where id = _version_id;
end $$;
revoke all on function public.activate_template_version(uuid) from public, anon, authenticated;
grant execute on function public.activate_template_version(uuid) to service_role;