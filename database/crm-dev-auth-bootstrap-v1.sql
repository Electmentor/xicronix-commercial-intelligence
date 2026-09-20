-- Xicronix CRM DEV auth bootstrap v1
-- DEV ONLY. Auto-links new Supabase Auth users to the DEV organization.
-- The designated owner email is stored only as a SHA-256 digest.

insert into public.organizations(name,slug)
values('Xicronix Commercial Intelligence DEV','xicronix-commercial-intelligence-dev')
on conflict (slug) do nothing;

create or replace function private.crm_dev_profile_bootstrap()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  dev_org uuid;
  normalized_email_hash text;
  assigned_role text;
begin
  select id into dev_org
  from public.organizations
  where slug='xicronix-commercial-intelligence-dev'
  limit 1;

  if dev_org is null then
    raise exception 'CRM DEV organization missing';
  end if;

  normalized_email_hash:=encode(digest(lower(trim(coalesce(new.email,''))),'sha256'),'hex');
  assigned_role:=case
    when normalized_email_hash='7eda60bed52d00b54243246aa3351dceaa2a65c7ced0d77ef224ff947ffc80cb' then 'ADMIN'
    else 'VIEWER'
  end;

  insert into public.profiles(id,organization_id,full_name,role)
  values(
    new.id,
    dev_org,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')),''),
    assigned_role
  )
  on conflict(id) do update set
    organization_id=excluded.organization_id,
    full_name=coalesce(excluded.full_name,public.profiles.full_name),
    role=case
      when public.profiles.role='ADMIN' then 'ADMIN'
      else excluded.role
    end;

  return new;
end
$$;

drop trigger if exists crm_dev_auth_profile_bootstrap on auth.users;
create trigger crm_dev_auth_profile_bootstrap
after insert on auth.users
for each row execute function private.crm_dev_profile_bootstrap();

revoke all on function private.crm_dev_profile_bootstrap() from public,anon,authenticated;
