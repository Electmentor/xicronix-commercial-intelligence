-- Prospect Intelligence prepared-transfer idempotency v1
-- DEV ONLY.

create unique index if not exists pi_transfers_one_prepared_per_case_uidx
on public.pi_transfers(case_id)
where status='PREPARED';

create or replace function public.pi_prepare_transfer(target_case uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  c public.pi_cases%rowtype;
  gate jsonb;
  transfer_id uuid;
  payload jsonb;
  existing public.pi_transfers%rowtype;
begin
  select * into c from public.pi_cases where id=target_case for update;
  if not found then raise exception 'PI case not found'; end if;
  if not private.can_write_org(c.organization_id) then raise exception 'Write access denied'; end if;

  select * into existing
  from public.pi_transfers
  where case_id=c.id and status='PREPARED'
  order by created_at desc
  limit 1;

  if found then
    gate:=public.pi_readiness(c.id);
    return jsonb_build_object(
      'transfer_id',existing.id,
      'payload',existing.payload,
      'gate',gate,
      'reused',true
    );
  end if;

  gate:=public.pi_readiness(c.id);
  if coalesce((gate->>'ready')::boolean,false)=false then
    raise exception 'PI case is not READY_FOR_CRM';
  end if;

  payload:=jsonb_build_object(
    'contract_version','pi-crm-v0.1',
    'source_system','xicronix-prospect-intelligence-dev',
    'analysis_version',c.analysis_version,
    'transferred_at',now(),
    'organization_identity',jsonb_build_object(
      'name',c.organization_name,'type',c.organization_type,'ruc',c.organization_ruc,
      'website',c.organization_website,'city',c.organization_city,'country',c.organization_country
    ),
    'commercial_hypothesis',c.hypothesis,
    'dimensions',c.dimensions,
    'potential_score',gate->'potential_score',
    'confidence_score',gate->'confidence_score',
    'suggested_next_action',c.next_action,
    'suggested_next_action_date',c.next_action_date,
    'transfer_reason',c.transfer_reason,
    'signals',(select coalesce(jsonb_agg(to_jsonb(s)-'organization_id'-'case_id'-'created_by'),'[]'::jsonb) from public.pi_signals s where s.case_id=c.id),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(e)-'organization_id'-'case_id'-'created_by'),'[]'::jsonb) from public.pi_evidence e where e.case_id=c.id),
    'duplicate_resolution',gate->'duplicate_resolution'
  );

  insert into public.pi_transfers(organization_id,case_id,resolution_action,payload,created_by)
  values(c.organization_id,c.id,gate#>>'{duplicate_resolution,action}',payload,auth.uid())
  returning id into transfer_id;

  if c.state='PRIORITIZED' then
    update public.pi_cases
    set state='READY_FOR_CRM',
        potential_score=(gate->>'potential_score')::integer,
        confidence_score=(gate->>'confidence_score')::integer,
        updated_at=now()
    where id=c.id;
  end if;

  return jsonb_build_object(
    'transfer_id',transfer_id,
    'payload',payload,
    'gate',gate,
    'reused',false
  );
end
$$;

revoke all on function public.pi_prepare_transfer(uuid) from public,anon;
grant execute on function public.pi_prepare_transfer(uuid) to authenticated;
