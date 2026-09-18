-- Xicronix commercial management views v1
-- Applied in Supabase as commercial_management_views_v1 and commercial_management_views_v1_indexes on 2026-09-09.
-- Adds estimated margin inputs and admin-owned commercial goals.

begin;

alter table public.opportunities
  add column if not exists estimated_cost numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='opportunities_estimated_cost_nonnegative'
      and conrelid='public.opportunities'::regclass
  ) then
    alter table public.opportunities
      add constraint opportunities_estimated_cost_nonnegative
      check (estimated_cost is null or estimated_cost >= 0);
  end if;
end
$$;

create index if not exists opportunities_org_owner_stage_idx
  on public.opportunities (organization_id, owner_user_id, stage);

create table if not exists public.commercial_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  target_margin numeric(14,2) not null default 0 check (target_margin >= 0),
  target_won_value numeric(14,2) not null default 0 check (target_won_value >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_goals_period_valid check (period_end >= period_start)
);

create index if not exists commercial_goals_org_period_idx
  on public.commercial_goals (organization_id, period_start, period_end);
create index if not exists commercial_goals_org_owner_idx
  on public.commercial_goals (organization_id, owner_user_id);
create index if not exists commercial_goals_created_by_idx
  on public.commercial_goals (created_by);
create index if not exists commercial_goals_owner_user_idx
  on public.commercial_goals (owner_user_id);

alter table public.commercial_goals enable row level security;
revoke all on public.commercial_goals from anon;
grant select, insert, update, delete on public.commercial_goals to authenticated;

drop policy if exists commercial_goals_read_admin on public.commercial_goals;
drop policy if exists commercial_goals_insert_admin on public.commercial_goals;
drop policy if exists commercial_goals_update_admin on public.commercial_goals;
drop policy if exists commercial_goals_delete_admin on public.commercial_goals;

create policy commercial_goals_read_admin
  on public.commercial_goals for select to authenticated
  using (private.is_org_admin(organization_id));

create policy commercial_goals_insert_admin
  on public.commercial_goals for insert to authenticated
  with check (
    private.is_org_admin(organization_id)
    and created_by = (select auth.uid())
  );

create policy commercial_goals_update_admin
  on public.commercial_goals for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy commercial_goals_delete_admin
  on public.commercial_goals for delete to authenticated
  using (private.is_org_admin(organization_id));

create or replace function private.validate_commercial_goal_owner()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.owner_user_id is not null
     and not exists (
       select 1 from public.profiles p
       where p.id = new.owner_user_id
         and p.organization_id = new.organization_id
     ) then
    raise exception 'La meta debe pertenecer a la misma organización';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_commercial_goal_owner on public.commercial_goals;
create trigger trg_validate_commercial_goal_owner
before insert or update on public.commercial_goals
for each row execute function private.validate_commercial_goal_owner();

create or replace function private.touch_commercial_goal_updated_at()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_commercial_goal_updated_at on public.commercial_goals;
create trigger trg_touch_commercial_goal_updated_at
before update on public.commercial_goals
for each row execute function private.touch_commercial_goal_updated_at();

commit;