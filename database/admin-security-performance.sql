-- Applied in Supabase as migrations:
--   secure_admin_helper_private_v1
--   performance_policy_cleanup_v1
-- Date: 2026-09-09
--
-- The helper is intentionally kept outside the exposed public schema.
-- Review before reusing in another environment.

create schema if not exists private;

create or replace function private.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and organization_id = target_org
      and role = 'ADMIN'
  );
$function$;

revoke all on function private.is_org_admin(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_read
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.is_org_admin(organization_id)
  );

create policy profiles_admin_update
  on public.profiles
  for update
  to authenticated
  using (
    private.is_org_admin(organization_id)
    and id <> (select auth.uid())
  )
  with check (
    private.is_org_admin(organization_id)
    and id <> (select auth.uid())
  );

revoke all on function public.is_org_admin(uuid) from public, anon, authenticated;
drop function public.is_org_admin(uuid);

drop index if exists public.contacts_contact_institution_idx;

create index if not exists activities_contact_idx on public.activities (contact_id);
create index if not exists activities_created_by_idx on public.activities (created_by);
create index if not exists activities_institution_idx on public.activities (institution_id);
create index if not exists activities_lead_idx on public.activities (lead_id);
create index if not exists activities_opportunity_idx on public.activities (opportunity_id);
create index if not exists contacts_created_by_idx on public.contacts (created_by);
create index if not exists institutions_created_by_idx on public.institutions (created_by);
create index if not exists leads_created_by_idx on public.leads (created_by);
create index if not exists leads_owner_user_id_idx on public.leads (owner_user_id);
create index if not exists opportunities_created_by_idx on public.opportunities (created_by);
create index if not exists opportunities_owner_user_id_idx on public.opportunities (owner_user_id);
create index if not exists scores_lead_idx on public.scores (lead_id);
create index if not exists scores_opportunity_idx on public.scores (opportunity_id);
create index if not exists scores_organization_idx on public.scores (organization_id);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
