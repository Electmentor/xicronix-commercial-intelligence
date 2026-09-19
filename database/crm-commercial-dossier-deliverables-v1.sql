-- Applied to production as crm_commercial_dossier_deliverables_v1.
-- Adds deliverables required by the commercial dossier.

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  direction text not null,
  status text not null default 'PENDING',
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Production migration also applies checks, indexes and organization-scoped RLS.
