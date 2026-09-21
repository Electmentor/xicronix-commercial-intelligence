-- DEV only. Reuses the existing milestone/action contract; no new tables or grants.
-- The DEV bootstrap had the lead fields but omitted the activity trigger.
alter table public.leads
  add column if not exists milestone_updated_at timestamptz,
  add column if not exists milestone_updated_by uuid references auth.users(id);
alter table public.activities
  add column if not exists milestone_after text,
  add column if not exists maturity_after integer;

create or replace function private.crm_apply_milestone_from_activity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare target text; target_pct integer;
begin
  target := case new.action_code
    when 'LEAD_QUALIFIED' then 'M1'
    when 'SCOPE_VALIDATED' then 'M2'
    when 'PROPOSAL_PRESENTED' then 'M3'
    when 'NEGOTIATION_STARTED' then 'M4'
    when 'FORMAL_COMMITMENT' then 'M5'
    when 'PURCHASE_ORDER_RECEIVED' then 'M5'
    when 'CONTRACT_SIGNED' then 'M5'
    when 'SALE_WON' then 'M6' else null end;
  target_pct := case target when 'M1' then 15 when 'M2' then 30
    when 'M3' then 50 when 'M4' then 70 when 'M5' then 85 when 'M6' then 100 else null end;
  new.milestone_after := target;
  new.maturity_after := target_pct;
  if target is not null and new.lead_id is not null then
    update public.leads
    set commercial_milestone=target, maturity_percent=target_pct,
        milestone_updated_at=coalesce(new.occurred_at,now()),
        milestone_updated_by=coalesce(auth.uid(),new.created_by), updated_at=now()
    where id=new.lead_id and organization_id=new.organization_id
      and coalesce(maturity_percent,0)<target_pct;
  end if;
  return new;
end $$;
-- Trigger-only, with the caller's existing RLS and privileges.
revoke all on function private.crm_apply_milestone_from_activity() from public,anon,authenticated;
drop trigger if exists crm_apply_milestone_from_activity on public.activities;
create trigger crm_apply_milestone_from_activity
before insert or update of action_code,lead_id on public.activities
for each row execute function private.crm_apply_milestone_from_activity();
-- No historical backfill: retain existing records unless explicitly reviewed.
