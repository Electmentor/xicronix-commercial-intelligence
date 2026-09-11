-- Applied in Supabase as migration lead_interaction_scoring_v1 on 2026-09-09.
-- This migration records structured lead interactions and recalculates an explainable
-- potential score and contextual recommendation per lead.
--
-- Formula:
--   50% potential + 30% engagement + 20% urgency.
-- The recommendation source is RULES_V1. No external AI provider receives lead data.

begin;

alter table public.activities
  add column if not exists outcome text,
  add column if not exists need_summary text,
  add column if not exists decision_timeline text,
  add column if not exists budget_signal text,
  add column if not exists next_action text,
  add column if not exists next_action_date timestamptz;

alter table public.scores
  add column if not exists recommendation text,
  add column if not exists recommendation_source text not null default 'RULES_V1';

create unique index if not exists scores_lead_unique_idx
  on public.scores (lead_id)
  where lead_id is not null;

create or replace function private.can_write_org(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and organization_id = target_org
      and role in ('ADMIN', 'MANAGER', 'SALES')
  );
$function$;

revoke all on function private.can_write_org(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.can_write_org(uuid) to authenticated;

create or replace function private.recalculate_lead_score(target_lead uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  lead_row record;
  activity_total integer := 0;
  activity_recent integer := 0;
  meaningful_activity integer := 0;
  completeness integer := 0;
  stage_signal integer := 0;
  potential integer := 0;
  engagement integer := 0;
  urgency integer := 0;
  total integer := 0;
  recommendation text;
begin
  select l.id, l.organization_id, l.status, l.score, l.estimated_value,
         l.institution_id, l.contact_id, l.source, l.next_action_date,
         c.decision_level
  into lead_row
  from public.leads l
  left join public.contacts c
    on c.id = l.contact_id and c.organization_id = l.organization_id
  where l.id = target_lead;

  if not found then
    delete from public.scores where lead_id = target_lead;
    return;
  end if;

  select count(*)::integer,
         count(*) filter (where occurred_at >= now() - interval '30 days')::integer,
         count(*) filter (where type in ('MEETING','VISIT','DEMO','PROPOSAL_SENT'))::integer
  into activity_total, activity_recent, meaningful_activity
  from public.activities
  where lead_id = lead_row.id and organization_id = lead_row.organization_id;

  completeness :=
      (case when lead_row.institution_id is not null then 20 else 0 end)
    + (case when lead_row.contact_id is not null then 20 else 0 end)
    + (case when nullif(trim(lead_row.source), '') is not null then 15 else 0 end)
    + (case when coalesce(lead_row.estimated_value, 0) > 0 then 25 else 0 end)
    + (case when lead_row.next_action_date is not null then 20 else 0 end);

  stage_signal := case lead_row.status
    when 'NEW' then 10
    when 'RESEARCHING' then 20
    when 'CONTACT_PENDING' then 30
    when 'CONTACTED' then 45
    when 'QUALIFIED' then 70
    when 'CONVERTED' then 100
    when 'DISQUALIFIED' then 0
    else 10
  end;

  potential := greatest(0, least(100, round(
      coalesce(lead_row.score, 0) * 0.45
    + stage_signal * 0.35
    + completeness * 0.20
  )::integer));

  engagement := greatest(0, least(100,
      least(40, activity_total * 10)
    + least(35, activity_recent * 15)
    + least(25, meaningful_activity * 25)
  ));

  urgency := case
    when lead_row.next_action_date is null then 25
    when lead_row.next_action_date < now() then 100
    when lead_row.next_action_date <= now() + interval '1 day' then 90
    when lead_row.next_action_date <= now() + interval '3 days' then 75
    when lead_row.next_action_date <= now() + interval '7 days' then 50
    else 20
  end;

  total := greatest(0, least(100, round(
      potential * 0.50 + engagement * 0.30 + urgency * 0.20
  )::integer));

  recommendation := case
    when lead_row.status = 'DISQUALIFIED'
      then 'No priorizar; registrar el motivo y cerrar el seguimiento.'
    when lead_row.status = 'CONVERTED'
      then 'Convertir en oportunidad y definir el siguiente paso comercial.'
    when total >= 80
      then 'Prioridad alta: contactar hoy con una propuesta concreta y validar al decisor.'
    when total >= 60
      then 'Prioridad media: validar necesidad, decisor y fecha de decisión.'
    else
      'Prioridad de exploración: completar datos antes de invertir más tiempo.'
  end;

  insert into public.scores (
    organization_id, lead_id, potential_score, urgency_score,
    engagement_score, total_score, score_version, explanation,
    recommendation, recommendation_source, calculated_at
  )
  values (
    lead_row.organization_id, lead_row.id, potential, urgency,
    engagement, total, 'rules-v1',
    jsonb_build_object(
      'formula', '50% potencial + 30% interacción + 20% urgencia',
      'signals', jsonb_build_object(
        'manual_score', coalesce(lead_row.score, 0),
        'stage_signal', stage_signal,
        'data_completeness', completeness,
        'activity_total', activity_total,
        'activity_recent_30d', activity_recent,
        'meaningful_activity', meaningful_activity,
        'decision_level', lead_row.decision_level
      )
    ),
    recommendation, 'RULES_V1', now()
  )
  on conflict (lead_id) where lead_id is not null
  do update set
    organization_id = excluded.organization_id,
    potential_score = excluded.potential_score,
    urgency_score = excluded.urgency_score,
    engagement_score = excluded.engagement_score,
    total_score = excluded.total_score,
    score_version = excluded.score_version,
    explanation = excluded.explanation,
    recommendation = excluded.recommendation,
    recommendation_source = excluded.recommendation_source,
    calculated_at = excluded.calculated_at;
end;
$function$;

revoke all on function private.recalculate_lead_score(uuid) from public, anon, authenticated;

create or replace function private.sync_lead_score_from_lead()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then perform private.recalculate_lead_score(old.id); end if;
  if tg_op <> 'DELETE' then perform private.recalculate_lead_score(new.id); end if;
  return coalesce(new, old);
end;
$function$;

create or replace function private.sync_lead_score_from_activity()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' and old.lead_id is not null then
    perform private.recalculate_lead_score(old.lead_id);
  end if;
  if tg_op <> 'DELETE' and new.lead_id is not null then
    perform private.recalculate_lead_score(new.lead_id);
  end if;
  return coalesce(new, old);
end;
$function$;

revoke all on function private.sync_lead_score_from_lead() from public, anon, authenticated;
revoke all on function private.sync_lead_score_from_activity() from public, anon, authenticated;

create or replace function private.validate_activity_links()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare related_org uuid;
begin
  if new.institution_id is not null then
    select organization_id into related_org from public.institutions where id = new.institution_id;
    if related_org is null or related_org <> new.organization_id then
      raise exception 'La institución no pertenece a la organización de la interacción';
    end if;
  end if;
  if new.contact_id is not null then
    select organization_id into related_org from public.contacts where id = new.contact_id;
    if related_org is null or related_org <> new.organization_id then
      raise exception 'El contacto no pertenece a la organización de la interacción';
    end if;
  end if;
  if new.lead_id is not null then
    select organization_id into related_org from public.leads where id = new.lead_id;
    if related_org is null or related_org <> new.organization_id then
      raise exception 'El prospecto no pertenece a la organización de la interacción';
    end if;
  end if;
  if new.opportunity_id is not null then
    select organization_id into related_org from public.opportunities where id = new.opportunity_id;
    if related_org is null or related_org <> new.organization_id then
      raise exception 'La oportunidad no pertenece a la organización de la interacción';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.validate_activity_links() from public, anon, authenticated;

drop trigger if exists activities_validate_links on public.activities;
create trigger activities_validate_links
before insert or update on public.activities
for each row execute function private.validate_activity_links();

drop trigger if exists leads_score_refresh on public.leads;
create trigger leads_score_refresh
after insert or update of organization_id, institution_id, contact_id, status,
score, estimated_value, source, next_action_date or delete on public.leads
for each row execute function private.sync_lead_score_from_lead();

drop trigger if exists activities_score_refresh on public.activities;
create trigger activities_score_refresh
after insert or update of lead_id, type, occurred_at, outcome,
decision_timeline, budget_signal or delete on public.activities
for each row execute function private.sync_lead_score_from_activity();

drop policy if exists activities_read_org on public.activities;
drop policy if exists activities_insert_org on public.activities;
drop policy if exists activities_update_org on public.activities;
drop policy if exists activities_delete_admin on public.activities;

create policy activities_read_org on public.activities for select to authenticated
using (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = activities.organization_id));

create policy activities_insert_org on public.activities for insert to authenticated
with check (private.can_write_org(organization_id));

create policy activities_update_org on public.activities for update to authenticated
using (private.can_write_org(organization_id))
with check (private.can_write_org(organization_id));

create policy activities_delete_admin on public.activities for delete to authenticated
using (private.is_org_admin(organization_id));

drop policy if exists scores_read_org on public.scores;
drop policy if exists scores_insert_org on public.scores;
drop policy if exists scores_update_org on public.scores;
drop policy if exists scores_delete_admin on public.scores;

create policy scores_read_org on public.scores for select to authenticated
using (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = scores.organization_id));

create policy scores_delete_admin on public.scores for delete to authenticated
using (private.is_org_admin(organization_id));

commit;
