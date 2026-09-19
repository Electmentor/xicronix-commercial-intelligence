-- Applied to production as crm_meetings_and_calendar_links_v1
-- Stores CRM meeting records and Google Calendar linkage metadata.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'America/Lima',
  mode text not null default 'ONLINE',
  location text,
  status text not null default 'SCHEDULED',
  attendee_status text not null default 'NOT_SENT',
  owner_user_id uuid references public.profiles(id) on delete set null,
  google_calendar_id text,
  google_event_id text,
  google_event_url text,
  meet_url text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Production migration also applies checks, RLS, indexes and
-- private.crm_meeting_conflict_count().
