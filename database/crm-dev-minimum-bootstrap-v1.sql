-- Xicronix CRM DEV minimum mirror v0.1
-- Purpose: isolated backend for Prospect Intelligence integration tests.
-- DO NOT APPLY TO PRODUCTION.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  role text not null default 'VIEWER' check (role in ('ADMIN','MANAGER','SALES','VIEWER')),
  created_at timestamptz not null default now()
);

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'OTHER' check (type in ('UNIVERSITY','SCHOOL','INSTITUTE','CLINIC','HOSPITAL','COMPANY','GOVERNMENT','RESEARCH_CENTER','OTHER')),
  ruc text,
  website text,
  phone text,
  email text,
  address text,
  city text,
  country text not null default 'Peru',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institutions_org_ruc_uidx
  on public.institutions(organization_id,ruc)
  where ruc is not null and btrim(ruc)<>'';

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  first_name text not null,
  last_name text,
  job_title text,
  email text,
  phone text,
  decision_level text not null default 'UNKNOWN' check (decision_level in ('UNKNOWN','USER','INFLUENCER','RECOMMENDER','DECISION_MAKER','FINAL_APPROVER')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  source text,
  status text not null default 'NEW' check (status in ('NEW','RESEARCHING','CONTACT_PENDING','CONTACTED','QUALIFIED','DISQUALIFIED','CONVERTED')),
  score integer not null default 0 check (score between 0 and 100),
  estimated_value numeric not null default 0,
  next_action text,
  next_action_date timestamptz,
  owner_user_id uuid,
  created_by uuid,
  commercial_milestone text check (commercial_milestone is null or commercial_milestone in ('M1','M2','M3','M4','M5','M6')),
  maturity_percent integer not null default 0 check (maturity_percent in (0,15,30,50,70,85,100)),
  routing_area text,
  routing_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null,
  stage text not null default 'DETECTED' check (stage in ('DETECTED','CONTACT_PENDING','CONTACTED','QUALIFIED','OPPORTUNITY','PROPOSAL','NEGOTIATION','WON','LOST')),
  value numeric not null default 0,
  probability integer not null default 0 check (probability between 0 and 100),
  score integer not null default 0 check (score between 0 and 100),
  expected_close_date date,
  next_action text,
  next_action_date timestamptz,
  owner_user_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  type text not null default 'NOTE' check (type in ('WEB_FORM','CALL','WHATSAPP','EMAIL','MEETING','VISIT','DEMO','PROPOSAL_SENT','FOLLOW_UP','NOTE','OTHER')),
  subject text,
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  outcome text,
  next_action text,
  next_action_date timestamptz,
  action_code text,
  evidence_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  title text not null,
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED','OVERDUE')),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  due_at timestamptz,
  assigned_to uuid,
  created_by uuid,
  automation_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,automation_key)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  potential_score integer not null default 0 check (potential_score between 0 and 100),
  urgency_score integer not null default 0 check (urgency_score between 0 and 100),
  engagement_score integer not null default 0 check (engagement_score between 0 and 100),
  total_score integer not null default 0 check (total_score between 0 and 100),
  score_version text not null default 'rules-v1',
  explanation jsonb not null default '{}'::jsonb,
  recommendation text,
  recommendation_source text not null default 'RULES_V1',
  calculated_at timestamptz not null default now(),
  check (lead_id is not null or opportunity_id is not null)
);

create or replace function private.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=target_org)
$$;

create or replace function private.can_write_org(target_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=target_org and p.role in ('ADMIN','MANAGER','SALES'))
$$;

create or replace function private.is_org_admin(target_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=target_org and p.role='ADMIN')
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.scores enable row level security;

drop policy if exists org_read_member on public.organizations;
create policy org_read_member on public.organizations for select to authenticated
using (private.is_org_member(id));

drop policy if exists profiles_read_org on public.profiles;
create policy profiles_read_org on public.profiles for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

do $$
declare t text;
begin
  foreach t in array array['institutions','contacts','leads','opportunities','activities','tasks','scores']
  loop
    execute format('drop policy if exists %I_read_org on public.%I',t,t);
    execute format('create policy %I_read_org on public.%I for select to authenticated using (private.is_org_member(organization_id))',t,t);
    execute format('drop policy if exists %I_write_org on public.%I',t,t);
    execute format('create policy %I_write_org on public.%I for insert to authenticated with check (private.can_write_org(organization_id))',t,t);
    execute format('drop policy if exists %I_update_org on public.%I',t,t);
    execute format('create policy %I_update_org on public.%I for update to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id))',t,t);
    execute format('drop policy if exists %I_delete_admin on public.%I',t,t);
    execute format('create policy %I_delete_admin on public.%I for delete to authenticated using (private.is_org_admin(organization_id))',t,t);
  end loop;
end $$;


grant usage on schema public to authenticated;
grant select on public.organizations,public.profiles,public.institutions,public.contacts,public.leads,public.opportunities,public.activities,public.tasks,public.scores to authenticated;
grant insert,update,delete on public.profiles,public.institutions,public.contacts,public.leads,public.opportunities,public.activities,public.tasks,public.scores to authenticated;
