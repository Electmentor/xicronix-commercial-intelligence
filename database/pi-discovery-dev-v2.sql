do $$ begin if not exists (select 1 from public.organizations where slug='xicronix-commercial-intelligence-dev') then raise exception 'DEV only'; end if; end $$;
CREATE OR REPLACE FUNCTION public.pi_prepare_transfer(target_case uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<prep>>
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

  if c.state not in ('PRIORITIZED','READY_FOR_CRM') then raise exception 'Prioriza el caso antes de preparar la transferencia'; end if;
  if c.next_action_date is null or nullif(btrim(c.transfer_reason),'') is null then raise exception 'Completa fecha de seguimiento y motivo de transferencia'; end if;
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
    'signals',(select coalesce(jsonb_agg(to_jsonb(s)-'organization_id'-'case_id'-'created_by' order by s.id),'[]'::jsonb) from public.pi_signals s where s.case_id=c.id),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(e)-'organization_id'-'case_id'-'created_by' order by e.id),'[]'::jsonb) from public.pi_evidence e where e.case_id=c.id),
    'duplicate_resolution',gate->'duplicate_resolution'
  );

  if existing.id is not null then
    if (existing.payload-'transferred_at') = (payload-'transferred_at') then
      return jsonb_build_object('transfer_id',existing.id,'payload',existing.payload,'gate',gate,'reused',true);
    end if;
    update public.pi_transfers set status='FAILED',error_text='Sustituida por una nueva revisión del caso' where id=existing.id;
  end if;

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
$function$
;
CREATE OR REPLACE FUNCTION public.pi_execute_transfer(target_transfer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  t public.pi_transfers%rowtype;
  c public.pi_cases%rowtype;
  action text;
  inst_id uuid;
  lead_id uuid;
  opp_id uuid;
  note_text text;
  refreshed jsonb;
begin
  select * into t from public.pi_transfers where id=target_transfer for update;
  if not found then raise exception 'PI transfer not found'; end if;
  if not private.can_write_org(t.organization_id) then raise exception 'Write access denied'; end if;

  if t.status='EXECUTED' then return jsonb_build_object('status','EXECUTED','institution_id',t.crm_institution_id,'lead_id',t.crm_lead_id,'opportunity_id',t.crm_opportunity_id,'reused',true); end if;
  if t.status<>'PREPARED' then raise exception 'Transfer is not PREPARED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(t.organization_id::text,7));
  select * into c from public.pi_cases where id=t.case_id for update;
  refreshed:=public.pi_prepare_transfer(c.id);
  if ((refreshed->'payload')-'transferred_at') is distinct from (t.payload-'transferred_at') then raise exception 'El caso o sus coincidencias cambiaron. Prepara y revisa otra vez la transferencia.'; end if;
  action:=t.resolution_action;
  inst_id:=(t.payload#>>'{duplicate_resolution,institution_id}')::uuid;
  lead_id:=(t.payload#>>'{duplicate_resolution,lead_id}')::uuid;
  opp_id:=(t.payload#>>'{duplicate_resolution,opportunity_id}')::uuid;

  if action='MANUAL_IDENTITY_REVIEW' then raise exception 'Manual identity review required'; end if;

  if action='CREATE_ORG_AND_LEAD' then
    insert into public.institutions(organization_id,name,type,ruc,website,city,country,notes,created_by)
    values(c.organization_id,c.organization_name,c.organization_type,c.organization_ruc,c.organization_website,c.organization_city,c.organization_country,'Creado desde Prospect Intelligence DEV',auth.uid())
    returning id into inst_id;
  end if;

  if action in ('CREATE_ORG_AND_LEAD','REUSE_ORG_CREATE_LEAD') then
    insert into public.leads(organization_id,institution_id,title,source,status,score,estimated_value,next_action,next_action_date,created_by,routing_area,routing_reason,owner_user_id)
    values(c.organization_id,inst_id,left(coalesce(c.hypothesis,c.organization_name),250),'OTHER','NEW',0,0,c.next_action,c.next_action_date,auth.uid(),'COMMERCIAL','Transferencia desde Prospect Intelligence DEV',auth.uid())
    returning id into lead_id;
  end if;

  note_text:='PI transfer '||t.id::text||' · contract pi-crm-v0.1 · potential='||(t.payload->>'potential_score')||' · confidence='||(t.payload->>'confidence_score');

  insert into public.activities(organization_id,institution_id,lead_id,opportunity_id,type,subject,notes,evidence_note,occurred_at,created_by,next_action,next_action_date)
  values(c.organization_id,inst_id,lead_id,opp_id,'NOTE','Prospect Intelligence transfer',note_text,(t.payload->'evidence')::text,now(),auth.uid(),null,null);

  if c.next_action_date is not null then
    insert into public.tasks(organization_id,institution_id,lead_id,opportunity_id,title,status,priority,due_at,assigned_to,created_by,automation_key,notes)
    values(c.organization_id,inst_id,lead_id,opp_id,c.next_action,'PENDING','HIGH',c.next_action_date,auth.uid(),auth.uid(),'pi:transfer:'||t.id::text,'Generada desde Prospect Intelligence DEV')
    on conflict(organization_id,automation_key) do nothing;
  end if;

  update public.pi_transfers set status='EXECUTED',crm_institution_id=inst_id,crm_lead_id=lead_id,crm_opportunity_id=opp_id,executed_at=now()
  where id=t.id;

  update public.pi_cases set state='TRANSFERRED',crm_institution_id=inst_id,crm_lead_id=lead_id,crm_opportunity_id=opp_id,transferred_at=now(),updated_at=now()
  where id=c.id;

  return jsonb_build_object('status','EXECUTED','institution_id',inst_id,'lead_id',lead_id,'opportunity_id',opp_id);
exception when others then
  update public.pi_transfers set status='FAILED',error_text=sqlerrm where id=target_transfer;
  raise;
end
$function$
;

create or replace function private.cx_activity_followup_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type='WEB_FORM' then return new; end if;
 if nullif(btrim(new.next_action),'') is null and new.next_action_date is null then return new; end if;
 if nullif(btrim(new.next_action),'') is null or new.next_action_date is null then raise exception 'Completa próxima acción y fecha'; end if;
 insert into public.tasks(organization_id,institution_id,contact_id,lead_id,opportunity_id,title,status,priority,due_at,assigned_to,created_by,automation_key)
 values(new.organization_id,new.institution_id,new.contact_id,new.lead_id,new.opportunity_id,new.next_action,'PENDING','MEDIUM',new.next_action_date,auth.uid(),auth.uid(),'cx:activity:'||new.id)
 on conflict(organization_id,automation_key) do update set title=excluded.title,due_at=excluded.due_at,updated_at=now()
 where tasks.status in ('PENDING','IN_PROGRESS');
 return new;
end $$;
revoke all on function private.cx_activity_followup_v1() from public;
create trigger cx_activity_followup_v1 after insert or update of next_action,next_action_date on public.activities for each row execute function private.cx_activity_followup_v1();
